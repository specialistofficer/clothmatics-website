import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  OUTFIT_BUILD_STEPS,
  OUTFIT_ORBIT_ITEMS,
  OUTFIT_ORBIT_CENTER,
  outfitBuildLoaderMarkup,
  outfitOrbitLoaderMarkup,
  hangerLoaderMarkup,
  updateHangerLoader
} from '../garment-progress.mjs';

test('OUTFIT_BUILD_STEPS defines exactly 4 progressive stages with valid metadata', () => {
  assert.equal(OUTFIT_BUILD_STEPS.length, 4, 'Must define exactly 4 steps');

  const expectedTitles = [
    'A style appears',
    'Layers come together',
    'More style, more you',
    'Your outfit is ready'
  ];
  const expectedDescs = [
    'Your first piece is in.',
    'Building your look…',
    'Finding the perfect pieces…',
    'Style looks good on you.'
  ];
  const expectedPercents = [25, 50, 75, 100];
  const expectedPercentLabels = ['25%', '50%', '75%', '100%'];

  for (let i = 0; i < 4; i++) {
    const step = OUTFIT_BUILD_STEPS[i];
    assert.equal(step.step, i + 1);
    assert.equal(step.num, String(i + 1));
    assert.equal(step.percent, expectedPercents[i]);
    assert.equal(step.percentLabel, expectedPercentLabels[i]);
    assert.equal(step.title, expectedTitles[i]);
    assert.equal(step.desc, expectedDescs[i]);
    assert(step.image.includes('outfit-build-step-' + (i + 1) + '.png'));

    const diskPath = path.resolve('assets/loader', 'outfit-build-step-' + (i + 1) + '.png');
    assert(fs.existsSync(diskPath), 'Image file ' + diskPath + ' must exist on disk');
    const stat = fs.statSync(diskPath);
    assert(stat.size > 10000, 'Image file ' + diskPath + ' must not be empty');
  }
});

