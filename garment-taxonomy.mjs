// Describe visible construction, independent of the wearer's gender.
export const SHAPE_RULES = {
  trousers:'Lower garment only, waistband to both hems. Preserve the exact rise, centered crotch seam, fly, inseams, two separate leg tubes, leg width and both hem openings; never add a torso or turn trousers into a jumpsuit.',
  trackpants:'Lower garment only, waistband to both hems. Preserve the exact elastic waist, drawcord, rise, crotch, two separate legs, pocket layout, leg silhouette and open or cuffed hems; never add an upper garment.',
  cargo:'Lower garment only, waistband to both hems. Preserve rise, fly, crotch, two separate legs and every visible cargo/hip/rear pocket with its placement and flap; never add a torso.',
  shorts:'Lower garment only, waistband to both short hems. Preserve rise, fly or drawcord, centered crotch, two separate leg openings, pocket layout and exact inseam length; never lengthen into trousers or add a torso.',
  top:'Preserve the exact observed top neckline, armholes, straps, sleeves and hem; do not add shirt collars or plackets.',
  knitwear:'Preserve the knit pattern, ribbing, neckline, sleeve or sleeveless construction and hem.',
  robe:'Preserve the visible long flowing silhouette, wrap or front opening, belt, panels and coverage.',
  draped:'Preserve the photographed wrapped fabric, folds, borders and coverage; do not stitch it into trousers or invent hidden drape.',
  clothing_set:'Preserve exactly the visible separate garment pieces, lengths and layering; never fuse pieces or invent missing garments.',
  sleepwear:'Preserve exactly the photographed nightwear pieces, straps, closures, coverage and lengths.',
  skirt:'Lower garment only. Preserve skirt flare, pleats, layers and hem; never split into trouser legs.',
  leggings:'Lower garment only, waistband to both hems. Preserve close-fitting stretch construction.',
  saree:'Preserve the visible saree drape, pleats, pallu and border; do not turn draped cloth into a stitched dress or invent hidden pieces.',
  lehenga:'Preserve the visible flared skirt, layers, border and any photographed set pieces; do not invent missing pieces.',
  kurta:'Preserve tunic length, side slits, neckline and embroidery; never shorten to a western shirt.',
  sherwani:'Preserve long coat panels, collar, closures and embroidery; do not shorten or add unseen trousers.',
  traditional_set:'Preserve exactly the photographed set pieces, their separate layers, drape and borders; never fuse or add pieces.',
  jumpsuit:'Keep the continuous one-piece bodice and divided legs, waistband and closures.',
  romper:'Keep the continuous one-piece bodice and short divided legs; preserve inseam length.',
  blouse:'Preserve the observed blouse cut, neckline, sleeves, ties and hem; never add a standard shirt placket.',
  cardigan:'Preserve knit texture, opening, closures, neckline and length.',
  swimwear:'Preserve the exact visible one-piece or separate-piece construction, straps and coverage.',
  innerwear:'Preserve the photographed garment pieces, straps, cups, seams, elastic and coverage.',
  scarf:'Preserve draped or folded fabric, length, borders and fringe; do not add a torso garment.',
};
export const CATEGORIES=['shirt','tshirt','trackpants','trousers','cargo','hoodie','jacket','dress','shorts',...Object.keys(SHAPE_RULES)];
export const LOWER_CATEGORIES=['trackpants','trousers','cargo','shorts','skirt','leggings'];
export function extendedCategory(cat){
  if(cat==='clothing set'||/\b(co ord|co ords|tracksuit|pantsuit|trouser suit|two piece suit)\b/.test(cat))return 'clothing_set';
  if(cat==='draped'||/\b(dhoti|lungi|sarong)\b/.test(cat))return 'draped';
  if(/\b(robe|abaya|kaftan|kimono)\b/.test(cat))return 'robe';
  if(/\b(sleepwear|nightwear|nightdress|nightgown|pyjamas?|pajamas?)\b/.test(cat))return 'sleepwear';
  if(/\b(knitwear|sweater|pullover|sweater vest)\b/.test(cat))return 'knitwear';
  if(cat==='top'||/\b(tank top|crop top|vest|waistcoat|bustier)\b/.test(cat))return 'top';
  if (/\b(kurta set|salwar|shalwar|churidar|anarkali|traditional set|lehenga set|suit set)\b/.test(cat)) return 'traditional_set';
  for(const [pattern,category] of [
    [/\b(saree|sari)\b/,'saree'],[/\blehenga\b/,'lehenga'],[/\b(kurta|kurti|tunic)\b/,'kurta'],
    [/\bsherwani\b/,'sherwani'],[/\bjumpsuit\b/,'jumpsuit'],[/\bromper\b/,'romper'],
    [/\bskirt\b/,'skirt'],[/\b(leggings?|tights)\b/,'leggings'],[/\bblouse\b/,'blouse'],
    [/\bcardigan\b/,'cardigan'],[/\b(swimwear|swimsuit|bikini|swim trunks)\b/,'swimwear'],
    [/\b(innerwear|underwear|bra|briefs|boxers|lingerie|camisole)\b/,'innerwear'],[/\b(scarf|dupatta|shawl)\b/,'scarf'],
  ]) if(pattern.test(cat))return category;
  return null;
}
