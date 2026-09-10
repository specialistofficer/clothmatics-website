// Generated from src/ai/extractionValidator.ts; see source-manifest.json.
/**
 * extractionValidator — Phase 1 of the action plan.
 *
 * "Highest trust-per-hour of anything here. Builds nothing; only stops lying."
 *
 * Four numbers are computed on every alpha channel before a reveal card is
 * rendered. A cutout that fails any of them is NOT announced as ready: it is
 * moved into the "Couldn't extract" group, unselected, and the user saves the
 * rest.
 *
 *   coverage   = fgPixels / bboxArea
 *   components = connected components larger than 2% of the foreground
 *   aspect     = bboxWidth / bboxHeight
 *   holeRatio  = (filledArea - fgArea) / filledArea
 *
 * Everything is a plain pass over a Uint8Array. No model, no network.
 */
const FG = 127;
/** A pair (shoes, gloves, earrings) is legitimately two blobs. */
const PAIR_TYPES = new Set(["shoes", "shoe", "footwear", "sandals", "gloves", "earrings"]);
/**
 * Components allowed for this garment type before the cutout counts as
 * fragmented. The plan's blunt `components >= 2` rule would reject every pair
 * of shoes, which is a real, correct output — the existing pipeline goes out
 * of its way to protect shoe pairs. Pairs get 2; everything else gets 1.
 */
export function allowedComponents(type) {
    return PAIR_TYPES.has(type.trim().toLowerCase()) ? 2 : 1;
}
/**
 * Measure an alpha channel. Returns null when there is no foreground at all.
 *
 * `deliberateHoles` is the number of pixels a previous step removed ON PURPOSE
 * — skin exclusion punching out a face or a hand. Those gaps are the pipeline
 * working correctly, so they must not be counted as a garment "punched
 * through" and get the cutout rejected.
 */
