// Generated from src/ai/maskPostprocess.ts; see source-manifest.json.
/**
 * maskPostprocess — Phase 6 of the action plan.
 *
 * Applied to every garment mask after the partition (Phase 4) and before the
 * validation gate (Phase 1), in the order the plan specifies:
 *
 *   1. largest connected component — drops hair, lanyards, ID cards, a second
 *      person, the wooden knob mistaken for a shoe
 *   2. interior hole fill — flood from the border, invert, OR back in
 *   3. skin exclusion — YCrCb + HSV, subtracted from alpha. The chroma bounds
 *      are skin-tone agnostic, so it works across Indian skin tones
 *   4. edge-band trim — if the dominant colour of the top/bottom 6% differs
 *      from the garment body beyond a LAB threshold, cut that band (the
 *      jacket hem in the jeans cutout, the sneaker toes)
 *
 * Every step is reversible and guarded: a step that would destroy the garment
 * is skipped and logged rather than applied. Steps 3 and 4 are the aggressive
 * ones, so each has an explicit "did this eat the garment?" check.
 *
 * Pure typed-array work. On-device, no model, no network.
 */
/**
 * sRGB (D65) -> CIE LAB.
 *
 * Deliberately duplicated from `pixelColor.ts` rather than imported: both
 * modules are kept dependency-free so `scripts/extraction-pipeline-scenarios.ts`
 * can load them directly under `node --experimental-strip-types`. The formula
 * is a fixed colorimetric standard, so the two copies cannot drift apart in
 * any meaningful way.
 */
