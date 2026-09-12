import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/ghost/index.mjs';
const token='test-only-sync-token-12345';
const target='https://example-tunnel.trycloudflare.com';
const env=()=>({CLOTHMATICS_SYNC_TOKEN:token,GHOST_CONFIG:{get:async()=>target,put:async()=>{throw Error('Unexpected target mutation');}}});
test('Ghost Worker refuses unauthenticated target changes without mutating KV',async()=>{
 for(const method of ['GET','POST']){
  const request=new Request('https://ghost/set-target?url=https://changed.trycloudflare.com',{method});
  assert.equal((await worker.fetch(request,env(),{})).status,method==='GET'?405:401);
 }
});
test('Ghost Worker accepts only authenticated Quick Tunnel origins',async()=>{
 const state=env(),writes=[];state.GHOST_CONFIG.put=async(...args)=>writes.push(args);
 for(const url of ['http://example.trycloudflare.com','https://example.com','https://example.trycloudflare.com/evil','https://user:pass@example.trycloudflare.com','https://example.trycloudflare.com?x=1']){
  const r=await worker.fetch(new Request('https://ghost/set-target',{method:'POST',headers:{'X-Sync-Token':token},body:JSON.stringify({url})}),state,{});
  assert.equal(r.status,400);
 }
 const r=await worker.fetch(new Request('https://ghost/set-target',{method:'POST',headers:{'X-Sync-Token':token},body:JSON.stringify({url:target})}),state,{});
 assert.equal(r.status,200);assert.deepEqual(writes,[['TARGET_BACKEND_URL',target]]);
});
test('Ghost Worker forwards the full manifest and response contract but strips credentials',async()=>{
 const original=globalThis.fetch;
 try{
  const form=new FormData();form.set('manifest','{"colorAndFinish":"dark teal"}');form.set('contract_version','2');form.set('seed','123');form.set('image',new Blob(['example'],{type:'image/png'}),'garment.png');
  const req=new Request('https://ghost/generate',{method:'POST',headers:{Authorization:'private',Cookie:'private','X-Sync-Token':token},body:form});
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,target+'/generate');assert.equal(options.redirect,'manual');
   for(const key of ['authorization','cookie','x-sync-token'])assert.equal(options.headers.has(key),false);
   const data=await new Response(options.body,{headers:options.headers}).formData();
   assert.equal(data.get('manifest'),'{"colorAndFinish":"dark teal"}');assert.equal(data.get('contract_version'),'2');assert.equal(data.get('seed'),'123');
   return new Response('PNG',{headers:{'Content-Type':'image/png','X-Ghost-Contract-Version':'2'}});
  };
  const r=await worker.fetch(req,env(),{});assert.equal(r.status,200);assert.equal(r.headers.get('X-Ghost-Contract-Version'),'2');assert.equal(await r.text(),'PNG');
 }finally{globalThis.fetch=original;}
});
test('Ghost Worker rejects generator redirects',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.example'}});
 try{assert.equal((await worker.fetch(new Request('https://ghost/generate',{method:'POST',body:'image'}),env(),{})).status,502);}finally{globalThis.fetch=original;}
});
