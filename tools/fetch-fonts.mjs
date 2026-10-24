// Downloads self-hosted, subsetted copies of the UI fonts (OFL) from Google Fonts.
// Only the characters actually used by the UI are included, so files stay small.
//   Inter        -> digits & Latin (Helvetica/Hiragino-like numerals)
//   Noto Sans JP -> Japanese (Hiragino-like gothic)
// Re-run after changing UI strings:  node tools/fetch-fonts.mjs
// Zero dependencies (Node >= 20 fetch).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const OUT = fileURLToPath(new URL('app/fonts/', root));
const OFL = 'https://raw.githubusercontent.com/google/fonts/main/ofl';

// Every character that can appear in built-in UI text.
const sources = ['app/js/i18n.js', 'app/js/presets.js', 'app/index.html']
  .map(f => readFileSync(new URL(f, root), 'utf8'));
let ascii = '';
for (let c = 0x20; c < 0x7f; c++) ascii += String.fromCharCode(c);
const symbols = '×·…—–−';
const japanese = [...new Set([...'＋（）：！？、。「」・ー〜', ...sources.join('').replace(/[\x00-\x7f]/g, '')])]
  .filter(c => !/\s/.test(c) && !symbols.includes(c))
  .join('');

const FONTS = [
  { family: 'Inter', file: 'inter.woff2', license: 'inter', text: ascii + symbols },
  { family: 'Noto+Sans+JP', file: 'notosansjp.woff2', license: 'notosansjp', text: japanese },
];

// A modern UA is required for Google Fonts to serve woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
mkdirSync(OUT, { recursive: true });

for (const f of FONTS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${f.family}:wght@100..900&display=swap&text=${encodeURIComponent(f.text)}`;
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': UA } })).text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
  if (urls.length !== 1) throw new Error(`${f.family}: expected 1 font url, got ${urls.length}:\n${css}`);

  const font = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
  if (font.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${f.family}: not a woff2 file`);

  writeFileSync(OUT + f.file, font);
  writeFileSync(OUT + `OFL-${f.license}.txt`, await (await fetch(`${OFL}/${f.license}/OFL.txt`)).text());
  console.log(`${f.file}: ${(font.length / 1024).toFixed(1)} KB, ${[...f.text].length} glyphs requested`);
}
