// Generated from src/ai/wornPairSeams.ts; see source-manifest.json.
import { resolveGarmentBoundaries, } from "./contestedPixels.mjs";
import { rgbToLab } from "./pixelColor.mjs";
/** High-confidence shoe boxes must contain a meaningful shoe top/tongue. */
export const MIN_SHOE_TOP_BAND_OPAQUE_FRACTION = 0.25;
/** A tight crop with less than 30% foreground is too hollow to sell as a pair. */
export const MAX_SHOE_TIGHT_CROP_TRANSPARENT_FRACTION = 0.70;
const MIN_SHOE_UPPER_THIRD_RETAINED_FRACTION = 0.35;
const MIN_EXPECTED_SHOE_MASS_FOR_TOP_BAND = 0.20;
const SPARSE_SHOE_TOP_BAND_FRACTION = 0.40;
/** Two-piece shoe outputs need two materially complete shoes, not one boot plus debris. */
export const MIN_SHOE_COMPONENT_BALANCE_FRACTION = 0.25;
/** Colour-guided repair/cleanup needs a modest but real garment separation. */
const MIN_WORN_SHOE_COLOUR_MODEL_DELTA_E = 12;
/** Below this distance, a hollow shoe result is ambiguous and must be skipped. */
const MAX_AMBIGUOUS_SHOE_PAIR_DELTA_E = 18;
/**
 * Same-colour trouser/shoe pairs need enough source pixels for a trustworthy
 * boundary. Below this edge size, enlarging the crop exposes cuff/floor
 * leakage that component-count and fill metrics cannot distinguish from a
 * complete dark shoe.
 */
const MIN_AMBIGUOUS_SHOE_DETAIL_EDGE = 120;
/**
 * Keep a borderline-colour trouser output from carrying visible shoe pieces.
 *
 * The colour seam may legitimately be uncertain for black-on-black outfits.
 * In that case a false-positive shoe fragment on the trousers is worse than a
 * conservative cuff edge. Only the bottom/shoe overlap is affected, only the
 * upper item is trimmed, and RGB is never changed.
 */
export function trimBorderlineWornUpperOverlap(rgba, cropWidth, cropHeight, cropX0, cropY0, seam, regionIndex) {
    const modelDistance = seam.shoeProtection?.modelDistance ?? Number.POSITIVE_INFINITY;
    const lowerBox = seam.lowerBox;
    if (seam.upperIndex !== regionIndex ||
        !lowerBox ||
        modelDistance >= MAX_AMBIGUOUS_SHOE_PAIR_DELTA_E) {
        return { applied: false, clearedPixels: 0, modelDistance, cutoffY: -1 };
    }
    const lowerHeight = Math.max(1, lowerBox.y1 - lowerBox.y0 + 1);
    // Retain a very shallow contact band for a cuff that sits over the shoe,
    // then remove deeper lower-box pixels from the trousers. Six percent is 4-6
    // source pixels in typical phone crops and cannot swallow the shoe body.
    const cutoffY = lowerBox.y0 + Math.max(2, Math.round(lowerHeight * 0.06));
    let clearedPixels = 0;
    for (let y = 0; y < cropHeight; y++) {
        const sourceY = cropY0 + y;
        if (sourceY < cutoffY)
            continue;
        for (let x = 0; x < cropWidth; x++) {
            const sourceX = cropX0 + x;
            if (sourceX < lowerBox.x0 || sourceX > lowerBox.x1)
                continue;
            const alphaIndex = (y * cropWidth + x) * 4 + 3;
            if (rgba[alphaIndex] === 0)
                continue;
            rgba[alphaIndex] = 0;
            clearedPixels++;
        }
    }
    return { applied: clearedPixels > 0, clearedPixels, modelDistance, cutoffY };
}
/**
 * Compare the final shoe upper third with the original person matte. This is
 * deliberately independent of the fitted ownership labels: if the seam
 * mistakenly calls the shoe tongue "trousers", known-lower retention alone
 * looks perfect while this metric exposes the lost shoe body.
 */
