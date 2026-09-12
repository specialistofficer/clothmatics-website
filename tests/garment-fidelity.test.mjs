import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVisualProfile,samplePatchHex,hasCompleteAppearance} from '../garment-appearance.mjs';
import {ghostCategory,compileUniversalManifest,buildGhostAnalysisFromItem,parseGhostQuality,ghostDeletePatch,hasReusableGhostMetadata} from '../ghost-contract.mjs';
import {onRequestPost} from '../functions/api/wardrobe/ghost.js';

const encoded=value=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
const png=new Uint8Array(600);png.set([137,80,78,71,13,10,26,10]);
const tech={collarOrWaistband:'Elastic waistband',garmentLengthAndHem:'Straight open ankle hems',closuresAndHardware:'Off-white drawcord',pocketsAndDetails:'Two slant hip pockets'};
const complete={category:'Bottom',subCategory:'Joggers',colorDetail:'Dark blue teal',fabricTexture:'Matte woven slub',technical3DDetails:tech,visualProfile:{version:2,sourceFingerprint:'a'.repeat(64),colors:[{role:'base',hex:'#16464C',name:'Dark teal'}]}};
test('specific categories survive broad roles and unfamiliar types do not silently become shirts',()=>{
  for(const [subCategory,category] of [['Shorts','shorts'],['Joggers','trackpants'],['Jeans','trousers'],['Cargo pants','cargo']])assert.equal(ghostCategory({category:'Bottom',subCategory}),category);
  assert.equal(ghostCategory({category:'Top',subCategory:'Crewneck sweatshirt'}),'tshirt');
  assert.equal(ghostCategory({category:'Outerwear',subCategory:'Hoodie'}),'hoodie');
  for(const category of ['Bag','Unknown','Bottom'])assert.equal(ghostCategory({category}),null);
  assert.throws(()=>compileUniversalManifest({category:'unknown'}),/supported/);
  assert.throws(()=>compileUniversalManifest({category:null}),/supported/);
});
test('straight hem and actual fabric survive; stale pink title and generic material cannot override pixels',()=>{
  const result=buildGhostAnalysisFromItem({...complete,title:'Light Pink Shirt',aiDescription:'Bright pink shiny cotton',material:'Cotton',technical3DDetails:{...tech,fabricWeave:'Coarse slub'}});
  assert.equal(result.category,'trackpants');
  assert.equal(result.manifest.palette[0].hex,'#16464C');assert.match(result.prompt,/Dark blue teal/);
  assert.match(result.prompt,/Matte woven slub/);assert.match(result.prompt,/Straight open ankle hems/);
  assert.doesNotMatch(result.prompt,/Light Pink|Bright pink|curved shirt-tail|supported shoulders|filled chest/);
  assert.ok(result.prompt.indexOf('no visible mannequin')<300);
  assert.ok(result.prompt.includes('colorAndFinish'));
  assert.equal(result.contractVersion,2);
});
test('no default hem, pocket, material, fit or sleeves are fabricated',()=>{
  const result=compileUniversalManifest({category:'shirt'});
  assert.equal(result.manifest.garmentLengthAndHem,'');assert.equal(result.manifest.externalCompartments,'');
  assert.equal(result.manifest.fit,'');assert.equal(result.manifest.sleeveType,'');
  assert.doesNotMatch(result.prompt,/shirt-tail|tapered|cotton|below waist/);
});
test('legacy and mismatched-source evidence requires a fresh photo analysis',()=>{
  assert.equal(hasCompleteAppearance(complete),true);assert.equal(hasReusableGhostMetadata(complete),true);
  assert.equal(hasReusableGhostMetadata({...complete,image:'changed'}),false);
  assert.equal(hasReusableGhostMetadata({...complete,image:'same',visualProfile:{...complete.visualProfile,sourceImage:'same'}}),true);
  for(const profile of [{},{...complete.visualProfile,version:0},{...complete.visualProfile,colors:[]}])assert.equal(hasCompleteAppearance({...complete,visualProfile:profile}),false);
});
test('color point validation rejects bad coordinates and never trusts model-provided hex',()=>{
  const valid={role:'base',name:'teal',point:[500,500],confidence:'high',hex:'#FFFFFF'};
  const result=normalizeVisualProfile({colors:[valid,{...valid,point:['500',500]},{...valid,point:[-1,500]},{...valid,confidence:'low'},{...valid,role:'hanger'}]});
  assert.equal(result.colors.length,1);assert.equal(result.colors[0].hex,undefined);
});
test('median RGB comes from fabric pixels and ignores transparency plus isolated highlights',()=>{
  const pixels=new Uint8ClampedArray(5*5*4);for(let i=0;i<pixels.length;i+=4)pixels.set([22,70,76,255],i);
  pixels.set([255,255,255,255],0);pixels.set([255,0,0,0],4);
  assert.equal(samplePatchHex(pixels,5,5,[500,500]),'#16464C');
  for(let i=3;i<pixels.length;i+=4)pixels[i]=0;
  assert.equal(samplePatchHex(pixels,5,5,[500,500]),'');
});
test('validated sample coordinates survive repeated metadata normalization before photo sampling',()=>{
  const profile=normalizeVisualProfile({colors:[{role:'base',name:'teal',point:[200,400],confidence:'high',hex:'#FFFFFF'}]});
  assert.deepEqual(normalizeVisualProfile(profile),profile);
  assert.equal(profile.colors.length,1);
  assert.equal(profile.colors[0].hex,undefined);
});
const verdict={sameGarment:true,colorMatch:true,textureMatch:true,constructionMatch:true,graphicsMatch:true,emptyOpenings:true,confidence:.95,issues:[]};
test('quality acceptance requires every comparison to pass without uncertainty',()=>{
  assert.equal(parseGhostQuality(encoded(verdict)).passed,true);
  for(const key of ['sameGarment','colorMatch','textureMatch','constructionMatch','graphicsMatch','emptyOpenings']){
    assert.equal(parseGhostQuality(encoded({...verdict,[key]:false})).passed,false,key);
    assert.equal(parseGhostQuality(encoded({...verdict,[key]:'true'})).passed,false,key);
  }
  for(const patch of [{confidence:.6},{confidence:'0.99'},{confidence:2},{issues:['Unclear logo']},{issues:null}])assert.equal(parseGhostQuality(encoded({...verdict,...patch})).passed,false);
  assert.equal(parseGhostQuality(encoded({})).passed,false);
});
test('delete patch touches only the expected owned 3D record',()=>{
  const item={userId:'u',image:'original',ghostMannequin:{image:'old'}};
  assert.deepEqual(ghostDeletePatch(item,'u','old','delete-sentinel'),{ghostMannequin:'delete-sentinel'});
  for(const [user,image] of [['foreign','old'],['u','stale']])assert.throws(()=>ghostDeletePatch(item,user,image,'delete'));
  assert.equal(item.image,'original');assert.equal(item.ghostMannequin.image,'old');
});

