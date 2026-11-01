import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRect, removeBackground, addOutline, crc32, makeZip, slug, packProblems } from './sticker.js';

// w x h image filled with `rgb`, with optional rectangles [x, y, w, h, rgb] painted on top.
function image(w, h, rgb, rects = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  const paint = (x, y, c) => data.set([...c, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paint(x, y, rgb);
  for (const [rx, ry, rw, rh, c] of rects)
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) paint(x, y, c);
  return { width: w, height: h, data };
}
const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

test('fitRect keeps the shape and centres the image', () => {
  assert.deepEqual(fitRect(1000, 500, 512, 16), { x: 16, y: 136, w: 480, h: 240 });
  assert.deepEqual(fitRect(100, 100, 512, 0), { x: 0, y: 0, w: 512, h: 512 });
});

test('removeBackground clears a plain background and keeps the subject', () => {
  const out = removeBackground(image(10, 10, [250, 250, 250], [[3, 3, 4, 4, [200, 0, 0]]]));
  assert.equal(alpha(out, 0, 0), 0);
  assert.equal(alpha(out, 2, 5), 0);
  assert.equal(alpha(out, 4, 4), 255);
});

test('removeBackground keeps a subject that touches the edge', () => {
  // Red block runs to the bottom edge; white is the main border colour.
  const out = removeBackground(image(10, 10, [255, 255, 255], [[3, 5, 4, 5, [200, 0, 0]]]));
  assert.equal(alpha(out, 4, 9), 255);
  assert.equal(alpha(out, 0, 9), 0);
});

test('removeBackground keeps same-colour holes that do not touch the border', () => {
  const img = image(12, 12, [255, 255, 255], [[2, 2, 8, 8, [0, 0, 0]], [5, 5, 2, 2, [255, 255, 255]]]);
  const out = removeBackground(img);
  assert.equal(alpha(out, 5, 5), 255);
});

test('addOutline paints a ring of the given radius around solid pixels', () => {
  const img = { width: 9, height: 9, data: new Uint8ClampedArray(9 * 9 * 4) };
  img.data.set([255, 0, 0, 255], (4 * 9 + 4) * 4); // one red pixel in the middle
  const out = addOutline(img, 2);
  assert.deepEqual([...out.data.slice((4 * 9 + 6) * 4, (4 * 9 + 6) * 4 + 4)], [255, 255, 255, 255]);
  assert.equal(alpha(out, 4, 7), 0); // 3 px away: outside the ring
  assert.deepEqual([...out.data.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 4)], [255, 0, 0, 255]);
  assert.equal(alpha(addOutline(img, 0), 4, 5), 0);
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('makeZip writes one entry per file and a valid end record', () => {
  const zip = makeZip([{ name: 'a.txt', data: new Uint8Array([1, 2, 3]) }, { name: 'b.txt', data: new Uint8Array([4]) }]);
  const v = new DataView(zip.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  const cenStart = v.getUint32(end + 16, true);
  assert.equal(v.getUint32(cenStart, true), 0x02014b50);
});

test('slug and pack size rules', () => {
  assert.equal(slug('  My Pack! 2026 '), 'my-pack-2026');
  assert.equal(slug('!!!'), 'stickers');
  assert.match(packProblems(2), /at least 3/);
  assert.match(packProblems(31), /at most 30/);
  assert.equal(packProblems(3), '');
});
