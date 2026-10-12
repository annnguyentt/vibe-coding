import * as THREE from 'three';

export const CASE = 146;
export const HALF = CASE / 2;
const CORNER = 8;
const DISC_R = 60;
const DISC_HOLE = 7.5;
const DISC_TOP = -1.2;
const DISC_THICK = 1.2;
const CLEAR_R = 15;
export const HINGE = { x: -HALF + 1, z: 4 };
const LID_Z = [3, 5];
const FLOOR_Z = [-5.2, -3.8];

const RAIL = { hw: 3.3, hh: 3.1, rc: 2.8, zc: -0.7 };
const INNER = { hw: 2.4, hh: 2.6, rc: 2.2, zc: -1.2 };
const INSET_INNER = 9.6;
const WELL_R = 61.6;

function arc(c, r, a0, a1, step = 1.2) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

function fillet(points, r, closed) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!closed && (i === 0 || i === n - 1)) {
      out.push(p);
      continue;
    }
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const da = norm2([a[0] - p[0], a[1] - p[1]]);
    const db = norm2([b[0] - p[0], b[1] - p[1]]);
    const cos = da[0] * db[0] + da[1] * db[1];
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    if (half > Math.PI / 2 - 1e-3) {
      out.push(p);
      continue;
    }
    const cut = r / Math.tan(half);
    const bis = norm2([da[0] + db[0], da[1] + db[1]]);
    const c = [p[0] + bis[0] * (r / Math.sin(half)), p[1] + bis[1] * (r / Math.sin(half))];
    const s = [p[0] + da[0] * cut, p[1] + da[1] * cut];
    const e = [p[0] + db[0] * cut, p[1] + db[1] * cut];
    let a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    let a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    out.push(...arc(c, r, a0, a1, 0.8));
  }
  return out;
}

