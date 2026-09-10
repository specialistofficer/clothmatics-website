// Generated from src/ai/contestedPixels.ts; see source-manifest.json.
/**
 * contestedPixels — find the SEAM between two garments, not the label of every
 * pixel.
 *
 * WHY THIS EXISTS
 *
 * The partition assigns each foreground pixel to the smallest box containing
 * it. Where exactly one box covers a pixel that is correct. Where two boxes
 * overlap it is not, because the only boundary a box can express is a straight
 * line: the shoes box took the trouser cuffs and the trousers were chopped
 * level with the higher of two hems, which is wrong for both legs when one
 * foot is forward.
 *
 * WHY NOT CLASSIFY EACH PIXEL
 *
 * The first version did, and the edges were unusable. Classifying pixels
 * independently means every shadow fold, seam and highlight votes on its own,
 * so the boundary came out as a torn fringe — spikes of trouser sticking up
 * out of the sneakers, ragged bites out of the jacket hem. No amount of
 * feathering hides that, because the damage is 20-30px deep, not 2px.
 *
 * WHAT IT DOES INSTEAD
 *
 * A garment boundary is a LINE, so solve for the line. For every column of the
 * overlap band, find the row where the fabric stops looking like the upper
 * garment and starts looking like the lower one — the single split that best
 * explains that whole column. Then smooth the resulting curve across columns
 * with a median and a moving average, and cut along it.
 *
 * The curve can move freely from column to column, so each trouser leg keeps
 * its own hem height — but it cannot tear, because there is exactly one
 * boundary per column and it is smoothed against its neighbours.
 *
 * WHERE IT REFUSES TO ACT
 *
 * Colour cannot separate two garments of the same colour, and guessing there
 * is worse than a straight line. When a garment has too few exclusive pixels
 * to model, or two models are closer than ΔE 10 (an all-black outfit), the
 * boundary falls back to a flat line through the middle of the overlap —
 * still smooth, just not informed.
 *
 * Self-contained on purpose (no imports): keeps it loadable directly by
 * `scripts/extraction-pipeline-scenarios.ts` under node's type stripping.
 */
/** Minimum exclusive pixels before a garment's colour can be modelled. */
const MIN_EXCLUSIVE = 200;
/** Cap on training samples per garment — more than this buys nothing. */
const MAX_SAMPLES = 3000;
/** Squared LAB distance between DOMINANT centroids: below this, same colour. */
const INSEPARABLE = 100; // ΔE 10
/** Pixels this close to another garment's box edge are not used for training. */
const TRAINING_MARGIN = 12;
/** A pixel only votes when one garment fits clearly better than the other. */
const VOTE_MARGIN = 1.25;
/** Columns with fewer foreground pixels than this cannot be fitted. */
const MIN_COLUMN_PIXELS = 8;
/**
 * How far below BOTH garments a pixel must be before it votes for nobody.
 *
 * A near-black pixel is closer in LAB to khaki-in-shadow than to white, so a
 * sneaker's dark collar votes "trousers" and drags the seam down through the
 * shoe. Silencing it fixes that — but the first version used an absolute
 * L* < 22, which silenced NAVY TROUSERS: in office light their own fabric sits
 * at L* 15-25, so the trousers stopped voting for themselves, the seam had
 * almost no upper-garment evidence, and it settled at the top of the overlap.
 * The shoes then kept the whole cuff.
 *
 * Relative to the two garments it separates, the rule does the intended job in
 * both photos: khaki (L* 66) over white (L* 94) puts the floor at 48 and the
 * black collar is still ignored, while navy (L* 20) over light green (L* 60)
 * puts it at 2 and the trousers speak for themselves.
 */
