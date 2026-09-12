let nextId = 0;

export const OUTFIT_BUILD_STEPS = [
  {
    step: 1,
    num: "1",
    title: "A style appears",
    desc: "Your first piece is in.",
    image: "./assets/loader/outfit-build-step-1.png",
    alt: "A style appears - Your first piece is in"
  },
  {
    step: 2,
    num: "2",
    title: "Layers come together",
    desc: "Building your look…",
    image: "./assets/loader/outfit-build-step-2.png",
    alt: "Layers come together - Building your look"
  },
  {
    step: 3,
    num: "3",
    title: "More style, more you",
    desc: "Finding the perfect pieces…",
    image: "./assets/loader/outfit-build-step-3.png",
    alt: "More style, more you - Finding the perfect pieces"
  },
  {
    step: 4,
    num: "4",
    title: "Your outfit is ready",
    desc: "Style looks good on you.",
    image: "./assets/loader/outfit-build-step-4.png",
    alt: "Your outfit is ready - Style looks good on you"
  }
];

export function outfitBuildLoaderMarkup({
  kicker = "CLOTHMATICS",
  title = "Outfit Build",
  subtitle = "TURNING YOUR STYLE INTO SOMETHING GREAT…",
  initialStep = 1,
  hidden = true
} = {}) {
  const chevronSvg = `<div class="outfit-loader-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>`;

  const cardsHtml = OUTFIT_BUILD_STEPS.map((s, idx) => {
    const isLast = idx === OUTFIT_BUILD_STEPS.length - 1;
    const activeClass = s.step === initialStep ? " active" : (s.step < initialStep ? " completed" : "");
    const card = `
      <div class="outfit-loader-card outfit-stage-slide${activeClass}" data-step="${s.step}">
        <div class="outfit-stage-badge">
          <span class="outfit-stage-pill">Step ${s.num} of 4</span>
          <span class="outfit-stage-label">${s.title}</span>
        </div>
        <div class="outfit-loader-card-box">
          <img src="${s.image}" alt="${s.alt}" width="225" height="240" loading="eager" />
        </div>
        <div class="outfit-loader-card-info">
          <span class="outfit-loader-card-num">${s.num}</span>
          <div class="outfit-loader-card-text">
            <b class="outfit-loader-card-heading">${s.title}</b>
            <span class="outfit-loader-card-desc">${s.desc}</span>
          </div>
        </div>
      </div>
    `;
    return isLast ? card : card + chevronSvg;
  }).join("");

  return `
    <div class="hanger-loader outfit-build-loader" data-phase="prepare" data-active-step="${initialStep}"${hidden ? " hidden" : ""}>
      <div class="outfit-loader-head">
        <span class="outfit-loader-kicker">${kicker}</span>
        <h3 class="outfit-loader-title">${title} <span class="outfit-loader-sparkle" aria-hidden="true">✦</span></h3>
        <p class="outfit-loader-subtitle">${subtitle}</p>
      </div>

      <div class="outfit-loader-showcase">
        <div class="outfit-loader-steps" role="progressbar" aria-label="${title} sequence" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${initialStep}">
          ${cardsHtml}
        </div>
      </div>

      <div class="outfit-loader-pill">
        <span class="outfit-loader-pill-tag">OUTFIT BUILD</span>
        <span class="outfit-loader-dots" aria-hidden="true">
          <i class="dot${initialStep === 1 ? ' active' : ''}" data-dot="1"></i>
          <i class="dot${initialStep === 2 ? ' active' : ''}" data-dot="2"></i>
          <i class="dot${initialStep === 3 ? ' active' : ''}" data-dot="3"></i>
          <i class="dot${initialStep === 4 ? ' active' : ''}" data-dot="4"></i>
        </span>
        <span class="outfit-loader-pill-msg" data-hanger-message>SAME STYLE, BRIGHTER DAYS.</span>
        <b data-hanger-title class="hidden-hanger-compat" style="display:none;">Preparing your photo</b>
      </div>
    </div>
  `.trim();
}

export function hangerLoaderMarkup(options = {}) {
  return outfitBuildLoaderMarkup(options);
}

export function updateHangerLoader(root, message, active = true, explicitStep = null) {
  const loader = root?.matches?.('.hanger-loader') ? root : root?.querySelector?.('.hanger-loader');
  if (!loader) return;

  const msg = String(message || "");
  const phase = /sav|uploading|ready|finished/i.test(msg) ? 'save'
    : /checking color|compar|verif|quality/i.test(msg) ? 'check'
    : /generat|creating.*3d|layer/i.test(msg) ? 'generate'
    : /analy|inspect|identify|scan|extract/i.test(msg) ? 'inspect'
    : 'prepare';

  const titleMap = {
    prepare: 'Preparing your photo',
    inspect: 'Finding every detail',
    generate: 'Creating your 3D garment',
    check: 'Checking the match',
    save: 'Adding to your wardrobe'
  };
  const title = titleMap[phase] || 'Preparing your photo';

  let step = explicitStep;
  if (!step) {
    if (phase === 'save' || /ready|saved|finished|looks good on you/i.test(msg)) {
      step = 4;
    } else if (phase === 'check' || /finding|curat|match|perfect pieces|shoes|accessories/i.test(msg)) {
      step = 3;
    } else if (phase === 'generate' || /layer|extract|creating|building/i.test(msg)) {
      step = 2;
    } else {
      step = 1;
    }
  }

  loader.dataset.phase = phase;
  loader.dataset.activeStep = String(step);
  loader.hidden = !active;

  const titleEl = loader.querySelector('[data-hanger-title]');
  if (titleEl) titleEl.textContent = title;

  const msgEl = loader.querySelector('[data-hanger-message]');
  if (msgEl) {
    msgEl.textContent = msg || OUTFIT_BUILD_STEPS[step - 1]?.desc || 'SAME STYLE, BRIGHTER DAYS.';
  }

  const stepsContainer = loader.querySelector('.outfit-loader-steps');
  if (stepsContainer) {
    stepsContainer.setAttribute('aria-valuenow', String(step));
  }

  const cards = loader.querySelectorAll('.outfit-loader-card');
  cards.forEach(card => {
    const cardStep = Number(card.dataset.step || "0");
    card.classList.remove('active', 'completed');
    if (cardStep === step) {
      card.classList.add('active');
    } else if (cardStep < step) {
      card.classList.add('completed');
    }
  });

  const dots = loader.querySelectorAll('.outfit-loader-dots .dot');
  dots.forEach(dot => {
    const dotStep = Number(dot.dataset.dot || "0");
    dot.classList.remove('active', 'completed');
    if (dotStep === step) {
      dot.classList.add('active');
    } else if (dotStep < step) {
      dot.classList.add('completed');
    }
  });
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
