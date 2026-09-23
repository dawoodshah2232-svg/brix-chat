// Generates public/og-cover.png (1200x630) — simple branded social card.
// Hand-rolled PNG writer: vertical gradient + soft glows + bitmap wordmark.
// Run: node scripts/make-og.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1200, H = 630;

// 5x7 bitmap font, A-Z
const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['01110','00100','00100','00100','00100','00100','01110'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
};

const px = new Uint8Array(W * H * 3);
const top = [11, 16, 32], bot = [32, 28, 84];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    px[i] = top[0] + (bot[0] - top[0]) * t;
    px[i + 1] = top[1] + (bot[1] - top[1]) * t;
    px[i + 2] = top[2] + (bot[2] - top[2]) * t;
  }
}

function glow(cx, cy, r, col, alpha) {
  for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const a = alpha * (1 - d * d);
      const i = (y * W + x) * 3;
      px[i] = px[i] * (1 - a) + col[0] * a;
      px[i + 1] = px[i + 1] * (1 - a) + col[1] * a;
      px[i + 2] = px[i + 2] * (1 - a) + col[2] * a;
    }
  }
}
glow(980, 120, 300, [99, 102, 241], 0.55);
glow(170, 540, 260, [6, 182, 212], 0.45);

function text(str, x0, y0, scale, col) {
  let x = x0;
  for (const ch of str) {
    if (ch === ' ') { x += 6 * scale; continue; }
    const g = FONT[ch];
    if (!g) { x += 6 * scale; continue; }
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const xx = x + c * scale + dx, yy = y0 + r * scale + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const i = (yy * W + xx) * 3;
            px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
          }
        }
      }
    }
    x += 6 * scale;
  }
  return x - x0 - scale;
}

const titleW = text('BRIX CHAT', 0, 0, 1, [0, 0, 0]); // measure only via scale math below
const measure = (s, sc) => s.split('').reduce((a, ch) => a + (ch === ' ' ? 6 * sc : 6 * sc), 0) - sc;
const tScale = 13;
const tw = measure('BRIX CHAT', tScale);
text('BRIX CHAT', Math.round((W - tw) / 2), 236, tScale, [255, 255, 255]);
const sScale = 5;
const tag = 'LIVE CHAT FOR MODERN TEAMS';
const sw = measure(tag, sScale);
text(tag, Math.round((W - sw) / 2), 380, sScale, [160, 175, 205]);

// raw scanlines (filter 0) -> deflate -> PNG
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(px.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (1 + W * 3) + 1);
}
const comp = deflateSync(raw);

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0)),
]);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og-cover.png');
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
