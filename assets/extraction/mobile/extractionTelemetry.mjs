// Generated from src/ai/extractionTelemetry.ts; see source-manifest.json.
/**
 * extractionTelemetry — Phase 0 of the action plan: measure before optimising.
 *
 * The plan is explicit that nothing after Phase 0 is prioritised correctly
 * until four numbers exist per device: decode+resize, inference, gemini and
 * r2 upload. This module produces exactly those lines, in that shape, so the
 * numbers can be copied straight into `qa/LATENCY.md`.
 *
 * Purely local: `console.log` and an in-memory ring buffer. No analytics call,
 * no network, no storage.
 */
import { extractionFlag } from "./extractionFlags.mjs";
import { recordExtractionEvent } from "./extractionDiagnostics.mjs";
/** Last few runs, so a QA screen or a log dump can show them without a rerun. */
const history = [];
const HISTORY_LIMIT = 20;
export function recentTimings() {
    return history;
}
/**
 * Start a timing run. When `stageTimings` is off this returns a no-op object
 * with the same shape, so call sites never need a conditional.
 */
export function startTimings(label) {
    if (!extractionFlag("stageTimings")) {
        const empty = { label, startedAt: Date.now(), totalMs: 0, stages: [] };
        return {
            measure: (_stage, work) => work(),
            measureSync: (_stage, work) => work(),
            add: () => { },
            report: () => empty,
        };
    }
    const startedAt = Date.now();
    const totals = new Map();
    const add = (stage, ms) => {
        totals.set(stage, (totals.get(stage) ?? 0) + ms);
    };
    return {
        add,
        async measure(stage, work) {
            const t0 = Date.now();
            try {
                return await work();
            }
            finally {
                add(stage, Date.now() - t0);
            }
        },
        measureSync(stage, work) {
            const t0 = Date.now();
            try {
                return work();
            }
            finally {
                add(stage, Date.now() - t0);
            }
        },
        report() {
            const stages = [...totals.entries()].map(([stage, ms]) => ({ stage, ms }));
            const run = {
                label,
                startedAt,
                totalMs: Date.now() - startedAt,
                stages,
            };
            // The four lines Phase 0 asks for, padded so a column of runs lines up.
            const order = [
                "decode+resize",
                "inference",
                "partition",
                "postprocess",
                "validate",
                "encode",
                "gemini",
                "r2 upload",
            ];
            console.log(`[perf] ---- ${label} ----`);
            for (const stage of order) {
                const ms = totals.get(stage);
                if (ms === undefined)
                    continue;
                console.log(`[perf] ${stage.padEnd(14)}: ${ms} ms`);
            }
            console.log(`[perf] ${"TOTAL".padEnd(14)}: ${run.totalMs} ms`);
            history.push(run);
            if (history.length > HISTORY_LIMIT)
                history.shift();
            void recordExtractionEvent("stage_timings", {
                label,
                totalMs: run.totalMs,
                stages,
            });
            return run;
        },
    };
}
/**
 * Standalone stopwatch for stages that happen outside a pipeline run — the
 * Gemini enrichment call and the R2 upload both live in services, and the
 * plan wants their numbers alongside the extraction ones.
 */
export async function timeStage(stage, work) {
    if (!extractionFlag("stageTimings"))
        return work();
    const t0 = Date.now();
    try {
        return await work();
    }
    finally {
        const ms = Date.now() - t0;
        console.log(`[perf] ${stage.padEnd(14)}: ${ms} ms`);
        void recordExtractionEvent("service_timing", { stage, ms });
    }
}