const SHADOW_MARGIN = 18;
/** Rows examined when deciding where the lower garment really begins. */
const GUARD_WINDOW = 15;
/** Share of confident votes in that window that must be the lower garment. */
const GUARD_SHARE = 0.8;
/** Confident votes needed in the window before it can decide anything. */
const GUARD_MIN_VOTES = 5;
/** Median window (odd) — kills outlier columns without rounding real curves. */
const MEDIAN_WINDOW = 21;
/** Moving-average window (odd) — the final smoothing pass. */
const MEAN_WINDOW = 31;
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
function distance2(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
/** Compact deterministic k-means. Same samples in, same centroids out. */
function buildModel(samples, k) {
    const n = samples.length;
    const realK = Math.min(k, n);
    if (realK === 0)
        return { centroids: [], dominant: [0, 0, 0] };
    // Deterministic spread-out seeding: evenly spaced picks after ordering by
    // lightness. No PRNG, so two runs on the same photo cannot disagree.
    const ordered = [...samples].sort((a, b) => a[0] - b[0]);
    const centroids = [];
    for (let i = 0; i < realK; i++) {
        centroids.push([...ordered[Math.floor(((i + 0.5) / realK) * n)]]);
    }
    const assignment = new Int32Array(n).fill(-1);
    for (let iteration = 0; iteration < 10; iteration++) {
        let moved = false;
        for (let i = 0; i < n; i++) {
            let best = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let c = 0; c < centroids.length; c++) {
                const d = distance2(samples[i], centroids[c]);
                if (d < bestDistance) {
                    bestDistance = d;
                    best = c;
                }
            }
            if (assignment[i] !== best) {
                assignment[i] = best;
                moved = true;
            }
        }
        if (!moved)
            break;
        const sums = centroids.map(() => [0, 0, 0, 0]);
        for (let i = 0; i < n; i++) {
            const acc = sums[assignment[i]];
            acc[0] += samples[i][0];
            acc[1] += samples[i][1];
            acc[2] += samples[i][2];
            acc[3]++;
        }
        for (let c = 0; c < centroids.length; c++) {
            if (sums[c][3] === 0)
                continue;
            centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
        }
    }
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < n; i++)
        counts[assignment[i]]++;
    let dominantIndex = 0;
    for (let c = 1; c < counts.length; c++) {
        if (counts[c] > counts[dominantIndex])
            dominantIndex = c;
    }
    return { centroids, dominant: centroids[dominantIndex] };
}
function nearestDistance(model, pixel) {
    let best = Number.POSITIVE_INFINITY;
    for (const centroid of model.centroids) {
        const d = distance2(pixel, centroid);
        if (d < best)
            best = d;
    }
    return best;
}
/** Median filter over a curve, ignoring unknown (-1) entries. */
function medianSmooth(curve, window) {
    const out = new Float64Array(curve.length);
    const half = (window - 1) / 2;
    const buffer = [];
    for (let i = 0; i < curve.length; i++) {
        buffer.length = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(curve.length - 1, i + half); j++) {
            if (curve[j] >= 0)
                buffer.push(curve[j]);
        }
        if (buffer.length === 0) {
            out[i] = -1;
            continue;
        }
        buffer.sort((a, b) => a - b);
        out[i] = buffer[(buffer.length / 2) | 0];
    }
    return out;
}
/** Moving average over a curve. Assumes no unknowns remain. */
function meanSmooth(curve, window) {
    const out = new Float64Array(curve.length);
    const half = (window - 1) / 2;
    for (let i = 0; i < curve.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(curve.length - 1, i + half); j++) {
            sum += curve[j];
            count++;
        }
        out[i] = sum / count;
    }
    return out;
}
/** Half-width of the column window used to measure the silhouette. */
const NARROW_WINDOW = 15;
/** The narrowest row must beat the column's typical width by this much. */
const NARROW_RATIO = 0.85;
/**
 * Find the boundary from SHAPE when colour cannot find it.
 *
 * Two garments the same colour — white joggers over white sneakers, black
 * trousers over black boots — give the colour models nothing to separate, and
 * the fallback used to be a flat line through the middle of the overlap. That
 * line lands halfway down the shoe: the trousers keep the shoe tops and the
 * shoes come out as two slices.
 *
 * The body has a cue that does not depend on colour. Where a garment ends and
 * the next begins there is usually a NARROWING — an ankle between a trouser
 * cuff and a shoe, a waist between a top and a bottom. So measure the width of
 * the silhouette across the overlap band and put the seam at its narrowest
 * row, per column, so each leg finds its own ankle.
 *
 * Returns null when the band has no meaningful narrowing, in which case the
 * caller keeps the flat line — a wide-leg palazzo over a flat shoe genuinely
 * has no waist to find, and inventing one would be worse.
 */
