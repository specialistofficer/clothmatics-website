// Generated from src/ai/pixelColor.ts; see source-manifest.json.
/**
 * pixelColor — Phase 2b of the action plan: colour is a MEASUREMENT.
 *
 * A VLM reads an ombre saree differently on every run because satin highlights
 * and shadows dominate the image statistics. The plan's fix, implemented here:
 *
 *   1. mask to alpha > 0.5
 *   2. drop specular highlights and deep shadows — keep V in 90..225, S > 70
 *   3. k-means (k = 4) in LAB space, not RGB
 *   4. map each centroid to the nearest palette entry by LAB distance
 *   5. largest cluster -> primaryColor; clusters above 10% -> secondaryColors
 *   6. two dominant hues with a smooth gradient between them -> "Ombre"
 *
 * Deterministic by construction: fixed sampling stride, fixed k-means++ seed,
 * fixed iteration count. The same image gives the same answer on every run,
 * which is the plan's acceptance criterion.
 *
 * Runs entirely on-device on a typed array. No model, no network.
 */
/**
 * Fixed Indian textile palette from the plan, plus the neutral and basic names
 * the wardrobe already uses (`src/utils/colorName.ts`). Without the basics an
 * all-black outfit would be forced onto "Wine" or "Bottle Green", which is a
 * worse answer than the VLM gave.
 */
const PALETTE = [
    // --- the plan's ethnic-wear palette ---
    ["Rani Pink", [227, 27, 109]],
    ["Magenta", [206, 29, 141]],
    ["Gulabi", [241, 150, 180]],
    ["Maroon", [112, 25, 38]],
    ["Wine", [94, 32, 40]],
    ["Purple", [116, 71, 161]],
    ["Violet", [138, 79, 211]],
    ["Mustard", [183, 139, 16]],
    ["Gold", [205, 166, 49]],
    ["Ochre", [199, 123, 31]],
    ["Mehendi Green", [138, 154, 59]],
    ["Olive", [110, 112, 36]],
    ["Bottle Green", [20, 69, 47]],
    ["Firozi", [46, 196, 182]],
    ["Peacock Blue", [18, 101, 126]],
    ["Navy Blue", [25, 48, 94]],
    ["Ivory", [245, 240, 225]],
    ["Beige", [220, 202, 166]],
    ["Cream", [250, 240, 210]],
    ["Rust", [168, 65, 42]],
    ["Coral", [242, 112, 95]],
    // --- neutrals and basics already in the wardrobe vocabulary ---
    ["Black", [18, 18, 18]],
    ["Charcoal", [58, 58, 58]],
    ["Grey", [128, 128, 128]],
    ["Silver", [192, 192, 192]],
    ["White", [245, 245, 245]],
    ["Brown", [108, 67, 38]],
    ["Tan", [190, 145, 94]],
    ["Khaki", [181, 165, 122]],
    ["Red", [200, 42, 42]],
    ["Orange", [233, 126, 35]],
    ["Yellow", [237, 202, 48]],
    ["Green", [50, 132, 67]],
    ["Teal", [24, 128, 128]],
    ["Blue", [52, 105, 190]],
    ["Sky Blue", [127, 184, 227]],
    ["Denim Blue", [74, 106, 138]],
    ["Lavender", [182, 155, 211]],
    ["Pink", [230, 124, 154]],
];
function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function pivot(t) {
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
export function rgbToLab(r, g, b) {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    // sRGB D65 -> XYZ, normalised by the D65 white point.
    const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
    const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
    const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const PALETTE_LAB = PALETTE.map(([name, [r, g, b]]) => [name, rgbToLab(r, g, b)]);
function labDistance(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
/** Nearest palette name to a LAB colour. */
export function nearestPaletteName(lab) {
    let best = PALETTE_LAB[0][0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [name, entry] of PALETTE_LAB) {
        const d = labDistance(lab, entry);
        if (d < bestDistance) {
            bestDistance = d;
            best = name;
        }
    }
    return best;
}
/** Largest number of pixels the k-means is allowed to see (keeps it ~instant). */
const MAX_SAMPLES = 20000;
/** Deterministic PRNG so k-means++ picks the same seeds on every run. */
function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function collectSamples(rgba, width, height) {
    const total = width * height;
    const stride = Math.max(1, Math.floor(total / MAX_SAMPLES));
    const strict = [];
    const relaxed = [];
    for (let i = 0; i < total; i += stride) {
        const p = i * 4;
        if (rgba[p + 3] <= 127)
            continue; // step 1: alpha > 0.5
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max; // HSV value, 0..255
        const s = max === 0 ? 0 : ((max - min) * 255) / max; // HSV saturation, 0..255
        const sample = {
            lab: rgbToLab(r, g, b),
            rgb: [r, g, b],
            x: i % width,
            y: (i / width) | 0,
        };
        relaxed.push(sample);
        // Step 2: drop specular highlights and deep shadows.
        if (v >= 90 && v <= 225 && s > 70)
            strict.push(sample);
    }
    // A genuinely black, white, ivory or grey garment has S <= 70 everywhere.
    // Relaxing there is not a failure of the filter, it is the filter doing its
    // job on an achromatic fabric — measure those pixels instead of returning
    // nothing.
    const enough = Math.max(150, Math.round(relaxed.length * 0.15));
    if (strict.length >= enough)
        return { samples: strict, filtered: true };
    return { samples: relaxed, filtered: false };
}
function kmeans(samples, k) {
    const n = samples.length;
    const realK = Math.min(k, n);
    const random = makeRandom(0x5eed_1234);
    // k-means++ seeding (deterministic PRNG -> reproducible result).
    const centroids = [samples[Math.floor(random() * n) % n].lab];
    const best = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
    while (centroids.length < realK) {
        let sum = 0;
        const last = centroids[centroids.length - 1];
        for (let i = 0; i < n; i++) {
            const d = labDistance(samples[i].lab, last);
            if (d < best[i])
                best[i] = d;
            sum += best[i];
        }
        if (sum <= 0)
            break;
        let target = random() * sum;
        let picked = n - 1;
        for (let i = 0; i < n; i++) {
            target -= best[i];
            if (target <= 0) {
                picked = i;
                break;
            }
        }
        centroids.push(samples[picked].lab);
    }
    const assignment = new Int32Array(n).fill(-1);
    for (let iteration = 0; iteration < 15; iteration++) {
        let moved = false;
        for (let i = 0; i < n; i++) {
            let bestIndex = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let c = 0; c < centroids.length; c++) {
                const d = labDistance(samples[i].lab, centroids[c]);
                if (d < bestDistance) {
                    bestDistance = d;
                    bestIndex = c;
                }
            }
            if (assignment[i] !== bestIndex) {
                assignment[i] = bestIndex;
                moved = true;
            }
        }
        if (!moved)
            break;
        const sums = centroids.map(() => [0, 0, 0, 0]);
        for (let i = 0; i < n; i++) {
            const acc = sums[assignment[i]];
            acc[0] += samples[i].lab[0];
            acc[1] += samples[i].lab[1];
            acc[2] += samples[i].lab[2];
            acc[3]++;
        }
        for (let c = 0; c < centroids.length; c++) {
            const acc = sums[c];
            if (acc[3] === 0)
                continue;
            centroids[c] = [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]];
        }
    }
    const clusters = centroids.map((centroid) => ({
        centroid,
        rgb: [0, 0, 0],
        members: [],
    }));
    const rgbSums = centroids.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
        const c = assignment[i];
        clusters[c].members.push(i);
        rgbSums[c][0] += samples[i].rgb[0];
        rgbSums[c][1] += samples[i].rgb[1];
        rgbSums[c][2] += samples[i].rgb[2];
    }
    for (let c = 0; c < clusters.length; c++) {
        const count = clusters[c].members.length || 1;
        clusters[c].rgb = [
            Math.round(rgbSums[c][0] / count),
            Math.round(rgbSums[c][1] / count),
            Math.round(rgbSums[c][2] / count),
        ];
    }
    return clusters.filter((cluster) => cluster.members.length > 0);
}
/**
 * Step 6: two dominant hues with a smooth spatial gradient between them.
 *
 * Project every sample onto the axis joining the two centroids, then correlate
 * that projection with the pixel's position. A real ombre gives a strong
 * correlation along one axis (usually vertical); a two-colour print gives
 * none, because its two colours are interleaved everywhere.
 */
