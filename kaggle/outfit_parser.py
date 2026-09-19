"""Pixel-level worn-outfit extraction for the optional /outfit route.

This module is deliberately isolated from ghost_server.py.  The established
/generate renderer never imports or loads the parser unless /outfit is used.
"""
from __future__ import annotations

import io
import os
import threading
from dataclasses import dataclass
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageOps, ImageCms, UnidentifiedImageError

MODEL_ID = "mattmdjaga/segformer_b2_clothes"
MODEL_REVISION = "584abc1e1d260e23c0fc627c5217a09b2b461046"
PARSER_VERSION = "3"
MAX_PIXELS = 24_000_000
SRGB_PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
SRGB_ICC = SRGB_PROFILE.tobytes()

# Model labels: 0 background, 1 hat, 2 hair, 3 sunglasses, 4 upper-clothes,
# 5 skirt, 6 pants, 7 dress, 8 belt, 9/10 shoes, 11 face, 12/13 legs,
# 14/15 arms, 16 bag, 17 scarf.
BODY_LABELS = frozenset((2, 11, 12, 13, 14, 15))
GARMENT_LABELS = frozenset((4, 5, 6, 7))
FOOTWEAR_LABELS = frozenset((9, 10))

_MODEL = None
_PROCESSOR = None
_LOAD_LOCK = threading.Lock()


class OutfitParserError(ValueError):
    pass


@dataclass
class ParsedCutout:
    index: int
    png: bytes
    width: int
    height: int
    pixel_count: int
    labels: tuple[int, ...]
    preserved_occlusion_pixels: int = 0
    repaired_occlusion_pixels: int = 0
    trimmed_footwear_pixels: int = 0


def _load_parser():
    global _MODEL, _PROCESSOR
    if _MODEL is not None:
        return _PROCESSOR, _MODEL
    with _LOAD_LOCK:
        if _MODEL is None:
            import torch
            from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

            device = os.environ.get("CLOTHMATICS_PARSER_DEVICE", "cpu").strip().lower()
            if device != "cpu":
                raise RuntimeError("The outfit parser is pinned to CPU so FLUX GPU behavior remains unchanged")
            _PROCESSOR = SegformerImageProcessor.from_pretrained(
                MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False
            )
            _MODEL = SegformerForSemanticSegmentation.from_pretrained(
                MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False
            ).to("cpu").eval()
    return _PROCESSOR, _MODEL


def decode_photo(data: bytes) -> Image.Image:
    if not data:
        raise OutfitParserError("The outfit photo is empty")
    try:
        with Image.open(io.BytesIO(data)) as opened:
            if getattr(opened, "n_frames", 1) != 1:
                raise OutfitParserError("Upload one still outfit photo")
            if opened.width * opened.height > MAX_PIXELS:
                raise OutfitParserError("The outfit photo exceeds 24M pixels")
            opened.load()
            icc = opened.info.get("icc_profile")
            oriented = ImageOps.exif_transpose(opened)
            if icc:
                try:
                    source_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                    base = oriented if oriented.mode in ("RGB", "CMYK", "L", "LAB") else oriented.convert("RGB")
                    return ImageCms.profileToProfile(base, source_profile, SRGB_PROFILE, outputMode="RGB")
                except (ImageCms.PyCMSError, OSError, ValueError) as exc:
                    raise OutfitParserError("Embedded color profile cannot be converted") from exc
            return oriented.convert("RGB")
    except OutfitParserError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise OutfitParserError("Unsupported outfit photo") from exc


def predict_labels(photo: Image.Image) -> np.ndarray:
    import torch

    processor, model = _load_parser()
    inputs = processor(images=photo, return_tensors="pt")
    with torch.inference_mode():
        outputs = model(**inputs)
    target = [(photo.height, photo.width)]
    # Transformers 5.x expects SemanticSegmenterOutput here and reads
    # outputs.logits internally. Passing the tensor itself raises AttributeError.
    labels = processor.post_process_semantic_segmentation(outputs, target_sizes=target)[0]
    return labels.detach().cpu().numpy().astype(np.uint8)


