import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const account='15ce83de50a68b491ea157f7ef871333';
const config=await readFile(join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('Wrangler OAuth login is required');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
await mkdir('.deploy-private',{recursive:true});
for(const [name,path] of [['project','/pages/projects/clothmatics'],['worker-settings','/workers/scripts/clothmatics-ghost/settings'],['worker-source','/workers/scripts/clothmatics-ghost']]){
 const response=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok){console.log(name,response.status);continue;}
 const body=await response.text();await writeFile(`.deploy-private/${name}.txt`,body);
 if(name==='project'){
  const p=JSON.parse(body).result;console.log(JSON.stringify({project:p.name,production_branch:p.production_branch,domains:p.domains,deployments:p.canonical_deployment?.id,bindings:Object.keys(p.deployment_configs?.production?.env_vars||{})}));
 }else if(name==='worker-settings'){
  const s=JSON.parse(body).result;console.log(JSON.stringify({worker:'clothmatics-ghost',settings:{compatibility_date:s.compatibility_date,bindings:s.bindings?.map(b=>({name:b.name,type:b.type})),tags:s.tags}}));
 }else console.log(JSON.stringify({workerSourceSaved:true,bytes:body.length,contentType:response.headers.get('content-type')}));
}
