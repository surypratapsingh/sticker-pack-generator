import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { featherAlpha, addOutline } from './sticker.js';

const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

// One opaque pixel in the middle of a 15 x 15 transparent image.
function dot() {
  const img = { width: 15, height: 15, data: new Uint8ClampedArray(15 * 15 * 4) };
  img.data.set([0, 0, 0, 255], (7 * 15 + 7) * 4);
  return img;
}

describe('featherAlpha', () => {
  it('is fully opaque with no feather, at any distance', () => {
    assert.equal(featherAlpha(0, 10, 0), 1);
    assert.equal(featherAlpha(10, 10, 0), 1);
    assert.equal(featherAlpha(10, 10, -3), 1);
  });

  it('is 1 inside the solid band and falls to 0 at the rim', () => {
    assert.equal(featherAlpha(6, 10, 4), 1); // 6 <= radius - feather
    assert.equal(featherAlpha(8, 10, 4), 0.5);
    assert.equal(featherAlpha(9, 10, 4), 0.25);
    assert.equal(featherAlpha(10, 10, 4), 0);
  });
});

describe('addOutline feather', () => {
  it('feather 0 gives the same pixels as leaving the argument out', () => {
    assert.deepEqual(addOutline(dot(), 6, [255, 255, 255], 0).data, addOutline(dot(), 6).data);
  });

  it('fades the outer rim and keeps the subject solid', () => {
    const out = addOutline(dot(), 6, [255, 255, 255], 4);
    assert.equal(alphaAt(out, 7, 7), 255); // the subject pixel itself
    assert.equal(alphaAt(out, 9, 7), 255); // d = 2, inside the solid band
    assert.equal(alphaAt(out, 10, 7), 191); // d = 3 -> 0.75
    assert.equal(alphaAt(out, 12, 7), 64); // d = 5 -> 0.25
    assert.equal(alphaAt(out, 13, 7), 0); // d = 6, the rim is transparent
  });

  it('keeps every alpha in 0..255', () => {
    const out = addOutline(dot(), 6, [255, 255, 255], 3);
    for (let i = 3; i < out.data.length; i += 4) assert.ok(out.data[i] >= 0 && out.data[i] <= 255);
  });
});
