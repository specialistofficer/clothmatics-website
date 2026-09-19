import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFullLook, generateFullLook } from '../full-look.mjs';

const pngBytes = new Uint8Array(900);
pngBytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
const mockBlob = new Blob([pngBytes], { type: 'image/png' });

if (!globalThis.createImageBitmap) {
  globalThis.createImageBitmap = async () => ({
    width: 832,
    height: 1088,
    close: () => {}
  });
}
if (!globalThis.FileReader) {
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      this.onload?.();
    }
  };
}

const mockItems = [
  { id: 'top-1', category: 'Top', subCategory: 'T-Shirt', title: 'Blue tee', image: 'https://example.com/top.png' },
  { id: 'bottom-1', category: 'Bottom', subCategory: 'Jeans', title: 'Black jeans', image: 'https://example.com/bottom.png' }
];

const mockUser = {
  getIdToken: async () => 'test-token'
};

test('verifyFullLook returns non-blocking advisory result when AI gateway returns location error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const str = String(url);
    if (str.includes('/v1/generate')) {
      return new Response(JSON.stringify({
        error: {
          code: 400,
          message: 'User location is not supported for the API use.',
          status: 'FAILED_PRECONDITION'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(mockBlob, { headers: { 'Content-Type': 'image/png' } });
  };

  try {
    const result = await verifyFullLook(mockUser, mockBlob, mockItems);
    assert.equal(result.passed, true);
    assert.match(result.advisoryNote, /unavailable/i);
    assert.equal(result.items.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateFullLook succeeds and preserves Kaggle look even if verifyFullLook fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const str = String(url);
    if (str.includes('/api/wardrobe/full-look')) {
      return new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Full-Look-Seed': '12345',
          'X-Full-Look-Pipeline-Version': '1'
        }
      });
    }
    if (str.includes('/v1/generate')) {
      return new Response(JSON.stringify({
        error: {
          code: 400,
          message: 'User location is not supported for the API use.'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(mockBlob, { headers: { 'Content-Type': 'image/png' } });
  };

  try {
    const outfit = { wardrobeItemIds: ['top-1', 'bottom-1'], title: 'Test Outfit' };
    const wardrobe = [...mockItems];
    const profile = { gender: 'masculine' };

    const result = await generateFullLook(mockUser, outfit, wardrobe, profile);
    assert.ok(result.blob);
    assert.equal(result.diagnostics.seed, '12345');
    assert.ok(result.quality);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
