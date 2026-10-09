import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { innerRadius } from './drinks';
import { BAKE, FRAG, UPSCALE, VERT } from './shader';

const FOV = 30;
const ICE_MAX = 5;
const BG = '#f4f2dd'; // the cream backdrop of the video
const LIGHT = new THREE.Vector3(-0.24, 0.95, 0.2).normalize(); // toward the key light
const TEXEL = 0.008; // cm a texel of the baked profile spans
const SPACING = 0.035; // cm between the points the profile's curves are sampled at: fine enough that no facets show
const POINTS = 1024; // the most a curve can have
const TURN = 0.0065; // radians of turn for a pixel of drag
const PITCH = [2, 62]; // degrees the camera can look down from
const THUMB = 160;

// The show, as the video runs it, in seconds from the moment a glass starts to come in: it slides
// in from the left as the last one, empty, goes off to the right; it rocks and sloshes and spins
// round into place; its garnish drops on; it's drunk down in two gulps and the last of it drained;
// then the next one comes in.
const SHOW = {
  garnish: 2.85,
  // [when, how long, how full after]
  sips: [
    [3.8, 0.24, 0.5],
    [4.4, 0.22, 0.12],
    [4.64, 0.42, 0],
  ],
  next: 5.15,
};
const GARNISH_BY_HAND = 1.5; // when a glass is picked by hand, its garnish drops on sooner
const ENTER = 3.6; // how quickly a glass coming in from the left closes on the middle: a spring, from rest
const EXIT_TIME = 0.6; // seconds a glass takes to go off the right
const SPIN_IN = 2.6; // radians a glass is still turned when it comes in, unwinding as it settles
const SPIN_TAU = 0.55;
const PIVOT = 3.5; // cm up the glass it rocks about
const ROCK = { hz: 1.15, damping: 0.14, inertia: 0.0011 }; // rocking about the stem, pushed by its own speeding up and slowing down (radians per cm/s²)
const SLOSH = { hz: 1.6, damping: 0.09, gravity: 950 }; // the drink lagging the glass: much lighter than real, as in the video
const BULGE = { hz: 3.4, damping: 0.09 }; // the middle of the surface bobbing up and down
const DROP = { time: 0.32, wobble: 0.09 }; // the garnish falling on, and how much it wobbles once it lands
const GULP = 0.25; // how much of the drink a tap drinks
const HOLD_RATE = 0.5; // and holding the button, a second
const REFILL = 1.3;

// the flowers that go on a foam head, as the shader numbers them
const FLOWERS = ['pansy', 'cornflower', 'marigold', 'viola', 'star', 'alyssum', 'carnation'];

