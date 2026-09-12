import io, json, os, subprocess, sys, tempfile, threading, time, uuid, re, warnings
import importlib.metadata
import asyncio, hashlib
from collections import OrderedDict
from prompt_contract import normalize_category, normalize_manifest, pack_prompt, CONTRACT_VERSION
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple, List
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps, ImageCms, UnidentifiedImageError
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

# ==============================================================================
# 1. CONSTANTS, PROFILES & COLOR MANAGEMENT
# ==============================================================================
PIPELINE_VERSION = "9.1.0-ghost-volume-v2"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_INPUT_PIXELS = 24_000_000        # 24 Mpx
SRGB_PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
SRGB_ICC = SRGB_PROFILE.tobytes()

class InputImageError(ValueError):
    """Raised when an uploaded input image violates size, mode or format constraints."""
    pass

@dataclass
class DecodedGarment:
    rgb: Image.Image
    alpha: Optional[Image.Image]
    conditioning_rgb: Image.Image
    notices: tuple

def decode_garment(data: bytes) -> DecodedGarment:
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise InputImageError("Image is empty or exceeds the upload limit (20MB)")
    notices = []
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as opened:
                if getattr(opened, "n_frames", 1) != 1:
                    raise InputImageError("Upload one still image")
                if opened.width * opened.height > MAX_INPUT_PIXELS:
                    raise InputImageError("Image exceeds the pixel limit (24M pixels)")
                opened.load()
                icc = opened.info.get("icc_profile")
                oriented = ImageOps.exif_transpose(opened)
                has_alpha = (
                    "A" in oriented.getbands() or "transparency" in oriented.info
                )
                alpha = oriented.convert("RGBA").getchannel("A") if has_alpha else None
                if alpha is not None:
                    extrema = alpha.getextrema()
                    if extrema[1] == 0:
                        raise InputImageError("Image is fully transparent")
                    if extrema == (255, 255):
                        alpha = None
                if oriented.mode == "LA":
                    base = oriented.getchannel("L")
                else:
                    base = oriented if oriented.mode in ("RGB", "CMYK", "L", "LAB") else oriented.convert("RGB")
                if icc:
                    try:
                        src_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                        rgb = ImageCms.profileToProfile(
                            base, src_profile, SRGB_PROFILE, outputMode="RGB"
                        )
                    except (ImageCms.PyCMSError, OSError, ValueError) as exc:
                        raise InputImageError("Embedded color profile cannot be converted") from exc
                else:
                    if base.mode not in ("RGB", "L"):
                        raise InputImageError("This color mode requires a valid embedded profile")
                    rgb = base.convert("RGB")
                    notices.append("untagged_input_assumed_srgb")
                rgb = rgb.copy()
                if alpha is not None:
                    alpha = alpha.copy()
                    rgba = rgb.convert("RGBA")
                    rgba.putalpha(alpha)
                    white = Image.new("RGBA", rgb.size, (255, 255, 255, 255))
                    conditioning = Image.alpha_composite(white, rgba).convert("RGB")
                else:
                    conditioning = rgb.copy()
                rgb.info.clear()
                conditioning.info.clear()
                return DecodedGarment(rgb, alpha, conditioning, tuple(notices))
    except InputImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, getattr(Image, "DecompressionBombError", Exception)) as exc:
        raise InputImageError("Unsupported or invalid image") from exc

def conditioning_thumbnail(decoded: DecodedGarment, max_size=(768, 1024)) -> Image.Image:
    result = decoded.conditioning_rgb.copy()
    result.thumbnail(max_size, Image.Resampling.LANCZOS)
    return result

# ==============================================================================
# 2. CATEGORY NORMALIZATION & PRESERVATION PROMPTS
# ==============================================================================
# Category handling and token-aware prompts live in prompt_contract.py.

