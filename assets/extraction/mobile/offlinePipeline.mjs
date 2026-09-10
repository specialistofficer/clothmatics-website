// Generated from src/ai/offlinePipeline.ts; see source-manifest.json.
/**
 * Commercially cleared on-device extraction paths.
 *
 * Worn photos use MODNet for person/background separation plus regions from
 * the analysis step. Flat-lay photos use U2NetP.
 */
import { decodeToRGBA, filterComponents, maskBBox, resizeRGBA, savePNG, } from "./imageTensor.mjs";
import { matteWithModnet, cutoutFlatLay, cutoutSingleGarment, yieldToUI, } from "./mattingModels.mjs";
import { refineMatteFast, decontaminate } from "./matting.mjs";
import { saveCutout } from "./outputEncoder.mjs";
import { checkNSFW, NSFW_REJECT_MESSAGE } from "./nsfwService.mjs";
import { extractIdentifiedWornRegionsV2 } from "./wornPartitionPipeline.mjs";
import { extractionFlag, rollbackExtractionV2 } from "./extractionFlags.mjs";
import { recordExtractionEvent } from "./extractionDiagnostics.mjs";
import { tightCrop } from "./garmentPartition.mjs";
import { looksLikePersonMatte } from "./extractionValidator.mjs";
import { hardenMatteAlpha, keepLargestAlphaComponents, recoverBoundaryNotches, shouldAttemptFocusedWornMatte, shouldSolidifyWornContext, solidifyClosedForegroundInterior, solidifyForegroundInterior, } from "./maskPostprocess.mjs";
import { canWornRegionVerticallyOwn, evaluateRegionSaveQuality, evaluateWornOutputGeometry, } from "./regionSaveQuality.mjs";
import { applyWornPairOwnershipAlpha, buildBottomShoePairSeams, clearUnownedShoeContamination, evaluateWornShoeOutputQuality, evaluateWornPairSaveQuality, measureWornShoeUpperThirdRetention, trimBorderlineWornUpperOverlap, } from "./wornPairSeams.mjs";
import { beginGarmentQaRun, captureQaAlphaFromRgba, captureQaMask, captureQaRgba, finishGarmentQaRun, } from "./garmentQa.mjs";
/** Message used when keeping the original is safer than saving a damaged cutout. */
export const PRESERVE_ORIGINAL_MESSAGE = "This item cannot be isolated reliably, so the original photo was kept.";
/**
 * Entry point used by the wardrobe screen.
 *
 * TWO LEVELS OF FALLBACK protect the shipped behaviour:
 *
 *  1. `EXTRACTION_FLAGS.singlePassPartition = false` sends every photo down
 *     the legacy extractor below — the exact code that shipped before the
 *     extraction action plan.
 *  2. If the new pipeline throws, or returns nothing at all while the legacy
 *     one might still succeed, the flag is rolled back for the session and
 *     the legacy extractor runs on the same photo immediately. The user gets
 *     a result rather than an error.
 *
 * A result with SOME items and some skipped ones is a success, not a failure:
 * the whole point of Phase 1 and Phase 3 is that a garment we cannot cut
 * cleanly should be reported, not faked.
 */
async function extractIdentifiedWornRegionsBoxOnly(photoUri, regions, onProgress) {
    if (!extractionFlag("singlePassPartition")) {
        return extractIdentifiedWornRegionsLegacy(photoUri, regions, onProgress);
    }
    try {
        const result = await extractIdentifiedWornRegionsV2(photoUri, regions, onProgress);
        if (result.items.length > 0)
            return result;
        // Nothing came out. If every item was deliberately skipped (occluded, or
        // rejected by the quality gate) that is the correct answer and must not be
        // papered over with a worse extractor. Only an empty-handed run with no
        // explanation falls through.
        if (result.skipped && result.skipped.length > 0)
            return result;
        console.warn("[extract] V2 produced no items and no reasons — trying legacy extractor");
    }
    catch (error) {
        rollbackExtractionV2(error instanceof Error ? error.message : String(error));
    }
    const legacy = await extractIdentifiedWornRegionsLegacy(photoUri, regions, onProgress);
    console.log(`[extract] legacy extractor returned ${legacy.items.length} item(s)`);
    return legacy;
}
/**
 * Auto Extract mission entry point.
 *
 * MODNet removes only the scene around the complete person. Gemini boxes then
 * divide that truthful source matte into garment previews. Normal worn-photo
 * contact (hands, feet, neck, lanyards and ID cards) deliberately remains, so
 * the pipeline never creates holes by pretending it can reconstruct fabric
 * hidden behind those pixels.
 */
export async function extractIdentifiedWornRegions(photoUri, regions, onProgress) {
    return extractIdentifiedWornRegionsLegacy(photoUri, regions, onProgress);
}
/**
 * LEGACY EXTRACTOR — the behaviour that shipped before the action plan.
 *
 * Person-first worn-garment extraction: boxes decide which garment region is
 * saved; MODNet removes only scene background. RGB is copied byte-for-byte
 * from the source and is never refined, repainted, decontaminated, or
 * reconstructed.
 */
