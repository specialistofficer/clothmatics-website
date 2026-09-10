import {bearer,json,verifyFirebaseToken} from '../../_shared/firebase-rest.mjs';
import {compileUniversalManifest} from '../../../ghost-contract.mjs';
export const GHOST_CATEGORIES=new Set(['shirt','tshirt','trackpants','trousers','cargo','hoodie','jacket','dress','shorts']);
const DEFAULT_ENDPOINT='https://clothmatics-ghost.chiragsharma376.workers.dev/generate';
const PNG=[137,80,78,71,13,10,26,10];
const isRedirect=response=>response.status>=300&&response.status<400;
const retryDelayMs=(response,env)=>{
  const configured=Number(env.GHOST_RETRY_DELAY_MS);
  if(Number.isFinite(configured)&&configured>=0)return Math.min(configured,30000);
  const seconds=Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds)&&seconds>0?Math.min(20000,Math.max(5000,seconds*1000)):15000;
};
const waitForRetry=(milliseconds,signal)=>milliseconds<=0?Promise.resolve():new Promise((resolve,reject)=>{
  const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(finish,milliseconds);
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);const error=Error('Request aborted');error.name='AbortError';reject(error);};
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
});
export function generatorEndpoint(env){
  const url=new URL(env.GHOST_MANNEQUIN_API_URL||DEFAULT_ENDPOINT);
  const path=url.pathname.replace(/\/+$/,'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(path&&path!=='/generate'))throw Error('Invalid generator endpoint');
  return `${url.origin}/generate`;
}
export function validSource(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname.endsWith('.r2.dev')||u.hostname==='firebasestorage.googleapis.com'||u.hostname==='storage.googleapis.com');}catch{return false;}
}
async function boundedBytes(response,max){
  if(Number(response.headers.get('content-length'))>max)throw Error('Image exceeds the supported size.');
  const reader=response.body?.getReader();if(!reader)throw Error('Empty image response.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Image exceeds the supported size.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
async function handle({request,env}){
  const token=bearer(request.headers.get('Authorization')||'');
  if(!token)return json({error:{message:'Sign in to create a 3D image.'}},401);
  const identity=await verifyFirebaseToken(token,env.FIREBASE_WEB_API_KEY);
  if(!identity?.localId)return json({error:{message:'Your session expired. Please sign in again.'}},401);
  const intake=request.method==='POST'&&(request.headers.get('content-type')||'').startsWith('multipart/form-data');
  if(intake&&Number(request.headers.get('content-length'))>9*1024*1024)return json({error:{message:'Photo is too large.'}},413);
  const form=intake?await request.formData():null;
  const uploaded=form?.get('image');
  if(intake&&(!uploaded||typeof uploaded.arrayBuffer!=='function'||uploaded.size<500||uploaded.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(uploaded.type)))return json({error:{message:'A valid garment photo is required.'}},400);
  const body=intake?{category:form.get('category'),prompt:form.get('prompt'),manifest:form.get('manifest'),contractVersion:Number(form.get('contractVersion'))}:request.method==='POST'?await request.json().catch(()=>null):null;
  const id=request.method==='GET'?new URL(request.url).searchParams.get('id'):body?.garmentId;
  if(!intake&&(typeof id!=='string'||!id||id.length>200||id.includes('/')))return json({error:{message:'Choose a saved garment.'}},400);
  if(request.method==='POST'&&(!GHOST_CATEGORIES.has(body?.category)||typeof body?.prompt!=='string'||!body.prompt.trim()||body.prompt.length>6000))return json({error:{message:'A supported garment category and technical description are required.'}},400);
  if(body?.contractVersion===2){
    try{
      const manifest=typeof body.manifest==='string'?JSON.parse(body.manifest):body.manifest;
      if(!manifest||manifest.category!==body.category)throw Error('Category mismatch');
      const compiled=compileUniversalManifest(manifest);
      if(!compiled.manifest.colorAndFinish||!compiled.manifest.surfaceTextureAndWeave)throw Error('Missing appearance');
      body.manifest=compiled.manifest;body.prompt=compiled.prompt;
    }catch{return json({error:{message:'A matching garment manifest with color and fabric evidence is required.'}},400);}
  }
  let fields={};
  if(!intake){
  const doc=await fetch(`https://firestore.googleapis.com/v1/projects/stylemateai-d5843/databases/(default)/documents/wardrobe/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!doc.ok)return json({error:{message:'This garment could not be accessed.'}},doc.status===404?404:403);
  fields=(await doc.json()).fields||{};
  if(fields.userId?.stringValue!==identity.localId)return json({error:{message:'This garment belongs to a different account.'}},403);
  }
  const savedVariant=request.method==='GET'&&new URL(request.url).searchParams.get('variant')==='generated';
  const source=savedVariant?fields.ghostMannequin?.mapValue?.fields?.image?.stringValue:fields.image?.stringValue;
  if(!intake&&!validSource(source))return json({error:{message:'This saved image host is not supported for 3D generation.'}},400);
  const controller=new AbortController();const abort=()=>controller.abort();request.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,360000);
  try{
    const original=intake?new Response(uploaded,{headers:{'content-type':uploaded.type}}):await fetch(source,{redirect:'manual',signal:controller.signal});
    if(isRedirect(original))throw Error('The saved garment image redirected unexpectedly.');
    if(!original.ok)throw Error('The original garment image is unavailable.');
    const type=(original.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('The original image format is unsupported.');
    const bytes=await boundedBytes(original,8*1024*1024);
    if(bytes.length<500)throw Error('The original image is empty or too small.');
    if(request.method==='GET')return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const createForm=()=>{const form=new FormData();form.append('image',new Blob([bytes],{type}),`garment.${type==='image/jpeg'?'jpg':type.split('/')[1]}`);form.append('category',body.category);form.append('prompt',body.prompt);form.append('seed',String(seed));if(body.contractVersion===2){form.append('manifest',JSON.stringify(body.manifest));form.append('contract_version','2');}return form;};
    // Generator receives image/category/prompt only. Never forward the Firebase bearer token.
    let attempts=0,coldRestarts=0,busyRetries=0,result;
    // A timed-out GPU job can keep the single-worker lock briefly. Wait through
    // bounded 429 responses, then start one warm retry after a single 524.
    while(true){
      attempts+=1;result=await fetch(generatorEndpoint(env),{method:'POST',body:createForm(),redirect:'manual',signal:controller.signal});
      const retryCold=result.status===524&&coldRestarts<1;
      const retryBusy=result.status===429&&busyRetries<6;
      if(!retryCold&&!retryBusy)break;
      if(retryCold)coldRestarts+=1;else busyRetries+=1;
      const delay=retryDelayMs(result,env);await result.body?.cancel().catch(()=>{});await waitForRetry(delay,controller.signal);
    }
    if(isRedirect(result))return json({error:{message:'The 3D studio redirected unexpectedly. Please retry shortly.',code:'generation_redirect'}},502);
    if(result.status===429)return json({error:{message:'The 3D studio stayed busy for several minutes. Please retry shortly.',code:'gpu_busy'}},429);
    if(result.status===524)return json({error:{message:'The 3D studio is still warming up. Please retry in a moment.',code:'generation_timeout'}},504);
    if([502,503,520,521,522,523,525,526,530].includes(result.status))return json({error:{message:'The 3D GPU backend is offline. Restart the Kaggle backend connection, then retry.',code:'backend_offline'}},503);
    if(!result.ok)return json({error:{message:'3D generation failed. Please try again.',code:'generation_failed'}},502);
    if(body.contractVersion===2&&result.headers.get('X-Ghost-Contract-Version')!=='2'){
      await result.body?.cancel().catch(()=>{});
      return json({error:{message:'The connected Kaggle engine needs the appearance v2 update. Restart it with the updated notebook, then retry. Your original photo is safe.',code:'backend_upgrade_required'}},503);
    }
    const output=await boundedBytes(result,20*1024*1024);
    if(!(result.headers.get('content-type')||'').toLowerCase().startsWith('image/png')||output.length<500||!PNG.every((v,i)=>output[i]===v))throw Error('The generator returned an invalid PNG.');
    return new Response(output,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Ghost-Generation-Attempts':String(attempts),'X-Ghost-Contract-Version':result.headers.get('X-Ghost-Contract-Version')||'legacy','X-Ghost-Seed':String(seed)}});
  }catch(error){return json({error:{message:controller.signal.aborted?'3D generation timed out. Please retry.':error.message||'3D generation is unavailable.'}},controller.signal.aborted?504:502);}
  finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);}
}
export async function onRequestGet(context){try{return await handle(context);}catch{return json({error:{message:'The 3D studio is temporarily unavailable.'}},502);}}
export const onRequestPost=onRequestGet;