function looksOmbre(samples, a, b) {
    const axis = [
        b.centroid[0] - a.centroid[0],
        b.centroid[1] - a.centroid[1],
        b.centroid[2] - a.centroid[2],
    ];
    const axisLength = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
    if (axisLength < 400)
        return false; // centroids too close: one colour, not two
    const indices = [...a.members, ...b.members];
    if (indices.length < 200)
        return false;
    const projections = [];
    const xs = [];
    const ys = [];
    for (const i of indices) {
        const s = samples[i];
        const t = ((s.lab[0] - a.centroid[0]) * axis[0] +
            (s.lab[1] - a.centroid[1]) * axis[1] +
            (s.lab[2] - a.centroid[2]) * axis[2]) /
            axisLength;
        projections.push(t);
        xs.push(s.x);
        ys.push(s.y);
    }
    return Math.abs(pearson(projections, ys)) >= 0.5 || Math.abs(pearson(projections, xs)) >= 0.5;
}
function pearson(a, b) {
    const n = a.length;
    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < n; i++) {
        sumA += a[i];
        sumB += b[i];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - meanA;
        const db = b[i] - meanB;
        cov += da * db;
        varA += da * da;
        varB += db * db;
    }
    if (varA <= 0 || varB <= 0)
        return 0;
    return cov / Math.sqrt(varA * varB);
}
/**
 * Measure the colour of one garment cutout.
 *
 * `rgba` must be a straight (non-premultiplied) RGBA buffer — exactly what the
 * extraction pipeline holds before it encodes the PNG.
 */
