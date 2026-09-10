// Generated from src/ai/mattingModels.ts; see source-manifest.json.
/**
 * mattingModels — the cutout engines.
 *
 * WHY TWO MODELS
 *   MODNet is a PORTRAIT matting model (MobileNetV2, 512x512, real-time on
 *   mobile). It is perfect for worn photos — a person wearing clothes is
 *   exactly what it was trained on — but it expects a human in frame.
 *
 *   u2netp is a tiny (4.7MB) saliency model. It is weaker (a busy patterned
 *   background can fool it) but it works with NO person, which is the
 *   flat-lay case MODNet cannot serve.
 *
 * WHY NOT BiRefNet (the thing we just removed)
 *   Swin transformer, 1024x1024 fp32, input size hard-fixed. On a phone CPU a
 *   single pass took 3-4 MINUTES and hung the app. It is a server model. No
 *   amount of architecture juggling fixed that, because there was no lever
 *   left to pull: input locked, fp16 unsupported by ORT's CPU kernels, NNAPI
 *   rejects its ops, and we were already down to one pass per photo.
 */
import { resizeRGBA, toCHWFloat, filterComponents, keepLargestComponent, hysteresisConnect, keepComponentAt, maskBBox, morphClose, // ADDED
 } from "./imageTensor.mjs";
import { makeTensor, runSingleInput } from "./inferenceEngine.mjs";
import { refineMatteFast, decontaminate } from "./matting.mjs";
import { recordExtractionEvent } from "./extractionDiagnostics.mjs";
import { recoverDarkConnectedGarment } from "./maskPostprocess.mjs";
import { captureQaMask, captureQaRgba } from "./garmentQa.mjs";
// ---------------------------------------------------------------- MODNet ----
/** MODNet native input. Fixed by the export. */
const MODNET_INPUT = 512;
/** MODNet normalisation: (x - 127.5) / 127.5  ->  [-1, 1] */
const MODNET_MEAN = [0.5, 0.5, 0.5];
const MODNET_STD = [0.5, 0.5, 0.5];
// ---------------------------------------------------------------- u2netp ----
const U2NETP_INPUT = 320;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}
/** Let React Native paint a frame — keeps the UI alive during heavy work. */
export function yieldToUI() {
    return new Promise((r) => setTimeout(r, 0));
}
export function padBox(box, w, h, ratio = 0.08) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const pad = Math.round(Math.max(bw, bh) * ratio);
    return {
        x0: Math.max(0, box.x0 - pad),
        y0: Math.max(0, box.y0 - pad),
        x1: Math.min(w - 1, box.x1 + pad),
        y1: Math.min(h - 1, box.y1 + pad),
    };
}
export function cropRGBA(img, box) {
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        const srcRow = (y + box.y0) * img.width + box.x0;
        const dstRow = y * w;
        for (let x = 0; x < w; x++) {
            const si = (srcRow + x) * 4;
            const di = (dstRow + x) * 4;
            out[di] = img.data[si];
            out[di + 1] = img.data[si + 1];
            out[di + 2] = img.data[si + 2];
            out[di + 3] = 255;
        }
    }
    return { data: out, width: w, height: h };
}
/** Bilinear upscale of a single-channel buffer (integer fixed-point). */
export function upscaleAlpha(a, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh);
    const FP = 16;
    const xStep = Math.floor(((sw - 1) << FP) / Math.max(1, dw - 1));
    const yStep = Math.floor(((sh - 1) << FP) / Math.max(1, dh - 1));
    let sy = 0;
    for (let y = 0; y < dh; y++) {
        const y0 = sy >> FP;
        const y1 = y0 + 1 < sh ? y0 + 1 : y0;
        const fy = sy & ((1 << FP) - 1);
        const row0 = y0 * sw;
        const row1 = y1 * sw;
        const orow = y * dw;
        let sx = 0;
        for (let x = 0; x < dw; x++) {
            const x0 = sx >> FP;
            const x1 = x0 + 1 < sw ? x0 + 1 : x0;
            const fx = sx & ((1 << FP) - 1);
            const p00 = a[row0 + x0];
            const p01 = a[row0 + x1];
            const p10 = a[row1 + x0];
            const p11 = a[row1 + x1];
            const top = p00 + (((p01 - p00) * fx) >> FP);
            const bot = p10 + (((p11 - p10) * fx) >> FP);
            out[orow + x] = top + (((bot - top) * fy) >> FP);
            sx += xStep;
        }
        sy += yStep;
    }
    return out;
}
/**
 * MODNet matte of a region containing a PERSON.
 * Output alpha is ALREADY in [0,1] — no sigmoid (unlike BiRefNet).
 */
