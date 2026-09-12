# ==============================================================================
# CLOTHMATICS 3D GHOST MANNEQUIN - APPEARANCE V2 PIPELINE (v9.2.0)
# ==============================================================================
# Architecture:
# 1. 🛡️ Safe Baseline: Non-destructive raw FLUX generation, high-speed FP16 compute.
# 2. 🎨 Color-Managed Input Decoding: sRGB ICC profile normalization via ImageCms,
#    EXIF transposition, and alpha channel preservation onto pure white (#FFFFFF).
# 3. 📝 Preservation-First Prompting: Subordinate category & observation hints.
# 4. 🚀 Warm Dual-GPU (Qwen3 on GPU 0, FLUX.2 Transformer & FP32 Tiled VAE on GPU 1).
# 5. 📡 Persistent Keep-Alive Server Loop with Real-Time Request Streaming.
# ==============================================================================

import os, sys, json, time, re, socket, subprocess, textwrap, urllib.request, shutil
from pathlib import Path

print("Starting ClothMatics appearance v2 engine (v9.2.0)...\n")

def read_kaggle_secret(name):
    value = os.environ.get(name, '').strip()
    if not value:
        try:
            from kaggle_secrets import UserSecretsClient
            value = UserSecretsClient().get_secret(name).strip()
        except Exception:
            pass
    if not value:
        raise RuntimeError(f'Add {name} to Kaggle Secrets and enable it for this notebook before running.')
    return value

# Validate configuration before downloading weights or taking GPU memory.
SYNC_TOKEN = read_kaggle_secret('CLOTHMATICS_SYNC_TOKEN')

# ------------------------------------------------------------------------------
# STEP 1: Clean Startup (Terminate any old server, tunnel, or file handles)
# ------------------------------------------------------------------------------
for fh_name in ['API_LOG_FILE', 'TUNNEL_LOG_FILE']:
    if fh_name in globals():
        try:
            globals()[fh_name].close()
        except Exception:
            pass

for proc_name in ['API_PROCESS', 'TUNNEL_PROCESS']:
    if proc_name in globals() and globals()[proc_name].poll() is None:
        try:
            print(f"Stopping previous {proc_name}...")
            globals()[proc_name].terminate()
            globals()[proc_name].wait(timeout=3)
        except Exception:
            pass

# Stop only subprocesses created by this notebook. Do not kill other notebooks.

# ------------------------------------------------------------------------------
# STEP 2: Dedicated Project Environment & Dependencies
# ------------------------------------------------------------------------------
PROJECT = Path('/kaggle/working/clothmatics_ghost_env')
PROJECT.mkdir(parents=True, exist_ok=True)
ENV = PROJECT / '.venv'
PYTHON = sys.executable

# Self-healing environment creation: avoid ensurepip crashes on Debian/Ubuntu
try:
    import venv
    if not ENV.exists():
        venv.EnvBuilder(with_pip=False, system_site_packages=True).create(ENV)

    cand = str(ENV / 'bin' / 'python')
    if (ENV / 'bin' / 'python').exists():
        probe = subprocess.run([cand, '-c', 'import sys; print(sys.version)'], capture_output=True)
        if probe.returncode == 0:
            PYTHON = cand
except Exception as e:
    print(f"Note on environment ({e}), using Kaggle runtime Python directly.")
    PYTHON = sys.executable

PKGS = [
    "fastapi", "uvicorn[standard]", "python-multipart", "opencv-python-headless",
    "diffusers==0.40.0", "transformers==5.16.1", "accelerate==1.14.0",
    "bitsandbytes==0.50.2", "peft==0.20.0", "safetensors==0.8.0",
    "huggingface-hub", "Pillow>=10.4.0", "scipy==1.14.1",
    "google-cloud-bigquery-storage>=2.0.0"
]

print("Installing & verifying required packages...")
pip_flags = ["install", "-q", "--no-warn-conflicts"]
install_success = False
if PYTHON != sys.executable:
    try:
        subprocess.run([sys.executable, "-m", "pip", "--python", PYTHON] + pip_flags + PKGS, check=True)
        install_success = True
    except Exception:
        print("Venv install failed, switching to Kaggle runtime Python...")
        PYTHON = sys.executable

if not install_success:
    subprocess.run([sys.executable, "-m", "pip"] + pip_flags + PKGS, check=True)

# GPU Hardware Confirmation
probe = textwrap.dedent("""
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('Kaggle GPU not active! Right sidebar me Accelerator -> GPU T4 x2 select karein.')
    count = torch.cuda.device_count()
    print(f"Detected {count} GPU(s):")
    for i in range(count):
        free, total = torch.cuda.mem_get_info(i)
        print(f"  GPU {i}: {torch.cuda.get_device_name(i)} ({round(free/2**30, 2)} GB / {round(total/2**30, 2)} GB free)")
""")
subprocess.run([PYTHON, "-u", "-c", probe], check=True)
print("✅ GPU hardware confirmed.")

# ------------------------------------------------------------------------------
# STEP 3: Pre-cache FLUX.2-klein-4B & Qwen3 Model Weights
# ------------------------------------------------------------------------------
print("\n" + "="*80)
print("📥 STEP 3: Downloading & Pre-caching FLUX.2-klein-4B Weights to Local SSD...")
print("="*80)
cache_probe = textwrap.dedent("""
    import os, sys
    from huggingface_hub import snapshot_download

    artifact_id = "black-forest-labs/FLUX.2-klein-4B"
    revision = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
    print(f"Downloading/verifying weights for {artifact_id}...")
    print(f"Using 8 parallel download workers (progress bar displayed below):")
    path = snapshot_download(
        repo_id=artifact_id,
        revision=revision,
        ignore_patterns=["*.msgpack", "*.onnx"],
        max_workers=8
    )
    print(f"✅ All model weights ready in local SSD cache!")
""")
subprocess.run([PYTHON, "-u", "-c", cache_probe], check=True)