function request(manifest=buildGhostAnalysisFromItem(complete).manifest){
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'source.png');form.append('category','trackpants');form.append('prompt','Deliberately discarded caller text');form.append('manifest',JSON.stringify(manifest));form.append('contractVersion','2');
  return new Request('https://site/api/wardrobe/ghost',{method:'POST',headers:{Authorization:'Bearer PRIVATE-IDENTITY'},body:form});
}
async function mockedFetch(fn,run){const old=globalThis.fetch;globalThis.fetch=fn;try{return await run();}finally{globalThis.fetch=old;}}
test('v2 proxy compiles bounded evidence and keeps a seed across busy retries without identity leakage',async()=>{
  const requests=[];
  await mockedFetch(async(url,options)=>{
    if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'u'}]});
    requests.push(options);if(requests.length===1)return new Response('',{status:429});
    return new Response(png,{headers:{'Content-Type':'image/png','X-Ghost-Contract-Version':'2','X-Ghost-Palette-Version':'1'}});
  },async()=>{
    const result=await onRequestPost({request:request(),env:{GHOST_RETRY_DELAY_MS:'0'}});
    assert.equal(result.status,200);assert.equal(requests.length,2);
    assert.equal(requests[0].body.get('seed'),requests[1].body.get('seed'));
    assert.equal(requests[1].body.get('contract_version'),'2');
    assert.equal(JSON.parse(requests[1].body.get('manifest')).category,'trackpants');
    assert.doesNotMatch(requests[1].body.get('prompt'),/discarded caller/);
    assert.equal(requests[1].headers,undefined);
  });
});
test('v2 refuses the old Kaggle prompt stripper and invalid manifests',async()=>{
  let gpu=0;
  await mockedFetch(async url=>{
    if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'u'}]});gpu++;return new Response(png,{headers:{'Content-Type':'image/png'}});
  },async()=>{
    const old=await onRequestPost({request:request(),env:{}});assert.equal(old.status,503);assert.equal((await old.json()).error.code,'backend_upgrade_required');
    for(const manifest of [null,{category:'shirt'},{category:'trackpants',colorAndFinish:'',surfaceTextureAndWeave:'matte'}])assert.equal((await onRequestPost({request:request(manifest),env:{}})).status,400);
    assert.equal(gpu,1);
  });
});
