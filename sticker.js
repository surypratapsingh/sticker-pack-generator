// Pure helpers with no DOM, so node:test can check them.
// Images are ImageData-like objects: { width, height, data: Uint8ClampedArray (RGBA) }.

export const SIZE = 512; // WhatsApp sticker size
export const TRAY = 96; // WhatsApp tray icon size
export const MAX_BYTES = 100 * 1024; // WhatsApp limit for one static sticker
export const MIN_PACK = 3;
export const MAX_PACK = 30;

// Where to draw a w x h image inside a size x size square with `pad` px margin, keeping its shape.
export function fitRect(w, h, size = SIZE, pad = 16) {
  const box = size - 2 * pad;
  // A 0-size image (not decoded) would give NaN; treat it as 1 px.
  w = Math.max(1, w);
  h = Math.max(1, h);
  const s = Math.min(box / w, box / h);
  const dw = Math.max(1, Math.round(w * s));
  const dh = Math.max(1, Math.round(h * s));
  return { x: Math.round((size - dw) / 2), y: Math.round((size - dh) / 2), w: dw, h: dh };
}

const dist = (d, i, c) => Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]));

// The most common colour along the border (colours grouped in steps of 16).
export function borderColour(img) {
  const { width: w, height: h, data } = img;
  const buckets = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 16) return;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(key, b);
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  let best = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n].map(Math.round) : null;
}

// Clears the plain background: pixels close to the main border colour that connect to the border.
// A subject touching the edge stays, because only border pixels near that colour start the fill.
// ponytail: one background colour with a hard edge; busy photo backgrounds need a segmentation model.
export function removeBackground(img, tolerance = 40) {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data);
  const bg = borderColour(img);
  if (!bg) return { width: w, height: h, data };
  const isBg = (p) => data[p * 4 + 3] < 16 || dist(data, p * 4, bg) <= tolerance;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const visit = (x, y) => {
    const p = y * w + x;
    if (!seen[p] && isBg(p)) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
  for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    if (x > 0) visit(x - 1, y);
    if (x < w - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < h - 1) visit(x, y + 1);
  }
  return { width: w, height: h, data };
}

// Adds a solid die-cut outline `radius` px wide around everything that is not transparent.
export function addOutline(img, radius, colour = [255, 255, 255]) {
  const { width: w, height: h, data: src } = img;
  const data = new Uint8ClampedArray(src);
  if (radius <= 0) return { width: w, height: h, data };
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 128;
  const disc = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= radius * radius) disc.push([dx, dy]);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Only edge pixels stamp the disc; inner pixels are already covered.
      if (!solid(x, y) || (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) continue;
      for (const [dx, dy] of disc) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) mask[ny * w + nx] = 1;
      }
    }
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue;
    const i = p * 4, a = data[i + 3] / 255;
    if (a === 1) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * a + colour[c] * (1 - a));
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A ZIP file with no compression (WebP and PNG are compressed already).
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data), size = f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

export const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stickers';

export const MAX_NAME = 64; // characters in a pack title or author
export const DEFAULT_TITLE = 'My stickers';
export const DEFAULT_AUTHOR = 'Sticker Pack Generator';

// One line, trimmed, at most MAX_NAME characters (code points, so emoji are not split), else the fallback.
export function cleanName(s, fallback) {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return Array.from(one).slice(0, MAX_NAME).join('').trim() || fallback;
}

export function packMeta(title, author) {
  return { title: cleanName(title, DEFAULT_TITLE), author: cleanName(author, DEFAULT_AUTHOR) };
}

// Entries of a .wastickers pack: title.txt and author.txt (UTF-8) first, then the sticker and tray files.
export function wastickersEntries(meta, files) {
  const enc = new TextEncoder();
  return [
    { name: 'title.txt', data: enc.encode(meta.title) },
    { name: 'author.txt', data: enc.encode(meta.author) },
    ...files,
  ];
}

export function packProblems(count) {
  if (count < MIN_PACK) return `WhatsApp needs at least ${MIN_PACK} stickers in a pack. Add ${MIN_PACK - count} more.`;
  if (count > MAX_PACK) return `WhatsApp allows at most ${MAX_PACK} stickers in a pack. Remove ${count - MAX_PACK}.`;
  return '';
}