# ------------------------------------------------------------------------------
# STEP 4: High-Speed Warm In-Memory FastAPI Server + Color Calibration
# ------------------------------------------------------------------------------
WARM_SERVER_CODE = 'import io, json, os, subprocess, sys, tempfile, threading, time, uuid, re, warnings\nimport importlib.metadata\nimport asyncio, hashlib\nfrom collections import OrderedDict\nfrom prompt_contract import normalize_category, normalize_manifest, pack_prompt, category_dimensions, CONTRACT_VERSION\nfrom dataclasses import dataclass\nfrom typing import Optional, Dict, Any, Tuple, List\nfrom pathlib import Path\nimport cv2\nimport numpy as np\nfrom PIL import Image, ImageOps, ImageCms, UnidentifiedImageError\nimport torch\nfrom fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request\nfrom fastapi.middleware.cors import CORSMiddleware\nfrom fastapi.responses import Response\n\n# ==============================================================================\n# 1. CONSTANTS, PROFILES & COLOR MANAGEMENT\n# ==============================================================================\nPIPELINE_VERSION = "9.2.0-multicolor"\nMAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB\nMAX_INPUT_PIXELS = 24_000_000        # 24 Mpx\nSRGB_PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))\nSRGB_ICC = SRGB_PROFILE.tobytes()\n\nclass InputImageError(ValueError):\n    """Raised when an uploaded input image violates size, mode or format constraints."""\n    pass\n\n@dataclass\nclass DecodedGarment:\n    rgb: Image.Image\n    alpha: Optional[Image.Image]\n    conditioning_rgb: Image.Image\n    notices: tuple\n\ndef decode_garment(data: bytes) -> DecodedGarment:\n    if not data or len(data) > MAX_UPLOAD_BYTES:\n        raise InputImageError("Image is empty or exceeds the upload limit (20MB)")\n    notices = []\n    try:\n        with warnings.catch_warnings():\n            warnings.simplefilter("error", Image.DecompressionBombWarning)\n            with Image.open(io.BytesIO(data)) as opened:\n                if getattr(opened, "n_frames", 1) != 1:\n                    raise InputImageError("Upload one still image")\n                if opened.width * opened.height > MAX_INPUT_PIXELS:\n                    raise InputImageError("Image exceeds the pixel limit (24M pixels)")\n                opened.load()\n                icc = opened.info.get("icc_profile")\n                oriented = ImageOps.exif_transpose(opened)\n                has_alpha = (\n                    "A" in oriented.getbands() or "transparency" in oriented.info\n                )\n                alpha = oriented.convert("RGBA").getchannel("A") if has_alpha else None\n                if alpha is not None:\n                    extrema = alpha.getextrema()\n                    if extrema[1] == 0:\n                        raise InputImageError("Image is fully transparent")\n                    if extrema == (255, 255):\n                        alpha = None\n                if oriented.mode == "LA":\n                    base = oriented.getchannel("L")\n                else:\n                    base = oriented if oriented.mode in ("RGB", "CMYK", "L", "LAB") else oriented.convert("RGB")\n                if icc:\n                    try:\n                        src_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))\n                        rgb = ImageCms.profileToProfile(\n                            base, src_profile, SRGB_PROFILE, outputMode="RGB"\n                        )\n                    except (ImageCms.PyCMSError, OSError, ValueError) as exc:\n                        raise InputImageError("Embedded color profile cannot be converted") from exc\n                else:\n                    if base.mode not in ("RGB", "L"):\n                        raise InputImageError("This color mode requires a valid embedded profile")\n                    rgb = base.convert("RGB")\n                    notices.append("untagged_input_assumed_srgb")\n                rgb = rgb.copy()\n                if alpha is not None:\n                    alpha = alpha.copy()\n                    rgba = rgb.convert("RGBA")\n                    rgba.putalpha(alpha)\n                    white = Image.new("RGBA", rgb.size, (255, 255, 255, 255))\n                    conditioning = Image.alpha_composite(white, rgba).convert("RGB")\n                else:\n                    conditioning = rgb.copy()\n                rgb.info.clear()\n                conditioning.info.clear()\n                return DecodedGarment(rgb, alpha, conditioning, tuple(notices))\n    except InputImageError:\n        raise\n    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, getattr(Image, "DecompressionBombError", Exception)) as exc:\n        raise InputImageError("Unsupported or invalid image") from exc\n\ndef conditioning_thumbnail(decoded: DecodedGarment, max_size=(768, 1024)) -> Image.Image:\n    result = decoded.conditioning_rgb.copy()\n    result.thumbnail(max_size, Image.Resampling.LANCZOS)\n    return result\n\n# ==============================================================================\n# 2. CATEGORY NORMALIZATION & PRESERVATION PROMPTS\n# ==============================================================================\n# Category handling and token-aware prompts live in prompt_contract.py.\n\nclass WarmDualGpuEngine:\n    def __init__(self):\n        try:\n            from transformers import Qwen3ForCausalLM as TextEncoderModel\n        except (ImportError, AttributeError):\n            from transformers import AutoModelForCausalLM as TextEncoderModel\n        from transformers import BitsAndBytesConfig as TextQuant\n        from diffusers import Flux2KleinPipeline, Flux2Transformer2DModel, BitsAndBytesConfig as ImageQuant\n        \n        self.num_gpus = torch.cuda.device_count()\n        if self.num_gpus == 0:\n            raise RuntimeError(\'Enable a Kaggle GPU accelerator before starting the engine.\')\n        if self.num_gpus >= 2:\n            self.text_device = torch.device("cuda:0")\n            self.image_device = torch.device("cuda:1")\n            print("🚀 DUAL-GPU PIPELINE: GPU 0 (Qwen3 Text) | GPU 1 (FLUX Transformer)", flush=True)\n        elif self.num_gpus == 1:\n            self.text_device = torch.device("cuda:0")\n            self.image_device = torch.device("cuda:0")\n            print("⚡ SINGLE-GPU PIPELINE: GPU 0 (Shared)", flush=True)\n        else:\n            self.text_device = torch.device("cpu")\n            self.image_device = torch.device("cpu")\n\n        artifact_id = "black-forest-labs/FLUX.2-klein-4B"\n        self.revision = "e7b7dc27f91deacad38e78976d1f2b499d76a294"\n        self.compute_dtype = torch.float16\n\n        quant = dict(\n            load_in_4bit=True,\n            bnb_4bit_quant_type="nf4",\n            bnb_4bit_use_double_quant=True,\n            bnb_4bit_compute_dtype=self.compute_dtype\n        )\n        pinned = dict(revision=self.revision, trust_remote_code=False)\n\n        print(f"⚡ [1/2] Loading Qwen3 Text Encoder into {self.text_device} (compute: {self.compute_dtype})...", flush=True)\n        encoder = TextEncoderModel.from_pretrained(\n            artifact_id, subfolder="text_encoder",\n            quantization_config=TextQuant(**quant), torch_dtype=self.compute_dtype,\n            device_map={\'\': str(self.text_device)} if torch.cuda.is_available() else None, **pinned\n        )\n        self.text_pipe = Flux2KleinPipeline.from_pretrained(\n            artifact_id, text_encoder=encoder, transformer=None,\n            vae=None, torch_dtype=self.compute_dtype, **pinned\n        )\n\n        print(f"⚡ [2/2] Loading FLUX.2 Transformer into {self.image_device}...", flush=True)\n        transformer = Flux2Transformer2DModel.from_pretrained(\n            artifact_id, subfolder="transformer",\n            quantization_config=ImageQuant(**quant), torch_dtype=self.compute_dtype,\n            device_map={\'\': str(self.image_device)} if torch.cuda.is_available() else None, **pinned\n        )\n\n        print(f"⚡ [3/3] Assembling FLUX.2 Pipeline & VAE into {self.image_device}...", flush=True)\n        self.image_pipe = Flux2KleinPipeline.from_pretrained(\n            artifact_id, transformer=transformer,\n            text_encoder=None, tokenizer=None, torch_dtype=self.compute_dtype, **pinned\n        )\n        self.image_pipe.vae.to(device=self.image_device, dtype=torch.float32)\n        if hasattr(self.image_pipe.vae, \'enable_tiling\'):\n            try:\n                self.image_pipe.vae.enable_tiling()\n            except Exception:\n                pass\n\n        # VAE Precision Bridge: automatically cast incoming latents to VAE\'s FP32 precision\n        target_vae_dev = self.image_device\n        target_vae_dtype = torch.float32\n\n        orig_vae_decode = self.image_pipe.vae.decode\n        def safe_vae_decode(latents, *args, **kwargs):\n            if torch.is_tensor(latents):\n                latents = latents.to(device=target_vae_dev, dtype=target_vae_dtype)\n            return orig_vae_decode(latents, *args, **kwargs)\n        self.image_pipe.vae.decode = safe_vae_decode\n\n        if hasattr(self.image_pipe.vae, \'_decode\'):\n            orig_vae_internal_decode = self.image_pipe.vae._decode\n            def safe_vae_internal_decode(z, *args, **kwargs):\n                if torch.is_tensor(z):\n                    z = z.to(device=target_vae_dev, dtype=target_vae_dtype)\n                return orig_vae_internal_decode(z, *args, **kwargs)\n            self.image_pipe.vae._decode = safe_vae_internal_decode\n\n        if hasattr(self.image_pipe.vae, \'encode\'):\n            orig_vae_encode = self.image_pipe.vae.encode\n            def safe_vae_encode(x, *args, **kwargs):\n                if torch.is_tensor(x):\n                    x = x.to(device=target_vae_dev, dtype=target_vae_dtype)\n                return orig_vae_encode(x, *args, **kwargs)\n            self.image_pipe.vae.encode = safe_vae_encode\n\n        vae_scale = 8\n        if hasattr(self.image_pipe, \'vae_scale_factor\'):\n            vae_scale = self.image_pipe.vae_scale_factor\n\n        pkg_versions = {}\n        for pkg in (\'torch\', \'diffusers\', \'transformers\', \'accelerate\', \'bitsandbytes\', \'peft\'):\n            try:\n                pkg_versions[pkg] = importlib.metadata.version(pkg)\n            except Exception:\n                pkg_versions[pkg] = "unknown"\n\n        self.metadata = {\n            "model_id": artifact_id,\n            "revision": self.revision,\n            "is_distilled": True,\n            "pipeline_class": "Flux2KleinPipeline",\n            "text_device": str(self.text_device),\n            "image_device": str(self.image_device),\n            "compute_dtype": str(self.compute_dtype),\n            "vae_scale_factor": vae_scale,\n            "postprocess_mode": "safe_baseline",\n            "destructive_postprocessing": False,\n            "packages": pkg_versions,\n        }\n        print(f"📊 Engine Metadata: {json.dumps(self.metadata)}", flush=True)\n        self.is_warm = False\n        print(f"✅ Models loaded in VRAM (GPU 0: Text, GPU 1: Transformer & VAE). Ready for preflight warm-up pass.", flush=True)\n\n    def generate(\n        self,\n        source_img: Optional[Image.Image] = None,\n        category: str = "garment",\n        custom_prompt: Optional[str] = None,\n        details: Optional[str] = None,\n        seed: int = 42,\n        width: Optional[int] = None,\n        height: Optional[int] = None,\n        quality: str = "standard",\n        decoded: Optional[DecodedGarment] = None,\n        manifest: Optional[dict] = None,\n    ) -> tuple:\n        timings = {}\n        t_all_start = time.perf_counter()\n        cat_norm = normalize_category(category)\n\n        if decoded is None:\n            if source_img is None:\n                raise ValueError("Either decoded or source_img must be provided")\n            rgb = source_img.convert("RGB")\n            conditioning = rgb.copy()\n            decoded = DecodedGarment(rgb=rgb, alpha=None, conditioning_rgb=conditioning, notices=("synthetic_warmup",))\n\n        if width is None or height is None:\n            width, height = category_dimensions(cat_norm, decoded.conditioning_rgb.size, quality)\n\n        # Warmup is the only call allowed without a real appearance manifest.\n        if manifest is None and \'synthetic_warmup\' in decoded.notices:\n            manifest = {\'category\':cat_norm,\'colorAndFinish\':\'Keep the reference grey\',\'surfaceTextureAndWeave\':\'Smooth fabric\'}\n        tokenizer = self.text_pipe.tokenizer\n        prompt, prompt_report = pack_prompt(cat_norm, manifest, tokenizer)\n\n        # 1. Text encoding on GPU 0\n        t0 = time.perf_counter()\n        if torch.cuda.is_available() and self.text_device.type == "cuda":\n            torch.cuda.synchronize(self.text_device)\n        with torch.inference_mode():\n            embeds, _ = self.text_pipe.encode_prompt(\n                prompt=prompt, device=self.text_device, max_sequence_length=512\n            )\n        if torch.cuda.is_available() and self.text_device.type == "cuda":\n            torch.cuda.synchronize(self.text_device)\n        timings[\'text_enc\'] = round((time.perf_counter() - t0) * 1000, 1)\n\n        # 2. Embeddings transfer (GPU 0 -> GPU 1)\n        t0 = time.perf_counter()\n        embeds = embeds.to(device=self.image_device, dtype=self.compute_dtype)\n        if torch.cuda.is_available() and self.image_device.type == "cuda":\n            torch.cuda.synchronize(self.image_device)\n        timings[\'embed_transfer\'] = round((time.perf_counter() - t0) * 1000, 1)\n\n        # 3. Conditioning Image Preparation\n        t0 = time.perf_counter()\n        conditioned = conditioning_thumbnail(decoded, max_size=(width, height))\n        timings[\'preprocess\'] = round((time.perf_counter() - t0) * 1000, 1)\n\n        # 4. Denoising Diffusion on GPU 1 (4 steps)\n        t0 = time.perf_counter()\n        with torch.inference_mode():\n            pipe_out = self.image_pipe(\n                image=conditioned,\n                prompt_embeds=embeds,\n                width=width,\n                height=height,\n                num_inference_steps=4,\n                guidance_scale=1.0,\n                generator=torch.Generator(device="cpu").manual_seed(seed),\n            )\n            raw_out = pipe_out.images[0]\n        if torch.cuda.is_available() and self.image_device.type == "cuda":\n            torch.cuda.synchronize(self.image_device)\n        timings[\'denoise\'] = round((time.perf_counter() - t0) * 1000, 1)\n\n        # 5. Output to PIL Image\n        t0 = time.perf_counter()\n        if isinstance(raw_out, Image.Image):\n            gen_pil = raw_out\n        else:\n            arr = np.array(raw_out)\n            if arr.dtype != np.uint8:\n                arr = np.rint(np.clip(arr * 255.0, 0, 255)).astype(np.uint8)\n            gen_pil = Image.fromarray(arr)\n        timings[\'decode\'] = round((time.perf_counter() - t0) * 1000, 1)\n\n        final_pil = gen_pil.copy()\n        timings[\'color\'] = 0.0\n        timings[\'prune\'] = 0.0\n        timings[\'repair\'] = 0.0\n\n        report = {\n            "quality_status": "unverified",\n            "postprocess_reason": "safe_baseline_no_destructive_postprocessing",\n            "postprocess_mode": "safe_baseline",\n            "category": cat_norm,\n            "width": width,\n            "height": height,\n            "seed": seed,\n            "model_revision": self.revision,\n            "notices": list(decoded.notices),\n            "prompt_report": prompt_report,\n            "timings_ms": timings\n        }\n\n        timings[\'total\'] = round((time.perf_counter() - t_all_start) * 1000, 1)\n        return final_pil, timings, report\n\n# ==============================================================================\n# 4. FASTAPI APPLICATION & BOUNDED QUEUE\n# ==============================================================================\napp = FastAPI(title="ClothMatics Safe Baseline Ghost Mannequin Engine")\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_credentials=True,\n    allow_methods=["*"],\n    allow_headers=["*"],\n)\n\nENGINE = None\nENGINE_STATUS = "initializing"\nENGINE_ERROR = None\nLOCK = threading.Lock()\n\ndef load_engine_worker():\n    global ENGINE, ENGINE_STATUS, ENGINE_ERROR\n    try:\n        ENGINE_STATUS = "loading_models"\n        print("⚡ Loading Dual-GPU Models into VRAM...", flush=True)\n        engine = WarmDualGpuEngine()\n        ENGINE_STATUS = "preflight_inference"\n        print("🔥 Executing representative warm-up preflight inference...", flush=True)\n        dummy = Image.new("RGB", (576, 768), (245, 245, 245))\n        _, warm_timings, _ = engine.generate(source_img=dummy, category="shirt", width=576, height=768)\n        engine.is_warm = True\n        ENGINE = engine\n        ENGINE_STATUS = "ready"\n        print(f"🎉 WARM-UP SUCCESSFUL! Latency: {warm_timings[\'total\']}ms. Permanent VRAM readiness active.", flush=True)\n    except Exception as e:\n        import traceback\n        err_msg = traceback.format_exc()\n        ENGINE_ERROR = err_msg\n        ENGINE_STATUS = "error"\n        print(f"❌ Engine load error:\\n{err_msg}", flush=True)\n\n@app.on_event("startup")\ndef startup_load():\n    thread = threading.Thread(target=load_engine_worker, daemon=True)\n    thread.start()\n\n@app.get("/")\n@app.get("/health")\ndef health():\n    ready = ENGINE is not None and getattr(ENGINE, \'is_warm\', False)\n    gpu_info = []\n    if torch.cuda.is_available():\n        for i in range(torch.cuda.device_count()):\n            free, total = torch.cuda.mem_get_info(i)\n            gpu_info.append({\n                "gpu": i,\n                "name": torch.cuda.get_device_name(i),\n                "free_gb": round(free / 2**30, 2),\n                "total_gb": round(total / 2**30, 2)\n            })\n    return {\n        "status": "online" if ready else ENGINE_STATUS,\n        "service": "ClothMatics Safe Baseline Ghost Mannequin Engine",\n        "pipeline_version": PIPELINE_VERSION,\n        "ghost_contract_version": CONTRACT_VERSION,\n        "model": "FLUX.2-klein-4B NF4 (Warm Dual-GPU)",\n        "revision": getattr(ENGINE, \'revision\', \'e7b7dc27f91deacad38e78976d1f2b499d76a294\') if ENGINE else \'pending\',\n        "precision": "FP16 (NF4 Tensor Cores) + FP32 Tiled VAE",\n        "ready": ready,\n        "quality_status": "unverified",\n        "postprocess_mode": "safe_baseline",\n        "error": ENGINE_ERROR,\n        "gpus": gpu_info\n    }\n\n\n\n# This reviewed fragment is appended to ghost_server.py by the notebook builder.\n# Inference runs on a thread so /health and disconnect handling remain responsive.\nRESULT_CACHE = OrderedDict()\nCACHE_LOCK = threading.Lock()\nCACHE_TTL = 600\nCACHE_BYTES = 40 * 1024 * 1024\n\nfrom contextvars import ContextVar\nREQUEST_ID = ContextVar(\'request_id\', default=\'startup\')\n\ndef request_log(event, **details):\n    # Never log request headers, sync tokens, image bytes or raw user prompts.\n    print(json.dumps({\'event\':event, \'request_id\':REQUEST_ID.get(), **details}), flush=True)\n\n@app.middleware(\'http\')\nasync def log_request(request: Request, call_next):\n    if request.url.path in (\'/\', \'/health\'):\n        return await call_next(request)\n    context = REQUEST_ID.set(str(uuid.uuid4()))\n    started = time.perf_counter()\n    request_log(\'request_received\', route=\'generate\' if request.url.path == \'/generate\' else \'other\')\n    try:\n        response = await call_next(request)\n        response.headers[\'X-Request-Id\'] = REQUEST_ID.get()\n        request_log(\'request_finished\', status=response.status_code, elapsed_ms=round((time.perf_counter()-started)*1000,1))\n        return response\n    except Exception as exc:\n        request_log(\'request_failed\', error_type=type(exc).__name__, elapsed_ms=round((time.perf_counter()-started)*1000,1))\n        raise\n    finally:\n        REQUEST_ID.reset(context)\n\ndef render_request(data, category, manifest, quality, seed):\n    key = hashlib.sha256(data + json.dumps([category, manifest, quality, seed], sort_keys=True).encode()).hexdigest()\n    with CACHE_LOCK:\n        now = time.monotonic()\n        for old_key, cached in list(RESULT_CACHE.items()):\n            if now - cached[0] > CACHE_TTL:\n                RESULT_CACHE.pop(old_key, None)\n        cached = RESULT_CACHE.get(key)\n        if cached:\n            request_log(\'cache_hit\', category=category, seed=seed)\n            return Response(cached[1], media_type=\'image/png\', headers={**cached[2], \'X-Ghost-Cache\':\'hit\'})\n    if not LOCK.acquire(blocking=False):\n        request_log(\'gpu_busy\', retry_after_seconds=15)\n        raise HTTPException(429, \'Another garment is being processed. Please retry.\', headers={\'Retry-After\':\'15\'})\n    try:\n        decoded = decode_garment(data)\n        if min(decoded.rgb.size) < 64:\n            raise InputImageError(\'The source garment image is too small\')\n        request_log(\'generation_started\', category=category, seed=seed, input_bytes=len(data), source_width=decoded.rgb.width, source_height=decoded.rgb.height, palette=manifest.get(\'palette\', []))\n        output, timings, report = ENGINE.generate(decoded=decoded, category=category, manifest=manifest, quality=quality, seed=seed)\n        buffer = io.BytesIO()\n        output.convert(\'RGB\').save(buffer, format=\'PNG\', icc_profile=SRGB_ICC)\n        payload = buffer.getvalue()\n        if not 500 <= len(payload) <= MAX_UPLOAD_BYTES:\n            raise RuntimeError(\'Generated output exceeds the supported size\')\n        headers = {\'X-Request-Id\':str(uuid.uuid4()), \'X-Pipeline-Version\':PIPELINE_VERSION,\n                   \'X-Ghost-Contract-Version\':str(CONTRACT_VERSION), \'X-Ghost-Seed\':str(seed), \'X-Ghost-Palette-Version\':\'1\',\n                   \'X-Quality-Status\':\'requires_visual_comparison\', \'X-Postprocess-Mode\':\'none\',\n                   \'X-Prompt-Tokens\':str(report[\'prompt_report\'][\'prompt_tokens\']),\n                   \'X-Generation-Time\':str(timings[\'total\']) + \'ms\'}\n        with CACHE_LOCK:\n            RESULT_CACHE[key] = (time.monotonic(), payload, headers)\n            while len(RESULT_CACHE) > 4 or sum(len(entry[1]) for entry in RESULT_CACHE.values()) > CACHE_BYTES:\n                RESULT_CACHE.popitem(last=False)\n        request_log(\'generation_finished\', category=category, seed=seed, output_width=report[\'width\'], output_height=report[\'height\'], prompt_report=report[\'prompt_report\'], timings_ms=timings, output_bytes=len(payload), quality_status=\'requires_visual_comparison\')\n        return Response(payload, media_type=\'image/png\', headers=headers)\n    except InputImageError as exc:\n        raise HTTPException(400, str(exc)) from exc\n    finally:\n        LOCK.release()\n\n@app.post(\'/generate\')\nasync def generate(image: UploadFile = File(...), category: str = Form(...),\n                   manifest: str = Form(...), contract_version: int = Form(...),\n                   quality: str = Form(\'high\'), seed: int = Form(42)):\n    try:\n        if ENGINE is None or not getattr(ENGINE, \'is_warm\', False):\n            raise HTTPException(503, \'Engine is warming up; retry shortly.\', headers={\'Retry-After\':\'15\'})\n        if contract_version != CONTRACT_VERSION:\n            raise HTTPException(409, \'Update the website to the appearance v2 contract.\')\n        if quality not in (\'standard\', \'high\') or not 0 <= seed < 2**32:\n            raise HTTPException(400, \'Unsupported quality or seed\')\n        if len(manifest) > 6000 or image.content_type not in (\'image/png\',\'image/jpeg\',\'image/webp\'):\n            raise HTTPException(400, \'Invalid garment manifest or image type\')\n        try:\n            category = normalize_category(category)\n            parsed = normalize_manifest(category, json.loads(manifest))\n        except (ValueError, TypeError) as exc:\n            raise HTTPException(400, \'Invalid or mismatched garment evidence\') from exc\n        data = await image.read(MAX_UPLOAD_BYTES + 1)\n        if not data or len(data) > MAX_UPLOAD_BYTES:\n            raise HTTPException(413, \'Empty image or upload exceeds 20 MB\')\n        # The thread owns the GPU lock even if an HTTP caller times out.\n        return await asyncio.to_thread(render_request, data, category, parsed, quality, seed)\n    finally:\n        await image.close()\n'
PROMPT_CONTRACT_CODE = '"""ClothMatics appearance contract v2. Pure Python, independently testable."""\nimport re\n\nCONTRACT_VERSION = 2\nCATEGORIES = {"shirt", "tshirt", "trackpants", "trousers", "cargo", "hoodie", "jacket", "dress", "shorts"}\nSHAPE_RULES = {\'trousers\': \'Lower garment only, waistband to both hems. Preserve the exact rise, centered crotch seam, fly, inseams, two separate leg tubes, leg width and both hem openings; never add a torso or turn trousers into a jumpsuit.\', \'trackpants\': \'Lower garment only, waistband to both hems. Preserve the exact elastic waist, drawcord, rise, crotch, two separate legs, pocket layout, leg silhouette and open or cuffed hems; never add an upper garment.\', \'cargo\': \'Lower garment only, waistband to both hems. Preserve rise, fly, crotch, two separate legs and every visible cargo/hip/rear pocket with its placement and flap; never add a torso.\', \'shorts\': \'Lower garment only, waistband to both short hems. Preserve rise, fly or drawcord, centered crotch, two separate leg openings, pocket layout and exact inseam length; never lengthen into trousers or add a torso.\', \'top\': \'Preserve the exact observed top neckline, armholes, straps, sleeves and hem; do not add shirt collars or plackets.\', \'knitwear\': \'Preserve the knit pattern, ribbing, neckline, sleeve or sleeveless construction and hem.\', \'robe\': \'Preserve the visible long flowing silhouette, wrap or front opening, belt, panels and coverage.\', \'draped\': \'Preserve the photographed wrapped fabric, folds, borders and coverage; do not stitch it into trousers or invent hidden drape.\', \'clothing_set\': \'Preserve exactly the visible separate garment pieces, lengths and layering; never fuse pieces or invent missing garments.\', \'sleepwear\': \'Preserve exactly the photographed nightwear pieces, straps, closures, coverage and lengths.\', \'skirt\': \'Lower garment only. Preserve skirt flare, pleats, layers and hem; never split into trouser legs.\', \'leggings\': \'Lower garment only, waistband to both hems. Preserve close-fitting stretch construction.\', \'saree\': \'Preserve the visible saree drape, pleats, pallu and border; do not turn draped cloth into a stitched dress or invent hidden pieces.\', \'lehenga\': \'Preserve the visible flared skirt, layers, border and any photographed set pieces; do not invent missing pieces.\', \'kurta\': \'Preserve tunic length, side slits, neckline and embroidery; never shorten to a western shirt.\', \'sherwani\': \'Preserve long coat panels, collar, closures and embroidery; do not shorten or add unseen trousers.\', \'traditional_set\': \'Preserve exactly the photographed set pieces, their separate layers, drape and borders; never fuse or add pieces.\', \'jumpsuit\': \'Keep the continuous one-piece bodice and divided legs, waistband and closures.\', \'romper\': \'Keep the continuous one-piece bodice and short divided legs; preserve inseam length.\', \'blouse\': \'Preserve the observed blouse cut, neckline, sleeves, ties and hem; never add a standard shirt placket.\', \'cardigan\': \'Preserve knit texture, opening, closures, neckline and length.\', \'swimwear\': \'Preserve the exact visible one-piece or separate-piece construction, straps and coverage.\', \'innerwear\': \'Preserve the photographed garment pieces, straps, cups, seams, elastic and coverage.\', \'scarf\': \'Preserve draped or folded fabric, length, borders and fringe; do not add a torso garment.\'}\nCATEGORIES.update(SHAPE_RULES)\nLOWER_CATEGORIES = {"trousers", "trackpants", "cargo", "shorts", "skirt", "leggings"}\nALIASES = {"t-shirt":"tshirt", "t_shirt":"tshirt", "tee":"tshirt", "jeans":"trousers", "denim":"trousers", "pants":"trousers", "chinos":"trousers", "joggers":"trackpants", "sweatpants":"trackpants", "blazer":"jacket", "coat":"jacket", "polo":"shirt", "sweatshirt":"tshirt"}\nFIELDS = [\n    ("colorAndFinish", "Photographed colors", 400, 70),\n    ("surfaceTextureAndWeave", "Fabric texture", 300, 48),\n    ("waistbandAndRise", "Waistband and rise", 200, 28),\n    ("flyAndClosure", "Fly and closure", 200, 24),\n    ("crotchAndInseam", "Crotch and inseam", 220, 30),\n    ("legSilhouette", "Leg silhouette", 200, 28),\n    ("hemAndCuffs", "Both hems or cuffs", 180, 24),\n    ("pocketLayout", "Pocket layout", 220, 28),\n    ("externalCompartments", "Pockets", 240, 36),\n    ("hardwareAndClosures", "Fasteners", 220, 36),\n    ("necklineOrWaistband", "Neckline or waistband", 200, 32),\n    ("garmentLengthAndHem", "Length and hem", 200, 32),\n    ("graphicsOrText", "Graphics and lettering", 300, 48),\n    ("fit", "Observed fit", 80, 16),\n    ("sleeveType", "Sleeves", 80, 16),\n]\n\ndef normalize_category(value):\n    raw = re.sub(r"\\s+", "_", str(value or "").strip().lower())\n    category = ALIASES.get(raw, raw)\n    if category not in CATEGORIES:\n        raise ValueError("Unsupported garment category; no generic shirt fallback")\n    return category\n\ndef category_dimensions(category, size, quality):\n    """Keep the proven portrait profile for tops; frame lower garments by source shape."""\n    category = normalize_category(category)\n    if quality not in ("high", "portrait", "standard") or category not in LOWER_CATEGORIES:\n        return (768, 1024) if quality in ("high", "portrait", "standard") else ((1024, 768) if quality == "wide" else (576, 768))\n    source_width, source_height = size\n    ratio = source_width / max(1, source_height)\n    if category == "shorts":\n        ratio = min(1.15, max(.78, ratio))\n        height = 896\n    else:\n        ratio = min(.82, max(.60, ratio))\n        height = 1024\n    width = max(16, round((height * ratio) / 16) * 16)\n    return width, height\n\ndef normalize_manifest(category, manifest):\n    category = normalize_category(category)\n    if not isinstance(manifest, dict) or normalize_category(manifest.get("category")) != category:\n        raise ValueError("Manifest category must match the requested garment")\n    result = {"category": category}\n    for key, _, limit, _ in FIELDS:\n        value = manifest.get(key, "")\n        if not isinstance(value, str):\n            raise ValueError("Manifest fields must be text")\n        result[key] = re.sub(r"[<>\\x00-\\x1f]", " ", value).strip()[:limit]\n    if not result["colorAndFinish"] or not result["surfaceTextureAndWeave"]:\n        raise ValueError("Observed color and fabric texture are required")\n    if category in LOWER_CATEGORIES:\n        result["sleeveType"] = ""\n    else:\n        for key in ("waistbandAndRise", "flyAndClosure", "crotchAndInseam", "legSilhouette", "hemAndCuffs", "pocketLayout"):\n            result[key] = ""\n    palette = manifest.get(\'palette\', [])\n    if not isinstance(palette, list) or len(palette) > 12:\n        raise ValueError(\'Invalid garment palette\')\n    result[\'palette\'] = []\n    for color in palette:\n        if not isinstance(color, dict) or color.get(\'role\') not in (\'base\',\'secondary\',\'print\',\'trim\',\'hardware\',\'wash\',\'embroidery\',\'panel\') or not re.fullmatch(r\'#[a-fA-F0-9]{6}\', str(color.get(\'hex\', \'\'))):\n            raise ValueError(\'Invalid color sample\')\n        region = re.sub(r\'[^a-zA-Z0-9 ,/-]\', \' \', str(color.get(\'region\', \'\'))).strip()[:48]\n        result[\'palette\'].append({\'role\':color[\'role\'], \'hex\':color[\'hex\'].upper(), \'region\':region})\n    return result\n\ndef invariant_prompt(category):\n    category = normalize_category(category)\n    lower = category in LOWER_CATEGORIES\n    shape = SHAPE_RULES.get(category) or ("Lower garment only, waistband to leg hems. No upper garment or jumpsuit. " if lower else "Keep the reference garment\'s observed sleeves, neckline and hem. ")\n    volume = ("visible inner waistband depth, natural seat and crotch volume, two separate leg tubes, sidewall thickness, fold gradients, contact shadows and subtle product-camera perspective" if lower else "inner edge depth at the collar or waistband, natural shoulder or seat shape, sidewall thickness, fold gradients, contact shadows and subtle product-camera perspective")\n    return (\n        f"Create a clean studio ghost-mannequin product render of the SAME single {category}; no visible mannequin or human body. Use a completely invisible, anatomically neutral garment support. "\n        f"Keep the support hidden while giving the clothing believable three-dimensional volume: {volume}. "\n        "Never make a flat front cutout, technical drawing or 2D icon. No visible mannequin, person, skin, head, neck cylinder, torso, limbs, stand or hanger; only garment and white background may be visible. "\n        + shape +\n        "Reference garment pixels override text color names. Preserve photographed hue, saturation, brightness, white balance, "\n        "texture, cut, pockets, fasteners and lettering. No recoloring, redesign or invented hidden details. "\n    )\n\ndef pack_prompt(category, manifest, tokenizer, max_tokens=460):\n    """Reserve space for the chat template; never strip or truncate invariants.\n\n    Distribute the remaining budget across individual evidence fields. Shrink\n    field values (not a blind tail slice) so every observed property gets space.\n    """\n    manifest = normalize_manifest(category, manifest)\n    head = invariant_prompt(category)\n    palette = manifest[\'palette\']\n    if palette:\n        head += \' Preserve each sampled region separately; never average colors or neutralize warm stripes: \' + \'; \'.join(f"{c[\'role\']} {c[\'region\']} {c[\'hex\']}" for c in palette) + \'. \'\n    encode = lambda text: tokenizer.encode(text, add_special_tokens=False)\n    if len(encode(head)) > max_tokens - 80:\n        raise ValueError("Color evidence exceeds model context; shorten region labels and retry analysis. No palette was silently truncated.")\n    sections, truncated = [], []\n    for key, label, _, quota in FIELDS:\n        value = manifest[key]\n        if not value:\n            continue\n        ids = encode(value)\n        sections.append([key, label, ids, min(len(ids), quota)])\n        if len(ids) > quota:\n            truncated.append(key)\n    def assemble():\n        return head + " ".join(f"{label}: {tokenizer.decode(ids[:count], skip_special_tokens=True)}." for _, label, ids, count in sections)\n    while len(encode(assemble())) > max_tokens:\n        candidates = [s for s in sections if s[3] > 8]\n        if not candidates:\n            raise ValueError("Manifest cannot fit safely in the model context")\n        section = max(candidates, key=lambda s:s[3])\n        section[3] -= 1\n        if section[0] not in truncated:\n            truncated.append(section[0])\n    prompt = assemble()\n    return prompt, {"prompt_tokens":len(encode(prompt)), "truncated_fields":truncated, "contract_version":CONTRACT_VERSION}\n'

