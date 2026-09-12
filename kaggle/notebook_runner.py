# ==============================================================================
# CLOTHMATICS 3D GHOST MANNEQUIN - APPEARANCE V2 PIPELINE (v9.1.0)
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

print("Starting ClothMatics appearance v2 engine (v9.1.0)...\n")

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
# EMBED_SERVER

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
print("CLOTHMATICS v9.1.0 GHOST VOLUME ENGINE IS LIVE")
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
# STEP 7: Keep-Alive Server Loop & Live Request Monitor
# ------------------------------------------------------------------------------
print("📡 Listening for requests in real time (cell stays active [*])...")
print("   To stop the server, click the Stop button in Kaggle.\n")

last_api_pos = log_pos if 'log_pos' in globals() else (API_LOG.stat().st_size if API_LOG.exists() else 0)
tick = 0

try:
    while True:
        time.sleep(1)
        tick += 1

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

        # 3. Periodic Heartbeat every 30 seconds
        if tick % 30 == 0:
            vram_status = ""
            try:
                import torch
                if torch.cuda.is_available():
                    free0, total0 = torch.cuda.mem_get_info(0)
                    free1, total1 = torch.cuda.mem_get_info(1)
                    vram_status = f" | VRAM GPU0: {round(free0/2**30, 1)}/{round(total0/2**30, 1)}GB | GPU1: {round(free1/2**30, 1)}/{round(total1/2**30, 1)}GB"
            except Exception:
                pass
            print(f"💓 [Heartbeat] Engine active & ready{vram_status} | Tunnel: {PUBLIC_API_URL}", flush=True)

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