export async function matteWithModnet(region) {
    const t0 = Date.now();
    const small = resizeRGBA(region, MODNET_INPUT, MODNET_INPUT);
    captureQaRgba("03_modnet_model_input_rgb", small);
    await yieldToUI();
    const input = toCHWFloat(small, MODNET_MEAN, MODNET_STD);
    await yieldToUI();
    const out = await runSingleInput("modnet", makeTensor("float32", input, [1, 3, MODNET_INPUT, MODNET_INPUT]));
    console.log(`[matting] MODNet inference: ${Date.now() - t0}ms`);
    await yieldToUI();
    const data = out.data;
    const plane = MODNET_INPUT * MODNET_INPUT;
    const alphaSmall = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
        // Already 0..1 — just clamp and scale.
        const v = data[i];
        alphaSmall[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
    captureQaMask("04_modnet_probability_mask", alphaSmall, MODNET_INPUT, MODNET_INPUT);
    let visible = 0;
    for (let i = 0; i < alphaSmall.length; i++)
        if (alphaSmall[i] > 127)
            visible++;
    void recordExtractionEvent("matte_stats", {
        model: "modnet",
        sourceWidth: region.width,
        sourceHeight: region.height,
        modelInput: MODNET_INPUT,
        visibleFraction: visible / plane,
        totalMs: Date.now() - t0,
    });
    const resizedAlpha = upscaleAlpha(alphaSmall, MODNET_INPUT, MODNET_INPUT, region.width, region.height);
    captureQaMask("06_modnet_resized_mask", resizedAlpha, region.width, region.height);
    return resizedAlpha;
}
/**
 * u2netp matte — for FLAT-LAY (garment alone, no person).
 * Raw logits -> sigmoid.
 */
export async function matteWithU2netp(img) {
    const t0 = Date.now();
    const small = resizeRGBA(img, U2NETP_INPUT, U2NETP_INPUT);
    captureQaRgba("03_u2netp_model_input_rgb", small);
    await yieldToUI();
    const input = toCHWFloat(small, IMAGENET_MEAN, IMAGENET_STD);
    await yieldToUI();
    const out = await runSingleInput("u2netp", makeTensor("float32", input, [1, 3, U2NETP_INPUT, U2NETP_INPUT]));
    console.log(`[matting] u2netp inference: ${Date.now() - t0}ms`);
    await yieldToUI();
    const data = out.data;
    const plane = U2NETP_INPUT * U2NETP_INPUT;
    // Min-max normalise then sigmoid-free scaling (u2net convention).
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < plane; i++) {
        const v = data[i];
        if (v < lo)
            lo = v;
        if (v > hi)
            hi = v;
    }
    const range = hi - lo || 1;
    const alphaSmall = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
        alphaSmall[i] = Math.round(((data[i] - lo) / range) * 255);
    }
    captureQaMask("04_u2netp_probability_mask", alphaSmall, U2NETP_INPUT, U2NETP_INPUT);
    let visible = 0;
    for (let i = 0; i < alphaSmall.length; i++)
        if (alphaSmall[i] > 127)
            visible++;
    void recordExtractionEvent("matte_stats", {
        model: "u2netp",
        sourceWidth: img.width,
        sourceHeight: img.height,
        modelInput: U2NETP_INPUT,
        rawMin: lo,
        rawMax: hi,
        visibleFraction: visible / plane,
        totalMs: Date.now() - t0,
    });
    const resizedAlpha = upscaleAlpha(alphaSmall, U2NETP_INPUT, U2NETP_INPUT, img.width, img.height);
    captureQaMask("06_u2netp_resized_mask", resizedAlpha, img.width, img.height);
    return resizedAlpha;
}
/** Full U2-Net matte used only by the optional Single Garment feature. */
export async function matteWithU2net(img) {
    const t0 = Date.now();
    const small = resizeRGBA(img, U2NETP_INPUT, U2NETP_INPUT);
    await yieldToUI();
    const input = toCHWFloat(small, IMAGENET_MEAN, IMAGENET_STD);
    await yieldToUI();
    const out = await runSingleInput("u2net", makeTensor("float32", input, [1, 3, U2NETP_INPUT, U2NETP_INPUT]));
    console.log(`[matting] full u2net inference: ${Date.now() - t0}ms`);
    await yieldToUI();
    const data = out.data;
    const plane = U2NETP_INPUT * U2NETP_INPUT;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < plane; i++) {
        if (data[i] < lo)
            lo = data[i];
        if (data[i] > hi)
            hi = data[i];
    }
    const range = hi - lo || 1;
    const alphaSmall = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
        alphaSmall[i] = Math.round(((data[i] - lo) / range) * 255);
    }
    return upscaleAlpha(alphaSmall, U2NETP_INPUT, U2NETP_INPUT, img.width, img.height);
}
/**
 * Slice one garment out of a person matte using a caller-supplied semantic
 * weight mask. Edges come from MODNet; the weight identifies the region.
 */