test('outfitBuildLoaderMarkup renders complete 4-step cards, chevrons, progress bar, and bottom pill', () => {
  const html = outfitBuildLoaderMarkup({
    title: 'Outfit Build',
    subtitle: 'TURNING YOUR STYLE INTO SOMETHING GREAT…',
    initialStep: 1,
    hidden: false
  });

  assert(html.includes('class="hanger-loader outfit-build-loader"'), 'Contains container classes');
  assert(html.includes('Outfit Build'), 'Contains title');
  assert(html.includes('TURNING YOUR STYLE INTO SOMETHING GREAT…'), 'Contains subtitle');
  assert(!html.includes('data-active-step="1" hidden'), 'Container does not have hidden attribute when hidden is false');

  assert(html.includes('class="outfit-loader-showcase"'), 'Contains single-stage showcase container');
  for (let i = 1; i <= 4; i++) {
    assert(html.includes('data-step=\"' + i + '\"'), 'Card for step ' + i + ' must exist');
    assert(html.includes('data-percent=\"' + (i * 25) + '\"'), 'Card percent attribute for step ' + i + ' must exist');
    assert(html.includes('outfit-build-step-' + i + '.png'), 'Image for step ' + i + ' must exist');
    assert(html.includes('outfit-stage-slide'), 'Must have stage slide class');
    assert(html.includes('outfit-stage-badge'), 'Must have stage badge');
    assert(html.includes((i * 25) + '% Complete'), 'Must display stage percent badge');
  }

  assert(html.includes('class="outfit-progress-bar-wrap"'), 'Must contain progress bar wrap');
  assert(html.includes('class="outfit-progress-bar-track"'), 'Must contain progress bar track');
  assert(html.includes('class="outfit-progress-bar-fill"'), 'Must contain progress bar fill');
  assert(html.includes('class="outfit-progress-bar-ticks"'), 'Must contain progress bar ticks');

  const chevronCount = (html.match(/class=\"outfit-loader-chevron\"/g) || []).length;
  assert.equal(chevronCount, 3, 'Must have exactly 3 chevrons between 4 cards');

  assert(html.includes('class=\"outfit-loader-pill\"'), 'Must contain bottom pill');
  assert(html.includes('OUTFIT BUILD'), 'Must contain pill kicker');
  for (let i = 1; i <= 4; i++) {
    assert(html.includes('data-dot=\"' + i + '\"'), 'Dot for step ' + i + ' must exist');
  }

  assert(html.includes('data-hanger-title'), 'Must provide data-hanger-title element');
  assert(html.includes('data-hanger-message'), 'Must provide data-hanger-message element');
});

test('hangerLoaderMarkup acts as backwards-compatible alias defaulting to orbit loader', () => {
  const html = hangerLoaderMarkup();
  assert(html.includes('hanger-loader'));
  assert(html.includes('outfit-orbit-loader'));
  assert(html.includes('hidden'), 'Defaults to hidden for initial modal injection');

  const buildHtml = hangerLoaderMarkup({ type: 'build' });
  assert(buildHtml.includes('outfit-build-loader'), 'Explicit type build returns build loader');
});

test('updateHangerLoader progresses across steps 1 through 4 with DOM updates and progress bar', () => {
  const root = {
    dataset: { phase: 'prepare', activeStep: '1' },
    hidden: true,
    _titleEl: { textContent: '' },
    _msgEl: { textContent: '' },
    _stepsEl: { attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } },
    _progressFill: { style: { width: '' } },
    _ticks: [1, 2, 3, 4].map(s => {
      const tickClasses = new Set(s === 1 ? ['active'] : []);
      return {
        classList: {
          add(c) { tickClasses.add(c); },
          remove(...args) { args.forEach(c => tickClasses.delete(c)); },
          contains(c) { return tickClasses.has(c); },
          toggle(c, force) { if (force) tickClasses.add(c); else tickClasses.delete(c); }
        }
      };
    }),
    _cards: [1, 2, 3, 4].map(s => {
      const cardClasses = new Set(s === 1 ? ['active'] : []);
      return {
        dataset: { step: String(s) },
        classList: {
          add(c) { cardClasses.add(c); },
          remove(...args) { args.forEach(c => cardClasses.delete(c)); },
          contains(c) { return cardClasses.has(c); }
        }
      };
    }),
    _dots: [1, 2, 3, 4].map(s => {
      const dotClasses = new Set(s === 1 ? ['active'] : []);
      return {
        dataset: { dot: String(s) },
        classList: {
          add(c) { dotClasses.add(c); },
          remove(...args) { args.forEach(c => dotClasses.delete(c)); },
          contains(c) { return dotClasses.has(c); }
        }
      };
    }),
    matches(sel) { return sel === '.hanger-loader'; },
    querySelector(sel) {
      if (sel === '[data-hanger-title]') return this._titleEl;
      if (sel === '[data-hanger-message]') return this._msgEl;
      if (sel === '.outfit-loader-steps') return this._stepsEl;
      if (sel === '.outfit-progress-bar-fill') return this._progressFill;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.outfit-loader-card') return this._cards;
      if (sel === '.outfit-loader-dots .dot') return this._dots;
      if (sel === '.outfit-progress-bar-ticks .tick') return this._ticks;
      return [];
    }
  };

  updateHangerLoader(root, 'Inspecting color, fabric and construction…', true);
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.activeStep, '1');
  assert.equal(root._titleEl.textContent, 'Finding every detail');
  assert.equal(root._msgEl.textContent, 'Inspecting color, fabric and construction…');
  assert.equal(root._cards[0].classList.contains('active'), true);
  assert.equal(root._progressFill.style.width, '25%');
  assert.equal(root._ticks[0].classList.contains('active'), true);
  assert.equal(root._ticks[1].classList.contains('active'), false);

  updateHangerLoader(root, 'Creating your 3D garment…', true);
  assert.equal(root.dataset.activeStep, '2');
  assert.equal(root._cards[0].classList.contains('completed'), true);
  assert.equal(root._cards[1].classList.contains('active'), true);
  assert.equal(root._progressFill.style.width, '50%');
  assert.equal(root._ticks[0].classList.contains('active'), true);
  assert.equal(root._ticks[1].classList.contains('active'), true);
  assert.equal(root._ticks[2].classList.contains('active'), false);

  updateHangerLoader(root, 'Finding the perfect shoes and accessories…', true);
  assert.equal(root.dataset.activeStep, '3');
  assert.equal(root._cards[1].classList.contains('completed'), true);
  assert.equal(root._cards[2].classList.contains('active'), true);
  assert.equal(root._progressFill.style.width, '75%');
  assert.equal(root._ticks[2].classList.contains('active'), true);
  assert.equal(root._ticks[3].classList.contains('active'), false);

  updateHangerLoader(root, 'Saving the checked 3D image alongside your original…', true);
  assert.equal(root.dataset.activeStep, '4');
  assert.equal(root._cards[2].classList.contains('completed'), true);
  assert.equal(root._cards[3].classList.contains('active'), true);
  assert.equal(root._progressFill.style.width, '100%');
  assert.equal(root._ticks[3].classList.contains('active'), true);
  assert.equal(root.dataset.phase, 'save');
});

