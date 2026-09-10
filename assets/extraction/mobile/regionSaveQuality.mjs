// Generated from src/ai/regionSaveQuality.ts; see source-manifest.json.
/**
 * Validate the alpha that will actually be encoded, not only Gemini's box.
 * A distant garment can be correctly identified but still be useless as a
 * paid wardrobe asset, while a failed person matte can turn dark trousers
 * into an almost solid crop rectangle. Both are output-quality failures.
 */
export function evaluateWornOutputGeometry(rgba, width, height, sourceWidth, sourceHeight, type) {
    let foregroundPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rgba[(y * width + x) * 4 + 3] <= 20)
                continue;
            foregroundPixels++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    const opaqueBoundsWidth = maxX >= minX ? maxX - minX + 1 : 0;
    const opaqueBoundsHeight = maxY >= minY ? maxY - minY + 1 : 0;
    const opaqueFillFraction = foregroundPixels /
        Math.max(1, opaqueBoundsWidth * opaqueBoundsHeight);
    const sourceForegroundFraction = foregroundPixels /
        Math.max(1, sourceWidth * sourceHeight);
    const sourceHeightFraction = opaqueBoundsHeight / Math.max(1, sourceHeight);
    let bottomBandOpaquePixels = 0;
    let bottomBandPixels = 0;
    if (opaqueBoundsWidth > 0 && maxY >= minY) {
        const bandTop = Math.max(minY, maxY - 4);
        for (let y = bandTop; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                bottomBandPixels++;
                if (rgba[(y * width + x) * 4 + 3] > 20)
                    bottomBandOpaquePixels++;
            }
        }
    }
    const bottomBandOpaqueFraction = bottomBandOpaquePixels / Math.max(1, bottomBandPixels);
    const band = wornVerticalBand(type);
    let reason = "clean-output-geometry";
    // Bottoms need enough vertical structure to communicate waist/hem/leg
    // shape. The beach regression was a 91x26 sliver in a 472x1024 photo.
    if (band === "lower" &&
        (sourceForegroundFraction < 0.006 || sourceHeightFraction < 0.05)) {
        reason = "worn-output-too-small";
    }
    else if (band === "lower" &&
        foregroundPixels >= 1024 &&
        opaqueFillFraction > 0.985) {
        // A real pair of trousers has some waist/hem taper or an inter-leg gap.
        // 98.5%+ opaque fill is the measured failed black-trouser rectangle, not
        // an edge we should silently sell as a clean cutout.
        reason = "rectangular-bottom-output";
    }
    else if (band === "lower" &&
        sourceHeightFraction >= 0.08 &&
        opaqueFillFraction > 0.80 &&
        bottomBandOpaqueFraction > 0.65) {
        // A broad, almost-flat opaque edge at the bottom of a full lower garment
        // means the crop/box ended through the legs. Complete hems taper into two
        // much narrower cuffs; measured good corpus cases end at 2..30%, while
        // the truncated distressed jeans ended at 72..73% for five rows.
        reason = "truncated-lower-boundary";
    }
    return {
        saveWorthy: reason === "clean-output-geometry",
        reason,
        foregroundPixels,
        opaqueBoundsWidth,
        opaqueBoundsHeight,
        opaqueFillFraction,
        sourceForegroundFraction,
        sourceHeightFraction,
        bottomBandOpaqueFraction,
    };
}
function wornVerticalBand(type) {
    const value = type.trim().toLowerCase();
    if (["shoes", "shoe", "footwear", "sneakers", "sneaker", "boots", "sandals"].includes(value)) {
        return "footwear";
    }
    if (["bottom", "bottoms", "trousers", "pants", "jeans", "shorts", "skirt"].includes(value)) {
        return "lower";
    }
    if ([
        "top", "tops", "shirt", "kurta", "traditional wear", "outerwear", "jacket", "coat",
        "dress", "one-piece",
    ].includes(value)) {
        return "upper";
    }
    return null;
}
/**
 * Only a different, save-worthy vertical garment band may clip this item.
 * A skipped region has no reliable boundary, and two layered tops must never
 * amputate one another merely because their Gemini box centres differ.
 */
export function canWornRegionVerticallyOwn(currentType, otherType, otherSaveWorthy) {
    if (!otherSaveWorthy)
        return false;
    const current = wornVerticalBand(currentType);
    const other = wornVerticalBand(otherType);
    return current !== null && other !== null && current !== other;
}
/**
 * Identification is not permission to create a wardrobe item.
 * A partial garment can still inform Style Check, but it is not save-worthy
 * when too little of its characteristic shape is visible.
 */
export function evaluateRegionSaveQuality(region) {
    const fraction = Number.isFinite(Number(region.visibleFraction))
        ? Math.max(0, Math.min(1, Number(region.visibleFraction)))
        : region.visibility === "full"
            ? 1
            : 0;
    const label = region.label || "This garment";
    const obstruction = region.occludedBy?.trim();
    const reject = (reason) => ({
        saveWorthy: false,
        reason,
        visibleFraction: fraction,
        message: `${label} is only about ${Math.round(fraction * 100)}% visible` +
            `${obstruction ? ` and is covered by ${obstruction}` : ""}. ` +
            "It was identified for the outfit analysis but not prepared as a wardrobe item.",
    });
    if (region.visibility === "mostly_hidden")
        return reject("mostly-hidden");
    if (region.visibility === "partial" && fraction < 0.72) {
        return reject("partial-below-useful-threshold");
    }
    // Honour extractionReady=false only when Gemini also reports genuine
    // garment loss. Contact objects such as hands/lanyards are preservation
    // context and must not cause a rejection by themselves.
    if (region.extractionReady === false && fraction < 0.72) {
        return reject("model-not-ready-and-insufficiently-visible");
    }
    return { saveWorthy: true, reason: "sufficiently-visible", visibleFraction: fraction };
}
