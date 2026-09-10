# This reviewed fragment is appended to ghost_server.py by the notebook builder.
# Inference runs on a thread so /health and disconnect handling remain responsive.
RESULT_CACHE = OrderedDict()
CACHE_LOCK = threading.Lock()
CACHE_TTL = 600
CACHE_BYTES = 40 * 1024 * 1024

def render_request(data, category, manifest, quality, seed):
    key = hashlib.sha256(data + json.dumps([category, manifest, quality, seed], sort_keys=True).encode()).hexdigest()
    with CACHE_LOCK:
        now = time.monotonic()
        for old_key, cached in list(RESULT_CACHE.items()):
            if now - cached[0] > CACHE_TTL:
                RESULT_CACHE.pop(old_key, None)
        cached = RESULT_CACHE.get(key)
        if cached:
            return Response(cached[1], media_type='image/png', headers={**cached[2], 'X-Ghost-Cache':'hit'})
    if not LOCK.acquire(blocking=False):
        raise HTTPException(429, 'Another garment is being processed. Please retry.', headers={'Retry-After':'15'})
    try:
        decoded = decode_garment(data)
        if min(decoded.rgb.size) < 64:
            raise InputImageError('The source garment image is too small')
        output, timings, report = ENGINE.generate(decoded=decoded, category=category, manifest=manifest, quality=quality, seed=seed)
        buffer = io.BytesIO()
        output.convert('RGB').save(buffer, format='PNG', icc_profile=SRGB_ICC)
        payload = buffer.getvalue()
        if not 500 <= len(payload) <= MAX_UPLOAD_BYTES:
            raise RuntimeError('Generated output exceeds the supported size')
        headers = {'X-Request-Id':str(uuid.uuid4()), 'X-Pipeline-Version':PIPELINE_VERSION,
                   'X-Ghost-Contract-Version':str(CONTRACT_VERSION), 'X-Ghost-Seed':str(seed),
                   'X-Quality-Status':'requires_visual_comparison', 'X-Postprocess-Mode':'none',
                   'X-Prompt-Tokens':str(report['prompt_report']['prompt_tokens']),
                   'X-Generation-Time':str(timings['total']) + 'ms'}
        with CACHE_LOCK:
            RESULT_CACHE[key] = (time.monotonic(), payload, headers)
            while len(RESULT_CACHE) > 4 or sum(len(entry[1]) for entry in RESULT_CACHE.values()) > CACHE_BYTES:
                RESULT_CACHE.popitem(last=False)
        print(f"Generated {category} seed={seed} tokens={report['prompt_report']['prompt_tokens']} time={timings['total']}ms; visual comparison still required", flush=True)
        return Response(payload, media_type='image/png', headers=headers)
    except InputImageError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        LOCK.release()

@app.post('/generate')
async def generate(image: UploadFile = File(...), category: str = Form(...),
                   manifest: str = Form(...), contract_version: int = Form(...),
                   quality: str = Form('high'), seed: int = Form(42)):
    try:
        if ENGINE is None or not getattr(ENGINE, 'is_warm', False):
            raise HTTPException(503, 'Engine is warming up; retry shortly.', headers={'Retry-After':'15'})
        if contract_version != CONTRACT_VERSION:
            raise HTTPException(409, 'Update the website to the appearance v2 contract.')
        if quality not in ('standard', 'high') or not 0 <= seed < 2**32:
            raise HTTPException(400, 'Unsupported quality or seed')
        if len(manifest) > 6000 or image.content_type not in ('image/png','image/jpeg','image/webp'):
            raise HTTPException(400, 'Invalid garment manifest or image type')
        try:
            category = normalize_category(category)
            parsed = normalize_manifest(category, json.loads(manifest))
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, 'Invalid or mismatched garment evidence') from exc
        data = await image.read(MAX_UPLOAD_BYTES + 1)
        if not data or len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, 'Empty image or upload exceeds 20 MB')
        # The thread owns the GPU lock even if an HTTP caller times out.
        return await asyncio.to_thread(render_request, data, category, parsed, quality, seed)
    finally:
        await image.close()
