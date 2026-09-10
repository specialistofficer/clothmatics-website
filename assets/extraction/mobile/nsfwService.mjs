// Generated from src/ai/nsfwService.ts; see source-manifest.json.
/**
 * NSFW gate — GantMan mobilenet (ONNX), 224×224 input, 5 classes:
 * [drawings, hentai, neutral, porn, sexy]. Runs FIRST on every upload.
 */
import { makeTensor, run } from "./inferenceEngine.mjs";
import { resizeRGBA } from "./imageTensor.mjs";
export const NSFW_REJECT_MESSAGE = "Please upload a clothing image. Images containing nudity or inappropriate body exposure cannot be processed.";
const EXPLICIT_THRESHOLD = 0.55; // porn / hentai
const SUGGESTIVE_THRESHOLD = 0.75; // sexy (underwear/lingerie/bikini-heavy)
export async function checkNSFW(image) {
    const resized = resizeRGBA(image, 224, 224);
    // GantMan model: NHWC, RGB scaled to 0..1
    const plane = 224 * 224;
    const input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
        input[i * 3] = resized.data[i * 4] / 255;
        input[i * 3 + 1] = resized.data[i * 4 + 1] / 255;
        input[i * 3 + 2] = resized.data[i * 4 + 2] / 255;
    }
    const feeds = { input_1: makeTensor("float32", input, [1, 224, 224, 3]) };
    const output = await run("nsfw", feeds);
    const key = Object.keys(output)[0];
    const s = output[key].data;
    const scores = { drawings: s[0], hentai: s[1], neutral: s[2], porn: s[3], sexy: s[4] };
    const safe = !(scores.porn >= EXPLICIT_THRESHOLD ||
        scores.hentai >= EXPLICIT_THRESHOLD ||
        scores.sexy >= SUGGESTIVE_THRESHOLD);
    return { safe, scores };
}
