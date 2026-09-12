import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  OUTFIT_BUILD_STEPS,
  outfitBuildLoaderMarkup,
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

  for (let i = 0; i < 4; i++) {
    const step = OUTFIT_BUILD_STEPS[i];
    assert.equal(step.step, i + 1);
    assert.equal(step.num, String(i + 1));
    assert.equal(step.title, expectedTitles[i]);
    assert.equal(step.desc, expectedDescs[i]);
    assert(step.image.includes('outfit-build-step-' + (i + 1) + '.png'));

    const diskPath = path.resolve('assets/loader', 'outfit-build-step-' + (i + 1) + '.png');
    assert(fs.existsSync(diskPath), 'Image file ' + diskPath + ' must exist on disk');
    const stat = fs.statSync(diskPath);
    assert(stat.size > 10000, 'Image file ' + diskPath + ' must not be empty');
  }
});

test('outfitBuildLoaderMarkup renders complete 4-step cards, chevrons, and bottom pill', () => {
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
    assert(html.includes('outfit-build-step-' + i + '.png'), 'Image for step ' + i + ' must exist');
    assert(html.includes('outfit-stage-slide'), 'Must have stage slide class');
    assert(html.includes('outfit-stage-badge'), 'Must have stage badge');
  }

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

test('updateHangerLoader progresses across steps 1 through 4 with DOM updates', () => {
  const root = {
    dataset: { phase: 'prepare', activeStep: '1' },
    hidden: true,
    _titleEl: { textContent: '' },
    _msgEl: { textContent: '' },
    _stepsEl: { attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } },
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
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.outfit-loader-card') return this._cards;
      if (sel === '.outfit-loader-dots .dot') return this._dots;
      return [];
    }
  };

  updateHangerLoader(root, 'Inspecting color, fabric and construction…', true);
  assert.equal(root.hidden, false);
  assert.equal(root.dataset.activeStep, '1');
  assert.equal(root._titleEl.textContent, 'Finding every detail');
  assert.equal(root._msgEl.textContent, 'Inspecting color, fabric and construction…');
  assert.equal(root._cards[0].classList.contains('active'), true);

  updateHangerLoader(root, 'Creating your 3D garment…', true);
  assert.equal(root.dataset.activeStep, '2');
  assert.equal(root._cards[0].classList.contains('completed'), true);
  assert.equal(root._cards[1].classList.contains('active'), true);

  updateHangerLoader(root, 'Finding the perfect shoes and accessories…', true);
  assert.equal(root.dataset.activeStep, '3');
  assert.equal(root._cards[1].classList.contains('completed'), true);
  assert.equal(root._cards[2].classList.contains('active'), true);

  updateHangerLoader(root, 'Saving the checked 3D image alongside your original…', true);
  assert.equal(root.dataset.activeStep, '4');
  assert.equal(root._cards[2].classList.contains('completed'), true);
  assert.equal(root._cards[3].classList.contains('active'), true);
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
  assert(content.innerHTML.includes('Generate Complete Outfit'), 'Must include generate outfit button');
});

