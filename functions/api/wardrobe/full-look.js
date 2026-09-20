import {bearer,getOwnedWardrobe,json,verifyFirebaseToken} from '../../_shared/firebase-rest.mjs';
import {buildGhostAnalysisFromItem,ghostCategory} from '../../../ghost-contract.mjs';
import {lookbookSlotFor,prioritizeOutfitItems} from '../../../web-core.mjs';
import {validSource} from './ghost.js';

const DEFAULT_ENDPOINT='https://clothmatics-ghost.chiragsharma376.workers.dev/generate';
const PNG=[137,80,78,71,13,10,26,10],MAX_REFERENCE_BYTES=8*1024*1024,MAX_TOTAL_BYTES=30*1024*1024,MAX_OUTPUT_BYTES=20*1024*1024;
const isRedirect=response=>response.status>=300&&response.status<400;

export function fullLookGeneratorEndpoint(env={}){
  const url=new URL(env.GHOST_MANNEQUIN_API_URL||DEFAULT_ENDPOINT),path=url.pathname.replace(/\/+$/,'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(path&&!['/generate','/outfit','/full-look'].includes(path)))throw Error('Invalid generator endpoint');
  return `${url.origin}/full-look`;
}

async function boundedBytes(response,max){
  if(Number(response.headers.get('content-length'))>max)throw Error('An outfit image exceeds the supported size.');
  const reader=response.body?.getReader();if(!reader)throw Error('An outfit image was empty.');const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('An outfit image exceeds the supported size.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

const clean=(value,max=160)=>String(value??'').replace(/[<>\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const stringList=(value,max=8)=>(Array.isArray(value)?value:String(value||'').split(',')).map(part=>clean(part,60)).filter(Boolean).slice(0,max);
function evidenceFor(item,index){
  let garmentManifest=null,category=ghostCategory(item);
  if(category){try{garmentManifest=buildGhostAnalysisFromItem(item).manifest;}catch{garmentManifest=null;}}
  return {
    index,slot:lookbookSlotFor(item),title:clean(item.title,80),category:clean(item.subCategory||item.category,60),rendererCategory:category,
    primaryColor:clean(item.primaryColor,50),secondaryColors:stringList(item.secondaryColors),pattern:clean(item.pattern,80),material:clean(item.material||item.fabric,80),fit:clean(item.fit,60),
    palette:(garmentManifest?.palette||[]).slice(0,12),colorAndFinish:clean(garmentManifest?.colorAndFinish||item.colorDetail,260),surfaceTextureAndWeave:clean(garmentManifest?.surfaceTextureAndWeave||item.fabricTexture,220),
    hardwareAndClosures:clean(garmentManifest?.hardwareAndClosures,160),graphicsOrText:clean(garmentManifest?.graphicsOrText,180),sourceKind:item.ghostMannequin?.image?'verified_ghost':'wardrobe_photo'
  };
}

function validateSelection(ids,wardrobe){
  if(!Array.isArray(ids)||ids.length<2||ids.length>6||ids.some(id=>typeof id!=='string'||!id||id.length>200||id.includes('/'))||new Set(ids).size!==ids.length)throw Error('Choose two to six distinct wardrobe pieces.');
  const byId=new Map(wardrobe.map(item=>[String(item.id),item])),items=ids.map(id=>byId.get(id));
  if(items.some(item=>!item))throw Error('One or more selected wardrobe pieces are unavailable.');
  if(items.some(item=>item.hiddenFromAI===true||item.privateItem===true||item.stylingUsage==='private_innerwear'||String(item.laundryStatus||'').toLowerCase()==='laundry'))throw Error('The outfit contains a private or unavailable wardrobe piece.');
  const ordered=prioritizeOutfitItems(items),slots=ordered.map(lookbookSlotFor),hasHero=slots.includes('hero');
  if(hasHero?slots.some(slot=>slot==='top'||slot==='bottom'):!(slots.includes('top')&&slots.includes('bottom')))throw Error('Choose either a complete one-piece look or a compatible top and bottom.');
  return ordered;
}

const retryDelayMs=(response,env)=>{const configured=Number(env.GHOST_RETRY_DELAY_MS);if(Number.isFinite(configured)&&configured>=0)return Math.min(configured,30000);const seconds=Number(response.headers.get('retry-after'));return Number.isFinite(seconds)&&seconds>0?Math.min(20000,Math.max(5000,seconds*1000)):15000;};
const wait=(milliseconds,signal)=>milliseconds<=0?Promise.resolve():new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,milliseconds);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Object.assign(Error('Request aborted'),{name:'AbortError'}));};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});

