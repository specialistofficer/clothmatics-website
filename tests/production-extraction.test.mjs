import test from 'node:test';
import assert from 'node:assert/strict';
import {activePremium,extractSingleProduction,recoverSingleProduction,extractRegionsProduction} from '../production-extraction.mjs';
const blob=new Blob(['source']);
const cutout=new Blob(['cutout']);
const regions=[0,1,2].map(i=>({type:'top',label:`Item ${i}`,boundingBox:[10+i*100,10,100+i*100,900],visibility:'full',visibleFraction:1}));
test('only unexpired verified premium permits cloud routing',async()=>{
  assert.equal(activePremium({plan:'premium',premiumUntil:101},100),true);
  for(const sub of [null,{plan:'free',premiumUntil:101},{plan:'premium',premiumUntil:100},{plan:'premium'}])assert.equal(activePremium(sub,100),false);
  let cloudCalls=0;
  const result=await extractSingleProduction(null,blob,{}, {cloud:()=>{cloudCalls++;},local:async()=>({ok:true,items:[{uri:cutout,width:300,height:400}]})});
  assert.equal(cloudCalls,0);assert.equal(result.blob,cutout);assert.equal(result.diagnostics.engine,'on_device');
});
test('premium cloud failure invokes local extraction and preserves source',async()=>{
  let localCalls=0;
  const result=await extractSingleProduction({},blob,{premium:true},{cloud:async()=>{throw Object.assign(Error('unavailable'),{status:503});},local:async source=>{assert.equal(source,blob);localCalls++;return {ok:true,items:[{uri:cutout}]};}});
  assert.equal(localCalls,1);assert.equal(result.blob,cutout);
});
test('batch circuit keeps successful cloud images and fills failures with one full-context local pass',async()=>{
  let cloudCalls=0,localCalls=0;
  const cloudBlob=new Blob(['cloud']);
  const result=await extractRegionsProduction({},blob,regions,{premium:true},{cloud:async(_u,_b,options)=>{assert.equal(options.regions,regions);if(cloudCalls++===0)return {blob:cloudBlob};throw Object.assign(Error('down'),{status:503});},local:async(_b,options)=>{localCalls++;assert.equal(options.regions,regions);return {items:[0,1,2].map(sourceIndex=>({sourceIndex,uri:cutout}))};}});
  assert.equal(cloudCalls,2);assert.equal(localCalls,1);assert.equal(result.items.length,3);assert.equal(result.items[0].blob,cloudBlob);assert.equal(result.items[1].blob,cutout);
});
test('hidden and invalid regions never trigger either inference engine',async()=>{
  const result=await extractRegionsProduction({},blob,[{...regions[0],visibility:'mostly_hidden'},{...regions[1],boundingBox:[]}],{premium:true},{cloud:()=>assert.fail(),local:()=>assert.fail()});
  assert.equal(result.items.length,0);assert.equal(result.skipped.length,2);
});
test('quality rejection stays per region, while local failure leaves other cloud successes reviewable',async()=>{
  let calls=0;
  const result=await extractRegionsProduction({},blob,regions,{premium:true},{cloud:async()=>{if(calls++===0)throw Object.assign(Error('quality'),{status:422});return {blob:cutout};},local:async()=>{throw Error('Unsupported browser');}});
  assert.equal(calls,3);assert.deepEqual(result.items.map(i=>i.index),[1,2]);assert.equal(result.skipped[0].index,0);
});
test('cancelled requests never fall back or save original',async()=>{
  await assert.rejects(extractSingleProduction({},blob,{premium:true},{cloud:async()=>{throw new DOMException('Aborted','AbortError');},local:()=>assert.fail()}),{name:'AbortError'});
});
test('single recovery runs generous crop then light-fabric retry locally',async()=>{
  const crop=new Blob(['crop']);let attempts=0;
  const result=await recoverSingleProduction(blob,{boundingBox:regions[0].boundingBox},{},{crop:async(_b,box,padding)=>{assert.equal(padding,.22);return {blob:crop};},local:async(input,options)=>{assert.equal(input,crop);if(attempts++===0)return {ok:false,items:[]};assert.equal(options.preserveLightFabric,true);return {ok:true,items:[{uri:cutout}]};}});
  assert.equal(attempts,2);assert.equal(result.blob,cutout);
});