export async function extractIdentifiedWornRegionsLegacy(photoUri, regions, onProgress) {
    const progress = onProgress ?? (() => { });
    await beginGarmentQaRun(photoUri, "identified-worn-regions-legacy");
    progress("Reading original photo…");
    const photo = await decodeToRGBA(photoUri, 1024);
    captureQaRgba("01_decoded_oriented", photo);
    await yieldToUI();
    progress("Removing background…");
    const alpha = await matteWithModnet(photo);
    captureQaMask("06_person_resized_mask", alpha, photo.width, photo.height);
    await yieldToUI();
    if (!looksLikePersonMatte(alpha, photo.width, photo.height)) {
        void recordExtractionEvent("person_box_rejected", { reason: "no_person_matte" }, "warning");
        await finishGarmentQaRun("rejected-no-person-matte", {
            sourceWidth: photo.width,
            sourceHeight: photo.height,
        });
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "The person could not be separated from the scene. Try a clearer, well-lit photo.",
            items: [],
            cutOffTypes: [],
        };
    }
    // Vertical ownership per garment, from the boxes Gemini already returned.
    //
    // The boxes OVERLAP: on the measured photo the trousers box (y 375-758)
    // starts inside the shirt box (206-415) and ends inside the shoes box
    // (695-806) — a tucked shirt and a hem over the shoe genuinely share rows.
    // Cropping alone therefore always shipped the shirt inside the trousers
    // item. Where two garments' boxes overlap vertically, the row midway
    // through the overlap is the ownership boundary: the belt line lands in
    // the trousers, the shoe line in the shoes.
    const ownership = regions.map((region) => {
        if (!Array.isArray(region.boundingBox) || region.boundingBox.length !== 4)
            return null;
        const [by0, , by1] = [Number(region.boundingBox[0]), 0, Number(region.boundingBox[2])];
        if (!Number.isFinite(by0) || !Number.isFinite(by1))
            return null;
        const bx0 = Number(region.boundingBox[1]);
        const bx1 = Number(region.boundingBox[3]);
        return {
            y0: Math.min(by0, by1), y1: Math.max(by0, by1), cy: (by0 + by1) / 2,
            x0: Math.min(bx0, bx1), x1: Math.max(bx0, bx1),
        };
    });
    const saveQualities = regions.map(evaluateRegionSaveQuality);
    const pairSeams = buildBottomShoePairSeams(regions.map((region, index) => ({
        type: region.type,
        label: region.label,
        boundingBox: region.boundingBox,
        saveWorthy: saveQualities[index].saveWorthy,
    })), photo.data, alpha, photo.width, photo.height);
    const pairedShoeIndices = new Set(pairSeams.map((seam) => seam.lowerIndex));
    for (const seam of pairSeams) {
        void recordExtractionEvent("person_box_pair_seam", {
            upperIndex: seam.upperIndex,
            lowerIndex: seam.lowerIndex,
            upperType: regions[seam.upperIndex]?.type,
            lowerType: regions[seam.lowerIndex]?.type,
            moved: seam.report.moved,
            modelled: seam.report.modelled,
            seams: seam.report.seams,
            shapeSeams: seam.report.shapeSeams,
            inseparablePairs: seam.report.inseparablePairs,
            protectedUpperOnlyColumns: seam.report.protectedUpperOnlyColumns,
            recoveredUpperResiduePixels: seam.report.recoveredUpperResiduePixels,
            shoeProtection: seam.shoeProtection,
            overlap: seam.overlap,
        });
    }
    const verticalKeep = ownership.map((own, i) => {
        if (!own)
            return { top: 0, bottom: 1000, left: 0, right: 1000 };
        let top = 0;
        let bottom = 1000;
        for (let j = 0; j < ownership.length; j++) {
            if (j === i || !ownership[j])
                continue;
            if (!canWornRegionVerticallyOwn(regions[i]?.type ?? "", regions[j]?.type ?? "", saveQualities[j].saveWorthy))
                continue;
            const other = ownership[j];
            // Only garments clearly stacked above/below take ownership; side-by-side
            // items (centres within 40/1000 vertically) never clip each other.
            //
            // ASYMMETRIC ON PURPOSE. A garment's own lower edge must be kept: a
            // trouser hem falls BEHIND the shoe, so the midpoint of that overlap
            // (y=727 for the measured photo) amputated the cuffs at mid-shin. The
            // garment below only claims rows past this garment's own bottom edge.
            // The upper boundary stays at the midpoint, because there a tucked
            // waistband genuinely belongs to the lower garment.
            if (other.cy < own.cy - 40)
                top = Math.max(top, Math.round((other.y1 + own.y0) / 2));
            if (other.cy > own.cy + 40)
                bottom = Math.min(bottom, own.y1);
        }
        // HORIZONTAL ownership too. The crop is padded generously (28% for
        // bottoms) so a baggy leg is never clipped, but that padding also drags in
        // whatever is beside the garment — the hands hanging either side of the
        // trousers, and a sliver of shirt. Keep the garment's own x-range plus a
        // modest margin for fabric the box under-measures; anything further out
        // belongs to the scene, not this item.
        // Gemini's trouser box already follows the outer fabric. Expanding it was
        // adding a hand hanging beside the leg back into the item. Tops retain a
        // small safety margin because sleeves are more frequently under-boxed.
        const garmentType = regions[i]?.type?.toLowerCase() ?? "";
        // A shoe paired with trousers keeps its complete box overlap here. Its
        // actual top edge is decided per column by pairSeams below; retaining the
        // old flat midpoint first would amputate the higher shoe before the fitted
        // seam gets a chance to protect it.
        if (pairedShoeIndices.has(i))
            top = own.y0;
        // Tops and held objects keep the complete MODNet outer silhouette inside
        // the padded crop. A second horizontal ownership cut produced the stepped
        // rectangular shoulder seen in the phone trace. Bottoms keep their exact
        // Gemini x-range so an adjacent hanging hand is not added to trousers.
        if (garmentType !== "bottom")
            return { top, bottom, left: 0, right: 1000 };
        return { top, bottom, left: own.x0, right: own.x1 };
    });
    const items = [];
    const skipped = [];
    // At most one extra portrait pass per photo. It is reserved for a measured
    // upper-body failure, so normal and lower-end-phone runs remain single-pass.
    let focusedRefinementAttempted = false;
    // A severe lower-body rectangle is rare and gets one independent rescue
    // attempt even when the upper-body fallback already ran for the same photo.
    let focusedLowerRefinementAttempted = false;
    for (let index = 0; index < regions.length; index++) {
        const region = regions[index];
        const saveQuality = saveQualities[index];
        void recordExtractionEvent("region_save_quality", {
            sourceIndex: index,
            type: region.type,
            visibility: region.visibility,
            visibleFraction: saveQuality.visibleFraction,
            occludedBy: region.occludedBy,
            extractionReady: region.extractionReady,
            saveWorthy: saveQuality.saveWorthy,
            reason: saveQuality.reason,
        }, saveQuality.saveWorthy ? "info" : "warning");
        if (!saveQuality.saveWorthy) {
            skipped.push({
                index,
                type: region.type,
                label: region.label,
                reason: region.occludedBy ? "occluded" : "validation",
                message: saveQuality.message ?? `${region.label} is not sufficiently visible to save.`,
            });
            continue;
        }
        const lowerPairSeam = pairSeams.find((seam) => seam.lowerIndex === index);
        if (lowerPairSeam) {
            const pairQuality = evaluateWornPairSaveQuality(lowerPairSeam);
            void recordExtractionEvent("person_box_pair_save_quality", {
                sourceIndex: index,
                type: region.type,
                saveWorthy: pairQuality.saveLower,
                reason: pairQuality.reason,
                protectedColumnFraction: pairQuality.protectedColumnFraction,
                recoveredResidueFraction: pairQuality.recoveredResidueFraction,
                recoveredResidueLimit: pairQuality.recoveredResidueLimit,
                recoveredResidueToLowerFraction: pairQuality.recoveredResidueToLowerFraction,
                recoveredResidueToLowerLimit: pairQuality.recoveredResidueToLowerLimit,
            }, pairQuality.saveLower ? "info" : "warning");
            if (!pairQuality.saveLower) {
                skipped.push({
                    index,
                    type: region.type,
                    label: region.label,
                    reason: "validation",
                    message: `${region.label} overlaps the trouser hems differently on each foot, ` +
                        "so a clean cutout could not be verified. Photograph the shoes separately to save them.",
                });
                continue;
            }
        }
        if (!Array.isArray(region.boundingBox) || region.boundingBox.length !== 4)
            continue;
        const [ny0, nx0, ny1, nx1] = region.boundingBox.map(Number);
        if (![ny0, nx0, ny1, nx1].every(Number.isFinite))
            continue;
        // Category-aware padding compensates for conservative Gemini boxes. Wide
        // garments need substantially more horizontal room so both sleeves, both
        // trouser legs, and pairs of shoes survive the crop.
        const rawX0 = Math.floor((Math.min(nx0, nx1) / 1000) * photo.width);
        const rawY0 = Math.floor((Math.min(ny0, ny1) / 1000) * photo.height);
        const rawX1 = Math.ceil((Math.max(nx0, nx1) / 1000) * photo.width) - 1;
        const rawY1 = Math.ceil((Math.max(ny0, ny1) / 1000) * photo.height) - 1;
        const type = region.type.toLowerCase();
        const shoeFamily = type === "shoes" || type === "shoe" || type === "footwear" ||
            type === "sneakers" || type === "sneaker" || type === "boots" ||
            type === "sandals";
        const lowerGarmentFamily = type === "bottom" || type === "bottoms" || type === "trousers" ||
            type === "pants" || type === "jeans" || type === "shorts" ||
            type === "skirt";
        // Cuffs, hems, tongues and laces are narrow high-frequency boundaries.
        // The standard 64..192 compression removed material pixels from both the
        // trousers and shoes in the phone/NVIDIA regression. Preserve more of the
        // original MODNet ramp for lower garments; RGB remains byte-exact.
        const alphaHardenLow = lowerGarmentFamily || shoeFamily ? 32 : 64;
        const alphaHardenHigh = lowerGarmentFamily || shoeFamily ? 224 : 192;
        const boxWidth = Math.max(1, rawX1 - rawX0 + 1);
        const boxHeight = Math.max(1, rawY1 - rawY0 + 1);
        const horizontalRatio = type === "bottom" ? 0.28
            : type === "shoes" ? 0.24
                : type === "top" || type === "kurta" ? 0.18
                    : 0.14;
        const verticalRatio = type === "shoes" ? 0.18 : 0.10;
        const padX = Math.round(boxWidth * horizontalRatio);
        const padY = Math.round(boxHeight * verticalRatio);
        const x0 = Math.max(0, rawX0 - padX);
        const y0 = Math.max(0, rawY0 - padY);
        const x1 = Math.min(photo.width - 1, rawX1 + padX);
        const y1 = Math.min(photo.height - 1, rawY1 + padY);
        if (x1 <= x0 || y1 <= y0)
            continue;
        const width = x1 - x0 + 1;
        const height = y1 - y0 + 1;
        const data = new Uint8Array(width * height * 4);
        let visible = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const sourcePixel = (y + y0) * photo.width + (x + x0);
                const source = sourcePixel * 4;
                const target = (y * width + x) * 4;
                data[target] = photo.data[source];
                data[target + 1] = photo.data[source + 1];
                data[target + 2] = photo.data[source + 2];
                data[target + 3] = alpha[sourcePixel];
                if (alpha[sourcePixel] > 20)
                    visible++;
            }
        }
        if (visible < width * height * 0.02)
            continue;
        let preservationRepairApplied = false;
        let preservationCandidateFraction = 0;
        let preservationDecisionReason = "not-evaluated";
        let preservationOuterEdgePixels = 0;
        let focusedMatteSelected = false;
        let focusedMatteGlobalRepairFraction = 0;
        let focusedMatteRepairFraction = 0;
        let shoeComponentReport = null;
        let shoeUnownedCleanup = null;
        let alphaHardenReport = null;
        let shoeRetentionBeforeOwnership = null;
        let shoeRetentionAfterOwnership = null;
        let shoeRetentionAfterCleanup = null;
        let shoeRetentionAfterComponents = null;
        let shoeRetentionFinal = null;
        // Two contained cleanups on the crop's ALPHA only — RGB stays byte-exact.
        //
        // 1. Drop disconnected debris. The person matte occasionally keeps a
        //    nearby dark object (a bin bag beside the leg); it arrives as a
        //    floating blob. Components ≥15% of the largest survive, so a pair of
        //    shoes (two similar components) is never touched.
        // 2. Steepen the edge ramp. The matte is computed at 512px and upscaled,
        //    so its soft edge becomes a ~15px translucent band at photo size that
        //    reads as a smear against any background. Remapping 64..192 → 0..255
        //    halves the band while keeping the edge antialiased.
        {
            // 0. Vertical ownership: zero alpha on rows another garment owns. The
            //    padded crop may legitimately show them (context), but their pixels
            //    belong to the other item's cutout.
            const keep = verticalKeep[index];
            const keepTopPx = Math.round((keep.top / 1000) * photo.height) - y0;
            const keepBottomPx = Math.round((keep.bottom / 1000) * photo.height) - y0;
            const keepLeftPx = Math.round((keep.left / 1000) * photo.width) - x0;
            const keepRightPx = Math.round((keep.right / 1000) * photo.width) - x0;
            const pairSeam = pairSeams.find((seam) => seam.upperIndex === index || seam.lowerIndex === index);
            for (let y = 0; y < height; y++) {
                const rowOutside = y < keepTopPx || y >= keepBottomPx;
                const row = y * width;
                for (let x = 0; x < width; x++) {
                    const targetAlpha = (row + x) * 4 + 3;
                    if (rowOutside || x < keepLeftPx || x >= keepRightPx) {
                        data[targetAlpha] = 0;
                        continue;
                    }
                }
            }
            if (shoeFamily && pairSeam?.lowerIndex === index) {
                shoeRetentionBeforeOwnership = measureWornShoeUpperThirdRetention(data, width, height, x0, y0, photo.width, alpha, pairSeam);
            }
            const pairOwnership = pairSeam
                ? applyWornPairOwnershipAlpha(data, width, height, x0, y0, photo.width, pairSeam, index)
                : { clearedPixels: 0, clearedOutsideOverlapPixels: 0 };
            const upperOverlapTrim = pairSeam
                ? trimBorderlineWornUpperOverlap(data, width, height, x0, y0, pairSeam, index)
                : { applied: false, clearedPixels: 0, modelDistance: 0, cutoffY: -1 };
            if (upperOverlapTrim.applied) {
                void recordExtractionEvent("person_box_borderline_upper_overlap_trimmed", {
                    sourceIndex: index,
                    type,
                    ...upperOverlapTrim,
                });
            }
            captureQaAlphaFromRgba(`07_owned_region_mask_${index}_${type}`, { data, width, height });
            if (pairSeam) {
                void recordExtractionEvent("person_box_pair_ownership_applied", {
                    sourceIndex: index,
                    type: region.type,
                    pairRole: pairSeam.upperIndex === index ? "upper" : "lower",
                    clearedPixels: pairOwnership.clearedPixels,
                    clearedOutsideOverlapPixels: pairOwnership.clearedOutsideOverlapPixels,
                });
            }
            if (shoeFamily && pairSeam?.lowerIndex === index) {
                shoeRetentionAfterOwnership = measureWornShoeUpperThirdRetention(data, width, height, x0, y0, photo.width, alpha, pairSeam);
                shoeUnownedCleanup = clearUnownedShoeContamination(data, width, height, x0, y0, photo.width, pairSeam);
                void recordExtractionEvent("person_box_shoe_unowned_cleanup", {
                    sourceIndex: index,
                    type,
                    ...shoeUnownedCleanup,
                });
                shoeRetentionAfterCleanup = measureWornShoeUpperThirdRetention(data, width, height, x0, y0, photo.width, alpha, pairSeam);
            }
            console.log(`[extract] ${region.type}: ownership rows ${Math.max(0, keepTopPx)}-${Math.min(height, keepBottomPx)}/${height} ` +
                `cols ${Math.max(0, keepLeftPx)}-${Math.min(width, keepRightPx)}/${width}`);
            const measureMatte = (rgba) => {
                let visiblePixels = 0;
                for (let pixel = 0; pixel < width * height; pixel++) {
                    if (rgba[pixel * 4 + 3] > 20)
                        visiblePixels++;
                }
                const repaired = rgba.slice();
                const repairPixels = solidifyForegroundInterior(repaired, width, height);
                return {
                    coverage: visiblePixels / Math.max(1, width * height),
                    repairFraction: repairPixels / Math.max(1, width * height),
                };
            };
            const globalMatteData = data.slice();
            const globalMatteStats = measureMatte(globalMatteData);
            focusedMatteGlobalRepairFraction = globalMatteStats.repairFraction;
            const upperBody = type === "top" || type === "kurta" || type === "traditional wear";
            const hasContactObject = (region.extractionObstructions?.filter(Boolean).length ?? 0) > 0;
            const focusedRetryNeeded = shouldAttemptFocusedWornMatte(type, hasContactObject ? 1 : 0, globalMatteStats.repairFraction, photo.width, photo.height);
            if (!focusedRefinementAttempted && upperBody && focusedRetryNeeded) {
                focusedRefinementAttempted = true;
                progress("Refining the difficult upper-body edge…");
                const focusedAlpha = await matteWithModnet({
                    data: data.slice(),
                    width,
                    height,
                });
                const focusedData = data.slice();
                for (let y = 0; y < height; y++) {
                    const rowOutside = y < keepTopPx || y >= keepBottomPx;
                    const row = y * width;
                    for (let x = 0; x < width; x++) {
                        focusedData[(row + x) * 4 + 3] =
                            rowOutside || x < keepLeftPx || x >= keepRightPx
                                ? 0
                                : focusedAlpha[row + x];
                    }
                }
                const focusedStats = measureMatte(focusedData);
                focusedMatteRepairFraction = focusedStats.repairFraction;
                // A focused crop is accepted only when it needs materially less
                // interior repair and still contains meaningful transparency. This
                // blocks the exact "blue window became shirt" rectangle regression.
                focusedMatteSelected =
                    focusedStats.coverage >= 0.18 &&
                        focusedStats.coverage <= 0.88 &&
                        focusedStats.repairFraction <= globalMatteStats.repairFraction - 0.04;
                if (focusedMatteSelected)
                    data.set(focusedData);
                void recordExtractionEvent("focused_person_matte_comparison", {
                    sourceIndex: index,
                    type,
                    globalCoverage: globalMatteStats.coverage,
                    globalRepairFraction: globalMatteStats.repairFraction,
                    focusedCoverage: focusedStats.coverage,
                    focusedRepairFraction: focusedStats.repairFraction,
                    selected: focusedMatteSelected,
                    selectionRule: "coverage-0.18..0.88-and-repair-improves-by-0.04",
                });
            }
            // Preserve the complete worn context inside the outer foreground edge.
            // There is deliberately no component deletion, skin subtraction,
            // colour selection or accessory removal here. A flower, bouquet, hand,
            // lanyard or ID card remains exactly as photographed.
            const preservationCandidate = data.slice();
            const restoredInteriorPixels = solidifyClosedForegroundInterior(preservationCandidate, width, height);
            preservationOuterEdgePixels = recoverBoundaryNotches(preservationCandidate, width, height, Math.max(12, Math.round(height * 0.08)), Math.max(6, Math.round(Math.min(width, height) * 0.035)));
            // Growing the outer edge can enclose another weak strip. Close it once,
            // deterministically, without another colour-growth pass.
            const afterEdgeInteriorPixels = preservationOuterEdgePixels > 0
                ? solidifyClosedForegroundInterior(preservationCandidate, width, height)
                : 0;
            const totalCandidatePixels = restoredInteriorPixels + preservationOuterEdgePixels + afterEdgeInteriorPixels;
            preservationCandidateFraction = totalCandidatePixels / Math.max(1, width * height);
            const preservationDecision = shouldSolidifyWornContext(type, region.extractionObstructions?.filter(Boolean).length ?? 0, preservationCandidateFraction, focusedMatteSelected);
            preservationDecisionReason = preservationDecision.reason;
            preservationRepairApplied = preservationDecision.apply;
            if (preservationRepairApplied)
                data.set(preservationCandidate);
            void recordExtractionEvent("person_box_preservation_decision", {
                sourceIndex: index,
                type,
                obstructionCount: region.extractionObstructions?.filter(Boolean).length ?? 0,
                obstructions: region.extractionObstructions?.filter(Boolean) ?? [],
                candidatePixels: totalCandidatePixels,
                candidateFraction: preservationCandidateFraction,
                interiorPixels: restoredInteriorPixels + afterEdgeInteriorPixels,
                outerEdgePixels: preservationOuterEdgePixels,
                outerEdgeStrategy: "geometric-notch",
                applied: preservationRepairApplied,
                reason: preservationDecisionReason,
            });
            if (preservationDecisionReason === "repair-too-large" &&
                (region.extractionObstructions?.filter(Boolean).length ?? 0) > 0) {
                skipped.push({
                    index,
                    type: region.type,
                    label: region.label,
                    reason: "validation",
                    message: `${region.label} could not be preserved reliably with the contact object in this photo. ` +
                        "The original source remains unchanged; try a clearer angle for this item.",
                });
                void recordExtractionEvent("person_box_quality_rejected", {
                    sourceIndex: index,
                    type,
                    reason: preservationDecisionReason,
                    candidateFraction: preservationCandidateFraction,
                }, "warning");
                continue;
            }
            if (preservationRepairApplied) {
                void recordExtractionEvent("person_box_interior_solidified", {
                    sourceIndex: index,
                    pixels: totalCandidatePixels,
                    outerEdgePixels: preservationOuterEdgePixels,
                    preservationMode: "complete-worn-context",
                });
            }
            // Compress the broad alpha ramp introduced when the 512px MODNet matte
            // is scaled back to the photo. RGB remains byte-for-byte unchanged.
            alphaHardenReport = hardenMatteAlpha(data, width, height, alphaHardenLow, alphaHardenHigh);
            void recordExtractionEvent("person_box_alpha_hardened", {
                sourceIndex: index,
                type,
                ...alphaHardenReport,
                low: alphaHardenLow,
                high: alphaHardenHigh,
            });
            // Shoes may be one connected pair or two separate components. Keep at
            // most two substantial islands, remove smaller debris, and never fill
            // the transparent gap between feet.
            if (shoeFamily) {
                shoeComponentReport = keepLargestAlphaComponents(data, width, height, {
                    maxComponents: 2,
                    minRelative: 0.15,
                    threshold: 20,
                });
                void recordExtractionEvent("person_box_shoe_components", {
                    sourceIndex: index,
                    type,
                    ...shoeComponentReport,
                }, shoeComponentReport.keptComponents >= 1 ? "info" : "warning");
                if (pairSeam?.lowerIndex === index) {
                    shoeRetentionAfterComponents = measureWornShoeUpperThirdRetention(data, width, height, x0, y0, photo.width, alpha, pairSeam);
                }
            }
            captureQaAlphaFromRgba(`09_postprocessed_region_mask_${index}_${type}`, { data, width, height });
            // The box decides the seam between neighbouring garments. Feather that
            // seam over a few pixels so the waist/cuff boundary is not a hard
            // rectangular guillotine; the outer person silhouette remains MODNet's
            // original antialiased edge.
            const seamFeather = 7;
            const pairSeamFeather = 3;
            const pairOwner = pairSeam?.upperIndex === index ? 0 : 1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const alphaIndex = (y * width + x) * 4 + 3;
                    const currentAlpha = data[alphaIndex];
                    if (currentAlpha === 0)
                        continue;
                    let distance = seamFeather;
                    if (keepTopPx > 0)
                        distance = Math.min(distance, y - keepTopPx + 1);
                    if (keepBottomPx < height)
                        distance = Math.min(distance, keepBottomPx - y);
                    if (keepLeftPx > 0)
                        distance = Math.min(distance, x - keepLeftPx + 1);
                    if (keepRightPx < width)
                        distance = Math.min(distance, keepRightPx - x);
                    let opacityScale = 1;
                    if (distance < seamFeather) {
                        const t = Math.max(0, distance / seamFeather);
                        opacityScale = t * t * (3 - 2 * t);
                    }
                    // The fitted bottom/shoe boundary is curved and may contain a
                    // connected colour protrusion, so the flat box-edge feather above
                    // cannot see it. Feather retained pixels against the OTHER pair
                    // owner over three pixels to remove the staircase/rectangle look.
                    if (pairSeam) {
                        const sourceX = x + x0;
                        const sourceY = y + y0;
                        const overlap = pairSeam.overlap;
                        const owner = sourceX >= overlap.x0 && sourceX <= overlap.x1 &&
                            sourceY >= overlap.y0 && sourceY <= overlap.y1
                            ? pairSeam.ownership[sourceY * photo.width + sourceX]
                            : -1;
                        if (owner === pairOwner) {
                            let pairDistance = pairSeamFeather + 1;
                            for (let radius = 1; radius <= pairSeamFeather; radius++) {
                                let touchesOther = false;
                                for (let dy = -radius; dy <= radius && !touchesOther; dy++) {
                                    for (let dx = -radius; dx <= radius; dx++) {
                                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius)
                                            continue;
                                        const sx = sourceX + dx;
                                        const sy = sourceY + dy;
                                        if (sx < overlap.x0 || sx > overlap.x1 ||
                                            sy < overlap.y0 || sy > overlap.y1)
                                            continue;
                                        const neighbourOwner = pairSeam.ownership[sy * photo.width + sx];
                                        if (neighbourOwner >= 0 && neighbourOwner !== pairOwner) {
                                            touchesOther = true;
                                            break;
                                        }
                                    }
                                }
                                if (touchesOther) {
                                    pairDistance = radius;
                                    break;
                                }
                            }
                            if (pairDistance <= pairSeamFeather) {
                                const t = pairDistance / (pairSeamFeather + 1);
                                const smooth = t * t * (3 - 2 * t);
                                opacityScale = Math.min(opacityScale, smooth);
                            }
                        }
                    }
                    if (opacityScale < 1)
                        data[alphaIndex] = Math.round(currentAlpha * opacityScale);
                }
            }
            if (shoeFamily && pairSeam?.lowerIndex === index) {
                shoeRetentionFinal = measureWornShoeUpperThirdRetention(data, width, height, x0, y0, photo.width, alpha, pairSeam);
                const stagedRetention = [
                    ["pair-ownership", shoeRetentionBeforeOwnership, shoeRetentionAfterOwnership],
                    ["unowned-cleanup", shoeRetentionAfterOwnership, shoeRetentionAfterCleanup],
                    ["harden-and-components", shoeRetentionAfterCleanup, shoeRetentionAfterComponents],
                    ["seam-feather", shoeRetentionAfterComponents, shoeRetentionFinal],
                ];
                let largestLossStage = "none-material";
                let largestLossFraction = 0;
                for (const [stage, before, after] of stagedRetention) {
                    if (!before || !after)
                        continue;
                    const loss = before.retainedFraction - after.retainedFraction;
                    if (loss > largestLossFraction) {
                        largestLossFraction = loss;
                        largestLossStage = stage;
                    }
                }
                if (largestLossFraction < 0.01)
                    largestLossStage = "none-material";
                void recordExtractionEvent("person_box_shoe_upper_third_retention", {
                    sourceIndex: index,
                    type,
                    beforeOwnership: shoeRetentionBeforeOwnership,
                    afterOwnership: shoeRetentionAfterOwnership,
                    afterCleanup: shoeRetentionAfterCleanup,
                    afterHardenAndComponents: shoeRetentionAfterComponents,
                    finalSavedMask: shoeRetentionFinal,
                    largestLossStage,
                    largestLossFraction,
                }, (shoeRetentionFinal?.retainedFraction ?? 1) >= 0.35 ? "info" : "warning");
            }
        }
        const outputPairSeam = pairSeams.find((seam) => seam.lowerIndex === index);
        let cropped = tightCrop({ data, width, height }, 6);
        if (!cropped)
            continue;
        let outputGeometry = evaluateWornOutputGeometry(cropped.data, cropped.width, cropped.height, photo.width, photo.height, type);
        if (outputGeometry.reason === "rectangular-bottom-output" &&
            !focusedLowerRefinementAttempted) {
            focusedLowerRefinementAttempted = true;
            progress("Refining the difficult trouser boundary…");
            const focusedAlpha = await matteWithModnet({
                data: cropped.data.slice(),
                width: cropped.width,
                height: cropped.height,
            });
            const focusedCandidate = {
                data: cropped.data.slice(),
                width: cropped.width,
                height: cropped.height,
            };
            for (let pixel = 0; pixel < focusedCandidate.width * focusedCandidate.height; pixel++) {
                focusedCandidate.data[pixel * 4 + 3] = focusedAlpha[pixel];
            }
            hardenMatteAlpha(focusedCandidate.data, focusedCandidate.width, focusedCandidate.height, alphaHardenLow, alphaHardenHigh);
            const focusedCrop = tightCrop(focusedCandidate, 6);
            const focusedGeometry = focusedCrop
                ? evaluateWornOutputGeometry(focusedCrop.data, focusedCrop.width, focusedCrop.height, photo.width, photo.height, type)
                : null;
            const focusedRetainedFraction = focusedGeometry
                ? focusedGeometry.foregroundPixels / Math.max(1, outputGeometry.foregroundPixels)
                : 0;
            const focusedSelected = Boolean(focusedCrop &&
                focusedGeometry?.saveWorthy &&
                focusedRetainedFraction >= 0.55 &&
                focusedGeometry.opaqueFillFraction <= outputGeometry.opaqueFillFraction - 0.04);
            void recordExtractionEvent("focused_lower_matte_comparison", {
                sourceIndex: index,
                type,
                original: outputGeometry,
                focused: focusedGeometry,
                focusedRetainedFraction,
                selected: focusedSelected,
                selectionRule: "clean-geometry-retain-0.55-and-fill-improves-by-0.04",
            }, focusedSelected ? "info" : "warning");
            if (focusedSelected && focusedCrop && focusedGeometry) {
                cropped = focusedCrop;
                outputGeometry = focusedGeometry;
            }
        }
        void recordExtractionEvent("person_box_output_geometry", {
            sourceIndex: index,
            type,
            ...outputGeometry,
            evaluatedStage: "tight-crop-before-encoding",
        }, outputGeometry.saveWorthy ? "info" : "warning");
        if (!outputGeometry.saveWorthy) {
            captureQaAlphaFromRgba(`10_rejected_geometry_mask_${index}_${region.type || "garment"}`, cropped);
            captureQaRgba(`11_rejected_geometry_garment_${index}_${region.type || "garment"}`, cropped);
            skipped.push({
                index,
                type: region.type,
                label: region.label,
                reason: "validation",
                message: outputGeometry.reason === "worn-output-too-small"
                    ? `${region.label} is visible, but too little of it is present to make a clear wardrobe item. ` +
                        "Use a closer photo if you want to save it."
                    : outputGeometry.reason === "truncated-lower-boundary"
                        ? `${region.label} was detected, but the visible lower edge ends through the garment instead of at a complete hem. ` +
                            "It was not added to your wardrobe; use a photo showing the complete item."
                        : `${region.label} was detected, but its background boundary could not be separated cleanly. ` +
                            "It was not added to your wardrobe; try a clearer photo or Single Garment mode.",
            });
            continue;
        }
        const longest = Math.max(cropped.width, cropped.height);
        const output = longest > 800
            ? resizeRGBA(cropped, Math.max(1, Math.round(cropped.width * 800 / longest)), Math.max(1, Math.round(cropped.height * 800 / longest)))
            : cropped;
        let transparent = 0;
        for (let pixel = 0; pixel < output.width * output.height; pixel++) {
            if (output.data[pixel * 4 + 3] <= 10)
                transparent++;
        }
        const transparentFraction = transparent / Math.max(1, output.width * output.height);
        if (outputPairSeam && shoeComponentReport) {
            const outputQuality = evaluateWornShoeOutputQuality(data, width, height, x0, y0, photo.width, outputPairSeam, shoeComponentReport.keptComponents, shoeComponentReport.removedFraction, {
                visibility: region.visibility,
                visibleFraction: saveQuality.visibleFraction,
                sourcePersonAlpha: alpha,
                tightCropTransparentFraction: transparentFraction,
                tightCropWidth: output.width,
                tightCropHeight: output.height,
                keptComponentSizes: shoeComponentReport.keptSizes,
            });
            void recordExtractionEvent("person_box_shoe_output_quality", {
                sourceIndex: index,
                type,
                ...outputQuality,
                evaluatedStage: "final-mask-after-ownership-cleanup-harden-components-and-feather",
                evaluatedOutputWidth: output.width,
                evaluatedOutputHeight: output.height,
                unownedExaminedPixels: shoeUnownedCleanup?.examinedPixels ?? 0,
                unownedClearedPixels: shoeUnownedCleanup?.clearedPixels ?? 0,
            }, outputQuality.saveLower ? "info" : "warning");
            if (!outputQuality.saveLower) {
                skipped.push({
                    index,
                    type: region.type,
                    label: region.label,
                    reason: "validation",
                    message: outputQuality.reason === "top-band-empty" || outputQuality.reason === "sparse-shoe-output"
                        ? `${region.label} was detected, but the saved mask is missing the upper shoe body. ` +
                            "It was not added to your wardrobe. Photograph the shoes separately for a complete cutout."
                        : outputQuality.reason === "ambiguous-shoe-boundary"
                            ? `${region.label} was detected, but the similarly coloured trouser and shoe boundary was not clean enough to save. ` +
                                "It was not added to your wardrobe. Try a clearer full-body photo or photograph the pair separately."
                            : outputQuality.reason === "imbalanced-shoe-components"
                                ? `${region.label} was detected, but one shoe was incomplete or distorted in the saved mask. ` +
                                    "It was not added to your wardrobe. Try a clearer full-body photo or photograph the pair separately."
                                : `${region.label} was visible, but the trouser/shoe boundary did not produce a complete clean pair. ` +
                                    "Photograph the shoes separately to save them accurately.",
                });
                continue;
            }
        }
        progress(`Saving ${index + 1} of ${regions.length}…`);
        void recordExtractionEvent("person_box_output", {
            sourceIndex: index,
            type: region.type,
            width: output.width,
            height: output.height,
            transparentFraction,
            bodyContactPreserved: true,
            preservationRepairApplied,
            preservationCandidateFraction,
            preservationDecisionReason,
            preservationOuterEdgePixels,
            focusedMatteSelected,
            focusedMatteGlobalRepairFraction,
            focusedMatteRepairFraction,
        });
        const uri = await savePNG(output, `identified-${region.type || "garment"}-${Date.now()}-${index}.png`);
        captureQaAlphaFromRgba(`10_final_mask_${index}_${region.type || "garment"}`, output);
        captureQaRgba(`11_final_garment_${index}_${region.type || "garment"}`, output);
        items.push({
            type: region.type || "garment",
            label: region.label || "Garment",
            confidence: 1,
            uri,
            width: output.width,
            height: output.height,
            sourceIndex: index,
        });
    }
    const result = items.length
        ? { ok: true, items, cutOffTypes: [], skipped }
        : {
            ok: false, reason: "no_items_extracted",
            message: "No intact garment regions could be extracted.",
            items: [], cutOffTypes: [], skipped,
        };
    await finishGarmentQaRun(result.ok ? "success" : "rejected-no-items", {
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        detectedRegions: regions.length,
        savedItems: items.length,
        skippedItems: skipped.length,
        // Persist the exact semantic inputs in debug QA mode. This turns each
        // phone case into a replayable regression fixture instead of leaving the
        // only copy of Gemini boxes/visibility decisions in transient logcat.
        regions: regions.map((region) => ({
            type: region.type,
            label: region.label,
            boundingBox: region.boundingBox,
            visibility: region.visibility,
            visibleFraction: region.visibleFraction,
            extractionReady: region.extractionReady,
            occludedBy: region.occludedBy,
            extractionObstructions: region.extractionObstructions,
        })),
        skipped: skipped.map((region) => ({
            index: region.index,
            type: region.type,
            label: region.label,
            reason: region.reason,
        })),
    });
    return result;
}
/**
 * FLAT-LAY: garment alone on a surface. One BiRefNet pass on the whole frame —
 * the highest-quality route, and the one to guide users toward.
 */
