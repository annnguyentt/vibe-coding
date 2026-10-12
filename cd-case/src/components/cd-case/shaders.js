export const STUDIO = `
  float box(vec2 p, vec2 c, vec2 hs, float soft) {
    vec2 q = abs(p - c) - hs;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    return 1.0 - smoothstep(-soft, soft, d);
  }

  vec3 lamp(vec2 p, vec2 at, float r, vec3 col) {
    return col * (1.0 - smoothstep(r * 0.5, r, length(p - at)));
  }

  const float LAMP = 12000.0;
  vec3 lamps(vec3 d) {
    d = normalize(d);
    vec2 p = d.xy / max(abs(d.z), 0.08);
    vec3 c = vec3(0.0);
    if (d.z > 0.0) {
      c += lamp(p, vec2(-0.42, 0.98), 0.01, vec3(1.0, 1.1, 1.27));
      c += lamp(p, vec2(0.62, 0.72), 0.01, vec3(0.85, 0.96, 1.1));
      c += lamp(p, vec2(-0.95, -0.5), 0.01, vec3(0.75, 0.85, 1.0));
      c += lamp(p, vec2(0.85, -0.7), 0.01, vec3(0.75, 0.85, 1.0));
      return c * smoothstep(0.0, 0.2, d.z) * LAMP;
    }
    c += lamp(p, vec2(-0.62, 0.58), 0.01, vec3(0.15, 0.17, 0.2));
    c += lamp(p, vec2(0.66, -0.6), 0.01, vec3(0.15, 0.17, 0.2));
    return c * smoothstep(0.0, 0.2, -d.z) * LAMP;
  }

  float band(float q, float c, float hw, float soft) {
    return 1.0 - smoothstep(hw - soft, hw + soft, abs(q - c));
  }

  float flags(float q) {
    float k = band(q, 0.27, 0.07, 0.02);
    k = max(k, band(q, 0.74, 0.12, 0.03));
    k = max(k, band(q, -0.32, 0.08, 0.02));
    k = max(k, band(q, -0.86, 0.14, 0.03));
    return k;
  }
  float hot(float q) {
    return band(q, 0.48, 0.07, 0.02) + band(q, 1.08, 0.14, 0.03) + band(q, -0.56, 0.08, 0.02) +
      0.8 * band(q, -1.25, 0.15, 0.03);
  }

  vec3 room(vec3 d) {
    d = normalize(d);
    vec2 p = d.xy / max(abs(d.z), 0.08);
    vec3 dim = vec3(0.02, 0.021, 0.026);
    if (d.z < 0.0) {
      vec3 c = vec3(0.1, 0.103, 0.112) * (1.0 - 0.5 * smoothstep(0.4, 1.6, length(p)));
      c += vec3(0.8) * (1.0 - smoothstep(0.05, 0.14, length(p)));
      c *= 1.0 - 0.97 * max(flags(p.x), flags(p.y));
      c += vec3(2.4, 2.6, 3.0) * (hot(p.x) + hot(p.y));
      return mix(dim, c, smoothstep(0.0, 0.2, -d.z));
    }
    vec3 c = dim * (0.5 + 0.5 * smoothstep(-1.2, 1.6, p.y));
    c += vec3(0.38) * smoothstep(-0.7, 0.8, p.y) * (1.0 - smoothstep(0.5, 1.0, length(p)));
    c += vec3(1.0, 0.99, 0.97) * 24.0 * box(p, vec2(-0.86, 0.3), vec2(0.065, 0.85), 0.035);
    c += vec3(0.96, 0.98, 1.0) * 20.0 * box(p, vec2(1.06, 0.04), vec2(0.06, 1.15), 0.03);
    c += vec3(1.0) * 13.0 * box(p, vec2(0.05, 1.28), vec2(1.25, 0.055), 0.03);
    c += vec3(0.92, 0.94, 0.97) * 2.4 * box(p, vec2(0.1, -1.05), vec2(1.15, 0.24), 0.28);
    c *= 1.0 - 0.92 * box(p, vec2(-0.2, 0.5), vec2(0.055, 1.4), 0.02);
    c *= 1.0 - 0.85 * box(p, vec2(0.62, -0.35), vec2(0.04, 0.9), 0.02);
    return mix(dim, c, smoothstep(0.0, 0.2, d.z));
  }

  float backdrop(vec3 d) {
    d = normalize(d);
    vec2 p = d.xy / max(abs(d.z), 0.08);
    float lit = 1.0 - smoothstep(0.3, 0.68, length(p * vec2(0.92, 1.0)));
    return d.z < 0.0 ? lit * smoothstep(0.0, 0.2, -d.z) : 0.0;
  }

  vec3 studio(vec3 d) {
    return mix(room(d), vec3(1.0), backdrop(d));
  }

  vec3 glare(vec3 d) {
    return max(studio(d) - vec3(0.45), 0.0);
  }

  const vec3 KEY = vec3(-0.625, 0.218, 0.75);
  const vec3 STRIP = vec3(0.725, 0.028, 0.688);
  const vec3 TOP = vec3(0.031, 0.786, 0.618);
  const vec3 BOUNCE = vec3(0.069, -0.722, 0.688);

  float fresnel(float cosv, float n) {
    float f0 = (n - 1.0) / (n + 1.0);
    f0 *= f0;
    return f0 + (1.0 - f0) * pow(1.0 - clamp(cosv, 0.0, 1.0), 5.0);
  }
`;