/* ============================================================================
 * BODY-CONTACT PRESERVATION
 *
 * Problem: when a hand rests on the waist, an arm crosses a saree, or the
 * neck sits inside a collar, those pixels can have low garment weight but high
 * person alpha. Removing
 * them punches holes in the garment or splits it in two — and the
 * keep-largest-component step then DELETES the disconnected fabric.
 *
 * Rule implemented here (mirrors the product requirement):
 *   If body pixels can be removed WITHOUT changing garment shape -> remove.
 *   Else (their removal creates a hole or disconnects fabric)   -> KEEP them.
 *
 * Evidence used: MODNet's person matte. A touching hand has alpha ~255;
 * a genuine see-through gap (hanger hole, gap between legs) has alpha ~0.
 * So restoring ONLY where person-alpha is high is self-limiting and safe.
 *
 * These steps run AFTER the edge chain (multiply -> refine -> decontaminate)
 * and never modify it.
 * ========================================================================== */
/** Connected-component labelling (4-neighbour). Returns labels + sizes. */
function labelComponents(bin, w, h) {
    const labels = new Int32Array(w * h); // 0 = unlabelled/background
    const sizes = [0]; // index by label id
    const stack = new Int32Array(w * h);
    let next = 1;
    for (let start = 0; start < w * h; start++) {
        if (!bin[start] || labels[start])
            continue;
        let top = 0;
        stack[top++] = start;
        labels[start] = next;
        let size = 0;
        while (top > 0) {
            const i = stack[--top];
            size++;
            const x = i % w;
            if (x > 0 && bin[i - 1] && !labels[i - 1]) {
                labels[i - 1] = next;
                stack[top++] = i - 1;
            }
            if (x < w - 1 && bin[i + 1] && !labels[i + 1]) {
                labels[i + 1] = next;
                stack[top++] = i + 1;
            }
            if (i >= w && bin[i - w] && !labels[i - w]) {
                labels[i - w] = next;
                stack[top++] = i - w;
            }
            if (i < w * (h - 1) && bin[i + w] && !labels[i + w]) {
                labels[i + w] = next;
                stack[top++] = i + w;
            }
        }
        sizes[next] = size;
        next++;
    }
    return { labels, sizes };
}
/**
 * BRIDGE: if the garment is split into several significant pieces and body
 * pixels (person-alpha high, garment-weight low) physically connect them,
 * add those body pixels — a saree held by an arm stays ONE garment, and the
 * keep-largest-component step no longer deletes the far side.
 * Mutates `refined` (restores alpha on added pixels) and returns the new mask.
 */
