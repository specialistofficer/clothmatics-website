// Generated from src/ai/imageTensor.ts; see source-manifest.json.
export { decodeToRGBA, savePNG } from "../browser-io.mjs";
/** Bilinear resize RGBA. Fine for model-input sizes (224–1024). */
export function resizeRGBA(src, dw, dh) {
    const out = new Uint8Array(dw * dh * 4);
    const xr = src.width / dw, yr = src.height / dh;
    for (let y = 0; y < dh; y++) {
        const sy = Math.min(y * yr, src.height - 1);
        const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, src.height - 1), fy = sy - y0;
        for (let x = 0; x < dw; x++) {
            const sx = Math.min(x * xr, src.width - 1);
            const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, src.width - 1), fx = sx - x0;
            const i00 = (y0 * src.width + x0) * 4, i10 = (y0 * src.width + x1) * 4;
            const i01 = (y1 * src.width + x0) * 4, i11 = (y1 * src.width + x1) * 4;
            const o = (y * dw + x) * 4;
            for (let c = 0; c < 4; c++) {
                const top = src.data[i00 + c] * (1 - fx) + src.data[i10 + c] * fx;
                const bot = src.data[i01 + c] * (1 - fx) + src.data[i11 + c] * fx;
                out[o + c] = (top * (1 - fy) + bot * fy) | 0;
            }
        }
    }
    return { data: out, width: dw, height: dh };
}
/** RGBA → NCHW float32 with per-channel mean/std (values in 0..1 space). */
export function toCHWFloat(img, mean, std) {
    const { data, width: w, height: h } = img;
    const out = new Float32Array(3 * w * h);
    const plane = w * h;
    for (let i = 0; i < plane; i++) {
        const p = i * 4;
        out[i] = (data[p] / 255 - mean[0]) / std[0];
        out[plane + i] = (data[p + 1] / 255 - mean[1]) / std[1];
        out[2 * plane + i] = (data[p + 2] / 255 - mean[2]) / std[2];
    }
    return out;
}
/** Nearest-neighbor resize for a single-channel mask. */
export function resizeMask(mask, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) {
        const sy = Math.min((y * sh / dh) | 0, sh - 1);
        for (let x = 0; x < dw; x++) {
            const sx = Math.min((x * sw / dw) | 0, sw - 1);
            out[y * dw + x] = mask[sy * sw + sx];
        }
    }
    return out;
}
/**
 * Bilinear-upscale a BINARY (0/1) mask into a SOFT (0-255) alpha mask.
 * This is what removes the pixelated "staircase" edges: instead of hard
 * nearest-neighbor blocks, garment boundaries get a smooth 1-2px feather
 * at model resolution (≈10-20px at photo resolution) that anti-aliases
 * the cutout like a professional matte.
 */
