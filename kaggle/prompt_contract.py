"""ClothMatics appearance contract v2. Pure Python, independently testable."""
import re

CONTRACT_VERSION = 2
CATEGORIES = {"shirt", "tshirt", "trackpants", "trousers", "cargo", "hoodie", "jacket", "dress", "shorts"}
ALIASES = {"t-shirt":"tshirt", "t_shirt":"tshirt", "tee":"tshirt", "jeans":"trousers", "denim":"trousers", "pants":"trousers", "chinos":"trousers", "joggers":"trackpants", "sweatpants":"trackpants", "blazer":"jacket", "coat":"jacket", "polo":"shirt", "sweatshirt":"tshirt"}
FIELDS = [
    ("colorAndFinish", "Photographed colors", 400, 70),
    ("surfaceTextureAndWeave", "Fabric texture", 300, 48),
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
    if category in {"trousers", "trackpants", "cargo", "shorts"}:
        result["sleeveType"] = ""
    return result

def invariant_prompt(category):
    category = normalize_category(category)
    lower = category in {"trousers", "trackpants", "cargo", "shorts"}
    shape = ("Lower garment only, waistband to leg hems. No upper garment or jumpsuit. " if lower else "Keep the reference garment's observed sleeves, neckline and hem. ")
    return (
        f"Create a clean studio ghost-mannequin product render of the SAME single {category}; no visible mannequin or human body. Use a completely invisible, anatomically neutral garment support. "
        "Keep the support hidden while giving the clothing believable three-dimensional volume: inner edge depth at the collar or waistband, natural shoulder or seat shape, sidewall thickness, fold gradients, contact shadows and subtle product-camera perspective. "
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
    encode = lambda text: tokenizer.encode(text, add_special_tokens=False)
    if len(encode(head)) > max_tokens - 80:
        raise ValueError("Insufficient token budget for mandatory appearance rules")
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