export function measureWornShoeUpperThirdRetention(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, sourcePersonAlpha, seam) {
    const lowerBox = seam.lowerBox;
    if (!lowerBox) {
        return {
            personMattePixels: 0,
            retainedPixels: 0,
            retainedFraction: 1,
            boxPixels: 0,
            opaqueFraction: 0,
        };
    }
    const lowerHeight = Math.max(1, lowerBox.y1 - lowerBox.y0 + 1);
    const upperThirdBottom = Math.min(lowerBox.y1 + 1, lowerBox.y0 + Math.max(1, Math.ceil(lowerHeight / 3)));
    let personMattePixels = 0;
    let retainedPixels = 0;
    let boxPixels = 0;
    let opaquePixels = 0;
    for (let sourceY = lowerBox.y0; sourceY < upperThirdBottom; sourceY++) {
        const y = sourceY - cropY0;
        if (y < 0 || y >= cropHeight)
            continue;
        for (let sourceX = lowerBox.x0; sourceX <= lowerBox.x1; sourceX++) {
            const x = sourceX - cropX0;
            if (x < 0 || x >= cropWidth)
                continue;
            boxPixels++;
            const visible = rgba[(y * cropWidth + x) * 4 + 3] > 20;
            if (visible)
                opaquePixels++;
            const sourcePixel = sourceY * sourceWidth + sourceX;
            if (sourcePersonAlpha[sourcePixel] <= 20)
                continue;
            personMattePixels++;
            if (visible)
                retainedPixels++;
        }
    }
    return {
        personMattePixels,
        retainedPixels,
        retainedFraction: retainedPixels / Math.max(1, personMattePixels),
        boxPixels,
        opaqueFraction: opaquePixels / Math.max(1, boxPixels),
    };
}
/**
 * Apply the fitted pair ownership to a crop's alpha channel.
 *
 * `initialPairOwnership` labels the complete union of the bottom and shoe
 * boxes. The seam is fitted only in their overlap, but upper-only pixels beside
 * that overlap still belong to the trousers. Applying ownership only inside
 * the overlap left those side cuffs/leg triangles attached to the shoe PNG.
 */
export function applyWornPairOwnershipAlpha(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, seam, regionIndex) {
    const pairOwner = seam.upperIndex === regionIndex
        ? 0
        : seam.lowerIndex === regionIndex
            ? 1
            : -1;
    if (pairOwner < 0)
        return { clearedPixels: 0, clearedOutsideOverlapPixels: 0 };
    let clearedPixels = 0;
    let clearedOutsideOverlapPixels = 0;
    for (let y = 0; y < cropHeight; y++) {
        const sourceY = cropY0 + y;
        for (let x = 0; x < cropWidth; x++) {
            const alphaIndex = (y * cropWidth + x) * 4 + 3;
            if (rgba[alphaIndex] === 0)
                continue;
            const sourceX = cropX0 + x;
            const owner = seam.ownership[sourceY * sourceWidth + sourceX];
            // -1 is deliberately untouched: it lies outside both Gemini boxes and
            // may be an antialiased/under-boxed edge that the person matte preserved.
            if (owner < 0 || owner === pairOwner)
                continue;
            rgba[alphaIndex] = 0;
            clearedPixels++;
            if (sourceX < seam.overlap.x0 || sourceX > seam.overlap.x1 ||
                sourceY < seam.overlap.y0 || sourceY > seam.overlap.y1) {
                clearedOutsideOverlapPixels++;
            }
        }
    }
    return { clearedPixels, clearedOutsideOverlapPixels };
}
function median(values) {
    if (values.length === 0)
        return 0;
    values.sort((a, b) => a - b);
    return values[(values.length / 2) | 0];
}
function ownerColour(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, ownership, owner) {
    const red = [];
    const green = [];
    const blue = [];
    const stride = Math.max(1, Math.floor((cropWidth * cropHeight) / 2500));
    for (let pixel = 0; pixel < cropWidth * cropHeight; pixel += stride) {
        const x = pixel % cropWidth;
        const y = (pixel / cropWidth) | 0;
        const sourcePixel = (cropY0 + y) * sourceWidth + cropX0 + x;
        if (ownership[sourcePixel] !== owner)
            continue;
        const rgbaIndex = pixel * 4;
        red.push(rgba[rgbaIndex]);
        green.push(rgba[rgbaIndex + 1]);
        blue.push(rgba[rgbaIndex + 2]);
    }
    const samples = red.length;
    return {
        lab: rgbToLab(median(red), median(green), median(blue)),
        samples,
    };
}
function labDistance2(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
// Deep enough to reclaim a real hanging cuff, but bounded so an upper-colour
// flood cannot consume an entire shoe box. The lower-colour connectivity pass
// below restores any vamp/tongue pixels that share that contested band.
const WORN_SHOE_RESIDUE_RECOVERY_DEPTH = 48;
function sourceBoxColour(photoData, personAlpha, width, ownership, owner, box) {
    const red = [];
    const green = [];
    const blue = [];
    const area = Math.max(1, (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1));
    const stride = Math.max(1, Math.floor(area / 3000));
    let seen = 0;
    for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
            const pixel = y * width + x;
            if (personAlpha[pixel] <= 127 || ownership[pixel] !== owner)
                continue;
            if (seen++ % stride !== 0)
                continue;
            const rgba = pixel * 4;
            red.push(photoData[rgba]);
            green.push(photoData[rgba + 1]);
            blue.push(photoData[rgba + 2]);
        }
    }
    return {
        lab: rgbToLab(median(red), median(green), median(blue)),
        samples: red.length,
    };
}
/**
 * Repair shoe-coloured pixels that a deep bottom/shoe seam assigned to the
 * trousers. Only pixels inside the Gemini shoe box's upper third are eligible,
 * they must match the lower colour model materially better, and they must be
 * 4-connected to ownership that is already confidently lower. This restores
 * a vamp/tongue without donating isolated trouser cuffs or side triangles.
 */
