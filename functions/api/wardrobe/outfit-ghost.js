import {bearer,json,verifyFirebaseToken} from '../../_shared/firebase-rest.mjs';
import {compileUniversalManifest,CATEGORIES} from '../../../ghost-contract.mjs';

const ALLOWED=new Set(CATEGORIES);
const DEFAULT_ENDPOINT='https://clothmatics-ghost.chiragsharma376.workers.dev/generate';
const MAX_RESPONSE=32*1024*1024;
const OUTFIT_PIPELINE_VERSION='3';
const isRedirect=response=>response.status>=300&&response.status<400;

export function outfitGeneratorEndpoint(env={}){
  const url=new URL(env.GHOST_MANNEQUIN_API_URL||DEFAULT_ENDPOINT);
  const path=url.pathname.replace(/\/+$/,'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(path&&path!=='/generate'&&path!=='/outfit'))throw Error('Invalid generator endpoint');
  return `${url.origin}/outfit`;
}

async function boundedBytes(response,max){
  if(Number(response.headers.get('content-length'))>max)throw Error('Prepared outfit exceeds the supported size.');
  const reader=response.body?.getReader();if(!reader)throw Error('Empty outfit response.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Prepared outfit exceeds the supported size.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

function parseItems(raw){
  let items;try{items=JSON.parse(String(raw||''));}catch{throw Error('Invalid outfit evidence.');}
  if(!Array.isArray(items)||items.length<1||items.length>5)throw Error('Choose between one and five outfit items.');
  const seen=new Set();
  return items.map(item=>{
    if(!Number.isInteger(item?.index)||item.index<0||item.index>=5||seen.has(item.index)||!Array.isArray(item.boundingBox)||item.boundingBox.length!==4||!item.boundingBox.every(value=>Number.isFinite(value)&&value>=0&&value<=1000)||item.boundingBox[2]<=item.boundingBox[0]||item.boundingBox[3]<=item.boundingBox[1])throw Error('Invalid outfit item region.');
    seen.add(item.index);
    const output={index:item.index,boundingBox:item.boundingBox,quality:'high',seed:crypto.getRandomValues(new Uint32Array(1))[0]};
    if(item.category!==null&&item.category!==undefined){
      if(!ALLOWED.has(item.category))throw Error('Unsupported outfit garment category.');
      const compiled=compileUniversalManifest(item.manifest);
      if(compiled.manifest.category!==item.category||!compiled.manifest.colorAndFinish||!compiled.manifest.surfaceTextureAndWeave||!compiled.manifest.palette?.some(color=>color.role==='base'))throw Error('Color and fabric evidence is required for every rendered outfit item.');
      output.category=item.category;output.parserClass=item.category;output.manifest=compiled.manifest;
    }else{if(item.parserClass!=='footwear')throw Error('Unsupported photo-only outfit item.');output.parserClass='footwear';}
    return output;
  });
}

const retryDelayMs=(response,env)=>{
  const configured=Number(env.GHOST_RETRY_DELAY_MS);if(Number.isFinite(configured)&&configured>=0)return Math.min(configured,30000);
  const seconds=Number(response.headers.get('retry-after'));return Number.isFinite(seconds)&&seconds>0?Math.min(20000,Math.max(5000,seconds*1000)):15000;
};
const wait=ms=>ms<=0?Promise.resolve():new Promise(resolve=>setTimeout(resolve,ms));

export async function onRequestPost({request,env}){
  try{
    const token=bearer(request.headers.get('Authorization')||'');
    if(!token)return json({error:{message:'Sign in to prepare a 3D outfit.'}},401);
    const identity=await verifyFirebaseToken(token,env.FIREBASE_WEB_API_KEY);
    if(!identity?.localId)return json({error:{message:'Your session expired. Please sign in again.'}},401);
    if(!(request.headers.get('content-type')||'').startsWith('multipart/form-data')||Number(request.headers.get('content-length'))>9*1024*1024)return json({error:{message:'A valid outfit photo is required.'}},400);
    const incoming=await request.formData(),image=incoming.get('image');
    if(!image||typeof image.arrayBuffer!=='function'||image.size<500||image.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(image.type))return json({error:{message:'A valid outfit photo is required.'}},400);
    let items;try{items=parseItems(incoming.get('items'));}catch(error){return json({error:{message:error.message}},400);}
    const bytes=new Uint8Array(await image.arrayBuffer());
    const makeForm=()=>{const form=new FormData();form.append('image',new Blob([bytes],{type:image.type}),'outfit.'+(image.type==='image/jpeg'?'jpg':image.type.split('/')[1]));form.append('items',JSON.stringify(items));form.append('contract_version','2');return form;};
    let result,attempts=0,busy=0;
    do{
      attempts+=1;
      // Authentication stays at Pages; no Firebase identity or user headers reach Kaggle.
      result=await fetch(outfitGeneratorEndpoint(env),{method:'POST',body:makeForm(),redirect:'manual'});
      if(result.status!==429||busy>=6)break;
      busy+=1;const delay=retryDelayMs(result,env);await result.body?.cancel().catch(()=>{});await wait(delay);
    }while(true);
    if(isRedirect(result))return json({error:{message:'The outfit studio redirected unexpectedly.',code:'generation_redirect'}},502);
    if(result.status===409)return json({error:{message:'Kaggle did not identify this as a worn outfit. Use Single Garment for a flat-lay or hanging item.',code:'not_worn'}},409);
    if(result.status===404)return json({error:{message:'The connected Kaggle engine needs the outfit update. Restart it with the v9.3 cell.',code:'backend_upgrade_required'}},503);
    if(result.status===429)return json({error:{message:'The 3D studio stayed busy. Please retry shortly.',code:'gpu_busy'}},429);
    if([502,503,520,521,522,523,524,525,526,530].includes(result.status))return json({error:{message:'The 3D GPU backend is offline. Restart the Kaggle backend connection, then retry.',code:'backend_offline'}},503);
    if(!result.ok)return json({error:{message:'Kaggle could not prepare this outfit.',code:'generation_failed'}},502);
    if(result.headers.get('X-Outfit-Pipeline-Version')!==OUTFIT_PIPELINE_VERSION||result.headers.get('X-Ghost-Contract-Version')!=='2'){
      await result.body?.cancel().catch(()=>{});return json({error:{message:'The connected Kaggle engine needs the v9.3 outfit update.',code:'backend_upgrade_required'}},503);
    }
    const output=await boundedBytes(result,MAX_RESPONSE);
    if(!(result.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Error('Kaggle returned an invalid outfit response.');
    return new Response(output,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Outfit-Generation-Attempts':String(attempts),'X-Outfit-Pipeline-Version':OUTFIT_PIPELINE_VERSION}});
  }catch(error){return json({error:{message:error.message||'The outfit studio is temporarily unavailable.'}},502);}
}
