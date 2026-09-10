// Generated from src/ai/garmentPartition.ts; see source-manifest.json.
/**
 * garmentPartition — Phase 4 of the action plan, the architectural fix.
 *
 * Issues 1, 2 and 3 share one root cause: each garment was extracted
 * independently, with no knowledge of the others. This module removes that.
 *
 *   1. ONE person matte for the whole photo (the caller runs it once)
 *   2. verify the box coordinate order before trusting it
 *   3. every foreground pixel is assigned to EXACTLY ONE garment — among the
 *      boxes containing it, the SMALLEST box wins, so a shoe box beats a
 *      full-length trouser box on the shoe pixels
 *   4. garment_i = person_alpha ∩ assigned_pixels_i
 *
 * A detection is dropped before it reaches step 3 when its box is smaller than
 * 2% of the image, more extreme than 6:1 either way, or overlaps another box by
 * more than 80% (the same garment detected twice).
 *
 * Nothing here runs a model. It is arithmetic over the matte the caller
 * already produced.
 */
const ZONES = {
    top: ["torso"],
    shirt: ["torso"],
    kurta: ["torso"],
    outerwear: ["torso"],
    jacket: ["torso"],
    blazer: ["torso"],
    dress: ["torso", "legs"],
    saree: ["torso", "legs"],
    lehenga: ["torso", "legs"],
    "traditional wear": ["torso", "legs"],
    "traditional set": ["torso", "legs"],
    onepiece: ["torso", "legs"],
    bottom: ["legs"],
    trousers: ["legs"],
    skirt: ["legs"],
    shoes: ["feet"],
    headwear: ["head"],
    hat: ["head"],
    // A bag, a scarf and a dupatta lie ON TOP of an outfit rather than layering
    // with it. They never compete with the garment underneath.
    bag: ["accessory"],
    scarf: ["accessory"],
    belt: ["accessory"],
};
function zonesOf(type) {
    return ZONES[type.trim().toLowerCase()] ?? ["torso"];
}
function sharesZone(a, b) {
    const left = zonesOf(a);
    const right = zonesOf(b);
    if (left.includes("accessory") || right.includes("accessory"))
        return false;
    return left.some((zone) => right.includes(zone));
}
/** Does `outer`'s reported occluder name `inner`, or the reverse? */
function namesAsOccluder(outerLabel, occludedBy) {
    const claim = occludedBy?.trim().toLowerCase();
    if (!claim)
        return false;
    const label = outerLabel.trim().toLowerCase();
    if (!label)
        return false;
    return claim.includes(label) || label.includes(claim);
}
/**
 * Small, uniform padding.
 *
 * The old cropper needed up to 28% horizontally because the crop WAS the
 * output: anything the box missed was lost forever. That padding is also
 * exactly what dragged the hands beside the trousers into the trousers item.
 *
 * Here the padding only widens the search area — smallest-box-wins settles
 * overlap between garments, and the person matte plus Phase 6 settle what is
 * left. 10% covers a box drawn slightly tight around a sleeve, a baggy leg or
 * a hem without handing a garment its neighbour's pixels.
 */
