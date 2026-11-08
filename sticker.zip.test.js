import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeZip, crc32 } from './sticker.js';

// Reads a ZIP the way a reader does: end record, then central directory, then each local header.
// Only handles what makeZip writes (stored entries, no extra fields, no comment).
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const end = bytes.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'end record signature');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true); // central directory offset
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50, 'central header signature');
    const method = v.getUint16(at + 10, true);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const localAt = v.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    // The local header must agree with the central entry.
    assert.equal(v.getUint32(localAt, true), 0x04034b50, `local header for ${name}`);
    assert.equal(v.getUint16(localAt + 8, true), method, `method for ${name}`);
    assert.equal(v.getUint32(localAt + 14, true), crc, `crc for ${name}`);
    assert.equal(v.getUint32(localAt + 18, true), size, `size for ${name}`);
    const localNameLen = v.getUint16(localAt + 26, true);
    assert.equal(dec.decode(bytes.subarray(localAt + 30, localAt + 30 + localNameLen)), name, 'local name');
    const dataAt = localAt + 30 + localNameLen;
    entries.push({ name, crc, data: bytes.slice(dataAt, dataAt + size) });
    at += 46 + nameLen;
  }
  assert.equal(at, end, 'central directory ends where the end record starts');
  return entries;
}

describe('makeZip round trip', () => {
  it('each central entry points at its local header and its bytes come back intact', () => {
    const files = [
      { name: 'sticker-01.webp', data: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 1, 2, 255]) },
      { name: 'tray.png', data: new Uint8Array(4000).map((_, i) => (i * 37) & 0xff) },
      { name: 'empty.txt', data: new Uint8Array(0) },
    ];
    const entries = readZip(makeZip(files));
    assert.deepEqual(entries.map((e) => e.name), files.map((f) => f.name));
    entries.forEach((e, i) => {
      assert.deepEqual(e.data, files[i].data, `bytes of ${e.name}`);
      assert.equal(e.crc, crc32(files[i].data), `crc of ${e.name}`);
    });
  });

  it('keeps UTF-8 file names byte-exact', () => {
    const entries = readZip(makeZip([{ name: 'chai-☕.txt', data: new Uint8Array([1]) }]));
    assert.equal(entries[0].name, 'chai-☕.txt');
  });
});