const linear = (hex) => {
  const c = new THREE.Color().setStyle(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};
const ease = (u) => u * u * (3 - 2 * u);

// A smooth curve through a profile's points ([r, y, half thickness]), sampled finely. mirror: the
// curve starts on the axis and should cross it level, the way the bottom of a bowl does.
function smooth(points, mirror) {
  const pts = points.map((p) => new THREE.Vector3(...p));
  if (mirror) pts.unshift(new THREE.Vector3(-pts[1].x, pts[1].y, pts[1].z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const out = [];
  const last = pts.length - 1;
  for (let i = mirror ? 1 : 0; i < last; i++) {
    const n = Math.max(2, Math.ceil(pts[i].distanceTo(pts[i + 1]) / SPACING));
    for (let k = 0; k < n; k++) out.push(curve.getPoint((i + k / n) / last));
  }
  out.push(pts[last].clone());
  for (const p of out) p.x = Math.max(p.x, 0);
  return out;
}

// Everything about a drink that doesn't change while it's on show.
function prepare(def) {
  const { glass } = def;
  const wall = smooth(glass.wall, true);
  const stem = smooth(glass.stem, false);
  const bottom = glass.wall[0][1] + glass.wall[0][2];

  // how much the bowl holds up to each height, so drinking takes the level down the way it would:
  // slowly across a wide bowl, quickly down a narrow one
  const steps = 240;
  const heights = [];
  const volumes = [];
  let v = 0;
  const dy = (def.full - bottom) / steps;
  for (let i = 0; i <= steps; i++) {
    const y = bottom + i * dy;
    if (i > 0) v += Math.PI * innerRadius(glass, y - dy / 2) ** 2 * dy;
    heights.push(y);
    volumes.push(v);
  }
  const levelAt = (fill) => {
    const target = fill * v;
    let i = 1;
    while (i < steps && volumes[i] < target) i++;
    const a = volumes[i - 1];
    const b = volumes[i];
    return heights[i - 1] + (b > a ? (target - a) / (b - a) : 0) * dy;
  };

  const cubes = def.cubes.map((c, i) => {
    const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...c.turn));
    // the shader takes it the other way, from the glass into the cube
    const toCube = new THREE.Matrix3().setFromMatrix4(turn).transpose();
    return { ...c, i, turn, toCube, sink: def.full - c.at[1] };
  });
  // where each cube ends up with the drink gone: down the bowl until it meets the glass or a cube
  // that has already settled
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx, sy, sz]);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) if (sx || sz) corners.push([sx, -1, sz]);
  const settled = [];
  for (const c of [...cubes].sort((a, b) => a.at[1] - b.at[1])) {
    const fits = (y) => {
      const p = new THREE.Vector3();
      for (const [sx, sy, sz] of corners) {
        p.set(sx * (c.size[0] - c.corner * 0.6), sy * (c.size[1] - c.corner * 0.6), sz * (c.size[2] - c.corner * 0.6));
        p.applyMatrix4(c.turn).add(new THREE.Vector3(c.at[0], y, c.at[2]));
        if (Math.hypot(p.x, p.z) > innerRadius(glass, p.y) - 0.03) return false;
      }
      for (const o of settled) {
        const reach = Math.max(...c.size) + Math.max(...o.size);
        if (
          Math.hypot(c.at[0] - o.at[0], c.at[2] - o.at[2]) < reach * 0.8 &&
          y < o.rest + o.size[1] + c.size[1] - 0.15
        ) {
          return false;
        }
      }
      return true;
    };
    // from up above the drink, down until it can't go further
    let y = Math.max(c.at[1], def.full + c.size[1]);
    while (y > bottom && fits(y - 0.05)) y -= 0.05;
    c.rest = y;
    settled.push(c);
  }

  let garnM = new THREE.Matrix4();
  let cherry = Array.from({ length: 4 }, () => new THREE.Vector3());
  let rides = -1;
  // the shard or the ribbon, and what sits on it; the grape and its twig; or the foam's flowers
  const sheet = new THREE.Vector4();
  const bits = [];
  const bitKinds = [];
  let garnBound = new THREE.Vector4(0, -100, 0, 0);
  let garnish = 0;
  const slice = new THREE.Vector4();
  let reach = Math.max(...glass.wall.map((p) => p[0]), ...glass.stem.map((p) => p[0])) + 0.15;
  let top = glass.wall.at(-1)[1] + 0.2;
  const g = def.garnish;
  if (g?.kind === 'lime') {
    // the lime: its core runs out through the rim, tipped up, its peel rolled away from the camera
    garnish = 1;
    const tip = THREE.MathUtils.degToRad(g.tip);
    const roll = THREE.MathUtils.degToRad(g.roll);
    const z = new THREE.Vector3(Math.cos(tip), Math.sin(tip), 0);
    const y0 = new THREE.Vector3(-Math.sin(tip), Math.cos(tip), 0);
    const y = y0.multiplyScalar(Math.cos(roll)).add(new THREE.Vector3(0, 0, -Math.sin(roll)));
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const c = new THREE.Vector3(...g.centre);
    garnM = new THREE.Matrix4().makeBasis(x, y, z).setPosition(c).invert();
    garnBound = new THREE.Vector4(c.x, c.y, c.z, 3.4);
  } else if (g?.kind === 'cherries') {
    // the cherries, threaded on the pick where it says
    garnish = 2;
    const a = new THREE.Vector3(...g.pick[0]);
    const b = new THREE.Vector3(...g.pick[1]);
    cherry = [...g.along.map((u) => a.clone().lerp(b, u)), a, b];
    const sphere = new THREE.Box3().setFromPoints(cherry).getBoundingSphere(new THREE.Sphere());
    garnBound = new THREE.Vector4(sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius + 1.1);
  } else if (g?.kind === 'slice') {
    // the slice: a wheel standing on the rim, its face turned toward the camera
    garnish = 3;
    const [yaw, tilt, spin] = g.turn.map(THREE.MathUtils.degToRad);
    const c = new THREE.Vector3(...g.centre);
    const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, yaw, spin, 'YXZ'));
    garnM = turn.setPosition(c).invert();
    garnBound = new THREE.Vector4(c.x, c.y, c.z, g.radius + 0.5);
    slice.set(g.radius, g.thick, g.peel, g.pith);
  } else if (g?.kind === 'flower') {
    // the orchid lies on top of the ice it rides, and goes up and down with it
    garnish = 4;
    rides = g.rides;
    const cube = cubes[g.rides];
    const c = new THREE.Vector3(cube.at[0], cube.rest + cube.size[1] - 0.05, cube.at[2]);
    garnM = new THREE.Matrix4()
      .makeRotationY(0.4)
      .scale(new THREE.Vector3(g.size, g.size, g.size))
      .setPosition(c)
      .invert();
    garnBound = new THREE.Vector4(c.x, c.y + 0.4, c.z, 1.9 * g.size);
  } else if (g?.kind === 'shard' || g?.kind === 'ribbon') {
    garnish = g.kind === 'shard' ? 6 : 7;
    const c = new THREE.Vector3(...g.centre);
    // its frame: x along it, y out of its face, z across it
    const along = new THREE.Vector3(...g.along).normalize();
    const face = new THREE.Vector3(...g.face);
    face.addScaledVector(along, -face.dot(along)).normalize();
    const across = new THREE.Vector3().crossVectors(along, face);
    garnM = new THREE.Matrix4().makeBasis(along, face, across).setPosition(c).invert();
    sheet.set(g.length, g.width, g.thick, g.bend);
    // each sits on the top face, sunk into it a little, wherever the droop has taken it
    for (const [x, z, r] of g.bits) bits.push(new THREE.Vector4(x, g.thick - g.bend * x * x + r * 0.8, z, r));
    garnBound = new THREE.Vector4(c.x, c.y, c.z, Math.hypot(g.length, g.width) + 0.8);
  } else if (g?.kind === 'grape') {
    garnish = 8;
    bits.push(new THREE.Vector4(...g.grape), ...g.twig.map((t) => new THREE.Vector4(...t)));
    const sphere = new THREE.Box3()
      .setFromPoints(bits.map((b) => new THREE.Vector3(b.x, b.y, b.z)))
      .getBoundingSphere(new THREE.Sphere());
    garnBound = new THREE.Vector4(sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius + 1.2);
  }
  if (garnish) {
    reach = Math.max(reach, Math.hypot(garnBound.x, garnBound.z) + garnBound.w);
    top = Math.max(top, garnBound.y + garnBound.w);
  }
  // a head of foam: a dome on the rim, and the flowers laid on it (they open rather than drop)
  const rimY = glass.wall.at(-1)[1];
  const foam = def.foam ? { height: def.foam.height, radius: innerRadius(glass, rimY - 0.05) * def.foam.spread } : null;
  if (foam) {
    reach = Math.max(reach, foam.radius + 0.6);
    top = Math.max(top, rimY + foam.height + 0.6);
    if (g?.kind === 'flowers') {
      garnish = 5;
      for (const f of g.flowers) {
        const az = THREE.MathUtils.degToRad(f.at[0]);
        const el = THREE.MathUtils.degToRad(f.at[1]);
        bits.push(
          new THREE.Vector4(
            foam.radius * Math.cos(el) * Math.cos(az),
            rimY + foam.height * Math.sin(el),
            foam.radius * Math.cos(el) * Math.sin(az),
            f.size,
          ),
        );
        bitKinds.push(FLOWERS.indexOf(f.kind));
      }
    }
  }
  const straw = def.straw
    ? { a: new THREE.Vector4(...def.straw.from, def.straw.radius), b: new THREE.Vector3(...def.straw.to) }
    : { a: new THREE.Vector4(), b: new THREE.Vector3() };
  if (def.straw) {
    reach = Math.max(reach, Math.hypot(def.straw.to[0], def.straw.to[2]) + 0.4);
    top = Math.max(top, def.straw.to[1] + 0.4);
  }

  return {
    def,
    wall,
    stem,
    profile: null,
    domain: new THREE.Vector3(
      Math.max(...glass.wall.map((p) => p[0]), ...glass.stem.map((p) => p[0])) + 1.2,
      -0.6,
      glass.wall.at(-1)[1] + 1.8,
    ),
    bottom,
    levelAt,
    cubes,
    garnish,
    garnM,
    rides,
    cherry,
    sheet,
    bits,
    bitKinds,
    foam,
    garnBound,
    slice,
    straw,
    reach,
    top,
    // how high the middle of the drink sits, for how hard the rocking throws it about
    middle: (bottom + def.full) / 2,
    // the rim, and the widest the bowl gets between the drink and it, for how far the drink can lean
    rim: glass.wall.at(-1)[1],
    rimR: Math.max(...glass.wall.filter((p) => p[1] >= def.full - 0.5).map((p) => p[0])),
    absorb: new THREE.Vector3(...def.liquid.absorb),
    glow: linear(def.liquid.glow),
  };
}