function narrowestSeam(alpha, width, x0, x1, y0, y1) {
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols < 8 || rows < 12)
        return null;
    // Row-wise prefix sums over the band, so a windowed width is O(1).
    const stride = cols + 1;
    const prefix = new Int32Array(rows * stride);
    for (let r = 0; r < rows; r++) {
        const base = r * stride;
        const row = (y0 + r) * width + x0;
        for (let c = 0; c < cols; c++) {
            prefix[base + c + 1] = prefix[base + c] + (alpha[row + c] > 127 ? 1 : 0);
        }
    }
    const curve = new Float64Array(cols).fill(-1);
    const widths = new Int32Array(rows);
    let found = 0;
    for (let c = 0; c < cols; c++) {
        const lo = Math.max(0, c - NARROW_WINDOW);
        const hi = Math.min(cols - 1, c + NARROW_WINDOW);
        let best = -1;
        let bestWidth = Number.POSITIVE_INFINITY;
        let positive = 0;
        for (let r = 0; r < rows; r++) {
            const base = r * stride;
            const value = prefix[base + hi + 1] - prefix[base + lo];
            widths[r] = value;
            if (value <= 0)
                continue;
            positive++;
            if (value < bestWidth) {
                bestWidth = value;
                best = r;
            }
        }
        if (best < 0 || positive < rows * 0.5)
            continue;
        // Compare against this column's typical width, not the whole band's: a
        // flat profile has no boundary to find and must be left alone.
        const sorted = Array.from(widths).filter((value) => value > 0).sort((a, b) => a - b);
        const median = sorted[(sorted.length / 2) | 0];
        if (median <= 0 || bestWidth > median * NARROW_RATIO)
            continue;
        curve[c] = y0 + best;
        found++;
    }
    return found >= cols * 0.3 ? curve : null;
}
/** Replace unknown (-1) entries with the nearest known value on either side. */
function fillGaps(curve, fallback) {
    let lastKnown = -1;
    for (let i = 0; i < curve.length; i++) {
        if (curve[i] >= 0) {
            lastKnown = curve[i];
            continue;
        }
        let next = -1;
        for (let j = i + 1; j < curve.length; j++) {
            if (curve[j] >= 0) {
                next = curve[j];
                break;
            }
        }
        if (lastKnown >= 0 && next >= 0)
            curve[i] = (lastKnown + next) / 2;
        else if (lastKnown >= 0)
            curve[i] = lastKnown;
        else if (next >= 0)
            curve[i] = next;
        else
            curve[i] = fallback;
    }
}
/**
 * Resolve every overlapping pair of garments by fitting a smooth seam.
 *
 * `ownership` is mutated in place; every other input is read-only. Pixels only
 * one box covers are never touched.
 */
