import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATEGORIES,SHAPE_RULES} from '../garment-taxonomy.mjs';
import {ghostCategory,compileUniversalManifest,parseGhostQuality,hasGhostPhotoEvidence} from '../ghost-contract.mjs';
import {normalizePalette} from '../garment-palette.mjs';
import {normalizeVisualProfile,APPEARANCE_VERSION} from '../garment-appearance.mjs';

test('every canonical clothing category round-trips; shared Kaggle geometry matches website',()=>{
  for(const category of CATEGORIES)assert.equal(ghostCategory(category),category);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../kaggle/garment_shapes.json',import.meta.url))),SHAPE_RULES);
  for(const [name,expected] of [['Silk sari','saree'],['Embroidered salwar suit','traditional_set'],['Kurta set','traditional_set'],['Printed blouse','blouse'],['Denim jeans','trousers'],['Leggings','leggings']])assert.equal(ghostCategory({subCategory:name}),expected);
  assert.equal(ghostCategory('unknown'),null);
});

test('twelve independent color regions survive long descriptions without averaging or truncation',()=>{
  const palette=Array.from({length:12},(_,i)=>({role:i?'print':'base',hex:'#'+(0x112233+i*100).toString(16),region:`border ${i}`}));
  for(const category of ['shirt','saree','traditional_set','dress','jacket','skirt']){
    const compiled=compileUniversalManifest({category,palette,colorAndFinish:'long description '.repeat(150)});
    assert.deepEqual(compiled.manifest.palette,normalizePalette(palette));
  }
  assert.throws(()=>normalizePalette([...palette,palette[0]]));
  assert.throws(()=>normalizePalette([{role:'base',hex:'navy'}]));
  assert.throws(()=>normalizePalette([{role:'background',hex:'#FFFFFF'}]));
});

test('sampling keeps twelve regions including embroidery and ignores model hex',()=>{
  const colors=Array.from({length:12},(_,i)=>({role:i?'embroidery':'base',region:`piece ${i}`,point:[100+i*20,300],name:'gold',confidence:'high',hex:'#000000'}));
  const profile=normalizeVisualProfile({colors});
  assert.equal(profile.colors.length,12);
  assert.equal(profile.colors[11].region,'piece 11');
  assert.equal(profile.colors[11].hex,undefined);
  const tolerant=normalizeVisualProfile({colors:[{role:'primary',region:'main fabric',point:{y:420,x:510},name:'navy',confidence:.92}]});
  assert.deepEqual(tolerant.colors[0],{role:'base',region:'main fabric',name:'navy',point:[420,510],confidence:'high'});
});

test('bottom construction is explicit without changing the established top contract',()=>{
  const lower=compileUniversalManifest({category:'trousers',colorAndFinish:'near-black navy',surfaceTextureAndWeave:'woven twill',waistbandAndRise:'mid rise belt-loop waistband',flyAndClosure:'zip fly',crotchAndInseam:'centered front crotch and two inseams',legSilhouette:'two straight legs',hemAndCuffs:'two open hems',pocketLayout:'two front pockets'});
  assert.match(lower.prompt,/mid rise belt-loop waistband/);
  assert.match(lower.prompt,/centered front crotch and two inseams/);
  assert.match(lower.prompt,/two separate leg tubes/);
  assert.doesNotMatch(lower.prompt,/natural shoulder\/seat/);
  const top=compileUniversalManifest({category:'shirt',colorAndFinish:'navy',surfaceTextureAndWeave:'woven',waistbandAndRise:'must not leak'});
  assert.equal(top.manifest.waistbandAndRise,'');
  assert.doesNotMatch(top.prompt,/must not leak|two separate leg tubes/);
});

test('a passing average color cannot hide a bad, omitted or duplicate border verdict',()=>{
  const palette=[{role:'base',hex:'#223344'},{role:'trim',hex:'#EECCAA'}];
  const verdict={sameGarment:true,colorMatch:true,textureMatch:true,constructionMatch:true,graphicsMatch:true,emptyOpenings:true,confidence:.95,issues:[],colorRegions:[{id:0,match:true,confidence:.95},{id:1,match:true,confidence:.9}]};
  const parse=v=>parseGhostQuality({candidates:[{content:{parts:[{text:JSON.stringify(v)}]}}]},palette);
  assert.equal(parse(verdict).passed,true);
  for(const regions of [[],verdict.colorRegions.slice(0,1),[verdict.colorRegions[0],{id:1,match:false,confidence:.9}],[...verdict.colorRegions,verdict.colorRegions[1]]])assert.equal(parse({...verdict,colorRegions:regions}).passed,false);
});

test('bottom comparison requires two legs, rise/crotch and leg silhouette checks',()=>{
  const verdict={sameGarment:true,colorMatch:true,textureMatch:true,constructionMatch:true,graphicsMatch:true,emptyOpenings:true,twoLegsMatch:true,riseAndCrotchMatch:true,legSilhouetteMatch:true,confidence:.95,issues:[]};
  const body=value=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
  assert.equal(parseGhostQuality(body(verdict),[],'trousers').passed,true);
  for(const key of ['twoLegsMatch','riseAndCrotchMatch','legSilhouetteMatch'])assert.equal(parseGhostQuality(body({...verdict,[key]:false}),[],'trousers').passed,false);
  assert.equal(parseGhostQuality(body({...verdict,twoLegsMatch:false}),[],'shirt').passed,true);
});

test('cropped photo cannot reuse full-photo color evidence',()=>{
  const item={category:'shirt',colorDetail:'warm grey',fabricTexture:'woven',technical3DDetails:{collarOrWaistband:'collar',garmentLengthAndHem:'straight',closuresAndHardware:'buttons',pocketsAndDetails:'one'},visualProfile:{version:APPEARANCE_VERSION,sourceFingerprint:'a'.repeat(64),colors:[{role:'base',hex:'#AABBCC'}]}};
  assert.equal(hasGhostPhotoEvidence(item,'a'.repeat(64)),true);
  assert.equal(hasGhostPhotoEvidence(item,'b'.repeat(64)),false);
});
