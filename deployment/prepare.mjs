import {readdir,copyFile,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.');
const target=join(root,'.deploy','site');
await mkdir(target,{recursive:true});
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isFile()&&(/\.(?:html|css|js|mjs|xml)$/.test(entry.name)||['_headers','robots.txt','llms.txt','wrangler.toml'].includes(entry.name)))await copyFile(join(root,entry.name),join(target,entry.name));
}
for(const name of ['assets','data','functions'])await cp(join(root,name),join(target,name),{recursive:true});
await mkdir(join(target,'downloads'),{recursive:true});
for(const name of ['clothmatics_ghost_v9.py','clothmatics_ghost_v9.ipynb','clothmatics_ghost_v9_2.py','clothmatics_ghost_v9_2.ipynb']){
 const bytes=await readFile(join(root,'kaggle',name));
 await writeFile(join(target,'downloads',name),bytes);
 console.log(`${name} SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
// Every compatibility URL and the embedded direct-run cell must serve the
// current reviewed runner, even when an older filename remains bookmarked.
const python=await readFile(join(root,'kaggle','clothmatics_ghost_v9_2.py'));
await writeFile(join(target,'downloads','clothmatics_ghost_v9.txt'),python);
console.log(`clothmatics_ghost_v9.txt SHA256 ${createHash('sha256').update(python).digest('hex')}`);
await writeFile(join(target,'downloads','clothmatics_ghost_v9_source.js'),python);
console.log(`clothmatics_ghost_v9_source.js SHA256 ${createHash('sha256').update(python).digest('hex')}`);
await writeFile(join(target,'clothmatics_ghost_v9_source.js'),python);
console.log(`root clothmatics_ghost_v9_source.js SHA256 ${createHash('sha256').update(python).digest('hex')}`);
await writeFile(join(target,'clothmatics_ghost_v9_source.mjs'),python);
console.log(`root clothmatics_ghost_v9_source.mjs SHA256 ${createHash('sha256').update(python).digest('hex')}`);
const sourceText=new TextDecoder().decode(python);
const route=`const CODE=${JSON.stringify(sourceText)};\nexport function onRequestGet(){return new Response(CODE,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}\n`;
await mkdir(join(target,'functions','api'),{recursive:true});
await writeFile(join(target,'functions','api','kaggle-source.js'),route);
console.log(`Pages Function /api/kaggle-source SHA256 ${createHash('sha256').update(python).digest('hex')}`);
const appPath=join(target,'app.js');
const app=await readFile(appPath,'utf8');
const encoded=Buffer.from(python).toString('base64');
await writeFile(appPath,`${app}\n/*__CLOTHMATICS_KAGGLE_SOURCE_BASE64_START__${encoded}__CLOTHMATICS_KAGGLE_SOURCE_BASE64_END__*/\n`);
console.log(`app.js embedded Kaggle source SHA256 ${createHash('sha256').update(python).digest('hex')}`);
console.log('Prepared website assets and Pages Functions in '+target);
