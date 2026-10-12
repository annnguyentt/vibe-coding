# CD Case

A clear CD jewel case drawn in WebGL. Light bends through the plastic, the disc spins inside
with its rainbow, and the case turns round as its lid swings open.
Built with [three.js](https://threejs.org) on Next.js.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:9283.

| Do this | And this happens |
| --- | --- |
| Tap the case, or **O** | Open or close it |
| Drag the case | Turn it |
| **S** | Start or stop the disc |
| **Space** | Pause or resume the show |

## How it works

**The plastic.** [`src/components/cd-case/caseGeometry.js`](src/components/cd-case/caseGeometry.js)
builds the case as rods and sheets of clear plastic, in millimetres. Every rail, rib and hinge
knuckle is a rounded-rectangle profile swept along a path, and each vertex carries the rod's
centre line and cross-section. The rod shader uses them to refract a ray into the rod, find
where it leaves the profile, and bounce it around inside a few times, picking up a Fresnel
reflection and a little absorption at each wall. The flat panels are thin sheets with their
own cheaper shader.

**The light.** [`src/components/cd-case/shaders.js`](src/components/cd-case/shaders.js) holds a
small studio of softboxes, flags and lamps that is baked once into a cube map. Everything
reflects and refracts that room. The disc's rainbow is a diffraction grating along its
tracks, lit by the same lamps. The brightest sparks are picked out and streaked into
four-point stars at the end.

**The motion.** [`src/components/cd-case/CaseStage.js`](src/components/cd-case/CaseStage.js)
plays the open and close as hand-keyed curves for the turn, the lid and the spread, smoothed
with monotone cubic splines. Grabbing the case springs back when let go, and the case leans
toward the pointer. The tray and the lid are drawn back to front, each one refracting what's
already behind it, inside a scissor around the case.

**The disc.** [`src/components/cd-case/disc.js`](src/components/cd-case/disc.js) names the
print and where it starts and stops, in millimetres from the middle.
`public/cd-case/stickers.webp` is the print itself, a square texture whose half-width is the
disc's 60 mm radius. Swap it for your own art to make your own disc.

## Credit

Vibe-coded by **Ann Nguyen** ([@ann_nnng](https://x.com/ann_nnng)) with
[TypingMind](https://typingmind.com). If you use, remix, or learn from this, a link back
is enough. See the [collection README](../README.md).
