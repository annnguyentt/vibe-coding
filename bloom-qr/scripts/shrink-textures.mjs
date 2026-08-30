// Downscale GLB textures with macOS `sips` and repack the container.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const [, , inPath, outPath, sizeArg, qualityArg] = process.argv;
const MAX = Number(sizeArg || 1024);
const QUALITY = qualityArg || 'normal';

const pad4 = (n) => (4 - (n % 4)) % 4;

function readGlb(buf) {
  const len = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < len) {
    const chunkLen = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + chunkLen);
    if (type === 'JSON') json = JSON.parse(body.toString('utf8'));
    else bin = body;
    off += 8 + chunkLen;
  }
  return { json, bin };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glbopt-'));
const { json, bin } = readGlb(fs.readFileSync(inPath));

// Resize every image that lives in a bufferView.
const replacements = new Map(); // bufferView index -> new Buffer
for (const [i, img] of (json.images || []).entries()) {
  if (img.bufferView == null) continue;
  const bv = json.bufferViews[img.bufferView];
  const start = bv.byteOffset || 0;
  const src = bin.subarray(start, start + bv.byteLength);
  const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
  const fin = path.join(tmp, `img${i}.${ext}`);
  const fout = path.join(tmp, `img${i}.out.jpg`);
  fs.writeFileSync(fin, src);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', QUALITY, '-Z', String(MAX), fin, '--out', fout], { stdio: 'ignore' });
  const outBuf = fs.readFileSync(fout);
  replacements.set(img.bufferView, outBuf);
  img.mimeType = 'image/jpeg';
  console.log(`  ${img.name}: ${(src.length / 1e6).toFixed(2)}MB -> ${(outBuf.length / 1e6).toFixed(2)}MB`);
}

// Rebuild the binary chunk, re-emitting every bufferView in order.
const chunks = [];
let cursor = 0;
json.bufferViews.forEach((bv, i) => {
  const data = replacements.get(i) ?? bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const padding = pad4(cursor);
  if (padding) { chunks.push(Buffer.alloc(padding)); cursor += padding; }
  bv.byteOffset = cursor;
  bv.byteLength = data.length;
  chunks.push(Buffer.from(data));
  cursor += data.length;
});
const newBin = Buffer.concat(chunks);
json.buffers = [{ byteLength: newBin.length }];

const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = Buffer.alloc(pad4(jsonBuf.length), 0x20);
const binPad = Buffer.alloc(pad4(newBin.length), 0);
const jsonChunk = Buffer.concat([jsonBuf, jsonPad]);
const binChunk = Buffer.concat([newBin, binPad]);

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
  header,
  chunkHeader(jsonChunk.length, 'JSON'), jsonChunk,
  chunkHeader(binChunk.length, 'BIN\0'), binChunk,
]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${path.basename(outPath)}: ${(fs.statSync(inPath).size / 1e6).toFixed(1)}MB -> ${(fs.statSync(outPath).size / 1e6).toFixed(2)}MB`);