export const ROOM_BAKE_FRAG = `
  uniform int uFace;
  uniform float uSize;
  ${STUDIO}
  vec3 faceDir(int f, vec2 st) {
    vec2 c = st * 2.0 - 1.0;
    if (f == 0) return vec3(1.0, -c.y, -c.x);
    if (f == 1) return vec3(-1.0, -c.y, c.x);
    if (f == 2) return vec3(c.x, 1.0, c.y);
    if (f == 3) return vec3(c.x, -1.0, -c.y);
    if (f == 4) return vec3(c.x, -c.y, 1.0);
    return vec3(-c.x, -c.y, -1.0);
  }
  void main() {
    vec4 acc = vec4(0.0);
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        vec2 st = (gl_FragCoord.xy + (vec2(float(x), float(y)) + 0.5) / 4.0 - 0.5) / uSize;
        vec3 d = normalize(faceDir(uFace, st));
        vec3 l = lamps(d);
        acc += vec4(room(d) + l, dot(l, vec3(0.3333)));
      }
    }
    gl_FragColor = acc / 16.0;
  }
`;

export const ROD_VERT = `
  attribute vec3 aCentre;
  attribute vec3 aSide;
  attribute vec3 aSize;
  attribute float aCap;
  centroid varying vec3 vP;
  centroid varying vec3 vN;
  centroid varying vec3 vC;
  centroid varying vec3 vU;
  centroid varying vec3 vW;
  centroid varying vec3 vSize;
  centroid varying float vCap;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vC = (modelViewMatrix * vec4(aCentre, 1.0)).xyz;
    float s = length(modelViewMatrix[0].xyz);
    vU = normalize(mat3(modelViewMatrix) * aSide);
    vW = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));
    vSize = aSize * s;
    vCap = aCap;
    gl_Position = projectionMatrix * mv;
  }
`;

const OUTSIDE = `
  uniform sampler2D uBehind;
  uniform samplerCube uRoom;
  uniform mat4 uProj;
  uniform float uDepth;
  const float PAGE_SHOW = 0.25;

  vec2 screenAt(vec3 q) {
    vec4 clip = uProj * vec4(q, 1.0);
    return clip.xy / clip.w * 0.5 + 0.5;
  }

  uniform float uRoomSize;
  vec4 roomSeen(vec3 d, vec3 dx, vec3 dy) {
    float m = min(max(length(dx), length(dy)), 0.6);
    return textureLod(uRoom, d, log2(max(m * uRoomSize * 0.5, 1.0)));
  }

  vec4 outside(vec3 pos, vec3 dir, vec3 dx, vec3 dy) {
    vec4 env = roomSeen(dir, dx, dy);
    if (dir.z > -0.05) return env;
    float spread = min(length(dx) + length(dy), 0.3);
    float bend = acos(clamp(dot(dir, normalize(pos)), -1.0, 1.0));
    float w = 1.0 - smoothstep(0.04 - spread, 0.13 + spread, bend);
    vec2 uv = screenAt(pos + dir * uDepth);
    w *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    if (w <= 0.0) return env;
    vec4 seen = textureLod(uBehind, clamp(uv, 0.001, 0.999), 0.0);
    float matter = clamp(seen.a, 0.0, 1.0);
    vec3 page = mix(env.rgb, seen.rgb, PAGE_SHOW);
    return vec4(mix(env.rgb, mix(page, seen.rgb, matter), w), env.a * (1.0 - w));
  }
`;