def worn_photo_evidence(labels: np.ndarray) -> dict:
    total = max(1, labels.size)
    body_pixels = int(np.isin(labels, tuple(BODY_LABELS)).sum())
    garment_pixels = int(np.isin(labels, tuple(GARMENT_LABELS)).sum())
    face = int((labels == 11).sum())
    limbs = int(np.isin(labels, (12, 13, 14, 15)).sum())
    # Require both clothing and visible human evidence. This keeps flat-lay and
    # hanging garment photos on the established /generate path.
    worn = garment_pixels / total >= 0.004 and body_pixels >= 64 and (
        face > 0 or limbs > 0
    )
    return {
        "worn": bool(worn),
        "body_fraction": round(body_pixels / total, 5),
        "garment_fraction": round(garment_pixels / total, 5),
    }


def _box(value, width: int, height: int) -> tuple[int, int, int, int]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise OutfitParserError("Each outfit item needs a four-value bounding box")
    try:
        y1, x1, y2, x2 = [float(part) for part in value]
    except (TypeError, ValueError) as exc:
        raise OutfitParserError("Invalid outfit item bounding box") from exc
    # The website contract always uses normalized 0..1000 coordinates.
    if min(y1, x1, y2, x2) < 0 or max(y1, x1, y2, x2) > 1000:
        raise OutfitParserError("Outfit item bounding box must use 0..1000 coordinates")
    y1, y2 = y1 * height / 1000, y2 * height / 1000
    x1, x2 = x1 * width / 1000, x2 * width / 1000
    if y2 <= y1 or x2 <= x1:
        raise OutfitParserError("Invalid outfit item bounding box")
    pad_x = max(3, int((x2 - x1) * 0.08))
    pad_y = max(3, int((y2 - y1) * 0.08))
    return (
        max(0, int(x1) - pad_x), max(0, int(y1) - pad_y),
        min(width, int(np.ceil(x2)) + pad_x), min(height, int(np.ceil(y2)) + pad_y),
    )


def labels_for(kind: str) -> tuple[int, ...]:
    key = str(kind or "").lower()
    if key in ("shirt", "tshirt", "hoodie", "jacket", "blouse", "cardigan", "knitwear", "top", "sherwani", "kurta"):
        return (4,)
    if key == "skirt":
        return (5,)
    if key in ("trousers", "trackpants", "cargo", "shorts", "leggings"):
        return (6,)
    if key in ("dress", "jumpsuit", "romper", "saree", "lehenga", "traditional_set", "robe", "draped", "sleepwear", "clothing_set", "swimwear", "innerwear"):
        return (7, 4, 5, 6)
    if key == "scarf":
        return (17,)
    if key == "footwear":
        return (9, 10)
    raise OutfitParserError("Unsupported outfit item type")


def _clean_mask(mask: np.ndarray) -> np.ndarray:
    binary = mask.astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    count, component, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count <= 1:
        return binary.astype(bool)
    minimum = max(32, int(binary.size * 0.00012))
    keep = np.zeros_like(binary)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= minimum:
            keep[component == label] = 1
    return keep.astype(bool)


def _convex_envelope(mask: np.ndarray) -> np.ndarray:
    """Return a conservative silhouette envelope around observed garment pixels."""
    points = np.column_stack(np.where(mask)[::-1]).astype(np.int32)
    if len(points) < 3:
        return mask.copy()
    hull = cv2.convexHull(points.reshape(-1, 1, 2))
    envelope = np.zeros(mask.shape, dtype=np.uint8)
    cv2.fillConvexPoly(envelope, hull, 1)
    envelope = cv2.dilate(envelope, np.ones((3, 3), np.uint8), iterations=1)
    return envelope.astype(bool)


