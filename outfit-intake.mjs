// Rollback release: retain the established full-context extraction path for worn photos.
import {extractRegionsProduction} from './production-extraction.mjs';
import {ghostCategory,generateGhostFromPhoto} from './ghost-mannequin.mjs';
import {extractFootwearOutline} from './footwear-outline.mjs';

const defaults={extract:extractRegionsProduction,generate:generateGhostFromPhoto,footwear:extractFootwearOutline};
export const usesWornOutfitPreparation=context=>!['flat_lay','hanging'].includes(context);
export function outfitGhostCategory(item={}){
  const labels=[item.category,item.categoryRole,item.subCategory].join(' ').toLowerCase();
  if(/\b(shoes?|footwear|sneakers?|trainers?|boots?|sandals?|slippers?|heels?|bags?|headwear|accessor(?:y|ies))\b/.test(labels))return null;
  return ghostCategory(item);
}

// Worn photos must be segmented with the whole outfit as context first. A box
// alone still contains skin, other clothes and background; it is not a cutout.
export async function prepareWornOutfit(user,source,clothing,regions,{
  generate3d=false,premium=false,signal,onProgress,onQuota,onItem,
}={},deps=defaults){
  const aborted=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
  aborted();
  const extracted=await deps.extract(user,source,regions,{premium,signal,onProgress});
  const candidates=new Map(extracted.items.map(item=>[item.index,item]));
  for(let index=0;index<clothing.length;index++){
    aborted();const metadata=clothing[index];
    if(outfitGhostCategory(metadata)||!metadata.footwearOutline||!deps.footwear)continue;
    try{
      const refined=await deps.footwear(source,metadata,{signal});
      if(refined)candidates.set(index,{index,...refined});
    }catch(error){if(error.name==='AbortError'||signal?.aborted)throw error;}
  }
  const items=[];
  let generatorOffline=false;
  for(const item of [...candidates.values()].sort((a,b)=>a.index-b.index)){
    aborted();
    const metadata=structuredClone(clothing[item.index]);
    const prepared={...item,metadata,originalBlob:item.blob,message:''};
    const category=outfitGhostCategory(metadata);
    if(generate3d&&category&&!generatorOffline){
      try{
        onProgress?.(`Creating 3D for ${metadata.title||category}…`);
        const ghost=await deps.generate(user,item.blob,metadata,{
          signal,onProgress,onQuota,requireSourceMatch:true,
        });
        prepared.ghostPrepared=ghost;
        prepared.blob=ghost.blob;
        prepared.message='3D image passed the photo comparison.';
      }catch(error){
        if(error.name==='AbortError'||signal?.aborted)throw error;
        // Keep each successful extraction even if quota, GPU or comparison fails.
        prepared.message=`Cutout ready. ${error.message}`;
        generatorOffline=error.status>=500||[401,403,429].includes(error.status);
      }
    }else if(generate3d){
      prepared.message=category?'Cutout ready. 3D generation is currently unavailable.':'Extracted as a photo cutout; 3D generation is not applied to this item.';
    }
    aborted();items.push(prepared);onItem?.(prepared);
  }
  return {items,skipped:extracted.skipped.filter(item=>!candidates.has(item.index))};
}
