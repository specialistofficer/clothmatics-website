import {analyzeGhostGarment,buildGhostAnalysisFromItem,hasReusableGhostMetadata,generateGhostGarment,getGhostSource,verifyGhostResult,ghostStorageBlob,downloadGhostGarment} from './ghost-mannequin.mjs';
import {uploadGarmentImage,deleteGarmentUpload} from './garment-upload.mjs';
import {hangerLoaderMarkup,updateHangerLoader} from './garment-progress.mjs';

export function createGhostStudio({getUser,getItem,save,onSaved,onQuota,onRequestAdmin,onDelete,escapeHtml,safeUrl,services={}}){
  const api={analyzeGhostGarment,generateGhostGarment,getGhostSource,verifyGhostResult,ghostStorageBlob,downloadGhostGarment,uploadGarmentImage,deleteGarmentUpload,...services};
  const dialog=document.createElement('dialog');dialog.className='ghost-studio';dialog.setAttribute('aria-labelledby','ghost-studio-title');document.body.append(dialog);
  let current=null,controller=null,busy=false,saving=false,analysis=null,result=null,resultUrl=null,source=null,quality=null,replacement=false,expectedImage='';
  const status=message=>{dialog.querySelector('[data-ghost-status]').textContent=message;updateHangerLoader(dialog,message,busy);};
  const cleanup=()=>{controller?.abort();if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;};
  const resetResult=()=>{cleanup();analysis=null;result=null;source=null;quality=null;};
  function render(){
    const saved=current.ghostMannequin?.image;
    dialog.innerHTML=`<header class="ghost-header"><button type="button" class="dialog-close" data-ghost-close aria-label="Close 3D studio">×</button><span class="app-kicker">3D GARMENT STUDIO</span><h2 id="ghost-studio-title">${escapeHtml(current.title||'Your garment')}</h2><p>Compare your original with the AI-generated 3D image. Photo analysis and quality checks use your shared AI allowance.</p></header><div class="ghost-content"><div class="ghost-comparison"><figure><img src="${safeUrl(current.image)}" alt="Original garment"><figcaption>Original wardrobe photo</figcaption></figure><figure><img data-ghost-result ${saved?`src="${safeUrl(saved)}"`:'hidden'} alt="AI-generated 3D garment"><div data-ghost-placeholder ${saved?'hidden':''}>Your 3D image will appear here</div><figcaption>AI-generated 3D image</figcaption></figure></div>${hangerLoaderMarkup()}</div><footer class="ghost-footer"><p data-ghost-status role="status" aria-live="polite">${saved?'Your original and saved 3D image are available below.':'Ready to inspect your garment.'}</p><div class="ghost-actions"><button type="button" class="button button-primary" data-ghost-retry hidden>Retry</button><button type="button" class="button button-ghost" data-ghost-request hidden>Request admin generation</button><button type="button" class="button button-primary" data-ghost-regenerate>${saved?'Regenerate 3D':'Create 3D image'}</button><button type="button" class="button button-ghost" data-ghost-download ${saved?'':'hidden'}>Download 3D image</button><button type="button" class="button danger-button" data-ghost-delete ${saved?'':'hidden'}>Delete 3D image</button><button type="button" class="button button-ghost" data-ghost-close>Close</button></div></footer>`;
  }
  function setBusy(value){
    busy=value;dialog.setAttribute('aria-busy',String(value));
    dialog.querySelectorAll('.ghost-actions button:not([data-ghost-close])').forEach(button=>button.disabled=value);
    updateHangerLoader(dialog,dialog.querySelector('[data-ghost-status]').textContent,value);
  }
  async function run(){
    if(busy)return;const user=getUser(),item=current;if(!user)return;
    controller=new AbortController();const {signal}=controller;setBusy(true);
    dialog.querySelector('[data-ghost-retry]').hidden=true;dialog.querySelector('[data-ghost-request]').hidden=true;dialog.querySelector('[data-ghost-regenerate]').hidden=true;
    let upload=null;
    try{
      source??=await api.getGhostSource(user,item.id,{signal});
      if(!analysis){
        if(!replacement&&hasReusableGhostMetadata(item))analysis=buildGhostAnalysisFromItem(item);
        else{status('Inspecting the photo’s color, fabric and construction…');try{analysis=await api.analyzeGhostGarment(user,item.id,{signal,sourceBlob:source});}finally{onQuota?.();}}
      }
      if(!result){status('Creating your 3D garment… This can take a few minutes.');result=await api.generateGhostGarment(user,item.id,analysis,{signal});}
      if(!quality){
        status('Checking color, fabric, shape and empty openings…');
        try{quality=await api.verifyGhostResult(user,source,result,{signal});}
        catch(error){if(error.code==='quality_rejected'){result=null;quality=null;}throw error;}
        finally{onQuota?.();}
      }
      if(signal.aborted||getUser()?.uid!==user.uid)throw new DOMException('Aborted','AbortError');
      if(!resultUrl)resultUrl=URL.createObjectURL(result);
      const img=dialog.querySelector('[data-ghost-result]');img.src=resultUrl;img.hidden=false;dialog.querySelector('[data-ghost-placeholder]').hidden=true;
      saving=true;dialog.querySelectorAll('[data-ghost-close]').forEach(button=>button.disabled=true);status('Saving the checked 3D image alongside your original…');
      const oldKey=item.ghostMannequin?.imageObjectKey;
      upload=await api.uploadGarmentImage(user,await api.ghostStorageBlob(result),{signal});
      const value={image:upload.imageUrl,imageObjectKey:upload.objectKey,sourceImage:item.image,category:analysis.category,prompt:analysis.prompt,contractVersion:2,quality,kind:'ai_generated'};
      await save(user,item,value,{allowOverwrite:replacement,expectedImage,metadata:analysis.metadata});
      upload=null;if(analysis.metadata)Object.assign(item,analysis.metadata);item.ghostMannequin=value;replacement=false;expectedImage=value.image;
      // Commit the replacement before removing the former object. A failed save
      // must leave the previous 3D image readable, including on retry-save.
      if(oldKey&&oldKey!==value.imageObjectKey)await api.deleteGarmentUpload(user,oldKey).catch(()=>{});
      onSaved?.(item);render();status('Saved after the photo comparison. Your original remains available.');
    }catch(error){
      if(upload)await api.deleteGarmentUpload(user,upload.objectKey).catch(()=>{});
      if(error.name!=='AbortError'){
        status(error.message);const retry=dialog.querySelector('[data-ghost-retry]');retry.hidden=false;retry.textContent=result?(quality?'Retry saving':'Retry quality check'):'Try another 3D image';
        if(error.status>=500||/offline|unavailable|timed out/i.test(error.message))dialog.querySelector('[data-ghost-request]').hidden=false;
      }
    }finally{saving=false;setBusy(false);dialog.querySelectorAll('[data-ghost-close]').forEach(button=>button.disabled=false);}
  }
  dialog.addEventListener('cancel',event=>{if(saving){event.preventDefault();return;}cleanup();});
  // A close event can be queued just before the same dialog is reopened.
  dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
  dialog.addEventListener('click',async event=>{
    if(event.target.closest('[data-ghost-close]')){if(!saving)dialog.close();return;}
    if(busy)return;
    if(event.target.closest('[data-ghost-retry]')){void run();return;}
    if(event.target.closest('[data-ghost-regenerate]')){resetResult();replacement=Boolean(current.ghostMannequin?.image);expectedImage=current.ghostMannequin?.image||'';render();void run();return;}
    if(event.target.closest('[data-ghost-delete]')){
      setBusy(true);try{if(await onDelete?.(current.id)){resetResult();current=getItem(current.id)||current;replacement=false;expectedImage='';render();status('3D image deleted. Your original garment is still saved.');}}catch(error){status(error.message);}finally{setBusy(false);}return;
    }
    if(event.target.closest('[data-ghost-request]')){const button=event.target.closest('[data-ghost-request]');button.disabled=true;try{await onRequestAdmin?.(current);status('Request sent to admin.');button.textContent='Request sent';}catch(error){status(error.message);button.disabled=false;}return;}
    if(event.target.closest('[data-ghost-download]')){
      try{const blob=quality&&result?result:await api.downloadGhostGarment(getUser(),current.id);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`clothmatics-3d.${blob.type==='image/webp'?'webp':'png'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch{status('Could not download this image. Please try again.');}
    }
  });
  return {open(id){if(busy)return;const item=getItem(id);if(!item||!getUser())return;resetResult();current=item;replacement=false;expectedImage=item.ghostMannequin?.image||'';render();dialog.showModal();if(!item.ghostMannequin?.image)void run();}};
}