function bridgeWithBody(kept, refined, personAlpha, garmentWeight, w, h) {
    const n = w * h;
    const { labels, sizes } = labelComponents(kept, w, h);
    let total = 0;
    for (let i = 0; i < n; i++)
        if (kept[i])
            total++;
    if (total === 0)
        return kept;
    // Significant pieces = ≥10% of the garment each. One piece -> nothing to do.
    const bigIds = [];
    for (let id = 1; id < sizes.length; id++) {
        if (sizes[id] >= total * 0.1)
            bigIds.push(id);
    }
    if (bigIds.length < 2)
        return kept;
    // Candidate connectors: clearly person, clearly not garment.
    const union = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        union[i] = kept[i] || (personAlpha[i] > 200 && garmentWeight[i] < 100) ? 1 : 0;
    }
    const { labels: uLabels } = labelComponents(union, w, h);
    // Which union component does each big garment piece live in?
    const unionOf = new Map(); // garment id -> union id
    const hosts = new Map(); // union id -> #garment pieces
    for (let i = 0; i < n; i++) {
        const g = labels[i];
        if (g && sizes[g] >= total * 0.1 && !unionOf.has(g)) {
            unionOf.set(g, uLabels[i]);
            hosts.set(uLabels[i], (hosts.get(uLabels[i]) ?? 0) + 1);
        }
    }
    // Union components hosting ≥2 pieces are real bridges: keep their body px.
    let bridged = 0;
    const out = kept.slice();
    for (let i = 0; i < n; i++) {
        if (out[i] || !union[i])
            continue;
        if ((hosts.get(uLabels[i]) ?? 0) >= 2) {
            out[i] = 1;
            // Restore the alpha so the kept hand/arm is visible, edges from MODNet.
            refined[i] = Math.max(refined[i], personAlpha[i]);
            bridged++;
        }
    }
    if (bridged > 0) {
        console.log(`[preserve] bridged ${bridged}px of body to keep the garment connected`);
    }
    return out;
}
/**
 * PROTECTED HOLES: interior zero-alpha regions fully enclosed by garment
 * (hand on waist, fingers in a dupatta, neck inside a collar) are restored
 * from the person matte. Genuine see-through gaps have low person-alpha and
 * stay open. Flood-fills the OUTSIDE from the border; whatever empty region
 * the flood cannot reach is, by definition, enclosed.
 */
