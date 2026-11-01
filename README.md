# Sticker Pack Generator

**Live:** https://sticker-pack-generator.vercel.app/

Turn photos and short text into a sticker pack, in the browser. Nothing is uploaded.

## What it does
- Add images (choose, drag and drop, or paste), or make text-only stickers.
- **Remove plain background:** clears the main border colour where it touches the edge. A tolerance slider controls how close a colour must be.
- **Die-cut outline:** a white border 0 to 16 px wide around the sticker.
- **Caption:** text at the top, middle or bottom, sized to fit, with a contrasting stroke.
- **Export:** each sticker is 512 x 512 px WebP with a transparent background. WebP quality steps down until the file is under 100 KB (the WhatsApp limit). The pack is one ZIP with the stickers and a 96 x 96 `tray.png`. It warns when a pack has fewer than 3 or more than 30 stickers (the WhatsApp rules).

## How it works
- `sticker.js`: pure functions with no DOM: fit-to-square maths, flood-fill background removal, outline, CRC-32 and a small ZIP writer (stored, no compression, because WebP and PNG are compressed already).
- `app.js`: canvas drawing, captions, WebP encoding and the page.
- No framework, no build step, no dependencies.

## Run and test
Node 18 or newer.

```bash
npm test
```

```bash
python -m http.server 8080
```

Then open http://127.0.0.1:8080.

## Limits
- Background removal works for one plain background colour. A busy photo background needs a segmentation model.
- Safari cannot encode WebP, so there it saves PNG.
- WhatsApp needs a sticker-maker app to import a pack from files.
