import {extractInBrowser} from './browser-extraction.mjs';
import {extractGarmentWithOracle,cropGarmentImage,isGarmentExtractionReady} from './garment-upload.mjs';

export function activePremium(subscription,now=Date.now()){
  return subscription?.plan==='premium'&&Number(subscription.premiumUntil)>now;
}
export function infrastructureFailure(error){
  return !error?.status||[401,403,408,425,429].includes(error.status)||error.status>=500;
}
function validBox(box){return Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]<=1000&&box[3]<=1000&&box[2]>box[0]&&box[3]>box[1];}
const defaults={cloud:extractGarmentWithOracle,local:extractInBrowser,crop:cropGarmentImage};
function cancellation(error,signal){if(error?.name==='AbortError'||signal?.aborted)throw new DOMException('Aborted','AbortError');}
function localOutput(result){
  const item=result?.items?.[0];
  if(!result?.ok||!item?.uri)throw new Error(result?.message||'A clean garment cutout could not be prepared.');
  return {blob:item.uri,diagnostics:{engine:'on_device',outputWidth:item.width,outputHeight:item.height,postprocessVersion:'mobile-browser-20260906'}};
}
export async function extractSingleProduction(user,blob,{premium=false,signal,onProgress}={},deps=defaults){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(premium){
    try{const result=await deps.cloud(user,blob,{signal});return {...result,diagnostics:{...result.diagnostics,engine:'oracle_cloud'}};}
    catch(error){cancellation(error,signal);onProgress?.('Preparing the garment on this device…');}
  }
  return localOutput(await deps.local(blob,{signal,onProgress}));
}
export async function recoverSingleProduction(blob,metadata,{signal,onProgress}={},deps=defaults){
  // Mobile retries locally after a failed primary/fallback: generous AI crop,
  // then the light-fabric pass. Never run a second cloud upload for this retry.
  let input=blob;
  if(validBox(metadata?.boundingBox)){
    try{input=(await deps.crop(blob,metadata.boundingBox,.22)).blob;return localOutput(await deps.local(input,{signal,onProgress}));}
    catch(error){cancellation(error,signal);}
  }
  return localOutput(await deps.local(input,{signal,onProgress,preserveLightFabric:true}));
}
export async function extractRegionsProduction(user,blob,regions,{premium=false,signal,onProgress,onItem}={},deps=defaults){
  const items=new Map(),skipped=[],failed=[];
  let circuit=false;
  for(let index=0;index<regions.length;index++){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const region=regions[index];
    if(!validBox(region.boundingBox)||!isGarmentExtractionReady(region)){
      skipped.push({index,message:!validBox(region.boundingBox)?'A reliable garment outline was not found.':'This piece is too hidden or cropped to prepare cleanly.'});continue;
    }
    if(!premium||circuit){failed.push(index);continue;}
    onProgress?.(`Preparing garment ${index+1} of ${regions.length}…`);
    try{
      const value=await deps.cloud(user,blob,{signal,mode:'portrait_region',region:region.boundingBox,regions,candidateIndex:index});
      const item={index,...value,diagnostics:{...value.diagnostics,engine:'oracle_cloud'}};
      items.set(index,item);onItem?.(item);
    }catch(error){cancellation(error,signal);circuit=infrastructureFailure(error);failed.push(index);}
  }
  if(failed.length){
    onProgress?.('Preparing garments on this device…');
    try{
      const local=await deps.local(blob,{regions,signal,onProgress});
      for(const index of failed){
        const match=local.items?.find(item=>item.sourceIndex===index);
        if(match?.uri){const item={index,blob:match.uri,diagnostics:{engine:'on_device',outputWidth:match.width,outputHeight:match.height,postprocessVersion:'mobile-browser-20260906'}};items.set(index,item);onItem?.(item);}
        else skipped.push({index,message:local.skipped?.find(item=>item.index===index)?.message||local.message||'This piece could not be prepared cleanly.'});
      }
    }catch(error){cancellation(error,signal);for(const index of failed)skipped.push({index,message:error.message});}
  }
  return {items:[...items.values()].sort((a,b)=>a.index-b.index),skipped};
}