function fillProtectedHoles(refined, personAlpha, w, h) {
    const n = w * h;
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        solid[i] = refined[i] > 127 ? 1 : 0;
    // Flood the outside (non-solid connected to the border).
    const outside = new Uint8Array(n);
    const stack = new Int32Array(n);
    let top = 0;
    const push = (i) => {
        if (!solid[i] && !outside[i]) {
            outside[i] = 1;
            stack[top++] = i;
        }
    };
    for (let x = 0; x < w; x++) {
        push(x);
        push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
        push(y * w);
        push(y * w + w - 1);
    }
    while (top > 0) {
        const i = stack[--top];
        const x = i % w;
        if (x > 0)
            push(i - 1);
        if (x < w - 1)
            push(i + 1);
        if (i >= w)
            push(i - w);
        if (i < n - w)
            push(i + w);
    }
    // Enclosed emptiness = hole. Restore ONLY where the person matte is
    // confident — a hand scores ~255, a genuine gap ~0 (bias toward keeping).
    // LOWERED THRESHOLD: 120 (was 160) to catch more body-contact pixels.
    let filled = 0;
    for (let i = 0; i < n; i++) {
        if (!solid[i] && !outside[i] && personAlpha[i] > 120) {
            refined[i] = personAlpha[i];
            filled++;
        }
    }
    if (filled > 0) {
        console.log(`[preserve] filled ${filled}px of protected body contact (no holes)`);
    }
}
export function buildGarmentCutout(region, alpha, classWeight, // SOFT 0-255 field, not a hard 0/1 mask
allowMultipleComponents = false) {
    const n = region.width * region.height;
    // MULTIPLY, do not gate.
    //
    // The old code did `classMask[i] ? alpha[i] : 0` — a hard boolean gate. That
    // meant garment-vs-garment boundaries (collar, shoulders, waistband, the gap
    // between the shorts' legs) were drawn by a coarse semantic grid, upscaled
    // ~10x with nearest-neighbour. MODNet's beautiful alpha was being destroyed
    // by the coarse mask it was gated with — hence the staircase.
    //
    // Multiplying a SOFT class weight by MODNet's alpha keeps every edge smooth:
    //   * outer silhouette   -> MODNet decides (already excellent)
    //   * garment boundaries -> a soft gradient, then snapped to real colour
    //                           edges by the matting refinement below.
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        a[i] = (alpha[i] * classWeight[i] + 127) / 255 | 0;
    }
    // Snap the garment boundary to REAL colour edges in the photo. A polo/shorts
    // boundary is a strong colour edge, so this pulls the soft gradient onto it
    // instead of leaving it fuzzy.
    let refined = refineMatteFast(region, a, {
        band: 5,
        sample: 10,
        repairInterior: false, // interiors are already decided by the class field
    });
    decontaminate(region, refined, 2);
    // Drop detached fragments (class-map speckle).
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        bin[i] = refined[i] > 127 ? 1 : 0;
    // FIX 1: Close small holes (body-contact gaps) before filtering components.
    // A 3x3 morphological close seals 1-2px gaps (arm inside sleeve) without
    // merging truly separate garments.
    const binClosed = morphClose(bin, region.width, region.height);
    let kept = filterComponents(binClosed, region.width, region.height, Math.max(64, Math.round(n * 0.005)));
    // A top, bottom or bag should be one contiguous garment. Detached regions
    // are usually a hand, a drape fragment or semantic-mask noise. Shoes are
    // the intentional exception: both left and right shoes belong together.
    // One-piece garments (dress, anarkali, saree, etc.) also stay whole.
    if (!allowMultipleComponents) {
        // BODY-CONTACT PRESERVATION (1/2): if an arm/hand SPLITS the garment,
        // bridge across it with body pixels BEFORE keeping the largest component
        // — otherwise the far side of a held saree gets deleted. A small visible
        // arm is far better than missing fabric.
        kept = bridgeWithBody(kept, refined, alpha, classWeight, region.width, region.height);
        kept = keepLargestComponent(kept, region.width, region.height);
    }
    else {
        // For shoes and one-piece garments: keep all significant pieces,
        // just remove tiny speckle noise.
        kept = filterComponents(kept, region.width, region.height, Math.max(64, Math.round(n * 0.005)));
    }
    for (let i = 0; i < n; i++)
        if (!kept[i])
            refined[i] = 0;
    // BODY-CONTACT PRESERVATION (2/2): a hand on the waist / fingers in a
    // dupatta / neck inside a collar leave enclosed holes. Fill them from the
    // person matte; genuine see-through gaps (low person-alpha) stay open.
    fillProtectedHoles(refined, alpha, region.width, region.height);
    // FIX 2: Sync kept with refined so the bounding box includes restored holes.
    // Without this, filled holes outside the old bounding box get cropped away.
    for (let i = 0; i < n; i++) {
        kept[i] = refined[i] > 127 ? 1 : 0;
    }
    const box = maskBBox(kept, region.width, region.height);
    if (!box)
        return null;
    const tw = box.x1 - box.x0 + 1;
    const th = box.y1 - box.y0 + 1;
    const out = new Uint8Array(tw * th * 4);
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const si = (y + box.y0) * region.width + (x + box.x0);
            const s4 = si * 4;
            const d4 = (y * tw + x) * 4;
            out[d4] = region.data[s4];
            out[d4 + 1] = region.data[s4 + 1];
            out[d4 + 2] = region.data[s4 + 2];
            out[d4 + 3] = refined[si];
        }
    }
    return { image: { data: out, width: tw, height: th }, box };
}
/** FLAT-LAY cutout: u2netp + matting polish. */
export async function cutoutFlatLay(photo) {
    let alpha = await matteWithU2netp(photo);
    await yieldToUI();
    recoverPaleNeutralFabric(photo, alpha);
    const n = photo.width * photo.height;
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        bin[i] = alpha[i] > 127 ? 1 : 0;
    captureQaMask("07_flatlay_threshold_mask", bin, photo.width, photo.height);
    const kept = filterComponents(bin, photo.width, photo.height, Math.round(n * 0.02));
    captureQaMask("09_flatlay_component_mask", kept, photo.width, photo.height);
    for (let i = 0; i < n; i++)
        if (!kept[i])
            alpha[i] = 0;
    await yieldToUI();
    // A pale garment on a pale/printed surface has very little colour contrast.
    // Interior repair is designed for a person against a wall; on flat-lays it
    // can incorrectly decide that beige fabric is background and punch large
    // holes through shoulders, collars and sleeves. Keep the saliency model's
    // interior intact and use colour refinement only to soften the outer edge.
    alpha = refineMatteFast(photo, alpha, {
        band: 5,
        sample: 10,
        repairInterior: false,
    });
    decontaminate(photo, alpha, 3);
    await yieldToUI();
    const bin2 = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        bin2[i] = alpha[i] > 20 ? 1 : 0;
    const box = maskBBox(bin2, photo.width, photo.height);
    if (!box)
        return null;
    const tw = box.x1 - box.x0 + 1;
    const th = box.y1 - box.y0 + 1;
    const out = new Uint8Array(tw * th * 4);
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const si = (y + box.y0) * photo.width + (x + box.x0);
            const s4 = si * 4;
            const d4 = (y * tw + x) * 4;
            out[d4] = photo.data[s4];
            out[d4 + 1] = photo.data[s4 + 1];
            out[d4 + 2] = photo.data[s4 + 2];
            out[d4 + 3] = alpha[si];
        }
    }
    return { image: { data: out, width: tw, height: th }, box };
}
export async function cutoutSingleGarment(photo, preserveLightFabric = false, opts = {}) {
    // u2netp, not full U2-Net. u2net is 176MB and `required: false`, so it is
    // never downloaded — this path threw "Model u2net is not downloaded yet".
    // Measured on a patterned flat-lay the two score the same (0.28% vs 0.64%
    // background retained) and u2netp is ~8x faster and already on the device.
    let alpha = await matteWithU2netp(photo);
    const modelAlpha = alpha.slice();
    await yieldToUI();
    // U2NetP often assigns only medium confidence to white/beige fabric on
    // a pale surface. Recover connected neutral fabric only when Gemini has
    // explicitly identified a light garment; dark garments retain the stricter
    // path that is already working well.
    if (preserveLightFabric)
        recoverPaleNeutralFabric(photo, alpha);
    const n = photo.width * photo.height;
    const threshold = preserveLightFabric ? 105 : 135;
    // Hysteresis instead of a hard cut. A folded-over trouser leg connects to
    // the body through a low-confidence band; a single threshold split it into
    // its own component and keepLargestComponent below then deleted it, taking
    // a bite out of the garment. Weak pixels count only when they reach a
    // strong region, so isolated background blobs still die.
    const confident = hysteresisConnect(alpha, photo.width, photo.height, threshold, Math.max(60, threshold - 45));
    captureQaMask("07_single_hysteresis_threshold", confident, photo.width, photo.height);
    // Pale fabric often arrives as adjacent confidence islands. Join small
    // cracks BEFORE component selection so the complete shirt is not discarded.
    let connected = confident;
    const closePasses = preserveLightFabric ? 4 : 1;
    for (let pass = 0; pass < closePasses; pass++) {
        connected = morphClose(connected, photo.width, photo.height);
    }
    captureQaMask("08_single_morphology_close", connected, photo.width, photo.height);
    const filtered = filterComponents(connected, photo.width, photo.height, Math.round(n * (preserveLightFabric ? 0.002 : 0.01)));
    let kept = (opts.tapPoint
        ? keepComponentAt(filtered, photo.width, photo.height, opts.tapPoint.x * (photo.width - 1), opts.tapPoint.y * (photo.height - 1))
        : null) ?? keepLargestComponent(filtered, photo.width, photo.height);
    captureQaMask("09_single_selected_component", kept, photo.width, photo.height);
    // A big drop from `filtered` to `kept` means the garment was split and only
    // one piece survived — the "bite out of the waistband" failure.
    const frac = (m) => { let c = 0; for (let i = 0; i < m.length; i++)
        if (m[i])
            c++; return c / m.length; };
    console.log(`[single] strong=${threshold} weak=${Math.max(60, threshold - 45)} ` +
        `afterHysteresis=${frac(connected).toFixed(3)} afterFilter=${frac(filtered).toFixed(3)} ` +
        `afterSelect=${frac(kept).toFixed(3)} tap=${opts.tapPoint ? "yes" : "no"}`);
    // Seal small confidence cracks first so interior fabric gaps do not leak to
    // the outside flood merely through a one- or two-pixel model-grid channel.
    kept = morphClose(morphClose(kept, photo.width, photo.height), photo.width, photo.height);
    // Dark fabric on patterned bedding is the opposite failure mode: U2NetP can
    // retain the waistband and one leg at high confidence while leaving only a
    // weak trace through the other leg. Largest-component selection then makes
    // an amputated but otherwise plausible cutout. Recover only dark,
    // source-colour-connected pixels from the selected garment. The helper has
    // a strict overgrowth rollback and never changes RGB.
    const darkRecovery = preserveLightFabric
        ? {
            applied: false,
            reason: "not-dark",
            seedPixels: 0,
            recoveredPixels: 0,
            recoveredFractionOfSeed: 0,
            seedLuminance75: 0,
            seedLuminance90: 0,
            paletteSize: 0,
        }
        : recoverDarkConnectedGarment(photo.data, photo.width, photo.height, modelAlpha, kept);
    void recordExtractionEvent("single_dark_garment_recovery", {
        ...darkRecovery,
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        preserveLightFabric,
        beforeRecoveryFraction: frac(kept) - darkRecovery.recoveredPixels / Math.max(1, n),
        afterRecoveryFraction: frac(kept),
    }, darkRecovery.reason === "overgrowth" ? "warning" : "info");
    // Fill only holes ENCLOSED by the garment. Missing patches in the shirt are
    // restored, while the surface around it and genuine outside gaps remain
    // connected to the image border and stay transparent.
    const outside = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const pushOutside = (index) => {
        if (!kept[index] && !outside[index]) {
            outside[index] = 1;
            queue[tail++] = index;
        }
    };
    for (let x = 0; x < photo.width; x++) {
        pushOutside(x);
        pushOutside((photo.height - 1) * photo.width + x);
    }
    for (let y = 0; y < photo.height; y++) {
        pushOutside(y * photo.width);
        pushOutside(y * photo.width + photo.width - 1);
    }
    while (head < tail) {
        const index = queue[head++];
        const x = index % photo.width;
        if (x > 0)
            pushOutside(index - 1);
        if (x < photo.width - 1)
            pushOutside(index + 1);
        if (index >= photo.width)
            pushOutside(index - photo.width);
        if (index < n - photo.width)
            pushOutside(index + photo.width);
    }
    kept = kept.slice();
    for (let i = 0; i < n; i++) {
        if (!kept[i] && !outside[i])
            kept[i] = 1;
    }
    // Make the garment interior opaque. Edge softness is added only afterward,
    // so the model's low confidence cannot create transparent holes in fabric.
    for (let i = 0; i < n; i++) {
        alpha[i] = kept[i] ? 255 : 0;
    }
    await yieldToUI();
    alpha = refineMatteFast(photo, alpha, {
        band: 4,
        sample: 12,
        repairInterior: false,
    });
    captureQaMask("10_flatlay_refined_mask", alpha, photo.width, photo.height);
    captureQaMask("10_single_final_mask", alpha, photo.width, photo.height);
    await yieldToUI();
    const visible = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        visible[i] = alpha[i] > 20 ? 1 : 0;
    const box = maskBBox(visible, photo.width, photo.height);
    if (!box)
        return null;
    const width = box.x1 - box.x0 + 1;
    const height = box.y1 - box.y0 + 1;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sourcePixel = (y + box.y0) * photo.width + (x + box.x0);
            const source = sourcePixel * 4;
            const target = (y * width + x) * 4;
            data[target] = photo.data[source];
            data[target + 1] = photo.data[source + 1];
            data[target + 2] = photo.data[source + 2];
            data[target + 3] = alpha[sourcePixel];
        }
    }
    return { image: { data, width, height }, box };
}
/**
 * U2Net is deliberately conservative around low-contrast pale fabric. That
 * is good for avoiding a bedsheet, but can remove a beige shirt's far
 * shoulder altogether. For a light, low-saturation garment only, extend the
 * confident mask through directly connected pixels with the same fabric
 * colour. Bright or saturated foreign objects (for example a blue hanger)
 * are excluded. Colourful/dark garments are left entirely to the model.
 */