test('createCompleteLookController open() initializes and opens dialog without ReferenceError', async () => {
  // Setup minimal DOM mocks for Node environment
  globalThis.document = {
    _elements: {
      'complete-look-dialog': {
        open: false,
        showModal() { this.open = true; },
        close() { this.open = false; },
        addEventListener() {}
      },
      'complete-look-content': {
        innerHTML: '',
        querySelector() { return null; },
        querySelectorAll() { return []; }
      },
      'close-complete-look': {
        addEventListener() {}
      },
      'garment-dialog': {
        open: false,
        close() { this.open = false; }
      }
    },
    getElementById(id) {
      return this._elements[id] || null;
    },
    createElement(tag) {
      return {
        tagName: tag,
        textContent: '',
        get innerHTML() { return this.textContent; },
        set innerHTML(val) { this.textContent = val; }
      };
    }
  };

  const { createCompleteLookController } = await import('../complete-look.js');

  const dummyState = {
    user: { uid: 'u1' },
    wardrobe: [
      {
        id: 'garment-101',
        title: 'Dark Wash Denim Jeans',
        category: 'Pants',
        subCategory: 'Jeans',
        primaryColor: 'Blue',
        image: 'https://clothmatics.pages.dev/assets/clothmatics-logo.png'
      }
    ],
    profile: {
      gender: 'men',
      shoppingProfile: {
        sizes: { bottom: '32' }
      }
    }
  };

  const controller = createCompleteLookController({
    getState: () => dummyState,
    onToast: () => {}
  });

  // Calling open must not throw ReferenceError for searchStep or budgetOption
  assert.doesNotThrow(() => {
    controller.open('garment-101');
  });

  const dialog = document.getElementById('complete-look-dialog');
  assert.equal(dialog.open, true, 'Dialog should be opened via showModal');

  const content = document.getElementById('complete-look-content');
  assert(content.innerHTML.length > 50, 'Content must be rendered');
  // Open displays configuration state allowing user to select options first without auto-searching
  assert(content.innerHTML.includes('complete-look-ready'), 'Must render ready section allowing user to choose options first');
  assert(content.innerHTML.includes('complete-look-start-search-btn'), 'Must provide start search button');

  // Triggering search renders the loader
  controller.executeSearch();
  assert(content.innerHTML.includes('complete-look-top-loader'), 'Must render moving loader when search is triggered');
  assert(content.innerHTML.includes('outfit-orbit-loader') || content.innerHTML.includes('outfit-build-loader'), 'Must include 3D outfit loader');
});

test('OUTFIT_ORBIT_ITEMS defines 5 rotating clothes items and center outfit with valid assets', () => {
  assert.equal(OUTFIT_ORBIT_ITEMS.length, 5, 'Must define exactly 5 orbit clothes items');

  const expectedIds = ['tshirt', 'dress', 'bag', 'sneakers', 'jacket'];
  const expectedNames = ['T-Shirt', 'Dress', 'Handbag', 'Sneakers', 'Jacket'];

  for (let i = 0; i < 5; i++) {
    const item = OUTFIT_ORBIT_ITEMS[i];
    assert.equal(item.id, expectedIds[i]);
    assert.equal(item.name, expectedNames[i]);
    assert(item.image.includes('.png'));

    const diskPath = path.resolve('assets/loader/orbit', path.basename(item.image));
    assert(fs.existsSync(diskPath), 'Image file ' + diskPath + ' must exist on disk');
    const stat = fs.statSync(diskPath);
    assert(stat.size > 5000, 'Image file ' + diskPath + ' must not be empty');
  }

  assert(OUTFIT_ORBIT_CENTER.image.includes('center-outfit.png'));
  const centerPath = path.resolve('assets/loader/orbit', 'center-outfit.png');
  assert(fs.existsSync(centerPath), 'Center outfit image must exist');
  assert(fs.statSync(centerPath).size > 10000, 'Center outfit image must not be empty');
});

