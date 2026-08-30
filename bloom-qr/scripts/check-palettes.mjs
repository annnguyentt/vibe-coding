// Asserts the luminance separation every palette needs to stay machine-readable,
// and prints the colour each tint actually produces so they can be eyeballed.
// A scanner binarises on luminance, so anything sitting on a dark module has to
// stay well below the light modules — for BOTH flowers, since the lily's
// texture is much lighter than the peony's.
import {
  PALETTES,
  LIGHT_TONES,
  TEXTURE_AVERAGE,
  luminance,
  resultOf,
  NEEDS_LUMA_RECOLOR,
} from '../src/components/bloom/palettes.js';

const MAX_DARK = 0.45;
const MIN_LIGHT = 0.89;
const hex = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

const lightest = Math.min(...LIGHT_TONES.map(luminance));
let failed = 0;

for (const p of PALETTES) {
  const rows = [];
  const onCode = [];

  for (const [model, tintKey, bouquetKey] of [
    ['peony', 'qrTint', 'bouquetTint'],
    ['rose', 'qrTint', 'bouquetTint'],
    ['lily', 'qrTint', 'bouquetTint'],
    ['leaf', 'qrLeaf', 'bouquetLeaf'],
  ]) {
    const desat = !!NEEDS_LUMA_RECOLOR[model] && typeof p[bouquetKey] === 'string';
    const bouquet = resultOf(TEXTURE_AVERAGE[model], p[bouquetKey], desat);
    const code = resultOf(TEXTURE_AVERAGE[model], p[tintKey], desat);
    onCode.push({ what: model, lum: luminance(code) });
    rows.push(`${model}: bouquet ${hex(bouquet)} -> code ${hex(code)} (${luminance(code).toFixed(3)})`);
  }
  for (const tone of p.darkTones) onCode.push({ what: `tile ${tone}`, lum: luminance(tone) });

  const worst = onCode.reduce((a, b) => (b.lum > a.lum ? b : a));
  const ok = worst.lum <= MAX_DARK && lightest >= MIN_LIGHT;
  if (!ok) failed += 1;

  console.log(`${p.id.padEnd(9)} ${ok ? 'OK  ' : 'FAIL'} worst-on-code ${worst.what} ${worst.lum.toFixed(3)} (max ${MAX_DARK})`);
  for (const r of rows) console.log(`          ${r}`);
}

console.log(failed ? `\n${failed} palette(s) would not scan reliably.` : '\nAll palettes scannable.');
process.exit(failed ? 1 : 0);
