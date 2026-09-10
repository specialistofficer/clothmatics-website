import * as ort from '../vendor/ort.wasm.min.mjs';
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths=new URL('../vendor/',import.meta.url).href;
const sessions=new Map();
export const makeTensor=(type,data,dims)=>new ort.Tensor(type,data,dims);
async function session(name) {
  if(!sessions.has(name)) sessions.set(name,(async()=>{
    const base=new URL('../',import.meta.url);
    const manifest=await (await fetch(new URL('models.json',base))).json();
    const spec=manifest[name];if(!spec)throw Error('Unsupported extraction model.');
    const parts=[];
    for(const chunk of spec.chunks){const r=await fetch(new URL(chunk,base));if(!r.ok)throw Error('Could not download extraction model.');parts.push(new Uint8Array(await r.arrayBuffer()));}
    const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==spec.sha256)throw Error('Extraction model integrity check failed.');
    return ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  })().catch(error=>{sessions.delete(name);throw error;}));
  return sessions.get(name);
}
export async function runSingleInput(name,tensor){const s=await session(name);const result=await s.run({[s.inputNames[0]]:tensor});return result[s.outputNames[0]];}
export async function run(name,feeds){return (await session(name)).run(feeds);}
