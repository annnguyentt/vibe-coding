/**
 * Measured average of each model's base-colour texture, in sRGB.
 *
 * instanceColor multiplies the decoded texture in *linear* space, so a palette
 * can only scale what the texture already has. Tints below are therefore plain
 * linear multipliers per channel. Keeping them in a modest range matters: push
 * a channel far past 1 and the texture's bright areas clip, the shading
 * flattens, and the flower goes neon. `npm run check:palettes` prints the
 * colour each tint actually produces so they can be judged, not guessed.
 */
export const TEXTURE_AVERAGE = {
  peony: [0.752, 0.342, 0.382],
  // Deep crimson with almost no green or blue to scale, so MAX_TINT clamps
  // most targets and this model stays in the red family whatever the palette.
  rose: [0.561, 0.039, 0.086],
  lily: [0.827, 0.525, 0.524],
  leaf: [0.378, 0.507, 0.063],
};

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Identity multiplier: shows a model in its own texture colour. */
export const IDENTITY_TINT = [1, 1, 1];

/**
 * Models whose texture is too near-monochrome for a per-channel tint to
 * recolour at all. The rose averages #8f0a16 — almost no green or blue to
 * scale — so reaching gold would need ~30x on green and simply clamps to red.
 * These are recoloured through luminance instead, which reaches any hue.
 *
 * Everything else tints per channel, which keeps the small colour variations
 * in a texture (the lily's stamens, the peony's centres) that collapsing to
 * grey would flatten away.
 */
export const NEEDS_LUMA_RECOLOR = { rose: true };

// Cap for the plain per-channel path, where large gains do clip and go flat.
const MAX_CHANNEL_TINT = 5;
// The desaturated path scales a well-formed luminance signal, so it tolerates
// far more gain — a dark model still has to reach a bright target.
const MAX_LUMA_TINT = 30;

/** Linear-space luminance of an sRGB triple. */
export function linearLuminance(srgb) {
  return (
    0.2126 * srgbToLinear(srgb[0]) +
    0.7152 * srgbToLinear(srgb[1]) +
    0.0722 * srgbToLinear(srgb[2])
  );
}

/**
 * Resolve a tint spec against one model's texture, into linear multipliers.
 *
 *   null      leave the texture alone
 *   '#rrggbb' solve so this model lands on that colour, whatever its own hue
 *   [r, g, b] use these linear multipliers directly
 */
export function resolveTint(spec, textureAverage, desaturate = false) {
  if (!spec) return IDENTITY_TINT;
  if (Array.isArray(spec)) return spec;
  const target = hexToRgb(spec);

  if (desaturate) {
    // The shader has already collapsed the texture to grey, so one scalar
    // carries every channel and the result lands on the target exactly.
    const luma = Math.max(1e-4, linearLuminance(textureAverage));
    return target.map((t) => Math.min(MAX_LUMA_TINT, srgbToLinear(t) / luma));
  }

  return target.map((t, i) => {
    const denominator = srgbToLinear(textureAverage[i]);
    if (denominator < 1e-4) return 0;
    return Math.min(MAX_CHANNEL_TINT, srgbToLinear(t) / denominator);
  });
}

/** The sRGB colour a texture average ends up as once a tint is applied. */
export function resultOf(textureAverage, spec, desaturate = false) {
  const tint = resolveTint(spec, textureAverage, desaturate);
  const base = desaturate
    ? [linearLuminance(textureAverage), linearLuminance(textureAverage), linearLuminance(textureAverage)]
    : textureAverage.map(srgbToLinear);
  return base.map((c, i) => Math.min(1, Math.max(0, linearToSrgb(c * tint[i]))));
}