export async function extractFlatLay(photoUri, typeHint = "top", labelHint = "Garment", onProgress) {
    const progress = onProgress ?? (() => { });
    progress("Reading photo…");
    const photo = await decodeToRGBA(photoUri);
    await yieldToUI();
    progress("Removing background…");
    const cut = await cutoutFlatLay(photo);
    if (!cut) {
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "Couldn't find a garment in this photo.",
            items: [],
            cutOffTypes: [],
        };
    }
    progress("Saving…");
    // A flat-lay saliency model can lock onto a high-contrast hanger or label
    // instead of a pale shirt. Reject that undersized matte so the caller keeps
    // the full Gemini crop rather than saving the wrong object as clothing.
    const cutWidth = cut.box.x1 - cut.box.x0 + 1;
    const cutHeight = cut.box.y1 - cut.box.y0 + 1;
    if (cutWidth / photo.width < 0.72 || cutHeight / photo.height < 0.58) {
        console.log(`[flatlay] rejected undersized matte ${cutWidth}x${cutHeight}`);
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "Couldn't confidently isolate the full garment.",
            items: [],
            cutOffTypes: [],
        };
    }
    const saved = await saveCutout(cut.image, `flatlay-${Date.now()}`);
    progress("Done");
    return {
        ok: true,
        items: [
            {
                type: typeHint,
                label: labelHint,
                confidence: 0.95,
                uri: saved.uri,
                width: saved.width,
                height: saved.height,
            },
        ],
        cutOffTypes: [],
    };
}
/**
 * SINGLE GARMENT PHOTO: one garment laid on a surface or placed on a hanger.
 * This is intentionally separate from selfie Auto Extract. It uses generic
 * saliency matting, keeps the hanger when it is connected to/supporting the
 * garment, and has no portrait/person logic or drawing tools.
 */