function rgbToLab(r, g, b) {
    const toLinear = (channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const pivot = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
    const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
    const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const FG = 127;
/**
 * Compress an upscaled matte's broad translucent ramp without touching RGB.
 * A controlled feather may be applied afterwards at an ownership seam; this
 * pass is for the soft MODNet fringe around the source silhouette.
 */
export function hardenMatteAlpha(rgba, width, height, low = 64, high = 192) {
    if (low < 0 || high > 255 || high <= low) {
        throw new Error(`Invalid alpha harden range ${low}..${high}`);
    }
    let changedPixels = 0;
    let clearedPixels = 0;
    let solidifiedPixels = 0;
    const pixels = Math.min(width * height, Math.floor(rgba.length / 4));
    for (let pixel = 0; pixel < pixels; pixel++) {
        const index = pixel * 4 + 3;
        const before = rgba[index];
        const after = before <= low
            ? 0
            : before >= high
                ? 255
                : Math.max(0, Math.min(255, Math.round(((before - low) * 255) / (high - low))));
        if (after === before)
            continue;
        rgba[index] = after;
        changedPixels++;
        if (after === 0)
            clearedPixels++;
        else if (after === 255)
            solidifiedPixels++;
    }
    return { changedPixels, clearedPixels, solidifiedPixels };
}
/**
 * Keep at most the largest `maxComponents` alpha islands. A second shoe may be
 * smaller because of perspective, so 15% of the largest is the default. This
 * function never fills holes and therefore cannot bridge the gap between feet.
 */
export function keepLargestAlphaComponents(rgba, width, height, options = {}) {
    const { maxComponents = 2, minRelative = 0.15, threshold = 20, } = options;
    const n = width * height;
    const labels = new Int32Array(n).fill(-1);
    const sizes = [];
    const stack = new Int32Array(n);
    for (let start = 0; start < n; start++) {
        if (rgba[start * 4 + 3] <= threshold || labels[start] !== -1)
            continue;
        const label = sizes.length;
        let top = 0;
        let size = 0;
        stack[top++] = start;
        labels[start] = label;
        while (top > 0) {
            const pixel = stack[--top];
            size++;
            const x = pixel % width;
            const y = (pixel / width) | 0;
            const visit = (next) => {
                if (rgba[next * 4 + 3] <= threshold || labels[next] !== -1)
                    return;
                labels[next] = label;
                stack[top++] = next;
            };
            if (x > 0)
                visit(pixel - 1);
            if (x + 1 < width)
                visit(pixel + 1);
            if (y > 0)
                visit(pixel - width);
            if (y + 1 < height)
                visit(pixel + width);
        }
        sizes.push(size);
    }
    const foregroundPixels = sizes.reduce((sum, size) => sum + size, 0);
    if (sizes.length === 0) {
        return {
            totalComponents: 0,
            keptComponents: 0,
            foregroundPixels: 0,
            keptPixels: 0,
            removedPixels: 0,
            removedFraction: 0,
            keptSizes: [],
        };
    }
    const ranked = sizes
        .map((size, label) => ({ size, label }))
        .sort((a, b) => b.size - a.size);
    const largest = ranked[0].size;
    const kept = ranked
        .filter(({ size }) => size >= largest * minRelative)
        .slice(0, Math.max(1, maxComponents));
    const keepLabels = new Set(kept.map(({ label }) => label));
    let removedPixels = 0;
    for (let pixel = 0; pixel < n; pixel++) {
        const alphaIndex = pixel * 4 + 3;
        if (rgba[alphaIndex] <= threshold)
            continue;
        const label = labels[pixel];
        if (label >= 0 && !keepLabels.has(label)) {
            rgba[alphaIndex] = 0;
            removedPixels++;
        }
    }
    const keptPixels = foregroundPixels - removedPixels;
    return {
        totalComponents: sizes.length,
        keptComponents: kept.length,
        foregroundPixels,
        keptPixels,
        removedPixels,
        removedFraction: removedPixels / Math.max(1, foregroundPixels),
        keptSizes: kept.map(({ size }) => size),
    };
}
/**
 * Morphological opening: erode, then dilate by the same amount.
 *
 * Removes anything thinner than the structuring element while leaving solid
 * regions the size they were. This is what clears the wisps a seam leaves
 * behind — a spike of trouser hanging off a sneaker, a hook of fabric trailing
 * from a hem. Those are 2-4px wide and connected, so component filtering can
 * never touch them; opening deletes them and nothing else.
 *
 * Separable min/max filters, so cost is linear in radius rather than squared.
 */
export function openMask(alpha, width, height, radius) {
    if (radius < 1)
        return 0;
    const n = width * height;
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        solid[i] = alpha[i] > FG ? 1 : 0;
    // Sliding-window counts, so each pass is O(1) per pixel rather than O(radius).
    const span = radius * 2 + 1;
    const pass = (src, erode) => {
        const hit = (count) => (erode ? (count === span ? 1 : 0) : count > 0 ? 1 : 0);
        const horizontal = new Uint8Array(n);
        for (let y = 0; y < height; y++) {
            const row = y * width;
            let count = 0;
            for (let d = -radius; d <= radius; d++) {
                count += src[row + Math.min(width - 1, Math.max(0, d))];
            }
            for (let x = 0; x < width; x++) {
                horizontal[row + x] = hit(count);
                count -= src[row + Math.min(width - 1, Math.max(0, x - radius))];
                count += src[row + Math.min(width - 1, Math.max(0, x + radius + 1))];
            }
        }
        const vertical = new Uint8Array(n);
        for (let x = 0; x < width; x++) {
            let count = 0;
            for (let d = -radius; d <= radius; d++) {
                count += horizontal[Math.min(height - 1, Math.max(0, d)) * width + x];
            }
            for (let y = 0; y < height; y++) {
                vertical[y * width + x] = hit(count);
                count -= horizontal[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
                count += horizontal[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x];
            }
        }
        return vertical;
    };
    const opened = pass(pass(solid, true), false);
    let removed = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] === 0 || opened[i])
            continue;
        // Only clear pixels the opening rejected AND that were solid: the soft
        // edge ramp around a surviving region must stay, or the antialiasing goes
        // with it.
        if (solid[i]) {
            alpha[i] = 0;
            removed++;
        }
    }
    return removed;
}
/** Keep the largest component, plus runners-up big enough to be a real pair. */
export function keepLargestComponents(alpha, width, height, maxComponents) {
    const n = width * height;
    const labels = new Int32Array(n).fill(-1);
    const sizes = [];
    const stack = new Int32Array(n);
    for (let start = 0; start < n; start++) {
        if (alpha[start] <= FG || labels[start] !== -1)
            continue;
        const label = sizes.length;
        let top = 0;
        let size = 0;
        stack[top++] = start;
        labels[start] = label;
        while (top > 0) {
            const p = stack[--top];
            size++;
            const x = p % width;
            const y = (p / width) | 0;
            if (x > 0 && alpha[p - 1] > FG && labels[p - 1] === -1) {
                labels[p - 1] = label;
                stack[top++] = p - 1;
            }
            if (x < width - 1 && alpha[p + 1] > FG && labels[p + 1] === -1) {
                labels[p + 1] = label;
                stack[top++] = p + 1;
            }
            if (y > 0 && alpha[p - width] > FG && labels[p - width] === -1) {
                labels[p - width] = label;
                stack[top++] = p - width;
            }
            if (y < height - 1 && alpha[p + width] > FG && labels[p + width] === -1) {
                labels[p + width] = label;
                stack[top++] = p + width;
            }
        }
        sizes.push(size);
    }
    if (sizes.length === 0)
        return { alpha, kept: 0 };
    const ranked = sizes
        .map((size, label) => ({ size, label }))
        .sort((a, b) => b.size - a.size);
    const largest = ranked[0].size;
    // A second shoe is roughly the size of the first. A lanyard is not.
    const keep = new Set([ranked[0].label]);
    for (let i = 1; i < ranked.length && keep.size < maxComponents; i++) {
        if (ranked[i].size >= largest * 0.3)
            keep.add(ranked[i].label);
    }
    const droppedAComponent = keep.size < sizes.length;
    for (let i = 0; i < n; i++) {
        if (alpha[i] === 0)
            continue;
        const label = labels[i];
        // Soft edge pixels (0 < a <= FG) carry no label; they are kept only when a
        // surviving component is adjacent, which the label test below approximates
        // by clearing anything whose hard core was dropped.
        if (label === -1)
            continue;
        if (!keep.has(label))
            alpha[i] = 0;
    }
    // Drop soft pixels that now float on their own — but ONLY when a component
    // was actually removed. Running this unconditionally truncates every
    // feathered edge to within one pixel of the alpha-127 contour, which undoes
    // the antialiasing and puts back the stair-stepped edge the feathering
    // exists to prevent.
    if (droppedAComponent) {
        for (let i = 0; i < n; i++) {
            if (alpha[i] === 0 || alpha[i] > FG)
                continue;
            const x = i % width;
            const y = (i / width) | 0;
            const near = (x > 0 && alpha[i - 1] > FG) ||
                (x < width - 1 && alpha[i + 1] > FG) ||
                (y > 0 && alpha[i - width] > FG) ||
                (y < height - 1 && alpha[i + width] > FG);
            if (!near)
                alpha[i] = 0;
        }
    }
    return { alpha, kept: keep.size };
}
/** Flood the background from the border; anything unreached is an interior hole. */
export function fillInteriorHoles(alpha, width, height) {
    const n = width * height;
    const outside = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const push = (i) => {
        if (alpha[i] > FG || outside[i])
            return;
        outside[i] = 1;
        queue[tail++] = i;
    };
    for (let x = 0; x < width; x++) {
        push(x);
        push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        push(y * width);
        push(y * width + width - 1);
    }
    while (head < tail) {
        const p = queue[head++];
        const x = p % width;
        const y = (p / width) | 0;
        if (x > 0)
            push(p - 1);
        if (x < width - 1)
            push(p + 1);
        if (y > 0)
            push(p - width);
        if (y < height - 1)
            push(p + width);
    }
    let filled = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] <= FG && !outside[i]) {
            alpha[i] = 255;
            filled++;
        }
    }
    return filled;
}
/**
 * Restore source-coloured pixels inside a horizontal foreground span.
 *
 * A lanyard can make MODNet lose a dark shirt panel that remains connected to
 * the crop's top edge, so ordinary closed-hole filling cannot reach it. For
 * every transparent run between two foreground pixels, compare the source RGB
 * with the run's two garment-coloured boundaries. Only colour-compatible
 * source pixels are restored. This repairs teal-shirt pixels while leaving a
 * light wall between an arm and the torso transparent.
 */