export function resizeMaskSoft(mask, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh);
    const xr = sw / dw, yr = sh / dh;
    for (let y = 0; y < dh; y++) {
        const sy = Math.min(y * yr, sh - 1);
        const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), fy = sy - y0;
        for (let x = 0; x < dw; x++) {
            const sx = Math.min(x * xr, sw - 1);
            const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), fx = sx - x0;
            const top = mask[y0 * sw + x0] * (1 - fx) + mask[y0 * sw + x1] * fx;
            const bot = mask[y1 * sw + x0] * (1 - fx) + mask[y1 * sw + x1] * fx;
            out[y * dw + x] = Math.round((top * (1 - fy) + bot * fy) * 255);
        }
    }
    return out;
}
/** Bilinear resize for an alpha / confidence map already in 0..255. */
export function resizeAlphaSoft(alpha, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh);
    const xr = sw / dw, yr = sh / dh;
    for (let y = 0; y < dh; y++) {
        const sy = Math.min(y * yr, sh - 1);
        const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), fy = sy - y0;
        for (let x = 0; x < dw; x++) {
            const sx = Math.min(x * xr, sw - 1);
            const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), fx = sx - x0;
            const top = alpha[y0 * sw + x0] * (1 - fx) + alpha[y0 * sw + x1] * fx;
            const bottom = alpha[y1 * sw + x0] * (1 - fx) + alpha[y1 * sw + x1] * fx;
            out[y * dw + x] = Math.round(top * (1 - fy) + bottom * fy);
        }
    }
    return out;
}
/** 3×3 binary dilate/erode; close = dilate then erode (fills pinholes). */
function morph(mask, w, h, dilate) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let hit = dilate ? 0 : 1;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy, xx = x + dx;
                    const v = yy >= 0 && yy < h && xx >= 0 && xx < w ? mask[yy * w + xx] : 0;
                    if (dilate) {
                        if (v) {
                            hit = 1;
                            dy = 2;
                            break;
                        }
                    }
                    else {
                        if (!v) {
                            hit = 0;
                            dy = 2;
                            break;
                        }
                    }
                }
            }
            out[y * w + x] = hit;
        }
    }
    return out;
}
export function morphClose(mask, w, h) {
    return morph(morph(mask, w, h, true), w, h, false);
}
/** Keep components ≥ minArea or ≥ 15% of the largest (protects shoe pairs). */
export function filterComponents(mask, w, h, minArea) {
    const labels = new Int32Array(w * h).fill(-1);
    const sizes = [];
    const stack = new Int32Array(w * h);
    let nLabels = 0;
    for (let i = 0; i < w * h; i++) {
        if (!mask[i] || labels[i] !== -1)
            continue;
        let top = 0, size = 0;
        stack[top++] = i;
        labels[i] = nLabels;
        while (top > 0) {
            const p = stack[--top];
            size++;
            const px = p % w, py = (p / w) | 0;
            if (px > 0 && mask[p - 1] && labels[p - 1] === -1) {
                labels[p - 1] = nLabels;
                stack[top++] = p - 1;
            }
            if (px < w - 1 && mask[p + 1] && labels[p + 1] === -1) {
                labels[p + 1] = nLabels;
                stack[top++] = p + 1;
            }
            if (py > 0 && mask[p - w] && labels[p - w] === -1) {
                labels[p - w] = nLabels;
                stack[top++] = p - w;
            }
            if (py < h - 1 && mask[p + w] && labels[p + w] === -1) {
                labels[p + w] = nLabels;
                stack[top++] = p + w;
            }
        }
        sizes.push(size);
        nLabels++;
    }
    if (nLabels === 0)
        return mask;
    const largest = Math.max(...sizes);
    const keep = sizes.map((s) => s >= minArea || s >= 0.15 * largest);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++)
        if (labels[i] >= 0 && keep[labels[i]])
            out[i] = 1;
    return out;
}
/**
 * Hysteresis connectivity (Canny-style): keep a pixel if it clears the STRONG
 * threshold, or clears the WEAK threshold AND connects to a strong pixel
 * through other weak pixels.
 *
 * A single hard threshold splits one garment into several components wherever
 * confidence briefly dips — a folded-over trouser leg, or the crotch junction
 * of a pair laid in a V. keepLargestComponent then deletes the smaller piece
 * outright. Growing strong regions through weak pixels bridges those
 * junctions, while isolated weak blobs (bedsheet pattern) stay unseeded and
 * are still discarded.
 */
export function hysteresisConnect(alpha, w, h, strong, weak) {
    const out = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let tail = 0;
    for (let i = 0; i < w * h; i++) {
        if (alpha[i] >= strong) {
            out[i] = 1;
            queue[tail++] = i;
        }
    }
    let head = 0;
    while (head < tail) {
        const p = queue[head++];
        const x = p % w, y = (p / w) | 0;
        const visit = (n) => {
            if (!out[n] && alpha[n] >= weak) {
                out[n] = 1;
                queue[tail++] = n;
            }
        };
        if (x > 0)
            visit(p - 1);
        if (x < w - 1)
            visit(p + 1);
        if (y > 0)
            visit(p - w);
        if (y < h - 1)
            visit(p + w);
    }
    return out;
}
/**
 * Keep the connected component containing (or nearest to) a tapped point.
 * Tap-to-refine needs this: the user's finger names the garment, so component
 * choice must follow the tap rather than raw area.
 */
