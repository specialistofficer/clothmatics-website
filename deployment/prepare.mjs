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
for(const name of ['clothmatics_ghost_v9.py','clothmatics_ghost_v9.ipynb']){
 const bytes=await readFile(join(root,'kaggle',name));
 await writeFile(join(target,'downloads',name),bytes);
 console.log(`${name} SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
const python=await readFile(join(root,'kaggle','clothmatics_ghost_v9.py'));
await writeFile(join(target,'downloads','clothmatics_ghost_v9.txt'),python);
console.log(`clothmatics_ghost_v9.txt SHA256 ${createHash('sha256').update(python).digest('hex')}`);
console.log('Prepared website assets and Pages Functions in '+target);
