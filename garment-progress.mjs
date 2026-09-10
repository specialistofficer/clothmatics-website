let nextId=0;
export function hangerLoaderMarkup(){
  const id=`hanger-loop-${++nextId}`;
  return `<div class="hanger-loader" data-phase="prepare" hidden><div class="hanger-art" aria-hidden="true"><svg viewBox="0 0 180 180"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6C63FF"/><stop offset=".52" stop-color="#AB35F5"/><stop offset="1" stop-color="#FF4FA3"/></linearGradient></defs><circle class="hanger-ring-track" cx="90" cy="90" r="71"/><circle class="hanger-ring" cx="90" cy="90" r="71" stroke="url(#${id})"/><g class="hanger-center"><path class="hanger-wire" d="M82 65c0-13 20-13 20 0 0 7-12 8-12 17m0 0-48 24c-5 3-6 6-6 11m54-35 48 24c5 3 6 6 6 11"/><g class="hanger-clothes"><path fill="#6C3FF2" d="m55 107-14 7-7 19 14 5 4-10v25h28v-25l4 10 14-5-7-19-14-7c-4 9-18 9-22 0Z"/><path fill="#FF4FA3" d="m107 107-14 7-7 19 14 5 4-10v25h28v-25l4 10 14-5-7-19-14-7c-4 9-18 9-22 0Z"/><path fill="#BA9BFF" stroke="#7D51DF" stroke-width="1.5" d="m81 104-13 9-7 31 13 3 5-20v29h26v-29l5 20 13-3-7-31-14-9-10 7Z"/><path stroke="#7143D9" stroke-width="2" d="M92 112v44"/></g></g><g class="hanger-sparkles" fill="#AE38F2"><path d="m139 47 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z"/><path fill="#FF4FA3" d="m151 83 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="m34 63 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/></g></svg><span class="hanger-shadow"></span></div><div class="hanger-copy"><span class="hanger-eyebrow">CLOTHMATICS</span><b data-hanger-title>Preparing your photo</b><span data-hanger-message></span><span class="hanger-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div></div>`;
}
export function updateHangerLoader(root,message,active=true){
  const loader=root?.matches?.('.hanger-loader')?root:root?.querySelector('.hanger-loader');if(!loader)return;
  const phase=/sav|uploading/i.test(message)?'save':/checking color|compar|verif/i.test(message)?'check':/generat|creating.*3d/i.test(message)?'generate':/analy|inspect|identify|scan|extract/i.test(message)?'inspect':'prepare';
  const title={prepare:'Preparing your photo',inspect:'Finding every detail',generate:'Creating your 3D garment',check:'Checking the match',save:'Adding to your wardrobe'}[phase];
  loader.dataset.phase=phase;loader.hidden=!active;loader.querySelector('[data-hanger-title]').textContent=title;loader.querySelector('[data-hanger-message]').textContent=message||'A small moment. A brighter you.';
}

export function confirmDelete3D({title='this garment'}={}){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='ghost-confirm';
    dialog.setAttribute('aria-labelledby','ghost-delete-title');dialog.setAttribute('aria-describedby','ghost-delete-description');
    dialog.innerHTML='<span class="confirm-icon" aria-hidden="true">−</span><h2 id="ghost-delete-title">Delete this 3D image?</h2><p id="ghost-delete-description"></p><div class="confirm-original">Your original garment photo and saved details will stay in your wardrobe.</div><form method="dialog"><button value="cancel" autofocus>Keep image</button><button class="danger-button" value="delete">Delete 3D image</button></form>';
    dialog.querySelector('p').textContent=`The generated image for ${title} will be removed. You can create a new 3D image later.`;
    const focused=document.activeElement;document.body.append(dialog);
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='delete';dialog.remove();focused?.focus();resolve(accepted);},{once:true});
    dialog.showModal();
  });
}