class WarmDualGpuEngine:
    def __init__(self):
        try:
            from transformers import Qwen3ForCausalLM as TextEncoderModel
        except (ImportError, AttributeError):
            from transformers import AutoModelForCausalLM as TextEncoderModel
        from transformers import BitsAndBytesConfig as TextQuant
        from diffusers import Flux2KleinPipeline, Flux2Transformer2DModel, BitsAndBytesConfig as ImageQuant
        
        self.num_gpus = torch.cuda.device_count()
        if self.num_gpus == 0:
            raise RuntimeError('Enable a Kaggle GPU accelerator before starting the engine.')
        if self.num_gpus >= 2:
            self.text_device = torch.device("cuda:0")
            self.image_device = torch.device("cuda:1")
            print("🚀 DUAL-GPU PIPELINE: GPU 0 (Qwen3 Text) | GPU 1 (FLUX Transformer)", flush=True)
        elif self.num_gpus == 1:
            self.text_device = torch.device("cuda:0")
            self.image_device = torch.device("cuda:0")
            print("⚡ SINGLE-GPU PIPELINE: GPU 0 (Shared)", flush=True)
        else:
            self.text_device = torch.device("cpu")
            self.image_device = torch.device("cpu")

        artifact_id = "black-forest-labs/FLUX.2-klein-4B"
        self.revision = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
        self.compute_dtype = torch.float16

        quant = dict(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=self.compute_dtype
        )
        pinned = dict(revision=self.revision, trust_remote_code=False)

        print(f"⚡ [1/2] Loading Qwen3 Text Encoder into {self.text_device} (compute: {self.compute_dtype})...", flush=True)
        encoder = TextEncoderModel.from_pretrained(
            artifact_id, subfolder="text_encoder",
            quantization_config=TextQuant(**quant), torch_dtype=self.compute_dtype,
            device_map={'': str(self.text_device)} if torch.cuda.is_available() else None, **pinned
        )
        self.text_pipe = Flux2KleinPipeline.from_pretrained(
            artifact_id, text_encoder=encoder, transformer=None,
            vae=None, torch_dtype=self.compute_dtype, **pinned
        )

        print(f"⚡ [2/2] Loading FLUX.2 Transformer into {self.image_device}...", flush=True)
        transformer = Flux2Transformer2DModel.from_pretrained(
            artifact_id, subfolder="transformer",
            quantization_config=ImageQuant(**quant), torch_dtype=self.compute_dtype,
            device_map={'': str(self.image_device)} if torch.cuda.is_available() else None, **pinned
        )

        print(f"⚡ [3/3] Assembling FLUX.2 Pipeline & VAE into {self.image_device}...", flush=True)
        self.image_pipe = Flux2KleinPipeline.from_pretrained(
            artifact_id, transformer=transformer,
            text_encoder=None, tokenizer=None, torch_dtype=self.compute_dtype, **pinned
        )
        self.image_pipe.vae.to(device=self.image_device, dtype=torch.float32)
        if hasattr(self.image_pipe.vae, 'enable_tiling'):
            try:
                self.image_pipe.vae.enable_tiling()
            except Exception:
                pass

        # VAE Precision Bridge: automatically cast incoming latents to VAE's FP32 precision
        target_vae_dev = self.image_device
        target_vae_dtype = torch.float32

        orig_vae_decode = self.image_pipe.vae.decode
        def safe_vae_decode(latents, *args, **kwargs):
            if torch.is_tensor(latents):
                latents = latents.to(device=target_vae_dev, dtype=target_vae_dtype)
            return orig_vae_decode(latents, *args, **kwargs)
        self.image_pipe.vae.decode = safe_vae_decode

        if hasattr(self.image_pipe.vae, '_decode'):
            orig_vae_internal_decode = self.image_pipe.vae._decode
            def safe_vae_internal_decode(z, *args, **kwargs):
                if torch.is_tensor(z):
                    z = z.to(device=target_vae_dev, dtype=target_vae_dtype)
                return orig_vae_internal_decode(z, *args, **kwargs)
            self.image_pipe.vae._decode = safe_vae_internal_decode

        if hasattr(self.image_pipe.vae, 'encode'):
            orig_vae_encode = self.image_pipe.vae.encode
            def safe_vae_encode(x, *args, **kwargs):
                if torch.is_tensor(x):
                    x = x.to(device=target_vae_dev, dtype=target_vae_dtype)
                return orig_vae_encode(x, *args, **kwargs)
            self.image_pipe.vae.encode = safe_vae_encode

        vae_scale = 8
        if hasattr(self.image_pipe, 'vae_scale_factor'):
            vae_scale = self.image_pipe.vae_scale_factor

        pkg_versions = {}
        for pkg in ('torch', 'diffusers', 'transformers', 'accelerate', 'bitsandbytes', 'peft'):
            try:
                pkg_versions[pkg] = importlib.metadata.version(pkg)
            except Exception:
                pkg_versions[pkg] = "unknown"

        self.metadata = {
            "model_id": artifact_id,
            "revision": self.revision,
            "is_distilled": True,
            "pipeline_class": "Flux2KleinPipeline",
            "text_device": str(self.text_device),
            "image_device": str(self.image_device),
            "compute_dtype": str(self.compute_dtype),
            "vae_scale_factor": vae_scale,
            "postprocess_mode": "safe_baseline",
            "destructive_postprocessing": False,
            "packages": pkg_versions,
        }
        print(f"📊 Engine Metadata: {json.dumps(self.metadata)}", flush=True)
        self.is_warm = False
        print(f"✅ Models loaded in VRAM (GPU 0: Text, GPU 1: Transformer & VAE). Ready for preflight warm-up pass.", flush=True)

    def generate(
        self,
        source_img: Optional[Image.Image] = None,
        category: str = "garment",
        custom_prompt: Optional[str] = None,
        details: Optional[str] = None,
        seed: int = 42,
        width: Optional[int] = None,
        height: Optional[int] = None,
        quality: str = "standard",
        decoded: Optional[DecodedGarment] = None,
        manifest: Optional[dict] = None,
    ) -> tuple:
        timings = {}
        t_all_start = time.perf_counter()
        cat_norm = normalize_category(category)

        if decoded is None:
            if source_img is None:
                raise ValueError("Either decoded or source_img must be provided")
            rgb = source_img.convert("RGB")
            conditioning = rgb.copy()
            decoded = DecodedGarment(rgb=rgb, alpha=None, conditioning_rgb=conditioning, notices=("synthetic_warmup",))

        if width is None or height is None:
            if quality in ("high", "portrait", "standard"):
                width, height = 768, 1024
            elif quality == "wide":
                width, height = 1024, 768
            else:
                width, height = 576, 768

        # Warmup is the only call allowed without a real appearance manifest.
        if manifest is None and 'synthetic_warmup' in decoded.notices:
            manifest = {'category':cat_norm,'colorAndFinish':'Keep the reference grey','surfaceTextureAndWeave':'Smooth fabric'}
        tokenizer = self.text_pipe.tokenizer
        prompt, prompt_report = pack_prompt(cat_norm, manifest, tokenizer)

        # 1. Text encoding on GPU 0
        t0 = time.perf_counter()
        if torch.cuda.is_available() and self.text_device.type == "cuda":
            torch.cuda.synchronize(self.text_device)
        with torch.inference_mode():
            embeds, _ = self.text_pipe.encode_prompt(
                prompt=prompt, device=self.text_device, max_sequence_length=512
            )
        if torch.cuda.is_available() and self.text_device.type == "cuda":
            torch.cuda.synchronize(self.text_device)
        timings['text_enc'] = round((time.perf_counter() - t0) * 1000, 1)

        # 2. Embeddings transfer (GPU 0 -> GPU 1)
        t0 = time.perf_counter()
        embeds = embeds.to(device=self.image_device, dtype=self.compute_dtype)
        if torch.cuda.is_available() and self.image_device.type == "cuda":
            torch.cuda.synchronize(self.image_device)
        timings['embed_transfer'] = round((time.perf_counter() - t0) * 1000, 1)

        # 3. Conditioning Image Preparation
        t0 = time.perf_counter()
        conditioned = conditioning_thumbnail(decoded, max_size=(768, 1024))
        timings['preprocess'] = round((time.perf_counter() - t0) * 1000, 1)

        # 4. Denoising Diffusion on GPU 1 (4 steps)
        t0 = time.perf_counter()
        with torch.inference_mode():
            pipe_out = self.image_pipe(
                image=conditioned,
                prompt_embeds=embeds,
                width=width,
                height=height,
                num_inference_steps=4,
                guidance_scale=1.0,
                generator=torch.Generator(device="cpu").manual_seed(seed),
            )
            raw_out = pipe_out.images[0]
        if torch.cuda.is_available() and self.image_device.type == "cuda":
            torch.cuda.synchronize(self.image_device)
        timings['denoise'] = round((time.perf_counter() - t0) * 1000, 1)

        # 5. Output to PIL Image
        t0 = time.perf_counter()
        if isinstance(raw_out, Image.Image):
            gen_pil = raw_out
        else:
            arr = np.array(raw_out)
            if arr.dtype != np.uint8:
                arr = np.rint(np.clip(arr * 255.0, 0, 255)).astype(np.uint8)
            gen_pil = Image.fromarray(arr)
        timings['decode'] = round((time.perf_counter() - t0) * 1000, 1)

        final_pil = gen_pil.copy()
        timings['color'] = 0.0
        timings['prune'] = 0.0
        timings['repair'] = 0.0

        report = {
            "quality_status": "unverified",
            "postprocess_reason": "safe_baseline_no_destructive_postprocessing",
            "postprocess_mode": "safe_baseline",
            "category": cat_norm,
            "width": width,
            "height": height,
            "seed": seed,
            "model_revision": self.revision,
            "notices": list(decoded.notices),
            "prompt_report": prompt_report,
            "timings_ms": timings
        }

        timings['total'] = round((time.perf_counter() - t_all_start) * 1000, 1)
        return final_pil, timings, report

