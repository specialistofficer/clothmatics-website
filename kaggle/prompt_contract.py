"""ClothMatics appearance contract v2. Pure Python, independently testable."""
import re

CONTRACT_VERSION = 2
CATEGORIES = {"shirt", "tshirt", "trackpants", "trousers", "cargo", "hoodie", "jacket", "dress", "shorts"}
SHAPE_RULES = {}  # Populated from the shared website taxonomy by the notebook builder.
import json
from pathlib import Path
SHAPE_RULES = json.loads((Path(__file__).parent / 'garment_shapes.json').read_text())
CATEGORIES.update(SHAPE_RULES)
LOWER_CATEGORIES = {"trousers", "trackpants", "cargo", "shorts", "skirt", "leggings"}
ALIASES = {"t-shirt":"tshirt", "t_shirt":"tshirt", "tee":"tshirt", "jeans":"trousers", "denim":"trousers", "pants":"trousers", "chinos":"trousers", "joggers":"trackpants", "sweatpants":"trackpants", "blazer":"jacket", "coat":"jacket", "polo":"shirt", "sweatshirt":"tshirt"}
FIELDS = [
    ("colorAndFinish", "Photographed colors", 400, 70),
    ("surfaceTextureAndWeave", "Fabric texture", 300, 48),
    ("waistbandAndRise", "Waistband and rise", 200, 28),
    ("flyAndClosure", "Fly and closure", 200, 24),
    ("crotchAndInseam", "Crotch and inseam", 220, 30),
    ("legSilhouette", "Leg silhouette", 200, 28),
    ("hemAndCuffs", "Both hems or cuffs", 180, 24),
    ("pocketLayout", "Pocket layout", 220, 28),
    ("externalCompartments", "Pockets", 240, 36),
    ("hardwareAndClosures", "Fasteners", 220, 36),
    ("necklineOrWaistband", "Neckline or waistband", 200, 32),
    ("garmentLengthAndHem", "Length and hem", 200, 32),
    ("graphicsOrText", "Graphics and lettering", 300, 48),
    ("fit", "Observed fit", 80, 16),
    ("sleeveType", "Sleeves", 80, 16),
]

def normalize_category(value):
    raw = re.sub(r"\s+", "_", str(value or "").strip().lower())
    category = ALIASES.get(raw, raw)
    if category not in CATEGORIES:
        raise ValueError("Unsupported garment category; no generic shirt fallback")
    return category

def category_dimensions(category, size, quality):
    """Keep the proven portrait profile for tops; frame lower garments by source shape."""
    category = normalize_category(category)
    if quality not in ("high", "portrait", "standard") or category not in LOWER_CATEGORIES:
        return (768, 1024) if quality in ("high", "portrait", "standard") else ((1024, 768) if quality == "wide" else (576, 768))
    source_width, source_height = size
    ratio = source_width / max(1, source_height)
    if category == "shorts":
        ratio = min(1.15, max(.78, ratio))
        height = 896
    else:
        ratio = min(.82, max(.60, ratio))
        height = 1024
    width = max(16, round((height * ratio) / 16) * 16)
    return width, height

