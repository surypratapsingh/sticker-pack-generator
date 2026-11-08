import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanName, packMeta, wastickersEntries, makeZip, slug, MAX_NAME, DEFAULT_TITLE, DEFAULT_AUTHOR,
} from './sticker.js';

// Reads the file names from a ZIP's local headers (stored entries only, as makeZip writes them).
function zipNames(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const names = [];
  for (let at = 0; at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50; ) {
    const size = dv.getUint32(at + 18, true), len = dv.getUint16(at + 26, true);
    names.push(dec.decode(bytes.subarray(at + 30, at + 30 + len)));
    at += 30 + len + size;
  }
  return names;
}

describe('cleanName', () => {
  it('trims, joins line breaks and runs of spaces', () => {
    assert.equal(cleanName('  Chai\n\tbreak   time  ', 'x'), 'Chai break time');
  });

  it('falls back when empty or missing', () => {
    assert.equal(cleanName('', 'Default'), 'Default');
    assert.equal(cleanName('   \n ', 'Default'), 'Default');
    assert.equal(cleanName(undefined, 'Default'), 'Default');
    assert.equal(cleanName(null, 'Default'), 'Default');
  });

  it('caps the length at MAX_NAME characters without splitting an emoji', () => {
    const out = cleanName('a'.repeat(100), 'x');
    assert.equal(out.length, MAX_NAME);
    // 63 letters then one emoji: the emoji is a whole code point, not half a surrogate pair.
    const emoji = 'a'.repeat(63) + '\u{1F600}\u{1F600}';
    assert.equal(cleanName(emoji, 'x'), 'a'.repeat(63) + '\u{1F600}');
  });
});

describe('packMeta', () => {
  it('uses the defaults for blank fields', () => {
    assert.deepEqual(packMeta('', ''), { title: DEFAULT_TITLE, author: DEFAULT_AUTHOR });
  });

  it('keeps given values, trimmed', () => {
    assert.deepEqual(packMeta(' Exam mode ', ' Surya '), { title: 'Exam mode', author: 'Surya' });
  });
});

describe('wastickersEntries', () => {
  it('puts title.txt and author.txt first, as UTF-8, then the given files unchanged', () => {
    const tray = { name: 'tray.png', data: new Uint8Array([137, 80]) };
    const sticker = { name: 'sticker-01.webp', data: new Uint8Array([1]) };
    const entries = wastickersEntries({ title: 'Chai ☕', author: 'Surya' }, [sticker, tray]);
    assert.deepEqual(entries.map((e) => e.name), ['title.txt', 'author.txt', 'sticker-01.webp', 'tray.png']);
    assert.equal(new TextDecoder().decode(entries[0].data), 'Chai ☕');
    assert.equal(new TextDecoder().decode(entries[1].data), 'Surya');
    assert.equal(entries[2], sticker);
    assert.equal(entries[3], tray);
  });

  it('builds a ZIP whose names are the pack files', () => {
    const files = [{ name: 'sticker-01.webp', data: new Uint8Array([1, 2]) }, { name: 'tray.png', data: new Uint8Array([3]) }];
    const zip = makeZip(wastickersEntries(packMeta('T', 'A'), files));
    assert.deepEqual(zipNames(zip), ['title.txt', 'author.txt', 'sticker-01.webp', 'tray.png']);
  });

  it('leaves the plain pack ZIP names as they were', () => {
    const files = [{ name: 'sticker-01.webp', data: new Uint8Array([1]) }, { name: 'tray.png', data: new Uint8Array([2]) }];
    assert.deepEqual(zipNames(makeZip(files)), ['sticker-01.webp', 'tray.png']);
  });
});

describe('wastickers file name', () => {
  it('is the slugged title with the .wastickers extension', () => {
    assert.equal(`${slug(packMeta('Exam mode ON!', '').title)}.wastickers`, 'exam-mode-on.wastickers');
    assert.equal(`${slug(packMeta('../../etc', '').title)}.wastickers`, 'etc.wastickers');
  });
});
