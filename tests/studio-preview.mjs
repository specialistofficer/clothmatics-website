import {createGhostStudio} from '../ghost-studio.mjs';
import {hangerLoaderMarkup,updateHangerLoader,confirmDelete3D} from '../garment-progress.mjs';
import {renderGarmentEvidence,readGarmentEvidence} from '../garment-review.mjs';
import {compileUniversalManifest} from '../ghost-contract.mjs';
import {attachPhotoEvidence,normalizeVisualProfile} from '../garment-appearance.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvas=document.createElement('canvas');canvas.width=500;canvas.height=580;const ctx=canvas.getContext('2d');ctx.fillStyle='#faf9fe';ctx.fillRect(0,0,500,580);ctx.fillStyle='#234f54';
ctx.beginPath();ctx.moveTo(155,60);ctx.lineTo(345,60);ctx.lineTo(390,515);ctx.lineTo(290,515);ctx.lineTo(250,240);ctx.lineTo(210,515);ctx.lineTo(110,515);ctx.closePath();ctx.fill();ctx.strokeStyle='#11383e';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#173f44';ctx.fillRect(155,60,190,24);ctx.strokeStyle='#e7debf';ctx.beginPath();ctx.moveTo(250,80);ctx.lineTo(240,133);ctx.moveTo(250,80);ctx.lineTo(260,137);ctx.stroke();
import {createGhostStudio} from '../ghost-studio.mjs';
import {hangerLoaderMarkup,updateHangerLoader,confirmDelete3D} from '../garment-progress.mjs';
import {renderGarmentEvidence,readGarmentEvidence} from '../garment-review.mjs';
import {compileUniversalManifest} from '../ghost-contract.mjs';
import {attachPhotoEvidence,normalizeVisualProfile} from '../garment-appearance.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canvas=document.createElement('canvas');canvas.width=500;canvas.height=580;const ctx=canvas.getContext('2d');ctx.fillStyle='#faf9fe';ctx.fillRect(0,0,500,580);ctx.fillStyle='#234f54';
ctx.beginPath();ctx.moveTo(155,60);ctx.lineTo(345,60);ctx.lineTo(390,515);ctx.lineTo(290,515);ctx.lineTo(250,240);ctx.lineTo(210,515);ctx.lineTo(110,515);ctx.closePath();ctx.fill();ctx.strokeStyle='#11383e';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#173f44';ctx.fillRect(155,60,190,24);ctx.strokeStyle='#e7debf';ctx.beginPath();ctx.moveTo(250,80);ctx.lineTo(240,133);ctx.moveTo(250,80);ctx.lineTo(260,137);ctx.stroke();
const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),photo=URL.createObjectURL(png);
const evidence={title:'Dark teal textured trousers',category:'Bottom',subCategory:'Joggers',primaryColor:'Dark teal',colorDetail:'Deep muted teal with a blue undertone',fabricTexture:'Matte woven fabric with subtle slub grain',technical3DDetails:{fabricWeave:'Visible fine slub grain',collarOrWaistband:'Elastic waistband with a light drawcord',closuresAndHardware:'Off-white drawcord',pocketsAndDetails:'Two slanted hip pockets',garmentLengthAndHem:'Straight, full-length open hems',graphicsAndLogos:'None'},visualProfile:{version:2,sourceFingerprint:'a'.repeat(64),colors:[{role:'base',name:'Dark teal',hex:'#234F54'}],lightingNotes:'Soft light; source pixels remain authoritative',uncertainties:['Fibre composition cannot be confirmed from the photo.']}};
const item={id:'local',userId:'test',image:photo,...evidence,ghostMannequin:{image:photo,imageObjectKey:'old'}};
let mode='saved',failSave=false,counts={generate:0,verify:0,save:0},deleted=[];
const services={getGhostSource:async()=>png,analyzeGhostGarment:async()=>({...compileUniversalManifest({category:'trackpants',colorAndFinish:'Dark teal #234F54',surfaceTextureAndWeave:'Matte slub'}),metadata:evidence}),generateGhostGarment:async()=>{counts.generate++;await new Promise(resolve=>setTimeout(resolve,mode==='processing'?12000:15));return png;},verifyGhostResult:async()=>{counts.verify++;if(mode==='reject'){const error=Error('The 3D image did not pass the photo comparison. The generated garment changed color.');error.code='quality_rejected';throw error;}return{passed:true,version:1};},ghostStorageBlob:async()=>png,uploadGarmentImage:async()=>({imageUrl:photo,imageObjectKey:'new'}),deleteGarmentUpload:async(user,key)=>deleted.push(key),downloadGhostGarment:async()=>png};
const studio=createGhostStudio({getUser:()=>({uid:'test'}),getItem:()=>item,escapeHtml:escape,safeUrl:value=>value,onSaved:()=>{},services,save:async()=>{counts.save++;if(failSave){failSave=false;throw Error('Simulated storage failure. The previous 3D image remains saved.');}},onDelete:async()=>{if(await confirmDelete3D({title:item.title})){delete item.ghostMannequin;return true;}return false;}});
document.querySelector('#upload').insertAdjacentHTML('beforeend',hangerLoaderMarkup());updateHangerLoader(document.querySelector('#upload'),'Inspecting color, fabric and construction…');renderGarmentEvidence(document.querySelector('#review'),evidence,{visible:true});
function open(next){mode=next;failSave=next==='failure';item.ghostMannequin={image:photo,imageObjectKey:'old'};studio.open('local');if(next!=='saved')document.querySelector('[data-ghost-regenerate]').click();}
for(const id of ['saved','processing','reject','failure'])document.getElementById(id).onclick=()=>open(id);
document.getElementById('delete').onclick=()=>confirmDelete3D({title:item.title});
const results=document.querySelector('#results');
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('UI did not settle');};
document.getElementById('run').onclick=async()=>{
  const messages=[];const check=(value,message)=>{if(!value)throw Error(message);messages.push('PASS '+message);};
  try{
    const data={...evidence,visualProfile:normalizeVisualProfile({colors:[{role:'base',name:'teal',point:[200,400],confidence:'high'}]})};
    await attachPhotoEvidence(png,[data]);check(data.visualProfile.colors[0].hex==='#234F54','browser samples source RGB, not supplied text');
    check(data.visualProfile.sourceFingerprint.length===64,'source fingerprint is recorded');
    const review=document.querySelector('#review');review.querySelector('#upload-color-detail').value='Edited teal';readGarmentEvidence(review,data);check(data.colorDetail==='Edited teal','review edits persist to metadata');
    renderGarmentEvidence(review,{title:'Next item'},{visible:true});check(review.querySelector('#upload-color-detail').value==='','next item does not inherit previous color detail');renderGarmentEvidence(review,evidence,{visible:true});
    open('saved');check(getComputedStyle(document.querySelector('[data-ghost-retry]')).display==='none','saved studio hides retry');check(getComputedStyle(document.querySelector('[data-ghost-request]')).display==='none','saved studio hides admin action');
    open('failure');await until(()=>document.querySelector('.ghost-studio').getAttribute('aria-busy')==='false');
    check(!deleted.includes('old'),'failed replacement keeps previous object');const generated=counts.generate;document.querySelector('[data-ghost-retry]').click();await until(()=>document.querySelector('.ghost-studio').getAttribute('aria-busy')==='false');
    check(counts.generate===generated,'retry-save reuses candidate without generation');check(deleted.includes('old'),'old object cleaned only after successful commit');
    const saved=counts.save,generatedBeforeReject=counts.generate;open('reject');await until(()=>document.querySelector('.ghost-studio').getAttribute('aria-busy')==='false');check(counts.save===saved,'quality failure prevents persistence');
    check(counts.generate===generatedBeforeReject+2,'lower garment receives one automatic corrected generation');
    check(!document.querySelector('[data-ghost-result]').hidden,'rejected candidate remains visible for comparison');
    check(document.querySelector('[data-ghost-retry]').textContent==='Try another 3D image','rejected candidate offers a fresh generation');
    document.querySelector('.ghost-studio').close();
    const before=item.image,promise=confirmDelete3D({title:item.title});check(document.activeElement.textContent==='Keep image','delete defaults focus to Keep image');document.querySelector('.ghost-confirm button[value="cancel"]').click();check(await promise===false,'cancel does not delete');check(item.image===before,'original remains unchanged');
    results.textContent=messages.join('\n')+'\nAll browser checks passed.';
  }catch(error){results.textContent=messages.join('\n')+'\nFAIL '+error.message;}
};