export async function extractSingleGarmentPhoto(photoUri, labelHint = "Garment", onProgress, preserveLightFabric = false, options = {}) {
    const started = Date.now();
    const progress = onProgress ?? (() => { });
    await beginGarmentQaRun(photoUri, "single-garment");
    progress("Reading garment photo…");
    // The model consumes 320x320. This cap protects low-memory phones from a
    // multi-megapixel JS bitmap while keeping the model input unchanged.
    const photo = await decodeToRGBA(photoUri, 1024);
    captureQaRgba("01_decoded_oriented", photo);
    await yieldToUI();
    progress("Removing background…");
    const cut = await cutoutSingleGarment(photo, preserveLightFabric, options);
    if (!cut) {
        void recordExtractionEvent("single_cutout_rejected", {
            reason: "empty_mask",
            sourceWidth: photo.width,
            sourceHeight: photo.height,
            preserveLightFabric,
            totalMs: Date.now() - started,
        }, "warning");
        await finishGarmentQaRun("rejected-empty-mask", {
            sourceWidth: photo.width,
            sourceHeight: photo.height,
            preserveLightFabric,
        });
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "Couldn't isolate one complete garment. Try a clearer surface or more even lighting.",
            items: [],
            cutOffTypes: [],
        };
    }
    // A hand, label, or hanger fragment can be the most salient component. The
    // input is already a generous Gemini garment crop, so a valid result must
    // occupy a meaningful share of that focused image.
    const cutWidth = cut.box.x1 - cut.box.x0 + 1;
    const cutHeight = cut.box.y1 - cut.box.y0 + 1;
    const areaRatio = (cutWidth * cutHeight) / (photo.width * photo.height);
    const minSpan = preserveLightFabric ? 0.20 : 0.35;
    const minArea = preserveLightFabric ? 0.06 : 0.18;
    console.log(`[single-garment] output ${((cutWidth / photo.width) * 100).toFixed(1)}% x ` +
        `${((cutHeight / photo.height) * 100).toFixed(1)}%, area ${(areaRatio * 100).toFixed(1)}%, ` +
        `light=${preserveLightFabric}`);
    void recordExtractionEvent("single_cutout_geometry", {
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        cutWidth,
        cutHeight,
        widthFraction: cutWidth / photo.width,
        heightFraction: cutHeight / photo.height,
        areaRatio,
        minSpan,
        minArea,
        preserveLightFabric,
        tapRefine: Boolean(options.tapPoint),
    });
    if (cutWidth / photo.width < minSpan ||
        cutHeight / photo.height < minSpan ||
        areaRatio < minArea) {
        void recordExtractionEvent("single_cutout_rejected", {
            reason: "small_fragment",
            widthFraction: cutWidth / photo.width,
            heightFraction: cutHeight / photo.height,
            areaRatio,
            preserveLightFabric,
            totalMs: Date.now() - started,
        }, "warning");
        await finishGarmentQaRun("rejected-small-fragment", {
            widthFraction: cutWidth / photo.width,
            heightFraction: cutHeight / photo.height,
            areaRatio,
        });
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "Only a small fragment was detected, so it was not saved as the garment.",
            items: [],
            cutOffTypes: [],
        };
    }
    // Unlike extractFlatLay, do not reject a smaller subject: a garment hanging
    // in a doorway or against a wall can legitimately occupy less of the frame.
    const longest = Math.max(cut.image.width, cut.image.height);
    const scale = longest > 1000 ? 1000 / longest : 1;
    const output = scale < 1
        ? resizeRGBA(cut.image, Math.max(1, Math.round(cut.image.width * scale)), Math.max(1, Math.round(cut.image.height * scale)))
        : cut.image;
    let transparent = 0;
    let opaque = 0;
    let partial = 0;
    for (let pixel = 0; pixel < output.width * output.height; pixel++) {
        const alpha = output.data[pixel * 4 + 3];
        if (alpha <= 10)
            transparent++;
        else if (alpha >= 245)
            opaque++;
        else
            partial++;
    }
    const pixels = Math.max(1, output.width * output.height);
    void recordExtractionEvent("single_output_quality", {
        width: output.width,
        height: output.height,
        transparentFraction: transparent / pixels,
        opaqueFraction: opaque / pixels,
        edgeFraction: partial / pixels,
        resized: scale < 1,
    });
    // A nearly opaque rectangle that also fills the source is a failed
    // background removal, not a garment. Fail closed so the wardrobe never
    // receives a full-background image labelled as a transparent cutout.
    if (areaRatio > 0.96 && transparent / pixels < 0.005) {
        void recordExtractionEvent("single_cutout_rejected", {
            reason: "background_retained",
            areaRatio,
            transparentFraction: transparent / pixels,
            totalMs: Date.now() - started,
        }, "warning");
        captureQaAlphaFromRgba("10_final_mask", output);
        captureQaRgba("11_final_garment", output);
        await finishGarmentQaRun("rejected-background-retained", {
            areaRatio,
            transparentFraction: transparent / pixels,
        });
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "The background was still attached, so this result was not saved. Crop closer or use a plainer surface.",
            items: [],
            cutOffTypes: [],
        };
    }
    progress("Saving transparent garment…");
    const uri = await savePNG(output, `single-garment-${Date.now()}.png`);
    captureQaAlphaFromRgba("10_final_mask", output);
    captureQaRgba("11_final_garment", output);
    void recordExtractionEvent("single_output_saved", {
        width: output.width,
        height: output.height,
        totalMs: Date.now() - started,
    });
    progress("Done");
    await finishGarmentQaRun("success", {
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        outputWidth: output.width,
        outputHeight: output.height,
        transparentFraction: transparent / pixels,
        opaqueFraction: opaque / pixels,
        edgeFraction: partial / pixels,
    });
    return {
        ok: true,
        items: [{
                type: "garment",
                label: labelHint,
                confidence: 0.95,
                uri,
                width: output.width,
                height: output.height,
            }],
        cutOffTypes: [],
    };
}
/**
 * Extract one known wardrobe item from either a worn photo or a flat-lay.
 *
 * A full-body/product image must not go straight to u2netp: it is a saliency
 * model intended for an isolated item, and it treats a person and garment as
 * competing visual regions. That produced the square, fragmented images in
 * the item-detail "Remove Background" action. Try the person-aware pipeline
 * first and only use the flat-lay model after its explicit no-person result.
 */