/** Relative luminance 0..1, the axis a QR scanner binarises on. */
export function luminance(rgbOrHex) {
  const [r, g, b] = typeof rgbOrHex === 'string' ? hexToRgb(rgbOrHex) : rgbOrHex;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * `darkTones` gives every module its own flat colour, so the finished code
 * reads as a pixel mosaic rather than one solid stamp. Indices 3 and 4 are the
 * cobalt drawn from the vase's glaze, which the finder squares always take.
 *
 * Everything the code is built from clears a luminance gap — dark under ~0.45,
 * light over ~0.89 — or a scanner can't separate the modules. Because the QR tints are stated as
 * target colours, every flower lands on the same colour there regardless of
 * its own texture — which is also what lets a model of any hue be dropped in. The page
 * background is white for every palette and is not listed here.
 */
export const PALETTES = [
  {
    // A null bouquet tint is this palette's whole point: the models' own
    // colour, untouched. The QR state still darkens, because the raw peony
    // sits at 0.47 luminance and would not binarise.
    id: 'original',
    label: 'Original',
    accent: '#c96b80',
    ink: '#3b2b31',
    darkTones: ['#7e3348', '#8b3a51', '#6b2a3d', '#26489f', '#2d55b8'],
    bouquetTint: null,
    qrTint: [0.3, 0.34, 0.36],
    bouquetLeaf: null,
    qrLeaf: [0.5, 0.46, 0.55],
  },
  {
    id: 'blush',
    label: 'Blush',
    accent: '#d4587a',
    ink: '#3b2b31',
    darkTones: ['#a83358', '#b83c63', '#8c2848', '#26489f', '#2d55b8'],
    bouquetTint: '#d86d7a',
    qrTint: '#753940',
    bouquetLeaf: '#6b9215',
    qrLeaf: '#455a09',
  },
  {
    id: 'marigold',
    label: 'Marigold',
    accent: '#d2812f',
    ink: '#40301c',
    darkTones: ['#9c5410', '#ab5d14', '#7f430b', '#26489f', '#2d55b8'],
    bouquetTint: '#db7235',
    qrTint: '#783e1d',
    bouquetLeaf: '#6b9211',
    qrLeaf: '#455a07',
  },
  {
    id: 'sunbeam',
    label: 'Sunbeam',
    accent: '#c9a233',
    ink: '#3a3117',
    darkTones: ['#7d6510', '#8b7114', '#63500b', '#26489f', '#2d55b8'],
    bouquetTint: '#cc9b29',
    qrTint: '#6b4f14',
    bouquetLeaf: '#6d9c0f',
    qrLeaf: '#465d06',
  },
  {
    id: 'poppy',
    label: 'Poppy',
    accent: '#d1594c',
    ink: '#3d2427',
    darkTones: ['#a83128', '#b8382e', '#8c2620', '#26489f', '#2d55b8'],
    bouquetTint: '#db5b45',
    qrTint: '#782f25',
    bouquetLeaf: '#699210',
    qrLeaf: '#455a08',
  },
  {
    id: 'azure',
    label: 'Azure',
    accent: '#5b7fbe',
    ink: '#1f2c3d',
    darkTones: ['#1d4f96', '#2359a6', '#153c74', '#26489f', '#2d55b8'],
    bouquetTint: '#5f70b0',
    qrTint: '#3a446e',
    bouquetLeaf: '#5c941c',
    qrLeaf: '#3d5c0f',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    accent: '#8a6fb5',
    ink: '#2e2a44',
    darkTones: ['#4d3a94', '#5743a3', '#3d2e78', '#26489f', '#2d55b8'],
    bouquetTint: '#926198',
    qrTint: '#5b395f',
    bouquetLeaf: '#5e921a',
    qrLeaf: '#3f5c0e',
  },
];

// Neutral, so the code always sits on white whichever palette is picked.
export const LIGHT_TONES = ['#ffffff', '#f6f6f7', '#fbfbfc'];
export const BOARD_COLOR = '#ffffff';
export const PAGE_BACKGROUND = '#ffffff';

export const DEFAULT_PALETTE = PALETTES[0];

export function getPalette(id) {
  return PALETTES.find((p) => p.id === id) || DEFAULT_PALETTE;
}
