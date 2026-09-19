import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWornOutfit,outfitGhostCategory,usesWornOutfitPreparation} from '../outfit-intake.mjs';
import {normalizeFootwearOutline} from '../footwear-outline.mjs';
import {OUTFIT_INTAKE_PROMPT,STYLE_CHECK_PROMPT,parseStyleCheckAnalysis} from '../garment-upload.mjs';
import {readFile} from 'node:fs/promises';

const source=new Blob(['selfie']);
const clothing=[{title:'Black and blue polo',category:'Top',subCategory:'Polo Shirt'},
  {title:'Black shorts',category:'Bottom',subCategory:'Shorts'},
  {title:'Coral trainers',category:'Shoes',subCategory:'Running shoes'}];
const regions=clothing.map((_,index)=>({boundingBox:[index*200,100,index*200+150,900]}));
const cutouts=clothing.map((_,index)=>({index,blob:new Blob([`cutout-${index}`]),diagnostics:{engine:'test',garmentOnly:true}}));
const extract=async(user,blob,input,options)=>{
  assert.ok(user);assert.equal(blob,source);assert.equal(input,regions);assert.equal(options.premium,true);
  return {items:cutouts,skipped:[]};
};

test('selfie extracts with whole-photo context, generates two clothes and retains the shoe pair as cutout',async()=>{
  const calls=[];
  const result=await prepareWornOutfit({},source,clothing,regions,{generate3d:true,premium:true},{extract,
    generate:async(_user,blob,metadata,options)=>{
      const index=calls.length;assert.equal(blob,cutouts[index].blob);assert.equal(options.requireSourceMatch,true);
      calls.push(metadata.subCategory);return {blob:new Blob(['render']),quality:{passed:true}};
    }});
  assert.deepEqual(calls,['Polo Shirt','Shorts']);assert.equal(result.items.length,3);
  assert.equal(result.items[0].originalBlob,cutouts[0].blob);
  assert.equal(result.items[2].blob,cutouts[2].blob);assert.equal(result.items[2].ghostPrepared,undefined);
});
test('clothes of different families get clothing routing; footwear never inherits a stale shirt subtype',()=>{
  for(const [type,expected] of [['Dress','dress'],['Skirt','skirt'],['Kurta','kurta'],['Jumpsuit','jumpsuit'],['Leggings','leggings']])
    assert.equal(outfitGhostCategory({category:type}),expected);
  for(const type of ['Shoes','Footwear','Sneakers','Boots','Sandals','Bag'])
    assert.equal(outfitGhostCategory({category:type,subCategory:'Shirt'}),null);
});
test('rejected 3D retains original cutout, continues other items and never mutates detector evidence',async()=>{
  let calls=0;
  const result=await prepareWornOutfit({},source,clothing,regions,{generate3d:true,premium:true},{extract,
    generate:async(_user,_blob,metadata)=>{metadata.title='Reanalyzed';if(calls++===0)throw Object.assign(Error('Color mismatch'),{code:'quality_rejected'});return {blob:new Blob(['render'])};}});
  assert.equal(calls,2);assert.equal(result.items[0].blob,cutouts[0].blob);
  assert.equal(result.items[0].ghostPrepared,undefined);assert.ok(result.items[1].ghostPrepared);
  assert.equal(clothing[0].title,'Black and blue polo');
});
test('extract-only mode preserves every prepared cutout and never calls the GPU',async()=>{
  const result=await prepareWornOutfit({},source,clothing,regions,{generate3d:false,premium:true},{extract,generate:()=>assert.fail()});
  assert.equal(result.items.length,3);assert.ok(result.items.every(item=>!item.ghostPrepared));
});
test('offline generation keeps all cutouts without repeatedly hitting the unavailable GPU',async()=>{
  let calls=0;
  const result=await prepareWornOutfit({},source,clothing,regions,{generate3d:true,premium:true},{extract,
    generate:async()=>{calls++;throw Object.assign(Error('Offline'),{status:503});}});
  assert.equal(calls,1);assert.equal(result.items.length,3);assert.ok(result.items.every(item=>!item.ghostPrepared));
});
test('cancellation cannot turn into a successful cutout fallback',async()=>{
  await assert.rejects(prepareWornOutfit({},source,clothing,regions,{generate3d:true,premium:true},{extract,
    generate:async()=>{throw new DOMException('Aborted','AbortError');}}),{name:'AbortError'});
});
test('photo context is explicit and unrecognized or absent context stays unknown',()=>{
  for(const context of ['worn','flat_lay','hanging','unknown','invented',undefined]){
    const body={candidates:[{content:{parts:[{text:JSON.stringify({photoContext:context,clothing:[]})}]}}]};
    assert.equal(parseStyleCheckAnalysis(body).photoContext,['worn','flat_lay','hanging'].includes(context)?context:'unknown');
  }
});
test('intake prompt explicitly requests context and source-pixel shoe geometry',()=>{
  assert.match(STYLE_CHECK_PROMPT,/"photoContext": ""/);
  assert.match(STYLE_CHECK_PROMPT,/"footwearOutline": \{/);
  assert.match(OUTFIT_INTAKE_PROMPT,/For each Shoes entry/i);
  assert.match(OUTFIT_INTAKE_PROMPT,/coordinates[\s\S]*WHOLE image/i);
  assert.match(OUTFIT_INTAKE_PROMPT,/TWO[\s\S]*polygons when a pair is visible/i);
  assert.match(OUTFIT_INTAKE_PROMPT,/do not invent edges/i);
});
test('flat-lay and hanger photos retain direct generation while worn context is routed separately',()=>{
  assert.equal(usesWornOutfitPreparation('flat_lay'),false);
  assert.equal(usesWornOutfitPreparation('hanging'),false);
  assert.equal(usesWornOutfitPreparation('worn'),true);
  assert.equal(usesWornOutfitPreparation('unknown'),true);
});
test('3D worn intake calls the full-photo Kaggle route and keeps Oracle for extract-only intake',async()=>{
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(source,/ghostRequested\?await generateGhostOutfitFromPhoto\(state\.user,normalized\.blob,clothing/);
  assert.match(source,/\):await prepareWornOutfit\(state\.user,normalized\.blob,clothing,regions/);
});
test('a verified pair outline recovers failed footwear extraction using source pixels without a GPU call',async()=>{
  const shoe={...clothing[2],footwearOutline:{confidence:'high'}};
  const refined=new Blob(['shoe pair']);let calls=0;
  const result=await prepareWornOutfit({},source,[shoe],[regions[2]],{generate3d:true,premium:true},{
    extract:async()=>({items:[],skipped:[{index:0,message:'failed'}]}),
    footwear:async(blob,metadata)=>{assert.equal(blob,source);assert.equal(metadata,shoe);calls++;return {blob:refined};},
    generate:()=>assert.fail('Footwear is never generated'),
  });
  assert.equal(calls,1);assert.equal(result.items[0].blob,refined);assert.equal(result.skipped.length,0);
});
test('outline validation rejects missing shoe, uncertain and out-of-region geometry',()=>{
  const polygon=[[100,100],[100,140],[120,160],[140,160],[160,140],[160,100]];
  const outline={confidence:'high',visibleShoes:2,polygons:[polygon,polygon.map(([y,x])=>[y,x+100])],holes:[]};
  assert.ok(normalizeFootwearOutline(outline,[90,90,180,280]));
  assert.equal(normalizeFootwearOutline({...outline,confidence:'low'},[90,90,180,280]),null);
  assert.equal(normalizeFootwearOutline({...outline,polygons:[polygon]},[90,90,180,280]),null);
  assert.equal(normalizeFootwearOutline(outline,[500,500,900,900]),null);
});
