// The package entry pulls in the canvas/SVG renderers and an `fs` shim that
// the bundler resolves through a `browser` field; that path stalls under
// Turbopack. The core encoder is pure computation and imports cleanly.
import QrCore from 'qrcode/lib/core/qrcode.js';
import AlignmentPattern from 'qrcode/lib/core/alignment-pattern.js';

// Modules of light margin the spec requires around the symbol. Without it a
// scanner can't find the symbol's edges, so the board always renders this much
// extra light surface beyond the matrix.
export const QUIET_ZONE = 4;

/**
 * Mark every module a scanner relies on structurally rather than for payload:
 * the three finder patterns and their separators, the format-information
 * strips beside them, both timing lines, the alignment patterns, and (from
 * version 7) the version-information blocks.
 *
 * Flowers and leaves are deliberately a little wider than one module so their
 * coverage reads as continuous, which means they bleed a fraction of a module
 * past their own cell. That is harmless over payload modules — error
 * correction absorbs it — but softening the edge of a finder or a timing line
 * costs the scanner the geometry it locates the symbol with, and the decode
 * fails outright. So decorations are kept off these entirely.
 */
function buildReservedMask(size, version) {
  const reserved = new Uint8Array(size * size);
  const mark = (row, col) => {
    if (row >= 0 && row < size && col >= 0 && col < size) reserved[row * size + col] = 1;
  };
  const markBlock = (row0, col0, h, w) => {
    for (let r = row0; r < row0 + h; r += 1) {
      for (let c = col0; c < col0 + w; c += 1) mark(r, c);
    }
  };

  // Finder + separator + format info, as a 9x9 block at each of three corners.
  markBlock(0, 0, 9, 9);
  markBlock(0, size - 8, 9, 8);
  markBlock(size - 8, 0, 8, 9);

  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns: 5x5 centred on each coordinate pair, minus the three
  // that would sit on top of a finder.
  const coords = AlignmentPattern.getRowColCoords(version);
  const last = coords.length - 1;
  for (let i = 0; i < coords.length; i += 1) {
    for (let j = 0; j < coords.length; j += 1) {
      const onFinder =
        (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (onFinder) continue;
      markBlock(coords[i] - 2, coords[j] - 2, 5, 5);
    }
  }

  // Version information, present from version 7 onward.
  if (version >= 7) {
    markBlock(0, size - 11, 6, 3);
    markBlock(size - 11, 0, 3, 6);
  }

  return reserved;
}

/**
 * Encode `text` and flatten the result into the dark cells we need to draw.
 *
 * Error correction is fixed at 'H' (~30% recoverable) because the blossoms sit
 * on top of the symbol and inevitably soften a few module edges; the highest
 * level buys back that margin.
 */
export function buildQrMatrix(text, { errorCorrectionLevel = 'H' } = {}) {
  const qr = QrCore.create(text || ' ', { errorCorrectionLevel });
  const size = qr.modules.size;
  const bits = qr.modules.data;
  const reserved = buildReservedMask(size, qr.version);

  // The finder squares proper, kept separate from `reserved` so the scene can
  // give them their own tone the way a printed code does.
  const finder = new Uint8Array(size * size);
  const markFinder = (row0, col0) => {
    for (let r = row0; r < row0 + 7; r += 1) {
      for (let c = col0; c < col0 + 7; c += 1) finder[r * size + c] = 1;
    }
  };
  markFinder(0, 0);
  markFinder(0, size - 7);
  markFinder(size - 7, 0);

  // Payload modules only — the cells a flower or leaf may sit on.
  const data = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const i = row * size + col;
      if (bits[i] && !reserved[i]) data.push({ row, col });
    }
  }

  return {
    size,
    version: qr.version,
    boardCells: size + QUIET_ZONE * 2,
    bits,
    reserved,
    finder,
    data,
  };
}
