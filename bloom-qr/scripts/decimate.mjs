// Decimate a single-primitive GLB's mesh while keeping its material/textures.
// The blossom is instanced a few hundred times at roughly one QR module across,
// so its source triangle budget is far more than the screen can show.
import fs from 'node:fs';
import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const [, , inPath, outPath, targetTrisArg] = process.argv;
const TARGET_TRIS = Number(targetTrisArg || 700);

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORMALIZE = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const pad4 = (n) => (4 - (n % 4)) % 4;

function readGlb(buf) {
  const total = buf.readUInt32LE(8);
  let off = 12, json = null, bin = null;
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'JSON') json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    else bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const Ctor = COMPONENT[acc.componentType];
  const comps = NUM_COMPONENTS[acc.type];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || comps * Ctor.BYTES_PER_ELEMENT;
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i += 1) {
    const view = new Ctor(bin.buffer, bin.byteOffset + base + i * stride, comps);
    for (let c = 0; c < comps; c += 1) {
      out[i * comps + c] = acc.normalized ? view[c] / NORMALIZE[acc.componentType] : view[c];
    }
  }
  return { array: out, comps, count: acc.count };
}

const src = readGlb(fs.readFileSync(inPath));
const prim = src.json.meshes[0].primitives[0];

const geometry = new THREE.BufferGeometry();
const pos = readAccessor(src.json, src.bin, prim.attributes.POSITION);
geometry.setAttribute('position', new THREE.BufferAttribute(pos.array, 3));
if (prim.attributes.NORMAL != null) {
  const n = readAccessor(src.json, src.bin, prim.attributes.NORMAL);
  geometry.setAttribute('normal', new THREE.BufferAttribute(n.array, 3));
}
if (prim.attributes.TEXCOORD_0 != null) {
  const uv = readAccessor(src.json, src.bin, prim.attributes.TEXCOORD_0);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv.array, 2));
}
if (prim.indices != null) {
  const idx = readAccessor(src.json, src.bin, prim.indices);
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(idx.array), 1));
}

const beforeTris = (geometry.index ? geometry.index.count : pos.count) / 3;
console.log(`source: ${pos.count} verts / ${beforeTris} tris`);

// The modifier removes a vertex count, not a triangle count, so weld first to
// learn the real vertex/triangle ratio and aim the removal precisely.
const merged = BufferGeometryUtils.mergeVertices(geometry);
const mergedVerts = merged.getAttribute('position').count;
const mergedTris = merged.index.count / 3;
const targetVerts = Math.max(12, Math.round((mergedVerts * TARGET_TRIS) / mergedTris));
const simplified = new SimplifyModifier().modify(merged, Math.max(0, mergedVerts - targetVerts));
simplified.computeVertexNormals();

const outPos = simplified.getAttribute('position');
const outNormal = simplified.getAttribute('normal');
const outUv = simplified.getAttribute('uv');
const outIndex = simplified.index;
console.log(
  `result: ${outPos.count} verts / ${outIndex ? outIndex.count / 3 : outPos.count / 3} tris (uv:${!!outUv}, indexed:${!!outIndex})`,
);

// ---- repack as a fresh glTF, reusing the original material + images ----
const chunks = [];
let cursor = 0;
const bufferViews = [];
const accessors = [];

function pushView(data) {
  const padding = pad4(cursor);
  if (padding) { chunks.push(Buffer.alloc(padding)); cursor += padding; }
  bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: data.length });
  chunks.push(Buffer.from(data));
  cursor += data.length;
  return bufferViews.length - 1;
}

function pushAccessor(attr, type) {
  const arr = new Float32Array(attr.array);
  const view = pushView(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  const comps = NUM_COMPONENTS[type];
  const min = new Array(comps).fill(Infinity);
  const max = new Array(comps).fill(-Infinity);
  for (let i = 0; i < attr.count; i += 1) {
    for (let c = 0; c < comps; c += 1) {
      const v = arr[i * comps + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  accessors.push({ bufferView: view, componentType: 5126, count: attr.count, type, min, max });
  return accessors.length - 1;
}

const attributes = { POSITION: pushAccessor(outPos, 'VEC3') };
if (outNormal) attributes.NORMAL = pushAccessor(outNormal, 'VEC3');
if (outUv) attributes.TEXCOORD_0 = pushAccessor(outUv, 'VEC2');

let indicesAccessor = null;
if (outIndex) {
  const idxArray = new Uint32Array(outIndex.array);
  const view = pushView(Buffer.from(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength));
  accessors.push({
    bufferView: view,
    componentType: 5125,
    count: idxArray.length,
    type: 'SCALAR',
  });
  indicesAccessor = accessors.length - 1;
}

const images = (src.json.images || []).map((img) => {
  const bv = src.json.bufferViews[img.bufferView];
  const start = bv.byteOffset || 0;
  return {
    name: img.name,
    mimeType: img.mimeType,
    bufferView: pushView(src.bin.subarray(start, start + bv.byteLength)),
  };
});

const bin = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'decimate.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'mesh_node' }],
  meshes: [
    {
      name: 'mesh',
      primitives: [
        indicesAccessor == null
          ? { attributes, material: 0 }
          : { attributes, indices: indicesAccessor, material: 0 },
      ],
    },
  ],
  materials: src.json.materials,
  textures: src.json.textures,
  samplers: src.json.samplers,
  images,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
const binChunk = Buffer.concat([bin, Buffer.alloc(pad4(bin.length), 0)]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const chunkHeader = (len, tag) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.write(tag, 4, 'ascii');
  return b;
};
fs.writeFileSync(outPath, Buffer.concat([
  header, chunkHeader(jsonChunk.length, 'JSON'), jsonChunk,
  chunkHeader(binChunk.length, 'BIN\0'), binChunk,
]));
console.log(`${outPath}: ${(fs.statSync(outPath).size / 1e6).toFixed(2)}MB`);