test('outfitOrbitLoaderMarkup renders revolving orbit stage, center card, dashed track and 5 nodes', () => {
  const html = outfitOrbitLoaderMarkup({
    title: 'Curating Complete Look',
    subtitle: 'AI IS COORDINATING YOUR PERFECT PIECES…',
    statusMessage: 'Matching wardrobe coordinates…',
    hidden: false
  });

  assert(html.includes('class="hanger-loader outfit-orbit-loader"'), 'Contains container classes');
  assert(html.includes('Curating Complete Look'), 'Contains title');
  assert(html.includes('AI IS COORDINATING YOUR PERFECT PIECES…'), 'Contains subtitle');
  assert(html.includes('class="outfit-orbit-stage"'), 'Contains orbit stage');
  assert(html.includes('class="outfit-orbit-track"'), 'Contains dashed orbit track');
  assert(html.includes('class="outfit-orbit-center-card"'), 'Contains center card');
  assert(html.includes('center-outfit.png'), 'Contains center outfit image');
  assert(html.includes('class="outfit-orbit-ring"'), 'Contains revolving orbit ring');

  for (const item of OUTFIT_ORBIT_ITEMS) {
    assert(html.includes('data-orbit-id="' + item.id + '"'), 'Node for ' + item.id + ' must exist');
    assert(html.includes(path.basename(item.image)), 'Image for ' + item.id + ' must exist');
  }

  assert(!html.includes('class="outfit-moving-progress-bar"'), 'Bottom loader line must be removed from orbit loader');
  assert(html.includes('data-hanger-message'), 'Provides rotating status message element');
  assert(html.includes('Matching wardrobe coordinates…'), 'Contains initial status message');
});

test('hangerLoaderMarkup defaults to orbit loader while type: build returns build loader', () => {
  const defaultHtml = hangerLoaderMarkup();
  assert(defaultHtml.includes('outfit-orbit-loader'), 'Default must render outfit-orbit-loader site-wide');

  const buildHtml = hangerLoaderMarkup({ type: 'build' });
  assert(buildHtml.includes('outfit-build-loader'), 'Type build must render outfit-build-loader');
});

test('ghostImageForMode prioritizes 3D generated image by default when available', async () => {
  const { ghostImageForMode } = await import('../ghost-contract.mjs');

  const itemWith3D = {
    id: 'item-1',
    image: 'https://example.com/source.jpg',
    ghostMannequin: {
      image: 'https://example.com/generated-3d.webp'
    }
  };

  const itemWithout3D = {
    id: 'item-2',
    image: 'https://example.com/source.jpg'
  };

  // Default (mode omitted) should prioritize 3D if present
  assert.equal(ghostImageForMode(itemWith3D), 'https://example.com/generated-3d.webp');
  assert.equal(ghostImageForMode(itemWithout3D), 'https://example.com/source.jpg');

  // Explicit 'normal' mode must respect normal image
  assert.equal(ghostImageForMode(itemWith3D, 'normal'), 'https://example.com/source.jpg');

  // Explicit '3d' mode
  assert.equal(ghostImageForMode(itemWith3D, '3d'), 'https://example.com/generated-3d.webp');
});

test('complete-look prioritizes 3D image in anchor hero and renders complete-look-overlay loader', async () => {
  const { createCompleteLookController } = await import('../complete-look.js');

  globalThis.document = {
    _elements: {
      'complete-look-dialog': { open: false, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener() {} },
      'complete-look-content': { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } },
      'close-complete-look': { addEventListener() {} },
      'garment-dialog': { open: false, close() { this.open = false; } }
    },
    getElementById(id) { return this._elements[id] || null; },
    createElement(tag) { return { tagName: tag, textContent: '', get innerHTML() { return this.textContent; }, set innerHTML(val) { this.textContent = val; } }; }
  };

  const dummyState = {
    user: { uid: 'u1' },
    wardrobe: [
      {
        id: 'garment-3d',
        title: 'Linen Casual Shirt',
        category: 'Shirts',
        subCategory: 'Shirt',
        primaryColor: 'White',
        image: 'https://example.com/shirt-source.jpg',
        ghostMannequin: {
          image: 'https://example.com/shirt-3d.webp'
        }
      }
    ],
    profile: { gender: 'men' }
  };

  const controller = createCompleteLookController({
    getState: () => dummyState,
    onToast: () => {}
  });

  controller.open('garment-3d');
  const content = document.getElementById('complete-look-content');

  // Anchor hero must use 3D image
  assert(content.innerHTML.includes('https://example.com/shirt-3d.webp'), 'Must render 3D mannequin in hero');
  assert(content.innerHTML.includes('3D Mannequin'), 'Must include 3D Mannequin badge');
  assert(content.innerHTML.includes('complete-look-ready'), 'Must show initial ready options');

  // Trigger search
  controller.executeSearch();

  // Loader must have overlay class
  assert(content.innerHTML.includes('complete-look-overlay'), 'Must have complete-look-overlay wrapper');
});