function norm2(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

function roundedSquare(half, r) {
  return fillet(
    [
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ],
    r,
    true,
  );
}

function roundedRect(cx, cy, hw, hh, r) {
  return fillet(
    [
      [cx + hw, cy - hh],
      [cx + hw, cy + hh],
      [cx - hw, cy + hh],
      [cx - hw, cy - hh],
    ],
    r,
    true,
  );
}

function circle(cx, cy, r, step = 1) {
  const n = Math.max(24, Math.ceil((2 * Math.PI * r) / step));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function profile({ hw, hh, rc }, seg = 6) {
  const pts = [];
  const nrm = [];
  const corners = [
    [hw - rc, hh - rc, 0],
    [-(hw - rc), hh - rc, Math.PI / 2],
    [-(hw - rc), -(hh - rc), Math.PI],
    [hw - rc, -(hh - rc), (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      const p = [cx + rc * Math.cos(a), cy + rc * Math.sin(a)];
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
      pts.push(p);
      nrm.push([Math.cos(a), Math.sin(a)]);
    }
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) {
    pts.pop();
    nrm.pop();
  }
  return { pts, nrm };
}

class RodBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.centre = [];
    this.side = [];
    this.size = [];
    this.cap = [];
    this.index = [];
  }

  vertex(p, n, c, s, size, cap) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.centre.push(c[0], c[1], c[2]);
    this.side.push(s[0], s[1], 0);
    this.size.push(size.hw, size.hh, size.rc);
    this.cap.push(cap);
    return this.pos.length / 3 - 1;
  }

  add(path, size, closed = false) {
    const { pts, nrm } = profile(size, size.seg ?? 6);
    const m = pts.length;
    const n = path.length;
    const zc = size.zc;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const t = norm2([b[0] - a[0], b[1] - a[1]]);
      frames.push({ p: path[i], t, s: [-t[1], t[0]] });
    }
    const base = this.pos.length / 3;
    for (const f of frames) {
      const c = [f.p[0], f.p[1], zc];
      for (let j = 0; j < m; j++) {
        const [px, py] = pts[j];
        const [nx, ny] = nrm[j];
        this.vertex([c[0] + f.s[0] * px, c[1] + f.s[1] * px, zc + py], [f.s[0] * nx, f.s[1] * nx, ny], c, f.s, size, 0);
      }
    }
    const rings = closed ? n : n - 1;
    for (let i = 0; i < rings; i++) {
      const r0 = base + i * m;
      const r1 = base + ((i + 1) % n) * m;
      for (let j = 0; j < m; j++) {
        const j1 = (j + 1) % m;
        this.index.push(r0 + j, r0 + j1, r1 + j, r0 + j1, r1 + j1, r1 + j);
      }
    }
    if (!closed && size.ends === 'flat') {
      for (const [k, dir] of [
        [0, -1],
        [n - 1, 1],
      ]) {
        const f = frames[k];
        const c = [f.p[0], f.p[1], zc];
        const out = [f.t[0] * dir, f.t[1] * dir, 0];
        const mid = this.vertex(c, out, c, f.s, size, 1);
        const ring = [];
        for (let j = 0; j < m; j++) {
          const [px, py] = pts[j];
          ring.push(this.vertex([c[0] + f.s[0] * px, c[1] + f.s[1] * px, zc + py], out, c, f.s, size, 1));
        }
        for (let j = 0; j < m; j++) {
          const a = ring[j];
          const b = ring[(j + 1) % m];
          if (dir > 0) this.index.push(mid, a, b);
          else this.index.push(mid, b, a);
        }
      }
    } else if (!closed) {
      const dome = Math.min(size.hw, size.hh) * 0.8;
      const K = 5;
      for (const [k, dir] of [
        [0, -1],
        [n - 1, 1],
      ]) {
        const f = frames[k];
        const c = [f.p[0], f.p[1], zc];
        const ax = [f.t[0] * dir, f.t[1] * dir, 0];
        let prev = base + k * m;
        for (let r = 1; r <= K; r++) {
          const a = (r / K) * (Math.PI / 2);
          const sc = Math.cos(a);
          const off = Math.sin(a) * dome;
          const ring = this.pos.length / 3;
          for (let j = 0; j < m; j++) {
            const [px, py] = pts[j];
            const [nx, ny] = nrm[j];
            const radial = [f.s[0] * nx, f.s[1] * nx, ny];
            const nrmv = [
              radial[0] * sc * dome + ax[0] * Math.sin(a) * dome * 1.1,
              radial[1] * sc * dome + ax[1] * Math.sin(a) * dome * 1.1,
              radial[2] * sc * dome,
            ];
            const l = Math.hypot(...nrmv) || 1;
            this.vertex(
              [c[0] + f.s[0] * px * sc + ax[0] * off, c[1] + f.s[1] * px * sc + ax[1] * off, zc + py * sc],
              [nrmv[0] / l, nrmv[1] / l, nrmv[2] / l],
              c,
              f.s,
              size,
              0,
            );
          }
          for (let j = 0; j < m; j++) {
            const j1 = (j + 1) % m;
            if (dir > 0) this.index.push(prev + j, prev + j1, ring + j, prev + j1, ring + j1, ring + j);
            else this.index.push(prev + j, ring + j, prev + j1, prev + j1, ring + j, ring + j1);
          }
          prev = ring;
        }
      }
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aCentre', new THREE.Float32BufferAttribute(this.centre, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(this.side, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 3));
    g.setAttribute('aCap', new THREE.Float32BufferAttribute(this.cap, 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

function sheet(outline, z0, z1, holes = []) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const flat = new THREE.ShapeGeometry(shape, 1);
  const p = flat.attributes.position;
  const idx = flat.index.array;
  const pos = [];
  const nrm = [];
  const index = [];
  for (const [z, nz] of [
    [z1, 1],
    [z0, -1],
  ]) {
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), z);
      nrm.push(0, 0, nz);
    }
    for (let i = 0; i < idx.length; i += 3) {
      if (nz > 0) index.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
      else index.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
    }
  }
  flat.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(index);
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(z1 - z0), 1));
  g.computeBoundingSphere();
  return g;
}