export const ROD_FRAG = `
  uniform int uSamples;
  uniform float uIor;
  uniform vec3 uAbsorb;
  centroid varying vec3 vP;
  centroid varying vec3 vN;
  centroid varying vec3 vC;
  centroid varying vec3 vU;
  centroid varying vec3 vW;
  centroid varying vec3 vSize;
  centroid varying float vCap;
  ${STUDIO}
  ${OUTSIDE}

  vec3 exitProfile(vec2 q, vec2 d, vec2 b, float r) {
    vec2 tb = vec2(1e5);
    if (abs(d.x) > 1e-5) tb.x = (sign(d.x) * b.x - q.x) / d.x;
    if (abs(d.y) > 1e-5) tb.y = (sign(d.y) * b.y - q.y) / d.y;
    float t = max(min(tb.x, tb.y), 0.0);
    vec2 h = q + d * t;
    vec2 inner = max(b - r, vec2(0.0));
    if (r > 1e-4 && abs(h.x) > inner.x && abs(h.y) > inner.y) {
      vec2 c = sign(h) * inner;
      vec2 oc = q - c;
      float A = dot(d, d);
      float B = dot(oc, d);
      float C = dot(oc, oc) - r * r;
      float tc = (-B + sqrt(max(B * B - A * C, 0.0))) / A;
      return vec3(tc, normalize(q + d * tc - c));
    }
    vec2 n = tb.x < tb.y ? vec2(sign(d.x), 0.0) : vec2(0.0, sign(d.y));
    return vec3(t, n);
  }

  const int EXITS = 4;
  vec4 throughRod(vec3 P, vec3 N, vec3 I, float spread) {
    float n = uIor;
    vec3 dir = refract(I, N, 1.0 / n);
    vec3 pos = P - N * 0.002;
    vec2 b = vSize.xy;
    float r = vSize.z;
    float span = 6.0 * max(b.x, b.y);
    vec4 acc = vec4(0.0);
    float thr = 1.0;
    float path = 0.0;
    for (int i = 0; i < EXITS; i++) {
      vec3 rel = pos - vC;
      vec2 q = clamp(vec2(dot(rel, vU), dot(rel, vW)), -b, b);
      vec2 d2 = vec2(dot(dir, vU), dot(dir, vW));
      float t;
      vec3 Ne;
      if (dot(d2, d2) < 1e-4) {
        t = span;
        Ne = dir;
      } else {
        vec3 e = exitProfile(q, d2, b, r);
        t = min(e.x, span);
        Ne = normalize(vU * e.y + vW * e.z);
      }
      pos += dir * t;
      path += t;
      vec3 out_ = refract(dir, -Ne, n);
      bool trapped = dot(out_, out_) < 1e-6;
      float F = trapped ? 1.0 : fresnel(abs(dot(out_, Ne)), n);
      vec3 way = trapped ? normalize(dir - Ne * dot(dir, Ne)) : out_;
      vec3 wx = dFdx(way) * spread;
      vec3 wy = dFdy(way) * spread;
      vec4 o = outside(pos, way, wx, wy);
      vec3 w = thr * (1.0 - F) * exp(-uAbsorb * path);
      acc += vec4(w * o.rgb, dot(w, vec3(0.3333)) * o.a);
      thr *= F;
      dir = reflect(dir, Ne);
    }
    vec4 leak = roomSeen(dir, dFdx(dir) * spread, dFdy(dir) * spread);
    acc.rgb += thr * exp(-uAbsorb * path) * 0.6 * leak.rgb;
    return acc;
  }

  const vec2 P2[2] = vec2[2](vec2(-0.25, -0.25), vec2(0.25, 0.25));
  const vec2 P4[4] = vec2[4](vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(-0.375, 0.125), vec2(0.125, 0.375));

  void main() {
    vec3 V = normalize(-vP);
    vec3 I = -V;
    vec3 N0 = normalize(vN);
    vec3 N = dot(N0, V) < 0.0 ? -N0 : N0;
    float F = fresnel(max(dot(N, V), 0.0), uIor);

    vec3 R = reflect(I, N);
    vec4 mirror = roomSeen(R, dFdx(R), dFdy(R));
    vec3 refl = mix(mirror.rgb, vec3(1.0), backdrop(R));
    float spark = mirror.a * F;

    vec3 Px = dFdx(vP);
    vec3 Py = dFdy(vP);
    vec3 Nx = dFdx(N);
    vec3 Ny = dFdy(N);
    Nx *= min(1.0, 0.5 / max(length(Nx), 1e-4));
    Ny *= min(1.0, 0.5 / max(length(Ny), 1e-4));
    float spread = inversesqrt(float(uSamples));
    vec4 inside = vec4(0.0);
    for (int k = 0; k < 4; k++) {
      if (k >= uSamples) break;
      vec2 o = uSamples == 4 ? P4[k] : uSamples == 2 ? P2[k] : vec2(0.0);
      vec3 Pk = vP + Px * o.x + Py * o.y;
      vec3 Nk = normalize(N + Nx * o.x + Ny * o.y);
      inside += throughRod(Pk, Nk, normalize(Pk), spread);
    }
    inside /= float(uSamples);

    vec3 Ix = dFdx(I);
    vec3 Iy = dFdy(I);
    vec3 through = inside.rgb;
    if (vCap > 0.5) {
      through = outside(vP, I, Ix, Iy).rgb * 0.86;
    } else {
      spark += inside.a * (1.0 - F);
    }
    vec3 col = refl * F + through * (1.0 - F);
    gl_FragColor = vec4(col, 2.0 + spark);
  }
`;

