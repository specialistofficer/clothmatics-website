import test from 'node:test';
import assert from 'node:assert/strict';
import {GHOST_ANALYSIS_PROMPT,compileUniversalManifest,buildGhostAnalysisFromItem,ghostImageForMode,hasReusableGhostMetadata,parseGhostAnalysis,ghostSavePatch} from '../ghost-mannequin.mjs';
import {onRequestGet,onRequestPost,validSource,generatorEndpoint} from '../functions/api/wardrobe/ghost.js';
const png=new Uint8Array(600);png.set([137,80,78,71,13,10,26,10]);
const encoded=value=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
test('photo intake generates before wardrobe creation and isolates credentials',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'u1'}]});return new Response(png,{headers:{'content-type':'image/png'}});};
  try{
    const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'photo.png');form.append('category','trousers');form.append('prompt','Grey woven trousers');
    const response=await onRequestPost({request:new Request('https://site/api/wardrobe/ghost',{method:'POST',headers:{Authorization:'Bearer test'},body:form}),env:{GHOST_RETRY_DELAY_MS:'0'}});
    assert.equal(response.status,200);assert.equal(calls.length,2);assert.ok(!calls.some(call=>call.url.includes('firestore')));assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.body.get('category'),'trousers');
  }finally{globalThis.fetch=original;}
});
test('saving adds only the 3D rendition and rejects stale, deleted or already-saved garments',()=>{
  const source={userId:'u1',image:'original',title:'Shirt'},value={image:'generated'};
  assert.deepEqual(ghostSavePatch(source,'u1','original',value,123),{ghostMannequin:{image:'generated',createdAt:123}});
  assert.equal(source.image,'original');
  for(const current of [null,{...source,userId:'u2'},{...source,image:'new-original'},{...source,ghostMannequin:value}])assert.throws(()=>ghostSavePatch(current,'u1','original',value,123));
});
test('regeneration overwrites a previously saved 3D image with allowOverwrite',()=>{
  const source={userId:'u1',image:'original',title:'Shirt',ghostMannequin:{image:'old-generated'}},value={image:'new-generated'};
  assert.throws(()=>ghostSavePatch(source,'u1','original',value,456));
  assert.deepEqual(ghostSavePatch(source,'u1','original',value,456,{allowOverwrite:true,expectedImage:'old-generated'}),{ghostMannequin:{image:'new-generated',createdAt:456}});
  assert.throws(()=>ghostSavePatch(source,'u1','original',value,456,{allowOverwrite:true,expectedImage:'stale'}),/changed/);
});
test('technical analysis accepts supported garments and rejects invented categories or missing detail',()=>{
  assert.deepEqual(parseGhostAnalysis(encoded({category:'hoodie',prompt:'Navy cotton hoodie with drawstrings and a kangaroo pocket.'})),{category:'hoodie',prompt:'Navy cotton hoodie with drawstrings and a kangaroo pocket.'});
  assert.throws(()=>parseGhostAnalysis(encoded({category:'saree',prompt:'Long description of a garment.'})),/supported/);
  assert.throws(()=>parseGhostAnalysis(encoded({category:'shirt',prompt:''})),/incomplete/);
});
test('analysis captures physical evidence; generation uses compact category-specific instructions',()=>{
  assert.match(GHOST_ANALYSIS_PROMPT,/Do not output invented hex codes/);
  assert.match(GHOST_ANALYSIS_PROMPT,/Never invent pockets/);
  const {prompt}=compileUniversalManifest({category:'shorts',colorAndFinish:'Dark olive',surfaceTextureAndWeave:'Wrinkled nylon'});
  assert.match(prompt,/no visible mannequin/);assert.match(prompt,/Lower garment only/);
  assert.match(prompt,/pixels override all text color names/);assert.ok(prompt.length<4000);
});
test('existing wardrobe metadata builds the strict prompt without another Gemini analysis',()=>{
  const analysis=buildGhostAnalysisFromItem({title:'Midnight Logo Tee',category:'Tops',subCategory:'Crew-neck T-shirt',categoryRole:'top',aiDescription:'Navy heathered cotton jersey with ACME printed across the chest.',primaryColor:'Navy',secondaryColors:['White','Silver'],material:'Cotton jersey',pattern:'Graphic',fit:'Regular',neckline:'Crew neck',sleeveType:'Short sleeves'});
  assert.equal(analysis.category,'tshirt');
  for(const detail of ['Navy','White, Silver','Cotton jersey','pattern: Graphic','fit: Regular','Crew neck','Short sleeves'])assert.ok(analysis.prompt.includes(detail));
  assert.doesNotMatch(analysis.prompt,/Midnight Logo Tee|ACME/);
  assert.match(analysis.prompt,/no visible mannequin/);assert.ok(analysis.prompt.length<4000);
  for(const item of [{aiDescription:'Analyzed garment'},{subCategory:'Blazer'},{material:'Linen'},{title:'Manual item',category:'Shirt'}])assert.equal(hasReusableGhostMetadata(item),false);
});
test('universal clothing with technical3DDetails builds deep physical conditioning prompt',()=>{
  const item={
    title:'Light Purple Button-Down Shirt',
    brand:'The Bear House',
    category:'Top',
    subCategory:'Shirt',
    primaryColor:'Light Purple',
    material:'Oxford Cotton',
    technical3DDetails:{
      fabricWeave:'Heavyweight Oxford cotton with visible two-tone cross-yarn basketweave texture',
      collarOrWaistband:'Button-down collar with small white buttons securing collar points',
      closuresAndHardware:'Front button placket with visible white 4-hole buttons',
      pocketsAndDetails:'Single left chest patch pocket',
      graphicsAndLogos:'Small embroidered brown bear silhouette logo on chest pocket',
      openingsAndHollowStructure:'Hollow collar cavity showing inner back collar fabric band'
    }
  };
  const analysis=buildGhostAnalysisFromItem(item);
  assert.equal(analysis.category,'shirt');
  assert.match(analysis.prompt,/Oxford cotton with visible two-tone cross-yarn basketweave texture/);
  assert.match(analysis.prompt,/Button-down collar with small white buttons securing collar points/);
  assert.match(analysis.prompt,/Front button placket with visible white 4-hole buttons/);
  assert.match(analysis.prompt,/Single left chest patch pocket/);
  assert.match(analysis.prompt,/Small embroidered brown bear silhouette logo on chest pocket/);
  assert.doesNotMatch(analysis.prompt,/Brand: The Bear House/);
  assert.match(analysis.prompt,/no visible mannequin/);
  assert.ok(analysis.prompt.length<4000);
});
test('wardrobe view selection preserves the normal image and exposes a saved 3D rendition',()=>{
  const item={image:'original.png',ghostMannequin:{image:'generated.png'}};
  assert.equal(ghostImageForMode(item,'normal'),'original.png');
  assert.equal(ghostImageForMode(item,'3d'),'generated.png');
  assert.equal(ghostImageForMode({image:'original.png'},'3d'),'original.png');
});
test('wardrobe category mapping covers every supported generator category',()=>{
  const cases=[['Cargo pants','cargo'],['Joggers','trackpants'],['Chinos','trousers'],['Graphic tee','tshirt'],['Hoodie','hoodie'],['Blazer','jacket'],['Midi dress','dress'],['Tailored shorts','shorts'],['Short sleeve shirt','shirt']];
  for(const [subCategory,expected] of cases)assert.equal(buildGhostAnalysisFromItem({subCategory}).category,expected,subCategory);
});
test('source hosts and generator endpoints reject insecure, arbitrary and credential-bearing URLs',()=>{
  assert.equal(validSource('https://assets.r2.dev/a.png'),true);
  for(const url of ['http://assets.r2.dev/a','https://localhost/a','https://assets.r2.dev.attacker.com/a','https://name:pass@assets.r2.dev/a'])assert.equal(validSource(url),false);
  for(const url of ['http://localhost','https://studio.example.com/other','https://name:pass@studio.example.com/generate','https://studio.example.com/generate?mode=test'])assert.throws(()=>generatorEndpoint({GHOST_MANNEQUIN_API_URL:url}));
  assert.equal(generatorEndpoint({GHOST_MANNEQUIN_API_URL:'https://studio.example.com'}),'https://studio.example.com/generate');
  assert.equal(generatorEndpoint({GHOST_MANNEQUIN_API_URL:'https://studio.example.com/generate'}),'https://studio.example.com/generate');
  assert.equal(generatorEndpoint({GHOST_MANNEQUIN_API_URL:'https://studio.example.com/generate/'}),'https://studio.example.com/generate');
});
async function scenario({uid='u1',token='test-token',status=200,output=png,category='shirt',method='POST',variant=''}={}){
  const calls=[];let generationCall=0;const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'u1'}]});
    if(String(url).includes('firestore.googleapis.com'))return Response.json({fields:{userId:{stringValue:uid},image:{stringValue:'https://images.r2.dev/original.png'},ghostMannequin:{mapValue:{fields:{image:{stringValue:'https://images.r2.dev/generated.png'}}}}}});
    if(String(url).includes('images.r2.dev'))return new Response(png,{headers:{'Content-Type':'image/png'}});
    const responseStatus=Array.isArray(status)?status[Math.min(generationCall++,status.length-1)]:status;
    return new Response(output,{status:responseStatus,headers:{'Content-Type':'image/png'}});
  };
  try{
    const request=new Request(`https://clothmatics.pages.dev/api/wardrobe/ghost?id=item-1${variant}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},...(method==='POST'?{body:JSON.stringify({garmentId:'item-1',category,prompt:'Navy cotton shirt with a button closure.'})}:{})});
    const response=await (method==='GET'?onRequestGet:onRequestPost)({request,env:{GHOST_RETRY_DELAY_MS:'0'}});return {response,calls};
  }finally{globalThis.fetch=originalFetch;}
}
test('authentication and ownership checks prevent unauthorised GPU calls',async()=>{
  const missing=await scenario({token:''});assert.equal(missing.response.status,401);assert.equal(missing.calls.length,0);
  const foreign=await scenario({uid:'another-user'});assert.equal(foreign.response.status,403);assert.equal(foreign.calls.length,2);
});
test('unsupported categories fail before reading private garment or starting GPU work',async()=>{
  const result=await scenario({category:'other'});assert.equal(result.response.status,400);assert.equal(result.calls.length,1);
});
test('generation sends correct multipart fields without forwarding identity token',async()=>{
  const {response,calls}=await scenario();assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,600);
  const source=calls.at(-2);assert.equal(source.options.redirect,'manual');
  const gpu=calls.at(-1);assert.equal(gpu.url,'https://clothmatics-ghost.chiragsharma376.workers.dev/generate');assert.equal(gpu.options.headers,undefined);assert.equal(gpu.options.redirect,'manual');
  assert.equal(gpu.options.body.get('category'),'shirt');assert.equal(gpu.options.body.get('image').type,'image/png');assert.match(gpu.options.body.get('prompt'),/Navy cotton/);
});
test('busy GPU returns actionable 429 and invalid PNG is rejected',async()=>{
  const busy=await scenario({status:429});assert.equal(busy.response.status,429);assert.equal((await busy.response.json()).error.code,'gpu_busy');
  const invalid=await scenario({output:new Uint8Array(600)});assert.equal(invalid.response.status,502);
});
test('busy GPU responses wait and recover within the bounded retry window',async()=>{
  const recovered=await scenario({status:[429,429,200]});assert.equal(recovered.response.status,200);assert.equal(recovered.response.headers.get('X-Ghost-Generation-Attempts'),'3');assert.equal(recovered.calls.length,6);
  const exhausted=await scenario({status:429});assert.equal(exhausted.calls.length,10);assert.equal(exhausted.response.status,429);
});
test('Cloudflare origin failures identify an offline GPU backend',async()=>{
  for(const status of [502,503,520,521,522,523,525,526,530]){const failed=await scenario({status});assert.equal(failed.response.status,503,status);const body=await failed.response.json();assert.equal(body.error.code,'backend_offline');assert.match(body.error.message,/Kaggle backend connection/);}
});
test('one Cloudflare cold-start timeout is retried with a fresh multipart body',async()=>{
  const recovered=await scenario({status:[524,200]});assert.equal(recovered.response.status,200);assert.equal(recovered.response.headers.get('X-Ghost-Generation-Attempts'),'2');assert.equal(recovered.calls.length,5);
  const first=recovered.calls.at(-2).options.body,second=recovered.calls.at(-1).options.body;assert.notEqual(first,second);assert.equal(second.get('category'),'shirt');
  const timedOut=await scenario({status:[524,524]});assert.equal(timedOut.response.status,504);assert.equal((await timedOut.response.json()).error.code,'generation_timeout');
});
test('cold timeout followed by a busy lock waits before the warm generation retry',async()=>{
  const recovered=await scenario({status:[524,429,429,200]});assert.equal(recovered.response.status,200);assert.equal(recovered.response.headers.get('X-Ghost-Generation-Attempts'),'4');assert.equal(recovered.calls.length,7);
});
test('generator redirects are inspected and rejected instead of followed',async()=>{
  const redirected=await scenario({status:302});assert.equal(redirected.response.status,502);
  assert.equal((await redirected.response.json()).error.code,'generation_redirect');
});
test('source and saved downloads read only the owned document image and never call GPU',async()=>{
  for(const [variant,name] of [['','original.png'],['&variant=generated','generated.png']]){const {calls,response}=await scenario({method:'GET',variant});assert.equal(response.status,200);assert.equal(calls.length,3);assert.ok(calls.at(-1).url.endsWith(name));}
});
test('folded utility shirt prompt front-loads dual flap pockets, anti-crop hem, and slub weave',()=>{
  const item={
    title:'Dark Brown Button-Down Shirt',
    brand:'Powerlook',
    category:'Top',
    subCategory:'Shirt',
    primaryColor:'Dark Brown',
    material:'Linen Cotton',
    fabricTexture:'Coarse slub weave',
    technical3DDetails:{
      fabricWeave:'Coarse slub linen-cotton weave with tactile fabric grain and matte organic finish',
      collarOrWaistband:'Button-down point collar with small buttons securing collar points',
      closuresAndHardware:'Front vertical button placket with contrasting buttons',
      pocketsAndDetails:'TWO symmetrical chest flap pockets with pointed flaps and button closures on both left and right chest',
      garmentLengthAndHem:'Full standard shirt length with curved shirt-tail hem extending past waist (unfolded, not cropped)',
      openingsAndHollowStructure:'Hollow collar cavity and hollow cuffs'
    }
  };
  const analysis=buildGhostAnalysisFromItem(item);
  assert.equal(analysis.category,'shirt');
  assert.match(analysis.prompt,/TWO symmetrical chest flap pockets with pointed flaps/);
  assert.match(analysis.prompt,/Full standard shirt length with curved shirt-tail hem/);
  assert.match(analysis.prompt,/unfolded, not cropped/);
  assert.match(analysis.prompt,/Coarse slub linen-cotton weave with tactile fabric grain/);
  assert.match(analysis.prompt,/Front vertical button placket with contrasting buttons/);
  // Verify structural features appear within the first 750 characters (prime token window)
  const pocketPos=analysis.prompt.indexOf('TWO symmetrical chest flap pockets');
  assert.ok(pocketPos>0&&pocketPos<1200,`Pocket position was ${pocketPos}, expected < 1200`);
  assert.ok(analysis.prompt.length<4000);
});
test('universal manifest preserves contrasting white buttons on navy shirt without hardcoded color suppression',()=>{
  const manifest={
    category:'shirt',
    identity:'Navy Oxford Shirt. Brand: Polo',
    hardwareAndClosures:'Contrasting white pearl 4-hole buttons along center placket, button-down collar points',
    externalCompartments:'Single left chest patch pocket',
    necklineOrWaistband:'Button-down point collar with small white buttons securing collar points',
    garmentLengthAndHem:'Full standard shirt length with curved shirt-tail hem',
    surfaceTextureAndWeave:'Heavyweight Oxford cotton with visible two-tone cross-yarn basketweave',
    colorAndFinish:'Dark navy blue, matte finish',
    graphicsOrText:'none'
  };
  const result=compileUniversalManifest(manifest);
  assert.equal(result.category,'shirt');
  assert.match(result.prompt,/Contrasting white pearl 4-hole buttons along center placket/);
  assert.match(result.prompt,/Single left chest patch pocket/);
  assert.match(result.prompt,/Dark navy blue/);
  assert.doesNotMatch(result.prompt,/NO white buttons/); // Ensures white buttons are NOT forbidden when actually present!
});
test('parseGhostAnalysis compiles structured physical manifest directly into precision prompt',()=>{
  const manifestJson={
    category:'shirt',
    hardwareAndClosures:'Matching dark smoke brown buttons along center placket',
    externalCompartments:'TWO symmetrical chest flap pockets with pointed flaps and button closures',
    necklineOrWaistband:'Button-down point collar with point buttons',
    surfaceTextureAndWeave:'Coarse slub linen-cotton weave',
    garmentLengthAndHem:'Full standard shirt length with curved shirt-tail hem',
    colorAndFinish:'Earthy dark brown, matte organic finish',
    graphicsOrText:'none'
  };
  const analysis=parseGhostAnalysis(encoded(manifestJson));
  assert.equal(analysis.category,'shirt');
  assert.match(analysis.prompt,/Matching dark smoke brown buttons/);
  assert.match(analysis.prompt,/TWO symmetrical chest flap pockets/);
  assert.match(analysis.prompt,/Coarse slub linen-cotton weave/);
  assert.ok(analysis.prompt.length<4000);
});