export function repairWornShoeUpperOwnership(photoData, personAlpha, width, height, ownership, upperBox, lowerBox, overlap) {
    const upperTrainingBox = {
        ...upperBox,
        y1: Math.max(upperBox.y0, Math.min(upperBox.y1, overlap.y0 - 1)),
    };
    const lowerHeight = Math.max(1, lowerBox.y1 - lowerBox.y0 + 1);
    const lowerTrainingBox = {
        ...lowerBox,
        y0: Math.min(lowerBox.y1, lowerBox.y0 + Math.round(lowerHeight * 0.4)),
    };
    let upper = sourceBoxColour(photoData, personAlpha, width, ownership, 0, upperTrainingBox);
    let lower = sourceBoxColour(photoData, personAlpha, width, ownership, 1, lowerTrainingBox);
    // Small/edge-cropped boxes may not have 40 clean zone samples. Fall back to
    // their full owner-labelled boxes; the connectivity rule still prevents a
    // free-standing colour match from being restored.
    if (upper.samples < 40) {
        upper = sourceBoxColour(photoData, personAlpha, width, ownership, 0, upperBox);
    }
    if (lower.samples < 40) {
        lower = sourceBoxColour(photoData, personAlpha, width, ownership, 1, lowerBox);
    }
    const modelDistance = Math.sqrt(labDistance2(upper.lab, lower.lab));
    const colourModelAvailable = upper.samples >= 40 &&
        lower.samples >= 40 &&
        modelDistance >= MIN_WORN_SHOE_COLOUR_MODEL_DELTA_E;
    const upperThirdBottom = Math.min(lowerBox.y1 + 1, lowerBox.y0 + Math.max(1, Math.ceil(lowerHeight / 3)));
    // The bad ownership seam can extend just below the measured upper third.
    // Allow lower-colour pixels to form a bridge through the upper 55% so the
    // tongue reconnects to the known shoe body; upper-colour cuff pixels remain
    // ineligible and therefore cannot use this bridge.
    const repairBandBottom = Math.min(lowerBox.y1 + 1, lowerBox.y0 + Math.max(1, Math.ceil(lowerHeight * 0.55)));
    let upperThirdPersonMattePixels = 0;
    let lowerOwnedBefore = 0;
    for (let y = lowerBox.y0; y < upperThirdBottom; y++) {
        for (let x = lowerBox.x0; x <= lowerBox.x1; x++) {
            const pixel = y * width + x;
            if (personAlpha[pixel] <= 20)
                continue;
            upperThirdPersonMattePixels++;
            if (ownership[pixel] === 1)
                lowerOwnedBefore++;
        }
    }
    if (!colourModelAvailable) {
        return {
            colourModelAvailable,
            upperSamples: upper.samples,
            lowerSamples: lower.samples,
            modelDistance,
            candidatePixels: 0,
            connectedCandidatePixels: 0,
            restoredToLowerPixels: 0,
            upperThirdPersonMattePixels,
            lowerOwnedBeforeFraction: lowerOwnedBefore / Math.max(1, upperThirdPersonMattePixels),
            lowerOwnedAfterFraction: lowerOwnedBefore / Math.max(1, upperThirdPersonMattePixels),
            residueRecoveryDepthLimit: WORN_SHOE_RESIDUE_RECOVERY_DEPTH,
        };
    }
    const localWidth = lowerBox.x1 - lowerBox.x0 + 1;
    const localHeight = lowerBox.y1 - lowerBox.y0 + 1;
    const eligible = new Uint8Array(localWidth * localHeight);
    const visited = new Uint8Array(localWidth * localHeight);
    const candidate = new Uint8Array(localWidth * localHeight);
    const queue = new Int32Array(localWidth * localHeight);
    let head = 0;
    let tail = 0;
    let candidatePixels = 0;
    for (let y = lowerBox.y0; y <= lowerBox.y1; y++) {
        for (let x = lowerBox.x0; x <= lowerBox.x1; x++) {
            const imagePixel = y * width + x;
            if (imagePixel < 0 || imagePixel >= width * height || personAlpha[imagePixel] <= 20)
                continue;
            const local = (y - lowerBox.y0) * localWidth + x - lowerBox.x0;
            if (ownership[imagePixel] === 1) {
                eligible[local] = 1;
                visited[local] = 1;
                queue[tail++] = local;
                continue;
            }
            if (ownership[imagePixel] !== 0 || y >= repairBandBottom)
                continue;
            const rgba = imagePixel * 4;
            const pixelLab = rgbToLab(photoData[rgba], photoData[rgba + 1], photoData[rgba + 2]);
            const upperDistance = labDistance2(pixelLab, upper.lab);
            const lowerDistance = labDistance2(pixelLab, lower.lab);
            if (lowerDistance * 1.2 >= upperDistance)
                continue;
            eligible[local] = 1;
            candidate[local] = 1;
            candidatePixels++;
        }
    }
    while (head < tail) {
        const local = queue[head++];
        const lx = local % localWidth;
        const ly = (local / localWidth) | 0;
        const visit = (next) => {
            if (!eligible[next] || visited[next])
                return;
            visited[next] = 1;
            queue[tail++] = next;
        };
        if (lx > 0)
            visit(local - 1);
        if (lx + 1 < localWidth)
            visit(local + 1);
        if (ly > 0)
            visit(local - localWidth);
        if (ly + 1 < localHeight)
            visit(local + localWidth);
    }
    let connectedCandidatePixels = 0;
    let restoredToLowerPixels = 0;
    let restoredUpperThirdPixels = 0;
    for (let ly = 0; ly < localHeight; ly++) {
        for (let lx = 0; lx < localWidth; lx++) {
            const local = ly * localWidth + lx;
            if (!candidate[local] || !visited[local])
                continue;
            connectedCandidatePixels++;
            const imagePixel = (lowerBox.y0 + ly) * width + lowerBox.x0 + lx;
            if (ownership[imagePixel] !== 0)
                continue;
            ownership[imagePixel] = 1;
            restoredToLowerPixels++;
            if (lowerBox.y0 + ly < upperThirdBottom)
                restoredUpperThirdPixels++;
        }
    }
    return {
        colourModelAvailable,
        upperSamples: upper.samples,
        lowerSamples: lower.samples,
        modelDistance,
        candidatePixels,
        connectedCandidatePixels,
        restoredToLowerPixels,
        upperThirdPersonMattePixels,
        lowerOwnedBeforeFraction: lowerOwnedBefore / Math.max(1, upperThirdPersonMattePixels),
        lowerOwnedAfterFraction: (lowerOwnedBefore + restoredUpperThirdPixels) / Math.max(1, upperThirdPersonMattePixels),
        residueRecoveryDepthLimit: WORN_SHOE_RESIDUE_RECOVERY_DEPTH,
    };
}
/**
 * Remove only unowned, upper-coloured person-matte pixels from the upper shoe
 * band. Lower-box pixels below that band are never geometry-cleared, so an
 * under-boxed toe or sole survives. RGB is read for classification, not edited.
 */
