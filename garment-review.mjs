const fields={fabricWeave:'Fabric weave / grain',collarOrWaistband:'Collar / waistband',closuresAndHardware:'Fasteners / hardware',pocketsAndDetails:'Pockets / placement',garmentLengthAndHem:'Length / hem',graphicsAndLogos:'Graphics / exact lettering'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderGarmentEvidence(form,item,{editable=true}={}){
  form.querySelector('.garment-evidence-fields')?.remove();
  const tech=item.technical3DDetails||{},profile=item.visualProfile||{};
  const palette=(profile.colors||[]).filter(c=>/^#[a-f0-9]{6}$/i.test(c.hex||''));
  const section=document.createElement('details');section.className='garment-evidence-fields';section.open=true;
  section.innerHTML=`<summary>Color, fabric &amp; construction</summary><div class="garment-evidence-grid"><label>Observed color &amp; undertone<textarea ${editable?'id="upload-color-detail"':'name="colorDetail"'} maxlength="300">${escape(item.colorDetail)}</textarea></label><label>Fabric texture &amp; finish<textarea ${editable?'id="upload-fabric-texture"':'name="fabricTexture"'} maxlength="300">${escape(item.fabricTexture)}</textarea></label>${Object.entries(fields).map(([key,label])=>`<label>${label}<textarea data-evidence="${key}" maxlength="${key==='graphicsAndLogos'?300:200}" ${editable?'':'readonly'}>${escape(tech[key])}</textarea></label>`).join('')}</div><div class="garment-color-evidence">${palette.map(c=>`<span><i style="background:${c.hex}"></i>${escape(c.role)} ${escape(c.name)} ${c.hex}</span>`).join('')}</div><p class="evidence-note">${escape(profile.lightingNotes||'Color samples describe the photo under its original lighting.')}${profile.uncertainties?.length?` ${escape(profile.uncertainties.join(' '))}`:''}</p>`;
  const target=editable?form.querySelector('.garment-review-fields'):form;
  const actions=target.querySelector('.dialog-actions');target.insertBefore(section,actions);
}
export function readGarmentEvidence(form,metadata){
  const color=form.querySelector('#upload-color-detail'),texture=form.querySelector('#upload-fabric-texture');
  if(color)metadata.colorDetail=color.value.trim();if(texture)metadata.fabricTexture=texture.value.trim();
  const tech={...metadata.technical3DDetails};
  for(const input of form.querySelectorAll('[data-evidence]'))tech[input.dataset.evidence]=input.value.trim();
  metadata.technical3DDetails=tech;
}
