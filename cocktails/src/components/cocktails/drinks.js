// The drinks. Centimetres, y up from the foot. A glass is its profile turned round y: [radius,
// height, half the glass's thickness] up the wall of the bowl from its bottom on the axis to the
// rim, and out along the foot and up the stem. Each one is measured off the picture it comes from:
// a pink margarita, an Aperol spritz in a wide glass that tapers to the rim and flares down into its
// stem, a violet cocktail in a saucer under a block of ice with a flower on it, a Manhattan in a
// coupe with maraschino cherries on a pick, a Lavender Field under a dome of foam strewn with
// flowers, a Mrs. Fild with a caramel shard across the rim, a Pode & Dill with a pink chocolate
// ribbon and pearls, and an Enzoni with a grape on its vine.

export const DRINKS = [
  {
    slug: 'pink-margarita',
    name: 'Pink Margarita',
    glass: {
      // prettier-ignore
      wall: [
        [0, 9.7, 0.2], [1.0, 9.92, 0.1], [1.75, 10.5, 0.085], [2.25, 11.4, 0.08], [2.45, 12.4, 0.08],
        [2.45, 13.0, 0.08], [2.55, 13.55, 0.08], [3.3, 13.82, 0.08], [4.2, 14.02, 0.08], [4.72, 14.5, 0.08],
        [4.98, 15.4, 0.075], [5.15, 16.5, 0.07], [5.22, 17.05, 0.06],
      ],
      // prettier-ignore
      stem: [
        [3.3, 0.1, 0.09], [1.5, 0.27, 0.13], [0, 0.62, 0.48], [0, 1.6, 0.25], [0, 5.0, 0.2],
        [0, 8.7, 0.24], [0, 9.35, 0.36], [0, 9.75, 0.3],
      ],
    },
    full: 16.3,
    liquid: {
      absorb: [0.02, 0.62, 0.24],
      scatter: 0.05,
      glow: '#ff6aa6',
    },
    // condensation: how thick, from where up to the line it was poured to, and how many big and
    // small beads stand on it
    frost: { amount: 0.9, low: 9.95, beads: [0.22, 0.5] },
    iceCloud: 1,
    // ice cubes floating in the top bowl: centre (at the full line), half size, corner, turn
    // prettier-ignore
    cubes: [
      { at: [-2.2, 15.95, 0.75], size: [1.15, 1.1, 1.18], corner: 0.32, turn: [0.12, 0.5, -0.08] },
      { at: [1.05, 16.0, -1.95], size: [1.12, 1.12, 1.1], corner: 0.3, turn: [-0.1, 1.2, 0.14] },
      { at: [0.85, 15.9, 2.05], size: [1.18, 1.08, 1.12], corner: 0.34, turn: [0.18, -0.4, 0.06] },
    ],
    garnish: {
      kind: 'lime',
      // where the lime's core runs, out through the rim and tipped up; and how far its peel turns
      // away from the camera, so the cut flesh faces it
      centre: [4.4, 16.05, 0],
      tip: 20,
      roll: 30,
    },
    drop: { from: [3, 22, 1], spin: [0.6, 0.3, -0.7] },
    view: { target: 9.8, distance: 52, pitch: 8 },
  },
  {
    slug: 'aperol-spritz',
    name: 'Aperol Spritz',
    glass: {
      // the bowl tapers in to the rim from a round shoulder low down, and its floor flares down
      // into the stem, the drink running a little way down inside it
      // prettier-ignore
      wall: [
        [0, 7.45, 0.3], [0.42, 7.62, 0.26], [0.58, 8.1, 0.12], [0.86, 8.72, 0.1], [1.39, 9.42, 0.1],
        [2.63, 10.13, 0.1], [4.4, 11.02, 0.1], [6.0, 12.1, 0.1], [6.44, 12.7, 0.1], [6.66, 13.25, 0.1],
        [6.6, 13.8, 0.09], [5.68, 16.88, 0.08], [4.75, 19.95, 0.07],
      ],
      // prettier-ignore
      stem: [
        [4.1, 0.13, 0.12], [2.2, 0.26, 0.15], [0, 0.42, 0.34], [0, 1.3, 0.66], [0, 4.5, 0.68], [0, 6.9, 0.7],
      ],
    },
    full: 15.15,
    liquid: {
      absorb: [0.01, 0.32, 1.1],
      scatter: 0.035,
      glow: '#ff7a3a',
    },
    frost: { amount: 0, low: 0, beads: [0, 0] },
    iceCloud: 1,
    // one big frosted block riding high, and another under the surface
    // prettier-ignore
    cubes: [
      { at: [-0.4, 14.3, -0.4], size: [1.8, 1.55, 1.7], corner: 0.35, turn: [0.45, 0.7, 0.5] },
      { at: [-3.6, 12.8, 1.8], size: [1.25, 1.1, 1.2], corner: 0.3, turn: [0.2, -0.3, 0.6] },
    ],
    garnish: {
      kind: 'slice',
      // an orange wheel, slit to its middle and pushed onto the rim on the right, face to the camera
      centre: [4.8, 20.1, 0],
      radius: 3.7,
      thick: 0.32,
      peel: 0.22,
      pith: 0.3,
      // degrees: turned round y, tipped back, spun in its own plane
      turn: [-16, 0, 12],
    },
    // where the garnish falls in from, and how far it's turned on the way
    drop: { from: [3, 20, 2], spin: [0.4, -0.5, 0.8] },
    view: { target: 11.2, distance: 60, pitch: 8 },
  },
  {
    slug: 'violet-orchid',
    name: 'Violet Orchid',
    glass: {
      // a saucer: wide and shallow, on a long stem that flares at both ends
      // prettier-ignore
      wall: [
        [0, 13.45, 0.2], [1.5, 13.52, 0.1], [3.0, 13.68, 0.09], [4.25, 14.0, 0.085], [5.15, 14.55, 0.08],
        [5.7, 15.35, 0.075], [5.92, 16.3, 0.07], [6.0, 17.2, 0.06],
      ],
      // prettier-ignore
      stem: [
        [4.6, 0.1, 0.11], [2.4, 0.24, 0.15], [0, 0.4, 0.32], [0, 1.0, 0.45], [0, 2.2, 0.22], [0, 9.0, 0.2],
        [0, 12.6, 0.3], [0, 13.3, 0.5],
      ],
    },
    full: 16.3,
    liquid: {
      absorb: [0.3, 0.45, 0.025],
      scatter: 0.02,
      glow: '#6a4cff',
    },
    frost: { amount: 0, low: 0, beads: [0, 0] },
    iceCloud: 0.45,
    // one big block, too tall to float in a saucer: it sits on the bottom, standing out of the drink
    // prettier-ignore
    cubes: [
      { at: [0.1, 14.6, 0.0], size: [3.2, 2.0, 3.1], corner: 0.6, turn: [0.04, 0.35, -0.03], rough: 2.2 },
    ],
    garnish: {
      kind: 'flower',
      // a pink orchid laid on top of the ice, riding it
      rides: 0,
      size: 1.45,
    },
    drop: { from: [2, 18, 1], spin: [0.5, 0.9, -0.4] },
    view: { target: 10.6, distance: 56, pitch: 9 },
  },
  {
    slug: 'manhattan',
    name: 'Manhattan',
    glass: {
      // a coupe: a round bowl on a tall thin stem with a little knob at its foot
      // prettier-ignore
      wall: [
        [0, 11.85, 0.22], [1.4, 11.98, 0.09], [2.8, 12.35, 0.085], [4.1, 13.05, 0.08], [5.05, 14.1, 0.08],
        [5.5, 15.2, 0.075], [5.62, 16.2, 0.07], [5.55, 17.0, 0.06],
      ],
      // prettier-ignore
      stem: [
        [4.3, 0.1, 0.1], [2.2, 0.22, 0.14], [0, 0.35, 0.3], [0, 0.85, 0.4], [0, 1.5, 0.24], [0, 6.0, 0.23],
        [0, 11.0, 0.26], [0, 11.75, 0.42],
      ],
    },
    full: 15.7,
    liquid: {
      absorb: [0.05, 0.2, 0.75],
      scatter: 0.01,
      glow: '#e09040',
    },
    frost: { amount: 0, low: 0, beads: [0, 0] },
    iceCloud: 1,
    cubes: [],
    garnish: {
      kind: 'cherries',
      // a silver pick lying across the glass: its point down in the drink against the bowl, its
      // ball end out over the rim at the back; two maraschino cherries on it, half in the drink
      pick: [
        [-4.6, 14.5, 2.0],
        [4.58, 17.37, -4.94],
      ],
      // how far along the pick each cherry sits
      along: [0.36, 0.53],
    },
    drop: { from: [2, 20, 1], spin: [0.3, 0.8, -0.5] },
    view: { target: 9.8, distance: 54, pitch: 9 },
  },
  {
    slug: 'lavender-field',
    name: 'Lavender Field',
    glass: {
      // a wide bowl with rounded sides on a long stem
      // prettier-ignore
      wall: [
        [0, 10.4, 0.2], [0.7, 10.55, 0.1], [2.3, 11.2, 0.085], [3.8, 12.15, 0.08], [4.85, 13.2, 0.075],
        [5.4, 14.1, 0.065],
      ],
      // prettier-ignore
      stem: [
        [3.8, 0.1, 0.1], [1.9, 0.22, 0.14], [0, 0.35, 0.3], [0, 1.0, 0.3], [0, 1.6, 0.22], [0, 9.3, 0.2],
        [0, 10.1, 0.3], [0, 10.45, 0.28],
      ],
    },
    full: 12.9,
    liquid: {
      absorb: [0.18, 1.5, 0.55],
      scatter: 0.03,
      glow: '#c0306a',
    },
    frost: { amount: 0, low: 0, beads: [0, 0] },
    iceCloud: 1,
    cubes: [],
    // a head of lilac foam from the drink up past the rim, piled into a tall dome
    foam: { height: 4.4, spread: 1.0 },
    garnish: {
      kind: 'flowers',
      // edible flowers laid on the dome: round it in degrees (90 faces the camera) and up it
      // (0 at the rim, 90 on top), and how wide
      // prettier-ignore
      flowers: [
        { kind: 'pansy', at: [78, 48], size: 1.35 }, { kind: 'cornflower', at: [138, 40], size: 1.25 },
        { kind: 'marigold', at: [42, 14], size: 1.4 }, { kind: 'viola', at: [24, 46], size: 0.95 },
        { kind: 'viola', at: [12, 28], size: 0.85 }, { kind: 'star', at: [118, 58], size: 0.62 },
        { kind: 'star', at: [100, 26], size: 0.58 }, { kind: 'star', at: [32, 24], size: 0.55 },
        { kind: 'star', at: [64, 82], size: 0.62 }, { kind: 'alyssum', at: [88, 20], size: 0.7 },
        { kind: 'alyssum', at: [108, 74], size: 0.65 }, { kind: 'carnation', at: [166, 12], size: 0.9 },
      ],
    },
    view: { target: 11.4, distance: 58, pitch: 9 },
  },
  {
    slug: 'mrs-fild',
    name: 'Mrs. Fild',
    glass: {
      // a round bowl, closing in a little at the rim, on a very tall stem
      // prettier-ignore
      wall: [
        [0, 11.2, 0.22], [1.6, 11.45, 0.09], [3.1, 12.3, 0.085], [4.2, 13.6, 0.08], [4.6, 15.0, 0.075],
        [4.6, 16.4, 0.07], [4.45, 17.6, 0.06],
      ],
      // prettier-ignore
      stem: [
        [3.8, 0.1, 0.1], [1.9, 0.22, 0.14], [0, 0.35, 0.3], [0, 1.1, 0.3], [0, 1.8, 0.2], [0, 9.8, 0.19],
        [0, 10.8, 0.3], [0, 11.2, 0.3],
      ],
    },
    full: 16.7,
    liquid: {
      absorb: [0.03, 0.08, 0.3],
      scatter: 0.28,
      glow: '#f3d9a8',
    },
    frost: { amount: 0.55, low: 11.6, beads: [0.08, 0.45] },
    iceCloud: 1,
    cubes: [],
    garnish: {
      kind: 'shard',
      // a long thin shard of caramel laid across the rim, sugar crystals on it: where its middle
      // is, which way it runs and which way its face looks, its half length, half width and half
      // thickness, how much its ends droop, and the crystals (along it, across it, size)
      centre: [0.3, 17.78, 0.2],
      along: [0.9, 0.0, -0.42],
      face: [0.0, 1.0, 0.0],
      length: 5.2,
      width: 1.55,
      thick: 0.08,
      bend: 0.012,
      // prettier-ignore
      bits: [
        [-2.8, 0.2, 0.32], [-1.9, -0.4, 0.3], [-1.2, 0.35, 0.34], [-0.2, -0.25, 0.28], [0.6, 0.4, 0.32],
        [1.5, -0.3, 0.3], [2.3, 0.3, 0.33], [3.1, -0.1, 0.27], [-0.8, -0.6, 0.25],
      ],
    },
    drop: { from: [3, 18, 1], spin: [0.3, 0.6, -0.4] },
    view: { target: 10.8, distance: 58, pitch: 20 },
  },
  {
    slug: 'pode-and-dill',
    name: 'Pode & Dill',
    glass: {
      // a deep round bowl on a tall stem
      // prettier-ignore
      wall: [
        [0, 12.6, 0.22], [1.6, 12.85, 0.09], [3.2, 13.7, 0.085], [4.4, 15.2, 0.08], [4.95, 16.9, 0.075],
        [5.0, 18.4, 0.07], [4.85, 20.1, 0.06],
      ],
      // prettier-ignore
      stem: [
        [4.0, 0.1, 0.1], [2.0, 0.22, 0.14], [0, 0.35, 0.3], [0, 1.1, 0.32], [0, 1.9, 0.22], [0, 11.2, 0.22],
        [0, 12.2, 0.32], [0, 12.6, 0.3],
      ],
    },
    full: 19.0,
    liquid: {
      absorb: [0.02, 0.16, 0.42],
      scatter: 0.15,
      glow: '#ffab7a',
    },
    frost: { amount: 0.5, low: 13.0, beads: [0.08, 0.45] },
    iceCloud: 1,
    cubes: [],
    garnish: {
      kind: 'ribbon',
      // a fluted ribbon of pink chocolate leaning on the rim at the front left, one end up over the
      // glass, the other hanging down outside it, its face to the camera, sugar pearls along it
      centre: [-2.8, 20.7, 4.6],
      along: [0.8, 0.52, -0.3],
      face: [0.1, 0.35, 1.0],
      length: 6.4,
      width: 1.9,
      thick: 0.08,
      bend: 0.03,
      // prettier-ignore
      bits: [
        [-3.2, 0.6, 0.38], [-2.4, -0.4, 0.22], [-1.0, 0.9, 0.2], [0.6, 0.2, 0.26], [1.8, -0.7, 0.2],
        [2.8, 0.5, 0.24], [3.6, -0.2, 0.18],
      ],
    },
    drop: { from: [2, 18, 1], spin: [0.4, -0.3, 0.5] },
    view: { target: 12.2, distance: 62, pitch: 9 },
  },
  {
    slug: 'enzoni',
    name: 'Enzoni',
    glass: {
      // a small tulip with a flared lip on a long stem
      // prettier-ignore
      wall: [
        [0, 11.5, 0.22], [0.8, 11.8, 0.09], [2.0, 12.6, 0.085], [3.2, 13.8, 0.08], [3.95, 15.2, 0.075],
        [4.2, 16.1, 0.07], [4.35, 16.5, 0.06],
      ],
      // prettier-ignore
      stem: [
        [4.0, 0.1, 0.1], [2.0, 0.22, 0.14], [0, 0.35, 0.3], [0, 1.1, 0.3], [0, 1.8, 0.2], [0, 10.3, 0.19],
        [0, 11.1, 0.3], [0, 11.5, 0.3],
      ],
    },
    full: 15.9,
    liquid: {
      absorb: [0.2, 0.07, 1.3],
      scatter: 0.32,
      glow: '#e9ee8c',
    },
    frost: { amount: 0, low: 0, beads: [0, 0] },
    iceCloud: 0.1,
    // one big clear cube
    // prettier-ignore
    cubes: [
      { at: [0.6, 15.2, -0.3], size: [1.5, 1.4, 1.5], corner: 0.22, turn: [0.08, 0.5, -0.06] },
    ],
    garnish: {
      kind: 'grape',
      // a green grape on the rim at the left, on a bit of its vine: the grape (centre, radius),
      // then the twig, a point and a thickness at a time
      grape: [-3.0, 17.1, 1.0, 1.0],
      // prettier-ignore
      twig: [
        [-2.7, 18.0, 0.9, 0.075], [-1.6, 18.5, 0.5, 0.065], [-0.2, 18.4, 0.1, 0.055], [1.0, 18.6, -0.2, 0.045],
        [-1.2, 19.9, 0.3, 0.04], [0.4, 18.9, 0.0, 0.04],
      ],
    },
    drop: { from: [2, 16, 1], spin: [0.3, 0.5, -0.6] },
    view: { target: 10.4, distance: 54, pitch: 10 },
  },
];

// how wide the hollow of the bowl is at height y (to the inside of the glass), or 0 below it
export function innerRadius(glass, y) {
  const w = glass.wall;
  if (y < w[0][1]) return 0;
  for (let i = 0; i < w.length - 1; i++) {
    const [ra, ya, ta] = w[i];
    const [rb, yb, tb] = w[i + 1];
    if (y >= ya && y <= yb) {
      const h = yb === ya ? 0 : (y - ya) / (yb - ya);
      return Math.max(ra + (rb - ra) * h - (ta + (tb - ta) * h), 0);
    }
  }
  return w[w.length - 1][0] - w[w.length - 1][2];
}