export function clearUnownedShoeContamination(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, seam) {
    const lowerBox = seam.lowerBox;
    if (!lowerBox) {
        return {
            examinedPixels: 0,
            clearedPixels: 0,
            colourModelAvailable: false,
            upperSamples: 0,
            lowerSamples: 0,
            modelDistance: 0,
        };
    }
    const upper = ownerColour(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, seam.ownership, 0);
    const lower = ownerColour(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, seam.ownership, 1);
    const modelDistance = Math.sqrt(labDistance2(upper.lab, lower.lab));
    const colourModelAvailable = upper.samples >= 40 &&
        lower.samples >= 40 &&
        modelDistance >= MIN_WORN_SHOE_COLOUR_MODEL_DELTA_E;
    const lowerHeight = Math.max(1, lowerBox.y1 - lowerBox.y0 + 1);
    const geometryLimit = lowerBox.y0 + Math.round(lowerHeight * 0.3);
    // First lower-owned row per source column acts as the measured seam when it
    // is available. Columns outside the union fall back to the safe top 30%.
    const firstLower = new Int32Array(cropWidth).fill(-1);
    for (let x = 0; x < cropWidth; x++) {
        const sourceX = cropX0 + x;
        for (let sourceY = lowerBox.y0; sourceY <= lowerBox.y1; sourceY++) {
            if (seam.ownership[sourceY * sourceWidth + sourceX] === 1) {
                firstLower[x] = sourceY;
                break;
            }
        }
    }
    let examinedPixels = 0;
    let clearedPixels = 0;
    for (let y = 0; y < cropHeight; y++) {
        const sourceY = cropY0 + y;
        for (let x = 0; x < cropWidth; x++) {
            const alphaIndex = (y * cropWidth + x) * 4 + 3;
            if (rgba[alphaIndex] <= 20)
                continue;
            const sourceX = cropX0 + x;
            const sourcePixel = sourceY * sourceWidth + sourceX;
            if (seam.ownership[sourcePixel] !== -1)
                continue;
            const upperLimit = firstLower[x] >= 0 ? firstLower[x] + 2 : geometryLimit;
            if (sourceY >= upperLimit)
                continue;
            examinedPixels++;
            let clear = false;
            if (colourModelAvailable) {
                const pixelIndex = (y * cropWidth + x) * 4;
                const pixelLab = rgbToLab(rgba[pixelIndex], rgba[pixelIndex + 1], rgba[pixelIndex + 2]);
                const upperDistance = labDistance2(pixelLab, upper.lab);
                const lowerDistance = labDistance2(pixelLab, lower.lab);
                clear = upperDistance * 1.2 < lowerDistance;
            }
            else {
                // With no trustworthy colour separation, clear only person pixels
                // strictly above the Gemini shoe box. Never guess inside its lower 70%.
                clear = sourceY < lowerBox.y0;
            }
            if (!clear)
                continue;
            rgba[alphaIndex] = 0;
            clearedPixels++;
        }
    }
    return {
        examinedPixels,
        clearedPixels,
        colourModelAvailable,
        upperSamples: upper.samples,
        lowerSamples: lower.samples,
        modelDistance,
    };
}
/** Validate the actual shoe alpha after ownership and component cleanup. */
export function evaluateWornShoeOutputQuality(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, seam, componentCount, removedComponentFraction, options = {}) {
    let foregroundPixels = 0;
    let knownUpperVisiblePixels = 0;
    let knownUpperPixels = 0;
    let knownLowerPixels = 0;
    let knownLowerVisiblePixels = 0;
    let topBandPixels = 0;
    let topBandOpaquePixels = 0;
    const lowerBox = seam.lowerBox;
    const topBandBottom = lowerBox
        ? lowerBox.y0 + Math.max(1, Math.round((lowerBox.y1 - lowerBox.y0 + 1) * 0.12))
        : cropY0 + Math.max(1, Math.round(cropHeight * 0.12));
    for (let y = 0; y < cropHeight; y++) {
        const sourceY = cropY0 + y;
        for (let x = 0; x < cropWidth; x++) {
            const sourceX = cropX0 + x;
            const owner = seam.ownership[sourceY * sourceWidth + sourceX];
            const visible = rgba[(y * cropWidth + x) * 4 + 3] > 20;
            if (visible)
                foregroundPixels++;
            if (owner === 0) {
                knownUpperPixels++;
                if (visible)
                    knownUpperVisiblePixels++;
            }
            else if (owner === 1) {
                knownLowerPixels++;
                if (visible)
                    knownLowerVisiblePixels++;
            }
            if (lowerBox &&
                sourceX >= lowerBox.x0 && sourceX <= lowerBox.x1 &&
                sourceY >= lowerBox.y0 && sourceY < topBandBottom) {
                topBandPixels++;
                if (visible)
                    topBandOpaquePixels++;
            }
        }
    }
    const knownUpperVisibleFraction = knownUpperVisiblePixels / Math.max(1, foregroundPixels);
    const knownLowerRetainedFraction = knownLowerVisiblePixels / Math.max(1, knownLowerPixels);
    const topBandOpaqueFraction = topBandOpaquePixels / Math.max(1, topBandPixels);
    const visibleFraction = Number.isFinite(options.visibleFraction)
        ? Math.max(0, Math.min(1, Number(options.visibleFraction)))
        : 1;
    const topBandRequiredByVisibility = options.visibility === "full" ||
        visibleFraction >= 0.7;
    // Gemini frequently starts a shoe box at the trouser hem. If the resolved
    // pair finds almost no shoe-owned mass in that upper third, an empty first
    // 12% is expected (it is jeans/overlap, not a missing loafer). Requiring the
    // top band there rejects two otherwise complete, balanced shoe components.
    const topBandExpectedShoeFraction = seam.shoeProtection?.lowerOwnedAfterFraction ?? 1;
    const topBandSuppressedByPairOverlap = topBandExpectedShoeFraction < MIN_EXPECTED_SHOE_MASS_FOR_TOP_BAND;
    const topBandRequired = topBandRequiredByVisibility && !topBandSuppressedByPairOverlap;
    const tightCropTransparentFraction = Number.isFinite(options.tightCropTransparentFraction)
        ? Math.max(0, Math.min(1, Number(options.tightCropTransparentFraction)))
        : 0;
    const componentSizes = [...(options.keptComponentSizes ?? [])]
        .filter((size) => Number.isFinite(size) && size > 0)
        .sort((a, b) => b - a);
    const componentBalanceFraction = componentSizes.length === 2
        ? componentSizes[1] / Math.max(1, componentSizes[0])
        : 1;
    const upperThird = options.sourcePersonAlpha
        ? measureWornShoeUpperThirdRetention(rgba, cropWidth, cropHeight, cropX0, cropY0, sourceWidth, options.sourcePersonAlpha, seam)
        : {
            personMattePixels: 0,
            retainedPixels: 0,
            retainedFraction: 1,
            boxPixels: 0,
            opaqueFraction: topBandOpaqueFraction,
        };
    const pairModelDistance = seam.shoeProtection?.modelDistance ?? 0;
    const borderlinePairColour = pairModelDistance >= 10 && pairModelDistance < MAX_AMBIGUOUS_SHOE_PAIR_DELTA_E;
    const tightCropFillFraction = 1 - tightCropTransparentFraction;
    const tightCropWidth = Number.isFinite(options.tightCropWidth)
        ? Math.max(0, Math.round(Number(options.tightCropWidth)))
        : 0;
    const tightCropHeight = Number.isFinite(options.tightCropHeight)
        ? Math.max(0, Math.round(Number(options.tightCropHeight)))
        : 0;
    const minimumTightCropDimension = Math.min(tightCropWidth, tightCropHeight);
    const lowDetailAmbiguousPair = tightCropWidth > 0 &&
        tightCropHeight > 0 &&
        pairModelDistance < MAX_AMBIGUOUS_SHOE_PAIR_DELTA_E &&
        minimumTightCropDimension < MIN_AMBIGUOUS_SHOE_DETAIL_EDGE;
    // A staggered pair can have almost no pixels in the first 12% of the Gemini
    // box while still containing two complete shoes immediately below it. Keep
    // the ambiguity guard for genuinely hollow masks, but do not let that one
    // band overrule a dense, balanced, well-retained pair.
    const denseBalancedPair = componentCount === 2 &&
        componentSizes.length === 2 &&
        componentBalanceFraction >= 0.35 &&
        tightCropFillFraction >= 0.38 &&
        upperThird.retainedFraction >= 0.50 &&
        knownLowerRetainedFraction >= 0.90;
    let reason = "clean-shoe-output";
    if (foregroundPixels < 64)
        reason = "empty-shoe-output";
    else if (componentCount < 1 || componentCount > 2)
        reason = "invalid-shoe-components";
    else if (lowDetailAmbiguousPair)
        reason = "ambiguous-shoe-boundary";
    else if (componentCount === 2 &&
        componentSizes.length === 2 &&
        componentBalanceFraction < MIN_SHOE_COMPONENT_BALANCE_FRACTION)
        reason = "imbalanced-shoe-components";
    else if (topBandRequired &&
        topBandOpaqueFraction < MIN_SHOE_TOP_BAND_OPAQUE_FRACTION &&
        borderlinePairColour &&
        !denseBalancedPair)
        reason = "ambiguous-shoe-boundary";
    else if (topBandRequired &&
        topBandOpaqueFraction < MIN_SHOE_TOP_BAND_OPAQUE_FRACTION &&
        upperThird.retainedFraction < MIN_SHOE_UPPER_THIRD_RETAINED_FRACTION)
        reason = "top-band-empty";
    else if (knownUpperVisibleFraction > 0.01)
        reason = "upper-garment-contamination";
    else if (removedComponentFraction > 0.35)
        reason = "excessive-shoe-debris";
    else if (topBandRequired &&
        componentCount === 2 &&
        tightCropTransparentFraction > MAX_SHOE_TIGHT_CROP_TRANSPARENT_FRACTION &&
        topBandOpaqueFraction < SPARSE_SHOE_TOP_BAND_FRACTION &&
        upperThird.retainedFraction < MIN_SHOE_UPPER_THIRD_RETAINED_FRACTION)
        reason = "sparse-shoe-output";
    else if (knownLowerRetainedFraction < 0.7)
        reason = "shoe-body-damaged";
    return {
        saveLower: reason === "clean-shoe-output",
        reason,
        foregroundPixels,
        componentCount,
        removedComponentFraction,
        knownUpperVisiblePixels,
        knownUpperVisibleFraction,
        knownLowerRetainedFraction,
        topBandOpaqueFraction,
        topBandOpaqueLimit: MIN_SHOE_TOP_BAND_OPAQUE_FRACTION,
        topBandRequired,
        topBandRequiredByVisibility,
        topBandExpectedShoeFraction,
        topBandSuppressedByPairOverlap,
        tightCropTransparentFraction,
        tightCropTransparentLimit: MAX_SHOE_TIGHT_CROP_TRANSPARENT_FRACTION,
        tightCropFillFraction,
        shoeBoxUpperThirdPersonMattePixels: upperThird.personMattePixels,
        shoeBoxUpperThirdRetainedPixels: upperThird.retainedPixels,
        shoeBoxUpperThirdRetainedFraction: upperThird.retainedFraction,
        componentBalanceFraction,
        componentBalanceLimit: MIN_SHOE_COMPONENT_BALANCE_FRACTION,
    };
}
/**
 * Connected upper-garment pixels recovered below the fitted seam must occupy a
 * material part of the overlap before the shoe cutout is rejected. Small
 * recovered cuffs are the expected result of staggered hems; rejecting those
 * made a fully visible shoe pair disappear after a successful seam fit.
 */