(PROJECT / 'clothmatics_api.py').write_text(WARM_SERVER_CODE)
(PROJECT / 'prompt_contract.py').write_text(PROMPT_CONTRACT_CODE)
print("✅ Safe Baseline FastAPI server script written.")

# ------------------------------------------------------------------------------
# STEP 5: Start FastAPI Server & Wait for Warm Model Loading
# ------------------------------------------------------------------------------
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    API_PORT = sock.getsockname()[1]
API_URL = f'http://127.0.0.1:{API_PORT}'

api_env = dict(os.environ)
api_env['CLOTHMATICS_PROJECT'] = str(PROJECT.resolve())
api_env['PYTHONUNBUFFERED'] = '1'
API_LOG = PROJECT / 'api-server.log'
API_LOG_FILE = open(API_LOG, 'w', encoding='utf-8', buffering=1)

print(f"\nStarting API Server on port {API_PORT}...")
print("⏳ Pre-loading models into GPU VRAM & executing preflight warm-up pass...")
API_PROCESS = subprocess.Popen([
    PYTHON, '-m', 'uvicorn', 'clothmatics_api:app',
    '--app-dir', str(PROJECT), '--host', '127.0.0.1', '--port', str(API_PORT),
    '--workers', '1', '--no-access-log', '--log-level', 'warning'
], cwd=PROJECT, env=api_env, stdout=API_LOG_FILE, stderr=subprocess.STDOUT)