export async function onRequestPost({request,env}){
  const token=bearer(request.headers.get('Authorization')||'');if(!token)return json({error:{message:'Sign in to generate a complete outfit.'}},401);
  const identity=await verifyFirebaseToken(token,env.FIREBASE_WEB_API_KEY);if(!identity?.localId)return json({error:{message:'Your session expired. Please sign in again.'}},401);
  const body=await request.json().catch(()=>null),presentation=clean(body?.presentation,20),feedback=clean(body?.feedback,900);
  if(!['masculine','feminine','neutral'].includes(presentation))return json({error:{message:'Choose a valid mannequin presentation.'}},400);
  let items;try{items=validateSelection(body?.wardrobeItemIds,await getOwnedWardrobe(token,identity.localId));}catch(error){return json({error:{message:error.message}},400);}
  const controller=new AbortController(),abort=()=>controller.abort();request.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,360000);
  try{
    const references=[];let total=0;
    for(const item of items){
      const source=item.ghostMannequin?.image||item.image;if(!validSource(source))throw Error('A selected wardrobe image host is unsupported.');
      const response=await fetch(source,{redirect:'manual',signal:controller.signal});if(isRedirect(response)||!response.ok)throw Error('A selected wardrobe image is unavailable.');
      const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('A selected wardrobe image format is unsupported.');
      const bytes=await boundedBytes(response,MAX_REFERENCE_BYTES);if(bytes.length<500)throw Error('A selected wardrobe image is too small.');total+=bytes.length;if(total>MAX_TOTAL_BYTES)throw Error('The selected outfit images are too large together.');
      references.push({bytes,type});
    }
    const evidence=items.map(evidenceFor),seed=crypto.getRandomValues(new Uint32Array(1))[0];
    const makeForm=()=>{const form=new FormData();references.forEach(({bytes,type},index)=>form.append('reference',new Blob([bytes],{type}),`reference-${index}.${type==='image/jpeg'?'jpg':type.split('/')[1]}`));form.append('items',JSON.stringify(evidence));form.append('presentation',presentation);form.append('feedback',feedback);form.append('seed',String(seed));form.append('contract_version','1');return form;};
    let result,attempts=0,cold=0,busy=0;
    while(true){attempts+=1;result=await fetch(fullLookGeneratorEndpoint(env),{method:'POST',body:makeForm(),redirect:'manual',signal:controller.signal});const retryCold=result.status===524&&cold<1,retryBusy=result.status===429&&busy<6;if(!retryCold&&!retryBusy)break;if(retryCold)cold+=1;else busy+=1;const delay=retryDelayMs(result,env);await result.body?.cancel().catch(()=>{});await wait(delay,controller.signal);}
    if(isRedirect(result))return json({error:{message:'The complete-look studio redirected unexpectedly.',code:'generation_redirect'}},502);
    if(result.status===404||result.status===409)return json({error:{message:'The connected Kaggle engine needs the v9.4 full-look update.',code:'backend_upgrade_required'}},503);
    if(result.status===429)return json({error:{message:'The 3D studio stayed busy. Please retry shortly.',code:'gpu_busy'}},429);
    if([502,503,520,521,522,523,524,525,526,530].includes(result.status))return json({error:{message:'The 3D GPU backend is offline. Restart the Kaggle or Lightning backend connection, then retry.',code:'backend_offline'}},503);
    if(!result.ok)return json({error:{message:'The 3D GPU engine could not generate this complete look.',code:'generation_failed'}},502);
    const output=await boundedBytes(result,MAX_OUTPUT_BYTES);
    const isPng = output.length >= 8 && PNG.every((value,index)=>output[index]===value);
    const isJpeg = output.length >= 3 && output[0] === 0xFF && output[1] === 0xD8 && output[2] === 0xFF;
    if((!isPng && !isJpeg) || output.length < 500) throw Error('The complete-look studio returned an invalid image.');
    const outMime = isPng ? 'image/png' : 'image/jpeg';
    return new Response(output,{headers:{'Content-Type':outMime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Full-Look-Pipeline-Version':'1','X-Full-Look-Seed':String(seed),'X-Full-Look-Request-Id':result.headers.get('X-Request-Id')||'','X-Full-Look-Generation-Attempts':String(attempts)}});
  }catch(error){return json({error:{message:controller.signal.aborted?'Complete-look generation timed out. Please retry.':error.message||'Complete-look generation is unavailable.'}},controller.signal.aborted?504:502);}
  finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);}
}
