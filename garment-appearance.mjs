// Evidence measured on the uploaded photograph, never inferred from a title or
// from generated pixels. Coordinates are supplied by vision; RGB is sampled here.
export const APPEARANCE_VERSION = 1;
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
  "colors": [{"role":"base|secondary|print|trim|hardware|wash",
    "name":"precise observed shade", "point":[500,500], "confidence":"high"}]
}
point is [y,x] in 0..1000 relative to THIS WHOLE supplied image, not the garment
box. Select 2-4 well-lit points inside the base fabric and at most 3 other color
points. Each point must lie well inside its fabric/color region. Omit uncertain
points. Do not output invented hex codes; the app measures source RGB itself.
Use the same observed shade in primaryColor, title, colorDetail and description.
`;

const text = (value, max = 240) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
export function normalizeVisualProfile(value = {}) {
  return {
    lightingNotes: text(value?.lightingNotes),
    materialConfidence: ['high','medium','low','unknown'].includes(value?.materialConfidence) ? value.materialConfidence : 'unknown',
    uncertainties: Array.isArray(value?.uncertainties) ? value.uncertainties.map(v => text(v, 160)).filter(Boolean).slice(0, 6) : [],
    colors: (Array.isArray(value?.colors) ? value.colors : []).filter(color =>
      ['base','secondary','print','trim','hardware','wash'].includes(color?.role) &&
      color.confidence === 'high' && Array.isArray(color.point) && color.point.length === 2 &&
      color.point.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1000)
    ).slice(0, 7).map(color => ({role: color.role, name: text(color.name, 60), point: color.point.map(Math.round), confidence: 'high'})),
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
      profile.colors = profile.colors.filter(({point:[y,x]}) => !box || (y>box[0] && y<box[2] && x>box[1] && x<box[3]))
        .map(color => ({...color,hex:samplePatchHex(data,canvas.width,canvas.height,color.point)})).filter(color=>color.hex);
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
