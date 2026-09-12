# ClothMatics appearance v2 update

The ready-to-import notebook is **clothmatics_ghost_v9.ipynb**. The equivalent
single-cell Python script is **clothmatics_ghost_v9.py**. These are generated
from the reviewed source files in this directory; edit the sources and run
`python kaggle/build_notebook.py` to rebuild both artifacts.

## What was wrong

- Single Garment delegated to the outfit analyzer and selected its first item,
  so the detailed single-item appearance prompt was unused.
- The v8.3.3 Kaggle sanitizer removed explicit mannequin prohibitions. Its
  blanket tail truncation could discard color and empty-opening instructions.
- Generic body/torso and standard garment templates encouraged redesigns,
  including an upper body on trousers, tapered legs and invented shirt hems.
- Old metadata was considered reusable if it contained only a subcategory or
  material. Titles with an incorrect color were fed back into generation.
- A technically valid PNG was accepted without a source/result comparison.
- Regeneration deleted the prior storage object before committing its replacement.

The website now captures observed construction and source RGB patch samples,
uses a versioned evidence manifest, and screens output against its source for
color, texture, construction, graphics, category and visible mannequin/body.
Rejected or unverifiable output is not saved. The comparison uses the existing
shared AI allowance; if that allowance is unavailable, the original remains
reviewable. No global histogram recoloring is applied to fabric or logos.

## Run on Kaggle

1. Import `clothmatics_ghost_v9.ipynb` into Kaggle. Enable Internet and the GPU
   accelerator; the provided dual-T4 allocation is supported.
2. In Kaggle Secrets, enable `CLOTHMATICS_SYNC_TOKEN` with the existing value
   configured for the Ghost Worker's `/set-target` endpoint. The notebook also
   accepts that environment variable. There is no hardcoded fallback value.
3. Stop the old notebook cell, then run the new cell. It installs the provided
   pinned dependencies, loads the same pinned FLUX.2-klein-4B revision, warms the
   model, starts the tunnel and registers the new target. Leave the cell running.
4. Check the permanent Worker's `/health` response. Its backend must report
   `pipeline_version: 9.0.0-appearance-v2`, `ghost_contract_version: 2`, and
   `ready: true`.
5. The website and permanent Worker were deployed on 2026-09-11. Reload the
   website after your v9 backend is ready. Website and GPU notebook are separate
   deployments; this release did not start or replace your Kaggle session.

The Worker now validates `X-Sync-Token`. Its secret was configured using the
`SYNC_TOKEN` fallback value in the original notebook you supplied. Use that same
value for the enabled `CLOTHMATICS_SYNC_TOKEN` Kaggle Secret; no token is baked
into the downloadable code.

## Identified Cloudflare connection

- Permanent Worker: `clothmatics-ghost.chiragsharma376.workers.dev`
- Generation endpoint: `/generate`
- Notebook registration endpoint: `/set-target` with `X-Sync-Token`
- Website server proxy: `functions/api/wardrobe/ghost.js`
- Live health inspection on 2026-09-11 found the old **8.3.3-ghost-3d** backend
  online on two Tesla T4 GPUs. This was a read-only observation, not deployment.

The permanent Worker must transparently forward the request multipart body,
including `manifest`, `contract_version`, `seed`, `category` and `image`, and
return `X-Ghost-Contract-Version` from the backend response. Keep its existing
target registration and credentials. The website explicitly rejects responses
from an old backend instead of silently using the prompt-stripping pipeline.
The deployed Worker's source was subsequently inspected using the existing
Wrangler login. It already preserves the multipart body and backend headers.
The deployed update protects target registration, validates tunnel origins,
strips credentials upstream and rejects generator redirects. Its existing KV
target was preserved. Four local Worker tests verify these behaviors.

Pages production release: `5d91e648`; Worker version:
`c8824bf9-4dca-4a0a-9e6f-596a5ae1c28f`. Wrangler confirmed both deployments.
Post-deploy live verification was not completed because that network command
was rejected by the user. No v9 GPU generation was run.

Published downloads:
- https://clothmatics.pages.dev/downloads/clothmatics_ghost_v9.py
- https://clothmatics.pages.dev/downloads/clothmatics_ghost_v9.ipynb

The server keeps a bounded ten-minute result cache keyed by source/evidence/seed
so a transport retry can reuse completed inference. New user attempts receive a
new seed. GPU inference owns the lock on a worker thread; a disconnected HTTP
caller cannot release it while inference is still running.

## Validation and limits

- Final local result: 121 Node tests, 6 Python checks and 13 browser assertions
  passed. Mobile (390x844) and desktop (1280x800) dialog layouts were checked.
- Website suite: `node --test tests/*.test.mjs`
- Notebook/contract checks: `python kaggle/test_prompt_contract.py`
- Browser regression harness: serve the workspace and open
  `tests/studio-preview.html`; click **Run browser regression checks**.
- Local checks cover measured RGB, category errors, quality rejection, failed
  replacement preservation, retry-save, credential isolation, stale edits and
  the generated notebook's Python syntax.
- Actual GPU inference and the user's original-photo corpus have **not** been
  run with v9.0.0 here. Screenshots show failures but cannot substitute for the
  original uploaded photo bytes in a color-fidelity benchmark.
- Visual comparison is model-based screening, not a guarantee. Reference
  lighting affects measured colors; photographs cannot establish fibre content.
  Generated output is an AI product image, not a recovered 3D mesh.

For acceptance, retest the taupe striped shirt, dark teal trousers, charcoal
jeans, light-grey trousers, olive outerwear/shorts, navy jacket and printed tee.
Compare the original and result for base shade, wash, texture, pocket count,
fasteners, hem/sleeves and exact text. No head, neck stump, arms, torso or legs
may appear. Check both newly uploaded and regenerated saved garments.

The four-step, guidance-1.0 distilled settings are retained from the model's
[official model card](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B).
Field-aware budgeting reserves context for the 512-token
[Diffusers encoder](https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/flux2/pipeline_flux2_klein.py).
No quality claim follows merely from these parameter choices.