export const SHEET_VERT = `
  attribute float aThick;
  varying vec3 vP;
  varying vec3 vN;
  varying float vThick;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vThick = aThick * length(modelViewMatrix[0].xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const SHEET_FRAG = `
  uniform float uIor;
  uniform vec3 uAbsorb;
  varying vec3 vP;
  varying vec3 vN;
  varying float vThick;
  ${STUDIO}
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vP);
    float cosv = abs(dot(N, V));
    if (dot(N, V) < 0.0) N = -N;
    float F = fresnel(cosv, uIor);
    float F0 = fresnel(1.0, uIor);
    float Fall = F + (1.0 - F) * (1.0 - F) * F;
    float Fall0 = F0 + (1.0 - F0) * (1.0 - F0) * F0;
    float cosT = sqrt(1.0 - (1.0 - cosv * cosv) / (uIor * uIor));
    float absorbed = 1.0 - exp(-dot(uAbsorb, vec3(0.3333)) * vThick / max(cosT, 0.2));
    float takes = clamp(max(Fall - Fall0, 0.0) + Fall0 * 0.05 + absorbed * 0.5, 0.0, 1.0);
    vec3 R = reflect(-V, N);
    vec3 refl = min(glare(R) * Fall * 0.25, vec3(0.1)) + min(room(R), vec3(1.2)) * max(Fall - Fall0, 0.0);
    vec3 tint = vec3(0.86, 0.9, 0.93) * (1.0 - cosv);
    gl_FragColor = vec4(refl + tint * 0.03, takes);
  }
`;

export const DISC_VERT = `
  attribute float aFace;
  varying vec3 vLocal;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vRad;
  varying vec3 vTan;
  varying float vFace;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vec2 r = normalize(position.xy + vec2(1e-5, 0.0));
    vRad = normalize(mat3(modelViewMatrix) * vec3(r, 0.0));
    vTan = normalize(mat3(modelViewMatrix) * vec3(-r.y, r.x, 0.0));
    vFace = aFace;
    gl_Position = projectionMatrix * mv;
  }