export function fillColorMatchedOpenVoids(rgba, alpha, width, height, maxDeltaE = 38) {
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let filled = 0;
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let x = 0;
        while (x < width) {
            while (x < width && alpha[row + x] > FG)
                x++;
            const runStart = x;
            while (x < width && alpha[row + x] <= FG)
                x++;
            const runEnd = x;
            // The run must have real foreground on both sides. Border background is
            // never repaired, so the output silhouette cannot become a rectangle.
            if (runStart === 0 || runEnd >= width || runEnd <= runStart)
                continue;
            const leftPixel = (row + runStart - 1) * 4;
            const rightPixel = (row + runEnd) * 4;
            const leftLab = rgbToLab(rgba[leftPixel], rgba[leftPixel + 1], rgba[leftPixel + 2]);
            const rightLab = rgbToLab(rgba[rightPixel], rgba[rightPixel + 1], rgba[rightPixel + 2]);
            for (let fillX = runStart; fillX < runEnd; fillX++) {
                const i = row + fillX;
                const p = i * 4;
                const sourceLab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
                if (Math.min(distance(sourceLab, leftLab), distance(sourceLab, rightLab)) <= maxDeltaE) {
                    alpha[i] = 255;
                    filled++;
                }
            }
        }
    }
    return filled;
}
/**
 * Make the detected foreground interior solid without changing its outer edge.
 *
 * Auto Extract is a worn-context crop, not garment inpainting. Once the outer
 * person/held-object silhouette is known, every source pixel inside that
 * silhouette must stay visible: clothing, skin, lanyards, ID cards, flowers,
 * bouquets and anything else the person is holding. Horizontal and vertical
 * span passes close internal matte failures while leaving pixels beyond the
 * detected outer silhouette transparent. RGB is never changed.
 */