def normalize_manifest(category, manifest):
    category = normalize_category(category)
    if not isinstance(manifest, dict) or normalize_category(manifest.get("category")) != category:
        raise ValueError("Manifest category must match the requested garment")
    result = {"category": category}
    for key, _, limit, _ in FIELDS:
        value = manifest.get(key, "")
        if not isinstance(value, str):
            raise ValueError("Manifest fields must be text")
        result[key] = re.sub(r"[<>\x00-\x1f]", " ", value).strip()[:limit]
    if not result["colorAndFinish"] or not result["surfaceTextureAndWeave"]:
        raise ValueError("Observed color and fabric texture are required")
    if category in LOWER_CATEGORIES:
        result["sleeveType"] = ""
    else:
        for key in ("waistbandAndRise", "flyAndClosure", "crotchAndInseam", "legSilhouette", "hemAndCuffs", "pocketLayout"):
            result[key] = ""
    palette = manifest.get('palette', [])
    if not isinstance(palette, list) or len(palette) > 12:
        raise ValueError('Invalid garment palette')
    result['palette'] = []
    for color in palette:
        if not isinstance(color, dict) or color.get('role') not in ('base','secondary','print','trim','hardware','wash','embroidery','panel') or not re.fullmatch(r'#[a-fA-F0-9]{6}', str(color.get('hex', ''))):
            raise ValueError('Invalid color sample')
        region = re.sub(r'[^a-zA-Z0-9 ,/-]', ' ', str(color.get('region', ''))).strip()[:48]
        result['palette'].append({'role':color['role'], 'hex':color['hex'].upper(), 'region':region})
    return result

def invariant_prompt(category):
    category = normalize_category(category)
    lower = category in LOWER_CATEGORIES
    shape = SHAPE_RULES.get(category) or ("Lower garment only, waistband to leg hems. No upper garment or jumpsuit. " if lower else "Keep the reference garment's observed sleeves, neckline and hem. ")
    volume = ("visible inner waistband depth, natural seat and crotch volume, two separate leg tubes, sidewall thickness, fold gradients, contact shadows and subtle product-camera perspective" if lower else "inner edge depth at the collar or waistband, natural shoulder or seat shape, sidewall thickness, fold gradients, contact shadows and subtle product-camera perspective")
    return (
        f"Create a clean studio ghost-mannequin product render of the SAME single {category}; no visible mannequin or human body. Use a completely invisible, anatomically neutral garment support. "
        f"Keep the support hidden while giving the clothing believable three-dimensional volume: {volume}. "
        "Never make a flat front cutout, technical drawing or 2D icon. No visible mannequin, person, skin, head, neck cylinder, torso, limbs, stand or hanger; only garment and white background may be visible. "
        + shape +
        "Reference garment pixels override text color names. Preserve photographed hue, saturation, brightness, white balance, "
        "texture, cut, pockets, fasteners and lettering. No recoloring, redesign or invented hidden details. "
    )

def pack_prompt(category, manifest, tokenizer, max_tokens=460):
    """Reserve space for the chat template; never strip or truncate invariants.

    Distribute the remaining budget across individual evidence fields. Shrink
    field values (not a blind tail slice) so every observed property gets space.
    """
    manifest = normalize_manifest(category, manifest)
    head = invariant_prompt(category)
    palette = manifest['palette']
    if palette:
        head += ' Preserve each sampled region separately; never average colors or neutralize warm stripes: ' + '; '.join(f"{c['role']} {c['region']} {c['hex']}" for c in palette) + '. '
    encode = lambda text: tokenizer.encode(text, add_special_tokens=False)
    if len(encode(head)) > max_tokens - 80:
        raise ValueError("Color evidence exceeds model context; shorten region labels and retry analysis. No palette was silently truncated.")
    sections, truncated = [], []
    for key, label, _, quota in FIELDS:
        value = manifest[key]
        if not value:
            continue
        ids = encode(value)
        sections.append([key, label, ids, min(len(ids), quota)])
        if len(ids) > quota:
            truncated.append(key)
    def assemble():
        return head + " ".join(f"{label}: {tokenizer.decode(ids[:count], skip_special_tokens=True)}." for _, label, ids, count in sections)
    while len(encode(assemble())) > max_tokens:
        candidates = [s for s in sections if s[3] > 8]
        if not candidates:
            raise ValueError("Manifest cannot fit safely in the model context")
        section = max(candidates, key=lambda s:s[3])
        section[3] -= 1
        if section[0] not in truncated:
            truncated.append(section[0])
    prompt = assemble()
    return prompt, {"prompt_tokens":len(encode(prompt)), "truncated_fields":truncated, "contract_version":CONTRACT_VERSION}