`;

export const DISC_FRAG = `
  uniform sampler2D uArt;
  uniform float uArtIn;
  uniform float uPrintOut;
  varying vec3 vLocal;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vRad;
  varying vec3 vTan;
  varying float vFace;
  ${STUDIO}

  vec3 bump3(vec3 x, vec3 y0) {
    return clamp(1.0 - x * x - y0, 0.0, 1.0);
  }
  vec3 spectral(float w) {
    float x = clamp((w - 400.0) / 300.0, 0.0, 1.0);
    vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
    vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
    vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
    vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
    vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
    vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
    float inside = step(380.0, w) * step(w, 760.0);
    return (bump3(c1 * (x - x1), y1) + bump3(c2 * (x - x2), y2)) * inside;
  }

  vec3 grating(vec3 L, vec3 V, float spread) {
    vec3 H = L + V;
    float along = dot(H, vTan);
    float u = abs(dot(H, vRad));
    float w = exp(-along * along / (spread * spread));
    vec3 c = spectral(1600.0 * u) + 0.75 * spectral(800.0 * u) + 0.45 * spectral(533.3 * u);
    return c * w;
  }

  vec3 lights(vec3 N) {
    return vec3(0.42) + vec3(0.62) * max(dot(N, KEY), 0.0) + vec3(0.28) * max(dot(N, STRIP), 0.0) +
      vec3(0.18) * max(dot(N, TOP), 0.0);
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vP);
    if (dot(N, V) < 0.0) N = -N;
    float cosv = max(dot(N, V), 0.0);
    vec3 R = reflect(-V, N);
    float r = length(vLocal.xy);
    vec3 col;

    if (vFace > 1.5) {
      col = vec3(0.3, 0.31, 0.33) + studio(R) * 0.25;
      gl_FragColor = vec4(col, 2.0);
      return;
    }

    vec4 art = texture2D(uArt, vLocal.xy / 120.0 + 0.5);
    vec3 rainbow = grating(KEY, V, 0.05) * 1.6 + grating(STRIP, V, 0.045) * 1.4 + grating(TOP, V, 0.06) * 0.9 +
      grating(BOUNCE, V, 0.16) * 0.35;
    float data = smoothstep(21.5, 23.0, r) * (1.0 - smoothstep(58.2, 58.8, r));
    float ring = 1.0 - 0.35 * (1.0 - smoothstep(0.15, 0.4, abs(r - 16.6)));
    vec3 edge = studio(R) * 0.35 + vec3(0.22, 0.23, 0.25);

    if (vFace > 0.5) {
      vec3 mirror = min(studio(R), vec3(1.6)) * 0.5 + vec3(0.42, 0.44, 0.47) * (0.6 + 0.4 * max(dot(N, KEY), 0.0));
      col = (mirror + rainbow * data * 1.3) * ring;
      float clear = 1.0 - smoothstep(14.6, 15.2, r);
      col = mix(col, vec3(0.62, 0.64, 0.67) + studio(R) * 0.06, clear);
      col = mix(col, edge, smoothstep(58.0, 58.9, r) * 0.85);
      gl_FragColor = vec4(col, 2.0);
      return;
    }

    col = (min(studio(R), vec3(2.0)) * 0.07 + vec3(0.012) + rainbow * data * 0.85) * ring;
    float printed = art.a * (1.0 - smoothstep(uPrintOut, uPrintOut + 0.4, r)) * smoothstep(uArtIn - 0.2, uArtIn + 0.2, r);
    col = mix(col, art.rgb * lights(N), printed);
    col += min(glare(R), vec3(2.5)) * fresnel(cosv, 1.5) * printed * 0.9;
    float rim = smoothstep(uPrintOut, uPrintOut + 0.5, r) * smoothstep(58.0, 58.9, r);
    col = mix(col, edge, rim * 0.85);
    gl_FragColor = vec4(col, 2.0);
  }
