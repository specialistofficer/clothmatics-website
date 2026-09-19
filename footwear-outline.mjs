// Rollback release: garment cutouts retain the established extractor; this refines footwear only.
// Vision supplies geometry; retained RGB pixels come from the photograph.
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[1]*q[0]-q[1]*p[0];},0))/2;
export function normalizeFootwearOutline(value,box){
  if(value?.confidence!=='high'||![1,2].includes(value.visibleShoes)||!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1])return null;
  const polygons=value.polygons;
  if(!Array.isArray(polygons)||polygons.length!==value.visibleShoes)return null;
  const valid=points=>Array.isArray(points)&&points.length>=6&&points.length<=64&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=Math.max(0,box[0]-15)&&p[0]<=Math.min(1000,box[2]+15)&&p[1]>=Math.max(0,box[1]-15)&&p[1]<=Math.min(1000,box[3]+15))&&area(points)>25;
  if(!polygons.every(valid))return null;
  if(polygons.length===2&&JSON.stringify(polygons[0])===JSON.stringify(polygons[1]))return null;
  const holes=value.holes??[];
  if(!Array.isArray(holes)||holes.length>4||!holes.every(valid))return null;
  return {confidence:'high',visibleShoes:value.visibleShoes,polygons:polygons.map(p=>p.map(([y,x])=>[y,x])),holes:holes.map(p=>p.map(([y,x])=>[y,x]))};
}

export async function extractFootwearOutline(source,metadata,{signal}={}){
  const outline=normalizeFootwearOutline(metadata.footwearOutline,metadata.boundingBox);
  if(!outline)return null;
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const bitmap=await createImageBitmap(source,{imageOrientation:'from-image'});
  try{
    const points=outline.polygons.flat();
    const x0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))*bitmap.width/1000)-2);
    const y0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))*bitmap.height/1000)-2);
    const x1=Math.min(bitmap.width,Math.ceil(Math.max(...points.map(p=>p[1]))*bitmap.width/1000)+2);
    const y1=Math.min(bitmap.height,Math.ceil(Math.max(...points.map(p=>p[0]))*bitmap.height/1000)+2);
    const canvas=document.createElement('canvas');canvas.width=x1-x0;canvas.height=y1-y0;
    if(canvas.width<16||canvas.height<16)return null;
    const ctx=canvas.getContext('2d');
    const path=polygon=>{ctx.beginPath();polygon.forEach(([y,x],i)=>ctx[i?'lineTo':'moveTo'](x*bitmap.width/1000-x0,y*bitmap.height/1000-y0));ctx.closePath();ctx.fill();};
    for(const polygon of outline.polygons)path(polygon);
    ctx.globalCompositeOperation='destination-out';for(const hole of outline.holes)path(hole);
    ctx.globalCompositeOperation='source-in';ctx.drawImage(bitmap,-x0,-y0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(!blob||blob.size<500)return null;
    return {blob,diagnostics:{engine:'photo_footwear_outline',outputWidth:canvas.width,outputHeight:canvas.height,visibleShoes:outline.visibleShoes}};
  }finally{bitmap.close();}
}