// One glass on the stage, and everything about it that moves.
function makeGlass(item, entering, width) {
  return {
    item,
    mode: entering ? 'in' : 'rest', // in: sliding in from the left; out: off to the right
    t: 0, // since it began to come in (or go out)
    from: -width, // where it came in from
    x: entering ? -width : 0,
    ax: 0,
    roll: 0, // tipped over to the right, radians
    rollVel: 0,
    yaw: entering ? SPIN_IN : 0,
    yawGoal: 0,
    yawVel: 0,
    fill: 1,
    sip: null, // a gulp under way: { t, dur, from, to }
    pour: 0,
    slosh: new THREE.Vector2(), // the surface's slope, in the room, across x and z
    sloshVel: new THREE.Vector2(),
    bulge: 0,
    bulgeVel: 0,
    ripple: 0,
    drop: item.garnish ? -1 : 1, // the garnish: -1 not yet, 0 to 1 falling, then landed and wobbling
    landed: 0,
    show: 0, // how far through the show it is, while it's playing
  };
}

function createStage(canvas, { drinks, getAuto, onIndex, onFill, onReady, onFail, onThumbs }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    onFail();
    return { goTo() {}, next() {}, prev() {}, sip() {}, hold() {}, release() {}, refill() {}, dispose() {} };
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The canvas always holds the screen's full resolution. While anything moves, the glass is traced
  // at `scale` (never under FLOOR) into a smaller target and scaled up sharply; once it's all still,
  // it's traced once more at full size and left there.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const floor = Math.min(dpr, dpr >= 2 ? 0.9 : 0.75);
  let scale = Math.min(dpr, touch ? 1 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(new THREE.Color(BG), 1);

  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamRot: { value: new THREE.Matrix3() },
    uFocal: { value: 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
    uToLocal: { value: new THREE.Matrix4() },
    uToWorld: { value: new THREE.Matrix4() },
    uLight: { value: LIGHT.clone() },
    uProfile: { value: null },
    uDom: { value: new THREE.Vector3(1, 0, 1) },
    uBound: { value: new THREE.Vector2() },
    uSurf: { value: new THREE.Vector4(0, 1, 0, 0) },
    uHasLiquid: { value: 1 },
    uAbsorb: { value: new THREE.Vector3() },
    uScatter: { value: 0 },
    uGlow: { value: new THREE.Vector3() },
    uRipple: { value: 0 },
    uBulge: { value: 0 },
    uLevelR: { value: 1 },
    uFull: { value: 0 },
    uFrostLow: { value: 0 },
    uFrost: { value: 0 },
    uBeads: { value: new THREE.Vector2() },
    uSlush: { value: 0 },
    uIceN: { value: 0 },
    uIceP: { value: Array.from({ length: ICE_MAX }, () => new THREE.Vector3()) },
    uIceR: { value: Array.from({ length: ICE_MAX }, () => new THREE.Matrix3()) },
    uIceS: { value: Array.from({ length: ICE_MAX }, () => new THREE.Vector4(1, 1, 1, 0.1)) },
    uIceCloud: { value: 1 },
    uIceRough: { value: Array.from({ length: ICE_MAX }, () => 1) },
    uHeap: { value: new THREE.Vector4() },
    uHeapH: { value: 0.5 },
    uGarnish: { value: 0 },
    uGarnM: { value: new THREE.Matrix4() },
    uDrop: { value: new THREE.Matrix4() },
    uCherry: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
    uGarnBound: { value: new THREE.Vector4() },
    uSlice: { value: new THREE.Vector4() },
    uSheet: { value: new THREE.Vector4() },
    uBits: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
    uBitKind: { value: Array.from({ length: 12 }, () => 0) },
    uBitN: { value: 0 },
    uBloom: { value: 0 },
    uFoam: { value: new THREE.Vector4() },
    uFoamLim: { value: new THREE.Vector2() },
    uStrawA: { value: new THREE.Vector4() },
    uStrawB: { value: new THREE.Vector3() },
    uBg: { value: linear(BG) },
    uThumb: { value: 0 },
    uOverlay: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  const items = drinks.map(prepare);
  let index = 0;

  // the glass on show, and the one on its way out
  let cur = null;
  let out = null;
  // the camera: where it looks and how far back, easing between glasses of different sizes
  const view = {
    pitch: items[0].def.view.pitch,
    pitchGoal: items[0].def.view.pitch,
    target: items[0].def.view.target,
    distance: items[0].def.view.distance,
    zoom: 1,
    zoomGoal: 1,
  };
  let time = 0;
  let holding = false;

  // --- the glass's profile, into a texture once: see BAKE -----------------------------------

  const bakeMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: BAKE,
    uniforms: {
      uPts: { value: null },
      uWallN: { value: 0 },
      uStemN: { value: 0 },
      uDom: { value: new THREE.Vector3() },
      uSize: { value: new THREE.Vector2() },
    },
    depthTest: false,
    depthWrite: false,
  });
  function bake(it) {
    const w = Math.ceil(it.domain.x / TEXEL);
    const h = Math.ceil(it.domain.z / TEXEL);
    const pts = new Float32Array(POINTS * 2 * 4);
    it.wall.slice(0, POINTS).forEach((p, i) => pts.set([p.x, p.y, p.z, 0], i * 4));
    it.stem.slice(0, POINTS).forEach((p, i) => pts.set([p.x, p.y, p.z, 0], (POINTS + i) * 4));
    const data = new THREE.DataTexture(pts, POINTS, 2, THREE.RGBAFormat, THREE.FloatType);
    data.needsUpdate = true;
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    const u = bakeMaterial.uniforms;
    u.uPts.value = data;
    u.uWallN.value = Math.min(it.wall.length, POINTS);
    u.uStemN.value = Math.min(it.stem.length, POINTS);
    u.uDom.value.copy(it.domain);
    u.uSize.value.set(w, h);
    quad.material = bakeMaterial;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    quad.material = material;
    data.dispose();
    it.profile = target;
  }

  // the uniforms that stay put while a drink's on show
  function apply(it) {
    if (!it.profile) bake(it);
    uniforms.uProfile.value = it.profile.texture;
    uniforms.uDom.value.copy(it.domain);
    uniforms.uAbsorb.value.copy(it.absorb);
    uniforms.uScatter.value = it.def.liquid.scatter;
    uniforms.uGlow.value.copy(it.glow);
    uniforms.uFull.value = it.def.full;
    uniforms.uFrost.value = it.def.frost.amount;
    uniforms.uFrostLow.value = it.def.frost.low;
    uniforms.uBeads.value.set(...it.def.frost.beads);
    uniforms.uSlush.value = it.def.liquid.slush || 0;
    uniforms.uIceN.value = it.cubes.length;
    uniforms.uIceCloud.value = it.def.iceCloud ?? 1;
    it.cubes.forEach((c, i) => {
      uniforms.uIceR.value[i].copy(c.toCube);
      uniforms.uIceS.value[i].set(...c.size, c.corner);
      uniforms.uIceRough.value[i] = c.rough ?? 1;
    });
    uniforms.uGarnM.value.copy(it.garnM);
    it.cherry.forEach((p, i) => uniforms.uCherry.value[i].copy(p));
    uniforms.uGarnBound.value.copy(it.garnBound);
    uniforms.uSlice.value.copy(it.slice);
    uniforms.uSheet.value.copy(it.sheet);
    uniforms.uBitN.value = Math.min(it.bits.length, 12);
    it.bits.slice(0, 12).forEach((b, i) => uniforms.uBits.value[i].copy(b));
    it.bitKinds.slice(0, 12).forEach((k, i) => (uniforms.uBitKind.value[i] = k));
    uniforms.uStrawA.value.copy(it.straw.a);
    uniforms.uStrawB.value.copy(it.straw.b);
  }

  const toWorld = new THREE.Matrix4();
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3();
  const surf = new THREE.Vector3();
  const dropAt = new THREE.Matrix4();
  const dropEuler = new THREE.Euler();
  const dropOff = new THREE.Vector3();
  const centre = new THREE.Vector3();

  // poses one glass, the drink in it, its ice and its garnish, for this moment
  function pose(g) {
    const it = g.item;
    apply(it);
    // it slides along x, rocks about a point up its stem, and turns about its own axis
    toWorld.makeTranslation(g.x, PIVOT, 0);
    toWorld.multiply(m4.makeRotationZ(-g.roll));
    toWorld.multiply(m4.makeTranslation(0, -PIVOT, 0));
    toWorld.multiply(m4.makeRotationY(g.yaw));
    uniforms.uToWorld.value.copy(toWorld);
    uniforms.uToLocal.value.copy(toWorld).invert();

    const level = it.levelAt(g.fill);
    const has = g.fill > 0.004;
    // the surface stays level in the room, give or take the slosh, whatever the glass does; but it
    // never leans so far in the glass that it would run over the rim
    up.set(-g.slosh.x, 1, -g.slosh.y).normalize();
    surf.copy(up).transformDirection(uniforms.uToLocal.value);
    const room = Math.max((it.rim - 0.2 - level - Math.abs(g.bulge) * 0.5) / it.rimR, 0.01);
    const lean = Math.hypot(surf.x, surf.z) / surf.y;
    if (lean > room) {
      surf.x *= room / lean;
      surf.z *= room / lean;
      surf.normalize();
    }
    uniforms.uSurf.value.set(surf.x, surf.y, surf.z, surf.y * level);
    uniforms.uHasLiquid.value = has ? 1 : 0;
    uniforms.uRipple.value = g.ripple;
    uniforms.uBulge.value = has ? g.bulge : 0;
    uniforms.uLevelR.value = Math.max(innerRadius(it.def.glass, level), 0.5);

    // ice rides the surface where it is, until it's down on the bottom
    const ride = new THREE.Vector3();
    it.cubes.forEach((c, i) => {
      const onSurface = (surf.y * level - surf.x * c.at[0] - surf.z * c.at[2]) / surf.y;
      const floating = has && onSurface - c.sink > c.rest;
      const y = floating ? onSurface - c.sink : c.rest;
      uniforms.uIceP.value[i].set(c.at[0], y, c.at[2]);
      if (i === it.rides) ride.set(0, y - c.rest, 0);
    });
    const crushed = it.def.crushed;
    if (crushed) {
      const r0 = innerRadius(it.def.glass, it.def.full) * crushed.spread;
      const lv = Math.max(level, it.bottom + 1.0);
      const r = Math.max(innerRadius(it.def.glass, lv) * crushed.spread, 0.9);
      const h = Math.min(crushed.half * (r0 / r) ** 2, 1.2);
      uniforms.uHeap.value.set(0.15, Math.max(lv + crushed.rise, it.bottom + h * 0.8), -0.1, r);
      uniforms.uHeapH.value = h;
    } else {
      uniforms.uHeap.value.set(0, 0, 0, 0);
    }

    // the garnish: not there yet, falling in from up and to the right, or landed and wobbling
    let reach = it.reach;
    let top = it.top;
    uniforms.uGarnish.value = g.drop < 0 ? 0 : it.garnish;
    dropAt.identity();
    if (it.garnish && it.def.drop && g.drop >= 0) {
      const spec = it.def.drop;
      centre.set(it.garnBound.x, it.garnBound.y, it.garnBound.z);
      if (g.drop < 1) {
        // gravity: slow at the top, fast as it arrives
        const left = 1 - g.drop * g.drop;
        dropOff.set(...spec.from).multiplyScalar(left);
        dropEuler.set(spec.spin[0] * left, spec.spin[1] * left, spec.spin[2] * left);
      } else {
        const s = g.landed;
        const w = DROP.wobble * Math.exp(-s / 0.2) * Math.sin(s * 2 * Math.PI * 4.5);
        dropOff.set(0, 0.35 * Math.exp(-s / 0.1) * Math.abs(Math.sin(s * 2 * Math.PI * 4.5)), 0);
        dropEuler.set(w * 0.4, 0, -w);
      }
      dropOff.add(ride);
      dropAt.makeRotationFromEuler(dropEuler);
      dropAt.premultiply(m4.makeTranslation(centre.x + dropOff.x, centre.y + dropOff.y, centre.z + dropOff.z));
      dropAt.multiply(m4.makeTranslation(-centre.x, -centre.y, -centre.z));
      reach = Math.max(reach, Math.hypot(centre.x + dropOff.x, centre.z + dropOff.z) + it.garnBound.w);
      top = Math.max(top, centre.y + dropOff.y + it.garnBound.w);
      dropAt.invert();
    }
    uniforms.uDrop.value.copy(dropAt);
    // the foam rides down on the drink as it's drunk; its flowers open once the garnish is due
    if (it.foam) {
      const rim = it.def.glass.wall.at(-1)[1];
      uniforms.uFoam.value.set(rim + level - it.def.full, it.foam.height, it.foam.radius, 1);
      uniforms.uFoamLim.value.set(level, rim);
    } else {
      uniforms.uFoam.value.set(0, 0, 0, 0);
    }
    uniforms.uBloom.value = it.garnish === 5 && g.drop >= 1 ? g.landed : 0;
    uniforms.uBound.value.set(reach + 0.1, top);
  }

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camBack = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const eye = new THREE.Vector3();
  function aim(v) {
    const p = THREE.MathUtils.degToRad(v.pitch);
    // a narrow window pulls back, so the glass fits across it as well as up it
    const aspect = uniforms.uRes.value.x / uniforms.uRes.value.y;
    const dist = v.distance * v.zoom * Math.max(1, 0.78 / aspect);
    lookAt.set(0, v.target, 0);
    eye.set(0, Math.sin(p) * dist, Math.cos(p) * dist).add(lookAt);
    camBack.copy(eye).sub(lookAt).normalize();
    camRight.set(1, 0, 0);
    camUp.crossVectors(camBack, camRight).normalize();
    uniforms.uCamPos.value.copy(eye);
    // prettier-ignore
    uniforms.uCamRot.value.set(
      camRight.x, camUp.x, camBack.x,
      camRight.y, camUp.y, camBack.y,
      camRight.z, camUp.z, camBack.z,
    );
    return dist;
  }
  // how far off to the side a glass has to start to be out of sight
  function offstage() {
    const aspect = uniforms.uRes.value.x / uniforms.uRes.value.y;
    const dist = view.distance * view.zoom * Math.max(1, 0.78 / aspect);
    return dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect + 10;
  }

  // --- size -------------------------------------------------------------------------------

  const full = new THREE.Vector2(1, 1);
  const motion = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const upscale = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: UPSCALE,
    uniforms: { uTex: { value: motion.texture }, uSrc: { value: new THREE.Vector2() }, uDst: { value: full } },
    depthTest: false,
    depthWrite: false,
  });
  function layout() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(full);
    motion.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    uniforms.uRes.value.copy(full);
    sharp = false;
  }

  // --- input ------------------------------------------------------------------------------

  const pointers = new Map();
  let drag = null;
  let pinch = 0;
  function onDown(e) {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (cur) cur.yawVel = 0;
      canvas.dataset.grabbing = '';
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
    }
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) view.zoomGoal = THREE.MathUtils.clamp(view.zoomGoal * (pinch / d), 0.45, 1.5);
      pinch = d;
      return;
    }
    if (!drag || !cur) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    cur.yawGoal += dx * TURN;
    cur.yaw += dx * TURN;
    cur.yawVel = dx * TURN * 60;
    view.pitchGoal = THREE.MathUtils.clamp(view.pitchGoal + dy * 0.18, PITCH[0], PITCH[1]);
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && pointers.size === 0) {
      // a tap on the glass is a sip
      if (drag.moved < 6 && performance.now() - drag.t < 350 && overGlass(e.clientX, e.clientY)) sip();
      drag = null;
      delete canvas.dataset.grabbing;
    }
  }
  function onWheel(e) {
    e.preventDefault();
    view.zoomGoal = THREE.MathUtils.clamp(view.zoomGoal * Math.exp(e.deltaY * 0.0012), 0.45, 1.5);
  }
  // whether the point on screen is over the glass: its ray passes close to the glass's axis
  function overGlass(x, y) {
    if (!cur) return false;
    const rect = canvas.getBoundingClientRect();
    const u = ((x - rect.left) / rect.width - 0.5) * 2 * (rect.width / rect.height);
    const v = -((y - rect.top) / rect.height - 0.5) * 2;
    const m = uniforms.uCamRot.value.elements;
    const d = new THREE.Vector3(u, v, -uniforms.uFocal.value);
    const rd = new THREE.Vector3(
      m[0] * d.x + m[3] * d.y + m[6] * d.z,
      m[1] * d.x + m[4] * d.y + m[7] * d.z,
      m[2] * d.x + m[5] * d.y + m[8] * d.z,
    ).normalize();
    const ro = uniforms.uCamPos.value;
    const glass = cur.item.def.glass;
    const r = Math.max(...glass.wall.map((p) => p[0]));
    for (let t = 0; t < 300; t += 0.5) {
      const px = ro.x + rd.x * t - cur.x;
      const py = ro.y + rd.y * t;
      const pz = ro.z + rd.z * t;
      if (py < 0) break;
      if (py < glass.wall.at(-1)[1] && Math.hypot(px, pz) < (py > glass.wall[0][1] ? r : 1.2)) return true;
    }
    return false;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // --- drinking ---------------------------------------------------------------------------

  // a gulp through the straw: the drink goes down, the surface jumps a little
  function gulp(g, to, dur) {
    if (g.fill <= 0 || g.pour > 0) return;
    g.sip = { t: 0, dur, from: g.fill, to: Math.max(Math.min(to, g.fill), 0) };
    g.bulgeVel -= 1.6;
    g.ripple = Math.max(g.ripple, 0.006);
  }
  function sip() {
    if (cur && !cur.sip) gulp(cur, cur.fill - GULP, 0.25);
  }
  function hold() {
    holding = true;
  }
  function release() {
    holding = false;
  }
  function refill() {
    if (!cur || cur.fill >= 1 || cur.pour > 0) return;
    cur.sip = null;
    cur.pour = cur.fill;
  }

  // the next glass comes in from the left; the one on show goes out to the right
  function goTo(i) {
    const next = ((i % items.length) + items.length) % items.length;
    if (cur && next === index && cur.mode !== 'out') return;
    index = next;
    if (cur) {
      out = cur;
      out.mode = 'out';
      out.t = 0;
      out.x0 = out.x;
    }
    cur = makeGlass(items[index], true, offstage());
    view.pitchGoal = items[index].def.view.pitch;
    onIndex(index);
    onFill(cur.fill);
  }

  // one small fixed step of everything that moves: springs want small steps
  function physics(g, h) {
    g.t += h;
    // where it is along the slide, and how hard it's speeding up or slowing down
    if (g.mode === 'in') {
      // critically damped: it sets off hard, then eases into the middle
      const w = ENTER;
      const e = Math.exp(-w * g.t);
      g.x = g.from * (1 + w * g.t) * e;
      g.ax = g.from * w * w * (w * g.t - 1) * e;
      if (g.t > 3) g.mode = 'rest';
    } else if (g.mode === 'out') {
      const a = (2 * (offstage() + 4)) / (EXIT_TIME * EXIT_TIME);
      const s = Math.max(g.t - 0.04, 0);
      g.x = g.x0 + 0.5 * a * s * s;
      g.ax = s > 0 ? a : 0;
    } else {
      g.x *= Math.exp(-h * 6);
      g.ax = 0;
    }

    // rocking: a spring about the pivot, kicked the other way to how the glass is being pushed
    const wr = 2 * Math.PI * ROCK.hz;
    const kick = (reduced ? 0.35 : 1) * ROCK.inertia * wr * wr;
    const rollAcc = -wr * wr * g.roll - 2 * ROCK.damping * wr * g.rollVel - kick * g.ax;
    g.rollVel += rollAcc * h;
    g.roll += g.rollVel * h;

    // turning: unwinding the spin it came in with, and coasting after a flick
    if (g.mode === 'in') g.yaw += (g.yawGoal + SPIN_IN * Math.exp(-g.t / SPIN_TAU) - g.yaw) * Math.min(h * 30, 1);
    else if (!drag) {
      g.yawGoal += g.yawVel * h;
      g.yawVel *= Math.exp(-h * 2.6);
      g.yaw += (g.yawGoal - g.yaw) * Math.min(h * 12, 1);
    }

    // the drink: its middle is pushed sideways by the slide and by the rocking, and its surface
    // leans against that push, overshoots and swings back
    const lever = g.item.middle - PIVOT;
    const aL = g.ax + lever * (rollAcc * Math.cos(g.roll) - g.rollVel * g.rollVel * Math.sin(g.roll));
    const ws = 2 * Math.PI * SLOSH.hz;
    const goal = THREE.MathUtils.clamp(-aL / SLOSH.gravity, -0.9, 0.9);
    g.sloshVel.x += (-ws * ws * (g.slosh.x - goal) - 2 * SLOSH.damping * ws * g.sloshVel.x) * h;
    g.sloshVel.y += (-ws * ws * g.slosh.y - 2 * SLOSH.damping * ws * g.sloshVel.y) * h;
    g.slosh.addScaledVector(g.sloshVel, h);
    g.slosh.clampScalar(-0.9, 0.9);
    const wb = 2 * Math.PI * BULGE.hz;
    g.bulgeVel += (-wb * wb * g.bulge - 2 * BULGE.damping * wb * g.bulgeVel) * h;
    g.bulge += g.bulgeVel * h;
    g.ripple *= Math.exp(-h * 2.6);

    // the garnish falling in, and landing with a splash
    if (g.drop >= 0 && g.drop < 1) {
      g.drop = Math.min(g.drop + h / DROP.time, 1);
      if (g.drop >= 1) {
        g.landed = 0;
        g.bulgeVel += 2.4;
        g.sloshVel.x += 0.25;
        g.sloshVel.y -= 0.12;
        g.ripple = 0.008;
      }
    } else if (g.drop >= 1) g.landed += h;

    // drinking and refilling
    if (g.sip) {
      g.sip.t += h;
      const u = Math.min(g.sip.t / g.sip.dur, 1);
      g.fill = g.sip.from + (g.sip.to - g.sip.from) * ease(u);
      if (u >= 1) g.sip = null;
    }
    if (g.pour > 0) {
      g.pour = Math.min(g.pour + h / REFILL, 1);
      g.fill = ease(g.pour);
      g.ripple = Math.max(g.ripple, 0.012 * (1 - g.pour));
      g.bulgeVel += (Math.random() - 0.5) * 0.4;
      if (g.pour >= 1) g.pour = 0;
    }
  }

  let lastFill = -1;
  function step(dt) {
    time += dt;
    const auto = getAuto();
    if (cur) {
      // the show: the garnish drops on, the drink's drunk in gulps, then on to the next one
      if (cur.drop < 0 && cur.t >= (auto ? SHOW.garnish : GARNISH_BY_HAND)) cur.drop = 0;
      if (auto) {
        const before = cur.show;
        cur.show += dt;
        for (const [at, dur, to] of SHOW.sips) {
          if (before < at && cur.show >= at && cur.fill > to) gulp(cur, to, dur);
        }
        if (cur.show >= SHOW.next) {
          // refilled while it was playing: drink it down again
          if (cur.fill > 0) cur.show = SHOW.sips[0][0] - 0.5;
          else goTo(index + 1);
        }
      } else if (!auto) {
        // picking the show up again starts at the gulps, if the garnish is already on
        cur.show = Math.min(cur.show, cur.drop >= 1 ? SHOW.sips[0][0] - 0.6 : cur.show);
      }
      if (holding && cur.fill > 0 && cur.pour === 0) {
        cur.sip = null;
        cur.fill = Math.max(cur.fill - HOLD_RATE * dt, 0);
        cur.ripple = Math.max(cur.ripple, 0.008);
      }
    }
    const h = 1 / 240;
    const n = Math.max(1, Math.ceil(dt / h));
    for (let i = 0; i < n; i++) {
      if (cur) physics(cur, dt / n);
      if (out) physics(out, dt / n);
    }
    if (out && out.mode === 'out' && out.t > EXIT_TIME + 0.3) out = null;

    // the camera eases to the glass on show
    const v = cur ? cur.item.def.view : items[0].def.view;
    const k = 1 - Math.exp(-dt * 4);
    view.target += (v.target - view.target) * k;
    view.distance += (v.distance - view.distance) * k;
    view.pitch += (view.pitchGoal - view.pitch) * (1 - Math.exp(-dt * 10));
    view.zoom += (view.zoomGoal - view.zoom) * (1 - Math.exp(-dt * 9));

    if (cur && Math.abs(cur.fill - lastFill) > 0.001) {
      lastFill = cur.fill;
      onFill(cur.fill);
    }
  }

  // whether anything on the stage is still moving, however little
  function stirring(g) {
    return (
      g.mode !== 'rest' ||
      Math.abs(g.x) > 0.01 ||
      Math.abs(g.roll) > 0.002 ||
      Math.abs(g.rollVel) > 0.01 ||
      Math.abs(g.slosh.x) + Math.abs(g.slosh.y) > 0.002 ||
      Math.abs(g.sloshVel.x) + Math.abs(g.sloshVel.y) > 0.02 ||
      Math.abs(g.bulge) > 0.004 ||
      Math.abs(g.bulgeVel) > 0.03 ||
      g.ripple > 0.0008 ||
      !!g.sip ||
      g.pour > 0 ||
      (g.drop >= 0 && g.drop < 1) ||
      (g.drop >= 1 && g.landed < 1.6) ||
      Math.abs(g.yaw - g.yawGoal) > 0.002 ||
      Math.abs(g.yawVel) > 0.01
    );
  }
  function moving() {
    const v = cur ? cur.item.def.view : items[0].def.view;
    return (
      !!out ||
      !!drag ||
      pointers.size > 0 ||
      holding ||
      (cur && stirring(cur)) ||
      Math.abs(view.pitch - view.pitchGoal) > 0.05 ||
      Math.abs(view.zoom - view.zoomGoal) > 0.001 ||
      Math.abs(view.target - v.target) > 0.01 ||
      Math.abs(view.distance - v.distance) > 0.02
    );
  }

  // both glasses, into whatever's being drawn to, at uRes
  function trace() {
    aim(view);
    uniforms.uTime.value = time;
    uniforms.uThumb.value = 0;
    // the glass on show, on the backdrop; then the one going out, over it
    uniforms.uOverlay.value = 0;
    if (cur) pose(cur);
    renderer.render(scene, camera);
    if (out) {
      pose(out);
      uniforms.uOverlay.value = 1;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = true;
      uniforms.uOverlay.value = 0;
    }
  }
  // sharp: full size, straight to the canvas; otherwise at `scale`, then scaled up to it
  function render(sharp = true) {
    if (sharp || scale >= dpr * 0.98) {
      uniforms.uRes.value.copy(full);
      renderer.setRenderTarget(null);
      trace();
      return;
    }
    uniforms.uRes.value.set(motion.width, motion.height);
    renderer.setRenderTarget(motion);
    trace();
    renderer.setRenderTarget(null);
    upscale.uniforms.uSrc.value.set(motion.width, motion.height);
    quad.material = upscale;
    renderer.render(scene, camera);
    quad.material = material;
  }

  // --- thumbnails: each drink on its own, cut out round the glass ---------------------------

  function thumbnails() {
    const size = THUMB * 2;
    const target = new THREE.WebGLRenderTarget(size, size);
    const out = document.createElement('canvas');
    out.width = THUMB;
    out.height = THUMB;
    const ctx = out.getContext('2d');
    const raw = new Uint8Array(size * size * 4);
    const big = document.createElement('canvas');
    big.width = size;
    big.height = size;
    const bctx = big.getContext('2d');
    const res = uniforms.uRes.value.clone();
    const urls = items.map((it) => {
      const g = makeGlass(it, false, 0);
      g.drop = 1;
      g.landed = 10;
      uniforms.uRes.value.set(size, size);
      const d = it.def.view;
      aim({ pitch: 8, target: d.target + 0.8, distance: d.distance * 0.66, zoom: 1 });
      pose(g);
      uniforms.uThumb.value = 1;
      uniforms.uOverlay.value = 0;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, raw);
      renderer.setRenderTarget(null);
      const img = bctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        const from = (size - 1 - y) * size * 4;
        img.data.set(raw.subarray(from, from + size * 4), y * size * 4);
      }
      bctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, THUMB, THUMB);
      ctx.drawImage(big, 0, 0, THUMB, THUMB);
      return out.toDataURL('image/png');
    });
    target.dispose();
    uniforms.uThumb.value = 0;
    uniforms.uRes.value.copy(res);
    return urls;
  }

  // --- loop -------------------------------------------------------------------------------

  let raf = 0;
  let last = 0;
  let lastMoving = 0;
  let slow = 0;
  let quick = 0;
  let ceiling = dpr;
  let calm = 0;
  let sharp = false;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    step(dt);
    if (!moving()) {
      // all still: one sharp frame, then nothing more to draw until something moves
      calm += dt;
      if (!sharp && calm > 0.12) {
        render(true);
        sharp = true;
      }
      lastMoving = 0;
      return;
    }
    calm = 0;
    sharp = false;
    // a ray traced glass is heavy: trace fewer pixels while frames run long, more when there's room,
    // but never so few that it turns to mush
    if (lastMoving) {
      const ms = now - lastMoving;
      slow = ms > 36 ? slow + 1 : 0;
      quick = ms < 20 ? quick + 1 : 0;
      if (slow > 8 && scale > floor) {
        ceiling = scale;
        scale = Math.max(scale * 0.88, floor);
        layout();
        slow = 0;
      } else if (quick > 120 && scale < Math.min(dpr, ceiling * 0.98)) {
        scale = Math.min(scale * 1.08, dpr);
        layout();
        quick = 0;
      }
    }
    lastMoving = now;
    render(false);
  };

  const observer = new ResizeObserver(layout);
  observer.observe(canvas);
  layout();

  let disposed = false;
  // let the page paint before the shader compiles, which can take a moment
  const boot = setTimeout(() => {
    if (disposed) return;
    try {
      onThumbs(thumbnails());
      goTo(0);
      render();
    } catch {
      onFail();
      return;
    }
    onReady();
    raf = requestAnimationFrame(tick);
  }, 30);

  if (process.env.NODE_ENV !== 'production') {
    window.__cocktail = {
      get cur() {
        return cur;
      },
      get out() {
        return out;
      },
      view,
      render,
      // a moving frame, traced at `scale` and scaled up
      motion: () => render(false),
      step,
      goTo,
      stop: () => cancelAnimationFrame(raf),
      start: () => (raf = requestAnimationFrame(tick)),
      // replays drink i coming in after the one before it, t seconds on, frame by frame
      at(i, t, fps = 60) {
        index = (i - 1 + items.length) % items.length;
        cur = makeGlass(items[index], false, 0);
        cur.fill = 0;
        cur.drop = 1;
        cur.landed = 10;
        out = null;
        time = 0;
        goTo(i);
        for (let k = 0; k < Math.round(t * fps); k++) step(1 / fps);
        render();
      },
      scale: (s) => {
        scale = s;
        layout();
      },
    };
  }

  return {
    goTo,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    sip,
    hold,
    release,
    refill,
    dispose() {
      disposed = true;
      clearTimeout(boot);
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      geometry.dispose();
      material.dispose();
      upscale.dispose();
      motion.dispose();
      bakeMaterial.dispose();
      for (const it of items) it.profile?.dispose();
      renderer.dispose();
      delete window.__cocktail;
    },
  };
}