function recoverPaleNeutralFabric(photo, alpha) {
    const n = photo.width * photo.height;
    const { data, width: w, height: h } = photo;
    let sr = 0, sg = 0, sb = 0, count = 0;
    for (let i = 0; i < n; i++) {
        if (alpha[i] < 180)
            continue;
        const p = i * 4;
        sr += data[p];
        sg += data[p + 1];
        sb += data[p + 2];
        count++;
    }
    if (count < Math.max(500, n * 0.002))
        return;
    const r = sr / count, g = sg / count, b = sb / count;
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const light = (r + g + b) / 3 > 135;
    const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
    if (!light || saturation > 0.28)
        return;
    const MAX_DISTANCE = 58;
    const MAX_DISTANCE_SQUARED = MAX_DISTANCE * MAX_DISTANCE;
    const candidate = new Uint8Array(n);
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    let tail = 0;
    for (let i = 0; i < n; i++) {
        const p = i * 4;
        const dr = data[p] - r, dg = data[p + 1] - g, db = data[p + 2] - b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance <= MAX_DISTANCE_SQUARED)
            candidate[i] = 1;
        // Do not retain a high-confidence coloured accessory attached to an
        // otherwise neutral garment (the blue hanger in the reported photo).
        const pixelMax = Math.max(data[p], data[p + 1], data[p + 2]);
        const pixelMin = Math.min(data[p], data[p + 1], data[p + 2]);
        const pixelSaturation = pixelMax === 0 ? 0 : (pixelMax - pixelMin) / pixelMax;
        if (alpha[i] > 100 && distance > MAX_DISTANCE_SQUARED * 2.2 && pixelSaturation > saturation + 0.28) {
            alpha[i] = 0;
            continue;
        }
        if (alpha[i] > 115 && candidate[i]) {
            seen[i] = 1;
            queue[tail++] = i;
        }
    }
    for (let head = 0; head < tail; head++) {
        const i = queue[head];
        const x = i % w;
        const y = (i / w) | 0;
        if (x > 0 && !seen[i - 1] && candidate[i - 1]) {
            seen[i - 1] = 1;
            queue[tail++] = i - 1;
        }
        if (x < w - 1 && !seen[i + 1] && candidate[i + 1]) {
            seen[i + 1] = 1;
            queue[tail++] = i + 1;
        }
        if (y > 0 && !seen[i - w] && candidate[i - w]) {
            seen[i - w] = 1;
            queue[tail++] = i - w;
        }
        if (y < h - 1 && !seen[i + w] && candidate[i + w]) {
            seen[i + w] = 1;
            queue[tail++] = i + w;
        }
    }
    for (let i = 0; i < n; i++) {
        // Leave a soft boundary for refineMatteFast to shape from real image
        // edges, while ensuring the low-confidence shirt section survives its
        // initial foreground threshold.
        if (seen[i] && alpha[i] < 150)
            alpha[i] = 150;
    }
}
