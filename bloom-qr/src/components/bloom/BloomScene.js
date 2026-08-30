import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildQrMatrix } from '@/utils/qr';
import {
  DEFAULT_PALETTE,
  LIGHT_TONES,
  BOARD_COLOR,
  TEXTURE_AVERAGE,
  NEEDS_LUMA_RECOLOR,
  resolveTint,
} from './palettes';
import { FLOWERS, DEFAULT_FLOWER } from './flowers';

const MODEL_URLS = {
  vase: '/models/qr-vase.glb',
  leaf: '/models/qr-leaves.glb',
};

// Everything below is measured in QR modules ("cells"), so the scene stays
// correct for any symbol version — only the camera distance has to change.
const TILE_HEIGHT = 0.34;
// Light modules are drawn as tiles too, barely proud of the board, so the whole
// symbol reads as one pixel mosaic instead of shapes floating on a flat sheet.
const LIGHT_TILE_HEIGHT = 0.05;
const VASE_HEIGHT = 9.5;

const BLOSSOM_QR_WIDTH = 1.05; // a touch of overlap, but little enough to stay in its cell
const BLOSSOM_BOUQUET_WIDTH = 2.6;
const LEAF_QR_LENGTH = 1.05;
const LEAF_BOUQUET_LENGTH = 7;

// Share of the instance budget spent on foliage rather than flowers.
const LEAF_FRACTION = 0.26;

// Capped rather than tracking the dark-module count, which swings from ~200 to
// ~1400 with URL length. The tiles carry the symbol on their own, so the plants
// only need to cover enough of it to read as a bouquet forming the code.
const MAX_INSTANCES_DESKTOP = 320;
const MAX_INSTANCES_MOBILE = 160;

// Fraction of the timeline spent on the centre-out ripple rather than on any
// single instance's own travel.
const STAGGER = 0.45;

// Exponential approach rate for the morph, in 1/seconds.
const MORPH_RATE = 3.2;

const CAMERA_FOV_BOUQUET = 34;
const CAMERA_FOV_QR = 16;
const ELEVATION_BOUQUET = THREE.MathUtils.degToRad(21);
// Held just under vertical: at exactly 90° the up-vector degenerates.
const ELEVATION_QR = THREE.MathUtils.degToRad(89.3);

// On phones the control dock sits along the bottom edge, so the subject is
// framed into the space above it. The page measures the dock and passes its
// height, so collapsing the panel gives the arrangement the room back. Wide
// screens put the panel beside the subject and need no offset. The breakpoint
// matches Tailwind's `sm` so the camera and the CSS agree.
const NARROW_BREAKPOINT_PX = 640;
const BOTTOM_DOCK_PX = 110;
// Never surrender more than this share of the viewport to the dock.
const MAX_DOCK_SHARE = 0.5;
// How fast the framing follows the dock opening or closing, in 1/seconds.
const INSET_RATE = 7;

// Butterflies visit the bouquet only. They scale away well before the code
// settles, so nothing ever flutters across a module a scanner has to read.
const BUTTERFLY_COUNT = 12;
const BUTTERFLY_WING_CELLS = 0.75;

const GOLDEN_ANGLE = Math.PI * (1 + Math.sqrt(5));
const lerp = THREE.MathUtils.lerp;

function smootherstep(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Deterministic RNG so a given URL always produces the same arrangement.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Distance at which a bounding sphere of `radius` subtends the whole frame.
 *
 * `verticalFraction` is the share of the viewport height still free once the
 * dock has taken its cut. Losing height is equivalent to a narrower vertical
 * field of view, and leaves the horizontal requirement untouched — inflating
 * the sphere instead would over-correct badly on a portrait phone, where width
 * is already the binding constraint.
 */
function frameDistance(radius, fovDeg, aspect, verticalFraction = 1) {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const effectiveVFov = 2 * Math.atan(Math.tan(vFov / 2) * verticalFraction);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  return Math.max(radius / Math.sin(effectiveVFov / 2), radius / Math.sin(hFov / 2));
}

/** Soft radial blob used as a contact shadow under the vase. */
function makeShadowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.34)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.14)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One butterfly wing as an alpha silhouette, hinged at u=0 so the geometry can
 * pivot on the body edge. Drawn rather than loaded — it is a handful of curves,
 * and it keeps the page free of another texture download.
 */
function makeWingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(4, 62);
  // forewing
  ctx.bezierCurveTo(18, 10, 92, 2, 116, 28);
  ctx.bezierCurveTo(126, 42, 102, 60, 76, 66);
  // hindwing
  ctx.bezierCurveTo(104, 74, 112, 102, 86, 120);
  ctx.bezierCurveTo(60, 132, 20, 108, 4, 74);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pull the first mesh out of a loaded glTF and re-pivot it to its own base. */
function extractMesh(gltf) {
  let found = null;
  gltf.scene.traverse((child) => {
    if (!found && child.isMesh) found = child;
  });
  if (!found) throw new Error('glTF contained no mesh');

  const geometry = found.geometry.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  // Centre horizontally and sit the base on y=0, so an instance position is
  // just "where this thing touches down".
  geometry.translate(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = found.material.clone();
  material.metalness = 0;
  material.roughness = Math.min(1, (material.roughness ?? 0.8) * 0.9 + 0.25);

  /*
   * A palette tints via instanceColor, which multiplies the texture. That can
   * only scale what a channel already holds, so a texture with almost no green
   * (the rose averages #8f0a16) can never be tinted gold. Collapsing the
   * texture to its luminance first — right before three's own <color_fragment>
   * applies vColor — lets the tint carry the hue on its own, so any model lands
   * on the palette's colour while keeping its shading. uDesaturate is 0 for the
   * "Original" palette, which wants the texture untouched.
   */
  const uniforms = { uDesaturate: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDesaturate = uniforms.uDesaturate;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDesaturate;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))),
          uDesaturate
        );`,
      );
  };
  // Without this the recoloured variant can collide with the stock program.
  material.customProgramCacheKey = () => 'bloom-recolor';

  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return { geometry, material, size, uniforms };
}

export default function BloomScene({
  value = '',
  palette = DEFAULT_PALETTE,
  flower = DEFAULT_FLOWER,
  showQr = false,
  bottomInset = 0,
  onReady,
  onError,
}) {
  const containerRef = useRef(null);
  // Props the render loop reads every frame without re-running the effect.
  const propsRef = useRef({ value, palette, flower, showQr, bottomInset });
  propsRef.current = { value, palette, flower, showQr, bottomInset };
  const apiRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    const maxInstances = isMobile ? MAX_INSTANCES_MOBILE : MAX_INSTANCES_DESKTOP;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // Needed so the PNG export can read the buffer back on demand.
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Flat, predictable colour response: the QR contrast budget is computed in
    // sRGB and tone mapping would quietly eat into it.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_BOUQUET, 1, 0.5, 400);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8ccc4, 1.55));
    const keyLight = new THREE.DirectionalLight(0xfff6ec, 1.35);
    keyLight.position.set(14, 26, 16);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.5);
    fillLight.position.set(-16, 10, -12);
    scene.add(fillLight);

    const world = new THREE.Group();
    scene.add(world);

    const boardMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), boardMaterial);
    board.rotation.x = -Math.PI / 2;
    world.add(board);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: makeShadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    contactShadow.renderOrder = 1;
    contactShadow.scale.set(13, 13, 1);
    world.add(contactShadow);

    const tmpMatrix = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const tmpQuatB = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    const tmpColor = new THREE.Color();
    const FORWARD = new THREE.Vector3(0, 0, 1);
    const flightDir = new THREE.Vector3();
    const flapQuat = new THREE.Quaternion();

    // --- butterflies ---------------------------------------------------
    // Two instanced meshes, one per wing, so each wing can flap on its own
    // hinge in a single draw call each. alphaTest rather than transparency:
    // the wings then need no depth sorting as they pass through the flowers.
    const wingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: makeWingTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const wingLeftGeometry = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    // Mirrored by scaling the geometry, which keeps u=0 on the hinge — laying
    // out a second plane would put the tip there instead.
    const wingRightGeometry = wingLeftGeometry.clone().scale(-1, 1, 1);
    const wingLeft = new THREE.InstancedMesh(wingLeftGeometry, wingMaterial, BUTTERFLY_COUNT);
    const wingRight = new THREE.InstancedMesh(wingRightGeometry, wingMaterial, BUTTERFLY_COUNT);
    const butterflies = [];
    const butterflyRand = mulberry32(0x8f21a3);
    for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
      butterflies.push({
        // A lissajous loop per axis: never repeats visibly, costs no state.
        radius: [
          0.85 + butterflyRand() * 0.7,
          0.4 + butterflyRand() * 0.45,
          0.85 + butterflyRand() * 0.7,
        ],
        speed: [
          0.24 + butterflyRand() * 0.22,
          0.34 + butterflyRand() * 0.3,
          0.24 + butterflyRand() * 0.22,
        ],
        phase: [
          butterflyRand() * Math.PI * 2,
          butterflyRand() * Math.PI * 2,
          butterflyRand() * Math.PI * 2,
        ],
        heightBias: -0.25 + butterflyRand() * 0.7,
        flapSpeed: 9 + butterflyRand() * 6,
        flapPhase: butterflyRand() * Math.PI * 2,
        scale: 0.75 + butterflyRand() * 0.5,
        pale: butterflyRand() < 0.5,
      });
    }
    [wingLeft, wingRight].forEach((mesh) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.setColorAt(0, tmpColor.set(0xffffff));
      world.add(mesh);
    });

    let tiles = null;
    let sets = [];
    let vase = null;
    let assets = null;
    let vaseTopRadius = 3;
    let layout = null;
    let morph = 0; // 0 = bouquet, 1 = QR
    let disposed = false;
    let azimuthDrag = 0;
    let gutterSmoothed = null;

    function disposeInstanced(mesh) {
      if (!mesh) return;
      world.remove(mesh);
      mesh.dispose();
    }

    /**
     * Bake both poses for one family of instances.
     *
     * Each instance carries a bouquet pose and a QR pose plus a ripple delay;
     * the frame loop only interpolates between them.
     */
    function buildSet({ model, cells, half, maxRadius, ballRadius, ballCenterY, vaseTopRadius, rand, kind }) {
      const count = cells.length;
      const qrPos = new Float32Array(count * 3);
      const qrQuat = new Float32Array(count * 4);
      const qrScale = new Float32Array(count);
      const bqPos = new Float32Array(count * 3);
      const bqQuat = new Float32Array(count * 4);
      const bqScale = new Float32Array(count);
      const delay = new Float32Array(count);
      const arc = new Float32Array(count);
      const swayPhase = new Float32Array(count);

      const isLeaf = kind === 'leaf';
      const qrUnit = isLeaf
        ? LEAF_QR_LENGTH / model.size.y
        : BLOSSOM_QR_WIDTH / model.size.x;
      const bouquetUnit = isLeaf
        ? LEAF_BOUQUET_LENGTH / model.size.y
        : BLOSSOM_BOUQUET_WIDTH / model.size.x;

      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const outward = new THREE.Vector3();
      const axis = new THREE.Vector3();
      const xAxis = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      const basis = new THREE.Matrix4();
      const spin = new THREE.Quaternion();
      const orient = new THREE.Quaternion();

      for (let i = 0; i < count; i += 1) {
        const cell = cells[i];
        const x = cell.col - half;
        const z = cell.row - half;

        // --- QR pose ---
        qrPos[i * 3] = x;
        qrPos[i * 3 + 1] = TILE_HEIGHT + (isLeaf ? 0.04 : 0);
        qrPos[i * 3 + 2] = z;

        if (isLeaf) {
          // A leaf's length runs along local +Y and its flat face normal along
          // local +Z, so mapping Y to a compass direction and Z to world up
          // lays the frond flat on the tile, face up.
          const yaw = rand() * Math.PI * 2;
          dir.set(Math.cos(yaw), 0, Math.sin(yaw));
          zAxis.copy(up);
          xAxis.crossVectors(dir, zAxis);
          basis.makeBasis(xAxis, dir, zAxis);
          orient.setFromRotationMatrix(basis);
        } else {
          orient.setFromAxisAngle(up, rand() * Math.PI * 2);
        }
        qrQuat.set([orient.x, orient.y, orient.z, orient.w], i * 4);
        qrScale[i] = qrUnit * (0.9 + rand() * 0.2);

        // --- bouquet pose ---
        const k = i + 0.5;
        const theta = GOLDEN_ANGLE * k;

        if (isLeaf) {
          // Every stem starts inside the vase mouth and is long enough to reach
          // out past the flowers, so a leaf reads as growing from the water
          // rather than sprouting off the surface of the bouquet. Most of its
          // length is hidden inside the ball; only the tip clears it.
          outward.set(Math.cos(theta), 0, Math.sin(theta));
          const baseRadius = vaseTopRadius * (0.5 + rand() * 0.42);
          bqPos[i * 3] = outward.x * baseRadius;
          bqPos[i * 3 + 1] = VASE_HEIGHT - 0.5;
          bqPos[i * 3 + 2] = outward.z * baseRadius;

          // Leans away from vertical, but never far enough to lie flat.
          const lean = 0.5 + rand() * 0.32;
          axis
            .copy(up)
            .multiplyScalar(1 - lean)
            .addScaledVector(outward, lean)
            .normalize();
          orient.setFromUnitVectors(up, axis);
          bqScale[i] = bouquetUnit * (0.9 + rand() * 0.22);
        } else {
          // Blossoms pack the whole sphere.
          const phi = Math.acos(Math.min(1, Math.max(-1, 1 - (2 * k) / count)));
          dir.set(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta),
          );
          const r = ballRadius * (0.84 + rand() * 0.16);
          bqPos[i * 3] = dir.x * r;
          // Squash vertically so the ball reads as an arrangement, not a globe.
          bqPos[i * 3 + 1] = ballCenterY + dir.y * r * 0.86;
          bqPos[i * 3 + 2] = dir.z * r;
          orient.setFromUnitVectors(up, dir);
          bqScale[i] = bouquetUnit * (0.78 + rand() * 0.42);
        }
        spin.setFromAxisAngle(up, rand() * Math.PI * 2);
        orient.multiply(spin);
        bqQuat.set([orient.x, orient.y, orient.z, orient.w], i * 4);

        delay[i] = Math.min(1, Math.hypot(x, z) / maxRadius);
        arc[i] = 1.5 + rand() * 3.5;
        swayPhase[i] = rand() * Math.PI * 2;
      }

      const mesh = new THREE.InstancedMesh(model.geometry, model.material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.setColorAt(0, tmpColor.set(0xffffff)); // allocates instanceColor
      world.add(mesh);

      return {
        kind,
        mesh,
        uniforms: model.uniforms,
        count,
        qrPos,
        qrQuat,
        qrScale,
        bqPos,
        bqQuat,
        bqScale,
        delay,
        arc,
        swayPhase,
        tintBouquet: new THREE.Color(0xffffff),
        tintQr: new THREE.Color(0xffffff),
      };
    }

    function rebuild(text) {
      // Prop effects can fire before the glTF loads; the load path calls
      // rebuild itself once the assets exist.
      if (!assets) return;

      const { size, bits, finder, data, boardCells } = buildQrMatrix(text);
      const blossomModel =
        assets.blossoms[propsRef.current.flower?.id] || assets.blossoms[DEFAULT_FLOWER.id];
      const half = (size - 1) / 2;
      const rand = mulberry32(hashString(text || ' '));

      disposeInstanced(tiles);
      sets.forEach((set) => disposeInstanced(set.mesh));
      sets = [];

      // --- dark module tiles ---
      const tileCount = size * size;
      const tileGeometry = new THREE.BoxGeometry(1, TILE_HEIGHT, 1);
      // Unlit on purpose. Shading a raised tile darkens its side faces, which
      // draws an outline around every module and blurs the edge a scanner
      // binarises on; it also loses the flat pixel-mosaic look. Basic material
      // gives each module one exact colour from any angle, so neighbouring
      // dark modules merge into clean runs. White base colour here: the real
      // tone comes from instanceColor, which the material multiplies in.
      const tileMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, tileCount);
      tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      tiles.frustumCulled = false;
      tiles.setColorAt(0, tmpColor.set(0xffffff)); // allocates instanceColor
      world.add(tiles);

      const maxRadius = Math.hypot(half, half) || 1;
      const tilePos = new Float32Array(tileCount * 2);
      const tileDelay = new Float32Array(tileCount);
      const tileDark = new Uint8Array(tileCount);
      // Index into the palette's darkTones / lightTones. Indices 3+ are the
      // vase's cobalt, which the finder squares always take so the code keeps
      // the vase's colour after the vase itself has gone.
      const tileTone = new Uint8Array(tileCount);
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const i = row * size + col;
          const x = col - half;
          const z = row - half;
          tilePos[i * 2] = x;
          tilePos[i * 2 + 1] = z;
          tileDelay[i] = Math.min(1, Math.hypot(x, z) / maxRadius);
          const isDark = !!bits[i];
          tileDark[i] = isDark ? 1 : 0;
          if (!isDark) {
            tileTone[i] = Math.floor(rand() * 3);
          } else if (finder[i]) {
            tileTone[i] = rand() < 0.3 ? 4 : 3;
          } else {
            tileTone[i] = rand() < 0.16 ? 3 + Math.floor(rand() * 2) : Math.floor(rand() * 3);
          }
        }
      }

      // Shuffle the eligible data cells so a capped subset still spreads evenly
      // across the symbol, then split it so no cell gets both a flower and a
      // leaf stacked on it.
      const pool = data.slice();
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const total = Math.min(pool.length, maxInstances);
      const leafCount = Math.round(total * LEAF_FRACTION);
      const blossomCount = total - leafCount;

      const ballRadius = THREE.MathUtils.clamp(0.41 * Math.sqrt(total), 5, 9);
      const ballCenterY = VASE_HEIGHT + ballRadius * 0.42;
      const shared = { half, maxRadius, ballRadius, ballCenterY, vaseTopRadius, rand };

      sets = [
        buildSet({
          ...shared,
          model: blossomModel,
          cells: pool.slice(0, blossomCount),
          kind: 'blossom',
        }),
        buildSet({
          ...shared,
          model: assets.leaf,
          cells: pool.slice(blossomCount, total),
          kind: 'leaf',
        }),
      ].filter((set) => set.count > 0);

      // A blossom is pivoted at its base and points outward, so it reaches a
      // whole flower-height beyond the sphere its position sits on; foliage
      // reaches further still. Framing the ball alone crops both.
      const blossomOverhang =
        (BLOSSOM_BOUQUET_WIDTH / blossomModel.size.x) * 1.2 * blossomModel.size.y;
      const leafReach = vaseTopRadius + LEAF_BOUQUET_LENGTH * 0.98;
      const bouquetReach = Math.max(ballRadius + blossomOverhang, leafReach);
      const bouquetTop = Math.max(
        ballCenterY + ballRadius * 0.86 + blossomOverhang,
        VASE_HEIGHT + LEAF_BOUQUET_LENGTH * 0.75,
      );
      // Assigned before applyPalette, which reads layout.tileTone.
      layout = {
        boardCells,
        boardRadius: (boardCells / 2) * 1.18,
        tilePos,
        tileDelay,
        tileDark,
        tileTone,
        tileCount,
        ballCenterY,
        ballRadius,
        bouquetTargetY: bouquetTop * 0.5,
        // Generous margin: the arrangement should sit in the frame with air
        // around it rather than filling it edge to edge.
        bouquetRadius: Math.max(bouquetReach, bouquetTop * 0.5) * 1.35,
      };

      applyPalette(propsRef.current.palette);
    }

    /**
     * instanceColor is already a linear-space multiplier, so it must be written
     * raw — Color.set() would sRGB-decode it and skew every tint.
     */
    function setLinear(color, rgb) {
      color.r = rgb[0];
      color.g = rgb[1];
      color.b = rgb[2];
      return color;
    }

    function applyPalette(p) {
      const active = p || DEFAULT_PALETTE;
      // The board is white for every palette; only the modules carry colour.
      boardMaterial.color.set(BOARD_COLOR);

      if (tiles && layout) {
        const darkTones = active.darkTones.map((c) => new THREE.Color(c));
        const lightTones = LIGHT_TONES.map((c) => new THREE.Color(c));
        for (let i = 0; i < layout.tileCount; i += 1) {
          const tones = layout.tileDark[i] ? darkTones : lightTones;
          tiles.setColorAt(i, tones[layout.tileTone[i] % tones.length]);
        }
        if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
      }

      // A tint is usually a target colour, so it has to be solved against the
      // texture it will sit on — the models range from a pink peony to a blue
      // hydrangea, and the same target has to reach the same colour on both.
      const accentColor = new THREE.Color(active.accent);
      const paleColor = new THREE.Color(0xfff6ea);
      for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
        const wingColor = butterflies[i].pale ? paleColor : accentColor;
        wingLeft.setColorAt(i, wingColor);
        wingRight.setColorAt(i, wingColor);
      }
      if (wingLeft.instanceColor) wingLeft.instanceColor.needsUpdate = true;
      if (wingRight.instanceColor) wingRight.instanceColor.needsUpdate = true;

      const flowerId = propsRef.current.flower?.id || DEFAULT_FLOWER.id;
      sets.forEach((set) => {
        const isLeaf = set.kind === 'leaf';
        const modelId = isLeaf ? 'leaf' : flowerId;
        const average = TEXTURE_AVERAGE[modelId] || TEXTURE_AVERAGE[DEFAULT_FLOWER.id];
        const bouquetSpec = isLeaf ? active.bouquetLeaf : active.bouquetTint;
        // Only for a texture that can't be tinted per channel, and only when
        // the palette is actually recolouring — "Original" passes a null spec
        // and must show the model's own colour, grey being no use there.
        const desaturate = !!NEEDS_LUMA_RECOLOR[modelId] && typeof bouquetSpec === 'string';
        if (set.uniforms) set.uniforms.uDesaturate.value = desaturate ? 1 : 0;
        setLinear(set.tintBouquet, resolveTint(bouquetSpec, average, desaturate));
        setLinear(
          set.tintQr,
          resolveTint(isLeaf ? active.qrLeaf : active.qrTint, average, desaturate),
        );
      });
    }

    apiRef.current = { rebuild, applyPalette };

    // ---- interaction ------------------------------------------------------
    let dragging = false;
    let dragStartX = 0;
    let dragStartAzimuth = 0;
    const onPointerDown = (e) => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartAzimuth = azimuthDrag;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = (e.clientX - dragStartX) / Math.max(1, container.clientWidth);
      azimuthDrag = THREE.MathUtils.clamp(dragStartAzimuth + dx * 2.2, -0.9, 0.9);
    };
    const onPointerUp = (e) => {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(e.pointerId);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    function resize() {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // ---- frame loop -------------------------------------------------------
    let raf = 0;
    const startedAt = performance.now();
    let lastFrameAt = startedAt;

    /**
     * Advance the morph by `dt` seconds and draw. Split out from the rAF loop
     * so a capture can bring the scene up to date before reading the buffer
     * instead of exporting whatever the last frame happened to leave.
     */
    function updateScene(dt) {
      if (!layout) return;

      const time = (performance.now() - startedAt) / 1000;
      const target = propsRef.current.showQr ? 1 : 0;
      // Exponential approach on a ~0.3s time constant. Frame-rate independent,
      // so the morph takes the same wall-clock time at 60Hz and 120Hz.
      morph += (target - morph) * (1 - Math.exp(-MORPH_RATE * dt));
      if (Math.abs(target - morph) < 0.0005) morph = target;
      const t = smootherstep(morph);
      const idle = 1 - smootherstep(morph * 2.2);

      // --- tiles ---
      tmpQuat.identity();
      for (let i = 0; i < layout.tileCount; i += 1) {
        const ti = smootherstep(
          (morph - layout.tileDelay[i] * STAGGER) / (1 - STAGGER),
        );
        // Uniform scale collapses the tile to a degenerate point at ti=0, so it
        // draws nothing regardless of what the board is doing, and reaches
        // exactly 1 at ti=1 so neighbouring modules stay contiguous.
        const height = layout.tileDark[i] ? TILE_HEIGHT : LIGHT_TILE_HEIGHT;
        tmpPos.set(layout.tilePos[i * 2], (height / 2) * ti, layout.tilePos[i * 2 + 1]);
        tmpScale.set(ti, ti * (height / TILE_HEIGHT), ti);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        tiles.setMatrixAt(i, tmpMatrix);
      }
      tiles.instanceMatrix.needsUpdate = true;

      // --- blossoms and foliage ---
      for (let s = 0; s < sets.length; s += 1) {
        const set = sets[s];
        for (let i = 0; i < set.count; i += 1) {
          const ti = smootherstep((morph - set.delay[i] * STAGGER) / (1 - STAGGER));
          const sway = idle * 0.32;

          tmpPos.set(
            lerp(set.bqPos[i * 3], set.qrPos[i * 3], ti) +
              Math.sin(time * 0.7 + set.swayPhase[i]) * sway,
            lerp(set.bqPos[i * 3 + 1], set.qrPos[i * 3 + 1], ti) +
              Math.sin(ti * Math.PI) * set.arc[i] +
              Math.sin(time * 0.55 + set.swayPhase[i] * 1.3) * sway * 0.6,
            lerp(set.bqPos[i * 3 + 2], set.qrPos[i * 3 + 2], ti) +
              Math.cos(time * 0.62 + set.swayPhase[i]) * sway,
          );

          tmpQuat.fromArray(set.bqQuat, i * 4);
          tmpQuatB.fromArray(set.qrQuat, i * 4);
          tmpQuat.slerp(tmpQuatB, ti);

          const scale = lerp(set.bqScale[i], set.qrScale[i], ti);
          tmpScale.set(scale, scale, scale);

          tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
          set.mesh.setMatrixAt(i, tmpMatrix);

          tmpColor.copy(set.tintBouquet).lerp(set.tintQr, ti);
          set.mesh.setColorAt(i, tmpColor);
        }
        set.mesh.instanceMatrix.needsUpdate = true;
        if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
      }

      // --- vase ---
      if (vase) {
        const sink = smootherstep(morph * 1.5);
        vase.position.y = -VASE_HEIGHT * 1.15 * sink;
        vase.rotation.y = time * 0.06 + azimuthDrag * 0.4;
        vase.visible = sink < 0.995;
      }
      shadowMaterial.opacity = idle;
      contactShadow.visible = idle > 0.01;

      // --- butterflies ---
      // Bouquet-only guests: `idle` scales them to nothing well before the
      // code is readable, so they never sit on a module or reach the export.
      if (idle > 0.002) {
        wingLeft.visible = true;
        wingRight.visible = true;
        const spread = layout.ballRadius;
        for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
          const b = butterflies[i];
          const ax = time * b.speed[0] + b.phase[0];
          const ay = time * b.speed[1] + b.phase[1];
          const az = time * b.speed[2] + b.phase[2];

          tmpPos.set(
            Math.sin(ax) * spread * b.radius[0],
            layout.ballCenterY + b.heightBias * spread + Math.sin(ay) * spread * b.radius[1],
            Math.cos(az) * spread * b.radius[2],
          );

          // Analytic derivative of the path gives the heading, no extra state.
          flightDir
            .set(
              Math.cos(ax) * b.speed[0] * b.radius[0],
              Math.cos(ay) * b.speed[1] * b.radius[1],
              -Math.sin(az) * b.speed[2] * b.radius[2],
            )
            .normalize();
          tmpQuat.setFromUnitVectors(FORWARD, flightDir);

          const flap = Math.sin(time * b.flapSpeed + b.flapPhase) * 1.05;
          const wingScale = BUTTERFLY_WING_CELLS * b.scale * idle;
          tmpScale.set(wingScale, wingScale, wingScale);

          // Each wing hinges on the body axis, mirrored about it.
          flapQuat.setFromAxisAngle(FORWARD, flap);
          tmpMatrix.compose(tmpPos, tmpQuatB.copy(tmpQuat).multiply(flapQuat), tmpScale);
          wingLeft.setMatrixAt(i, tmpMatrix);

          flapQuat.setFromAxisAngle(FORWARD, -flap);
          tmpMatrix.compose(tmpPos, tmpQuatB.copy(tmpQuat).multiply(flapQuat), tmpScale);
          wingRight.setMatrixAt(i, tmpMatrix);
        }
        wingLeft.instanceMatrix.needsUpdate = true;
        wingRight.instanceMatrix.needsUpdate = true;
      } else {
        wingLeft.visible = false;
        wingRight.visible = false;
      }

      // --- board ---
      // Runs ahead of the tiles so a rising tile always has board under it.
      const boardGrow = lerp(0.46, 1, smootherstep(Math.min(1, morph * 1.7)));
      const boardWidth = layout.boardCells * boardGrow;
      board.scale.set(boardWidth, boardWidth, 1);

      // --- camera ---
      const fov = lerp(CAMERA_FOV_BOUQUET, CAMERA_FOV_QR, t);
      const elevation = lerp(ELEVATION_BOUQUET, ELEVATION_QR, t);
      // Both the drag and the idle drift fall to exactly zero by t=1, so the
      // finished code is always square to the frame rather than skewed.
      const azimuth =
        lerp(-0.42, 0, t) + azimuthDrag * (1 - t) + Math.sin(time * 0.11) * 0.05 * idle;
      const isNarrow = container.clientWidth < NARROW_BREAKPOINT_PX;
      // Fitting a sphere to a tall portrait screen is bound by its width, which
      // leaves vertical room to spare — pull in a little to use some of it.
      const radius =
        lerp(layout.bouquetRadius, layout.boardRadius, t) * (isNarrow ? 0.9 : 1);
      const viewH = Math.max(1, container.clientHeight);
      const targetGutter = isNarrow
        ? Math.min(propsRef.current.bottomInset || BOTTOM_DOCK_PX, viewH * MAX_DOCK_SHARE)
        : 0;
      // Eased, so collapsing the panel glides the framing rather than jumping.
      if (gutterSmoothed === null) gutterSmoothed = targetGutter;
      else gutterSmoothed += (targetGutter - gutterSmoothed) * (1 - Math.exp(-INSET_RATE * dt));
      const gutter = gutterSmoothed;
      const distance = frameDistance(
        radius,
        fov,
        camera.aspect,
        Math.max(0.25, (viewH - gutter) / viewH),
      );

      // The clip planes track the distance. A fixed far plane silently swallows
      // the whole scene as soon as the framing pushes the camera past it.
      const near = Math.max(0.5, distance - radius * 3);
      const far = distance + radius * 4 + 50;
      if (
        Math.abs(camera.fov - fov) > 1e-4 ||
        Math.abs(camera.near - near) > 0.5 ||
        Math.abs(camera.far - far) > 1
      ) {
        camera.fov = fov;
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }

      const targetY = lerp(layout.bouquetTargetY, 0, t);

      camera.position.set(
        distance * Math.cos(elevation) * Math.sin(azimuth),
        distance * Math.sin(elevation),
        distance * Math.cos(elevation) * Math.cos(azimuth),
      );
      camera.lookAt(0, targetY, 0);
      if (gutter > 0) {
        // Pure sensor shift: slide the camera down its own axis so the subject
        // rides above the dock without changing the view angle.
        const worldPerPx =
          (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / viewH;
        camera.translateY(-(gutter / 2) * worldPerPx);
      }

      renderer.render(scene, camera);
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      // Clamped so a backgrounded tab (where rAF stops entirely) doesn't
      // resume with one enormous step.
      const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      updateScene(dt);
    }

    // ---- load -------------------------------------------------------------
    const loader = new GLTFLoader();
    Promise.all([
      loader.loadAsync(MODEL_URLS.vase),
      loader.loadAsync(MODEL_URLS.leaf),
      // Every blossom up front — together they are well under a megabyte, and
      // it makes switching between them instant rather than a second of blank.
      ...FLOWERS.map((f) => loader.loadAsync(f.url)),
    ])
      .then(([vaseGltf, leafGltf, ...flowerGltfs]) => {
        if (disposed) return;

        const vaseModel = extractMesh(vaseGltf);
        const vaseScale = VASE_HEIGHT / vaseModel.size.y;
        vase = new THREE.Mesh(vaseModel.geometry, vaseModel.material);
        vase.scale.setScalar(vaseScale);
        world.add(vase);
        vaseTopRadius = (vaseModel.size.x * vaseScale) / 2;

        const blossoms = {};
        FLOWERS.forEach((f, i) => {
          blossoms[f.id] = extractMesh(flowerGltfs[i]);
        });
        assets = { blossoms, leaf: extractMesh(leafGltf) };

        rebuild(propsRef.current.value);
        frame();
        onReady?.({
          /** Bring the scene up to date, then hand back a PNG of it. */
          capture: () => {
            updateScene(0);
            return renderer.domElement.toDataURL('image/png');
          },
          /** Jump straight to a morph value, skipping the transition. */
          snapTo: (value) => {
            morph = THREE.MathUtils.clamp(value, 0, 1);
            updateScene(0);
          },
        });
      })
      .catch((err) => {
        if (!disposed) onError?.(err);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      apiRef.current = null;
      disposeInstanced(wingLeft);
      disposeInstanced(wingRight);
      wingMaterial.alphaMap?.dispose();
      disposeInstanced(tiles);
      sets.forEach((set) => disposeInstanced(set.mesh));
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose?.();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Mount once; all prop changes are pushed through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A different flower means different geometry for the blossom set, so the
  // scene is rebuilt; the seed is unchanged, so every tile and cell assignment
  // stays exactly where it was.
  useEffect(() => {
    apiRef.current?.rebuild(value);
  }, [value, flower]);

  useEffect(() => {
    apiRef.current?.applyPalette(palette);
  }, [palette]);

  return <div ref={containerRef} className="h-full w-full" />;
}