export function resolveGarmentBoundaries(ownership, boxes, labels, photoData, alpha, width, height, options = {}) {
    const report = {
        moved: 0,
        modelled: 0,
        inseparablePairs: [],
        seams: [],
        shapeSeams: [],
        protectedUpperOnlyColumns: 0,
        recoveredUpperResiduePixels: 0,
    };
    if (boxes.length < 2)
        return report;
    // 1. Which pixels does more than one box cover? Two counts: the real boxes
    //    decide what is contested, boxes grown by TRAINING_MARGIN decide what is
    //    safe to LEARN from. A box edge is only approximately where a garment
    //    ends, so pixels hugging a neighbour's edge are the likeliest to be that
    //    neighbour's fabric — fine to assign, too risky to train on.
    const coverCount = new Uint8Array(width * height);
    const coverCountGrown = new Uint8Array(width * height);
    for (const box of boxes) {
        for (let y = box.y0; y <= box.y1; y++) {
            const row = y * width;
            for (let x = box.x0; x <= box.x1; x++) {
                const i = row + x;
                if (alpha[i] > 127 && coverCount[i] < 255)
                    coverCount[i]++;
            }
        }
        const gy0 = Math.max(0, box.y0 - TRAINING_MARGIN);
        const gy1 = Math.min(height - 1, box.y1 + TRAINING_MARGIN);
        const gx0 = Math.max(0, box.x0 - TRAINING_MARGIN);
        const gx1 = Math.min(width - 1, box.x1 + TRAINING_MARGIN);
        for (let y = gy0; y <= gy1; y++) {
            const row = y * width;
            for (let x = gx0; x <= gx1; x++) {
                const i = row + x;
                if (alpha[i] > 127 && coverCountGrown[i] < 255)
                    coverCountGrown[i]++;
            }
        }
    }
    // 2. Training data: pixels exactly one box covers, clear of every other
    //    box's edge, which the box rule has already assigned.
    const samples = boxes.map(() => []);
    const exclusiveCount = new Array(boxes.length).fill(0);
    for (let i = 0; i < coverCount.length; i++) {
        if (coverCount[i] !== 1 || coverCountGrown[i] !== 1)
            continue;
        const slot = ownership[i];
        if (slot >= 0 && slot < boxes.length)
            exclusiveCount[slot]++;
    }
    const strides = exclusiveCount.map((count) => Math.max(1, Math.floor(count / MAX_SAMPLES)));
    const seen = new Array(boxes.length).fill(0);
    for (let i = 0; i < coverCount.length; i++) {
        if (coverCount[i] !== 1 || coverCountGrown[i] !== 1)
            continue;
        const slot = ownership[i];
        if (slot < 0 || slot >= boxes.length)
            continue;
        if (seen[slot]++ % strides[slot] !== 0)
            continue;
        const p = i * 4;
        samples[slot].push(rgbToLab(photoData[p], photoData[p + 1], photoData[p + 2]));
    }
    const models = samples.map((slotSamples, slot) => {
        if (slotSamples.length < MIN_EXCLUSIVE) {
            console.log(`[seam] "${labels[slot]}": only ${slotSamples.length} exclusive pixels — no colour model`);
            return null;
        }
        report.modelled++;
        return buildModel(slotSamples, 3);
    });
    // 3. One seam per overlapping pair.
    for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
            const x0 = Math.max(boxes[a].x0, boxes[b].x0);
            const x1 = Math.min(boxes[a].x1, boxes[b].x1);
            const y0 = Math.max(boxes[a].y0, boxes[b].y0);
            const y1 = Math.min(boxes[a].y1, boxes[b].y1);
            if (x1 <= x0 || y1 <= y0)
                continue;
            const centreA = (boxes[a].y0 + boxes[a].y1) / 2;
            const centreB = (boxes[b].y0 + boxes[b].y1) / 2;
            const upper = centreA <= centreB ? a : b;
            const lower = upper === a ? b : a;
            const upperModel = models[upper];
            const lowerModel = models[lower];
            const separable = !!upperModel &&
                !!lowerModel &&
                distance2(upperModel.dominant, lowerModel.dominant) >= INSEPARABLE;
            const columns = x1 - x0 + 1;
            const curve = new Float64Array(columns).fill(-1);
            /** Per column: the first row that is certainly the lower garment. */
            const guard = new Float64Array(columns).fill(-1);
            /** Strong colour evidence seen anywhere in this column. */
            const upperEvidence = new Uint8Array(columns);
            const lowerEvidence = new Uint8Array(columns);
            const flat = (y0 + y1) / 2;
            if (!separable) {
                const why = upperModel && lowerModel ? "same colour" : "not enough evidence";
                report.inseparablePairs.push(`${labels[a]} / ${labels[b]}`);
                // Colour is out, so use shape: the narrowest row of the silhouette.
                const shape = narrowestSeam(alpha, width, x0, x1, y0, y1);
                if (shape) {
                    curve.set(shape);
                    report.shapeSeams.push(`${labels[upper]} / ${labels[lower]}`);
                    console.log(`[seam] "${labels[upper]}" / "${labels[lower]}": ${why} — using the narrowest silhouette`);
                }
                else {
                    console.log(`[seam] "${labels[upper]}" / "${labels[lower]}": ${why}, no narrowing — flat seam at y=${Math.round(flat)}`);
                    curve.fill(flat);
                }
            }
            else {
                // Fit one split per column: the row that best explains everything
                // above it looking like the upper garment and everything below it
                // looking like the lower one.
                // Shadow floor, relative to the two garments rather than absolute.
                const shadowFloor = Math.min(upperModel.dominant[0], lowerModel.dominant[0]) - SHADOW_MARGIN;
                const ys = [];
                const votes = [];
                for (let x = x0; x <= x1; x++) {
                    ys.length = 0;
                    votes.length = 0;
                    let dominantUpperVotes = 0;
                    let dominantLowerVotes = 0;
                    for (let y = y0; y <= y1; y++) {
                        const i = y * width + x;
                        if (alpha[i] <= 127)
                            continue;
                        const p = i * 4;
                        const pixel = rgbToLab(photoData[p], photoData[p + 1], photoData[p + 2]);
                        let vote = 0;
                        if (pixel[0] >= shadowFloor) {
                            const du = nearestDistance(upperModel, pixel);
                            const dl = nearestDistance(lowerModel, pixel);
                            if (dl * VOTE_MARGIN < du)
                                vote = 1; // looks like the lower one
                            else if (du * VOTE_MARGIN < dl)
                                vote = -1; // looks like the upper one
                            // Box samples can be contaminated: a hanging trouser cuff may
                            // sit inside the shoe box's otherwise-exclusive area. For the
                            // presence/absence guard, compare only each garment's dominant
                            // colour so that contamination cannot count as shoe evidence.
                            const dominantUpper = distance2(upperModel.dominant, pixel);
                            const dominantLower = distance2(lowerModel.dominant, pixel);
                            if (dominantLower * VOTE_MARGIN < dominantUpper)
                                dominantLowerVotes++;
                            else if (dominantUpper * VOTE_MARGIN < dominantLower)
                                dominantUpperVotes++;
                        }
                        ys.push(y);
                        votes.push(vote);
                    }
                    const column = x - x0;
                    // Two pixels are sufficient evidence that an upper-only silhouette
                    // sliver is real; lower ownership still needs the persistent window
                    // below so a white highlight cannot pretend to be a shoe.
                    if (dominantUpperVotes >= 2)
                        upperEvidence[column] = 1;
                    if (ys.length < MIN_COLUMN_PIXELS)
                        continue;
                    // Where does the lower garment REALLY begin?
                    //
                    // "The first row it appears in" is too eager: one bright lace, a
                    // sock, or a highlight on the cuff sits high in the band and pins
                    // the guard there, so the seam is clamped above the actual hem and
                    // the shoe keeps the whole trouser cuff. Require the lower garment
                    // to DOMINATE a window instead — a stray patch cannot carry 80% of
                    // fifteen rows, and the real shoe body does so immediately.
                    let firstLower = -1;
                    for (let k = 0; k < votes.length; k++) {
                        let lower = 0;
                        let upper = 0;
                        const end = Math.min(votes.length, k + GUARD_WINDOW);
                        for (let j = k; j < end; j++) {
                            if (votes[j] === 1)
                                lower++;
                            else if (votes[j] === -1)
                                upper++;
                        }
                        const confident = lower + upper;
                        if (confident >= GUARD_MIN_VOTES && lower >= confident * GUARD_SHARE) {
                            firstLower = ys[k];
                            break;
                        }
                    }
                    // cost(k) = (lower-looking pixels above k) + (upper-looking below k)
                    let uppersBelow = 0;
                    for (const vote of votes)
                        if (vote === -1)
                            uppersBelow++;
                    let lowersAbove = 0;
                    let bestCost = uppersBelow;
                    let bestIndex = 0;
                    for (let k = 0; k < votes.length; k++) {
                        if (votes[k] === 1)
                            lowersAbove++;
                        else if (votes[k] === -1)
                            uppersBelow--;
                        const cost = lowersAbove + uppersBelow;
                        if (cost < bestCost) {
                            bestCost = cost;
                            bestIndex = k + 1;
                        }
                    }
                    // An undecided column (heavy disagreement either way) is left for the
                    // neighbours to fill in rather than dragging the curve about.
                    if (bestCost > ys.length * 0.35)
                        continue;
                    let split = bestIndex >= ys.length ? ys[ys.length - 1] + 1 : ys[bestIndex];
                    // NEVER cut into fabric that is certainly the lower garment.
                    //
                    // The bias is deliberate and one-directional: leaving a strip of
                    // trouser cuff on a sneaker is a cosmetic flaw, while slicing the top
                    // off the sneaker destroys the item. When the two disagree, the
                    // garment keeps its own fabric.
                    if (firstLower >= 0 && split > firstLower)
                        split = firstLower;
                    curve[column] = split;
                    guard[column] = firstLower;
                    if (firstLower >= 0 && dominantLowerVotes >= GUARD_MIN_VOTES)
                        lowerEvidence[column] = 1;
                }
                fillGaps(curve, flat);
                report.seams.push(`${labels[upper]} / ${labels[lower]}`);
            }
            // Smooth the seam: median first to drop outlier columns, then a moving
            // average. This is what stops the boundary tearing while still letting
            // it follow each trouser leg to its own hem.
            let smoothed = medianSmooth(curve, MEDIAN_WINDOW);
            fillGaps(smoothed, flat);
            smoothed = meanSmooth(smoothed, MEAN_WINDOW);
            // Re-apply the "never cut the lower garment" guard AFTER smoothing —
            // averaging across columns can push the seam back down into fabric a
            // single column had already protected. The guard is median-smoothed
            // first so clamping to it cannot reintroduce a jagged edge.
            if (separable) {
                const guardCurve = medianSmooth(guard, MEDIAN_WINDOW);
                for (let c = 0; c < columns; c++) {
                    if (guardCurve[c] >= 0 && smoothed[c] > guardCurve[c])
                        smoothed[c] = guardCurve[c];
                }
            }
            // A shoe can be absent under the outside edge of one trouser leg while
            // the other shoe is present in neighbouring columns. Extending the seam
            // across that empty lower column donates a tan cuff/sliver to the shoe.
            // Dilate real shoe evidence slightly so antialiased shoe edges remain,
            // then protect only columns that contain upper evidence but no nearby
            // lower evidence. This option is enabled only by the worn bottom/shoe
            // adapter; established boundaries for every other garment stay intact.
            const protectUpperOnly = new Uint8Array(columns);
            if (separable && options.preserveUnsupportedUpperColumns) {
                const supportMargin = 5;
                for (let c = 0; c < columns; c++) {
                    if (!upperEvidence[c])
                        continue;
                    let lowerNearby = false;
                    for (let n = Math.max(0, c - supportMargin); n <= Math.min(columns - 1, c + supportMargin); n++) {
                        if (lowerEvidence[n]) {
                            lowerNearby = true;
                            break;
                        }
                    }
                    if (!lowerNearby) {
                        protectUpperOnly[c] = 1;
                        report.protectedUpperOnlyColumns++;
                    }
                }
            }
            let moved = 0;
            for (let x = x0; x <= x1; x++) {
                const split = smoothed[x - x0];
                for (let y = y0; y <= y1; y++) {
                    const i = y * width + x;
                    if (alpha[i] <= 127)
                        continue;
                    if (coverCount[i] < 2)
                        continue;
                    const owner = protectUpperOnly[x - x0] || y < split ? upper : lower;
                    if (ownership[i] !== owner) {
                        ownership[i] = owner;
                        moved++;
                    }
                }
            }
            // A walking pose is not always representable by one y-value per column:
            // a high white shoe tongue can appear first, with a tan cuff continuing
            // beside/below it in the same columns. Recover only upper-colour pixels
            // that remain 4-connected to the upper garment. This removes the cuff
            // from the shoe without chasing isolated similarly-coloured noise.
            if (separable && options.recoverConnectedUpperResidue) {
                const localWidth = columns;
                const localHeight = y1 - y0 + 1;
                const eligible = new Uint8Array(localWidth * localHeight);
                const visited = new Uint8Array(localWidth * localHeight);
                const queue = new Int32Array(localWidth * localHeight);
                let head = 0;
                let tail = 0;
                for (let y = y0; y <= y1; y++) {
                    for (let x = x0; x <= x1; x++) {
                        const imagePixel = y * width + x;
                        if (alpha[imagePixel] <= 127)
                            continue;
                        const p = imagePixel * 4;
                        const pixel = rgbToLab(photoData[p], photoData[p + 1], photoData[p + 2]);
                        const dominantUpper = distance2(upperModel.dominant, pixel);
                        const dominantLower = distance2(lowerModel.dominant, pixel);
                        if (dominantUpper * VOTE_MARGIN >= dominantLower)
                            continue;
                        const recoveryDepth = options.maxUpperResidueRecoveryDepth;
                        if (Number.isFinite(recoveryDepth) &&
                            y > smoothed[x - x0] + Math.max(0, Number(recoveryDepth)))
                            continue;
                        const local = (y - y0) * localWidth + (x - x0);
                        eligible[local] = 1;
                        if (ownership[imagePixel] === upper) {
                            visited[local] = 1;
                            queue[tail++] = local;
                        }
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
                for (let ly = 0; ly < localHeight; ly++) {
                    for (let lx = 0; lx < localWidth; lx++) {
                        const local = ly * localWidth + lx;
                        if (!visited[local])
                            continue;
                        const imagePixel = (y0 + ly) * width + x0 + lx;
                        if (ownership[imagePixel] !== lower)
                            continue;
                        ownership[imagePixel] = upper;
                        report.recoveredUpperResiduePixels++;
                        report.moved++;
                    }
                }
            }
            report.moved += moved;
            if (separable) {
                const lowest = Math.min(...smoothed);
                const highest = Math.max(...smoothed);
                console.log(`[seam] "${labels[upper]}" / "${labels[lower]}": fitted seam y=${Math.round(lowest)}..${Math.round(highest)} ` +
                    `across ${columns}px, ${moved} pixels moved`);
            }
        }
    }
    return report;
}
