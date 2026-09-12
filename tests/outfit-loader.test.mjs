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

test('hangerLoaderMarkup acts as backwards-compatible alias with hidden default', () => {
  const html = hangerLoaderMarkup();
  assert(html.includes('hanger-loader'));
  assert(html.includes('outfit-build-loader'));
  assert(html.includes('hidden'), 'Defaults to hidden for initial modal injection');
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
  assert(content.innerHTML.includes('Dark Wash Denim Jeans'), 'Must include active garment title');
  assert(content.innerHTML.includes('complete-look-top-loader'), 'Must render moving loader at top of screen');
  assert(content.innerHTML.includes('outfit-orbit-loader') || content.innerHTML.includes('outfit-build-loader'), 'Must include 3D outfit loader');
  assert(!content.innerHTML.includes('complete-look-ready'), 'Must not have separate intermediate ready section');
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

  assert(html.includes('class="outfit-moving-progress-bar"'), 'Contains moving progress bar');
  assert(html.includes('class="outfit-moving-progress-runner"'), 'Contains moving runner');
  assert(html.includes('data-hanger-message'), 'Provides status message element');
  assert(html.includes('Matching wardrobe coordinates…'), 'Contains initial status message');
});

test('hangerLoaderMarkup with type: orbit renders orbit loader while preserving default build loader', () => {
  const defaultHtml = hangerLoaderMarkup();
  assert(defaultHtml.includes('outfit-build-loader'), 'Default must preserve outfit-build-loader');

  const orbitHtml = hangerLoaderMarkup({ type: 'orbit' });
  assert(orbitHtml.includes('outfit-orbit-loader'), 'Type orbit must render outfit-orbit-loader');
});

