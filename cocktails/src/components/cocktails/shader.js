// The whole drink is ray traced in one pass. Glass, liquid, ice and garnish are distance fields
// in the glass's own frame (y up from the foot, centimetres); a ray walks from one to the next,
// bending at every surface it crosses (Fresnel splits off a reflection, total internal reflection
// turns it back), soaking up colour through the drink and haze through the ice, until it leaves
// for the studio: a cream sweep, a grey room round it with a black flag either side, softboxes.

export const VERT = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const FRAG = /* glsl */ `
  precision highp float;
  precision highp int;

  #define ICE_MAX 5

  #define AIR 0
  #define GLASS 1
  #define LIQ 2
  #define ICE 3
  #define GARN 4

  const float EPS = 0.0016;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uCamPos;
  uniform mat3 uCamRot;    // right, up, back
  uniform float uFocal;    // 1 / tan(half the vertical fov)
  uniform mat4 uToLocal;   // studio -> glass
  uniform mat4 uToWorld;   // glass -> studio
  uniform vec3 uLight;     // toward the key light, studio

  // the glass: its profile, turned round y (see BAKE)
  uniform sampler2D uProfile;
  uniform vec3 uDom;       // the radius and the heights the profile covers: r max, y min, y span
  uniform vec2 uBound;     // a cylinder round everything: radius, top

  uniform vec4 uSurf;      // the drink's surface: inside where dot(xyz, p) < w
  uniform float uHasLiquid;
  uniform vec3 uAbsorb;    // per cm
  uniform float uScatter;  // per cm, how cloudy
  uniform vec3 uGlow;      // what the cloud lights up as
  uniform float uRipple;
  uniform float uBulge;    // the surface rising in the middle and falling at the glass, cm
  uniform float uLevelR;   // how wide the surface is
  uniform float uFull;     // the line it was poured to: the condensation stops there
  uniform float uFrostLow;
  uniform float uFrost;
  uniform vec2 uBeads;     // how many big beads and small ones there are on the glass, 0 to 1
  uniform float uSlush;    // crushed ice suspended in the drink

  uniform int uIceN;
  uniform vec3 uIceP[ICE_MAX];
  uniform mat3 uIceR[ICE_MAX];
  uniform vec4 uIceS[ICE_MAX];  // half size, corner radius
  uniform float uIceRough[ICE_MAX]; // how unevenly each has melted: 1 a freezer cube, more a hand-cut block
  uniform float uIceCloud;      // how cloudy the cubes are at the core
  uniform vec4 uHeap;           // crushed ice: centre, radius (0: none)
  uniform float uHeapH;

  uniform int uGarnish;         // 1 lime wedge, 2 cherries on a pick, 3 orange wheel, 4 orchid,
                                // 5 flowers on foam, 6 caramel shard, 7 chocolate ribbon, 8 grape
  uniform mat4 uGarnM;          // glass -> the lime's or the slice's own frame
  uniform mat4 uDrop;           // glass -> where the garnish will land, while it's falling in
  uniform vec3 uCherry[4];      // two cherries, then the pick's point and its ball end
  uniform vec4 uGarnBound;      // round the garnish where it lands
  uniform vec4 uSlice;          // the slice: radius, half thickness, peel, pith
  uniform vec4 uSheet;          // the shard or the ribbon: half length, half width, half thickness, droop
  uniform vec4 uBits[12];       // crystals or pearls on it (its frame), the grape and its twig, or the
                                // flowers on the foam (the glass's frame, at the full line): where, how big
  uniform float uBitKind[12];   // which flower
  uniform int uBitN;
  uniform float uBloom;         // seconds since the flowers began to open on the foam
  uniform vec4 uFoam;           // the head: where its dome sits, how tall, how wide, and whether there is one
  uniform vec2 uFoamLim;        // where it starts, on top of the drink, and the rim it's held in below
  uniform vec4 uStrawA;         // the straw: its foot, and its radius (0: no straw)
  uniform vec3 uStrawB;         // and its top

  uniform vec3 uBg;        // the backdrop
  uniform float uThumb;    // 1: a thumbnail, cut out round the glass
  uniform float uOverlay;  // 1: a second glass, drawn over the first, nothing round it

  // --- noise ------------------------------------------------------------------------------

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x),
                   mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x),
                   mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
  }
  float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
  }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  // the ray's span inside an upright cylinder from the floor (a little under it) to top
  vec2 cylinder(vec3 o, vec3 d, float r, float top) {
    float a = dot(d.xz, d.xz);
    float b = dot(o.xz, d.xz);
    float c = dot(o.xz, o.xz) - r * r;
    float t0 = -1e9;
    float t1 = 1e9;
    if (a > 1e-8) {
      float h = b * b - a * c;
      if (h < 0.0) return vec2(1.0, -1.0);
      h = sqrt(h);
      t0 = (-b - h) / a;
      t1 = (-b + h) / a;
    } else if (c > 0.0) {
      return vec2(1.0, -1.0);
    }
    float lo = -0.4;
    if (abs(d.y) > 1e-8) {
      float ya = (lo - o.y) / d.y;
      float yb = (top - o.y) / d.y;
      t0 = max(t0, min(ya, yb));
      t1 = min(t1, max(ya, yb));
    } else if (o.y < lo || o.y > top) {
      return vec2(1.0, -1.0);
    }
    return vec2(t0, t1);
  }

  // --- the glass --------------------------------------------------------------------------

  // x: the glass, y: the bowl's hollow, signed, out to the middle of its wall (the drink fills it
  // and the glass, which wins wherever they overlap, trims it back to its inner face). Both are
  // baked into a texture over (radius, height); past its edges they just grow with the distance.
  vec2 profile(vec2 q) {
    vec2 uv = vec2(q.x / uDom.x, (q.y - uDom.y) / uDom.z);
    vec2 in_ = clamp(uv, vec2(0.0), vec2(1.0));
    vec2 v = texture2D(uProfile, in_).xy;
    return v + length((uv - in_) * uDom.xz);
  }
  vec2 profile3(vec3 p) {
    return profile(vec2(length(p.xz), p.y));
  }

  // --- the drink --------------------------------------------------------------------------

  float ripples(vec3 p) {
    float r = length(p.xz);
    return sin(r * 4.2 - uTime * 7.0) * 0.6 + sin(p.x * 2.3 + p.z * 1.7 + uTime * 5.1) * 0.4;
  }
  float liquidSdf(vec3 p, vec2 pr) {
    float s = dot(uSurf.xyz, p) - uSurf.w;
    // the meniscus: where the drink meets the glass it climbs it a little
    s -= 0.05 * exp(-max(pr.x, 0.0) * 14.0);
    s += uRipple * ripples(p);
    // sloshing up and down: the middle rises as the edges fall, and back
    s -= uBulge * (dot(p.xz, p.xz) / (uLevelR * uLevelR) - 0.5);
    return max(pr.y, s);
  }

  // --- ice --------------------------------------------------------------------------------

  float iceCube(vec3 p, int i) {
    vec3 q = uIceR[i] * (p - uIceP[i]);
    vec3 s = uIceS[i].xyz;
    float r = uIceS[i].w;
    vec3 k = abs(q) - s + r;
    float d = length(max(k, 0.0)) + min(max(k.x, max(k.y, k.z)), 0.0) - r;
    // melting: the faces bow in and out a little; a hand-cut block is pitted all over too
    float fi = float(i);
    float rough = uIceRough[i];
    d += 0.03 * rough * sin(q.x * 2.1 + q.y * 1.3 + fi * 1.7) * sin(q.z * 1.9 - q.y * 1.6 + fi * 2.3);
    if (rough > 1.0 && d < 0.3) d += 0.022 * (rough - 1.0) * (noise3(q * 3.1) - 0.5);
    return d;
  }
  // crushed ice: a chunk to a cell of a grid, jittered, turned any which way, cut with facets;
  // only cells inside the mound floating on the drink have one
  const float CHUNK = 0.72;
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.103, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float chunk(vec3 p, vec3 cell) {
    vec3 h = hash33(cell);
    vec3 c = (cell + 0.5 + (h - 0.5) * 0.45) * CHUNK;
    float e = sdEllipsoid(c - uHeap.xyz, vec3(uHeap.w, uHeapH, uHeap.w));
    if (e > 0.12 - 0.3 * h.z) return 1e5;
    vec3 u = hash33(cell + 17.31);
    float a = sqrt(1.0 - u.x);
    float b = sqrt(u.x);
    vec4 q = vec4(a * sin(6.2832 * u.y), a * cos(6.2832 * u.y), b * sin(6.2832 * u.z), b * cos(6.2832 * u.z));
    vec3 l = p - c;
    l += 2.0 * cross(q.xyz, cross(q.xyz, l) + q.w * l);
    vec3 s = CHUNK * (0.25 + 0.2 * hash33(cell + 5.7));
    vec3 k = abs(l) - s + 0.04;
    float box = length(max(k, 0.0)) + min(max(k.x, max(k.y, k.z)), 0.0) - 0.04;
    float oct = (dot(abs(l), vec3(1.0)) - (s.x + s.y + s.z) * 0.72) * 0.577;
    return max(box, oct);
  }
  float heapSdf(vec3 p) {
    float e = sdEllipsoid(p - uHeap.xyz, vec3(uHeap.w, uHeapH, uHeap.w));
    if (e > CHUNK) return e - CHUNK * 0.6;
    vec3 base = floor(p / CHUNK - 0.5);
    float d = CHUNK * 0.3;
    for (int k = 0; k < 8; k++) {
      d = min(d, chunk(p, base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1))));
    }
    return d;
  }
  float iceSdf(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ICE_MAX; i++) {
      if (i >= uIceN) break;
      float b = length(p - uIceP[i]) - length(uIceS[i].xyz) - 0.1;
      d = min(d, b > 0.3 ? b : iceCube(p, i));
    }
    if (uHeap.w > 0.0) d = min(d, heapSdf(p));
    return d;
  }

  // --- garnish ----------------------------------------------------------------------------

  const float WEDGE = 0.62; // half the lime wedge's angle

  float limeSdf(vec3 p) {
    vec3 q = (uGarnM * vec4(p, 1.0)).xyz;
    float ell = sdEllipsoid(q, vec3(2.6, 2.6, 3.25));
    float cut = abs(q.x) * cos(WEDGE) - q.y * sin(WEDGE);
    return max(ell, cut);
  }
  // a maraschino cherry: round, a little squat, dimpled where its stem was
  float cherry(vec3 p, vec3 c) {
    vec3 q = p - c;
    float d = length(q * vec3(1.0, 1.08, 1.0)) / 1.04 - 0.98;
    float dim = length(q - vec3(0.0, 0.98, 0.0)) - 0.15;
    return smax(d, -dim, 0.14);
  }
  // two of them run through on a steel pick with a ball on its end
  float cherriesSdf(vec3 p, out float part) {
    float c = min(cherry(p, uCherry[0]), cherry(p, uCherry[1]));
    float s = min(sdCapsule(p, uCherry[2], uCherry[3], 0.065), length(p - uCherry[3]) - 0.3);
    part = c < s ? 0.0 : 1.0;
    return min(c, s);
  }
  // an orchid: six petals, the outer ones lying open, the inner ones cupped up round the middle
  float petal(vec3 q, float ang, float tilt, float len, float wid) {
    float c = cos(ang);
    float s = sin(ang);
    q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
    float ct = cos(tilt);
    float st = sin(tilt);
    q = vec3(ct * q.x + st * q.y, -st * q.x + ct * q.y, q.z);
    q.x -= len * 0.5;
    // the edges curl up and the tip arches over
    q.y -= 0.32 * q.z * q.z / wid - 0.12 * q.x * q.x / len;
    return sdEllipsoid(q, vec3(len * 0.5, 0.06, wid)) * 0.6;
  }
  float flowerSdf(vec3 p) {
    vec3 q = (uGarnM * vec4(p, 1.0)).xyz;
    float d = length(q - vec3(0.0, 0.12, 0.0)) - 0.2;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      bool inner = mod(fi, 2.0) > 0.5;
      float ang = fi * 1.0472 + 0.22 * sin(fi * 2.3);
      d = min(d, petal(q, ang, inner ? 0.75 : 0.2, inner ? 1.25 : 1.6, inner ? 0.48 : 0.6));
    }
    return d;
  }
  // a citrus wheel: a disc with a rounded edge, its faces across z
  float sliceSdf(vec3 p) {
    vec3 q = (uGarnM * vec4(p, 1.0)).xyz;
    const float rr = 0.22;
    vec2 d = vec2(length(q.xy) - uSlice.x + rr, abs(q.z) - uSlice.y + rr);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr;
  }
  float strawSdf(vec3 p) {
    if (uStrawA.w <= 0.0) return 1e5;
    return sdCapsule(p, uStrawA.xyz, uStrawB, uStrawA.w);
  }
  // a thin sheet in its own frame, long across x and wide across z, its ends drooping: the caramel
  // shard is an oval; the chocolate ribbon is a strip with ragged edges and flutes along it
  float sheetSdf(vec3 p) {
    vec3 q = (uGarnM * vec4(p, 1.0)).xyz;
    q.y += uSheet.w * q.x * q.x;
    float w = uSheet.y;
    float outline;
    if (uGarnish == 7) {
      q.y -= 0.05 * sin(q.z * 5.5 + q.x * 0.4) + 0.12 * sin(q.x * 0.9 + 0.5);
      // torn edges, and narrowing toward the ends
      w *= 0.55 + 0.45 * smoothstep(uSheet.x, uSheet.x * 0.35, abs(q.x));
      w *= 1.0 + 0.22 * (noise2(vec2(q.x * 1.6, sign(q.z) * 3.0)) - 0.5) + 0.06 * sin(q.x * 9.0);
      outline = max(abs(q.x) - uSheet.x * (1.0 + 0.08 * (noise2(vec2(q.z * 2.0, 5.0)) - 0.5)), abs(q.z) - w);
    } else {
      outline = (length(q.xz / vec2(uSheet.x, w)) - 1.0) * w;
    }
    return max(outline, abs(q.y) - uSheet.z) * 0.7;
  }
  // what sits on the sheet: chunks of sugar crystal on the shard, pearls on the ribbon
  float bitsSdf(vec3 p) {
    vec3 q = (uGarnM * vec4(p, 1.0)).xyz;
    float d = 1e5;
    for (int i = 0; i < 12; i++) {
      if (i >= uBitN) break;
      vec4 b = uBits[i];
      vec3 l = q - b.xyz;
      if (uGarnish == 6) {
        float a = float(i) * 1.7;
        float c = cos(a);
        float s = sin(a);
        l.xz = vec2(c * l.x - s * l.z, s * l.x + c * l.z);
        l.xy = vec2(c * l.x + s * l.y, -s * l.x + c * l.y);
        vec3 k = abs(l) - b.w + 0.07;
        d = min(d, length(max(k, 0.0)) + min(max(k.x, max(k.y, k.z)), 0.0) - 0.07);
      } else {
        d = min(d, length(l) - b.w);
      }
    }
    return d;
  }
  // a green grape, a little long, on a bit of its vine
  float grapeSdf(vec3 p, out float part) {
    vec3 q = p - uBits[0].xyz;
    float g = length(q * vec3(1.0, 0.9, 1.0)) / 1.05 - uBits[0].w;
    float t = sdCapsule(p, uBits[1].xyz, uBits[2].xyz, uBits[1].w);
    t = min(t, sdCapsule(p, uBits[2].xyz, uBits[3].xyz, uBits[2].w));
    t = min(t, sdCapsule(p, uBits[3].xyz, uBits[4].xyz, uBits[3].w));
    t = min(t, sdCapsule(p, uBits[2].xyz, uBits[5].xyz, uBits[5].w));
    t = min(t, sdCapsule(p, uBits[3].xyz, uBits[6].xyz, uBits[6].w));
    part = g < t ? 0.0 : 1.0;
    return min(g, t);
  }
  // the head of foam: all of the bowl above the drink, then a lumpy dome piled up over the rim
  float foamSdf(vec3 p) {
    if (uFoam.w <= 0.0) return 1e5;
    vec3 q = p - vec3(0.0, uFoam.x, 0.0);
    float bound = length(q * vec3(1.0, 0.6, 1.0)) - uFoam.z * 1.4;
    if (bound > 0.5 && p.y > uFoam.x) return bound;
    float cav = profile3(p).y;
    float column = max(cav, max(uFoamLim.x - p.y, p.y - uFoam.x));
    float dome = max(sdEllipsoid(q, vec3(uFoam.z, uFoam.y, uFoam.z)), -q.y - 0.3);
    // below the rim it's held in the bowl, however far it has sunk with the drink
    float d = max(min(column, dome), min(cav, uFoamLim.y - p.y));
    d += 0.28 * (noise3(p * 0.75) - 0.5) + 0.07 * (noise3(p * 2.6) - 0.5);
    return d * 0.7;
  }

  // what drops in on top: the lime, the cherries or the slice, wherever it is on its way down
  float dropSdf(vec3 p) {
    vec3 g = (uDrop * vec4(p, 1.0)).xyz;
    float b = length(g - uGarnBound.xyz) - uGarnBound.w;
    if (b > 0.4) return b;
    if (uGarnish == 1) return limeSdf(g);
    float part;
    if (uGarnish == 2) return cherriesSdf(g, part);
    if (uGarnish == 3) return sliceSdf(g);
    if (uGarnish == 4) return flowerSdf(g);
    if (uGarnish == 6 || uGarnish == 7) return min(sheetSdf(g), bitsSdf(g));
    if (uGarnish == 8) return grapeSdf(g, part);
    return 1e5;
  }
  float garnishSdf(vec3 p) {
    return min(min(strawSdf(p), dropSdf(p)), foamSdf(p));
  }

  // --- the scene, a medium at a time --------------------------------------------------------

  // x glass, y drink, z ice, w garnish
  vec4 query(vec3 p) {
    vec2 pr = profile3(p);
    float l = uHasLiquid > 0.5 ? liquidSdf(p, pr) : 1e5;
    return vec4(pr.x, l, iceSdf(p), garnishSdf(p));
  }
  int mediumOf(vec4 q) {
    if (q.x < 0.0) return GLASS;
    if (q.w < 0.0) return GARN;
    if (q.z < 0.0) return ICE;
    if (q.y < 0.0) return LIQ;
    return AIR;
  }
  // how far to the edge of the medium the ray is in, and what's there
  float boundary(vec4 q, int m, out int which) {
    float d;
    if (m == GLASS) {
      which = GLASS;
      return -q.x;
    }
    if (m == AIR) {
      which = GLASS;
      d = q.x;
      if (q.y < d) { d = q.y; which = LIQ; }
    } else if (m == LIQ) {
      which = LIQ;
      d = -q.y;
      if (q.x < d) { d = q.x; which = GLASS; }
    } else {
      which = ICE;
      d = -q.z;
      if (q.x < d) { d = q.x; which = GLASS; }
    }
    if (m != ICE && q.z < d) { d = q.z; which = ICE; }
    if (q.w < d) { d = q.w; which = GARN; }
    return d;
  }
  float part(int which, vec3 p) {
    if (which == GLASS) return profile3(p).x;
    if (which == LIQ) return liquidSdf(p, profile3(p));
    if (which == ICE) return iceSdf(p);
    return garnishSdf(p);
  }
  vec3 normalOf(int which, vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0025;
    return normalize(e.xyy * part(which, p + e.xyy) + e.yyx * part(which, p + e.yyx) +
                     e.yxy * part(which, p + e.yxy) + e.xxx * part(which, p + e.xxx));
  }
  float iorOf(int m) {
    if (m == GLASS) return 1.52;
    if (m == LIQ) return 1.345;
    if (m == ICE) return 1.31;
    return 1.0;
  }
  float fresnel(float ci, float n1, float n2) {
    float eta = n1 / n2;
    float st2 = eta * eta * (1.0 - ci * ci);
    if (st2 >= 1.0) return 1.0;
    float ct = sqrt(1.0 - st2);
    float rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    float rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
    return 0.5 * (rs * rs + rp * rp);
  }

  // --- the studio -------------------------------------------------------------------------

  float panel(vec2 a, vec2 c, vec2 hs, float soft) {
    vec2 d = abs(a - c) - hs;
    return 1.0 - smoothstep(-soft, soft, max(d.x, d.y));
  }
  // The studio, seen from the glass. Straight ahead the white sweep fills the camera's view;
  // past its edges the room is grey, with a black flag either side, and the lights hang round it.
  vec3 sky(vec3 d) {
    float az = atan(d.x, -d.z); // 0 toward the backdrop
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 a = vec2(az, el);
    // the sweep, and the grey room round it
    float sweep = panel(a, vec2(0.0, 0.1), vec2(0.38, 0.36), 0.2);
    vec3 c = mix(vec3(0.22), uBg * 1.04, sweep);
    // behind the camera it's darker still
    c *= mix(1.0, 0.6, smoothstep(1.9, 2.6, abs(az)));
    // the floor of the room, lit
    c = mix(c, uBg * 0.75, smoothstep(0.0, -0.25, el) * (1.0 - sweep));
    // black flags either side, just past the sweep
    float flag = panel(vec2(abs(az), el), vec2(1.25, 0.2), vec2(0.4, 0.55), 0.1);
    c *= 1.0 - 0.94 * flag;
    // the key softbox up behind the camera on the left, a strip light either side behind the glass,
    // and a big top light
    c += 9.0 * panel(a, vec2(-2.4, 0.45), vec2(0.36, 0.28), 0.07);
    c += 5.0 * panel(vec2(abs(az), el), vec2(0.78, 0.28), vec2(0.045, 0.42), 0.03);
    c += 2.0 * smoothstep(1.1, 1.35, el);
    return c;
  }

  // what's past the glass. Seen straight from the camera, it's the cream backdrop and nothing
  // else; seen through the glass, the floor stays cream near it and the rest of the room shows
  vec3 world(vec3 ro, vec3 rd, bool primary) {
    if (primary) return uBg;
    if (rd.y < -1e-4) {
      float t = -ro.y / rd.y;
      vec3 g = ro + rd * t;
      return mix(sky(rd), uBg * 0.97, smoothstep(70.0, 30.0, length(g.xz)));
    }
    return sky(rd);
  }

  // --- media --------------------------------------------------------------------------------

  // light in the drink and ice comes down through the surface: the deeper, the more coloured
  vec3 underTint(vec3 p) {
    if (uHasLiquid < 0.5) return vec3(1.0);
    float depth = max(uSurf.w - dot(uSurf.xyz, p), 0.0);
    return exp(-uAbsorb * depth * 0.55);
  }

  void throughLiquid(vec3 a, vec3 d, float L, inout vec3 col, inout vec3 thr) {
    vec3 sig = uAbsorb + uScatter;
    vec3 T = exp(-sig * L);
    vec3 lit = uGlow * (0.65 + 0.5 * underTint(a + d * L * 0.5));
    if (uSlush > 0.0) {
      // crushed ice through the drink: clouds of flecks that catch the light and hide what's behind
      float f = 0.0;
      for (int k = 0; k < 6; k++) {
        vec3 x = a + d * L * (float(k) + 0.5) / 6.0;
        f += smoothstep(0.42, 0.78, noise3(x * 1.25 + 3.0)) * (0.35 + noise3(x * 4.3));
      }
      float Ts = exp(-uSlush * f / 6.0 * L);
      col += thr * (1.0 - Ts) * mix(uGlow, vec3(1.0), 0.12) * (0.55 + 0.7 * underTint(a + d * L * 0.5));
      thr *= Ts;
    }
    col += thr * lit * (uScatter / sig) * (1.0 - T);
    thr *= T;
  }

  // freezer ice: clear at the faces, a cloud of trapped air at the core; crushed ice is all cloud
  float iceCloud(vec3 p) {
    float best = 1e5;
    float cloud = 0.0;
    for (int i = 0; i < ICE_MAX; i++) {
      if (i >= uIceN) break;
      vec3 q = uIceR[i] * (p - uIceP[i]);
      float d = iceCube(p, i);
      if (d < best) {
        best = d;
        vec3 n = abs(q) / uIceS[i].xyz;
        float m = max(n.x, max(n.y, n.z));
        float veil = noise3(q * 1.7 + float(i) * 3.1);
        cloud = uIceCloud * (smoothstep(0.62, 0.1, m) * (0.45 + 0.75 * veil) + 0.08 * smoothstep(0.55, 0.75, veil));
      }
    }
    if (uHeap.w > 0.0 && heapSdf(p) < best) {
      cloud = 0.1 + 0.35 * smoothstep(0.4, 0.8, noise3(p * 3.7));
    }
    return cloud;
  }
  void throughIce(vec3 a, vec3 d, float L, inout vec3 col, inout vec3 thr) {
    float c = 0.0;
    for (int k = 0; k < 5; k++) c += iceCloud(a + d * L * (float(k) + 0.5) / 5.0);
    c /= 5.0;
    float sig = 0.04 + 3.2 * c * c;
    float T = exp(-sig * L);
    vec3 lit = vec3(0.95, 0.97, 1.0) * 1.25 * underTint(a + d * L * 0.5);
    col += thr * lit * (1.0 - T);
    thr *= T * exp(-vec3(0.03, 0.012, 0.004) * L);
  }

  // --- condensation -------------------------------------------------------------------------

  // beads of water on the cold glass: xy how a bead's surface leans, z whether there's one here
  vec3 beads(vec2 uv, float seed, float keep) {
    vec2 cell = floor(uv);
    vec2 f = fract(uv);
    vec3 best = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 h = hash22(cell + o + seed);
        if (h.y > keep) continue;
        float rad = mix(0.14, 0.46, h.x * h.x);
        vec2 c = o + 0.5 + (hash22(cell + o + seed + 19.0) - 0.5) * 0.5;
        vec2 dv = f - c;
        // gravity: a bead sags, fuller at the bottom
        dv.y *= dv.y > 0.0 ? 1.12 : 0.9;
        float r = length(dv) / rad;
        if (r < 1.0) {
          float hgt = sqrt(max(1.0 - r * r, 0.04));
          best = vec3(dv / rad / hgt * 0.4, smoothstep(1.0, 0.85, r));
        }
      }
    }
    return best;
  }

  // --- garnish shading ------------------------------------------------------------------------

  vec3 ambient(vec3 nw) {
    // the white sweep all round, brighter from above and ahead
    return vec3(0.55 + 0.25 * nw.y + 0.15 * max(-nw.z, 0.0));
  }
  // cells, for juice sacs and the dimples in peel: x the distance to the nearest centre, y the next
  vec2 cells(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        float d = length(f - o - 0.1 - 0.8 * hash22(i + o));
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    return vec2(d1, d2);
  }

  // The flowers laid on the foam, each a little disc of petals facing out from the dome; they open
  // one after another. rgb: the colour, a: how much of this point a flower covers.
  vec4 flowerOn(vec3 p) {
    vec4 best = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      if (i >= uBitN) break;
      float grow = smoothstep(0.0, 0.35, uBloom - float(i) * 0.08);
      if (grow <= 0.0) continue;
      vec4 b = uBits[i];
      vec3 c = b.xyz + vec3(0.0, uFoamLim.x - uFull, 0.0);
      vec3 d = p - c;
      float R = b.w * grow * (1.0 + 0.12 * sin(min(uBloom - float(i) * 0.08, 0.6) * 10.0) * (1.0 - grow));
      if (dot(d, d) > R * R * 1.8) continue;
      vec3 out_ = normalize(c - vec3(0.0, uFoam.x - 1.5, 0.0));
      vec3 t1 = normalize(cross(out_, vec3(0.31, 0.17, 0.93)));
      vec3 t2 = cross(out_, t1);
      vec2 uv = vec2(dot(d, t1), dot(d, t2)) / R;
      float r = length(uv);
      float a = atan(uv.y, uv.x) + float(i) * 1.3;
      float kind = uBitKind[i];
      vec3 col = vec3(1.0);
      float edge = 1.0;
      if (kind < 0.5) {
        // pansy: five round petals, violet edged, pale toward a yellow eye with dark rays
        edge = 0.62 + 0.38 * pow(abs(cos(a * 2.5)), 0.6);
        col = mix(vec3(0.86, 0.8, 0.95), vec3(0.3, 0.1, 0.58), smoothstep(0.25, 0.8, r));
        col = mix(col, vec3(0.2, 0.05, 0.3), (1.0 - smoothstep(0.0, 0.05, abs(sin(a * 9.0)) * r)) * smoothstep(0.55, 0.2, r) * 0.6);
        col = mix(col, vec3(0.95, 0.72, 0.08), smoothstep(0.17, 0.1, r));
      } else if (kind < 1.5) {
        // cornflower: a ring of narrow toothed florets, deep blue
        edge = 0.35 + 0.65 * pow(abs(cos(a * 7.0)), 2.5);
        edge += 0.06 * sin(a * 60.0);
        col = mix(vec3(0.2, 0.08, 0.45), vec3(0.12, 0.28, 0.85), smoothstep(0.12, 0.35, r));
        col = mix(col, vec3(0.32, 0.5, 0.98), smoothstep(0.65, 1.0, r));
      } else if (kind < 2.5) {
        // marigold: ruffled petals, maroon with orange-gold at the heart and the edges
        edge = 0.72 + 0.28 * pow(abs(cos(a * 5.5)), 0.7) + 0.04 * sin(a * 33.0);
        col = mix(vec3(0.95, 0.55, 0.04), vec3(0.5, 0.03, 0.03), smoothstep(0.28, 0.5, r));
        col = mix(col, vec3(0.92, 0.4, 0.03), smoothstep(0.75, 0.98, r) * 0.7);
      } else if (kind < 3.5) {
        // viola: five round yellow petals, fine dark lines at the eye
        edge = 0.6 + 0.4 * pow(abs(cos(a * 2.5)), 0.6);
        col = vec3(0.95, 0.76, 0.06);
        col = mix(col, vec3(0.45, 0.25, 0.05), (1.0 - smoothstep(0.0, 0.05, abs(sin(a * 7.0)) * r)) * smoothstep(0.4, 0.12, r));
      } else if (kind < 4.5) {
        // a pink star: five pointed petals
        edge = 0.3 + 0.7 * pow(abs(cos(a * 2.5)), 3.0);
        col = mix(vec3(1.0, 0.85, 0.92), vec3(0.95, 0.38, 0.7), smoothstep(0.1, 0.45, r));
      } else if (kind < 5.5) {
        // alyssum: a cluster of tiny white florets
        vec2 cl = cells(uv * 3.2 + float(i) * 7.0);
        edge = 1.0;
        col = mix(vec3(0.97, 0.96, 0.9), vec3(0.75, 0.8, 0.35), smoothstep(0.18, 0.05, cl.x));
        if (cl.x > 0.38) edge = 0.0;
      } else {
        // a carnation: fringed magenta petals
        edge = 0.75 + 0.25 * pow(abs(cos(a * 3.5)), 0.8) + 0.09 * sin(a * 42.0);
        col = mix(vec3(0.95, 0.6, 0.75), vec3(0.65, 0.04, 0.22), smoothstep(0.15, 0.6, r));
      }
      float cover = 1.0 - smoothstep(edge - 0.06, edge, r);
      // petals are a little cupped: darker toward the eye and along the gaps between them
      col *= 0.82 + 0.18 * smoothstep(0.1, 0.7, r / max(edge, 0.01));
      if (cover > best.a) best = vec4(col, cover);
    }
    return best;
  }

  // how much a flower shades the foam just round it
  float flowerShade(vec3 p) {
    float sh = 0.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uBitN) break;
      float grow = smoothstep(0.0, 0.35, uBloom - float(i) * 0.08);
      vec3 c = uBits[i].xyz + vec3(0.0, uFoamLim.x - uFull, 0.0);
      float r = length(p - c) / max(uBits[i].w * grow, 1e-3);
      sh = max(sh, grow * smoothstep(1.45, 0.95, r));
    }
    return sh;
  }

  vec3 shadeGarnish(vec3 p, vec3 rd, int med) {
    vec3 n = normalOf(GARN, p);
    vec3 alb;
    float gloss;
    float wrap;
    vec3 glow = vec3(0.0); // light that comes back out through it: fruit flesh, petals
    bool metal = false;
    vec3 g = (uDrop * vec4(p, 1.0)).xyz;
    float dDrop = dropSdf(p);
    if (foamSdf(p) < min(dDrop, strawSdf(p))) {
      // the foam: white, faintly lilac, tiny bubbles all over it, light coming through it
      // the foam: soft white with a lilac cast, darker in the folds, fine bubbles all over
      vec2 bub = cells(vec2(atan(p.z, p.x) * 9.0, p.y * 2.6) * 3.0);
      vec2 big = cells(vec2(atan(p.z, p.x) * 3.0, p.y * 0.9) * 2.0);
      float fold = noise3(p * 0.75);
      alb = vec3(0.9, 0.88, 0.94) * (0.82 + 0.18 * smoothstep(0.25, 0.65, fold));
      alb *= 0.9 + 0.1 * smoothstep(0.05, 0.4, bub.x);
      alb *= 0.94 + 0.06 * smoothstep(0.1, 0.5, big.x);
      gloss = 0.35 * smoothstep(0.3, 0.08, bub.x);
      wrap = 1.0;
      glow = vec3(0.12, 0.11, 0.15);
      vec4 fl = flowerOn(p);
      // each flower sits down into the foam a little: a soft shadow round it
      alb *= 1.0 - 0.18 * clamp(flowerShade(p), 0.0, 1.0) * (1.0 - fl.a);
      alb = mix(alb, fl.rgb, fl.a);
      glow = mix(glow, fl.rgb * 0.22, fl.a);
      gloss = mix(gloss, 0.3, fl.a);
    } else if (strawSdf(p) < dDrop) {
      // the straw: black plastic, glossy
      alb = vec3(0.012, 0.012, 0.014);
      gloss = 0.9;
      wrap = 0.1;
    } else if (uGarnish == 1) {
      vec3 q = (uGarnM * vec4(g, 1.0)).xyz;
      float ell = sdEllipsoid(q, vec3(2.6, 2.6, 3.25));
      float depth = -ell;
      float rho = length(q.xy);
      if (ell > -0.025) {
        // the peel: dark green, pitted with oil glands
        float pores = noise3(q * 14.0);
        alb = mix(vec3(0.06, 0.24, 0.025), vec3(0.11, 0.36, 0.04), noise3(q * 2.3));
        alb *= 0.85 + 0.3 * pores;
        n = normalize(n + (vec3(noise3(q * 14.0 + 3.0), noise3(q * 14.0 + 9.0), noise3(q * 14.0 + 5.0)) - 0.5) * 0.25);
        gloss = 0.55;
        wrap = 0.2;
      } else if (depth < 0.14) {
        alb = vec3(0.12, 0.42, 0.05);
        gloss = 0.4;
        wrap = 0.4;
      } else if (depth < 0.36) {
        alb = vec3(0.78, 0.84, 0.5);
        gloss = 0.3;
        wrap = 0.6;
      } else {
        // the flesh: juice sacs running out from the core, wet and lit from within
        float sacs = noise2(vec2(rho * 2.2, q.z * 7.5));
        float fine = noise2(vec2(rho * 6.0, q.z * 19.0));
        alb = mix(vec3(0.42, 0.62, 0.1), vec3(0.62, 0.78, 0.2), sacs);
        alb *= 0.85 + 0.25 * fine;
        alb = mix(alb, vec3(0.8, 0.86, 0.6), smoothstep(0.45, 0.2, rho));
        gloss = 0.9;
        wrap = 1.0;
        n = normalize(n + vec3(sacs - 0.5, fine - 0.5, 0.0) * 0.18);
      }
    } else if (uGarnish == 2) {
      float part;
      cherriesSdf(g, part);
      if (part < 0.5) {
        // maraschino: candy red, glassy, lit through, darker round the dimple
        alb = vec3(0.6, 0.004, 0.012);
        float top = min(length(g - uCherry[0] - vec3(0.0, 0.92, 0.0)), length(g - uCherry[1] - vec3(0.0, 0.92, 0.0)));
        alb *= mix(0.5, 1.0, smoothstep(0.15, 0.65, top));
        gloss = 1.0;
        wrap = 0.5;
        glow = vec3(0.1, 0.0, 0.003);
      } else {
        alb = vec3(0.82, 0.83, 0.85);
        metal = true;
        gloss = 1.0;
        wrap = 0.0;
      }
    } else if (uGarnish == 3) {
      // a real orange wheel: zest round the edge, white pith, then eleven segments of juice sacs,
      // each segment in a thin membrane, round a pithy core
      vec3 q = (uGarnM * vec4(g, 1.0)).xyz;
      float R = uSlice.x;
      float rho = length(q.xy);
      float in_ = R - rho;
      float ang = atan(q.y, q.x);
      vec3 zest = vec3(0.86, 0.24, 0.006);
      vec3 pith = vec3(0.92, 0.82, 0.58);
      if (abs(q.z) < uSlice.y - 0.1 && in_ < 0.3) {
        // the peel's skin, round the edge: dimpled with oil glands
        vec2 c = cells(vec2(ang * R * 7.0, q.z * 7.0));
        alb = zest * (0.78 + 0.3 * smoothstep(0.05, 0.45, c.x));
        gloss = 0.4 * smoothstep(0.1, 0.4, c.x);
        wrap = 0.3;
      } else if (in_ < uSlice.z) {
        alb = mix(zest, vec3(0.97, 0.52, 0.06), smoothstep(0.0, uSlice.z, in_));
        gloss = 0.35;
        wrap = 0.4;
      } else if (in_ < uSlice.z + uSlice.w) {
        alb = pith * (0.93 + 0.07 * noise2(vec2(ang * 80.0, rho * 10.0)));
        gloss = 0.2;
        wrap = 0.8;
        glow = pith * 0.06;
      } else {
        const float N = 11.0;
        float a = ang + 3.14159265;
        float w = a + 0.07 * sin(3.0 * a);
        float f = fract(w / (6.2831853 / N));
        float side = min(f, 1.0 - f) * (6.2831853 / N) * rho;
        float edge = min(side, min(in_ - uSlice.z - uSlice.w, rho - 0.3));
        float membrane = 1.0 - smoothstep(0.025, 0.075, edge);
        // juice sacs: long cells running out from the core, bright at their middles
        vec2 c = cells(vec2(ang * rho * 5.2, rho * 2.3));
        float wall = 1.0 - smoothstep(0.0, 0.12, c.y - c.x);
        float body = 1.0 - smoothstep(0.0, 0.6, c.x);
        vec3 flesh = mix(vec3(0.8, 0.25, 0.01), vec3(1.0, 0.56, 0.07), body * 0.85);
        flesh = mix(flesh, flesh * 0.7, wall * 0.6);
        alb = mix(flesh, pith * vec3(1.0, 0.96, 0.86), membrane * 0.85);
        alb = mix(alb, pith, smoothstep(0.42, 0.28, rho));
        // wet: every sac catches the light
        gloss = mix(0.4 + 0.6 * body, 0.25, membrane);
        wrap = 0.9;
        glow = flesh * 0.32 * (1.0 - membrane);
      }
    } else if (uGarnish == 6) {
      if (bitsSdf(g) < sheetSdf(g)) {
        // candied pineapple crystals: pale yellow, cloudy, sparkling
        alb = vec3(0.92, 0.82, 0.5);
        gloss = 0.7;
        wrap = 0.8;
        glow = vec3(0.32, 0.27, 0.1);
      } else {
        // caramel: amber glass, deep where it's thick, lit right through, glassy
        alb = vec3(0.42, 0.16, 0.006);
        gloss = 1.0;
        wrap = 0.6;
        glow = vec3(0.42, 0.17, 0.006) * (0.7 + 0.5 * noise3(g * 2.2));
      }
    } else if (uGarnish == 7) {
      if (bitsSdf(g) < sheetSdf(g)) {
        // sugar pearls: white, with a pearly sheen
        alb = vec3(0.93, 0.9, 0.9);
        gloss = 1.0;
        wrap = 0.4;
        glow = vec3(0.06, 0.04, 0.07) * (1.0 + sin(dot(n, vec3(9.0, 4.0, 7.0))));
      } else {
        // pink chocolate: satin, a little lighter along the flutes
        vec3 q = (uGarnM * vec4(g, 1.0)).xyz;
        alb = vec3(0.93, 0.56, 0.62) * (0.92 + 0.1 * sin(q.z * 5.5 + q.x * 0.4));
        gloss = 0.3;
        wrap = 0.5;
        glow = vec3(0.06, 0.02, 0.025);
      }
    } else if (uGarnish == 8) {
      float part;
      grapeSdf(g, part);
      if (part < 0.5) {
        // a green grape: waxy bloom on its skin, pale veins, lit through
        vec3 q = g - uBits[0].xyz;
        float veins = abs(sin(atan(q.z, q.x) * 7.0 + q.y * 1.5));
        alb = mix(vec3(0.4, 0.62, 0.1), vec3(0.62, 0.78, 0.25), smoothstep(0.85, 1.0, veins) * 0.6);
        gloss = 0.45;
        wrap = 0.7;
        glow = vec3(0.16, 0.24, 0.02);
      } else {
        // the twig: dry, brown green, rough
        alb = vec3(0.24, 0.2, 0.09) * (0.8 + 0.4 * noise3(g * 8.0));
        gloss = 0.1;
        wrap = 0.2;
      }
    } else {
      // the orchid: white at its heart to magenta at the tips, fine veins, lit through
      vec3 q = (uGarnM * vec4(g, 1.0)).xyz;
      float r = length(q.xz);
      float a = atan(q.z, q.x);
      alb = mix(vec3(0.93, 0.74, 0.95), vec3(0.62, 0.11, 0.68), smoothstep(0.2, 1.1, r));
      alb *= 0.9 + 0.1 * sin(a * 46.0 + r * 4.0);
      alb = mix(alb, vec3(0.98, 0.9, 0.55), smoothstep(0.26, 0.16, length(q - vec3(0.0, 0.12, 0.0))));
      gloss = 0.3;
      wrap = 1.0;
      glow = alb * 0.28;
    }
    vec3 Ll = normalize(mat3(uToLocal) * uLight);
    float ndl = dot(n, Ll);
    float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
    vec3 nw = normalize(mat3(uToWorld) * n);
    vec3 rw = normalize(mat3(uToWorld) * reflect(rd, n));
    vec3 c = alb * (ambient(nw) * 0.7 + diff * 0.95) + glow;
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    c += sky(rw) * F * gloss;
    // polished steel: all reflection
    if (metal) c = alb * sky(rw) * 0.92 + 0.03 * ambient(nw);
    if (med == LIQ || dot(uSurf.xyz, p) < uSurf.w) c *= underTint(p);
    return c;
  }

  // --- tracing ------------------------------------------------------------------------------

  vec3 traceDrink(vec3 ro, vec3 rd, out bool touched) {
    touched = false;
    vec3 o = (uToLocal * vec4(ro, 1.0)).xyz;
    vec3 d = normalize(mat3(uToLocal) * rd);
    vec2 tb = cylinder(o, d, uBound.x, uBound.y);
    if (tb.x > tb.y || tb.y < 0.0) return world(ro, rd, true);

    vec3 col = vec3(0.0);
    vec3 thr = vec3(1.0);
    int med = AIR;
    vec3 p = o + d * max(tb.x, 0.0);

    for (int ev = 0; ev < 20; ev++) {
      vec2 span = cylinder(p, d, uBound.x + 0.05, uBound.y + 0.05);
      float tEnd = span.y;
      float t = 0.0;
      int which = AIR;
      bool hit = false;
      float k = med == AIR ? 0.9 : 0.8;
      for (int i = 0; i < 160; i++) {
        vec4 q = query(p + d * t);
        float bd = boundary(q, med, which);
        if (bd < EPS) {
          hit = true;
          break;
        }
        t += max(bd * k, EPS);
        if (t > tEnd) break;
      }
      if (med == LIQ) throughLiquid(p, d, t, col, thr);
      else if (med == ICE) throughIce(p, d, t, col, thr);
      else if (med == GLASS) thr *= exp(-vec3(0.035, 0.018, 0.026) * t);
      p += d * t;

      if (!hit && med != AIR) return col + thr * 0.62;
      if (!hit) {
        vec3 wp = (uToWorld * vec4(p, 1.0)).xyz;
        vec3 wd = normalize(mat3(uToWorld) * d);
        return col + thr * world(wp, wd, !touched);
      }
      touched = true;

      vec4 ahead = query(p + d * EPS * 3.0);
      int next = med != which ? which : mediumOf(ahead);
      if (next == med) {
        p += d * EPS * 3.0;
        continue;
      }
      if (next == GARN) {
        // the caramel shard is candy glass: the light goes through it, amber, with a glint off it
        if (uGarnish == 6) {
          vec3 g = (uDrop * vec4(p, 1.0)).xyz;
          if (sheetSdf(g) < bitsSdf(g) && sheetSdf(g) < strawSdf(p) + 1.0) {
            vec3 n = normalOf(GARN, p);
            vec3 nn = dot(d, n) < 0.0 ? n : -n;
            float F = fresnel(clamp(dot(-d, nn), 0.0, 1.0), 1.0, 1.5);
            col += thr * F * sky(normalize(mat3(uToWorld) * reflect(d, nn)));
            thr *= (1.0 - F) * vec3(0.92, 0.5, 0.1);
            for (int k = 0; k < 24; k++) {
              float s = sheetSdf((uDrop * vec4(p, 1.0)).xyz);
              if (s > EPS * 2.0) break;
              p += d * max(-s, EPS * 2.0) + d * EPS;
            }
            thr *= vec3(0.95, 0.72, 0.3);
            continue;
          }
        }
        return col + thr * shadeGarnish(p, d, med);
      }

      vec3 n = normalOf(which, p);
      vec3 nn = dot(d, n) < 0.0 ? n : -n;
      float n1 = iorOf(med);
      float n2 = iorOf(next);
      float haze = 0.0;
      vec3 hazeCol = vec3(0.0);

      // condensation on the outside of the bowl, below the line the drink was poured to
      if (uFrost > 0.0 && which == GLASS && (med == AIR || next == AIR)) {
        vec2 pr = profile3(p);
        float band = smoothstep(uFull + 0.25, uFull - 0.35, p.y) * smoothstep(uFrostLow - 0.2, uFrostLow + 0.6, p.y);
        float outer = smoothstep(0.45, 0.15, pr.y) * step(0.0, pr.y);
        float m = uFrost * band * outer;
        if (m > 0.001) {
          float ang = atan(p.z, p.x);
          float r = length(p.xz);
          // round the glass, and along its wall
          vec2 uv = vec2(ang * r, texture2D(uProfile, clamp(vec2(r / uDom.x, (p.y - uDom.y) / uDom.z), 0.0, 1.0)).z);
          vec3 big = beads(uv * 4.4, 0.0, uBeads.x);
          vec3 small = beads(uv * 12.0 + 11.0, 41.0, uBeads.y);
          // beads under a couple of pixels across only glitter: let them fade into the fog
          float px = length((uToWorld * vec4(p, 1.0)).xyz - uCamPos) * 2.0 / (uRes.y * uFocal);
          big *= smoothstep(0.12, 0.06, px);
          small *= smoothstep(0.045, 0.022, px);
          // runs, where a bead slid down and wiped a track through the fog
          float lane = ang * 9.0;
          float run = 0.6 * smoothstep(0.84, 0.94, noise2(vec2(lane, 3.0))) * smoothstep(0.45, 0.65, noise2(vec2(lane * 0.7, uv.y * 0.35)));
          vec3 tang = vec3(-sin(ang), 0.0, cos(ang));
          vec3 bit = normalize(cross(n, tang));
          vec2 slope = big.z > 0.5 ? big.xy : small.xy * 0.8;
          float bead = max(big.z, small.z * 0.85);
          nn = normalize(nn - (tang * slope.x + bit * slope.y) * m * sign(dot(nn, n)));
          // a fine fog of tiny beads between the big ones, lit and tinted by the drink behind it
          haze = m * (1.0 - 0.6 * bead) * (1.0 - 0.85 * run) * (0.2 + 0.18 * noise2(uv * 0.8)) * smoothstep(uFrostLow - 1.0, uFull, p.y + 2.0);
          vec3 Ll = normalize(mat3(uToLocal) * uLight);
          float lit = 0.75 + 0.35 * max(dot(n, Ll), 0.0);
          float wet = uHasLiquid > 0.5 ? smoothstep(0.2, -0.3, dot(uSurf.xyz, p) - uSurf.w) : 0.0;
          vec3 tint = mix(vec3(1.0), exp(-uAbsorb * 1.2) * 0.8 + uGlow * 0.35, wet * 0.6);
          hazeCol = tint * lit;
        }
      }

      float ci = clamp(dot(-d, nn), 0.0, 1.0);
      float F = fresnel(ci, n1, n2);
      vec3 rdir = reflect(d, nn);
      vec3 tdir = refract(d, nn, n1 / n2);

      col += thr * haze * hazeCol;
      thr *= 1.0 - haze;

      if (dot(tdir, tdir) < 0.5) {
        // total internal reflection: the ray stays where it is and turns back
        d = rdir;
        p += d * EPS * 2.0;
        continue;
      }
      vec3 rw = normalize(mat3(uToWorld) * rdir);
      vec3 refl = sky(rw);
      if (med == LIQ) refl *= exp(-uAbsorb * 1.5);
      col += thr * F * refl;
      thr *= 1.0 - F;
      d = tdir;
      med = next;
      p += d * EPS * 2.0;
      if (max(thr.r, max(thr.g, thr.b)) < 0.004) return col;
    }
    // still bouncing round inside after all that: what it would have found, on average
    return col + thr * 0.62;
  }

  vec3 toneMap(vec3 c) {
    // linear up past the backdrop, then a soft shoulder for the highlights
    vec3 k = vec3(0.9);
    vec3 over = max(c - k, 0.0);
    return min(c, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
    vec3 rd = normalize(uCamRot * vec3(uv, -uFocal));
    bool touched;
    vec3 c = traceDrink(uCamPos, rd, touched);
    if (uOverlay > 0.5 && !touched) discard;
    c = toneMap(c);
    // sRGB out, exactly, so the backdrop matches the page round it
    c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    c += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = vec4(c, uThumb > 0.5 ? (touched ? 1.0 : 0.0) : 1.0);
  }
`;