test('AI Stylist in app.js renders transparent orbit loader during outfit generation', async () => {
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');
  const garmentStudioCss = fs.readFileSync(path.resolve('garment-studio.css'), 'utf8');
  const companionCss = fs.readFileSync(path.resolve('companion.css'), 'utf8');

  // Must import outfitOrbitLoaderMarkup
  assert(appJs.includes('outfitOrbitLoaderMarkup'), 'app.js must import outfitOrbitLoaderMarkup');

  // Must invoke outfitOrbitLoaderMarkup inside runStylist
  assert(appJs.includes('kicker:"CLOTHMATICS AI STYLIST"'), 'Must set AI Stylist kicker');
  assert(appJs.includes('title:"Curating Your Outfit"'), 'Must set styling title');
  assert(appJs.includes('target.innerHTML=outfitOrbitLoaderMarkup'), 'Must render orbit loader into #stylist-result');

  // Must cycle dynamic steps
  assert(appJs.includes('Coordinating pieces from your wardrobe…'), 'Includes coordination step');
  assert(appJs.includes('Finding best matching tops and bottoms…'), 'Includes matching tops/bottoms step');

  // Must have transparent, dialogue-free CSS in stylesheets
  assert(garmentStudioCss.includes('.ai-result .outfit-orbit-loader'), 'garment-studio.css must style .ai-result .outfit-orbit-loader');
  assert(garmentStudioCss.includes('background: transparent !important'), 'Loader must be transparent');
  assert(companionCss.includes('.ai-result .outfit-orbit-loader'), 'companion.css must style .ai-result .outfit-orbit-loader');
});

test('normalizeOutfitScore converts 1-10 scores to 0-100 scale and preserves valid percentage scores', async () => {
  const { normalizeOutfitScore, validateGroundedOutfit } = await import('../web-core.mjs');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');

  // Single-digit scores from 1-10 scale (like 10/10 or 9/10) must convert to 100 and 90
  assert.equal(normalizeOutfitScore(10), 100, 'Score 10 must scale to 100');
  assert.equal(normalizeOutfitScore(9), 90, 'Score 9 must scale to 90');
  assert.equal(normalizeOutfitScore(9.5), 95, 'Score 9.5 must scale to 95');
  assert.equal(normalizeOutfitScore(8), 80, 'Score 8 must scale to 80');

  // Normal 0-100 scores must be preserved
  assert.equal(normalizeOutfitScore(95), 95, 'Score 95 must stay 95');
  assert.equal(normalizeOutfitScore(88), 88, 'Score 88 must stay 88');
  assert.equal(normalizeOutfitScore(0), 85, 'Fallback score for 0/empty');

  // validateGroundedOutfit must normalize scores
  const mockWardrobe = [
    { id: 'top-1', category: 'Shirts', subCategory: 'Shirt', primaryColor: 'White' },
    { id: 'bottom-1', category: 'Pants', subCategory: 'Trouser', primaryColor: 'Grey' }
  ];
  const validated = validateGroundedOutfit({
    score: 9,
    title: 'Modern Business Casual',
    subtitle: 'Sharp office wear',
    wardrobeItemIds: ['top-1', 'bottom-1'],
    reasoning: ['Looks sharp']
  }, mockWardrobe);
  assert.equal(validated.score, 90, 'Raw score 9 in validateGroundedOutfit must normalize to 90');

  // app.js prompt must instruct 0-100 scale and provide high score example
  assert(appJs.includes('Score each outfit on a 0-100 scale'), 'Prompt must instruct 0-100 scale');
  assert(appJs.includes('"score":95'), 'Prompt best match example must be 95');
  assert(appJs.includes('"score":91'), 'Prompt alternative example must be 91');
});

