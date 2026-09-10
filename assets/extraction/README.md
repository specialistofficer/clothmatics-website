# Browser extraction

`mobile/` contains TypeScript-transpiled mobile tensor, matting, ownership, seam,
fabric recovery and quality algorithms. `mobile/source-manifest.json` records
SHA-256 digests of the source files. `build-mobile-extraction.cjs` regenerates
these modules and verifies/splits the production models into files smaller than
the Pages asset limit. Run it with the mobile repository path; it uses that
repository's TypeScript installation and `oracle-extraction-api/models`.

`browser-io.mjs` adapts decode/PNG encoding to OffscreenCanvas. The inference
adapter uses ONNX Runtime Web 1.22.0, WASM, one thread. Models are fetched only
when extraction is requested, with SHA-256 verification before session creation.
The dedicated worker retains sessions for subsequent items and releases them
after two idle minutes. Cancellation terminates the worker immediately. Initial
use downloads roughly 16 MB for single-garment extraction; using both models
totals roughly 42 MB including the runtime. No image is sent to a third-party
background-removal provider.

Vendor files come from the npm package `onnxruntime-web@1.22.0`:
`dist/ort.wasm.min.mjs`, `dist/ort-wasm-simd-threaded.mjs`, and
`dist/ort-wasm-simd-threaded.wasm`. Preserve `THIRD_PARTY_NOTICES.txt`.
The website CSP permits same-origin workers and WASM compilation only; it does
not enable arbitrary JavaScript eval or third-party runtime script hosts.

The normal worn-photo entry point intentionally calls the mobile legacy
person-first pipeline, as the current mobile dispatcher does. The dormant V2
code remains available to keep the source graph reproducible. Native QA image
storage is not ported; browser diagnostics contain stage metrics only.

Matching algorithms and model weights do not imply pixel-identical decoded
images: browser versus Expo JPEG decode/resize/PNG encoding can differ. Compare
the same source images and candidate boxes before claiming visual parity.