// The glass's profile, baked once per glass into a texture over (radius, height): red, how far to
// the glass; green, how far to the middle of the bowl's wall, negative inside the bowl. The wall
// and the foot-and-stem are chains of round cones, each a smooth curve sampled finely, so the
// glass has no seams.
export const BAKE = /* glsl */ `
  precision highp float;
  uniform sampler2D uPts; // row 0: the wall, bottom to rim; row 1: foot and stem. (r, y, half thickness)
  uniform int uWallN;
  uniform int uStemN;
  uniform vec3 uDom;
  uniform vec2 uSize;

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uSize;
    vec2 q = vec2(uv.x * uDom.x, uDom.y + uv.y * uDom.z);
    float g = 1e5;
    float c = 1e5;
    float arc = 0.0;
    float run = 0.0;
    bool inside = false;
    vec3 a = texelFetch(uPts, ivec2(0, 0), 0).xyz;
    for (int i = 1; i < 1024; i++) {
      if (i >= uWallN) break;
      vec3 b = texelFetch(uPts, ivec2(i, 0), 0).xyz;
      vec2 pa = q - a.xy;
      vec2 ba = b.xy - a.xy;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float dc = length(pa - ba * h);
      g = min(g, dc - mix(a.z, b.z, h));
      float len = length(ba);
      if (dc < c) {
        c = dc;
        arc = run + h * len;
      }
      run += len;
      if ((q.y >= a.y) != (q.y >= b.y)) {
        float rx = a.x + (q.y - a.y) / (b.y - a.y) * (b.x - a.x);
        if (q.x < rx) inside = !inside;
      }
      a = b;
    }
    float s = 1e5;
    a = texelFetch(uPts, ivec2(0, 1), 0).xyz;
    for (int i = 1; i < 1024; i++) {
      if (i >= uStemN) break;
      vec3 b = texelFetch(uPts, ivec2(i, 1), 0).xyz;
      vec2 pa = q - a.xy;
      vec2 ba = b.xy - a.xy;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      s = min(s, length(pa - ba * h) - mix(a.z, b.z, h));
      a = b;
    }
    g = smin(g, s, 0.3);
    gl_FragColor = vec4(g, inside ? -c : c, arc, 1.0);
  }
`;