const PAD_RATIO = 0.1;
function toPixelBox(values, order, width, height, pad) {
    if (!Array.isArray(values) || values.length !== 4)
        return null;
    const nums = values.map(Number);
    if (!nums.every(Number.isFinite))
        return null;
    const [a, b, c, d] = nums;
    const yValues = order === "yxyx" ? [a, c] : [b, d];
    const xValues = order === "yxyx" ? [b, d] : [a, c];
    const rawX0 = Math.floor((Math.min(...xValues) / 1000) * width);
    const rawX1 = Math.ceil((Math.max(...xValues) / 1000) * width) - 1;
    const rawY0 = Math.floor((Math.min(...yValues) / 1000) * height);
    const rawY1 = Math.ceil((Math.max(...yValues) / 1000) * height) - 1;
    if (rawX1 <= rawX0 || rawY1 <= rawY0)
        return null;
    const padX = Math.round((rawX1 - rawX0 + 1) * pad);
    const padY = Math.round((rawY1 - rawY0 + 1) * pad);
    return {
        x0: Math.max(0, rawX0 - padX),
        y0: Math.max(0, rawY0 - padY),
        x1: Math.min(width - 1, rawX1 + padX),
        y1: Math.min(height - 1, rawY1 + padY),
    };
}
function boxArea(box) {
    return (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
}
function foregroundInBox(alpha, width, box) {
    let count = 0;
    for (let y = box.y0; y <= box.y1; y++) {
        const row = y * width;
        for (let x = box.x0; x <= box.x1; x++) {
            if (alpha[row + x] > 127)
                count++;
        }
    }
    return count;
}
/**
 * Step 2 of the plan: verify the coordinate order rather than assuming it.
 *
 * The prompt asks for [ymin, xmin, ymax, xmax], but a swapped box is exactly
 * what produced the wide-and-short "shorts" output. Decide once per photo, not
 * per box: score both interpretations by how much of the person matte lands
 * inside the boxes, and only switch when the evidence is decisive. A tie —
 * which is what near-square boxes always produce — leaves the documented
 * order in place.
 */
export function detectBoxOrder(regions, alpha, width, height) {
    let scoreYX = 0;
    let scoreXY = 0;
    let areaYX = 0;
    let areaXY = 0;
    for (const region of regions) {
        const yx = toPixelBox(region.boundingBox, "yxyx", width, height, 0);
        const xy = toPixelBox(region.boundingBox, "xyxy", width, height, 0);
        if (yx) {
            scoreYX += foregroundInBox(alpha, width, yx);
            areaYX += boxArea(yx);
        }
        if (xy) {
            scoreXY += foregroundInBox(alpha, width, xy);
            areaXY += boxArea(xy);
        }
    }
    // Density, not raw count: a bigger box trivially contains more foreground.
    const densityYX = areaYX > 0 ? scoreYX / areaYX : 0;
    const densityXY = areaXY > 0 ? scoreXY / areaXY : 0;
    if (densityXY > densityYX * 1.5 && densityXY > 0.25) {
        console.warn(`[partition] box order looks TRANSPOSED (density ${densityXY.toFixed(3)} vs ` +
            `${densityYX.toFixed(3)}) — reading boxes as [xmin, ymin, xmax, ymax]`);
        return "xyxy";
    }
    console.log(`[partition] box order yxyx (density ${densityYX.toFixed(3)} vs ${densityXY.toFixed(3)})`);
    return "yxyx";
}
function intersectionArea(a, b) {
    const x0 = Math.max(a.x0, b.x0);
    const y0 = Math.max(a.y0, b.y0);
    const x1 = Math.min(a.x1, b.x1);
    const y1 = Math.min(a.y1, b.y1);
    if (x1 < x0 || y1 < y0)
        return 0;
    return (x1 - x0 + 1) * (y1 - y0 + 1);
}
/**
 * Partition the person matte between the detected garments.
 *
 * `alpha` is the single person matte for the whole photo. It is read, never
 * written — the caller keeps it for the remaining garments.
 */
export function partitionGarments(regions, alpha, width, height) {
    const order = detectBoxOrder(regions, alpha, width, height);
    const imageArea = width * height;
    const accepted = [];
    const rejected = [];
    for (const region of regions) {
        const box = toPixelBox(region.boundingBox, order, width, height, PAD_RATIO);
        if (!box) {
            rejected.push({
                index: region.index, type: region.type, label: region.label,
                code: "invalid_box",
                message: "No usable region was returned for this item.",
            });
            continue;
        }
        const area = boxArea(box);
        // The plan says 2% of the image. Measured against a real full-body photo
        // that rejected a perfectly good pair of "White Canvas Sneakers" at 1.4%:
        // shoes in a head-to-toe shot are genuinely small. 0.5% still discards the
        // speck-sized detections the rule exists for, and the minimum edge length
        // catches anything too small to produce a usable wardrobe image.
        if (area < imageArea * 0.005 || box.x1 - box.x0 < 32 || box.y1 - box.y0 < 32) {
            rejected.push({
                index: region.index, type: region.type, label: region.label,
                code: "too_small",
                message: "This item is too small in the photo to cut out cleanly.",
            });
            continue;
        }
        const aspect = (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1);
        if (aspect > 6 || aspect < 1 / 6) {
            rejected.push({
                index: region.index, type: region.type, label: region.label,
                code: "extreme_aspect",
                message: "The detected region is a thin strip, not a garment.",
            });
            continue;
        }
        accepted.push({ ...region, box, area, overlapsNeighbour: false });
    }
    // Same garment detected twice: drop the LARGER box, keep the tighter one.
    //
    // The test is intersection-over-UNION, not over the smaller box. A shoe box
    // sits entirely inside a full-length trouser box — that is containment, not
    // duplication, and the whole point of the ownership pass below is to handle
    // it. Only two boxes that are nearly the same rectangle are duplicates.
    const duplicates = new Set();
    for (let i = 0; i < accepted.length; i++) {
        for (let j = i + 1; j < accepted.length; j++) {
            if (duplicates.has(i) || duplicates.has(j))
                continue;
            const overlap = intersectionArea(accepted[i].box, accepted[j].box);
            const union = accepted[i].area + accepted[j].area - overlap;
            if (union > 0 && overlap / union > 0.8) {
                const loser = accepted[i].area >= accepted[j].area ? i : j;
                duplicates.add(loser);
                rejected.push({
                    index: accepted[loser].index,
                    type: accepted[loser].type,
                    label: accepted[loser].label,
                    code: "duplicate_box",
                    message: "This looks like the same garment detected twice.",
                });
            }
        }
    }
    const deduped = accepted.filter((_, i) => !duplicates.has(i));
    // OUTERMOST LAYER ONLY.
    //
    // The person matte separates person from background. It knows nothing about
    // where a jacket ends and the shirt under it begins, so for two garments on
    // the same part of the body there is no boundary available at all — only the
    // straight edge of a box. Cutting there produced a "White Button-Down Shirt"
    // that was a photograph of the whole person wearing the jacket.
    //
    // So we do not cut there. Only the garment in FRONT is extracted; the one
    // behind is reported, with a reason, and the user photographs it separately.
    //
    // Which one is in front:
    //   1. Gemini's occludedBy, when it named one — the direct answer.
    //   2. otherwise the LARGER box. An outer layer covers its inner layer; a
    //      jacket box contains the shirt box, never the reverse.
    //
    // Note this is the opposite of the smallest-box-wins rule below, and
    // deliberately so: that rule is for garments on DIFFERENT parts of the body
    // (a shoe box inside a full-length trouser box), where the front item is the
    // smaller one.
    const layered = new Set();
    for (let i = 0; i < deduped.length; i++) {
        for (let j = i + 1; j < deduped.length; j++) {
            if (layered.has(i) || layered.has(j))
                continue;
            const a = deduped[i];
            const b = deduped[j];
            if (!sharesZone(a.type, b.type))
                continue;
            const overlap = intersectionArea(a.box, b.box);
            const smaller = Math.min(a.area, b.area);
            if (smaller <= 0 || overlap / smaller < 0.4)
                continue;
            let outerIndex;
            if (namesAsOccluder(b.label, a.occludedBy))
                outerIndex = j;
            else if (namesAsOccluder(a.label, b.occludedBy))
                outerIndex = i;
            else
                outerIndex = a.area >= b.area ? i : j;
            const innerIndex = outerIndex === i ? j : i;
            const inner = deduped[innerIndex];
            const outer = deduped[outerIndex];
            layered.add(innerIndex);
            rejected.push({
                index: inner.index,
                type: inner.type,
                label: inner.label,
                code: "layered_behind",
                message: `${inner.label} is behind the ${outer.label} in this photo. Add it from a separate photo.`,
            });
            console.log(`[partition] "${inner.label}" is layered behind "${outer.label}" — not extracted`);
        }
    }
    const survivors = deduped.filter((_, i) => !layered.has(i));
    // Record who actually has a neighbour to argue with.
    for (let i = 0; i < survivors.length; i++) {
        for (let j = i + 1; j < survivors.length; j++) {
            if (intersectionArea(survivors[i].box, survivors[j].box) <= 0)
                continue;
            survivors[i].overlapsNeighbour = true;
            survivors[j].overlapsNeighbour = true;
        }
    }
    // Step 3: every foreground pixel goes to exactly one garment — the smallest
    // box containing it. Sorting by area ascending means the first box that
    // contains a pixel is the smallest one that does.
    const byArea = survivors
        .map((detection, slot) => ({ detection, slot }))
        .sort((a, b) => a.detection.area - b.detection.area);
    const ownership = new Int32Array(width * height).fill(-1);
    const ownedPixels = survivors.map(() => 0);
    // Ownership is recorded for EVERY pixel inside a box, background included.
    //
    // That looks wasteful — background pixels have alpha 0 and contribute
    // nothing to any cutout. It matters for edge quality: the ownership map is
    // later blurred to feather garment-to-garment boundaries, and if it stopped
    // at the silhouette the blur would eat 1-2px of the garment's own outline.
    // Carrying it across the silhouette means the blur only softens where two
    // garments actually meet, and the outline stays exactly as the matte drew it.
    for (const { detection, slot } of byArea) {
        const { box } = detection;
        for (let y = box.y0; y <= box.y1; y++) {
            const row = y * width;
            for (let x = box.x0; x <= box.x1; x++) {
                const i = row + x;
                if (ownership[i] !== -1)
                    continue; // a smaller box already claimed it
                ownership[i] = slot;
                if (alpha[i] > 127)
                    ownedPixels[slot]++;
            }
        }
    }
    for (let i = 0; i < survivors.length; i++) {
        const d = survivors[i];
        console.log(`[partition] ${d.type}/${d.label}: box ${d.box.x0},${d.box.y0}-${d.box.x1},${d.box.y1} ` +
            `owns ${ownedPixels[i]}px (${((ownedPixels[i] / d.area) * 100).toFixed(1)}% of its box)`);
    }
    return { order, accepted: survivors, rejected, ownership, ownedPixels };
}
/** Separable box blur over a single-channel mask. Two passes ≈ Gaussian. */
function blurMask(mask, width, height, radius) {
    if (radius < 1)
        return mask;
    const span = radius * 2 + 1;
    let current = mask;
    for (let pass = 0; pass < 2; pass++) {
        const horizontal = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            const row = y * width;
            let sum = 0;
            for (let x = -radius; x <= radius; x++) {
                sum += current[row + Math.min(width - 1, Math.max(0, x))];
            }
            for (let x = 0; x < width; x++) {
                horizontal[row + x] = (sum / span) | 0;
                const out = row + Math.min(width - 1, Math.max(0, x - radius));
                const inn = row + Math.min(width - 1, Math.max(0, x + radius + 1));
                sum += current[inn] - current[out];
            }
        }
        const vertical = new Uint8Array(width * height);
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let y = -radius; y <= radius; y++) {
                sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
            }
            for (let y = 0; y < height; y++) {
                vertical[y * width + x] = (sum / span) | 0;
                const out = Math.min(height - 1, Math.max(0, y - radius)) * width + x;
                const inn = Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x;
                sum += horizontal[inn] - horizontal[out];
            }
        }
        current = vertical;
    }
    return current;
}
/**
 * Build one garment's RGBA cutout from the shared matte and the ownership map.
 *
 * RGB is copied byte-for-byte from the source: nothing is repainted,
 * reconstructed or invented, which the outfit prompt also promises the user.
 * Only alpha is written.
 *
 * `feather` softens the ownership mask before it multiplies the matte. Without
 * it, every garment-to-garment boundary is a hard per-pixel decision and comes
 * out as a stair-stepped, aliased edge. The outer silhouette is unaffected:
 * ownership is continuous across it (see partitionGarments), so the blur only
 * has something to soften where two garments actually meet.
 */
