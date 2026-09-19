import test from 'node:test';
import assert from 'node:assert/strict';
import {fullLookGeneratorEndpoint,onRequestPost} from '../functions/api/wardrobe/full-look.js';
import {lookbookSlotFor} from '../web-core.mjs';

const png=new Uint8Array(900);png.set([137,80,78,71,13,10,26,10]);
const field=value=>({stringValue:value});
const wardrobeRows=[
  {document:{name:'projects/p/databases/(default)/documents/wardrobe/top-1',fields:{userId:field('u'),title:field('Navy polo'),category:field('Top'),subCategory:field('Polo Shirt'),image:field('https://closet.r2.dev/top.png'),primaryColor:field('Navy')}}},
  {document:{name:'projects/p/databases/(default)/documents/wardrobe/bottom-1',fields:{userId:field('u'),title:field('Grey trousers'),category:field('Bottom'),subCategory:field('Trousers'),image:field('https://closet.r2.dev/bottom.png'),primaryColor:field('Grey')}}},
  {document:{name:'projects/p/databases/(default)/documents/wardrobe/shoes-1',fields:{userId:field('u'),title:field('Red sneakers'),category:field('Footwear'),subCategory:field('Sneakers'),image:field('https://closet.r2.dev/shoes.png'),primaryColor:field('Red')}}},
];

const request=()=>new Request('https://site/api/wardrobe/full-look',{method:'POST',headers:{Authorization:'Bearer PRIVATE-IDENTITY','Content-Type':'application/json'},body:JSON.stringify({wardrobeItemIds:['top-1','bottom-1','shoes-1'],presentation:'masculine'})});
async function mockedFetch(fn,run){const previous=globalThis.fetch;globalThis.fetch=fn;try{return await run();}finally{globalThis.fetch=previous;}}

test('full-look proxy resolves owned wardrobe images and forwards multi-reference evidence without identity',async()=>{
  let forwarded,firestoreQuery;
  await mockedFetch(async(url,options={})=>{
    const target=String(url);
    if(target.includes('accounts:lookup'))return Response.json({users:[{localId:'u'}]});
    if(target.includes('documents:runQuery')){firestoreQuery=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer PRIVATE-IDENTITY');return Response.json(wardrobeRows);}
    if(target.endsWith('.png'))return new Response(png,{headers:{'Content-Type':'image/png'}});
    forwarded={target,options};return new Response(png,{headers:{'Content-Type':'image/png','X-Full-Look-Pipeline-Version':'1','X-Request-Id':'req-1'}});
  },async()=>{
    const response=await onRequestPost({request:request(),env:{}});assert.equal(response.status,200);assert.equal(response.headers.get('X-Full-Look-Pipeline-Version'),'1');
    assert.equal(firestoreQuery.structuredQuery.where.fieldFilter.field.fieldPath,'userId');assert.equal(firestoreQuery.structuredQuery.where.fieldFilter.value.stringValue,'u');
    assert.equal(forwarded.target,'https://clothmatics-ghost.chiragsharma376.workers.dev/full-look');assert.equal(forwarded.options.headers,undefined);
    assert.equal(forwarded.options.body.getAll('reference').length,3);assert.equal(forwarded.options.body.get('presentation'),'masculine');
    const items=JSON.parse(forwarded.options.body.get('items'));assert.deepEqual(items.map(item=>item.slot),['top','bottom','footwear']);assert.equal(items[0].title,'Navy polo');
  });
});

test('full-look proxy rejects foreign IDs and unsafe generator paths',async()=>{
  await mockedFetch(async(url)=>String(url).includes('accounts:lookup')?Response.json({users:[{localId:'u'}]}):Response.json(wardrobeRows.slice(0,2)),async()=>{
    const response=await onRequestPost({request:request(),env:{}});assert.equal(response.status,400);assert.match((await response.json()).error.message,/unavailable/i);
  });
  assert.equal(fullLookGeneratorEndpoint({GHOST_MANNEQUIN_API_URL:'https://example.com/outfit'}),'https://example.com/full-look');
  assert.throws(()=>fullLookGeneratorEndpoint({GHOST_MANNEQUIN_API_URL:'https://example.com/unsafe'}));
});

test('traditional sets occupy the hero slot before generic kurta matching',()=>{
  assert.equal(lookbookSlotFor({category:'Traditional set',subCategory:'Kurta set',title:'Festive kurta set'}),'hero');
  assert.equal(lookbookSlotFor({category:'Top',subCategory:'Kurta',title:'Cotton kurta'}),'top');
});

test('fullLookPresentation normalizes profile gender to mannequin presentation string', async () => {
  const { fullLookPresentation, fullLookImageUrl } = await import('../full-look.mjs');
  assert.equal(fullLookPresentation({ gender: 'male' }), 'masculine');
  assert.equal(fullLookPresentation({ gender: 'female' }), 'feminine');
  assert.equal(fullLookPresentation({ shoppingProfile: { gender: 'female' } }), 'feminine');
  assert.equal(fullLookPresentation({}), 'neutral');

  assert.equal(fullLookImageUrl('blob:https://clothmatics.pages.dev/preview-1'), 'blob:https://clothmatics.pages.dev/preview-1');
  assert.equal(fullLookImageUrl({ url: 'blob:https://clothmatics.pages.dev/preview-2' }), 'blob:https://clothmatics.pages.dev/preview-2');
  assert.equal(fullLookImageUrl({ image: 'https://cdn.example.com/look.png' }), 'https://cdn.example.com/look.png');
  assert.equal(fullLookImageUrl(null), '');
});