function mergeSheets(list) {
  const pos = [];
  const nrm = [];
  const thick = [];
  const index = [];
  for (const g of list) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    thick.push(...g.attributes.aThick.array);
    for (const i of g.index.array) index.push(base + i);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(thick, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export function trayGeometry() {
  const rods = new RodBuilder();

  rods.add(roundedSquare(HALF - RAIL.hw, CORNER - 1.5), RAIL, true);
  rods.add(
    roundedSquare(HALF - 0.75, CORNER - 0.6),
    { hw: 0.75, hh: 0.7, rc: 0.68, zc: (FLOOR_Z[0] + FLOOR_Z[1]) / 2 },
    true,
  );

  const collar = { hw: 3.75, hh: 3.5, rc: 3.1, zc: RAIL.zc };
  const at = HALF - RAIL.hw;
  for (const s of [-1, 1]) {
    for (const x of [-35, -12, 12, 35]) {
      rods.add(
        [
          [x - 2.2, s * at],
          [x + 2.2, s * at],
        ],
        collar,
      );
    }
    for (const y of [-35, 12, 35, -12]) {
      if (s < 0 && Math.abs(y) < 20) continue;
      rods.add(
        [
          [s * at, y - 2.2],
          [s * at, y + 2.2],
        ],
        collar,
      );
    }
  }

  const e = HALF - INSET_INNER;
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const along = sx < 0 ? 26 : 35;
    const across = 35;
    const path = fillet(
      [
        [sx * e, sy * along],
        [sx * e, sy * e],
        [sx * across, sy * e],
      ],
      4.5,
      false,
    );
    rods.add(path, INNER);
    const step = { hw: 1.9, hh: 2.2, rc: 1.6, zc: INNER.zc };
    rods.add(
      [
        [sx * e, sy * along],
        [sx * (HALF - RAIL.hw), sy * along],
      ],
      step,
    );
    rods.add(
      [
        [sx * across, sy * e],
        [sx * across, sy * (HALF - RAIL.hw)],
      ],
      step,
    );
  }

  rods.add(circle(0, 0, WELL_R, 1.1), { hw: 1.15, hh: 1.7, rc: 1.0, zc: -2.1, seg: 5 }, true);
  rods.add(circle(0, 0, WELL_R - 1.55, 1.1), { hw: 0.5, hh: 0.8, rc: 0.45, zc: -3.0, seg: 4 }, true);

  for (const deg of [59, 121, 238.5, 301.5]) {
    const a = THREE.MathUtils.degToRad(deg);
    const d = [Math.cos(a), Math.sin(a)];
    rods.add(
      [
        [d[0] * 58.6, d[1] * 58.6],
        [d[0] * 63.2, d[1] * 63.2],
      ],
      { hw: 1.6, hh: 1.0, rc: 0.85, zc: -0.6, seg: 4 },
    );
  }

  for (const sx of [-1, 1]) {
    const path = fillet(
      [
        [sx * 46, -e],
        [sx * 46, -49.5],
        [sx * 42.6, -45.6],
      ],
      4.2,
      false,
    );
    rods.add(path, { hw: 1.9, hh: 1.9, rc: 1.8, zc: -2.0 });
  }

  const TAB = { x0: -HALF, x1: -50.5, hh: 22 };
  const tabMid = (TAB.x0 + TAB.x1) / 2;
  const tabHw = (TAB.x1 - TAB.x0) / 2;
  rods.add(
    roundedRect(tabMid, 0, tabHw - 0.8, TAB.hh - 0.8, 3.4),
    { hw: 0.8, hh: 0.8, rc: 0.75, zc: 1.8, seg: 4 },
    true,
  );
  rods.add(
    fillet(
      [
        [-69, 13],
        [-58.5, 13],
        [-58.5, -13],
        [-69, -13],
      ],
      3.2,
      false,
    ),
    { hw: 1.35, hh: 1.0, rc: 0.9, zc: 3.0 },
  );
  rods.add(roundedRect(-55.4, 0, 4.4, 3.2, 1.2), { hw: 0.65, hh: 0.55, rc: 0.5, zc: 3.0, seg: 3 }, true);

  const CAP = [-1.1, -0.2];
  rods.add(circle(0, 0, 18.8, 0.7), { hw: 0.8, hh: 0.75, rc: 0.7, zc: -0.5, seg: 4 }, true);
  rods.add(circle(0, 0, 16.5, 0.7), { hw: 0.45, hh: 0.45, rc: 0.42, zc: -0.15, seg: 3 }, true);
  rods.add(circle(0, 0, 9.6, 0.6), { hw: 0.95, hh: 0.95, rc: 0.9, zc: 0.0, seg: 4 }, true);
  rods.add(circle(0, 0, 6.6, 0.5), { hw: 0.55, hh: 0.85, rc: 0.5, zc: -0.35, seg: 3 }, true);
  const holes = [];
  for (const [hx, hy] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    rods.add(circle(hx * 8.9, hy * 8.9, 2.0, 0.4), { hw: 0.45, hh: 0.6, rc: 0.42, zc: -0.3, seg: 3 }, true);
    holes.push(circle(hx * 8.9, hy * 8.9, 1.7, 0.4).reverse());
  }

  const knuckle = { hw: 2.1, hh: 2.1, rc: 2.08, zc: HINGE.z, seg: 6, ends: 'flat' };
  rods.add(
    [
      [HINGE.x, 44],
      [HINGE.x, 63],
    ],
    knuckle,
  );
  rods.add(
    [
      [HINGE.x, -63],
      [HINGE.x, -44],
    ],
    knuckle,
  );

  const sheets = [
    sheet(roundedSquare(HALF, CORNER), FLOOR_Z[0], FLOOR_Z[1]),
    sheet(roundedRect(tabMid, 0, tabHw, TAB.hh, 4.2), 1.0, 2.6),
    sheet(circle(0, 0, 19.4, 0.7), CAP[0], CAP[1], [circle(0, 0, 6.2, 0.5).reverse(), ...holes]),
    sheet(circle(0, 0, CLEAR_R, 0.6), DISC_TOP - DISC_THICK, DISC_TOP, [circle(0, 0, DISC_HOLE, 0.5).reverse()]),
  ];
  rods.add(circle(0, 0, DISC_HOLE + 0.25, 0.5), { hw: 0.25, hh: 0.6, rc: 0.24, zc: DISC_TOP - 0.6, seg: 3 }, true);

  return { rods: rods.build(), sheets: mergeSheets(sheets) };
}

export function lidGeometry() {
  const rods = new RodBuilder();
  const zc = (LID_Z[0] + LID_Z[1]) / 2;
  rods.add(roundedSquare(HALF - 1.0, CORNER - 1), { hw: 1.0, hh: 1.0, rc: 0.98, zc, seg: 5 }, true);
  rods.add(roundedSquare(HALF - 3.4, CORNER - 3), { hw: 0.42, hh: 0.4, rc: 0.38, zc: LID_Z[0] + 0.25, seg: 3 }, true);
  for (const sy of [-1, 1]) {
    for (const x of [-42, 30]) {
      const y = sy * (HALF - 3.4);
      rods.add(arc([x, y], 4.4, sy > 0 ? Math.PI : 0, sy > 0 ? 2 * Math.PI : Math.PI, 0.5), {
        hw: 0.42,
        hh: 0.38,
        rc: 0.36,
        zc: LID_Z[0] + 0.22,
        seg: 3,
      });
    }
  }
  for (const sx of [-1, 1]) {
    for (const y of [-30, 30]) {
      const x = sx * (HALF - 3.4);
      rods.add(
        [
          [x, y - 3],
          [x, y + 3],
        ],
        { hw: 0.5, hh: 0.45, rc: 0.4, zc: LID_Z[0] + 0.3, seg: 3 },
      );
    }
  }
  const knuckle = { hw: 2.0, hh: 2.0, rc: 1.98, zc: HINGE.z, seg: 6, ends: 'flat' };
  rods.add(
    [
      [HINGE.x, 20],
      [HINGE.x, 42],
    ],
    knuckle,
  );
  rods.add(
    [
      [HINGE.x, -42],
      [HINGE.x, -20],
    ],
    knuckle,
  );

  const sheets = mergeSheets([sheet(roundedSquare(HALF, CORNER), LID_Z[0], LID_Z[1])]);
  return { rods: rods.build(), sheets };
}

export function discGeometry() {
  const pos = [];
  const nrm = [];
  const face = [];
  const index = [];
  const SEG = 256;
  const ring = (r0, r1, z, nz, rings, kind) => {
    const base = pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const r = r0 + ((r1 - r0) * j) / rings;
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        nrm.push(0, 0, nz);
        face.push(kind);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = base + j * SEG + i;
        const b = base + j * SEG + ((i + 1) % SEG);
        const c = a + SEG;
        const d = b + SEG;
        if (nz > 0) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
  };
  const band = (r, z0, z1, out) => {
    const base = pos.length / 3;
    for (const z of [z0, z1]) {
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        nrm.push(out * Math.cos(a), out * Math.sin(a), 0);
        face.push(2);
      }
    }
    for (let i = 0; i < SEG; i++) {
      const a = base + i;
      const b = base + ((i + 1) % SEG);
      const c = a + SEG;
      const d = b + SEG;
      if (out > 0) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  };
  const z1 = DISC_TOP;
  const z0 = DISC_TOP - DISC_THICK;
  ring(CLEAR_R, DISC_R, z1, 1, 24, 0);
  ring(CLEAR_R, DISC_R, z0, -1, 24, 1);
  band(DISC_R, z0, z1, 1);
  band(CLEAR_R, z0, z1, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