export function solidifyForegroundInterior(rgba, width, height, foregroundThreshold = 20) {
    let restored = 0;
    const makeOpaque = (pixel) => {
        const a = pixel * 4 + 3;
        if (rgba[a] === 255)
            return;
        rgba[a] = 255;
        restored++;
    };
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let first = -1;
        let last = -1;
        for (let x = 0; x < width; x++) {
            if (rgba[(row + x) * 4 + 3] <= foregroundThreshold)
                continue;
            if (first < 0)
                first = x;
            last = x;
        }
        if (first < 0 || last <= first)
            continue;
        for (let x = first + 1; x < last; x++)
            makeOpaque(row + x);
    }
    // A whole horizontal band can be weak in a dark garment. The column pass
    // repairs those rows after the horizontal pass establishes the silhouette.
    for (let x = 0; x < width; x++) {
        let first = -1;
        let last = -1;
        for (let y = 0; y < height; y++) {
            if (rgba[(y * width + x) * 4 + 3] <= foregroundThreshold)
                continue;
            if (first < 0)
                first = y;
            last = y;
        }
        if (first < 0 || last <= first)
            continue;
        for (let y = first + 1; y < last; y++)
            makeOpaque(y * width + x);
    }
    return restored;
}
/**
 * Fill only alpha holes that are topologically enclosed by foreground.
 *
 * Unlike `solidifyForegroundInterior`, this never bridges an open concavity
 * between an arm and torso or between a shoulder and the scene. It is the safe
 * preservation operation for a saved worn-garment mask; open background stays
 * connected to the crop border and therefore stays transparent.
 */
export function solidifyClosedForegroundInterior(rgba, width, height) {
    const alpha = new Uint8Array(width * height);
    for (let pixel = 0; pixel < alpha.length; pixel++) {
        alpha[pixel] = rgba[pixel * 4 + 3];
    }
    const filled = fillInteriorHoles(alpha, width, height);
    if (filled === 0)
        return 0;
    for (let pixel = 0; pixel < alpha.length; pixel++) {
        if (alpha[pixel] === 255 && rgba[pixel * 4 + 3] !== 255) {
            rgba[pixel * 4 + 3] = 255;
        }
    }
    return filled;
}
/** A narrow, explicit gate prevents one difficult shirt from changing every image. */
export function shouldSolidifyWornContext(garmentType, obstructionCount, candidateFraction, focusedMatteSelected = false) {
    const type = garmentType.trim().toLowerCase();
    const upperBody = type === "top" || type === "kurta" || type === "traditional wear";
    if (!upperBody)
        return { apply: false, reason: "category-not-upper-body" };
    // A focused crop matte has already re-evaluated the difficult upper body at
    // useful resolution. Running span-based preservation after accepting that
    // matte fills legitimate concavities between the torso, arms and scene and
    // can turn the saved alpha into a rectangle. Preserve the accepted focused
    // silhouette byte-for-byte and use hardening only for its soft edge.
    if (focusedMatteSelected)
        return { apply: false, reason: "focused-matte-preserved" };
    if (obstructionCount < 1)
        return { apply: false, reason: "no-contact-object" };
    if (candidateFraction < 0.005)
        return { apply: false, reason: "matte-already-solid" };
    if (candidateFraction > 0.5)
        return { apply: false, reason: "repair-too-large" };
    return { apply: true, reason: "contact-object-over-upper-body" };
}
/**
 * A very tall screenshot can compress the subject badly in MODNet's square
 * input. Retry one upper-body crop only when the measured matte is damaged;
 * ordinary photos remain single-pass for lower-end-device performance.
 */
