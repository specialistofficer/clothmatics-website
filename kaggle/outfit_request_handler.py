# Optional full-photo outfit route. Appended after request_handler.py by the
# notebook builder; /generate remains untouched.
import base64
from fastapi.responses import JSONResponse
from outfit_parser import parse_outfit, OutfitParserError, PARSER_VERSION

MAX_OUTFIT_ITEMS = 5
MAX_OUTFIT_JSON = 30000
MAX_OUTFIT_RESPONSE = 32 * 1024 * 1024


def _outfit_items(raw):
    if len(raw) > MAX_OUTFIT_JSON:
        raise HTTPException(413, 'Outfit evidence is too large')
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(400, 'Invalid outfit evidence') from exc
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_OUTFIT_ITEMS:
        raise HTTPException(400, 'Provide between one and five outfit items')
    clean, seen = [], set()
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get('index'), int) or item['index'] in seen:
            raise HTTPException(400, 'Outfit item indexes must be unique integers')
        seen.add(item['index'])
        candidate = {
            'index': item['index'],
            'boundingBox': item.get('boundingBox'),
            'parserClass': str(item.get('parserClass') or '')[:40],
            'quality': item.get('quality', 'high'),
            'seed': item.get('seed', 42),
        }
        category = item.get('category')
        manifest = item.get('manifest')
        if category is not None:
            try:
                category = normalize_category(category)
                manifest = normalize_manifest(category, manifest)
            except (ValueError, TypeError) as exc:
                raise HTTPException(400, 'Invalid or mismatched outfit garment evidence') from exc
            if candidate['quality'] not in ('standard', 'high') or not isinstance(candidate['seed'], int) or not 0 <= candidate['seed'] < 2**32:
                raise HTTPException(400, 'Unsupported outfit quality or seed')
            candidate.update(category=category, manifest=manifest)
        clean.append(candidate)
    return clean


@app.post('/outfit')
async def generate_outfit(image: UploadFile = File(...), items: str = Form(...),
                          contract_version: int = Form(...)):
    try:
        if ENGINE is None or not getattr(ENGINE, 'is_warm', False):
            raise HTTPException(503, 'Engine is warming up; retry shortly.', headers={'Retry-After':'15'})
        if contract_version != CONTRACT_VERSION:
            raise HTTPException(409, 'Update the website to the appearance v2 contract.')
        if image.content_type not in ('image/png', 'image/jpeg', 'image/webp'):
            raise HTTPException(400, 'Invalid outfit image type')
        parsed_items = _outfit_items(items)
        data = await image.read(MAX_UPLOAD_BYTES + 1)
        if not data or len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, 'Empty image or upload exceeds 20 MB')
        request_log('outfit_parsing_started', item_count=len(parsed_items), input_bytes=len(data))
        try:
            cutouts, skipped, evidence = await asyncio.to_thread(parse_outfit, data, parsed_items)
        except OutfitParserError as exc:
            request_log('outfit_not_worn', reason=str(exc))
            raise HTTPException(409, str(exc), headers={'X-Outfit-Pipeline-Version':PARSER_VERSION}) from exc
        by_index = {item['index']: item for item in parsed_items}
        results = []
        for cutout in cutouts:
            request = by_index[cutout.index]
            result = {
                'index': cutout.index,
                'sourcePng': base64.b64encode(cutout.png).decode('ascii'),
                'sourceWidth': cutout.width,
                'sourceHeight': cutout.height,
                'parserLabels': list(cutout.labels),
                'sourcePixels': cutout.pixel_count,
                'preservedOcclusionPixels': cutout.preserved_occlusion_pixels,
                'repairedOcclusionPixels': cutout.repaired_occlusion_pixels,
                'trimmedFootwearPixels': cutout.trimmed_footwear_pixels,
            }
            if request.get('category'):
                try:
                    rendered = await asyncio.to_thread(
                        render_request, cutout.png, request['category'], request['manifest'],
                        request['quality'], request['seed']
                    )
                    result.update(
                        generatedPng=base64.b64encode(rendered.body).decode('ascii'),
                        category=request['category'], seed=request['seed']
                    )
                except Exception as exc:
                    request_log('outfit_item_generation_failed', index=cutout.index, error_type=type(exc).__name__)
                    result['generationError'] = str(exc.detail) if isinstance(exc, HTTPException) else '3D generation failed for this item'
            results.append(result)
        payload = {'items': results, 'skipped': skipped, 'wornEvidence': evidence,
                   'parserVersion': PARSER_VERSION, 'contractVersion': CONTRACT_VERSION}
        encoded = json.dumps(payload, separators=(',', ':')).encode()
        if len(encoded) > MAX_OUTFIT_RESPONSE:
            raise HTTPException(413, 'Prepared outfit response exceeds 32 MB')
        request_log('outfit_finished', parsed=len(results), skipped=len(skipped), worn_evidence=evidence)
        return Response(encoded, media_type='application/json', headers={
            'X-Outfit-Pipeline-Version': PARSER_VERSION,
            'X-Ghost-Contract-Version': str(CONTRACT_VERSION),
        })
    finally:
        await image.close()