export function measureGarmentColor(rgba, width, height) {
    const { samples, filtered } = collectSamples(rgba, width, height);
    if (samples.length < 40)
        return null;
    const clusters = kmeans(samples, 4).sort((a, b) => b.members.length - a.members.length);
    if (clusters.length === 0)
        return null;
    const merged = new Map();
    for (const cluster of clusters) {
        const name = nearestPaletteName(cluster.centroid);
        const existing = merged.get(name);
        if (!existing) {
            merged.set(name, {
                count: cluster.members.length,
                rgb: cluster.rgb,
                centroid: cluster.centroid,
                members: [...cluster.members],
            });
            continue;
        }
        // Weighted mean keeps the group's centroid representative of all its parts.
        const total = existing.count + cluster.members.length;
        existing.centroid = [
            (existing.centroid[0] * existing.count + cluster.centroid[0] * cluster.members.length) / total,
            (existing.centroid[1] * existing.count + cluster.centroid[1] * cluster.members.length) / total,
            (existing.centroid[2] * existing.count + cluster.centroid[2] * cluster.members.length) / total,
        ];
        existing.count = total;
        existing.members.push(...cluster.members);
    }
    const totalMembers = samples.length;
    const groups = [...merged.entries()]
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.count - a.count);
    const proportions = groups.map((group) => ({
        name: group.name,
        share: group.count / totalMembers,
        rgb: group.rgb,
    }));
    const primaryColor = proportions[0].name;
    const secondaryColors = proportions.slice(1).filter((c) => c.share > 0.1).map((c) => c.name);
    // Step 6 — two dominant hues with a smooth gradient between them.
    //
    // "Dominant" is judged on the merged groups, and the two together must
    // account for most of the garment. The spatial correlation inside
    // looksOmbre() is what separates a real ombre from a two-colour print,
    // where the same two hues are interleaved everywhere.
    let pattern = "";
    if (groups.length >= 2) {
        const [first, second] = groups;
        const firstShare = first.count / totalMembers;
        const secondShare = second.count / totalMembers;
        if (firstShare >= 0.3 &&
            secondShare >= 0.15 &&
            firstShare + secondShare >= 0.6 &&
            looksOmbre(samples, first, second)) {
            pattern = "Ombre";
        }
    }
    return {
        primaryColor,
        secondaryColors,
        proportions,
        pattern,
        sampled: samples.length,
        filtered,
    };
}
/** LAB for a palette entry by name, or null when the name is not one of ours. */
export function paletteLab(name) {
    const wanted = name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!wanted)
        return null;
    for (const [entry, lab] of PALETTE_LAB) {
        if (entry.toLowerCase() === wanted)
            return lab;
    }
    return null;
}
/**
 * ΔE beyond which two colour names are not describing the same garment.
 *
 * Sized from measured cases: teal-vs-DenimBlue is ΔE 29 and is a disagreement
 * about shade, which the model should win. Red-vs-NavyBlue is ΔE 89 and is a
 * mistake, which the pixels should win. 60 sits between them with room on
 * both sides.
 */
const GROSS_DISAGREEMENT = 3600; // ΔE 60, squared
/**
 * Should the MEASURED colour replace the name the model gave, or only
 * annotate it?
 *
 * TWO CASES ONLY.
 *
 * 1. A MULTI-HUE garment. This is the plan's motivating case: an ombre saree
 *    where Gemini returned "Maroon 39%" on one run and something else on the
 *    next, because a single label genuinely cannot describe two hues.
 *
 * 2. A GROSS disagreement, and only when the measurement is confident. If the
 *    model says "Red" and the pixels say Navy Blue, one of them is simply
 *    wrong and it is not the pixels.
 *
 * Everything else goes to the model. Measured against one office photo in
 * fluorescent light, the pixels lost all three times: teal read as Denim Blue,
 * navy as Charcoal, light green as Grey. The measurement is faithful to what
 * the sensor recorded; the model is faithful to what the garment IS, which is
 * what belongs on a wardrobe card.
 *
 * `measured.filtered === false` means the highlight/shadow filter had to be
 * relaxed because the fabric is achromatic — exactly the low-confidence case
 * that produced Charcoal for navy — so case 2 never fires there.
 */
export function preferMeasuredColor(measured, modelName = "") {
    if (measured.pattern === "Ombre")
        return true;
    if (!measured.filtered)
        return false; // low-confidence measurement
    const claimed = paletteLab(modelName);
    if (!claimed)
        return false; // cannot compare, so do not
    const found = paletteLab(measured.primaryColor);
    if (!found)
        return false;
    const gap = labDistance(claimed, found);
    if (gap <= GROSS_DISAGREEMENT)
        return false;
    console.log(`[colour] "${modelName}" disagrees grossly with measured "${measured.primaryColor}" ` +
        `(ΔE ${Math.sqrt(gap).toFixed(0)}) — using the measurement`);
    return true;
}
/** Human-readable one-liner for the logs and for the Gemini prompt. */
export function describeMeasuredColor(measured) {
    const parts = measured.proportions
        .filter((c) => c.share >= 0.05)
        .map((c) => `${c.name} ${Math.round(c.share * 100)}%`);
    return measured.pattern ? `${parts.join(" / ")} (${measured.pattern})` : parts.join(" / ");
}