export function shouldAttemptFocusedWornMatte(type, obstructionCount, globalRepairFraction, sourceWidth, sourceHeight) {
    const value = type.trim().toLowerCase();
    const upperBody = value === "top" || value === "kurta" || value === "traditional wear" ||
        value === "outerwear" || value === "jacket" || value === "coat";
    if (!upperBody)
        return false;
    if (obstructionCount > 0)
        return globalRepairFraction >= 0.12;
    const shortSide = Math.max(1, Math.min(sourceWidth, sourceHeight));
    const longSide = Math.max(sourceWidth, sourceHeight);
    return longSide / shortSide >= 1.9 && globalRepairFraction >= 0.07;
}
/**
 * Recover garment-coloured source pixels immediately outside a broken matte.
 * Growth is connected, colour-gated and distance-limited, so a missing teal
 * shoulder can return but a white wall or blue window cannot become foreground.
 * RGB remains byte-for-byte unchanged; only alpha is restored.
 */
export function recoverColorConnectedForeground(rgba, width, height, referenceColors, maxSteps, maxDeltaE = 32, foregroundThreshold = 20) {
    if (referenceColors.length === 0 || maxSteps < 1)
        return 0;
    const n = width * height;
    const unseen = 0xffff;
    const distanceFromSeed = new Uint16Array(n);
    distanceFromSeed.fill(unseen);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const referenceLabs = referenceColors.map(([r, g, b]) => rgbToLab(r, g, b));
    for (let i = 0; i < n; i++) {
        if (rgba[i * 4 + 3] <= foregroundThreshold)
            continue;
        distanceFromSeed[i] = 0;
        queue[tail++] = i;
    }
    const matchesGarment = (pixel) => {
        const p = pixel * 4;
        const lab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
        return referenceLabs.some((reference) => Math.hypot(lab[0] - reference[0], lab[1] - reference[1], lab[2] - reference[2]) <= maxDeltaE);
    };
    let recovered = 0;
    while (head < tail) {
        const pixel = queue[head++];
        const nextDistance = distanceFromSeed[pixel] + 1;
        if (nextDistance > maxSteps)
            continue;
        const x = pixel % width;
        const y = (pixel / width) | 0;
        const neighbors = [
            x > 0 ? pixel - 1 : -1,
            x < width - 1 ? pixel + 1 : -1,
            y > 0 ? pixel - width : -1,
            y < height - 1 ? pixel + width : -1,
        ];
        for (const neighbor of neighbors) {
            if (neighbor < 0 || distanceFromSeed[neighbor] !== unseen)
                continue;
            if (!matchesGarment(neighbor))
                continue;
            distanceFromSeed[neighbor] = nextDistance;
            const alphaIndex = neighbor * 4 + 3;
            if (rgba[alphaIndex] <= foregroundThreshold)
                recovered++;
            rgba[alphaIndex] = 255;
            queue[tail++] = neighbor;
        }
    }
    return recovered;
}
/**
 * Repair a dark flat-lay garment that a saliency model split at a fold or on
 * a patterned surface. Growth starts only from the already-selected garment,
 * follows source colours represented inside that garment, and is additionally
 * gated by the model's weak alpha unless the colour match is nearly exact.
 *
 * This is intentionally restricted to dark garments. Pale/colourful fabric
 * needs a different ambiguity policy because a bedspread can share those
 * colours over a large connected area. Only `mask` is mutated; source RGB and
 * the model alpha remain byte-for-byte unchanged.
 */