# ==============================================================================
# 4. FASTAPI APPLICATION & BOUNDED QUEUE
# ==============================================================================
app = FastAPI(title="ClothMatics Safe Baseline Ghost Mannequin Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ENGINE = None
ENGINE_STATUS = "initializing"
ENGINE_ERROR = None
LOCK = threading.Lock()

def load_engine_worker():
    global ENGINE, ENGINE_STATUS, ENGINE_ERROR
    try:
        ENGINE_STATUS = "loading_models"
        print("⚡ Loading Dual-GPU Models into VRAM...", flush=True)
        engine = WarmDualGpuEngine()
        ENGINE_STATUS = "preflight_inference"
        print("🔥 Executing representative warm-up preflight inference...", flush=True)
        dummy = Image.new("RGB", (576, 768), (245, 245, 245))
        _, warm_timings, _ = engine.generate(source_img=dummy, category="shirt", width=576, height=768)
        engine.is_warm = True
        ENGINE = engine
        ENGINE_STATUS = "ready"
        print(f"🎉 WARM-UP SUCCESSFUL! Latency: {warm_timings['total']}ms. Permanent VRAM readiness active.", flush=True)
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        ENGINE_ERROR = err_msg
        ENGINE_STATUS = "error"
        print(f"❌ Engine load error:\n{err_msg}", flush=True)

@app.on_event("startup")
def startup_load():
    thread = threading.Thread(target=load_engine_worker, daemon=True)
    thread.start()

@app.get("/")
@app.get("/health")
def health():
    ready = ENGINE is not None and getattr(ENGINE, 'is_warm', False)
    gpu_info = []
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(i)
            gpu_info.append({
                "gpu": i,
                "name": torch.cuda.get_device_name(i),
                "free_gb": round(free / 2**30, 2),
                "total_gb": round(total / 2**30, 2)
            })
    return {
        "status": "online" if ready else ENGINE_STATUS,
        "service": "ClothMatics Safe Baseline Ghost Mannequin Engine",
        "pipeline_version": PIPELINE_VERSION,
        "ghost_contract_version": CONTRACT_VERSION,
        "model": "FLUX.2-klein-4B NF4 (Warm Dual-GPU)",
        "revision": getattr(ENGINE, 'revision', 'e7b7dc27f91deacad38e78976d1f2b499d76a294') if ENGINE else 'pending',
        "precision": "FP16 (NF4 Tensor Cores) + FP32 Tiled VAE",
        "ready": ready,
        "quality_status": "unverified",
        "postprocess_mode": "safe_baseline",
        "error": ENGINE_ERROR,
        "gpus": gpu_info
    }


