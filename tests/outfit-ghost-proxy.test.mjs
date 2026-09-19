import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,outfitGeneratorEndpoint} from '../functions/api/wardrobe/outfit-ghost.js';
import {buildGhostAnalysisFromItem} from '../ghost-contract.mjs';

const png=new Uint8Array(700);png.set([137,80,78,71,13,10,26,10]);
const metadata={category:'Bottom',subCategory:'Shorts',colorDetail:'Dark green',fabricTexture:'Matte woven synthetic',technical3DDetails:{collarOrWaistband:'Elastic waistband',garmentLengthAndHem:'Above-knee straight hems'},visualProfile:{version:2,sourceFingerprint:'a'.repeat(64),colors:[{role:'base',hex:'#224130',name:'Dark green'}]}};
const analysis=buildGhostAnalysisFromItem(metadata);
function request(){
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'outfit.png');
  form.append('items',JSON.stringify([{index:0,boundingBox:[400,200,800,800],parserClass:'shorts',category:analysis.category,manifest:analysis.manifest},{index:1,boundingBox:[780,100,990,900],parserClass:'footwear',category:null}]));
  return new Request('https://site/api/wardrobe/outfit-ghost',{method:'POST',headers:{Authorization:'Bearer PRIVATE-IDENTITY'},body:form});
}
async function mockedFetch(fn,run){const old=globalThis.fetch;globalThis.fetch=fn;try{return await run();}finally{globalThis.fetch=old;}}
test('outfit proxy sends one full photo, compiled manifests, and no Firebase identity to Kaggle',async()=>{
  let forwarded;
  await mockedFetch(async(url,options)=>{
    if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'u'}]});
    forwarded={url:String(url),options};
    return Response.json({items:[],skipped:[],parserVersion:'3'},{headers:{'X-Outfit-Pipeline-Version':'3','X-Ghost-Contract-Version':'2'}});
  },async()=>{
    const response=await onRequestPost({request:request(),env:{}});assert.equal(response.status,200);
    assert.equal(forwarded.url,'https://clothmatics-ghost.chiragsharma376.workers.dev/outfit');
    assert.equal(forwarded.options.headers,undefined);
    assert.equal(forwarded.options.body.getAll('image').length,1);
    assert.equal(response.headers.get('X-Outfit-Pipeline-Version'),'3');
    const items=JSON.parse(forwarded.options.body.get('items'));assert.equal(items.length,2);
    assert.equal(items[0].category,'shorts');assert.equal(items[0].manifest.palette[0].hex,'#224130');assert.equal(items[1].category,undefined);
  });
});
test('outfit proxy requires the new Kaggle contract and validates endpoint paths',async()=>{
  await mockedFetch(async(url)=>String(url).includes('accounts:lookup')?Response.json({users:[{localId:'u'}]}):new Response('missing',{status:404}),async()=>{
    const response=await onRequestPost({request:request(),env:{}});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'backend_upgrade_required');
  });
  assert.equal(outfitGeneratorEndpoint({GHOST_MANNEQUIN_API_URL:'https://example.com/generate'}),'https://example.com/outfit');
  assert.throws(()=>outfitGeneratorEndpoint({GHOST_MANNEQUIN_API_URL:'https://example.com/unsafe'}));
});