export function buildOwnedCutout(photoData, photoWidth, alpha, ownership, slot, box, feather = 2) {
    const width = box.x1 - box.x0 + 1;
    const height = box.y1 - box.y0 + 1;
    const data = new Uint8Array(width * height * 4);
    const hardMask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            hardMask[y * width + x] =
                ownership[(y + box.y0) * photoWidth + (x + box.x0)] === slot ? 255 : 0;
        }
    }
    const mask = blurMask(hardMask, width, height, feather);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = (y + box.y0) * photoWidth + (x + box.x0);
            const s4 = source * 4;
            const d4 = (y * width + x) * 4;
            data[d4] = photoData[s4];
            data[d4 + 1] = photoData[s4 + 1];
            data[d4 + 2] = photoData[s4 + 2];
            data[d4 + 3] = (alpha[source] * mask[y * width + x]) / 255;
        }
    }
    return { data, width, height };
}
/** Crop an RGBA buffer tight to its remaining alpha, with a small margin. */
export function tightCrop(image, margin = 4) {
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            if (image.data[(y * image.width + x) * 4 + 3] <= 20)
                continue;
            if (x < minX)
                minX = x;
            if (x > maxX)
                maxX = x;
            if (y < minY)
                minY = y;
            if (y > maxY)
                maxY = y;
        }
    }
    if (maxX < 0)
        return null;
    const x0 = Math.max(0, minX - margin);
    const y0 = Math.max(0, minY - margin);
    const x1 = Math.min(image.width - 1, maxX + margin);
    const y1 = Math.min(image.height - 1, maxY + margin);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    if (width === image.width && height === image.height)
        return image;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const s4 = ((y + y0) * image.width + (x + x0)) * 4;
            const d4 = (y * width + x) * 4;
            data[d4] = image.data[s4];
            data[d4 + 1] = image.data[s4 + 1];
            data[d4 + 2] = image.data[s4 + 2];
            data[d4 + 3] = image.data[s4 + 3];
        }
    }
    return { data, width, height };
}
