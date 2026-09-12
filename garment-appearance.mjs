// Evidence measured on the uploaded photograph, never inferred from a title or
// from generated pixels. Coordinates are supplied by vision; RGB is sampled here.
import {PALETTE_ROLES} from './garment-palette.mjs';
export const APPEARANCE_VERSION = 2;
export const APPEARANCE_PROMPT = `
For EACH garment, describe observed color and construction before naming it.
Preserve the photographed white balance: do not turn taupe/beige into pink,
dark teal into green/cyan, olive into grey/white, or charcoal denim into silver.
Distinguish base fabric, wash/fading, stripes/print, trim and hardware colors.
Never sample a hanger, skin, wall, background, shadow crease or specular highlight.
colorDetail must describe hue, depth, saturation, undertone, finish and wash.
fabricTexture describes visible weave/knit, grain, slub, heather, sheen and drape.
Material fibre composition cannot be proven from an image: leave it empty or
qualify it as an estimate. Never invent a cotton blend, weave ratio or weight.
technical3DDetails must describe ONLY visible construction: collar/waistband,
fasteners, pocket count/placement, hem/length, sleeves, print layout and exact
readable lettering. Use "not visible" for hidden details. Never invent pockets,
extend a cropped hem, unfold unseen fabric, taper straight legs, add rib cuffs,
or substitute a standard shirt-tail for a straight camp-collar shirt hem.
For each clothing entry ALSO return:
"visualProfile": {
  "lightingNotes": "observed lighting/cast; do not guess an unseen true color",
  "materialConfidence": "high|medium|low|unknown",
  "uncertainties": ["specific details not reliably visible"],
  "colors": [{"role":"base|secondary|print|trim|hardware|wash|embroidery|panel",
    "region":"visible component and color region", "name":"precise observed shade", "point":[500,500], "confidence":"high"}]
}
point is [y,x] in 0..1000 relative to THIS WHOLE supplied image, not the garment
box. Select up to 12 points covering EVERY distinct visible color region, including
small contrasting prints, embroidery, borders, panels, trim and hardware. Include
base fabric samples under representative light. For multicolor fabric, never
collapse colors into a single average or choose only the dominant shade.
This applies to all clothing, draped garments and separate pieces of sets.
Each point must lie well inside its fabric/color region. Omit uncertain
points. Do not output invented hex codes; the app measures source RGB itself.
Use the same observed shade in primaryColor, title, colorDetail and description.
`;

const text = (value, max = 240) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
const normalizedRole = value => ({primary:'base',dominant:'base',accent:'secondary'}[String(value||'').toLowerCase()]||String(value||'').toLowerCase());
const reliableConfidence = value => String(value||'').toLowerCase()==='high'||(typeof value==='number'&&Number.isFinite(value)&&value>=.8);
const normalizedPoint = value => Array.isArray(value)&&value.length===2?value:(value&&typeof value==='object'?[value.y,value.x]:null);
export function normalizeVisualProfile(value = {}) {
  return {
    lightingNotes: text(value?.lightingNotes),
    materialConfidence: ['high','medium','low','unknown'].includes(value?.materialConfidence) ? value.materialConfidence : 'unknown',
    uncertainties: Array.isArray(value?.uncertainties) ? value.uncertainties.map(v => text(v, 160)).filter(Boolean).slice(0, 6) : [],
    colors: (Array.isArray(value?.colors) ? value.colors : []).map(color => {
      const role=normalizedRole(color?.role),point=normalizedPoint(color?.point);
      if(!PALETTE_ROLES.includes(role)||!reliableConfidence(color?.confidence)||!point?.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<1000))return null;
      return {role,region:text(color.region,48),name:text(color.name,60),point:point.map(Math.round),confidence:'high'};
    }).filter(Boolean).slice(0,12),
  };
}

export function samplePatchHex(data, width, height, point, radius = 2) {
  const cy = Math.round(point[0] / 1000 * (height - 1)), cx = Math.round(point[1] / 1000 * (width - 1));
  const channels = [[], [], []];
  for (let y = Math.max(0, cy-radius); y <= Math.min(height-1, cy+radius); y++) {
    for (let x = Math.max(0, cx-radius); x <= Math.min(width-1, cx+radius); x++) {
      const offset = (y*width+x)*4;
      if (data[offset+3] < 250) continue;
      channels.forEach((channel, index) => channel.push(data[offset+index]));
    }
  }
  if (!channels[0].length) return '';
  return '#' + channels.map(channel => channel.sort((a,b)=>a-b)[Math.floor(channel.length/2)].toString(16).padStart(2,'0')).join('').toUpperCase();
}

export async function imageFingerprint(blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n=>n.toString(16).padStart(2,'0')).join('');
}

export async function attachPhotoEvidence(imageBlob, garments) {
  const bitmap = await createImageBitmap(imageBlob, {imageOrientation:'from-image', colorSpaceConversion:'default'});
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', {colorSpace:'srgb', willReadFrequently:true});
    ctx.drawImage(bitmap,0,0);
    const {data} = ctx.getImageData(0,0,canvas.width,canvas.height);
    const sourceFingerprint = await imageFingerprint(imageBlob);
    for (const garment of garments) {
      const profile = normalizeVisualProfile(garment.visualProfile);
      const box = garment.boundingBox;
      const inside=point=>!box||(point[0]>Math.max(0,box[0]-60)&&point[0]<Math.min(1000,box[2]+60)&&point[1]>Math.max(0,box[1]-60)&&point[1]<Math.min(1000,box[3]+60));
      profile.colors = profile.colors.map(color=>{
        let point=color.point;
        // Vision models occasionally return [x,y] despite the requested [y,x].
        // Correct only when the swapped point is consistent with the garment box.
        if(box&&!inside(point)&&inside([point[1],point[0]]))point=[point[1],point[0]];
        if(!inside(point))return null;
        const hex=samplePatchHex(data,canvas.width,canvas.height,point);return hex?{...color,point,hex}:null;
      }).filter(Boolean);
      garment.visualProfile = {...profile,version:APPEARANCE_VERSION,sourceFingerprint};
    }
    return garments;
  } finally { bitmap.close(); }
}

export function hasCompleteAppearance(item) {
  const profile = item?.visualProfile, tech = item?.technical3DDetails;
  return profile?.version === APPEARANCE_VERSION && /^[a-f0-9]{64}$/.test(profile.sourceFingerprint || '') &&
    profile.colors?.some(color=>color.role==='base' && /^#[A-Fa-f0-9]{6}$/.test(color.hex || '')) &&
    Boolean(item.colorDetail && item.fabricTexture && tech?.collarOrWaistband && tech?.garmentLengthAndHem && tech?.closuresAndHardware && tech?.pocketsAndDetails);
}