export function measureAlpha(alpha, width, height, deliberateHoles = 0) {
    const n = width * height;
    const fg = new Uint8Array(n);
    let fgPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < n; i++) {
        if (alpha[i] <= FG)
            continue;
        fg[i] = 1;
        fgPixels++;
        const x = i % width;
        const y = (i / width) | 0;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    if (fgPixels === 0 || maxX < 0)
        return null;
    const bboxWidth = maxX - minX + 1;
    const bboxHeight = maxY - minY + 1;
    const coverage = fgPixels / (bboxWidth * bboxHeight);
    const aspect = bboxWidth / bboxHeight;
    // Connected components (4-neighbour, iterative — recursion blows the stack
    // on a full-resolution mask).
    const minComponent = Math.max(1, Math.round(fgPixels * 0.02));
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    let components = 0;
    for (let start = 0; start < n; start++) {
        if (!fg[start] || seen[start])
            continue;
        let head = 0;
        let tail = 0;
        let size = 0;
        seen[start] = 1;
        queue[tail++] = start;
        while (head < tail) {
            const p = queue[head++];
            size++;
            const x = p % width;
            const y = (p / width) | 0;
            if (x > 0 && fg[p - 1] && !seen[p - 1]) {
                seen[p - 1] = 1;
                queue[tail++] = p - 1;
            }
            if (x < width - 1 && fg[p + 1] && !seen[p + 1]) {
                seen[p + 1] = 1;
                queue[tail++] = p + 1;
            }
            if (y > 0 && fg[p - width] && !seen[p - width]) {
                seen[p - width] = 1;
                queue[tail++] = p - width;
            }
            if (y < height - 1 && fg[p + width] && !seen[p + width]) {
                seen[p + width] = 1;
                queue[tail++] = p + width;
            }
        }
        if (size >= minComponent)
            components++;
    }
    // Holes: flood the background inward from the border. Background pixels the
    // flood never reaches are enclosed by the garment — the "missing chest".
    const outside = new Uint8Array(n);
    let qHead = 0;
    let qTail = 0;
    const push = (i) => {
        if (fg[i] || outside[i])
            return;
        outside[i] = 1;
        queue[qTail++] = i;
    };
    for (let x = 0; x < width; x++) {
        push(x);
        push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        push(y * width);
        push(y * width + width - 1);
    }
    while (qHead < qTail) {
        const p = queue[qHead++];
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
    let holes = 0;
    for (let i = 0; i < n; i++)
        if (!fg[i] && !outside[i])
            holes++;
    const filledArea = fgPixels + holes;
    const countedHoles = Math.max(0, holes - deliberateHoles);
    const holeRatio = filledArea > 0 ? countedHoles / filledArea : 0;
    // How much of the outline is a straight cut along the crop border?
    let outlinePixels = 0;
    let borderOutline = 0;
    for (let i = 0; i < n; i++) {
        if (!fg[i])
            continue;
        const x = i % width;
        const y = (i / width) | 0;
        const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        const touchesBackground = (x > 0 && !fg[i - 1]) ||
            (x < width - 1 && !fg[i + 1]) ||
            (y > 0 && !fg[i - width]) ||
            (y < height - 1 && !fg[i + width]);
        if (!onBorder && !touchesBackground)
            continue;
        outlinePixels++;
        if (onBorder)
            borderOutline++;
    }
    const boxEdgeRatio = outlinePixels > 0 ? borderOutline / outlinePixels : 0;
    return {
        fgPixels, coverage, components, aspect, holeRatio, boxEdgeRatio,
        bboxWidth, bboxHeight,
    };
}
export function validateMetrics(metrics, type = "", options = {}) {
    const maxComponents = allowedComponents(type);
    if (metrics.coverage > 0.95) {
        return {
            ok: false,
            code: "background_kept",
            message: "The background was not removed from this item.",
            metrics,
        };
    }
    if (metrics.coverage < 0.05) {
        return {
            ok: false,
            code: "nothing_survived",
            message: "Almost nothing of this garment survived the cutout.",
            metrics,
        };
    }
    if (metrics.components > maxComponents) {
        return {
            ok: false,
            code: "fragmented",
            message: "This cutout came out in disconnected pieces.",
            metrics,
        };
    }
    if (metrics.aspect > 5 || metrics.aspect < 0.2) {
        return {
            ok: false,
            code: "sliver",
            message: "Only a thin sliver of this garment was isolated.",
            metrics,
        };
    }
    if (metrics.holeRatio > 0.15) {
        return {
            ok: false,
            code: "punched_through",
            message: "Part of the garment body is missing from the cutout.",
            metrics,
        };
    }
    // Most of the outline is the box edge: this is a rectangular slice of the
    // person, not a garment shape. Threshold tuned against one measured run
    // (a whole-person "shirt" scored far above it, a real jacket well below).
    // Re-check it against the nine regression images before trusting it further.
    if (options.hadNeighbour && metrics.boxEdgeRatio > 0.6) {
        return {
            ok: false,
            code: "box_shaped",
            message: "This came out as a rectangular crop of the photo, not a garment.",
            metrics,
        };
    }
    return { ok: true, metrics };
}
/** Convenience: measure + validate in one call. */
export function validateAlpha(alpha, width, height, type = "", deliberateHoles = 0, options = {}) {
    const metrics = measureAlpha(alpha, width, height, deliberateHoles);
    if (!metrics) {
        return {
            ok: false,
            code: "nothing_survived",
            message: "Almost nothing of this garment survived the cutout.",
            metrics: {
                fgPixels: 0, coverage: 0, components: 0, aspect: 1,
                holeRatio: 0, boxEdgeRatio: 0, bboxWidth: 0, bboxHeight: 0,
            },
        };
    }
    return validateMetrics(metrics, type, options);
}
/**
 * Did MODNet find ANY subject at all?
 *
 * The only question this answers is "should we abandon the portrait model and
 * use generic saliency instead". That is a drastic switch — u2netp has no idea
 * what a person is — so the bar to trigger it must be a matte that is
 * essentially EMPTY, which is what MODNet returns for a flat-lay or a hanger
 * shot.
 *
 * An earlier version also required one component to hold 80% of the
 * foreground. That was wrong and it cost a real photo: an office background
 * with a desk and a bin left MODNet with a few extra blobs, the check said
 * "no person", and the whole extraction fell through to saliency. Fragments
 * are a cleanup problem (`keepDominantSubject`), never a reason to change
 * engine.
 *
 * Deliberately permissive about SHAPE too: a saree, a lehenga or a gown is a
 * broad silhouette and must still count as a person.
 */
export function looksLikePersonMatte(alpha, width, height) {
    const n = width * height;
    let covered = 0;
    for (let i = 0; i < n; i++)
        if (alpha[i] > FG)
            covered++;
    const coverage = covered / n;
    if (coverage >= 0.03)
        return true;
    console.log(`[matte] MODNet coverage ${(coverage * 100).toFixed(1)}% — no subject`);
    return false;
}
/**
 * Drop stray blobs from a person matte, keeping the body.
 *
 * A busy room gives MODNet the odd extra fragment — a bin bag beside the leg,
 * a chair edge, a poster. Components under 12% of the largest are scene, not
 * subject. The threshold is generous on purpose: a matte can legitimately
 * break at the ankles, and losing the shoes would be worse than keeping a bin.
 */
export function keepDominantSubject(alpha, width, height) {
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
    if (sizes.length <= 1)
        return 0;
    const largest = Math.max(...sizes);
    const keep = sizes.map((size) => size >= largest * 0.12);
    let removed = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] === 0)
            continue;
        const label = labels[i];
        if (label >= 0 && !keep[label]) {
            alpha[i] = 0;
            removed++;
        }
    }
    return removed;
}
/** Extract the alpha channel of an RGBA buffer (for validating a finished cutout). */
export function alphaOf(rgba, pixels) {
    const alpha = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++)
        alpha[i] = rgba[i * 4 + 3];
    return alpha;
}
export function describeMetrics(metrics) {
    return (`coverage ${(metrics.coverage * 100).toFixed(1)}% ` +
        `components ${metrics.components} ` +
        `aspect ${metrics.aspect.toFixed(2)} ` +
        `holes ${(metrics.holeRatio * 100).toFixed(1)}% ` +
        `boxEdge ${(metrics.boxEdgeRatio * 100).toFixed(1)}%`);
}