const MAX_RECOVERED_RESIDUE_FRACTION = 0.12;
const MAX_RECOVERED_RESIDUE_TO_LOWER_FRACTION = 0.5;
/**
 * A deeply interleaved cuff/shoe boundary is identifiable but not truthful to
 * save. In that case the paid-product behaviour is to keep the good garments
 * and ask for a separate shoe photo, never to store a heuristic artifact.
 */
export function evaluateWornPairSaveQuality(seam) {
    const overlapWidth = Math.max(1, seam.overlap.x1 - seam.overlap.x0 + 1);
    const overlapHeight = Math.max(1, seam.overlap.y1 - seam.overlap.y0 + 1);
    const protectedColumnFraction = seam.report.protectedUpperOnlyColumns / overlapWidth;
    const recoveredResidueFraction = seam.report.recoveredUpperResiduePixels / (overlapWidth * overlapHeight);
    let lowerOwnedPixels = 0;
    if (seam.sourceWidth && seam.sourceWidth > 0) {
        for (let y = seam.overlap.y0; y <= seam.overlap.y1; y++) {
            for (let x = seam.overlap.x0; x <= seam.overlap.x1; x++) {
                if (seam.ownership[y * seam.sourceWidth + x] === 1)
                    lowerOwnedPixels++;
            }
        }
    }
    // Older/synthetic reports do not carry a source width. In that case the
    // overlap-area signal remains the only pre-crop gate; output validation runs
    // later on the real PNG candidate.
    const recoveredResidueToLowerFraction = lowerOwnedPixels > 0
        ? seam.report.recoveredUpperResiduePixels /
            (lowerOwnedPixels + seam.report.recoveredUpperResiduePixels)
        : 0;
    // Protected upper-only columns are not contamination: they are columns where
    // the shoe is absent and the safety guard correctly kept a hanging cuff with
    // the trousers. Only a material amount of connected upper fabric recovered
    // from below the seam proves that the pair alternates in 2D and cannot be
    // represented by a clean boundary.
    const interleaved = recoveredResidueFraction >= MAX_RECOVERED_RESIDUE_FRACTION ||
        recoveredResidueToLowerFraction >= MAX_RECOVERED_RESIDUE_TO_LOWER_FRACTION;
    return {
        saveLower: !interleaved,
        reason: interleaved ? "interleaved-pair-boundary" : "clean-pair-seam",
        protectedColumnFraction,
        recoveredResidueFraction,
        recoveredResidueLimit: MAX_RECOVERED_RESIDUE_FRACTION,
        recoveredResidueToLowerFraction,
        recoveredResidueToLowerLimit: MAX_RECOVERED_RESIDUE_TO_LOWER_FRACTION,
    };
}
const BOTTOM_TYPES = new Set([
    "bottom",
    "bottoms",
    "trouser",
    "trousers",
    "pants",
    "jeans",
    "skirt",
    "shorts",
]);
const SHOE_TYPES = new Set([
    "shoe",
    "shoes",
    "footwear",
    "sneaker",
    "sneakers",
    "boots",
    "sandals",
]);
function normalizedType(type) {
    return type.trim().toLowerCase();
}
function pixelBox(region, width, height) {
    if (!Array.isArray(region.boundingBox) || region.boundingBox.length !== 4)
        return null;
    const [ny0, nx0, ny1, nx1] = region.boundingBox.map(Number);
    if (![ny0, nx0, ny1, nx1].every(Number.isFinite))
        return null;
    const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
    return {
        x0: clamp(Math.floor((Math.min(nx0, nx1) / 1000) * width), width - 1),
        y0: clamp(Math.floor((Math.min(ny0, ny1) / 1000) * height), height - 1),
        x1: clamp(Math.ceil((Math.max(nx0, nx1) / 1000) * width) - 1, width - 1),
        y1: clamp(Math.ceil((Math.max(ny0, ny1) / 1000) * height) - 1, height - 1),
    };
}
function intersection(a, b) {
    const overlap = {
        x0: Math.max(a.x0, b.x0),
        y0: Math.max(a.y0, b.y0),
        x1: Math.min(a.x1, b.x1),
        y1: Math.min(a.y1, b.y1),
    };
    return overlap.x1 > overlap.x0 && overlap.y1 > overlap.y0 ? overlap : null;
}
function initialPairOwnership(upper, lower, alpha, width, height) {
    const result = new Int32Array(width * height).fill(-1);
    const x0 = Math.min(upper.x0, lower.x0);
    const y0 = Math.min(upper.y0, lower.y0);
    const x1 = Math.max(upper.x1, lower.x1);
    const y1 = Math.max(upper.y1, lower.y1);
    const overlapTop = Math.max(upper.y0, lower.y0);
    const overlapBottom = Math.min(upper.y1, lower.y1);
    const flatSplit = (overlapTop + overlapBottom) / 2;
    for (let y = y0; y <= y1; y++) {
        const row = y * width;
        for (let x = x0; x <= x1; x++) {
            const pixel = row + x;
            if (alpha[pixel] <= 127)
                continue;
            const inUpper = x >= upper.x0 && x <= upper.x1 && y >= upper.y0 && y <= upper.y1;
            const inLower = x >= lower.x0 && x <= lower.x1 && y >= lower.y0 && y <= lower.y1;
            if (inUpper && inLower)
                result[pixel] = y < flatSplit ? 0 : 1;
            else if (inUpper)
                result[pixel] = 0;
            else if (inLower)
                result[pixel] = 1;
        }
    }
    return result;
}
/**
 * Fit only bottom↔shoe boundaries for the person-first pipeline.
 *
 * A single horizontal row cannot describe a walking or crossed-leg pose. This
 * adapter reuses the established smooth per-column seam resolver, while
 * deliberately leaving top/bottom and every other garment rule unchanged.
 */
