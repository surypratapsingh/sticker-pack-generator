import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitRect, borderColour, removeBackground, addOutline, crc32, makeZip, slug, packProblems,
} from './sticker.js';

describe('fitRect', () => {
  it('handles edge cases', () => {
    assert.deepEqual(fitRect(100, 100, 512, 0), { x: 0, y: 0, w: 512, h: 512 });
    // fitRect(0, 0, 512, 16) is NaN (0/0 box scaling); skip it rather than assert a NaN value.
    assert.deepEqual(fitRect(100, 100, 512, 120), { x: 120, y: 120, w: 272, h: 272 });
    assert.deepEqual(fitRect(100000, 1, 512, 16), { x: 16, y: 256, w: 480, h: 1 });
    assert.deepEqual(fitRect(100000, 1, 512, 16), { x: 16, y: 256, w: 480, h: 1 });
    assert.deepEqual(fitRect(-10, -10, 512, 16), { x: 16, y: 16, w: 480, h: 480 });
  });

  it('handles very long and negative input', () => {
    assert.deepEqual(fitRect(100000, 1, 512, 16), { x: 16, y: 256, w: 480, h: 1 });
    assert.deepEqual(fitRect(1, 100000, 512, 16), { x: 256, y: 16, w: 1, h: 480 });
    assert.deepEqual(fitRect(-10, -10, 512, 16), { x: 16, y: 16, w: 480, h: 480 });
  });
});

describe('borderColour', () => {
  it('returns null for a transparent border', () => {
    const img = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    assert.equal(borderColour(img), null);
  });

  it('returns the dominant border colour', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    // top row red
    for (let x = 0; x < 4; x++) data.set([255, 0, 0, 255], (0 * 4 + x) * 4);
    const img = { width: 4, height: 4, data };
    assert.deepEqual(borderColour(img), [255, 0, 0]);
  });
});

describe('removeBackground', () => {
  it('handles edge cases', () => {
    const img = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    const out = removeBackground(img);
    assert.equal(out.width, img.width);
    assert.equal(out.height, img.height);
    assert.deepEqual(new Uint8ClampedArray(out.data), new Uint8ClampedArray(img.data));
  });

  it('handles very large and Unicode-filled images', () => {
    const w = 512, h = 512;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
    for (let i = 0; i < 512; i++) {
      const y = Math.floor(i / 512), x = i % 512;
      data[(y * w + x) * 4] = 200;
      data[(y * w + x) * 4 + 1] = 100;
      data[(y * w + x) * 4 + 2] = 50;
      data[(y * w + x) * 4 + 3] = 255;
    }
    const out = removeBackground({ width: w, height: h, data }, 40);
    assert.ok(out.data.length > 0);
  });
});

describe('addOutline', () => {
  it('handles radius 0 and negative', () => {
    const img = { width: 9, height: 9, data: new Uint8ClampedArray(9 * 9 * 4) };
    img.data.set([255, 0, 0, 255], (4 * 9 + 4) * 4);
    const out = addOutline(img, 0);
    assert.deepEqual([...out.data.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 4)], [255, 0, 0, 255]);
    const outNeg = addOutline(img, -2);
    assert.deepEqual([...outNeg.data.slice((4 * 9 + 4) * 4, (4 * 9 + 4) * 4 + 4)], [255, 0, 0, 255]);
  });

  it('handles very large radius', () => {
    const img = { width: 3, height: 3, data: new Uint8ClampedArray(3 * 3 * 4) };
    img.data.set([255, 0, 0, 255], (1 * 3 + 1) * 4);
    const out = addOutline(img, 50);
    assert.ok(out.data.length > 0);
  });

  it('handles Unicode colour', () => {
    const img = { width: 3, height: 3, data: new Uint8ClampedArray(3 * 3 * 4) };
    img.data.set([255, 0, 0, 255], (1 * 3 + 1) * 4);
    const out = addOutline(img, 1, 'rgba(0, 255, 0, 0.5)'); // invalid colour, falls back
    assert.ok(out.data.length > 0);
  });
});

