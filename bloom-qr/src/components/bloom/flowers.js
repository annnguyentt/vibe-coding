/**
 * Selectable blossoms. Each model is authored to the same convention: pivot at
 * the flower's base, facing +Y, roughly two units across — so the scene can
 * swap one for another without re-tuning any of the layout maths.
 */
export const FLOWERS = [
  { id: 'peony', label: 'Peony', url: '/models/qr-peony.glb' },
  { id: 'lily', label: 'Lily', url: '/models/qr-lily.glb' },
  { id: 'rose', label: 'Rose', url: '/models/qr-rose.glb' },
];

export const DEFAULT_FLOWER = FLOWERS[0];

export function getFlower(id) {
  return FLOWERS.find((f) => f.id === id) || DEFAULT_FLOWER;
}
