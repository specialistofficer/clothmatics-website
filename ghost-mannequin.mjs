import {callAiGateway} from './web-api.mjs';
import {normalizeGarmentImage,analyzeGarment,GARMENT_ANALYSIS_PROMPT} from './garment-upload.mjs';
import {APPEARANCE_PROMPT} from './garment-appearance.mjs';
import {buildGhostAnalysisFromItem,hasReusableGhostMetadata,parseGhostQuality,GHOST_QUALITY_PROMPT,GHOST_CONTRACT_VERSION} from './ghost-contract.mjs';
export * from './ghost-contract.mjs';
export const GHOST_ANALYSIS_PROMPT=GARMENT_ANALYSIS_PROMPT+APPEARANCE_PROMPT;
async function authenticated(user,url,options){
  const send=async refresh=>fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${await user.getIdToken(refresh)}`}});
  let response=await send(false);if(response.status===401)response=await send(true);
  if(!response.ok){const body=await response.json().catch(()=>({}));const error=Error(body.error?.message||'The 3D studio could not complete this request.');error.status=response.status;throw error;}
  return response;
}
export async function getGhostSource(user,id,{signal}={}){
  return (await authenticated(user,`/api/wardrobe/ghost?id=${encodeURIComponent(id)}`,{signal})).blob();
}
export async function analyzeGhostGarment(user,id,{signal,sourceBlob}={}){
  const normalized=await normalizeGarmentImage(sourceBlob||await getGhostSource(user,id,{signal}));
  const {metadata}=await analyzeGarment(user,normalized.blob,{signal,fresh:true});
  return {...buildGhostAnalysisFromItem(metadata),metadata};
}
export async function generateGhostGarment(user,id,analysis,{signal}={}){
  const {category,prompt,manifest,contractVersion}=analysis;
  const response=await authenticated(user,'/api/wardrobe/ghost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({garmentId:id,category,prompt,manifest,contractVersion}),signal});
  const blob=await response.blob();const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(blob.type!=='image/png'||blob.size<500||blob.size>20*1024*1024||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('The generated image was invalid.');
  const bitmap=await createImageBitmap(blob);const valid=bitmap.width>=64&&bitmap.height>=64;bitmap.close();if(!valid)throw Error('The generated image was too small.');return blob;
}
export async function generateGhostFromPhoto(user,blob,metadata,{signal,onProgress,onQuota}={}){
  if(!hasReusableGhostMetadata(metadata)){
    onProgress?.('Inspecting color, fabric and construction…');
    try{const result=await analyzeGarment(user,blob,{signal,fresh:true});Object.assign(metadata,result.metadata);}finally{onQuota?.();}
  }
  if(!hasReusableGhostMetadata(metadata))throw Error('Color, fabric or construction could not be read reliably. Review the original photo and try a clearer, complete garment image.');
  const analysis=buildGhostAnalysisFromItem(metadata);
  const form=new FormData();form.append('image',blob,'garment.jpg');form.append('category',analysis.category);form.append('prompt',analysis.prompt);
  form.append('manifest',JSON.stringify(analysis.manifest));form.append('contractVersion',String(GHOST_CONTRACT_VERSION));
  onProgress?.('Creating your 3D garment…');
  const response=await authenticated(user,'/api/wardrobe/ghost',{method:'POST',body:form,signal});
  const output=await response.blob();
  const bytes=new Uint8Array(await output.slice(0,8).arrayBuffer());
  if(output.type!=='image/png'||output.size<500||output.size>20*1024*1024||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('Invalid 3D image.');
  const bitmap=await createImageBitmap(output);const valid=bitmap.width>=64&&bitmap.height>=64;bitmap.close();if(!valid)throw Error('3D image is too small.');
  onProgress?.('Checking color, fabric, shape and empty openings…');
  let quality;try{quality=await verifyGhostResult(user,blob,output,{signal});}finally{onQuota?.();}
  return {blob:await ghostStorageBlob(output),analysis,quality};
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
export async function verifyGhostResult(user,source,output,{signal}={}){
  const first=await verificationBlob(source),second=await verificationBlob(output);
  const {body}=await callAiGateway(user,'/v1/generate',{
    contents:[{parts:[{text:GHOST_QUALITY_PROMPT},{inlineData:{mimeType:first.type,data:await imageBase64(first)}},{inlineData:{mimeType:second.type,data:await imageBase64(second)}}]}],
    generationConfig:{temperature:0,maxOutputTokens:2048,responseMimeType:'application/json'},
  },{signal});
  const quality=parseGhostQuality(body);
  if(!quality.passed){const error=Error(`The 3D image did not pass the photo comparison. ${quality.issues.join(' ')||'Color, garment details or empty openings could not be verified.'} Your original is safe. Try again or use a clearer photo.`);error.code='quality_rejected';throw error;}
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

