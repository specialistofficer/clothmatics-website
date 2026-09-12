import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://clothmatics.pages.dev';
const hash=value=>createHash('sha256').update(value).digest('hex');
const paths=['index.html','app.js','garment-upload.mjs','garment-appearance.mjs','garment-palette.mjs','garment-taxonomy.mjs','garment-progress.mjs','garment-review.mjs','garment-studio.css','ghost-contract.mjs','ghost-mannequin.mjs','ghost-studio.mjs','ghost-ui.mjs','downloads/clothmatics_ghost_v9.py','downloads/clothmatics_ghost_v9.ipynb','downloads/clothmatics_ghost_v9_2.py','downloads/clothmatics_ghost_v9_2.ipynb'];
const results=await Promise.all(paths.map(async path=>{
 const r=await fetch(`${origin}/${path}?verify=${Date.now()}`,{signal:AbortSignal.timeout(20000)});
 const bytes=Buffer.from(await r.arrayBuffer());
 const equal=r.ok&&hash(bytes)===hash(await readFile(`.deploy/site/${path}`));
 return{path,status:r.status,exactMatch:equal,cache:r.headers.get('cache-control')};
}));
for(const row of results)console.log(JSON.stringify(row));
const kaggleSource=await fetch(`${origin}/api/kaggle-source?verify=${Date.now()}`,{signal:AbortSignal.timeout(20000)});
const kaggleSourceBytes=Buffer.from(await kaggleSource.arrayBuffer());
const kaggleSourceMatches=kaggleSource.ok&&hash(kaggleSourceBytes)===hash(await readFile('kaggle/clothmatics_ghost_v9_2.py'));
console.log(JSON.stringify({kaggleSourceStatus:kaggleSource.status,kaggleSourceMatches}));
const gate=await fetch(origin+'/api/wardrobe/ghost',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
console.log(JSON.stringify({pagesGhostUnauthenticatedStatus:gate.status}));
const worker='https://clothmatics-ghost.chiragsharma376.workers.dev';
for(const method of ['GET','POST']){
 const r=await fetch(worker+'/set-target',{method,...(method==='POST'?{body:'{}',headers:{'Content-Type':'application/json'}}:{})});
 console.log(JSON.stringify({registrationMethod:method,status:r.status,expected:method==='GET'?405:401}));
 if(r.status!==(method==='GET'?405:401))process.exitCode=1;
}
const health=await fetch(worker+'/health',{signal:AbortSignal.timeout(15000)});
const data=await health.json();console.log(JSON.stringify({workerHealth:health.status,status:data.status,backendVersion:data.backend_response?.pipeline_version,contract:data.backend_response?.ghost_contract_version??null,backendReady:data.backend_response?.ready??null}));
if(results.some(row=>!row.exactMatch)||!kaggleSourceMatches||gate.status!==401)process.exitCode=1;