`;

export const BACKDROP_VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const BACKDROP_FRAG = `
  uniform vec3 uLight;
  uniform mat4 uTrayInv;
  uniform mat4 uLidInv;
  uniform float uScale;
  varying vec3 vWorld;
  const float DISC_DARK = 0.24;

  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - (b - r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  vec3 cross_(mat4 inv, vec3 o, vec3 d, float z0) {
    vec3 lo = (inv * vec4(o, 1.0)).xyz;
    vec3 ld = mat3(inv) * d;
    if (abs(ld.z) < 1e-4) return vec3(1e4, 1e4, -1.0);
    float s = (z0 - lo.z) / ld.z;
    if (s <= 0.0) return vec3(1e4, 1e4, -1.0);
    vec3 h = lo + ld * s;
    return vec3(h.xy, s);
  }

  void main() {
    float lit = 1.0;
    vec3 h = cross_(uTrayInv, vWorld, uLight, -2.0);
    if (h.z > 0.0) {
      float soft = 0.9 + h.z * 0.075 / uScale;
      float d = roundBox(h.xy, vec2(73.0), 8.0);
      float cover = 1.0 - smoothstep(-soft, soft, d);
      float rails = cover * smoothstep(-14.0 - soft, -9.0 + soft, d);
      lit *= 1.0 - (0.02 * cover + 0.08 * rails);
    }
    h = cross_(uTrayInv, vWorld, uLight, -1.8);
    if (h.z > 0.0) {
      float soft = 0.9 + h.z * 0.075 / uScale;
      float r = length(h.xy);
      float cover = (1.0 - smoothstep(60.0 - soft, 60.0 + soft, r)) * smoothstep(7.5 - soft, 7.5 + soft, r);
      lit *= 1.0 - DISC_DARK * cover;
    }
    h = cross_(uLidInv, vWorld, uLight, 4.0);
    if (h.z > 0.0) {
      float soft = 0.9 + h.z * 0.075 / uScale;
      float d = roundBox(h.xy, vec2(73.0), 8.0);
      float cover = 1.0 - smoothstep(-soft, soft, d);
      float rim = cover * smoothstep(-4.0 - soft, -1.0 + soft, d);
      lit *= 1.0 - (0.03 * cover + 0.05 * rim);
    }
    gl_FragColor = vec4(vec3(lit), 0.0);
  }
`;

export const SCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const COPY_FRAG = `
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    gl_FragColor = textureLod(uTex, vUv, 0.0);
  }
`;

const PICTURE = `
  uniform sampler2D uTex;
  uniform sampler2D uTexInside;
  uniform vec4 uRect;
  vec4 picture(vec2 uv) {
    bool inside = uv.x >= uRect.x && uv.x <= uRect.z && uv.y >= uRect.y && uv.y <= uRect.w;
    return inside ? textureLod(uTexInside, uv, 0.0) : textureLod(uTex, uv, 0.0);
  }
`;

export const BRIGHT_FRAG = `
  ${PICTURE}
  uniform vec2 uTexel;
  uniform float uThreshold;
  varying vec2 vUv;
  float sparkAt(vec2 uv) {
    vec2 h = uTexel * 0.25;
    return 0.25 * (max(picture(uv + vec2(-h.x, -h.y)).a - 2.0, 0.0) + max(picture(uv + vec2(h.x, -h.y)).a - 2.0, 0.0) +
      max(picture(uv + vec2(-h.x, h.y)).a - 2.0, 0.0) + max(picture(uv + vec2(h.x, h.y)).a - 2.0, 0.0));
  }
  void main() {
    vec4 here = picture(vUv);
    float s = sparkAt(vUv);
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    if (s <= uThreshold) return;
    float peak = 0.0;
    float round_ = 0.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      vec2 o = vec2(cos(a), sin(a));
      peak = max(peak, sparkAt(vUv + round(o * 1.42) * uTexel));
      round_ += sparkAt(vUv + o * uTexel * 4.0);
    }
    if (s < peak) return;
    float seed = max(s - round_ * 0.25 - uThreshold, 0.0);
    vec3 tint = mix(vec3(1.0), here.rgb / max(max(here.r, max(here.g, here.b)), 1e-3), 0.3);
    gl_FragColor = vec4(tint * min(seed, 8.0), 1.0);
  }
`;

export const STREAK_FRAG = `
  uniform sampler2D uTex;
  uniform vec2 uStep;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTex, vUv).rgb;
    float total = 1.0;
    for (int i = 1; i <= 10; i++) {
      float w = pow(uFalloff, float(i));
      c += (texture2D(uTex, vUv + uStep * float(i)).rgb + texture2D(uTex, vUv - uStep * float(i)).rgb) * w;
      total += 2.0 * w;
    }
    gl_FragColor = vec4(c / total * 3.0, 1.0);
  }
`;

export const FINAL_FRAG = `
  ${PICTURE}
  uniform sampler2D uStarA;
  uniform sampler2D uStarB;
  uniform float uStars;
  varying vec2 vUv;
  vec3 toSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 c = picture(vUv).rgb;
    vec3 stars = (texture2D(uStarA, vUv).rgb + texture2D(uStarB, vUv).rgb) * uStars;
    float k = clamp(dot(stars, vec3(0.3333)), 0.0, 1.0);
    c = mix(c, vec3(0.42, 0.62, 1.0), k * 0.6) + stars * vec3(0.8, 0.9, 1.0) * 0.5;
    gl_FragColor = vec4(toSRGB(c), 1.0);
  }
`;
