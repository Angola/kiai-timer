// Generates the PNG app icons with zero dependencies (node:zlib only).
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../app/icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const BG = [0x0f, 0x11, 0x15];
const ACCENT = [0xe5, 0x53, 0x3d];
const DIM = [0x2d, 0x32, 0x40];
const WHITE = [0xff, 0xff, 0xff];

// Shapes in a 100x100 design space; `scale` shrinks content for maskable safe zone.
function shade(x, y, scale, rounded) {
  if (rounded) {
    const r = 22, cx = Math.min(Math.max(x, r), 100 - r), cy = Math.min(Math.max(y, r), 100 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  }
  const u = (x - 50) / scale + 50, v = (y - 50) / scale + 50;
  const d = Math.hypot(u - 50, v - 50);
  // play triangle
  const inTri = (() => {
    const [ax, ay, bx, by, cx2, cy2] = [42, 35, 42, 65, 66, 50];
    const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = s(u, v, ax, ay, bx, by), d2 = s(u, v, bx, by, cx2, cy2), d3 = s(u, v, cx2, cy2, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  })();
  if (inTri) return WHITE;
  if (d >= 29 && d <= 37) {
    // arc covers 300° starting from 12 o'clock, clockwise
    let a = Math.atan2(u - 50, -(v - 50)) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a <= 300 ? ACCENT : DIM;
  }
  return BG;
}

function render(size, { scale = 1, rounded = true } = {}) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade(((x + (sx + .5) / SS) / size) * 100, ((y + (sy + .5) / SS) / size) * 100, scale, rounded);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      px[i] = a ? r / a : 0; px[i + 1] = a ? g / a : 0; px[i + 2] = a ? b / a : 0; px[i + 3] = (a / n) * 255;
    }
  }
  return png(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(OUT + 'icon-192.png', render(192));
writeFileSync(OUT + 'icon-512.png', render(512));
writeFileSync(OUT + 'icon-maskable-512.png', render(512, { scale: 0.78, rounded: false }));
writeFileSync(OUT + 'apple-touch-icon.png', render(180, { rounded: false }));
console.log('icons written to', OUT);