def _preserve_occlusions(mask: np.ndarray, labels: np.ndarray, region: np.ndarray,
                         parser_class: str) -> tuple[np.ndarray, np.ndarray]:
    """Keep photographed occluder pixels that sit inside the garment silhouette.

    This intentionally preserves source pixels (for example a hand resting over
    trousers) instead of cutting holes into the garment.  It never synthesizes
    hidden textile pixels; the downstream garment renderer removes the person.
    """
    if not mask.any():
        return mask, np.zeros(mask.shape, dtype=bool)
    kind = str(parser_class or "").lower()
    envelope = _convex_envelope(mask) & region
    if kind in ("trousers", "trackpants", "cargo", "shorts", "leggings", "skirt"):
        ys = np.where(mask)[0]
        top, bottom = int(ys.min()), int(ys.max()) + 1
        upper_limit = top + max(1, int((bottom - top) * 0.46))
        upper_band = np.zeros(mask.shape, dtype=bool)
        upper_band[top:upper_limit] = True
        # Hands/arms, an overlapping shirt hem and a belt commonly cover the
        # waistband/hip area.  Preserve those photographed pixels only within
        # the inferred lower-garment envelope and its upper section.
        candidates = np.isin(labels, (4, 8, 14, 15)) & upper_band
    elif kind in ("shirt", "tshirt", "hoodie", "jacket", "blouse", "cardigan",
                  "knitwear", "top", "sherwani", "kurta"):
        # Keep arms/hands where they cross the shirt body.  Face/neck pixels are
        # deliberately excluded so the collar opening remains transparent.
        candidates = np.isin(labels, (14, 15))
    elif kind in ("dress", "jumpsuit", "romper", "saree", "lehenga",
                  "traditional_set", "robe", "draped", "sleepwear",
                  "clothing_set", "swimwear", "innerwear"):
        candidates = np.isin(labels, (14, 15))
    else:
        return mask, np.zeros(mask.shape, dtype=bool)
    additions = candidates & envelope & region & ~mask
    return mask | additions, additions


def _repair_occlusion_pixels(source_rgb: np.ndarray, clean_garment: np.ndarray,
                             occlusions: np.ndarray) -> tuple[np.ndarray, int]:
    """Replace small verified occluders with nearest observed garment pixels.

    The fill is restricted to arm/hand or overlapping-clothing labels already
    accepted by ``_preserve_occlusions``.  It copies source garment pixels and
    does not sample skin or background.  Very large hidden regions are retained
    as photographed because their unseen texture cannot be recovered reliably.
    """
    count = int(occlusions.sum())
    clean_count = int(clean_garment.sum())
    if not count or clean_count < 64 or count > clean_count * 0.22:
        return source_rgb, 0
    ys, xs = np.where(clean_garment | occlusions)
    pad = 2
    top, bottom = max(0, int(ys.min()) - pad), min(source_rgb.shape[0], int(ys.max()) + pad + 1)
    left, right = max(0, int(xs.min()) - pad), min(source_rgb.shape[1], int(xs.max()) + pad + 1)
    clean = clean_garment[top:bottom, left:right]
    target = occlusions[top:bottom, left:right]
    # distanceTransformWithLabels assigns every non-clean pixel the label of
    # its nearest clean garment pixel.  The lookup table is built only from
    # observed garment pixels, so hands cannot leak back into the repair.
    _, nearest = cv2.distanceTransformWithLabels(
        (~clean).astype(np.uint8), cv2.DIST_L2, 5,
        labelType=cv2.DIST_LABEL_PIXEL
    )
    clean_y, clean_x = np.where(clean)
    if not len(clean_x):
        return source_rgb, 0
    repaired = source_rgb.copy()
    local = repaired[top:bottom, left:right]
    target_y, target_x = np.where(target)
    nearest_index = nearest[target_y, target_x] - 1
    valid = (nearest_index >= 0) & (nearest_index < len(clean_x))
    if not valid.any():
        return source_rgb, 0
    local[target_y[valid], target_x[valid]] = local[
        clean_y[nearest_index[valid]], clean_x[nearest_index[valid]]
    ]
    return repaired, int(valid.sum())


def _trim_footwear_stems(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """Remove narrow sock/ankle stems above each otherwise intact shoe mask."""
    binary = mask.astype(np.uint8)
    count, components, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    result = binary.copy()
    trimmed = 0
    for label in range(1, count):
        x = stats[label, cv2.CC_STAT_LEFT]
        y = stats[label, cv2.CC_STAT_TOP]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]
        if width < 8 or height < 12:
            continue
        component = components[y:y + height, x:x + width] == label
        row_widths = component.sum(axis=1)
        maximum = int(row_widths.max())
        threshold = max(4, int(maximum * 0.34))
        sustained = np.convolve((row_widths >= threshold).astype(np.uint8),
                                np.ones(3, dtype=np.uint8), mode="same")
        candidates = np.where(sustained >= 3)[0]
        if not len(candidates):
            continue
        body_start = max(0, int(candidates[0]) - 1)
        minimum_stem = max(3, int(height * 0.07))
        maximum_trim = int(height * 0.34)
        if body_start < minimum_stem or body_start > maximum_trim:
            continue
        stem_width = float(row_widths[:body_start].mean()) if body_start else maximum
        if stem_width > maximum * 0.48:
            continue
        stem = component[:body_start]
        removed = int(stem.sum())
        if removed:
            view = result[y:y + body_start, x:x + width]
            view[stem] = 0
            trimmed += removed
    return result.astype(bool), trimmed