export async function extractWardrobeGarment(photoUri, categoryHint = "top", labelHint = "Garment", onProgress) {
    // The "Remove background" button on an existing wardrobe item.
    //
    // This used to run a semantic-parser pipeline and isolate one garment
    // from a worn photo — which is exactly the thing that produced fragments and
    // merged dupattas, and why it had a long list of categories it refused to
    // touch. That whole apparatus is gone.
    //
    // It now does the same one thing Auto Extract does: remove the background,
    // keep the subject. Nothing to get semantically wrong.
    return extractBackgroundOnly(photoUri, labelHint, onProgress);
}
/** Below this share of the frame, MODNet has not found a subject. */
const MIN_SUBJECT_COVERAGE = 0.04;
/**
 * MODNet only knows how to matte people. A flat garment can still produce a
 * deceptively high coverage score, but its mask is usually broad and/or split
 * by large holes. Do not use such a mask: a complete original crop is better
 * than a shirt with missing fabric.
 */
function isReliablePortraitMatte(alpha, width, height) {
    const foreground = new Uint8Array(alpha.length);
    let covered = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] <= 127)
            continue;
        foreground[i] = 1;
        covered++;
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
    const coverage = covered / alpha.length;
    if (coverage < MIN_SUBJECT_COVERAGE || maxX < 0)
        return false;
    // A person silhouette is normally taller than it is wide. The reported
    // shirt mask is a broad 56%-coverage shape, which is MODNet mistaking a
    // flat lay for a portrait.
    const matteWidth = maxX - minX + 1;
    const matteHeight = maxY - minY + 1;
    const broadFlatLay = coverage > 0.35 && matteWidth / matteHeight > 0.95;
    if (broadFlatLay)
        return false;
    // Reject masks made from unrelated fragments (hanger, sleeve, bed pattern).
    const seen = new Uint8Array(alpha.length);
    const queue = new Int32Array(alpha.length);
    let largest = 0;
    for (let start = 0; start < alpha.length; start++) {
        if (!foreground[start] || seen[start])
            continue;
        let head = 0, tail = 0, size = 0;
        seen[start] = 1;
        queue[tail++] = start;
        while (head < tail) {
            const p = queue[head++];
            size++;
            const x = p % width;
            const y = (p / width) | 0;
            const visit = (next) => {
                if (foreground[next] && !seen[next]) {
                    seen[next] = 1;
                    queue[tail++] = next;
                }
            };
            if (x > 0)
                visit(p - 1);
            if (x < width - 1)
                visit(p + 1);
            if (y > 0)
                visit(p - width);
            if (y < height - 1)
                visit(p + width);
        }
        if (size > largest)
            largest = size;
    }
    return largest / covered >= 0.9;
}
export async function extractBackgroundOnly(photoUri, labelHint = "Garment", onProgress) {
    const progress = onProgress ?? (() => { });
    const tStart = Date.now();
    await beginGarmentQaRun(photoUri, "background-only-auto-extract");
    progress("Reading photo…");
    const photo = await decodeToRGBA(photoUri);
    captureQaRgba("01_decoded_oriented", photo);
    await yieldToUI();
    try {
        const nsfw = await checkNSFW(photo);
        if (!nsfw.safe) {
            await finishGarmentQaRun("rejected-nsfw");
            return {
                ok: false,
                reason: "nsfw",
                message: NSFW_REJECT_MESSAGE,
                items: [],
                cutOffTypes: [],
            };
        }
    }
    catch {
        /* model slot empty -> gate skipped */
    }
    progress("Removing background…");
    // MODNet first: it is a PORTRAIT matting model, so it is the right tool for
    // a worn outfit, and it is the engine that has given clean edges all along.
    let cut = null;
    try {
        const alpha = await matteWithModnet(photo);
        await yieldToUI();
        // Did it actually find a subject? On a flat-lay (no person) MODNet returns
        // almost nothing — that is our signal to switch engines, and it needs no
        // Gemini call and no additional clothing-parser model.
        let covered = 0;
        for (let i = 0; i < alpha.length; i++)
            if (alpha[i] > 127)
                covered++;
        const coverage = covered / alpha.length;
        console.log(`[auto] MODNet coverage ${(coverage * 100).toFixed(1)}%`);
        if (isReliablePortraitMatte(alpha, photo.width, photo.height)) {
            cut = finishCutout(photo, alpha);
        }
        else {
            console.log("[auto] MODNet matte rejected as non-portrait/fragmented; using flat-lay fallback");
        }
    }
    catch (e) {
        console.log("[auto] MODNet failed, falling back:", e);
    }
    // No person in frame -> flat-lay engine (u2netp is generic saliency and does
    // not need a human).
    if (!cut) {
        console.log("[auto] → u2netp (no subject for MODNet)");
        await yieldToUI();
        cut = await cutoutFlatLay(photo);
    }
    if (!cut) {
        await finishGarmentQaRun("rejected-no-cutout", {
            sourceWidth: photo.width,
            sourceHeight: photo.height,
        });
        return {
            ok: false,
            reason: "no_items_extracted",
            message: "Couldn't separate anything from the background in this photo.",
            items: [],
            cutOffTypes: [],
        };
    }
    progress("Saving…");
    // PNG preserves the portrait matte's alpha exactly: keep the complete
    // person and clothing, make only the scene background transparent.
    const longest = Math.max(cut.image.width, cut.image.height);
    const scale = longest > 1000 ? 1000 / longest : 1;
    const output = scale < 1
        ? resizeRGBA(cut.image, Math.max(1, Math.round(cut.image.width * scale)), Math.max(1, Math.round(cut.image.height * scale)))
        : cut.image;
    const outputUri = await savePNG(output, `person-${Date.now()}.png`);
    captureQaAlphaFromRgba("10_final_mask", output);
    captureQaRgba("11_final_garment", output);
    console.log(`[auto] TOTAL ${((Date.now() - tStart) / 1000).toFixed(1)}s (background removal only)`);
    progress("Done");
    await finishGarmentQaRun("success", {
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        outputWidth: output.width,
        outputHeight: output.height,
    });
    return {
        ok: true,
        items: [
            {
                type: "top", // a sensible default; the user edits it on save
                label: labelHint,
                confidence: 0.95,
                uri: outputUri,
                width: output.width,
                height: output.height,
            },
        ],
        cutOffTypes: [],
    };
}
/** Shared tail: clean the matte and crop tight to the subject. */
function finishCutout(photo, alphaIn) {
    const n = photo.width * photo.height;
    let alpha = alphaIn;
    // Drop detached islands (stray objects, background speckle).
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        bin[i] = alpha[i] > 127 ? 1 : 0;
    captureQaMask("07_portrait_threshold_mask", bin, photo.width, photo.height);
    const kept = filterComponents(bin, photo.width, photo.height, Math.round(n * 0.01));
    captureQaMask("09_portrait_component_mask", kept, photo.width, photo.height);
    for (let i = 0; i < n; i++)
        if (!kept[i])
            alpha[i] = 0;
    // Edge polish + colour decontamination (the chain that already works).
    alpha = refineMatteFast(photo, alpha, {
        band: 6,
        sample: 12,
        repairInterior: true,
    });
    captureQaMask("10_portrait_refined_mask", alpha, photo.width, photo.height);
    decontaminate(photo, alpha, 3);
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
