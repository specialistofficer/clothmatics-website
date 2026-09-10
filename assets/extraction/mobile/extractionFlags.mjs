// Generated from src/config/extractionFlags.ts; see source-manifest.json.
/**
 * extractionFlags — the safety net for the extraction action plan.
 *
 * Every behaviour introduced by the plan (Phases 0-6) is switched here. Two
 * independent levels of protection exist so a bad phase can never cost us the
 * working pipeline:
 *
 *  1. COMPILE/CONFIG LEVEL — set a flag to false and that phase is gone. With
 *     `singlePassPartition: false` the app runs the exact legacy extractor
 *     (`extractIdentifiedWornRegionsLegacy`) that shipped before this work.
 *
 *  2. RUNTIME LEVEL — if the new pipeline throws, or returns nothing usable,
 *     `rollbackExtractionV2()` is called by the dispatcher: the flag is
 *     flipped off for the rest of the session and the legacy extractor runs
 *     immediately for that same photo. The user sees a result, not an error.
 *
 * Nothing here reaches the network. Everything the plan adds runs on-device;
 * the only external call in the pipeline remains Gemini.
 */
const DEFAULTS = {
    stageTimings: true,
    validationGate: true,
    enrichFromCutout: true,
    measuredColor: true,
    visibilityGate: true,
    singlePassPartition: true,
    shrinkGeminiPayload: true,
    reuseCachedAnalysis: true,
    maskPostprocess: true,
    skinExclusion: false,
    edgeBandTrim: false,
};
/**
 * Mutable on purpose: the runtime fallback below writes to it. Read it through
 * `extractionFlag()` rather than destructuring, so a mid-session rollback is
 * actually observed by later calls.
 */
const flags = { ...DEFAULTS };
export function extractionFlag(key) {
    return flags[key];
}
/** Every flag at once — for logging and the QA screen. */
export function extractionFlagsSnapshot() {
    return { ...flags };
}
let rolledBackReason = "";
/**
 * Permanently (for this session) return to the pre-plan extractor.
 *
 * Called by the dispatcher when the new pipeline throws or produces nothing.
 * Only the phases that can damage an extraction are turned off — timings and
 * the validation gate are harmless and stay on so the failure is still
 * visible in the logs.
 */
export function rollbackExtractionV2(reason) {
    if (rolledBackReason)
        return;
    rolledBackReason = reason;
    flags.singlePassPartition = false;
    flags.maskPostprocess = false;
    flags.enrichFromCutout = false;
    console.warn(`[extract] V2 pipeline rolled back for this session -> legacy extractor. Reason: ${reason}`);
}
export function extractionRollbackReason() {
    return rolledBackReason;
}
/** Test/debug helper: restore the shipped defaults. */
export function resetExtractionFlags() {
    Object.assign(flags, DEFAULTS);
    rolledBackReason = "";
}
/** Test/debug helper: force a specific configuration. */
export function overrideExtractionFlags(patch) {
    Object.assign(flags, patch);
}
