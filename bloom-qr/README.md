# Bloom QR

A vase of flowers that scatters into a scannable QR code — and gathers back again.

Type a link, pick a blossom and a palette, tap the bouquet. Every flower flies to a
module of the QR symbol; the arrangement it lands in is a real, scannable code.
Built with [three.js](https://threejs.org) on Next.js.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:9283.

## How it works

**The symbol.** [`src/utils/qr.js`](src/utils/qr.js) drives the `qrcode` package's core
encoder directly (the package entry pulls a canvas/`fs` path that stalls under Turbopack)
and returns a plain matrix plus a *reserved mask*. The mask marks every module a scanner
needs geometrically rather than for payload — finder patterns, separators, format-info
strips, timing lines, alignment patterns. Flowers are a little wider than one module so
their coverage reads as continuous, which is fine over payload modules (error correction
absorbs the bleed) but fatal over a finder's edge. So decorations stay off the reserved
cells entirely.

**The morph.** [`src/components/bloom/BloomScene.js`](src/components/bloom/BloomScene.js)
is one `InstancedMesh` per model. Each instance holds two transforms — its seat in the
bouquet and its cell in the code — and the scene interpolates between them. There is no
per-frame allocation and no React re-render in the loop.

**The colour.** `instanceColor` multiplies the decoded texture in *linear* space, so a
palette can only scale what the texture already has. `src/components/bloom/palettes.js`
stores each model's measured texture average and expresses palettes as linear multipliers,
clamped so bright areas don't clip into neon. Scanning depends on luminance separation, so
that constraint is checked rather than eyeballed:

```bash
npm run check:palettes
```

It prints the colour every tint actually produces and fails if any dark module isn't far
enough below the light surface for a scanner to binarise.

## Models

The `.glb` files in `public/models` were generated with [Meshy](https://www.meshy.ai) and
then decimated and texture-shrunk for the web — a few hundred instances at one QR module
across need far fewer triangles than the source had. The two scripts that did it are included:

```bash
node scripts/decimate.mjs in.glb out.glb 700
node scripts/shrink-textures.mjs in.glb out.glb 1024
```

`shrink-textures.mjs` shells out to macOS `sips`.

Each blossom is authored to the same convention — pivot at the base, facing +Y, roughly
two units across — so swapping one for another needs no change to the layout maths.

## Credit

Vibe-coded by **Ann Nguyen** ([@ann_nnng](https://x.com/ann_nnng)) with
[TypingMind](https://typingmind.com). If you use, remix, or learn from this, a link back
is enough — see the [collection README](../README.md).