export function recoverDarkConnectedGarment(rgba, width, height, modelAlpha, mask) {
    const n = width * height;
    const empty = (reason, seedPixels = 0, seedLuminance75 = 0, seedLuminance90 = 0, paletteSize = 0) => ({
        applied: false,
        reason,
        seedPixels,
        recoveredPixels: 0,
        recoveredFractionOfSeed: 0,
        seedLuminance75,
        seedLuminance90,
        paletteSize,
    });
    if (n < 1 || modelAlpha.length < n || mask.length < n || rgba.length < n * 4) {
        return empty("too-few-seeds");
    }
    const luminanceHistogram = new Uint32Array(256);
    const bins = new Map();
    let seedPixels = 0;
    let confidentSeeds = 0;
    for (let pixel = 0; pixel < n; pixel++) {
        if (!mask[pixel])
            continue;
        seedPixels++;
        const p = pixel * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        const luminance = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
        luminanceHistogram[luminance]++;
        if (modelAlpha[pixel] < 150)
            continue;
        confidentSeeds++;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        bin.count++;
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bins.set(key, bin);
    }
    const minimumSeeds = Math.max(80, Math.round(n * 0.002));
    if (seedPixels < minimumSeeds || confidentSeeds < Math.max(40, minimumSeeds >> 1)) {
        return empty("too-few-seeds", seedPixels);
    }
    const quantile = (fraction) => {
        const target = Math.ceil(seedPixels * fraction);
        let cumulative = 0;
        for (let value = 0; value < luminanceHistogram.length; value++) {
            cumulative += luminanceHistogram[value];
            if (cumulative >= target)
                return value;
        }
        return 255;
    };
    const seedLuminance75 = quantile(0.75);
    const seedLuminance90 = quantile(0.90);
    if (seedLuminance75 > 112) {
        return empty("not-dark", seedPixels, seedLuminance75, seedLuminance90);
    }
    const referenceColors = [...bins.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((bin) => [
        Math.round(bin.r / bin.count),
        Math.round(bin.g / bin.count),
        Math.round(bin.b / bin.count),
    ]);
    if (referenceColors.length === 0) {
        return empty("too-few-seeds", seedPixels, seedLuminance75, seedLuminance90);
    }
    const referenceLabs = referenceColors.map(([r, g, b]) => rgbToLab(r, g, b));
    const luminanceLimit = Math.min(150, seedLuminance90 + 34);
    const original = mask.slice();
    const visited = mask.slice();
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (let pixel = 0; pixel < n; pixel++) {
        if (mask[pixel])
            queue[tail++] = pixel;
    }
    let recoveredPixels = 0;
    const maximumRecovered = Math.min(Math.round(n * 0.30), Math.max(180, Math.round(seedPixels * 1.10)));
    const canRecover = (pixel) => {
        const p = pixel * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luminance > luminanceLimit)
            return false;
        const lab = rgbToLab(r, g, b);
        let bestDelta = Infinity;
        for (const reference of referenceLabs) {
            bestDelta = Math.min(bestDelta, Math.hypot(lab[0] - reference[0], lab[1] - reference[1], lab[2] - reference[2]));
        }
        if (bestDelta > 22)
            return false;
        // A weak saliency trace is enough to follow the missing leg. With no
        // model support at all, require a near-exact fabric colour match.
        return modelAlpha[pixel] >= 8 || bestDelta <= 9;
    };
    while (head < tail) {
        const pixel = queue[head++];
        const x = pixel % width;
        const y = (pixel / width) | 0;
        const visit = (neighbor) => {
            if (visited[neighbor])
                return;
            visited[neighbor] = 1;
            if (!canRecover(neighbor))
                return;
            mask[neighbor] = 1;
            queue[tail++] = neighbor;
            recoveredPixels++;
        };
        if (x > 0)
            visit(pixel - 1);
        if (x + 1 < width)
            visit(pixel + 1);
        if (y > 0)
            visit(pixel - width);
        if (y + 1 < height)
            visit(pixel + width);
        if (recoveredPixels > maximumRecovered) {
            mask.set(original);
            return empty("overgrowth", seedPixels, seedLuminance75, seedLuminance90, referenceColors.length);
        }
    }
    return {
        applied: recoveredPixels > 0,
        reason: "recovered",
        seedPixels,
        recoveredPixels,
        recoveredFractionOfSeed: recoveredPixels / Math.max(1, seedPixels),
        seedLuminance75,
        seedLuminance90,
        paletteSize: referenceColors.length,
    };
}
/**
 * Smooth short inward notches in the left/right foreground outline.
 * Unlike colour growth this never follows a background region: every row may
 * expand only toward the median boundary of nearby rows, by a small fixed cap.
 */
