import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GARMENT_ANALYSIS_PROMPT, STYLE_CHECK_PROMPT, isGarmentExtractionReady, normalizeGarmentMetadata, parseGarmentAnalysis, parseStyleCheckAnalysis, validateGarmentFile } from "../garment-upload.mjs";

const uploadModule=readFileSync(new URL("../garment-upload.mjs",import.meta.url),"utf8");
const companionApp=readFileSync(new URL("../app.js",import.meta.url),"utf8");

test("garment prompt is a bounded single-item Style Check contract",()=>{
  assert.match(GARMENT_ANALYSIS_PROMPT,/Style Check/);
  assert.match(GARMENT_ANALYSIS_PROMPT,/exactly one clothing entry/);
  assert.match(GARMENT_ANALYSIS_PROMPT,/not image generation or editing/);
});

test("garment analysis strips unsafe text and chooses the dominant usable item",()=>{
  const body={candidates:[{content:{parts:[{text:JSON.stringify({clothing:[
    {title:"Tiny scarf",category:"Scarf",boundingBox:[100,100,200,200],extractionReady:false},
    {title:"<Navy> Linen Shirt",category:"Top",primaryColor:"Navy Blue",boundingBox:[80,80,900,900],extractionReady:true,occasion:["Office"]},
  ]})}]}}]};
  const result=parseGarmentAnalysis(body);
  assert.equal(result.title,"Navy Linen Shirt");
  assert.equal(result.category,"Top");
  assert.deepEqual(result.boundingBox,[80,80,900,900]);
  assert.deepEqual(result.occasion,["Office"]);
});

test("metadata and file validation reject incomplete or oversized input",()=>{
  assert.throws(()=>normalizeGarmentMetadata({title:"Shirt"}),/identifiable garment/);
  assert.throws(()=>validateGarmentFile({type:"image/gif",size:1000}),/JPEG, PNG or WebP/);
  assert.throws(()=>validateGarmentFile({type:"image/jpeg",size:7*1024*1024}),/smaller than 6 MB/);
});

test("Style Check uses the mobile result contract and normalizes its complete output",()=>{
  assert.match(STYLE_CHECK_PROMPT,/overallScore/);
  assert.match(STYLE_CHECK_PROMPT,/recommendations must contain exactly 5/);
  assert.match(STYLE_CHECK_PROMPT,/shoppingSuggestions/);
  assert.match(STYLE_CHECK_PROMPT,/A pair is ONE item/);
  assert.match(STYLE_CHECK_PROMPT,/open jacket showing a shirt still covers most of that shirt/);
  assert.match(STYLE_CHECK_PROMPT,/Flowers, bouquets, phones, bags/);
  const body={candidates:[{content:{parts:[{text:JSON.stringify({
    overallScore:104,
    confidence:91.6,
    style:"<Polished> Casual",
    occasion:"Brunch",
    colors:["Navy Blue","White"],
    recommendations:["Roll the sleeves","Add clean white shoes"],
    fashionTips:["Keep the silhouette balanced"],
    accessories:["Structured tote"],
    shoppingSuggestions:["Neutral loafer"],
    season:"Summer",
    formality:"Smart Casual",
    clothing:[{title:"Navy Linen Shirt",category:"Top",primaryColor:"Navy Blue",boundingBox:[40,80,590,920],occludedBy:"",extractionObstructions:["hand"]}],
  })}]}}]};
  const result=parseStyleCheckAnalysis(body);
  assert.equal(result.overallScore,100);
  assert.equal(result.confidence,92);
  assert.equal(result.style,"Polished Casual");
  assert.deepEqual(result.colors,["Navy Blue","White"]);
  assert.equal(result.clothing[0].title,"Navy Linen Shirt");
  assert.deepEqual(result.clothing[0].extractionObstructions,["hand"]);
});

test("Style Check applies the same accessory and colour cleanup as mobile",()=>{
  const body={candidates:[{content:{parts:[{text:JSON.stringify({clothing:[
    {title:"Brown Leather Belt",category:"Belt",boundingBox:[400,200,480,800]},
    {title:"Green Jacket",category:"Outerwear",primaryColor:"#328443",secondaryColors:["rgb(1,2,3)","#191f5e"],boundingBox:[100,100,700,900]},
  ]})}]}}]};
  const result=parseStyleCheckAnalysis(body);
  assert.equal(result.clothing.length,1);
  assert.equal(result.clothing[0].primaryColor,"Green");
  assert.deepEqual(result.clothing[0].secondaryColors,["Navy Blue"]);
});

test("Auto Extract uses the mobile visibility gate",()=>{
  assert.equal(isGarmentExtractionReady({visibility:"full",visibleFraction:1,extractionReady:false}),true);
  assert.equal(isGarmentExtractionReady({visibility:"partial",visibleFraction:.78,extractionReady:false}),true);
  assert.equal(isGarmentExtractionReady({visibility:"partial",visibleFraction:.5,extractionReady:true}),false);
  assert.equal(isGarmentExtractionReady({visibility:"mostly_hidden",visibleFraction:.9,extractionReady:true}),false);
});

test("web garment persistence keeps the mobile extraction and storage boundaries",()=>{
  assert.match(uploadModule,/checkGarmentImageBlur/);
  assert.match(uploadModule,/cropGarmentImage/);
  assert.match(uploadModule,/preserveLightFabric/);
  assert.match(uploadModule,/Oracle extraction timed out after 60 seconds/);
  assert.match(uploadModule,/outputWidth/);
  assert.match(uploadModule,/optimizeGarmentUpload/);
  assert.match(uploadModule,/backgroundRemoved \? 1000 : 1200/);
  assert.match(companionApp,/Promise\.allSettled\(\[analysisPromise,directPromise\]\)/);
  assert.match(companionApp,/original_fallback/);
  assert.match(companionApp,/sourceImageUrl/);
  assert.match(companionApp,/sourceAnalysisId/);
  assert.match(companionApp,/for\(const pending of createdUploads\)await deleteGarmentUpload/);
  assert.ok(companionApp.includes('createdUploads.push(original)'));
  assert.ok(companionApp.indexOf("upload=await uploadGarmentImage")<companionApp.indexOf("addDoc(collection(db,\"wardrobe\")"));
});

test("review metadata includes the mobile privacy and styling fields",()=>{
  for(const field of ["stylingUsage","privateItem","hiddenFromAI","userOccasions","activitySuitability","userConfirmed"]){
    assert.match(companionApp,new RegExp(field));
  }
  assert.match(companionApp,/private_innerwear/);
  assert.match(companionApp,/extractionMethod/);
  assert.match(companionApp,/processingFlow/);
});
