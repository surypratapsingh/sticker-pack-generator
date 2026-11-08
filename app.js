import { SIZE, TRAY, MAX_BYTES, MAX_PACK, fitRect, removeBackground, addOutline, makeZip, slug, packProblems, sizeProblems } from './sticker.js';

const $ = (s) => document.querySelector(s);
const grid = $('#grid');
const stickers = [];
let nextId = 1;

const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
};

function wrap(ctx, text, max) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function drawCaption(ctx, s) {
  const text = s.caption.trim();
  const max = SIZE - 48;
  const room = s.img ? SIZE * 0.4 : SIZE - 48;
  let size = s.img ? 64 : 104, lines;
  for (; size > 24; size -= 4) {
    ctx.font = `800 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    lines = wrap(ctx, text, max);
    if (lines.length * size * 1.15 <= room && lines.every((l) => ctx.measureText(l).width <= max)) break;
  }
  const lh = size * 1.15, block = lines.length * lh;
  const y0 = s.place === 'top' ? 24 : s.place === 'bottom' ? SIZE - 24 - block : (SIZE - block) / 2;
  Object.assign(ctx, { textAlign: 'center', textBaseline: 'top', lineJoin: 'round', fillStyle: s.colour,
    strokeStyle: isDark(s.colour) ? '#ffffff' : '#111111', lineWidth: Math.max(6, size / 5) });
  lines.forEach((l, i) => {
    ctx.strokeText(l, SIZE / 2, y0 + i * lh);
    ctx.fillText(l, SIZE / 2, y0 + i * lh);
  });
}

function render(s) {
  const ctx = s.canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (s.img) {
    const r = fitRect(s.img.naturalWidth, s.img.naturalHeight, SIZE, s.outline + 12);
    if (s.removeBg) {
      const t = document.createElement('canvas');
      t.width = r.w; t.height = r.h;
      const tctx = t.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(s.img, 0, 0, r.w, r.h);
      const cut = removeBackground(tctx.getImageData(0, 0, r.w, r.h), s.tolerance);
      tctx.putImageData(new ImageData(cut.data, r.w, r.h), 0, 0);
      ctx.drawImage(t, r.x, r.y);
    } else {
      ctx.drawImage(s.img, r.x, r.y, r.w, r.h);
    }
  }
  if (s.caption.trim()) drawCaption(ctx, s);
  if (s.outline) {
    const out = addOutline(ctx.getImageData(0, 0, SIZE, SIZE), s.outline);
    ctx.putImageData(new ImageData(out.data, SIZE, SIZE), 0, 0);
  }
  clearTimeout(s.sizeTimer);
  s.sizeTimer = setTimeout(async () => {
    const blob = await encode(s.canvas);
    s.card.querySelector('.size').textContent =
      `${Math.round(blob.size / 1024)} KB ${blob.type === 'image/webp' ? 'WebP' : 'PNG'}${blob.size > MAX_BYTES ? ' (over 100 KB)' : ''}`;
  }, 300);
}

// Lowers WebP quality until the file fits under the WhatsApp limit.
async function encode(canvas) {
  let blob;
  for (const q of [0.92, 0.85, 0.75, 0.65, 0.5, 0.35]) {
    blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', q));
    if (blob.type !== 'image/webp' || blob.size <= MAX_BYTES) break;
  }
  return blob;
}

function save(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function add({ img = null, url = null, caption = '', colour = '#ffffff' }) {
  if (stickers.length >= MAX_PACK) { $('#msg').textContent = packProblems(MAX_PACK + 1); return; }
  const s = { id: nextId++, img, url, caption, colour, removeBg: false, tolerance: 40, outline: img ? 10 : 0, place: img ? 'bottom' : 'middle' };
  s.card = document.createElement('article');
  s.card.className = 'card';
  s.card.dataset.id = s.id;
  s.card.innerHTML = `
    <canvas width="${SIZE}" height="${SIZE}" role="img" aria-label="Sticker preview"></canvas>
    <div class="ctl">
      ${img ? `<label for="bg${s.id}">Background</label><label><input id="bg${s.id}" type="checkbox" data-f="removeBg"> Remove plain background</label>
      <label for="tol${s.id}">Tolerance</label><input id="tol${s.id}" type="range" min="5" max="120" value="40" data-f="tolerance">` : ''}
      <label for="out${s.id}">Outline</label><input id="out${s.id}" type="range" min="0" max="16" value="${s.outline}" data-f="outline">
      <label for="cap${s.id}">Caption</label><input id="cap${s.id}" type="text" maxlength="60" value="${esc(caption)}" placeholder="Optional text" data-f="caption">
      <label for="pl${s.id}">Position</label><select id="pl${s.id}" data-f="place">
        ${['top', 'middle', 'bottom'].map((p) => `<option${p === s.place ? ' selected' : ''}>${p}</option>`).join('')}</select>
      <label for="col${s.id}">Text colour</label><input id="col${s.id}" type="color" value="${colour}" data-f="colour">
    </div>
    <div class="foot"><span class="size">…</span><span class="spacer"></span>
      <button data-act="one">Download</button><button data-act="del" aria-label="Remove sticker">Remove</button></div>`;
  s.canvas = s.card.querySelector('canvas');
  stickers.push(s);
  grid.append(s.card);
  render(s);
  update();
}

function update() {
  const n = stickers.length;
  $('#count').textContent = `${n} / ${MAX_PACK}`;
  $('#download').disabled = n === 0;
  $('#empty').hidden = n > 0;
  $('#msg').textContent = n ? packProblems(n) : '';
  stickers.forEach((s, i) => {
    s.canvas.setAttribute('aria-label', `Sticker ${i + 1} preview`);
    // Same button text on every card, so name each one by its sticker.
    s.card.querySelector('[data-act="one"]').setAttribute('aria-label', `Download sticker ${i + 1}`);
    s.card.querySelector('[data-act="del"]').setAttribute('aria-label', `Remove sticker ${i + 1}`);
  });
}

const byCard = (el) => stickers.find((s) => s.id === Number(el.closest('.card')?.dataset.id));

grid.addEventListener('input', (e) => {
  const s = byCard(e.target), f = e.target.dataset.f;
  if (!s || !f) return;
  s[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
  cancelAnimationFrame(s.frame);
  s.frame = requestAnimationFrame(() => render(s));
});

grid.addEventListener('click', async (e) => {
  const act = e.target.dataset.act, s = byCard(e.target);
  if (!act || !s) return;
  const n = stickers.indexOf(s) + 1;
  if (act === 'one') {
    const blob = await encode(s.canvas);
    save(blob, `sticker-${String(n).padStart(2, '0')}.${blob.type === 'image/webp' ? 'webp' : 'png'}`);
  } else {
    stickers.splice(n - 1, 1);
    s.card.remove();
    if (s.url) URL.revokeObjectURL(s.url);
    update();
  }
});

function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => add({ img, url });
    img.onerror = () => { $('#msg').textContent = `Could not open ${file.name}.`; URL.revokeObjectURL(url); };
    img.src = url;
  }
}

$('#choose').addEventListener('click', () => $('#files').click());
$('#files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#add-text').addEventListener('click', () => add({ caption: 'Your text', colour: '#0f766e' }));
$('#sample').addEventListener('click', () => {
  [['Chai break?', '#b45309'], ['On my way', '#2563eb'], ['Exam mode ON', '#be123c'], ['Thank you!', '#15803d']]
    .forEach(([caption, colour]) => add({ caption, colour }));
});
const drop = $('#drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
document.addEventListener('paste', (e) => addFiles([...e.clipboardData.files]));

$('#download').addEventListener('click', async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const files = [];
    for (const [i, s] of stickers.entries()) {
      const blob = await encode(s.canvas);
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      files.push({ name: `sticker-${String(i + 1).padStart(2, '0')}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const tray = Object.assign(document.createElement('canvas'), { width: TRAY, height: TRAY });
    tray.getContext('2d').drawImage(stickers[0].canvas, 0, 0, TRAY, TRAY);
    const trayBlob = await new Promise((r) => tray.toBlob(r, 'image/png'));
    files.push({ name: 'tray.png', data: new Uint8Array(await trayBlob.arrayBuffer()) });
    // Still exports, so the user can fix it; the message says what WhatsApp will reject.
    $('#msg').textContent = [packProblems(stickers.length), ...sizeProblems(files)].filter(Boolean).join(' ');
    save(new Blob([makeZip(files)], { type: 'application/zip' }), `${slug($('#pack-name').value)}.zip`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download pack (.zip)';
  }
});

update();