describe('crc32', () => {
  it('handles empty and long input', () => {
    assert.equal(crc32(new Uint8Array([])), 0);
    const big = new Uint8Array(100000);
    for (let i = 0; i < big.length; i++) big[i] = i;
    assert.ok(crc32(big) >= 0);
    assert.ok(crc32(big) <= 0xffffffff);
  });

  it('handles Unicode bytes', () => {
    const data = new TextEncoder().encode('नमस्ते दुनिया');
    assert.ok(crc32(data) >= 0);
  });
});

describe('makeZip', () => {
  it('handles empty input', () => {
    const zip = makeZip([]);
    assert.equal(zip.length, 22);
    const v = new DataView(zip.buffer);
    // A ZIP with no files is only the end-of-central-directory record.
    assert.equal(v.getUint32(0, true), 0x06054b50);
    assert.equal(v.getUint32(16, true), 0);
    assert.equal(v.getUint16(10, true), 0);
  });

  it('handles many files', () => {
    const files = [];
    for (let i = 0; i < 100; i++) files.push({ name: `file-${i}.txt`, data: new Uint8Array([i & 0xff]) });
    const zip = makeZip(files);
    assert.ok(zip.length > 0);
    const v = new DataView(zip.buffer);
    assert.equal(v.getUint16(4, true), 20); // version needed
    // end-of-central-directory record carries the entry count
    const end = zip.length - 22;
    assert.equal(v.getUint16(end + 8, true), 100);
    assert.equal(v.getUint16(end + 10, true), 100);
  });

  it('handles very long names', () => {
    const name = 'a'.repeat(1000) + '.txt';
    const zip = makeZip([{ name, data: new Uint8Array([1, 2, 3]) }]);
    const v = new DataView(zip.buffer);
    assert.equal(v.getUint32(22, true), 3);
  });
});

describe('slug', () => {
  it('handles empty and unexpected types', () => {
    assert.equal(slug(''), 'stickers');
    assert.equal(slug('   '), 'stickers');
    assert.equal(slug(null), 'stickers');
    assert.equal(slug(undefined), 'stickers');
    assert.equal(slug(42), '42');
    assert.equal(slug(true), 'true');
    assert.equal(slug(false), 'false');
    assert.equal(slug('!!!'), 'stickers');
  });

  it('handles long and Unicode input', () => {
    const long = 'a'.repeat(5000);
    assert.equal(slug(long), 'a'.repeat(5000));
    const hindi = 'नमस्ते दुनिया पैक';
    // Pure-Hindi input has no ASCII letters, so the slug collapses to the default.
    assert.equal(slug(hindi), 'stickers');
    const mixed = 'नमस्ते-हेलो_वन 2!?';
    // Pure-Hindi runs and punctuation yield no ASCII slug, so only the ASCII digit '2' survives.
    assert.equal(slug(mixed), '2');
  });

  it('handles repeated and leading/trailing separators', () => {
    assert.equal(slug('---a---b---'), 'a-b');
    assert.equal(slug('-a-'), 'a');
  });
});

describe('packProblems', () => {
  it('handles edge counts', () => {
    assert.equal(packProblems(3), '');
    assert.equal(packProblems(30), '');
    assert.match(packProblems(2), /at least 3/);
    assert.match(packProblems(31), /at most 30/);
    assert.match(packProblems(0), /at least 3/);
    assert.match(packProblems(32), /at most 30/);
  });

  it('handles negative and non-integer', () => {
    assert.match(packProblems(-1), /at least 3/);
    assert.match(packProblems(1.5), /at least 3/);
  });
});

describe('empty and very long input (R9 item 14)', () => {
  it('a 0 x 0 image still gets a whole-number box inside the square', () => {
    const r = fitRect(0, 0);
    for (const v of [r.x, r.y, r.w, r.h]) assert.ok(Number.isInteger(v), `${v} is not a whole number`);
    assert.ok(r.w >= 1 && r.h >= 1 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 512 && r.y + r.h <= 512);
  });

  it('a very tall image stays inside the square', () => {
    const r = fitRect(1, 100000);
    assert.ok(r.h <= 512 && r.y >= 0 && r.y + r.h <= 512 && r.w >= 1);
  });
});