// Scales the glass, traced small while it moves, up to the canvas: Catmull-Rom, from nine bilinear
// taps, so it stays sharp instead of going soft.
export const UPSCALE = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2 uSrc;
  uniform vec2 uDst;

  void main() {
    vec2 at = gl_FragCoord.xy / uDst * uSrc;
    vec2 t1 = floor(at - 0.5) + 0.5;
    vec2 f = at - t1;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    vec2 t0 = (t1 - 1.0) / uSrc;
    vec2 t3 = (t1 + 2.0) / uSrc;
    vec2 t12 = (t1 + w2 / w12) / uSrc;
    vec3 c = texture2D(uTex, vec2(t0.x, t0.y)).rgb * w0.x * w0.y;
    c += texture2D(uTex, vec2(t12.x, t0.y)).rgb * w12.x * w0.y;
    c += texture2D(uTex, vec2(t3.x, t0.y)).rgb * w3.x * w0.y;
    c += texture2D(uTex, vec2(t0.x, t12.y)).rgb * w0.x * w12.y;
    c += texture2D(uTex, vec2(t12.x, t12.y)).rgb * w12.x * w12.y;
    c += texture2D(uTex, vec2(t3.x, t12.y)).rgb * w3.x * w12.y;
    c += texture2D(uTex, vec2(t0.x, t3.y)).rgb * w0.x * w3.y;
    c += texture2D(uTex, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
    c += texture2D(uTex, vec2(t3.x, t3.y)).rgb * w3.x * w3.y;
    gl_FragColor = vec4(c, 1.0);
  }
`;