export function keepComponentAt(mask, w, h, tx, ty) {
    const cx = Math.max(0, Math.min(w - 1, Math.round(tx)));
    const cy = Math.max(0, Math.min(h - 1, Math.round(ty)));
    let seed = -1;
    if (mask[cy * w + cx])
        seed = cy * w + cx;
    else {
        // A tap just outside a thin garment edge is common — search a small radius.
        const maxR = Math.max(4, Math.round(Math.hypot(w, h) * 0.05));
        let best = Infinity;
        for (let dy = -maxR; dy <= maxR; dy++) {
            const yy = cy + dy;
            if (yy < 0 || yy >= h)
                continue;
            for (let dx = -maxR; dx <= maxR; dx++) {
                const xx = cx + dx;
                if (xx < 0 || xx >= w || !mask[yy * w + xx])
                    continue;
                const d = dx * dx + dy * dy;
                if (d < best) {
                    best = d;
                    seed = yy * w + xx;
                }
            }
        }
    }
    if (seed < 0)
        return null;
    const out = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    out[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
        const p = queue[head++];
        const x = p % w, y = (p / w) | 0;
        const visit = (n) => { if (mask[n] && !out[n]) {
            out[n] = 1;
            queue[tail++] = n;
        } };
        if (x > 0)
            visit(p - 1);
        if (x < w - 1)
            visit(p + 1);
        if (y > 0)
            visit(p - w);
        if (y < h - 1)
            visit(p + w);
    }
    return out;
}
/** Keep just the largest connected foreground component. */
export function keepLargestComponent(mask, w, h) {
    const labels = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    const sizes = [];
    let label = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || labels[i] !== -1)
            continue;
        let head = 0, tail = 0, size = 0;
        stack[tail++] = i;
        labels[i] = label;
        while (head < tail) {
            const p = stack[head++];
            size++;
            const x = p % w, y = (p / w) | 0;
            const visit = (n) => {
                if (mask[n] && labels[n] === -1) {
                    labels[n] = label;
                    stack[tail++] = n;
                }
            };
            if (x > 0)
                visit(p - 1);
            if (x < w - 1)
                visit(p + 1);
            if (y > 0)
                visit(p - w);
            if (y < h - 1)
                visit(p + w);
        }
        sizes.push(size);
        label++;
    }
    if (sizes.length < 2)
        return mask;
    let largest = 0;
    for (let i = 1; i < sizes.length; i++)
        if (sizes[i] > sizes[largest])
            largest = i;
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++)
        if (labels[i] === largest)
            out[i] = 1;
    return out;
}
export function maskBBox(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (mask[y * w + x]) {
                if (x < x0)
                    x0 = x;
                if (x > x1)
                    x1 = x;
                if (y < y0)
                    y0 = y;
                if (y > y1)
                    y1 = y;
            }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
}
/** Crop RGBA + apply mask as alpha, with padding, → new RGBA. */
export function cropWithAlpha(img, mask, box, padRatio = 0.04) {
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    const pad = Math.round(Math.max(bw, bh) * padRatio);
    const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
    const x1 = Math.min(img.width - 1, box.x1 + pad), y1 = Math.min(img.height - 1, box.y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = ((y + y0) * img.width + (x + x0)) * 4;
            const oi = (y * w + x) * 4;
            out[oi] = img.data[si];
            out[oi + 1] = img.data[si + 1];
            out[oi + 2] = img.data[si + 2];
            out[oi + 3] = mask[(y + y0) * img.width + (x + x0)] ? 255 : 0;
        }
    }
    return { data: out, width: w, height: h };
}
/** Center an RGBA cutout on a white square canvas (catalog look). */
export function toWhiteCanvas(img, size = 1024) {
    const scale = Math.min((size * 0.92) / img.width, (size * 0.92) / img.height);
    const nw = Math.max(1, Math.round(img.width * scale));
    const nh = Math.max(1, Math.round(img.height * scale));
    const scaled = resizeRGBA(img, nw, nh);
    const out = new Uint8Array(size * size * 4).fill(255);
    const ox = ((size - nw) / 2) | 0, oy = ((size - nh) / 2) | 0;
    for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
            const si = (y * nw + x) * 4, oi = ((y + oy) * size + (x + ox)) * 4;
            const a = scaled.data[si + 3] / 255;
            out[oi] = scaled.data[si] * a + 255 * (1 - a);
            out[oi + 1] = scaled.data[si + 1] * a + 255 * (1 - a);
            out[oi + 2] = scaled.data[si + 2] * a + 255 * (1 - a);
            out[oi + 3] = 255;
        }
    }
    return { data: out, width: size, height: size };
}
/** Separable box blur on a single-channel 0-255 buffer. O(n) per pass. */
function boxBlur1D(src, w, h, radius) {
    if (radius < 1)
        return src;
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    const win = radius * 2 + 1;
    // horizontal
    for (let y = 0; y < h; y++) {
        let sum = 0;
        const row = y * w;
        for (let x = -radius; x <= radius; x++)
            sum += src[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            tmp[row + x] = (sum / win) | 0;
            const outIdx = Math.max(0, x - radius);
            const inIdx = Math.min(w - 1, x + radius + 1);
            sum += src[row + inIdx] - src[row + outIdx];
        }
    }
    // vertical
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++)
            sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = (sum / win) | 0;
            const outIdx = Math.max(0, y - radius);
            const inIdx = Math.min(h - 1, y + radius + 1);
            sum += tmp[inIdx * w + x] - tmp[outIdx * w + x];
        }
    }
    return out;
}
/**
 * Turn a bilinear-upscaled matte (straight-line "zigzag" ramps between the
 * model's coarse grid points) into a genuinely SMOOTH edge:
 *  1. two box-blur passes round the segment corners into curves,
 *  2. a smoothstep remap re-sharpens the transition so edges stay crisp
 *     instead of foggy.
 */
