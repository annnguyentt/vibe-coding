# Cocktails

Ray traced cocktails in real glass. Each one slides in, sloshes, spins round into place, gets
its garnish dropped on, and is drunk down in a couple of gulps before the next one comes in.

Eight drinks: a pink margarita, an Aperol spritz, a violet orchid, a Manhattan, a Lavender
Field, a Mrs. Fild, a Pode & Dill and an Enzoni, with ice, condensation, foam and garnish.
Built with [three.js](https://threejs.org) on Next.js.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:9283.

| Do this | And this happens |
| --- | --- |
| Drag | Turn the glass, or look down on it |
| Scroll or pinch | Come closer |
| Tap the glass, or hold **S** | Take a sip |
| **R** | Refill |
| **←** / **→** | Previous or next drink |
| **Space** | Pause or resume the auto show |

## How it works

**One pass.** [`src/components/cocktails/shader.js`](src/components/cocktails/shader.js)
traces the whole drink in a single fragment shader. Glass, liquid, ice and garnish are signed
distance fields in the glass's own frame. A ray marches from one surface to the next, splitting
off a Fresnel reflection and refracting at each one (or turning back on total internal
reflection), picking up colour through the drink and haze through the ice. When it finally
leaves, it lands in a small studio made of a cream sweep, black flags and softboxes.

**The glasses.** [`src/components/cocktails/drinks.js`](src/components/cocktails/drinks.js)
describes each glass as a profile spun around its axis: `[radius, height, half thickness]` up
the bowl, and again down the stem and foot, in centimetres. The profile is smoothed into a
fine curve and baked once into a texture (`BAKE`), so the shader reads the distance to the
glass with one texture lookup and doesn't have to walk the curve on every step. The drink's
level comes from the bowl's volume, so a sip lowers a wide bowl slowly and a narrow one fast.

**The motion.** [`src/components/cocktails/CocktailStage.js`](src/components/cocktails/CocktailStage.js)
runs everything that moves as small fixed-step springs. A glass slides in with a critically
damped spring. It rocks about a pivot on its stem, kicked by its own acceleration. The drink's
surface lags behind and sloshes, while its middle bobs. Ice floats on the surface until the
level drops below it, then settles on the bottom or on the ice beneath it.

**Staying sharp.** Ray tracing every pixel is heavy. While anything moves, the glass is traced
into a smaller target and scaled up with a Catmull-Rom filter (`UPSCALE`). That resolution
drops when frames run long and climbs back when there's room. Once everything is still, one
frame is traced at full resolution and then rendering stops until something moves again.

The thumbnails in the dock come from the same shader: each drink is rendered on its own
once at start-up and cut out around the glass.

## Credit

Vibe-coded by **Ann Nguyen** ([@ann_nnng](https://x.com/ann_nnng)) with
[TypingMind](https://typingmind.com). If you use, remix, or learn from this, a link back
is enough. See the [collection README](../README.md).
