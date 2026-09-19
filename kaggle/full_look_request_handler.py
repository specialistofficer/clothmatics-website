# Optional selected-wardrobe composition route. Appended by build_notebook.py.
# Existing /generate and worn-photo /outfit routes remain unchanged.
FULL_LOOK_VERSION = '1'
MAX_FULL_LOOK_ITEMS = 6
MAX_FULL_LOOK_JSON = 36000
FULL_LOOK_WIDTH = 832
FULL_LOOK_HEIGHT = 1088


def _look_clean(value, limit=160):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


def _full_look_items(raw, reference_count):
    if len(raw) > MAX_FULL_LOOK_JSON:
        raise HTTPException(413, 'Complete-look evidence is too large')
    try:
        values = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(400, 'Invalid complete-look evidence') from exc
    if not isinstance(values, list) or not 2 <= len(values) <= MAX_FULL_LOOK_ITEMS or len(values) != reference_count:
        raise HTTPException(400, 'Provide matching references for two to six outfit items')
    allowed_slots = {'top', 'bottom', 'layer', 'hero', 'footwear', 'accessory'}
    clean = []
    for index, item in enumerate(values):
        if not isinstance(item, dict) or item.get('index') != index or item.get('slot') not in allowed_slots:
            raise HTTPException(400, 'Complete-look item order or slot is invalid')
        palette = item.get('palette') if isinstance(item.get('palette'), list) else []
        clean.append({
            'index': index,
            'slot': item['slot'],
            'title': _look_clean(item.get('title'), 80),
            'category': _look_clean(item.get('category'), 60),
            'rendererCategory': _look_clean(item.get('rendererCategory'), 40),
            'primaryColor': _look_clean(item.get('primaryColor'), 50),
            'secondaryColors': [_look_clean(value, 40) for value in (item.get('secondaryColors') or [])[:8]],
            'pattern': _look_clean(item.get('pattern'), 70),
            'material': _look_clean(item.get('material'), 70),
            'fit': _look_clean(item.get('fit'), 50),
            'palette': [entry for entry in palette[:12] if isinstance(entry, dict)],
            'colorAndFinish': _look_clean(item.get('colorAndFinish'), 220),
            'surfaceTextureAndWeave': _look_clean(item.get('surfaceTextureAndWeave'), 180),
            'hardwareAndClosures': _look_clean(item.get('hardwareAndClosures'), 130),
            'graphicsOrText': _look_clean(item.get('graphicsOrText'), 150),
            'sourceKind': 'verified_ghost' if item.get('sourceKind') == 'verified_ghost' else 'wardrobe_photo',
        })
    slots = [item['slot'] for item in clean]
    if 'hero' in slots:
        if 'top' in slots or 'bottom' in slots:
            raise HTTPException(400, 'A one-piece look cannot also contain separate top or bottom pieces')
    elif 'top' not in slots or 'bottom' not in slots:
        raise HTTPException(400, 'A complete look needs a top and bottom')
    return clean


def _palette_text(entries):
    parts = []
    for entry in entries:
        color = _look_clean(entry.get('hex'), 7)
        role = _look_clean(entry.get('role'), 24)
        region = _look_clean(entry.get('region'), 48)
        if re.fullmatch(r'#[0-9A-Fa-f]{6}', color):
            parts.append(f'{role or "color"} {color} at {region or "visible region"}')
    return ', '.join(parts)


def pack_full_look_prompt(items, presentation, feedback, tokenizer):
    base = (
        f'Create one premium full-body studio fashion photograph of one anonymous {presentation} retail mannequin wearing all supplied wardrobe references together as one realistic complete outfit. '
        'Show the mannequin from smooth featureless head to footwear, centered, standing naturally in a subtle three-quarter front pose on a seamless warm-white studio background. '
        'The mannequin is a neutral display form, not a real person: no identity, facial features, hair or skin. Keep normal mannequin hands only when needed beside the outfit. '
        'Use each numbered reference exactly once and in its assigned body slot. Preserve the source garment pixels as authority for hue, saturation, brightness, multicolor region placement, fabric texture, pattern, graphics, silhouette, length, closures and construction. '
        'Layer garments naturally without hiding their defining details. Preserve a footwear pair as two matching shoes and place accessories naturally. Do not invent, duplicate, omit, recolor, mirror or redesign any wardrobe piece. '
        'Produce one coherent photographed outfit, not a collage, contact sheet, flat lay, floating product arrangement, split screen or separate garment cards.'
    )
    lines = []
    for item in items:
        details = [
            f'Reference {item["index"] + 1}: slot={item["slot"]}',
            f'item={item["title"] or item["category"] or "wardrobe piece"}',
            f'category={item["category"]}',
            f'palette={_palette_text(item["palette"])}',
            f'colors={item["colorAndFinish"] or item["primaryColor"]}',
            f'pattern={item["pattern"]}',
            f'material={item["surfaceTextureAndWeave"] or item["material"]}',
            f'fit={item["fit"]}',
            f'construction={item["hardwareAndClosures"]}',
            f'graphics={item["graphicsOrText"]}',
        ]
        lines.append('; '.join(part for part in details if not part.endswith('=')) + '.')
    correction = f' Mandatory correction from the previous comparison: {_look_clean(feedback, 900)}' if feedback else ''
    prompt = base + ' ' + ' '.join(lines) + correction
    tokens = tokenizer.encode(prompt, add_special_tokens=False)
    if len(tokens) > 500:
        compact = []
        for item in items:
            compact.append(
                f'Reference {item["index"] + 1}: {item["slot"]}; {item["category"]}; '
                f'palette {_palette_text(item["palette"])}; colors {_look_clean(item["colorAndFinish"] or item["primaryColor"], 100)}; '
                f'pattern {_look_clean(item["pattern"], 45)}; material {_look_clean(item["surfaceTextureAndWeave"] or item["material"], 70)}.'
            )
        prompt = base + ' ' + ' '.join(compact) + correction
        tokens = tokenizer.encode(prompt, add_special_tokens=False)
    if len(tokens) > 512:
        raise HTTPException(400, 'Complete-look evidence does not fit the model context')
    return prompt, len(tokens)