test('3D garment studio loader renders full-display overlay over the entire screen with is-busy state', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const studioCss = fs.readFileSync(path.resolve('garment-studio.css'), 'utf-8');
  const studioJs = fs.readFileSync(path.resolve('ghost-studio.mjs'), 'utf-8');

  // Full screen display overlay in garment-studio.css
  assert(studioCss.includes('position: fixed !important;'), '3D studio loader must use position: fixed');
  assert(studioCss.includes('width: 100vw !important;'), '3D studio loader must cover 100vw viewport width');
  assert(studioCss.includes('height: 100vh !important;'), '3D studio loader must cover 100vh viewport height');
  assert(studioCss.includes('z-index: 100000 !important;'), '3D studio loader must have top z-index overlay');
  assert(studioCss.includes('.ghost-studio.is-busy'), 'ghost-studio must handle is-busy class for visible overflow breakout');

  // ghost-studio.mjs toggles is-busy and renders dialog root loader
  assert(studioJs.includes("dialog.classList.toggle('is-busy',Boolean(value));"), 'ghost-studio setBusy must toggle is-busy class on dialog');
});

test('Site-wide orbit loader is deployed across dashboard, style check, purchase check, and companion styles', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
  const companionCss = fs.readFileSync(path.resolve('companion.css'), 'utf-8');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf-8');

  // Dashboard loading in index.html
  assert(indexHtml.includes('id="dashboard-loading"'), 'index.html contains #dashboard-loading');
  assert(indexHtml.includes('class="hanger-loader outfit-orbit-loader"'), 'dashboard-loading renders revolving outfit-orbit-loader');
  assert(indexHtml.includes('class="outfit-orbit-ring"'), 'dashboard-loading includes revolving 360-degree orbit ring');

  // Style Check & Smart Purchase in app.js
  assert(appJs.includes('AI Style Check') && appJs.includes('styleCheckTarget.innerHTML = outfitOrbitLoaderMarkup'), 'runCameraAction renders orbit loader for Style Check');
  assert(appJs.includes('SMART PURCHASE') && appJs.includes('$("#purchase-result").innerHTML=outfitOrbitLoaderMarkup'), 'runPurchaseCheck renders orbit loader for Smart Purchase');

  // Transparent floating styling across all sites without card/dialogue boxes
  assert(companionCss.includes('.style-check-result:has(.outfit-orbit-loader)'), 'companion.css styles style-check-result with transparent orbit loader');
  assert(companionCss.includes('.purchase-result:has(.outfit-orbit-loader)'), 'companion.css styles purchase-result with transparent orbit loader');
  assert(companionCss.includes('.dashboard-loading:has(.outfit-orbit-loader)'), 'companion.css styles dashboard-loading with transparent orbit loader');
});

test('Performance: loader assets are lightweight and hardware-accelerated without 2.4MB payload', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
  const studioCss = fs.readFileSync(path.resolve('garment-studio.css'), 'utf-8');
  const completeLookCss = fs.readFileSync(path.resolve('complete-look.css'), 'utf-8');

  // Heavy images must NEVER be eagerly loaded in HTML
  assert(!indexHtml.includes('outfit-build-step-'), 'index.html does not reference heavy outfit-build-step PNG images');
  assert(indexHtml.includes('id="dashboard-loading" class="dashboard-loading hidden"'), '#dashboard-loading is hidden by default to avoid initial render blocking');
  assert(indexHtml.includes('loading="lazy" decoding="async"'), 'Orbit loader images in index.html use lazy loading and async decoding');

  // Hardware acceleration and paint containment
  assert(studioCss.includes('will-change: transform'), 'garment-studio.css applies will-change: transform to orbit elements');
  assert(studioCss.includes('contain: paint'), 'garment-studio.css applies contain: paint to orbit bubbles');
  assert(completeLookCss.includes('will-change: transform'), 'complete-look.css applies will-change: transform to orbit elements');
  assert(completeLookCss.includes('contain: paint'), 'complete-look.css applies contain: paint to orbit bubbles');
});

test('Overlay transparency and hidden internal details', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const studioCss = fs.readFileSync(path.resolve('garment-studio.css'), 'utf-8');
  const reviewMjs = fs.readFileSync(path.resolve('garment-review.mjs'), 'utf-8');

  // Overlay background is translucent (around 0.20 opacity, highly transparent)
  assert(studioCss.includes('background: rgba(255, 255, 255, 0.2) !important;'), 'garment-studio.css uses translucent background for loader overlay');

  // Technical evidence / construction details are hidden from user
  assert(studioCss.includes('.garment-evidence-fields{display:none!important}'), 'garment-studio.css hides technical evidence fields');
  assert(reviewMjs.includes('visible=false'), 'garment-review.mjs defaults visible to false so internal details are not rendered to users');
});

