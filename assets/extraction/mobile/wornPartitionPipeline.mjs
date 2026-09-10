// Generated from src/ai/wornPartitionPipeline.ts; see source-manifest.json.
/**
 * wornPartitionPipeline — the Phase 4 extractor.
 *
 *   1. person_alpha = one matte for the whole photo          (ONE inference)
 *   2. verify the box coordinate order                       (Phase 4, step 2)
 *   3. assign every foreground pixel to exactly ONE garment  (smallest box wins)
 *   4. garment_i = person_alpha ∩ assigned_pixels_i
 *   5. postprocess each mask                                 (Phase 6)
 *   6. validate each cutout                                  (Phase 1)
 *   7. measure its colour from pixels                        (Phase 2b)
 *
 * A four-item photo therefore costs the same inference as a one-item photo.
 *
 * This file never replaces the legacy extractor by itself — `offlinePipeline`
 * decides which one runs, and falls back to legacy if anything here throws.
 */
import { decodeToRGBA, resizeRGBA, savePNG } from "./imageTensor.mjs";
import { matteWithModnet, matteWithU2netp, yieldToUI } from "./mattingModels.mjs";
import { partitionGarments, buildOwnedCutout, tightCrop, } from "./garmentPartition.mjs";
import { resolveGarmentBoundaries } from "./contestedPixels.mjs";
import { postprocessMask } from "./maskPostprocess.mjs";
import { validateAlpha, allowedComponents, describeMetrics, looksLikePersonMatte, keepDominantSubject, } from "./extractionValidator.mjs";
import { measureGarmentColor, describeMeasuredColor } from "./pixelColor.mjs";
import { startTimings } from "./extractionTelemetry.mjs";
import { extractionFlag } from "./extractionFlags.mjs";
/**
 * Longest edge of a saved cutout.
 *
 * 800, not 1000. PNG encoding runs in JS (UPNG) and measured 11s of a 26s run
 * — by far the largest single cost in the pipeline. 800px is 36% fewer pixels,
 * and the upload optimiser re-encodes to WebP at 1000 anyway, so nothing
 * downstream was ever using the extra resolution on a wardrobe card.
 */
const MAX_EDGE = 800;
/**
 * Phase 3 — do not extract what isn't visible.
 *
 * "T-shirt detected but mostly hidden behind the jacket. Add it from a
 * separate photo." That message is useful. Two disconnected hands are not.
 */
