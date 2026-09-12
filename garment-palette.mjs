export const PALETTE_ROLES=['base','secondary','print','trim','hardware','wash','embroidery','panel'];
// Bounded structured evidence. Invalid entries fail rather than silently losing colors.
export function normalizePalette(value=[]){
  if(!Array.isArray(value)||value.length>12)throw Error('Invalid garment palette. Analyze the photo again.');
  return value.map(c=>{
    if(!PALETTE_ROLES.includes(c?.role)||!/^#[a-f\d]{6}$/i.test(c?.hex||''))throw Error('Invalid garment color sample.');
    const region=typeof c.region==='string'?c.region.replace(/[^a-zA-Z0-9 ,/-]/g,' ').trim().slice(0,48):'';
    return {role:c.role,hex:c.hex.toUpperCase(),region};
  });
}
