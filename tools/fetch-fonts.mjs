// Downloads a self-hosted, subsetted copy of the UI font (OFL) from Google Fonts.
// Only the characters actually used by the UI are included, so the file stays small.
// Re-run after changing UI strings:  node tools/fetch-fonts.mjs
// Zero dependencies (Node >= 20 fetch).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const OUT = fileURLToPath(new URL('app/fonts/', root));
const FAMILY = 'M+PLUS+1';
const FILE = 'mplus1.woff2';
const LICENSE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/mplus1/OFL.txt';

// Every character that can appear in built-in UI text.
const sources = ['app/js/i18n.js', 'app/js/presets.js', 'app/index.html']
  .map(f => readFileSync(new URL(f, root), 'utf8'));
let ascii = '';
for (let c = 0x20; c < 0x7f; c++) ascii += String.fromCharCode(c);
const extra = '×·…—–−＋（）：！？、。「」・ー〜✓▶';
const chars = [...new Set([...ascii, ...extra, ...sources.join('').replace(/[\x00-\x7f]/g, '')])]
  .filter(c => !/\s/.test(c) || c === ' ')
  .join('');

const cssUrl = `https://fonts.googleapis.com/css2?family=${FAMILY}:wght@100..900&display=swap&text=${encodeURIComponent(chars)}`;
// A modern UA is required for Google Fonts to serve woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const css = await (await fetch(cssUrl, { headers: { 'User-Agent': UA } })).text();
const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
if (urls.length !== 1) throw new Error(`expected 1 font url, got ${urls.length}:\n${css}`);

const font = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
if (font.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error('not a woff2 file');

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + FILE, font);
writeFileSync(OUT + 'OFL.txt', await (await fetch(LICENSE)).text());
console.log(`${FILE}: ${(font.length / 1024).toFixed(1)} KB, ${[...chars].length} glyphs requested`);