model_ready = False
MAX_WAIT_SECONDS = 600
poll_interval = 2
max_attempts = MAX_WAIT_SECONDS // poll_interval
log_pos = 0

for attempt in range(max_attempts):
    time.sleep(poll_interval)
    elapsed = (attempt + 1) * poll_interval

    if API_LOG.exists():
        try:
            with API_LOG.open('r', encoding='utf-8', errors='replace') as lf:
                lf.seek(log_pos)
                new_chunk = lf.read()
                log_pos = lf.tell()
                if new_chunk:
                    for raw_line in new_chunk.splitlines():
                        clean_line = raw_line.strip()
                        if clean_line:
                            print(f"  [vram-engine] {clean_line}", flush=True)
        except Exception:
            pass

    if API_PROCESS.poll() is not None:
        log_content = API_LOG.read_text(encoding='utf-8', errors='replace') if API_LOG.exists() else "No log file found."
        raise RuntimeError("API process died unexpectedly:\n" + log_content[-3000:])

    status = "connecting"
    server_error = None
    try:
        req = urllib.request.Request(API_URL + '/health')
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            if data.get('error'):
                server_error = data['error']
            elif data.get('ready') and data.get('ghost_contract_version') == 2:
                model_ready = True
                break
            else:
                status = data.get('status', 'warming_up')
    except urllib.error.URLError:
        status = "connecting_to_server"
    except Exception as e:
        status = str(e)

    if server_error:
        print(f"\n❌ FATAL: Engine initialization failed in VRAM:\n{server_error}\n", flush=True)
        if API_LOG.exists():
            print("--- API Server Log Tail ---")
            print(API_LOG.read_text(encoding='utf-8', errors='replace')[-3000:])
        raise RuntimeError(f"Engine failed to load in VRAM:\n{server_error}")

    if attempt % 5 == 0 and attempt > 0:
        print(f"⏳ Waiting for model readiness in VRAM... ({elapsed}s/{MAX_WAIT_SECONDS}s) [Status: {status}]", flush=True)

