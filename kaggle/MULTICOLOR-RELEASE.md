# v9.2 multicolor release candidate

The successful v9.1 inference settings are retained. This update fixes loss of
color evidence and adds clothing-family geometry without applying automatic
recoloring to generated images.

Run `python kaggle/build_notebook.py` to build `clothmatics_ghost_v9_2.py` and the
matching notebook. The Python file is a complete single cell: copy its entire
contents into Kaggle, with the existing sync secret enabled. No file upload or
source-download bootstrap is required. The agent has not started Kaggle.

Before switching the production website, start the new runner and confirm its
v9.2 startup message and Worker registration. The old runner does not understand
the structured palette; the new website detects its missing capability header
and will refuse to save its results. Do not switch only the website while keeping
the old runner active. Prepare deployment with `node deployment/prepare.mjs` and
deploy `.deploy/site` when the new runner is ready. Preserve the earlier release
for rollback.

Test with the same originals and include a plaid shirt, multicolor saree with a
border, embroidered kurta/set, printed dress, washed jeans, leggings and a
color-block jacket. Compare each color region as well as the existing texture,
garment volume, hem, print and construction. Reject regressions rather than
averaging garment colors or applying a tint to the entire image.

The quality gate is a vision-model comparison, not a calibrated colorimeter.
Sampling still depends on Gemini locating valid fabric points; complex palettes
that cannot fit the existing model context are refused explicitly. Actual GPU
color improvement and quality-gate false-rejection rates require this photo test.

Final local validation: 152 Node tests and 8 Python checks passed. Deployment
preparation succeeded. The generated v9.2 Python artifact SHA-256 is
`31be450eae3a3c26073b653fd6233b00a7dfa3cf20fc5c99b0d1e74c5cf2029d`.
The earlier v9.1 Python artifact hash remains unchanged.

Request-only logging: no idle heartbeat or periodic VRAM output. Startup and
fatal process errors remain visible. Generation hits print correlated request
IDs, source palette, cache/busy status, stage timings and completion/error status.
Health probes are silent. The cell must remain listening to receive requests;
quiet logs do not suspend the Kaggle server or release its allocated GPU.
Eight Python checks and a middleware smoke check passed after this refinement.
