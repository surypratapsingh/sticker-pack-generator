import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sizeProblems, packProblems, MAX_BYTES, TRAY_MAX_BYTES } from './sticker.js';

const file = (name, bytes) => ({ name, data: new Uint8Array(bytes) });

describe('sizeProblems', () => {
  it('is empty when every file is within its limit', () => {
    const files = [file('sticker-01.webp', MAX_BYTES), file('tray.png', TRAY_MAX_BYTES)];
    assert.deepEqual(sizeProblems(files), []);
  });

  it('names an oversize sticker and its size in KB', () => {
    const out = sizeProblems([file('sticker-02.webp', MAX_BYTES + 1)]);
    assert.deepEqual(out, ['sticker-02.webp is 101 KB. WhatsApp allows 100 KB per sticker. Try a simpler image.']);
  });

  it('checks the tray icon against its own 50 KB limit', () => {
    const out = sizeProblems([file('tray.png', TRAY_MAX_BYTES + 1)]);
    assert.deepEqual(out, ['tray.png is 51 KB. WhatsApp allows 50 KB for the tray icon.']);
  });

  it('reports every bad file, in order', () => {
    const out = sizeProblems([file('sticker-01.webp', MAX_BYTES + 1), file('sticker-02.webp', 10), file('tray.png', TRAY_MAX_BYTES + 1)]);
    assert.equal(out.length, 2);
    assert.match(out[0], /^sticker-01\.webp/);
    assert.match(out[1], /^tray\.png/);
  });

  it('does not apply the sticker limit to other files', () => {
    assert.deepEqual(sizeProblems([file('title.txt', MAX_BYTES * 2)]), []);
  });
});

describe('pack message', () => {
  it('joins count and size messages into one line', () => {
    const msg = [packProblems(2), ...sizeProblems([file('tray.png', TRAY_MAX_BYTES + 1)])].filter(Boolean).join(' ');
    assert.equal(msg, 'WhatsApp needs at least 3 stickers in a pack. Add 1 more. tray.png is 51 KB. WhatsApp allows 50 KB for the tray icon.');
  });
});