export function recoverBoundaryNotches(rgba, width, height, windowRadius, maxExpansion, foregroundThreshold = 20) {
    const left = new Int32Array(height).fill(-1);
    const right = new Int32Array(height).fill(-1);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            if (rgba[(row + x) * 4 + 3] <= foregroundThreshold)
                continue;
            if (left[y] < 0)
                left[y] = x;
            right[y] = x;
        }
    }
    const medianNear = (values, y) => {
        const found = [];
        for (let yy = Math.max(0, y - windowRadius); yy <= Math.min(height - 1, y + windowRadius); yy++) {
            if (values[yy] >= 0)
                found.push(values[yy]);
        }
        if (found.length < 5)
            return -1;
        found.sort((a, b) => a - b);
        return found[(found.length / 2) | 0];
    };
    let recovered = 0;
    const original = rgba.slice();
    for (let y = 0; y < height; y++) {
        if (left[y] < 0 || right[y] <= left[y])
            continue;
        const medianLeft = medianNear(left, y);
        const medianRight = medianNear(right, y);
        const targetLeft = medianLeft >= 0 && left[y] - medianLeft >= 4
            ? Math.max(0, left[y] - Math.min(maxExpansion, left[y] - medianLeft))
            : left[y];
        const targetRight = medianRight >= 0 && medianRight - right[y] >= 4
            ? Math.min(width - 1, right[y] + Math.min(maxExpansion, medianRight - right[y]))
            : right[y];
        const leftSpan = left[y] - targetLeft;
        for (let x = targetLeft; x < left[y]; x++) {
            const alpha = Math.round(255 * ((x - targetLeft + 1) / Math.max(1, leftSpan + 1)));
            const a = (y * width + x) * 4 + 3;
            if (original[a] <= foregroundThreshold)
                recovered++;
            rgba[a] = Math.max(rgba[a], alpha);
        }
        const rightSpan = targetRight - right[y];
        for (let x = right[y] + 1; x <= targetRight; x++) {
            const alpha = Math.round(255 * ((targetRight - x + 1) / Math.max(1, rightSpan + 1)));
            const a = (y * width + x) * 4 + 3;
            if (original[a] <= foregroundThreshold)
                recovered++;
            rgba[a] = Math.max(rgba[a], alpha);
        }
    }
    return recovered;
}
/**
 * Skin test. YCrCb chroma bounds plus an HSV hue window; both must agree.
 *
 * Requiring agreement is deliberate: YCrCb alone flags beige, tan, camel and
 * cream fabric, which is a large share of the wardrobe. The chroma bounds
 * themselves are luminance-independent, so the test does not favour any skin
 * tone.
 */
export function isSkinPixel(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cr = (r - y) * 0.713 + 128;
    const cb = (b - y) * 0.564 + 128;
    const chroma = cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127;
    if (!chroma)
        return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0)
        return false;
    const saturation = (max - min) / max;
    if (saturation < 0.15 || saturation > 0.68)
        return false;
    if (max < 45)
        return false; // deep shadow: unknowable, keep it
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
        if (max === r)
            hue = 60 * (((g - b) / delta) % 6);
        else if (max === g)
            hue = 60 * ((b - r) / delta + 2);
        else
            hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0)
        hue += 360;
    return hue <= 45 || hue >= 335;
}
/**
 * Subtract skin from the mask, unless doing so would eat the garment.
 *
 * The revert threshold matters: a tan trench coat, a beige kurta or a cream
 * saree reads as skin to any chroma test. Removing a third of the item is
 * never a correct outcome, so the whole step is undone in that case.
 */