def cutout_for(photo: Image.Image, labels: np.ndarray, item: dict) -> ParsedCutout:
    index = int(item.get("index", -1))
    selected = labels_for(item.get("parserClass") or item.get("category"))
    x1, y1, x2, y2 = _box(item.get("boundingBox"), photo.width, photo.height)
    region = np.zeros(labels.shape, dtype=bool)
    region[y1:y2, x1:x2] = True
    parser_class = str(item.get("parserClass") or item.get("category") or "").lower()
    mask = _clean_mask(np.isin(labels, selected) & region)
    ys, xs = np.where(mask)
    minimum = max(48, int((x2 - x1) * (y2 - y1) * 0.005))
    if len(xs) < minimum and item.get("parserClass") != "footwear":
        # A fashion parser can label an unusual top as dress or loose shorts as
        # skirt. Stay on semantic clothing pixels, choose the dominant class
        # inside this item's Gemini box, and never fall back to the rectangle.
        counts = [(int(((labels == label) & region).sum()), label) for label in GARMENT_LABELS]
        count, fallback = max(counts, default=(0, 0))
        if count >= minimum:
            selected = (fallback,)
            mask = _clean_mask((labels == fallback) & region)
            ys, xs = np.where(mask)
    if len(xs) < minimum:
        raise OutfitParserError("The semantic parser found too few garment pixels inside this item box")
    preserved_occlusion_pixels = 0
    repaired_occlusion_pixels = 0
    trimmed_footwear_pixels = 0
    source_rgb = np.asarray(photo).copy()
    if parser_class == "footwear":
        mask, trimmed_footwear_pixels = _trim_footwear_stems(mask)
    else:
        clean_garment = mask.copy()
        mask, occlusions = _preserve_occlusions(
            mask, labels, region, parser_class
        )
        source_rgb, repaired_occlusion_pixels = _repair_occlusion_pixels(
            source_rgb, clean_garment, occlusions
        )
        preserved_occlusion_pixels = int(occlusions.sum()) - repaired_occlusion_pixels
    ys, xs = np.where(mask)
    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    margin = max(2, int(max(right - left, bottom - top) * 0.015))
    left, top = max(0, left - margin), max(0, top - margin)
    right, bottom = min(photo.width, right + margin), min(photo.height, bottom + margin)
    alpha = (mask.astype(np.uint8) * 255)
    # A one-pixel edge softening avoids a jagged preview without adding any
    # pixels that were not present in the source photograph.
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.45)
    rgba = np.dstack((source_rgb, alpha))[top:bottom, left:right]
    output = Image.fromarray(rgba, "RGBA")
    if max(output.size) > 1200:
        output.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    output.save(buffer, format="PNG", optimize=True, icc_profile=SRGB_ICC)
    return ParsedCutout(
        index, buffer.getvalue(), output.width, output.height, int(mask.sum()), selected,
        preserved_occlusion_pixels, repaired_occlusion_pixels, trimmed_footwear_pixels
    )


def parse_outfit(data: bytes, items: Iterable[dict]) -> tuple[list[ParsedCutout], list[dict], dict]:
    photo = decode_photo(data)
    labels = predict_labels(photo)
    evidence = worn_photo_evidence(labels)
    if not evidence["worn"]:
        raise OutfitParserError("The parser did not find reliable worn-person evidence")
    parsed, skipped = [], []
    for item in items:
        try:
            parsed.append(cutout_for(photo, labels, item))
        except (OutfitParserError, TypeError, ValueError) as exc:
            skipped.append({"index": int(item.get("index", -1)), "message": str(exc)})
    return parsed, skipped, evidence