export function refineAlpha(soft, w, h, radius) {
    let a = boxBlur1D(soft, w, h, radius);
    a = boxBlur1D(a, w, h, Math.max(1, (radius / 2) | 0));
    const out = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) {
        // remap 48..208 -> 0..255 with smoothstep; outside clamps
        let tt = (a[i] - 48) / 160;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        out[i] = (tt * tt * (3 - 2 * tt) * 255) | 0;
    }
    return out;
}
/**
 * COLOR DECONTAMINATION — the real cause of the "colored halo" (green rim
 * on a green wall, grey rim on a grey wall).
 *
 * A soft matte makes edge pixels semi-transparent, but their RGB is still
 * the ORIGINAL pixel — i.e. mostly background colour. Composited onto
 * white, those pixels show as a coloured fringe that reads as jagged.
 *
 * Fix, per edge pixel (0 < alpha < 250):
 *  1. shrink the matte slightly (erode) so we stop at real garment pixels,
 *  2. replace the RGB with the nearest CONFIDENT interior colour
 *     (alpha >= 250) found in a small neighbourhood.
 * Result: a clean, colour-true edge instead of a background-tinted halo.
 */
export function decontaminateEdges(img, alpha, radius) {
    const { width: w, height: h, data } = img;
    const SOLID = 250;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const a = alpha[i];
            if (a === 0 || a >= SOLID)
                continue; // fully out or fully in — leave it
            // Nearest solid-interior pixel wins (spiral out from the centre).
            let br = -1, bg = -1, bb = -1, bestDist = Infinity;
            for (let dy = -radius; dy <= radius; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= h)
                    continue;
                for (let dx = -radius; dx <= radius; dx++) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= w)
                        continue;
                    const j = yy * w + xx;
                    if (alpha[j] < SOLID)
                        continue;
                    const d = dx * dx + dy * dy;
                    if (d < bestDist) {
                        bestDist = d;
                        const jj = j * 4;
                        br = data[jj];
                        bg = data[jj + 1];
                        bb = data[jj + 2];
                    }
                }
            }
            if (br < 0)
                continue; // no interior nearby — keep as is
            const ii = i * 4;
            data[ii] = br;
            data[ii + 1] = bg;
            data[ii + 2] = bb;
        }
    }
}
/** Shrink a soft matte by `px` (pulls the edge INSIDE the garment, so no
 * background pixels remain under the feather). */
export function erodeAlpha(alpha, w, h, px) {
    if (px < 1)
        return alpha;
    let cur = alpha;
    for (let pass = 0; pass < px; pass++) {
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                let min = cur[i];
                if (x > 0)
                    min = Math.min(min, cur[i - 1]);
                if (x < w - 1)
                    min = Math.min(min, cur[i + 1]);
                if (y > 0)
                    min = Math.min(min, cur[i - w]);
                if (y < h - 1)
                    min = Math.min(min, cur[i + w]);
                out[i] = min;
            }
        }
        cur = out;
    }
    return cur;
}