test('Camera 3D auto-save preserves flat-lay behavior and keeps worn-item originals distinct', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf-8');

  // Single garment camera 3D auto-saves directly upon completion
  assert(appJs.includes('if(ghostRequested && state.garmentUpload.ghostPrepared && state.camera.generate3d)'), 'processGarmentUpload auto-saves when 3D generated from camera');

  // Explicit flat-lay/hanging batches retain the direct auto-save behavior.
  assert(appJs.includes('prepared.every(entry => entry.ghostPrepared&&!usesWornOutfitPreparation(entry.sourceGroup?.photoContext))'), 'processAutoExtractBatch auto-saves only non-worn 3D items directly');

  // Worn-photo items keep the extracted source and generated image as distinct assets.
  assert(appJs.includes('const cameraDirect3D=state.camera.generate3d && ghostPrepared && !(autoExtract&&usesWornOutfitPreparation(current?.sourceGroup?.photoContext))'), 'saveGarmentUpload excludes worn items from camera direct 3D storage');
  assert(appJs.includes('const source=autoExtract?current.originalBlob:state.garmentUpload.normalizedBlob;'), 'worn auto-extract saves the extracted garment as its original');
  assert(appJs.includes('record.image=upload.imageUrl;record.imageObjectKey=upload.objectKey;record.bgRemoved=true;'), '3D image is primary image');

  // UI hides normal toggle when garment is pure 3D model without separate normal photo
  assert(appJs.includes('hasDistinctNormal'), 'UI only shows toggle if distinct normal image exists');
});

test('Complete the look loader overlay covers full screen and blocks background interaction', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const completeLookCss = fs.readFileSync(path.resolve('complete-look.css'), 'utf-8');
  const completeLookJs = fs.readFileSync(path.resolve('complete-look.js'), 'utf-8');

  // Must have full screen fixed coverage
  assert(completeLookCss.includes('width: 100vw !important;'), 'Overlay must have 100vw width');
  assert(completeLookCss.includes('height: 100dvh !important;'), 'Overlay must have 100dvh height');
  assert(completeLookCss.includes('z-index: 999999 !important;'), 'Overlay must have high z-index');

  // Must block clicks and touch gestures
  assert(completeLookCss.includes('pointer-events: all !important;'), 'Overlay must intercept pointer events');
  assert(completeLookCss.includes('touch-action: none !important;'), 'Overlay must disable touch-action pass-through');
  assert(completeLookCss.includes('cursor: wait !important;'), 'Overlay must indicate wait cursor');

  // Must match 3D studio overlay transparency exactly (translucent 0.2 and 4px blur)
  assert(completeLookCss.includes('background: rgba(255, 255, 255, 0.2) !important;'), 'Overlay must have translucent 0.2 background matching 3D model generator');
  assert(completeLookCss.includes('backdrop-filter: blur(4px) !important;'), 'Overlay must have 4px blur matching 3D model generator');
  assert(completeLookCss.includes('background: transparent !important;'), 'Dialog is transparent during is-searching');

  // Must hide background dialog elements and close button during is-searching
  assert(completeLookCss.includes('.complete-look-dialog.is-searching'), 'CSS must define .is-searching state for dialog');
  assert(completeLookCss.includes('.complete-look-dialog.is-searching #close-complete-look'), 'CSS must hide close button during search');
  assert(completeLookCss.includes('.complete-look-dialog.is-searching .complete-look-hero'), 'CSS must hide hero card during search');

  // JS must toggle is-searching class
  assert(completeLookJs.includes('dialog.classList.add("is-searching")'), 'JS must add is-searching class on dialog during search');
  assert(completeLookJs.includes('dialog.classList.remove("is-searching")'), 'JS must remove is-searching class when search finishes');
});