const LABEL =
  'A cocktail in 3D. Drag to turn the glass, scroll or pinch to come closer, tap the glass or hold the sip button to drink.';

const CocktailStage = forwardRef(function CocktailStage(
  { drinks, auto, onIndex, onFill, onReady, onFail, onThumbs },
  ref,
) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const callbacks = useRef({ onIndex, onFill, onReady, onFail, onThumbs });
  callbacks.current = { onIndex, onFill, onReady, onFail, onThumbs };

  useImperativeHandle(
    ref,
    () => ({
      goTo: (i) => stageRef.current?.goTo(i),
      next: () => stageRef.current?.next(),
      prev: () => stageRef.current?.prev(),
      sip: () => stageRef.current?.sip(),
      hold: () => stageRef.current?.hold(),
      release: () => stageRef.current?.release(),
      refill: () => stageRef.current?.refill(),
    }),
    [],
  );

  useEffect(() => {
    const stage = createStage(canvasRef.current, {
      drinks,
      getAuto: () => autoRef.current,
      onIndex: (i) => callbacks.current.onIndex?.(i),
      onFill: (f) => callbacks.current.onFill?.(f),
      onReady: () => callbacks.current.onReady?.(),
      onFail: () => callbacks.current.onFail?.(),
      onThumbs: (urls) => callbacks.current.onThumbs?.(urls),
    });
    stageRef.current = stage;
    return () => stage.dispose();
  }, [drinks]);

  return (
    <canvas
      ref={canvasRef}
      className="ck-canvas"
      aria-label={LABEL}
    />
  );
});

export default CocktailStage;