if not model_ready:
    log_content = API_LOG.read_text() if API_LOG.exists() else "No log file found."
    raise RuntimeError(f"Model loading timed out after {MAX_WAIT_SECONDS}s. API Server Log:\n{log_content[-4000:]}")

print("🎉 MODEL IS WARM & PERMANENTLY LOADED IN VRAM!")

# ------------------------------------------------------------------------------
# STEP 6: Cloudflare Tunnel & Worker Auto-Registration
# ------------------------------------------------------------------------------
CLOUDFLARED = PROJECT / 'cloudflared'
if not CLOUDFLARED.exists():
    print("Downloading Cloudflare Tunnel binary...")
    subprocess.run([
        'wget', '-q',
        'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
        '-O', str(CLOUDFLARED)
    ], check=True)
    subprocess.run(['chmod', '+x', str(CLOUDFLARED)], check=True)

TUNNEL_LOG = PROJECT / 'tunnel.log'
TUNNEL_LOG_FILE = open(TUNNEL_LOG, 'w', encoding='utf-8', buffering=1)
TUNNEL_PROCESS = subprocess.Popen([
    str(CLOUDFLARED), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{API_PORT}'
], stdout=TUNNEL_LOG_FILE, stderr=subprocess.STDOUT)

PUBLIC_API_URL = None
print("Connecting Cloudflare Tunnel...")
for _ in range(40):
    time.sleep(0.5)
    if TUNNEL_LOG.exists():
        text = TUNNEL_LOG.read_text(encoding='utf-8', errors='replace')
        matches = re.findall(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', text)
        if matches:
            PUBLIC_API_URL = matches[0]
            break

if not PUBLIC_API_URL:
    raise RuntimeError("Failed to obtain Cloudflare tunnel URL within 20s. Check tunnel.log.")

# Register active tunnel with permanent Cloudflare Worker via POST with X-Sync-Token header
WORKER_SYNC_URL = "https://clothmatics-ghost.chiragsharma376.workers.dev/set-target"

try:
    import urllib.parse
    parsed_tunnel = urllib.parse.urlparse(PUBLIC_API_URL)
    if parsed_tunnel.scheme == "https" and parsed_tunnel.netloc:
        origin_tunnel = f"https://{parsed_tunnel.netloc}"
        sync_payload = json.dumps({"url": origin_tunnel}).encode("utf-8")
        req = urllib.request.Request(
            WORKER_SYNC_URL,
            data=sync_payload,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'ClothMatics-Kaggle-Node/9.1.0',
                'X-Sync-Token': SYNC_TOKEN
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
            print(f"✅ WORKER LINKED: {data}")
    else:
        print(f"⚠️ Invalid tunnel URL format: {PUBLIC_API_URL}")
except Exception as e:
    for proc in [API_PROCESS, TUNNEL_PROCESS]:
        if proc.poll() is None:
            proc.terminate()
    raise RuntimeError('The new engine started but Worker registration failed. Check the matching Kaggle sync secret and Worker configuration.') from e

# ------------------------------------------------------------------------------
# FINISHED!
# ------------------------------------------------------------------------------
print("\n" + "="*80)
print("CLOTHMATICS v9.2.0 GHOST VOLUME ENGINE IS LIVE")
print("="*80)
print(f"👉 PERMANENT WEBSITE ENDPOINT : https://clothmatics-ghost.chiragsharma376.workers.dev/generate")
print(f"👉 ACTIVE KAGGLE TUNNEL       : {PUBLIC_API_URL}")
print(f"⚡ COMPUTE PRECISION          : FP16 (Tensor Cores on Tesla T4) + FP32 Tiled VAE")
print(f"🛡️ PIPELINE MODE              : 3D Ghost Mannequin Safe Baseline (Non-destructive)")
print(f"GARMENT CONDITIONING         : category-specific, token-budgeted observed details")
print(f"COLOR HANDLING               : sRGB input; no global recoloring. Website visual comparison required.")
print(f"⏱️ INSTRUMENTATION            : Stage timings & quality status exposed in response headers")
print("="*80)
print("💡 Ready for generation requests via Cloudflare Worker proxy or active Kaggle tunnel.\n")

# ------------------------------------------------------------------------------
# STEP 7: Quiet listener & request-only diagnostics
# ------------------------------------------------------------------------------
print("📡 Ready. Idle output is quiet; generation requests print diagnostics (cell stays active [*]).")
print("   To stop the server, click the Stop button in Kaggle.\n")

last_api_pos = log_pos if 'log_pos' in globals() else (API_LOG.stat().st_size if API_LOG.exists() else 0)

try:
    while True:
        time.sleep(1)

        # 1. Process Health Checks
        if API_PROCESS.poll() is not None:
            tail = API_LOG.read_text(encoding='utf-8', errors='replace')[-3000:] if API_LOG.exists() else "No log file."
            print(f"\n❌ FATAL: API Server died unexpectedly (code {API_PROCESS.returncode}):\n{tail}", flush=True)
            break

        if TUNNEL_PROCESS.poll() is not None:
            tail = TUNNEL_LOG.read_text(encoding='utf-8', errors='replace')[-3000:] if TUNNEL_LOG.exists() else "No log file."
            print(f"\n❌ FATAL: Cloudflare Tunnel died unexpectedly (code {TUNNEL_PROCESS.returncode}):\n{tail}", flush=True)
            break

        # 2. Stream new API logs in real time (requests, processing, 200 OK)
        if API_LOG.exists():
            curr_size = API_LOG.stat().st_size
            if curr_size > last_api_pos:
                try:
                    with API_LOG.open('r', encoding='utf-8', errors='replace') as lf:
                        lf.seek(last_api_pos)
                        new_content = lf.read()
                        last_api_pos = lf.tell()
                        if new_content:
                            for raw_line in new_content.splitlines():
                                sline = raw_line.strip()
                                if sline:
                                    print(f"  {sline}", flush=True)
                except Exception:
                    pass

except KeyboardInterrupt:
    print("\n🛑 Stop requested by user (KeyboardInterrupt).")
finally:
    print("Shutting down API server and Cloudflare tunnel...")
    for proc in [API_PROCESS, TUNNEL_PROCESS]:
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
    for fh_name in ['API_LOG_FILE', 'TUNNEL_LOG_FILE']:
        if fh_name in globals():
            try:
                globals()[fh_name].close()
            except Exception:
                pass
    print("👋 Clean shutdown complete. Kaggle resources released.")