export function buildBottomShoePairSeams(regions, photoData, personAlpha, width, height) {
    const boxes = regions.map((region) => pixelBox(region, width, height));
    const candidates = [];
    for (let upperIndex = 0; upperIndex < regions.length; upperIndex++) {
        if (regions[upperIndex].saveWorthy === false)
            continue;
        if (!BOTTOM_TYPES.has(normalizedType(regions[upperIndex].type)))
            continue;
        const upper = boxes[upperIndex];
        if (!upper)
            continue;
        for (let lowerIndex = 0; lowerIndex < regions.length; lowerIndex++) {
            if (regions[lowerIndex].saveWorthy === false)
                continue;
            if (!SHOE_TYPES.has(normalizedType(regions[lowerIndex].type)))
                continue;
            const lower = boxes[lowerIndex];
            if (!lower)
                continue;
            const overlap = intersection(upper, lower);
            if (!overlap)
                continue;
            const upperCentre = (upper.y0 + upper.y1) / 2;
            const lowerCentre = (lower.y0 + lower.y1) / 2;
            if (lowerCentre <= upperCentre)
                continue;
            candidates.push({
                upperIndex,
                lowerIndex,
                overlap,
                score: (overlap.x1 - overlap.x0 + 1) * (overlap.y1 - overlap.y0 + 1),
            });
        }
    }
    // A region belongs to only one fitted pair. Largest overlap wins, which is
    // stable when Gemini happens to return an accessory near the ankles.
    candidates.sort((a, b) => b.score - a.score);
    const usedUpper = new Set();
    const usedLower = new Set();
    const seams = [];
    for (const candidate of candidates) {
        if (usedUpper.has(candidate.upperIndex) || usedLower.has(candidate.lowerIndex))
            continue;
        const upper = boxes[candidate.upperIndex];
        const lower = boxes[candidate.lowerIndex];
        const ownership = initialPairOwnership(upper, lower, personAlpha, width, height);
        const report = resolveGarmentBoundaries(ownership, [upper, lower], [regions[candidate.upperIndex].label, regions[candidate.lowerIndex].label], photoData, personAlpha, width, height, {
            preserveUnsupportedUpperColumns: true,
            recoverConnectedUpperResidue: true,
            maxUpperResidueRecoveryDepth: WORN_SHOE_RESIDUE_RECOVERY_DEPTH,
        });
        const shoeProtection = repairWornShoeUpperOwnership(photoData, personAlpha, width, height, ownership, upper, lower, candidate.overlap);
        seams.push({
            ...candidate,
            ownership,
            report,
            upperBox: upper,
            lowerBox: lower,
            sourceWidth: width,
            shoeProtection,
        });
        usedUpper.add(candidate.upperIndex);
        usedLower.add(candidate.lowerIndex);
    }
    return seams;
}