export function excludeSkinFromAlpha(rgba, alpha, width, height) {
    const n = width * height;
    let foreground = 0;
    for (let i = 0; i < n; i++)
        if (alpha[i] > FG)
            foreground++;
    if (foreground === 0)
        return { removed: 0, reverted: false };
    const marked = new Uint8Array(n);
    let removed = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] <= FG)
            continue;
        const p = i * 4;
        if (isSkinPixel(rgba[p], rgba[p + 1], rgba[p + 2])) {
            marked[i] = 1;
            removed++;
        }
    }
    if (removed / foreground > 0.35)
        return { removed: 0, reverted: true };
    for (let i = 0; i < n; i++)
        if (marked[i])
            alpha[i] = 0;
    return { removed, reverted: false };
}
function meanLabOfRows(rgba, alpha, width, y0, y1) {
    let l = 0;
    let a = 0;
    let bb = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (alpha[i] <= FG)
                continue;
            const p = i * 4;
            const lab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
            l += lab[0];
            a += lab[1];
            bb += lab[2];
            count++;
        }
    }
    if (count === 0)
        return { lab: [0, 0, 0], count: 0 };
    return { lab: [l / count, a / count, bb / count], count };
}
/**
 * Cut a top/bottom band whose colour does not belong to the garment body.
 *
 * Guarded twice: the band must be a minority of the foreground (so a two-tone
 * garment is never cut in half), and the colour difference must be large.
 */
export function trimEdgeBands(rgba, alpha, width, height) {
    const band = Math.max(2, Math.round(height * 0.06));
    if (height < band * 6)
        return { top: false, bottom: false };
    const body = meanLabOfRows(rgba, alpha, width, band, height - band);
    if (body.count < 200)
        return { top: false, bottom: false };
    const DELTA = 20;
    const result = { top: false, bottom: false };
    const topBand = meanLabOfRows(rgba, alpha, width, 0, band);
    if (topBand.count > 0 && topBand.count < body.count * 0.25) {
        const delta = Math.hypot(topBand.lab[0] - body.lab[0], topBand.lab[1] - body.lab[1], topBand.lab[2] - body.lab[2]);
        if (delta > DELTA) {
            for (let i = 0; i < band * width; i++)
                alpha[i] = 0;
            result.top = true;
        }
    }
    const bottomBand = meanLabOfRows(rgba, alpha, width, height - band, height);
    if (bottomBand.count > 0 && bottomBand.count < body.count * 0.25) {
        const delta = Math.hypot(bottomBand.lab[0] - body.lab[0], bottomBand.lab[1] - body.lab[1], bottomBand.lab[2] - body.lab[2]);
        if (delta > DELTA) {
            for (let i = (height - band) * width; i < height * width; i++)
                alpha[i] = 0;
            result.bottom = true;
        }
    }
    return result;
}
/** Run the four steps in the plan's order. Mutates `alpha` in place. */
export function postprocessMask(rgba, alpha, width, height, options = {}) {
    const { maxComponents = 1, openRadius = 2, excludeSkin = true, trimEdges = true, label = "garment", } = options;
    // Wisps first: a 3px tendril is connected to the garment, so component
    // filtering can never reach it, and once it is gone the component sizes are
    // the real ones.
    const opened = openMask(alpha, width, height, openRadius);
    const { kept } = keepLargestComponents(alpha, width, height, maxComponents);
    const filledHoles = fillInteriorHoles(alpha, width, height);
    const skin = excludeSkin
        ? excludeSkinFromAlpha(rgba, alpha, width, height)
        : { removed: 0, reverted: false };
    const trimmed = trimEdges
        ? trimEdgeBands(rgba, alpha, width, height)
        : { top: false, bottom: false };
    const report = {
        opened,
        keptComponents: kept,
        filledHoles,
        skinRemoved: skin.removed,
        skinReverted: skin.reverted,
        trimmedTop: trimmed.top,
        trimmedBottom: trimmed.bottom,
    };
    console.log(`[postprocess] ${label}: wisps ${opened}px, components ${kept}, holes filled ${filledHoles}, ` +
        `skin ${skin.reverted ? "reverted (would remove >35%)" : `${skin.removed}px`}, ` +
        `bands ${trimmed.top ? "top " : ""}${trimmed.bottom ? "bottom" : ""}${!trimmed.top && !trimmed.bottom ? "none" : ""}`);
    return report;
}