test('Kaggle full-look generation is an explicit user action and preserves the existing Gemini outfit result', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf-8');
  const runStylistBody = appJs.slice(appJs.indexOf('async function runStylist'), appJs.indexOf('async function generateBestFullLook'));

  assert(runStylistBody.includes('const generateKaggle=options.generateKaggle===true'), 'standard generation defaults to the existing Gemini-only path');
  assert(runStylistBody.includes('if(generateKaggle)await generateBestFullLook()'), 'only the explicitly selected Kaggle mode continues into mannequin generation');
  assert(appJs.includes('Generate outfit on Kaggle'), 'best-match result exposes an explicit Kaggle generation button');
  assert(appJs.includes('class="generated-piece-grid"'), 'existing selected-garment presentation remains available');
  assert(appJs.includes('data-generate-full-look'), 'the Kaggle button is wired to the dedicated full-look action');
});

test('dashboard wardrobe loading survives failures from secondary account collections', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf-8');
  const loadBody = appJs.slice(appJs.indexOf('async function loadDashboard'), appJs.indexOf('function renderAccount'));

  assert(loadBody.includes('getDocs(query(collection(db, "wardrobe"), where("userId", "==", user.uid)))'), 'wardrobe remains the required primary read');
  for (const resource of ['saved outfits','wear history','challenge history','style history',"today's outfit",'style profile','notifications']) {
    assert(loadBody.includes(`loadOptionalDashboardData("${resource}"`), `${resource} must not block wardrobe rendering`);
  }
  assert(appJs.includes('async function loadOptionalDashboardData'), 'dashboard provides a bounded fallback for optional reads');
  assert(appJs.includes('Your wardrobe access could not be verified. Please sign out and sign in again.'), 'permission failures provide a specific recovery action');
});

test('saved outfits without a Kaggle render do not crash dashboard rendering', async () => {
  const { fullLookImageUrl } = await import('../full-look.mjs');

  assert.equal(fullLookImageUrl(null), '', 'legacy outfits with a null render return no image');
  assert.equal(fullLookImageUrl(undefined), '', 'missing render metadata returns no image');
  assert.equal(fullLookImageUrl({}), '', 'empty render metadata returns no image');
  assert.equal(fullLookImageUrl('https://cdn.example.com/look.png'), 'https://cdn.example.com/look.png', 'legacy string image URLs remain supported');
  assert.equal(fullLookImageUrl({image:'https://cdn.example.com/look.png'}), 'https://cdn.example.com/look.png', 'saved image objects remain supported');
  assert.equal(fullLookImageUrl({url:'blob:https://clothmatics.pages.dev/render-id'}), 'blob:https://clothmatics.pages.dev/render-id', 'current in-page generated previews remain supported');
  assert.equal(fullLookImageUrl({image:'javascript:alert(1)'}), '', 'unsafe stored URLs remain rejected');
});

test('AI Stylist exposes separate existing and Kaggle actions', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const appJs = fs.readFileSync(path.resolve('app.js'), 'utf-8');

  assert(appJs.includes('id="stylist-standard"'), 'existing Gemini outfit action remains visible');
  assert(appJs.includes('>Generate my outfit</button>'), 'existing action keeps its established label');
  assert(appJs.includes('id="stylist-kaggle"'), 'dedicated Kaggle action is visible beside it');
  assert(appJs.includes('>Generate with Kaggle</button>'), 'Kaggle action has a clear label');
  assert(appJs.includes('if(generateKaggle)await generateBestFullLook()'), 'Kaggle action continues from selection into mannequin generation');
});

test('AI JSON parser isolates one object and repairs only trailing commas', async () => {
  const { parseAiJson } = await import('../web-api.mjs');

  assert.deepEqual(parseAiJson('Result:\n```json\n{"best":{"score":95,},}\n```\nDone'), {best:{score:95}});
  assert.deepEqual(parseAiJson('{"best":{"title":"Braces } inside strings remain valid"}} trailing text'), {best:{title:'Braces } inside strings remain valid'}});
  assert.deepEqual(parseAiJson('Here are options for [Casual, Relaxed]:\n```json\n{"best":{"score":95}}\n```'), {best:{score:95}});
  assert.deepEqual(parseAiJson('- [x] Casual\n- [x] Relaxed\n{"best":{"score":95}}'), {best:{score:95}});
  assert.equal(parseAiJson('{broken'), null, 'structurally invalid content remains rejected');
  assert.equal(parseAiJson('[{"best":true}]'), null, 'non-object top-level responses remain rejected by the caller');
  assert.equal(parseAiJson('Result: [{"best":true}] Done'), null, 'array payloads with preamble remain rejected');
});