def render_full_look(reference_bytes, items, presentation, feedback, seed):
    cache_material = b''.join(hashlib.sha256(value).digest() for value in reference_bytes)
    key = hashlib.sha256(b'full-look-v1' + cache_material + json.dumps([items, presentation, feedback, seed], sort_keys=True).encode()).hexdigest()
    with CACHE_LOCK:
        now = time.monotonic()
        for old_key, cached in list(RESULT_CACHE.items()):
            if now - cached[0] > CACHE_TTL:
                RESULT_CACHE.pop(old_key, None)
        cached = RESULT_CACHE.get(key)
        if cached:
            request_log('full_look_cache_hit', item_count=len(items), seed=seed)
            return Response(cached[1], media_type='image/png', headers={**cached[2], 'X-Ghost-Cache':'hit'})
    if not LOCK.acquire(blocking=False):
        request_log('gpu_busy', retry_after_seconds=15)
        raise HTTPException(429, 'Another generation is being processed. Please retry.', headers={'Retry-After':'15'})
    try:
        decoded = [decode_garment(value) for value in reference_bytes]
        if any(min(image.rgb.size) < 64 for image in decoded):
            raise InputImageError('A complete-look reference is too small')
        prompt, prompt_tokens = pack_full_look_prompt(items, presentation, feedback, ENGINE.text_pipe.tokenizer)
        request_log('full_look_generation_started', item_count=len(items), slots=[item['slot'] for item in items], presentation=presentation, seed=seed, prompt_tokens=prompt_tokens, input_bytes=sum(len(value) for value in reference_bytes))
        started = time.perf_counter()
        with torch.inference_mode():
            embeds, _ = ENGINE.text_pipe.encode_prompt(prompt=prompt, device=ENGINE.text_device, max_sequence_length=512)
        embeds = embeds.to(device=ENGINE.image_device, dtype=ENGINE.compute_dtype)
        conditioned = [conditioning_thumbnail(image, max_size=(640, 768)) for image in decoded]
        with torch.inference_mode():
            generated = ENGINE.image_pipe(
                image=conditioned,
                prompt_embeds=embeds,
                width=FULL_LOOK_WIDTH,
                height=FULL_LOOK_HEIGHT,
                num_inference_steps=4,
                guidance_scale=1.0,
                generator=torch.Generator(device='cpu').manual_seed(seed),
            ).images[0]
        output = generated if isinstance(generated, Image.Image) else Image.fromarray(np.rint(np.clip(np.array(generated) * 255.0, 0, 255)).astype(np.uint8))
        buffer = io.BytesIO();output.convert('RGB').save(buffer, format='PNG', icc_profile=SRGB_ICC);payload = buffer.getvalue()
        if not 500 <= len(payload) <= MAX_UPLOAD_BYTES:
            raise RuntimeError('Generated complete look exceeds the supported size')
        elapsed = round((time.perf_counter() - started) * 1000, 1)
        headers = {'X-Request-Id':str(uuid.uuid4()), 'X-Full-Look-Pipeline-Version':FULL_LOOK_VERSION, 'X-Full-Look-Seed':str(seed), 'X-Generation-Time':str(elapsed)+'ms'}
        with CACHE_LOCK:
            RESULT_CACHE[key] = (time.monotonic(), payload, headers)
            while len(RESULT_CACHE) > 4 or sum(len(entry[1]) for entry in RESULT_CACHE.values()) > CACHE_BYTES:
                RESULT_CACHE.popitem(last=False)
        request_log('full_look_generation_finished', item_count=len(items), seed=seed, output_width=FULL_LOOK_WIDTH, output_height=FULL_LOOK_HEIGHT, output_bytes=len(payload), elapsed_ms=elapsed)
        return Response(payload, media_type='image/png', headers=headers)
    except InputImageError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        LOCK.release()


@app.post('/full-look')
async def generate_full_look(reference: List[UploadFile] = File(...), items: str = Form(...),
                             presentation: str = Form(...), feedback: str = Form(''),
                             contract_version: int = Form(...), seed: int = Form(42)):
    try:
        if ENGINE is None or not getattr(ENGINE, 'is_warm', False):
            raise HTTPException(503, 'Engine is warming up; retry shortly.', headers={'Retry-After':'15'})
        if contract_version != 1:
            raise HTTPException(409, 'Update the website to the full-look v1 contract.')
        if presentation not in ('masculine', 'feminine', 'neutral') or not 0 <= seed < 2**32 or len(feedback) > 900:
            raise HTTPException(400, 'Invalid complete-look presentation, correction or seed')
        if not 2 <= len(reference) <= MAX_FULL_LOOK_ITEMS or any(upload.content_type not in ('image/png','image/jpeg','image/webp') for upload in reference):
            raise HTTPException(400, 'Provide two to six supported reference images')
        parsed = _full_look_items(items, len(reference));data = []
        for upload in reference:
            value = await upload.read(MAX_UPLOAD_BYTES + 1)
            if not value or len(value) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, 'A complete-look reference is empty or exceeds 20 MB')
            data.append(value)
        return await asyncio.to_thread(render_full_look, data, parsed, presentation, feedback, seed)
    finally:
        for upload in reference:
            await upload.close()