function occlusionSkip(region) {
    if (!extractionFlag("visibilityGate"))
        return null;
    const fraction = Number(region.visibleFraction);
    const mostlyHidden = region.visibility === "mostly_hidden";
    const tooLittle = Number.isFinite(fraction) && fraction > 0 && fraction < 0.5;
    if (!mostlyHidden && !tooLittle)
        return null;
    const behind = region.occludedBy?.trim();
    return {
        index: -1, // filled in by the caller
        type: region.type,
        label: region.label,
        reason: "occluded",
        message: behind
            ? `${region.label} is mostly hidden behind the ${behind}. Add it from a separate photo.`
            : `${region.label} is mostly hidden in this photo. Add it from a separate photo.`,
    };
}
export async function extractIdentifiedWornRegionsV2(photoUri, regions, onProgress) {
    const progress = onProgress ?? (() => { });
    const timings = startTimings(`worn-partition (${regions.length} items)`);
    const skipped = [];
    progress("Reading original photo…");
    // 1024, not the 1280 default. decodeToRGBA decodes JPEG in JS and measured
    // 4.4s of a 16s run; 1024 is 36% fewer pixels. Nothing downstream sees the
    // difference: the matte is computed at 512 and upscaled either way, and every
    // saved cutout is capped at MAX_EDGE (1000) below.
    const photo = await timings.measure("decode+resize", () => decodeToRGBA(photoUri, 1024));
    await yieldToUI();
    // Phase 3 runs BEFORE any pixel work: a garment we will not extract should
    // not cost an inference or a postprocess pass.
    const candidates = [];
    regions.forEach((region, index) => {
        const skip = occlusionSkip(region);
        if (skip) {
            skipped.push({ ...skip, index });
            console.log(`[extract] skipping "${region.label}" — ${skip.message}`);
            return;
        }
        candidates.push({
            index,
            type: String(region.type || "garment").toLowerCase(),
            label: region.label || "Garment",
            boundingBox: region.boundingBox ?? [],
            occludedBy: region.occludedBy,
        });
    });
    if (candidates.length === 0) {
        return {
            ok: false,
            reason: "no_items_extracted",
            message: skipped[0]?.message ??
                "Every detected garment was too hidden to extract from this photo.",
            items: [],
            cutOffTypes: [],
            skipped,
        };
    }
    progress("Removing background…");
    // ONE inference for the whole photo, whatever the item count.
    //
    // MODNet is a PORTRAIT matting model and is the right engine for a worn
    // outfit. It is the wrong engine for a flat-lay, a hanger shot or a product
    // photo — there it returns almost nothing, and without this fallback every
    // garment in such a photo would fail the gate with no useful explanation.
    // u2netp is generic saliency and needs no person. Still exactly one
    // inference per photo in the normal case.
    let personAlpha = await timings.measure("inference", () => matteWithModnet(photo));
    await yieldToUI();
    if (!looksLikePersonMatte(personAlpha, photo.width, photo.height)) {
        console.log("[extract] no subject in the matte — switching to u2netp saliency");
        progress("No person detected — isolating the garment…");
        personAlpha = await timings.measure("inference", () => matteWithU2netp(photo));
        await yieldToUI();
    }
    // A busy room leaves stray blobs in the matte — a bin bag, a chair edge.
    // Clean them here, once, rather than letting each garment inherit them.
    const strays = timings.measureSync("postprocess", () => keepDominantSubject(personAlpha, photo.width, photo.height));
    if (strays > 0)
        console.log(`[matte] removed ${strays}px of scene fragments`);
    const partition = timings.measureSync("partition", () => {
        const result = partitionGarments(candidates, personAlpha, photo.width, photo.height);
        // Boxes cannot express a garment-to-garment boundary — they only draw
        // straight lines. Fit a smooth seam through each overlap instead, so the
        // trouser hem follows each leg to its own height without the boundary
        // tearing into a fringe.
        if (result.accepted.length > 1) {
            resolveGarmentBoundaries(result.ownership, result.accepted.map((detection) => detection.box), result.accepted.map((detection) => detection.label), photo.data, personAlpha, photo.width, photo.height);
        }
        return result;
    });
    for (const rejection of partition.rejected) {
        skipped.push({
            index: rejection.index,
            type: rejection.type,
            label: rejection.label,
            // A garment behind another one is an occlusion result, not a bad
            // detection — the UI phrases the two differently.
            reason: rejection.code === "layered_behind" ? "occluded" : "detection",
            message: rejection.message,
        });
        console.log(`[extract] dropped detection "${rejection.label}" — ${rejection.code}`);
    }
    // DETECTION SANITY.
    //
    // Measured failure: on one office photo Gemini returned an "Ethnic Fusion"
    // outfit — a sleeveless kurta and white lace-hem trousers — for a teal shirt
    // and navy trousers, with boxes covering a small patch of the frame. The
    // pipeline dutifully cut that patch up and presented it as ready.
    //
    // The matte knows how big the person is. If the detected garments together
    // claim almost none of that person, the detection does not describe this
    // photo and nothing downstream can rescue it. Say so instead.
    {
        let subjectPixels = 0;
        for (let i = 0; i < personAlpha.length; i++)
            if (personAlpha[i] > 127)
                subjectPixels++;
        const claimed = partition.ownedPixels.reduce((sum, count) => sum + count, 0);
        const share = subjectPixels > 0 ? claimed / subjectPixels : 0;
        console.log(`[extract] detected garments cover ${(share * 100).toFixed(1)}% of the person`);
        if (subjectPixels > 0 && share < 0.2) {
            timings.report();
            return {
                ok: false,
                reason: "no_items_extracted",
                message: "The detected garments don't match the person in this photo. Try again, or crop closer to the outfit.",
                items: [],
                cutOffTypes: [],
                skipped,
            };
        }
    }
    const items = [];
    for (let slot = 0; slot < partition.accepted.length; slot++) {
        const detection = partition.accepted[slot];
        const maxComponents = allowedComponents(detection.type);
        try {
            // Step 4 — this garment's pixels only.
            let cutout = buildOwnedCutout(photo.data, photo.width, personAlpha, partition.ownership, slot, detection.box);
            // Step 5 — Phase 6 postprocessing on ALPHA ONLY. RGB is byte-exact from
            // the source photo throughout; nothing is repainted or reconstructed.
            const pixels = cutout.width * cutout.height;
            const alpha = new Uint8Array(pixels);
            for (let i = 0; i < pixels; i++)
                alpha[i] = cutout.data[i * 4 + 3];
            let skinRemoved = 0;
            if (extractionFlag("maskPostprocess")) {
                const report = timings.measureSync("postprocess", () => postprocessMask(cutout.data, alpha, cutout.width, cutout.height, {
                    maxComponents,
                    // OFF by default. Carving the wearer's hands, neck and face out of
                    // a garment leaves ragged holes that read as damage. Body parts
                    // inside the cutout look deliberate; holes where they were do not.
                    excludeSkin: extractionFlag("skinExclusion"),
                    // Also off: a band trim is a hard straight cut, and the colour
                    // partition now finds the real hem instead.
                    trimEdges: extractionFlag("edgeBandTrim"),
                    label: `${detection.type}/${detection.label}`,
                }));
                skinRemoved = report.skinRemoved;
            }
            // Clean the faint halo off the edge WITHOUT hardening it.
            //
            // The matte is computed at 512 and upscaled, so its edge is a wide,
            // very translucent band that reads as a smear. The first version of this
            // remapped 64..192 -> 0..255, which doubled the gradient slope: the smear
            // went away and was replaced by a visibly stair-stepped, aliased edge.
            //
            // 40..210 is gentle. It clears the near-invisible tail that causes the
            // smear and leaves the rest of the ramp intact, so the edge stays
            // antialiased and smooth.
            for (let i = 0; i < pixels; i++) {
                const a = alpha[i];
                let ramped = a;
                if (a > 0 && a < 255) {
                    ramped = a <= 40 ? 0 : a >= 210 ? 255 : Math.round(((a - 40) * 255) / 170);
                }
                alpha[i] = ramped;
                cutout.data[i * 4 + 3] = ramped;
            }
            // Step 6 — Phase 1 gate, on the finished alpha.
            if (extractionFlag("validationGate")) {
                const verdict = timings.measureSync("validate", () => validateAlpha(alpha, cutout.width, cutout.height, detection.type, skinRemoved, {
                    hadNeighbour: detection.overlapsNeighbour,
                }));
                console.log(`[validate] ${detection.type}/${detection.label}: ` +
                    `${verdict.ok ? "PASS" : `REJECT(${verdict.code})`} ${describeMetrics(verdict.metrics)}`);
                if (!verdict.ok) {
                    skipped.push({
                        index: detection.index,
                        type: detection.type,
                        label: detection.label,
                        reason: "validation",
                        message: verdict.message ?? "This garment could not be cut out cleanly.",
                    });
                    await yieldToUI();
                    continue;
                }
            }
            const cropped = tightCrop(cutout);
            if (!cropped) {
                skipped.push({
                    index: detection.index,
                    type: detection.type,
                    label: detection.label,
                    reason: "validation",
                    message: "Nothing of this garment survived the cutout.",
                });
                continue;
            }
            cutout = cropped;
            // Step 7 — Phase 2b. Measured on the FINAL cutout pixels, so it can never
            // pick up background or another garment.
            let measured;
            if (extractionFlag("measuredColor")) {
                measured = measureGarmentColor(cutout.data, cutout.width, cutout.height) ?? undefined;
                if (measured) {
                    console.log(`[colour] ${detection.label}: ${describeMeasuredColor(measured)}` +
                        `${measured.filtered ? "" : " (highlight/shadow filter relaxed — achromatic fabric)"}`);
                }
            }
            progress(`Saving ${items.length + 1} of ${partition.accepted.length}…`);
            const longest = Math.max(cutout.width, cutout.height);
            const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
            const output = scale < 1
                ? resizeRGBA(cutout, Math.max(1, Math.round(cutout.width * scale)), Math.max(1, Math.round(cutout.height * scale)))
                : cutout;
            const uri = await timings.measure("encode", () => savePNG(output, `partition-${detection.type}-${Date.now()}-${detection.index}.png`));
            items.push({
                type: detection.type,
                label: detection.label,
                confidence: 1,
                uri,
                width: output.width,
                height: output.height,
                sourceIndex: detection.index,
                measuredColor: measured,
            });
            await yieldToUI();
        }
        catch (error) {
            console.log(`[extract] "${detection.label}" failed:`, error);
            skipped.push({
                index: detection.index,
                type: detection.type,
                label: detection.label,
                reason: "failed",
                message: "This garment could not be processed from this photo.",
            });
        }
    }
    timings.report();
    if (items.length === 0) {
        return {
            ok: false,
            reason: "no_items_extracted",
            message: skipped[0]?.message ?? "No garment could be extracted cleanly from this photo.",
            items: [],
            cutOffTypes: [],
            skipped,
        };
    }
    return { ok: true, items, cutOffTypes: [], skipped };
}
