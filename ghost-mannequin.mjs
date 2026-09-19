import {callAiGateway} from './web-api.mjs';
import {normalizeGarmentImage,analyzeGarment,GARMENT_ANALYSIS_PROMPT} from './garment-upload.mjs';
import {APPEARANCE_PROMPT,imageFingerprint} from './garment-appearance.mjs';
import {buildGhostAnalysisFromItem,hasReusableGhostMetadata,hasGhostPhotoEvidence,ghostGenerationAttempts,refineGhostAnalysis,parseGhostQuality,ghostQualityPromptFor,GHOST_CONTRACT_VERSION} from './ghost-contract.mjs';
export * from './ghost-contract.mjs';
export const GHOST_ANALYSIS_PROMPT=GARMENT_ANALYSIS_PROMPT+APPEARANCE_PROMPT;
const generationDiagnostics=new WeakMap();
export const ghostDiagnosticsFor=blob=>generationDiagnostics.get(blob)||{};
async function checkedGeneratedBlob(response,message='The generated image was invalid.'){
  const blob=await response.blob();const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(blob.type!=='image/png'||blob.size<500||blob.size>20*1024*1024||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error(message);
  const bitmap=await createImageBitmap(blob);const valid=bitmap.width>=64&&bitmap.height>=64;bitmap.close();if(!valid)throw Error('The generated image was too small.');
  generationDiagnostics.set(blob,{seed:response.headers.get('X-Ghost-Seed')||'',requestId:response.headers.get('X-Ghost-Request-Id')||'',attempts:Number(response.headers.get('X-Ghost-Generation-Attempts'))||1});
  return blob;
}
async function authenticated(user,url,options){
  const send=async refresh=>fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${await user.getIdToken(refresh)}`}});
  let response=await send(false);if(response.status===401)response=await send(true);
  if(!response.ok){const body=await response.json().catch(()=>({}));const error=Error(body.error?.message||'The 3D studio could not complete this request.');error.status=response.status;error.code=body.error?.code||'';throw error;}
  return response;
}
export async function getGhostSource(user,id,{signal}={}){
  return (await authenticated(user,`/api/wardrobe/ghost?id=${encodeURIComponent(id)}`,{signal})).blob();
}
export async function analyzeGhostGarment(user,id,{signal,sourceBlob}={}){
  const normalized=await normalizeGarmentImage(sourceBlob||await getGhostSource(user,id,{signal}));
  const {metadata}=await analyzeGarment(user,normalized.blob,{signal,fresh:true});
  if(!hasReusableGhostMetadata(metadata))throw Error('Color, fabric or construction could not be read reliably. Use a clearer photo before starting GPU generation.');
  return {...buildGhostAnalysisFromItem(metadata),metadata};
}
export async function generateGhostGarment(user,id,analysis,{signal}={}){
  const {category,prompt,manifest,contractVersion}=analysis;
  const response=await authenticated(user,'/api/wardrobe/ghost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({garmentId:id,category,prompt,manifest,contractVersion}),signal});
  return checkedGeneratedBlob(response);
}
async function generatePhotoCandidate(user,blob,analysis,{signal}={}){
  const form=new FormData();form.append('image',blob,'garment.png');form.append('category',analysis.category);form.append('prompt',analysis.prompt);
  form.append('manifest',JSON.stringify(analysis.manifest));form.append('contractVersion',String(GHOST_CONTRACT_VERSION));
  const response=await authenticated(user,'/api/wardrobe/ghost',{method:'POST',body:form,signal});
  return checkedGeneratedBlob(response,'Invalid 3D image.');
}
export async function generateGhostFromPhoto(user,blob,metadata,{signal,onProgress,onQuota,requireSourceMatch=false}={}){
  if(requireSourceMatch?!hasGhostPhotoEvidence(metadata,await imageFingerprint(blob)):!hasReusableGhostMetadata(metadata)){
    onProgress?.('Inspecting color, fabric and construction…');
    try{const result=await analyzeGarment(user,blob,{signal,fresh:true});Object.assign(metadata,result.metadata);}finally{onQuota?.();}
  }
  if(!hasReusableGhostMetadata(metadata))throw Error('Color, fabric or construction could not be read reliably. Review the original photo and try a clearer, complete garment image.');
  let analysis=buildGhostAnalysisFromItem(metadata);const attempts=ghostGenerationAttempts(analysis.category);
  for(let attempt=0;attempt<attempts;attempt++){
    onProgress?.(attempt?'Refining the garment from the photo comparison…':'Creating your 3D garment…');
    const output=await generatePhotoCandidate(user,blob,analysis,{signal});
    onProgress?.('Checking color, fabric, shape and empty openings…');
    try{
      let quality;try{quality=await verifyGhostResult(user,blob,output,{signal,palette:analysis.manifest.palette,category:analysis.category});}finally{onQuota?.();}
      return {blob:await ghostStorageBlob(output),analysis,quality};
    }catch(error){
      if(error.code!=='quality_rejected'||attempt+1>=attempts)throw error;
      analysis=refineGhostAnalysis(analysis,error.quality);
    }
  }
  throw Error('The garment could not be verified.');
}
const bytesFromBase64=value=>{const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;};
const pngFromBase64=async value=>{
  if(typeof value!=='string'||value.length<100)throw Error('Kaggle returned an invalid garment cutout.');
  return checkedGeneratedBlob(new Response(bytesFromBase64(value),{headers:{'Content-Type':'image/png'}}),'Kaggle returned an invalid garment cutout.');
};
const footwearItem=item=>/\b(shoes?|footwear|sneakers?|trainers?|boots?|sandals?|slippers?|heels?)\b/i.test([item.category,item.categoryRole,item.subCategory].join(' '));
export async function generateGhostOutfitFromPhoto(user,blob,metadataItems,{signal,onProgress,onQuota,onItem}={}){
  const requests=[];const analyses=new Map();
  for(let index=0;index<Math.min(5,metadataItems.length);index++){
    const metadata=metadataItems[index],boundingBox=metadata.boundingBox;
    if(!Array.isArray(boundingBox)||boundingBox.length!==4)continue;
    if(footwearItem(metadata))requests.push({index,boundingBox,parserClass:'footwear',category:null});
    else{
      try{const analysis=buildGhostAnalysisFromItem(metadata);analyses.set(index,analysis);requests.push({index,boundingBox,parserClass:analysis.category,category:analysis.category,manifest:analysis.manifest});}
      catch{continue;}
    }
  }
  if(!requests.length)throw Error('No supported clothing or footwear was found for Kaggle preparation.');
  const form=new FormData();form.append('image',blob,'worn-outfit.jpg');form.append('items',JSON.stringify(requests));
  onProgress?.('Kaggle is separating the clothes in your photo…');
  const response=await authenticated(user,'/api/wardrobe/outfit-ghost',{method:'POST',body:form,signal});
  const body=await response.json();if(!Array.isArray(body.items))throw Error('Kaggle returned an invalid outfit result.');
  const items=[];
  for(const raw of body.items){
    const index=Number(raw.index),metadata=structuredClone(metadataItems[index]||{}),sourceBlob=await pngFromBase64(raw.sourcePng);
    const prepared={index,metadata,blob:sourceBlob,originalBlob:sourceBlob,diagnostics:{engine:'kaggle_segformer',parserVersion:body.parserVersion,labels:raw.parserLabels,sourcePixels:raw.sourcePixels},message:''};
    const analysis=analyses.get(index);
    if(analysis&&raw.generatedPng){
      try{
        onProgress?.(`Checking ${metadata.title||analysis.category} against the source photo…`);
        const generated=await pngFromBase64(raw.generatedPng);
        let quality;try{quality=await verifyGhostResult(user,sourceBlob,generated,{signal,palette:analysis.manifest.palette,category:analysis.category});}finally{onQuota?.();}
        prepared.ghostPrepared={blob:await ghostStorageBlob(generated),analysis,quality};prepared.blob=prepared.ghostPrepared.blob;prepared.message='3D image passed the photo comparison.';
      }catch(error){
        if(error.name==='AbortError')throw error;
        if(error.code==='quality_rejected'&&ghostGenerationAttempts(analysis.category)>1&&analysis.category==='jacket'){
          try{
            const refined=refineGhostAnalysis(analysis,error.quality);
            onProgress?.(`Refining ${metadata.title||'the jacket'} from the photo comparison…`);
            const generated=await generatePhotoCandidate(user,sourceBlob,refined,{signal});
            let quality;try{quality=await verifyGhostResult(user,sourceBlob,generated,{signal,palette:refined.manifest.palette,category:refined.category});}finally{onQuota?.();}
            prepared.ghostPrepared={blob:await ghostStorageBlob(generated),analysis:refined,quality};prepared.blob=prepared.ghostPrepared.blob;prepared.message='3D image passed the corrected photo comparison.';
          }catch(retryError){if(retryError.name==='AbortError')throw retryError;error=retryError;}
        }
        if(!prepared.ghostPrepared)prepared.message=`Kaggle cutout ready. ${error.message}`;
      }
    }else if(analysis)prepared.message=`Kaggle cutout ready. ${raw.generationError||'3D generation was unavailable for this item.'}`;
    else prepared.message='Extracted as a Kaggle photo cutout; 3D generation is not applied to footwear.';
    items.push(prepared);onItem?.(prepared);
  }
  const returned=new Set(items.map(item=>item.index));
  const skipped=[...(body.skipped||[]),...requests.filter(item=>!returned.has(item.index)).map(item=>({index:item.index,message:'Kaggle could not isolate clean garment pixels for this item.'}))];
  if(!items.length)throw Error(skipped.map(item=>item.message).filter(Boolean).join(' ')||'Kaggle could not isolate any garment pixels from this photo.');
  return {items,skipped,wornEvidence:body.wornEvidence};
}
const imageBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
async function verificationBlob(blob){
  const bitmap=await createImageBitmap(blob);
  try{
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!result)throw Error('Image comparison could not be prepared.');return result;
  }finally{bitmap.close();}
}
export async function verifyGhostResult(user,source,output,{signal,palette=[],category=''}={}){
  const first=await verificationBlob(source),second=await verificationBlob(output);
  const {body}=await callAiGateway(user,'/v1/generate',{
    contents:[{parts:[{text:ghostQualityPromptFor(category)+(palette.length?' Also return colorRegions: [{id: integer, match: boolean, confidence: number from 0 to 1}] for EVERY indexed source sample below. Compare the corresponding visible region, not average image color. Fail missing, uncertain, warmed/cooled, bleached or swapped colors, including small embroidery, borders and each piece of a set. Allow local folds and shadows. Source pixels override sample labels. Samples: '+JSON.stringify(palette.map((c,id)=>({...c,id}))):'')},{inlineData:{mimeType:first.type,data:await imageBase64(first)}},{inlineData:{mimeType:second.type,data:await imageBase64(second)}}]}],
    generationConfig:{temperature:0,maxOutputTokens:4096,responseMimeType:'application/json'},
  },{signal});
  const quality=parseGhostQuality(body,palette,category),diagnostics=ghostDiagnosticsFor(output);
  if(!quality.passed){console.warn('[ghost-quality] rejected',{category,confidence:quality.confidence,checks:quality.checks,issues:quality.issues,colorRegions:quality.colorRegions,...diagnostics});const error=Error(`The 3D image did not pass the photo comparison. ${quality.issues.join(' ')||'Color, garment details or empty openings could not be verified.'} Your original is safe. Try again or use a clearer photo.`);error.code='quality_rejected';error.quality=quality;error.diagnostics=diagnostics;throw error;}
  console.info('[ghost-quality] passed',{category,confidence:quality.confidence,...diagnostics});
  return {...quality,version:1};
}
export async function ghostStorageBlob(blob){
  if(blob.size<=6*1024*1024)return blob;
  const bitmap=await createImageBitmap(blob);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  for(const quality of [.92,.8]){const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(output&&output.size>=500&&output.size<=6*1024*1024)return output;}
  throw Error('This generated image is too large to save. You can still download it.');
}
export async function downloadGhostGarment(user,id){
  return (await authenticated(user,`/api/wardrobe/ghost?id=${encodeURIComponent(id)}&variant=generated`,{})).blob();
}

