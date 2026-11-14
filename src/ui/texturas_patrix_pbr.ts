import {
  Color3,
  Material,
  PBRMaterial,
  RawTexture,
  Scene,
  Texture,
} from "@babylonjs/core";

/** Identificadores de sets de materiales Patrix PBR disponibles. */
export type PatrixMaterialId =
  | "pasto"
  | "tierra_perfil"
  | "tierra_surco"
  | "madera_roble"
  | "madera_oscura"
  | "tronco_corteza"
  | "techo_paja"
  | "piedra_cobble"
  | "estuco_cal"
  | "paja_paca"
  | "metal_forjado"
  | "follaje_roble"
  | "pino_agujas"
  | "pasto_tuft"
  | "piedra_montana"
  | "nieve_alpina";

export interface PatrixTextureSet {
  size: number;
  albedoData: Uint8Array;
  bumpData: Uint8Array;
  ormData: Uint8Array;
  albedo: RawTexture;
  bumpHeight: RawTexture;
  orm: RawTexture; // R: Ambient Occlusion, G: Roughness, B: Metallic
  parallaxBias: number;
  alphaCutout: boolean;
  doubleSided: boolean;
  translucency: number;
  wrapClampV: boolean;
  scaledCache: Map<string, { albedo: RawTexture; bumpHeight: RawTexture; orm: RawTexture }>;
  emissiveTint?: Color3;
}

export interface PatrixBanco {
  sets: Map<PatrixMaterialId, PatrixTextureSet>;
  aguaNormal: RawTexture;
  materials: Map<string, PBRMaterial>;
}

const CACHE_POR_ESCENA = new WeakMap<Scene, PatrixBanco>();

// ---------------------------------------------------------------------------
// Generadores deterministas de ruido periódico 2D (tileable 100%)
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp255(v: number): number {
  const n = Math.round(v);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash2D(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function valueNoisePeriodic(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);

  const v00 = hash2D(ix, iy, period, seed);
  const v10 = hash2D(ix + 1, iy, period, seed);
  const v01 = hash2D(ix, iy + 1, period, seed);
  const v11 = hash2D(ix + 1, iy + 1, period, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

function fbmPeriodic(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoisePeriodic(u, v, p, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

interface VoronoiSample {
  f1: number;
  f2: number;
  edgeDist: number;
  cellId: number;
}

function voronoiPeriodic(
  u: number,
  v: number,
  cells: number,
  seed: number,
  jitter = 0.85
): VoronoiSample {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  let d1 = 99;
  let d2 = 99;
  let id1 = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const jx = 0.5 + (hash2D(cx, cy, cells, seed + 11) - 0.5) * jitter;
      const jy = 0.5 + (hash2D(cx, cy, cells, seed + 29) - 0.5) * jitter;
      const rx = dx + jx - fx;
      const ry = dy + jy - fy;
      const dist = Math.hypot(rx, ry);
      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        id1 = hash2D(cx, cy, cells, seed + 53);
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  return {
    f1: d1,
    f2: d2,
    edgeDist: d2 - d1,
    cellId: id1,
  };
}

// ---------------------------------------------------------------------------
// Constructor de mapas Albedo + Normal/Height(POM) + ORM
// ---------------------------------------------------------------------------

interface PixelFields {
  albedo: Uint8Array; // RGBA sRGB
  height: Float32Array; // 0..1
  ao: Float32Array; // 0..1
  roughness: Float32Array; // 0..1
  metallic: Float32Array; // 0..1
  alpha?: Float32Array; // 0..1 opcional para alpha-cutout
}

function crearCampos(size: number): PixelFields {
  const n = size * size;
  return {
    albedo: new Uint8Array(n * 4),
    height: new Float32Array(n),
    ao: new Float32Array(n),
    roughness: new Float32Array(n),
    metallic: new Float32Array(n),
  };
}

function setPixelColor(
  albedo: Uint8Array,
  idx: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  const o = idx * 4;
  albedo[o] = clamp255(r);
  albedo[o + 1] = clamp255(g);
  albedo[o + 2] = clamp255(b);
  albedo[o + 3] = clamp255(a);
}

function mixRGB(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  const k = clamp01(t);
  return [
    c1[0] + (c2[0] - c1[0]) * k,
    c1[1] + (c2[1] - c1[1]) * k,
    c1[2] + (c2[2] - c1[2]) * k,
  ];
}

function buildBumpHeightRGBA(
  height: Float32Array,
  size: number,
  normalStrength: number,
  invertV = false
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const idx = (x: number, y: number) =>
    (((y + size) % size) * size) + ((x + size) % size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Filtro Sobel 3x3 periódico para normales suaves sin alias
      const tl = height[idx(x - 1, y - 1)];
      const t = height[idx(x, y - 1)];
      const tr = height[idx(x + 1, y - 1)];
      const l = height[idx(x - 1, y)];
      const r = height[idx(x + 1, y)];
      const bl = height[idx(x - 1, y + 1)];
      const b = height[idx(x, y + 1)];
      const br = height[idx(x + 1, y + 1)];

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * normalStrength;
      const dYraw = (bl + 2 * b + br - (tl + 2 * t + tr)) * normalStrength;
      const dY = invertV ? -dYraw : dYraw;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const o = (y * size + x) * 4;
      out[o] = clamp255((nx * 0.5 + 0.5) * 255);
      out[o + 1] = clamp255((ny * 0.5 + 0.5) * 255);
      out[o + 2] = clamp255((nz * 0.5 + 0.5) * 255);
      // Alpha = altura [0..255] para POM en Babylon PBRMaterial (255 = pico)
      out[o + 3] = clamp255(clamp01(height[y * size + x]) * 255);
    }
  }
  return out;
}

function buildOrmRGBA(fields: PixelFields, size: number): Uint8Array {
  const n = size * size;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = clamp255(clamp01(fields.ao[i]) * 255); // R: AO
    out[o + 1] = clamp255(clamp01(fields.roughness[i]) * 255); // G: Roughness
    out[o + 2] = clamp255(clamp01(fields.metallic[i]) * 255); // B: Metallic
    out[o + 3] = 255;
  }
  return out;
}

function crearRawRGBA(
  scene: Scene,
  data: Uint8Array,
  size: number,
  nombre: string,
  sampling: number,
  isSRGB: boolean,
  uScale: number,
  vScale: number,
  wrapClampV: boolean,
  hasAlpha: boolean
): RawTexture {
  const tex = RawTexture.CreateRGBATexture(
    data,
    size,
    size,
    scene,
    true,
    false,
    sampling,
    undefined,
    undefined,
    isSRGB
  );
  tex.name = nombre;
  tex.anisotropicFilteringLevel = 8;
  tex.uScale = uScale;
  tex.vScale = vScale;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = wrapClampV ? Texture.CLAMP_ADDRESSMODE : Texture.WRAP_ADDRESSMODE;
  if (hasAlpha) {
    tex.hasAlpha = true;
  }
  return tex;
}

function empaquetarTextureSet(
  scene: Scene,
  nombre: string,
  size: number,
  fields: PixelFields,
  normalStrength: number,
  opts: {
    parallaxBias: number;
    alphaCutout?: boolean;
    doubleSided?: boolean;
    translucency?: number;
    wrapClampV?: boolean;
  }
): PatrixTextureSet {
  const bumpData = buildBumpHeightRGBA(fields.height, size, normalStrength);
  const ormData = buildOrmRGBA(fields, size);
  const sampling = opts.alphaCutout
    ? Texture.BILINEAR_SAMPLINGMODE
    : Texture.TRILINEAR_SAMPLINGMODE;
  const clampV = !!opts.wrapClampV;
  const alphaCut = !!opts.alphaCutout;

  const albedo = crearRawRGBA(
    scene,
    fields.albedo,
    size,
    `patrix_${nombre}_albedo`,
    sampling,
    true,
    1,
    1,
    clampV,
    alphaCut
  );
  const bumpHeight = crearRawRGBA(
    scene,
    bumpData,
    size,
    `patrix_${nombre}_bump`,
    sampling,
    false,
    1,
    1,
    clampV,
    false
  );
  const orm = crearRawRGBA(
    scene,
    ormData,
    size,
    `patrix_${nombre}_orm`,
    sampling,
    false,
    1,
    1,
    clampV,
    false
  );

  return {
    size,
    albedoData: fields.albedo,
    bumpData,
    ormData,
    albedo,
    bumpHeight,
    orm,
    parallaxBias: opts.parallaxBias,
    alphaCutout: alphaCut,
    doubleSided: !!opts.doubleSided,
    translucency: opts.translucency ?? 0,
    wrapClampV: clampV,
    scaledCache: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Recetas PBR estilo Patrix Texture Pack
// ---------------------------------------------------------------------------

function genPastoPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const darkMoss: [number, number, number] = [52, 76, 30];
  const midOlive: [number, number, number] = [78, 109, 41];
  const warmBlade: [number, number, number] = [106, 136, 52];
  const dryStraw: [number, number, number] = [132, 118, 60];
  const soilGap: [number, number, number] = [54, 41, 27];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const macro = fbmPeriodic(u, v, 4, 3, 101);
      const bladeA = valueNoisePeriodic(u * 2.2 + v * 0.4, v * 0.65, 16, 113);
      const bladeB = valueNoisePeriodic(u * 0.8 - v * 0.35, v * 2.6, 16, 127);
      const micro = valueNoisePeriodic(u, v, 48, 149);
      const clover = fbmPeriodic(u, v, 8, 2, 163);

      const bladeHeight = clamp01(bladeA * 0.55 + bladeB * 0.45);
      const h = clamp01(0.28 + macro * 0.25 + bladeHeight * 0.38 + (micro - 0.5) * 0.14);

      let col = mixRGB(darkMoss, midOlive, macro * 0.7 + bladeHeight * 0.45);
      if (bladeHeight > 0.62) {
        col = mixRGB(col, warmBlade, (bladeHeight - 0.62) / 0.38);
      }
      if (clover > 0.72 && micro > 0.52) {
        col = mixRGB(col, dryStraw, 0.48);
      }
      if (h < 0.38) {
        col = mixRGB(soilGap, col, h / 0.38);
      }

      const jitter = (micro - 0.5) * 14;
      setPixelColor(f.albedo, i, col[0] + jitter, col[1] + jitter, col[2] + jitter * 0.7);
      f.height[i] = h;
      f.ao[i] = clamp01(0.45 + h * 0.55);
      f.roughness[i] = clamp01(0.76 - bladeHeight * 0.16 + (1 - h) * 0.12);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genTierraPerfilPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const soilDark: [number, number, number] = [56, 40, 26];
  const soilMid: [number, number, number] = [84, 60, 40];
  const soilWarm: [number, number, number] = [105, 76, 51];
  const pebble: [number, number, number] = [110, 106, 98];
  const grassEdge: [number, number, number] = [78, 108, 41];
  const grassTip: [number, number, number] = [104, 134, 52];

  for (let y = 0; y < size; y++) {
    // RawTexture invertY=false -> y alto = parte superior de cara lateral
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const clod = fbmPeriodic(u, v, 8, 3, 211);
      const vor = voronoiPeriodic(u, v, 10, 223, 0.9);
      const grit = valueNoisePeriodic(u, v, 32, 239);
      const grassNoise = valueNoisePeriodic(u, 0.25, 16, 251);
      const fringeLine = 0.72 + (grassNoise - 0.5) * 0.14 + (grit - 0.5) * 0.05;

      const inGrass = v >= fringeLine;
      let col = mixRGB(soilDark, soilMid, clod);
      if (vor.f1 < 0.24 && vor.cellId > 0.72 && !inGrass) {
        // Guijarro incrustado en el perfil de tierra
        col = mixRGB(pebble, soilWarm, vor.f1 / 0.24);
      } else if (clod > 0.6) {
        col = mixRGB(col, soilWarm, (clod - 0.6) * 1.4);
      }

      let h = clamp01(0.32 + clod * 0.4 + (1 - clamp01(vor.f1 * 1.6)) * 0.18 + grit * 0.1);
      if (inGrass) {
        const overhang = clamp01((v - fringeLine) / 0.12);
        col = mixRGB(grassEdge, grassTip, grit * 0.65 + overhang * 0.35);
        h = clamp01(0.75 + grit * 0.25);
      } else if (v > fringeLine - 0.04) {
        // Sombra bajo el borde colgante de pasto
        col = mixRGB([26, 20, 12], col, (fringeLine - v) / 0.04 * 0.6 + 0.4);
        h *= 0.72;
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.45 + h * 0.55);
      f.roughness[i] = inGrass ? 0.74 : clamp01(0.82 - (vor.f1 < 0.2 ? 0.16 : 0));
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genTierraSurcoPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const deepSoil: [number, number, number] = [52, 35, 22];
  const midSoil: [number, number, number] = [84, 58, 36];
  const dryCrumb: [number, number, number] = [112, 81, 52];
  const strawBit: [number, number, number] = [148, 124, 70];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      // Surcos labrados paralelos suaves + terrones Voronoi
      const furrowWave = 0.5 + 0.5 * Math.sin((u * 4 + fbmPeriodic(u, v, 4, 2, 307) * 0.45) * Math.PI * 2);
      const vor = voronoiPeriodic(u, v, 12, 313, 0.92);
      const crumb = clamp01(1 - vor.f1 * 1.45);
      const micro = fbmPeriodic(u, v, 16, 3, 331);
      const straw = valueNoisePeriodic(u * 2.5 + v * 1.5, v * 0.4, 24, 347);

      const h = clamp01(furrowWave * 0.48 + crumb * 0.34 + micro * 0.18);
      let col = mixRGB(deepSoil, midSoil, h * 0.9);
      if (crumb > 0.55 && furrowWave > 0.5) {
        col = mixRGB(col, dryCrumb, (crumb - 0.55) * 1.4);
      }
      if (straw > 0.86 && h > 0.55) {
        col = mixRGB(col, strawBit, 0.6);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.35 + h * 0.65);
      // Hondonadas un poco menos ásperas para reflejar humedad al regar
      f.roughness[i] = clamp01(0.56 + furrowWave * 0.24 + micro * 0.12);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genMaderaPatrix(
  size: number,
  seed: number,
  paleta: {
    oscura: [number, number, number];
    media: [number, number, number];
    clara: [number, number, number];
    veta: [number, number, number];
  },
  planks = 4
): PixelFields {
  const f = crearCampos(size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const plankY = v * planks;
      const plankIdx = Math.floor(plankY);
      const py = plankY - plankIdx;

      // Unión vertical alternada tipo entablado rústico
      const jointU = (u + (plankIdx % 2) * 0.5) % 1;
      const hSeamDist = Math.min(py, 1 - py);
      const vSeamDist = Math.min(jointU, 1 - jointU);
      const inHSeam = hSeamDist < 0.048;
      const inVSeam = vSeamDist < 0.016;
      const seamFactor = inHSeam
        ? clamp01(hSeamDist / 0.048)
        : inVSeam
          ? clamp01(vSeamDist / 0.016)
          : 1;

      const plankTone = hash2D(plankIdx, plankIdx * 3, planks * 4, seed + 5);
      const warp = fbmPeriodic(u + plankIdx * 0.27, v * 0.5, 4, 2, seed + 19);
      const grain = Math.sin((v * 46 + warp * 5.2 + plankIdx * 2.1) * Math.PI * 2) * 0.5 + 0.5;
      const fiber = valueNoisePeriodic(u * 0.5, v * 6.0, 16, seed + 37);

      let col = mixRGB(paleta.oscura, paleta.clara, 0.25 + plankTone * 0.55);
      col = mixRGB(col, paleta.media, fiber * 0.5);
      col = mixRGB(col, paleta.veta, (1 - grain) * 0.42);

      // Clavos de hierro forjado cerca de la unión de tabla
      const nailDistA = Math.hypot(jointU - 0.045, py - 0.22);
      const nailDistB = Math.hypot(jointU - 0.045, py - 0.78);
      const isNail = Math.min(nailDistA, nailDistB) < 0.032;

      let h = clamp01((0.46 + grain * 0.26 + fiber * 0.18) * (0.25 + 0.75 * seamFactor));
      let rough = clamp01(0.68 + (1 - grain) * 0.18 + (1 - seamFactor) * 0.15);
      let metal = 0;

      if (isNail) {
        col = [56, 58, 62];
        h = 0.88;
        rough = 0.36;
        metal = 0.85;
      } else if (seamFactor < 0.99) {
        col = mixRGB([26, 18, 12], col, seamFactor * 0.75 + 0.2);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.32 + seamFactor * 0.5 + grain * 0.18);
      f.roughness[i] = rough;
      f.metallic[i] = metal;
    }
  }
  return f;
}

function genCortezaPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const deepCrevice: [number, number, number] = [44, 32, 22];
  const barkMid: [number, number, number] = [78, 58, 40];
  const barkRidge: [number, number, number] = [102, 78, 55];
  const lichen: [number, number, number] = [84, 99, 58];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const warp = fbmPeriodic(u, v, 4, 2, 401);
      const ridgeNoise = fbmPeriodic(u * 3.2 + warp * 0.35, v * 0.35, 8, 3, 419);
      const micro = valueNoisePeriodic(u, v, 32, 433);
      const mossPatch = fbmPeriodic(u, v, 4, 2, 449);

      const h = clamp01(Math.pow(ridgeNoise, 1.15) * 0.8 + micro * 0.2);
      let col = mixRGB(deepCrevice, barkMid, smooth(clamp01(h * 1.2)));
      if (h > 0.65) {
        col = mixRGB(col, barkRidge, (h - 0.65) / 0.35);
      }
      if (mossPatch > 0.68 && h > 0.45) {
        col = mixRGB(col, lichen, (mossPatch - 0.68) * 1.8);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.28 + h * 0.72);
      f.roughness[i] = clamp01(0.88 - h * 0.12);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genTechoPajaPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const shadowStraw: [number, number, number] = [96, 76, 39];
  const midStraw: [number, number, number] = [158, 131, 68];
  const goldenStraw: [number, number, number] = [194, 165, 92];
  const dryTip: [number, number, number] = [212, 187, 118];

  const courses = 5; // hileras escalonadas de paja como techo de aldea Patrix
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const coursePos = v * courses + (valueNoisePeriodic(u, v, 16, 503) - 0.5) * 0.18;
      const cy = coursePos - Math.floor(coursePos);
      // Borde inferior grueso en cada hilera (escalonado)
      const stepLip = cy < 0.14 ? cy / 0.14 : 1.0;

      const stalkA = valueNoisePeriodic(u * 4.5, v * 0.45, 16, 509);
      const stalkB = valueNoisePeriodic(u * 7.5 + 0.3, v * 0.7, 16, 521);
      const bundle = fbmPeriodic(u * 1.4, v * 0.8, 8, 2, 541);
      const fine = clamp01(stalkA * 0.55 + stalkB * 0.45);

      const h = clamp01((0.28 + fine * 0.5 + bundle * 0.22) * (0.35 + 0.65 * stepLip));
      let col = mixRGB(shadowStraw, midStraw, bundle * 0.6 + fine * 0.4);
      if (fine > 0.56) {
        col = mixRGB(col, goldenStraw, (fine - 0.56) / 0.44);
      }
      if (cy > 0.82 && fine > 0.6) {
        col = mixRGB(col, dryTip, 0.45);
      }
      if (cy < 0.16) {
        col = mixRGB([62, 48, 24], col, stepLip * 0.75 + 0.18);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.32 + stepLip * 0.42 + fine * 0.26);
      f.roughness[i] = clamp01(0.84 - fine * 0.16);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genPiedraCobblePatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const mortarDark: [number, number, number] = [44, 46, 44];
  const mossMortar: [number, number, number] = [68, 88, 38];
  const stoneCool: [number, number, number] = [92, 95, 98];
  const stoneWarm: [number, number, number] = [124, 120, 113];
  const stoneLight: [number, number, number] = [144, 144, 140];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      // Distorción sutil para que los cantos de piedra luzcan tallados a mano
      const warpU = u + (fbmPeriodic(u, v, 6, 2, 601) - 0.5) * 0.045;
      const warpV = v + (fbmPeriodic(u, v, 6, 2, 613) - 0.5) * 0.045;
      const vor = voronoiPeriodic(warpU, warpV, 5, 619, 0.88);
      const grain = fbmPeriodic(u, v, 16, 3, 631);
      const mossNoise = fbmPeriodic(u, v, 4, 2, 647);

      const bevel = smooth(clamp01((vor.edgeDist - 0.045) / 0.11));
      const dome = clamp01(1 - vor.f1 * 0.72);
      const h = clamp01(bevel * (0.58 + dome * 0.25 + grain * 0.17));

      let stoneBase = mixRGB(stoneCool, stoneWarm, vor.cellId);
      stoneBase = mixRGB(stoneBase, stoneLight, grain * 0.55);

      let mortarCol = mortarDark;
      if (mossNoise > 0.54) {
        mortarCol = mixRGB(mortarDark, mossMortar, clamp01((mossNoise - 0.54) * 2.2));
      }

      let col = mixRGB(mortarCol, stoneBase, bevel);
      if (mossNoise > 0.68 && bevel < 0.7) {
        col = mixRGB(col, mossMortar, 0.45);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.28 + bevel * 0.55 + grain * 0.17);
      f.roughness[i] = clamp01(0.88 - bevel * 0.24 - grain * 0.12);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genEstucoCalPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const darkStucco: [number, number, number] = [166, 152, 128];
  const midStucco: [number, number, number] = [194, 181, 154];
  const warmStucco: [number, number, number] = [212, 200, 174];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const plaster = fbmPeriodic(u, v, 6, 3, 701);
      const sand = valueNoisePeriodic(u, v, 40, 719);

      let col = mixRGB(darkStucco, midStucco, plaster);
      if (plaster > 0.55) {
        col = mixRGB(col, warmStucco, (plaster - 0.55) * 1.4);
      }
      const n = (sand - 0.5) * 10;
      setPixelColor(f.albedo, i, col[0] + n, col[1] + n, col[2] + n);
      f.height[i] = clamp01(0.45 + plaster * 0.35 + sand * 0.2);
      f.ao[i] = clamp01(0.75 + plaster * 0.25);
      f.roughness[i] = clamp01(0.78 + sand * 0.14);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genMetalForjadoPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const ironDark: [number, number, number] = [42, 44, 48];
  const ironEdge: [number, number, number] = [88, 92, 98];
  const rustTint: [number, number, number] = [94, 58, 36];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const hammer = voronoiPeriodic(u, v, 8, 809, 0.75);
      const grime = fbmPeriodic(u, v, 8, 2, 821);
      let col = mixRGB(ironDark, ironEdge, clamp01(1 - hammer.f1) * 0.65);
      if (grime > 0.72) {
        col = mixRGB(col, rustTint, (grime - 0.72) * 1.8);
      }
      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = clamp01(0.55 - hammer.f1 * 0.35 + grime * 0.15);
      f.ao[i] = clamp01(0.55 + (1 - hammer.f1) * 0.45);
      f.roughness[i] = clamp01(0.32 + grime * 0.28);
      f.metallic[i] = grime > 0.75 ? 0.55 : 0.88;
    }
  }
  return f;
}

function genFollajeRoblePatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  f.alpha = new Float32Array(size * size);

  const shadowLeaf: [number, number, number] = [56, 86, 28];
  const midLeaf: [number, number, number] = [92, 134, 42];
  const sunlitLeaf: [number, number, number] = [132, 174, 58];

  // Sembrar 46 hojitas ovaladas superpuestas con transparencia entre huecos
  const hojas: Array<{ cx: number; cy: number; rx: number; ry: number; ang: number; tone: number }> = [];
  for (let k = 0; k < 46; k++) {
    hojas.push({
      cx: hash2D(k, 1, 64, 901),
      cy: hash2D(k, 2, 64, 907),
      rx: 0.12 + hash2D(k, 3, 64, 911) * 0.08,
      ry: 0.075 + hash2D(k, 4, 64, 919) * 0.05,
      ang: hash2D(k, 5, 64, 929) * Math.PI * 2,
      tone: hash2D(k, 6, 64, 937),
    });
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const micro = valueNoisePeriodic(u, v, 32, 953);

      let maxLeaf = 0;
      let bestTone = 0.5;
      let bestVein = 0;

      for (const h of hojas) {
        // Wrap periódico para que tilee sin cortes en los bloques de copa
        let dx = u - h.cx;
        let dy = v - h.cy;
        if (dx > 0.5) dx -= 1;
        if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1;
        if (dy < -0.5) dy += 1;

        const ca = Math.cos(h.ang);
        const sa = Math.sin(h.ang);
        const lx = dx * ca + dy * sa;
        const ly = -dx * sa + dy * ca;
        const d = Math.hypot(lx / h.rx, ly / h.ry);
        if (d < 1.0) {
          const cov = 1 - d;
          const vein = Math.exp(-Math.abs(ly / h.ry) * 14) * cov;
          if (cov > maxLeaf) {
            maxLeaf = cov;
            bestTone = h.tone;
            bestVein = vein;
          }
        }
      }

      const opaque = maxLeaf > 0.14;
      let col = mixRGB(shadowLeaf, midLeaf, bestTone * 0.75 + maxLeaf * 0.3);
      if (bestTone > 0.58 || maxLeaf > 0.62) {
        col = mixRGB(col, sunlitLeaf, clamp01(bestTone * 0.5 + maxLeaf * 0.35 - 0.2));
      }
      col = mixRGB(col, [126, 158, 62], bestVein * 0.35);

      const alphaByte = opaque ? 255 : 0;
      setPixelColor(f.albedo, i, col[0], col[1], col[2], alphaByte);
      f.alpha![i] = opaque ? 1 : 0;
      f.height[i] = opaque ? clamp01(0.42 + maxLeaf * 0.45 + bestVein * 0.13) : 0.15;
      f.ao[i] = clamp01(0.45 + maxLeaf * 0.55);
      f.roughness[i] = clamp01(0.54 + micro * 0.18 - bestVein * 0.1);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genPinoAgujasPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  f.alpha = new Float32Array(size * size);

  const deepSpruce: [number, number, number] = [42, 68, 32];
  const midSpruce: [number, number, number] = [66, 102, 44];
  const tipSpruce: [number, number, number] = [96, 134, 58];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const n1 = fbmPeriodic(u * 2.2, v * 0.85, 16, 3, 1009);
      const needles = valueNoisePeriodic(u * 5.0 + Math.abs(v - 0.5) * 1.4, v * 1.8, 16, 1021);
      const mask = n1 * 0.55 + needles * 0.45;
      const opaque = mask > 0.24;

      let col = mixRGB(deepSpruce, midSpruce, clamp01((mask - 0.24) / 0.42));
      if (mask > 0.62) {
        col = mixRGB(col, tipSpruce, (mask - 0.62) / 0.38);
      }

      setPixelColor(f.albedo, i, col[0], col[1], col[2], opaque ? 255 : 0);
      f.alpha![i] = opaque ? 1 : 0;
      f.height[i] = opaque ? clamp01(0.4 + mask * 0.6) : 0.12;
      f.ao[i] = clamp01(0.45 + mask * 0.55);
      f.roughness[i] = clamp01(0.68 - mask * 0.14);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genPasto3DTuftPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  f.alpha = new Float32Array(size * size);

  const baseDark: [number, number, number] = [68, 98, 36];
  const bladeMid: [number, number, number] = [104, 144, 52];
  const bladeSun: [number, number, number] = [146, 184, 68];
  const seedTip: [number, number, number] = [194, 174, 88];
  const buttercup: [number, number, number] = [242, 224, 146];

  const briznas: Array<{
    x0: number;
    h: number;
    bend: number;
    w: number;
    tone: number;
    tipFlower: number;
  }> = [];
  for (let b = 0; b < 24; b++) {
    briznas.push({
      x0: 0.06 + hash2D(b, 1, 32, 1103) * 0.88,
      h: 0.36 + hash2D(b, 2, 32, 1109) * 0.54,
      bend: (hash2D(b, 3, 32, 1117) - 0.5) * 0.36,
      w: 0.017 + hash2D(b, 4, 32, 1123) * 0.013,
      tone: hash2D(b, 5, 32, 1129),
      tipFlower: hash2D(b, 6, 32, 1151),
    });
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      let hit = false;
      let bestCenter = 0;
      let bestV = 0;
      let bestTone = 0.5;
      let bestFlower = 0;

      for (const b of briznas) {
        if (v > b.h) continue;
        const t = clamp01(v / b.h);
        const cx = b.x0 + b.bend * t * t;
        const halfW = b.w * (1 - t * 0.84);
        const dist = Math.abs(u - cx);
        if (dist <= halfW) {
          const score = 1 - dist / halfW;
          if (!hit || t > bestV || score > bestCenter) {
            hit = true;
            bestCenter = score;
            bestV = t;
            bestTone = b.tone;
            bestFlower = b.tipFlower;
          }
        }
      }

      if (!hit) {
        for (const b of briznas) {
          if (b.tipFlower > 0.91 && b.h > 0.68) {
            const fx = b.x0 + b.bend;
            const fy = b.h - 0.015;
            const d = Math.hypot(u - fx, v - fy);
            if (d < 0.022) {
              hit = true;
              bestCenter = 1 - d / 0.022;
              bestV = 1.0;
              bestTone = 1.0;
              bestFlower = 1.0;
              break;
            }
          }
        }
      }

      if (!hit) {
        setPixelColor(f.albedo, i, baseDark[0], baseDark[1], baseDark[2], 0);
        f.alpha![i] = 0;
        f.height[i] = 0.1;
        f.ao[i] = 0.6;
        f.roughness[i] = 0.7;
        f.metallic[i] = 0;
      } else {
        let col = mixRGB(baseDark, bladeMid, clamp01(bestV * 0.72 + bestTone * 0.28));
        col = mixRGB(col, bladeSun, clamp01((bestV - 0.32) * 1.18));
        if (bestFlower > 0.94 && bestV > 0.94) {
          col = buttercup;
        } else if (bestFlower > 0.75 && bestV > 0.88) {
          col = mixRGB(col, seedTip, (bestV - 0.88) / 0.12);
        }
        setPixelColor(f.albedo, i, col[0], col[1], col[2], 255);
        f.alpha![i] = 1;
        f.height[i] = clamp01(0.45 + bestCenter * 0.45 + bestV * 0.1);
        f.ao[i] = clamp01(0.45 + bestV * 0.55);
        f.roughness[i] = clamp01(0.58 - bestV * 0.14);
        f.metallic[i] = 0;
      }
    }
  }
  return f;
}

function genPiedraMontanaPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const darkRock: [number, number, number] = [132, 136, 142];
  const midRock: [number, number, number] = [184, 188, 192];
  const lichen: [number, number, number] = [156, 174, 136];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const strata = fbmPeriodic(u * 0.8, v * 2.2, 6, 3, 1201);
      const cracks = voronoiPeriodic(u, v, 4, 1217, 0.9).edgeDist;
      const crackMask = smooth(clamp01(cracks / 0.08));
      const h = clamp01(crackMask * (0.45 + strata * 0.55));
      let col = mixRGB(darkRock, midRock, strata);
      if (strata > 0.65) {
        col = mixRGB(col, lichen, (strata - 0.65) * 0.75);
      }
      col = mixRGB([45, 48, 52], col, crackMask * 0.8 + 0.2);

      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = h;
      f.ao[i] = clamp01(0.45 + h * 0.55);
      f.roughness[i] = clamp01(0.84 - strata * 0.15);
      f.metallic[i] = 0;
    }
  }
  return f;
}

function genNieveAlpinaPatrix(size = 128): PixelFields {
  const f = crearCampos(size);
  const snowShadow: [number, number, number] = [212, 224, 238];
  const snowBright: [number, number, number] = [244, 248, 252];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const drift = fbmPeriodic(u, v, 5, 3, 1301);
      const sparkle = valueNoisePeriodic(u, v, 48, 1319);
      const col = mixRGB(snowShadow, snowBright, drift * 0.7 + sparkle * 0.3);
      setPixelColor(f.albedo, i, col[0], col[1], col[2]);
      f.height[i] = clamp01(0.4 + drift * 0.5 + sparkle * 0.1);
      f.ao[i] = clamp01(0.82 + drift * 0.18);
      f.roughness[i] = clamp01(0.42 + drift * 0.28 - (sparkle > 0.86 ? 0.18 : 0));
      f.metallic[i] = 0;
    }
  }
  return f;
}

function crearMapaNormalAgua(scene: Scene, size = 128): RawTexture {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w1 = Math.sin((u * 3 + v * 2) * Math.PI * 2) * 0.22;
      const w2 = Math.cos((u * 2 - v * 4) * Math.PI * 2) * 0.18;
      const r1 = fbmPeriodic(u, v, 6, 3, 1409) * 0.6;
      height[y * size + x] = clamp01(0.5 + w1 + w2 + (r1 - 0.3));
    }
  }
  const rgba = buildBumpHeightRGBA(height, size, 1.35);
  const tex = RawTexture.CreateRGBATexture(
    rgba,
    size,
    size,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    undefined,
    undefined,
    false
  );
  tex.name = "patrix_agua_normal";
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

// ---------------------------------------------------------------------------
// API pública de banco PBR Patrix por escena
// ---------------------------------------------------------------------------

/** Obtiene o genera el banco completo de texturas Patrix PBR para la escena dada. */
export function obtenerBancoPatrix(scene: Scene): PatrixBanco {
  const existente = CACHE_POR_ESCENA.get(scene);
  if (existente) return existente;

  const sets = new Map<PatrixMaterialId, PatrixTextureSet>();

  sets.set(
    "pasto",
    empaquetarTextureSet(scene, "pasto", 128, genPastoPatrix(128), 1.85, {
      parallaxBias: 0.018,
    })
  );
  sets.set(
    "tierra_perfil",
    empaquetarTextureSet(scene, "tierra_perfil", 128, genTierraPerfilPatrix(128), 2.1, {
      parallaxBias: 0.025,
    })
  );
  sets.set(
    "tierra_surco",
    empaquetarTextureSet(scene, "tierra_surco", 128, genTierraSurcoPatrix(128), 2.8, {
      parallaxBias: 0.036,
    })
  );
  sets.set(
    "madera_roble",
    empaquetarTextureSet(
      scene,
      "madera_roble",
      128,
      genMaderaPatrix(
        128,
        361,
        {
          oscura: [92, 65, 42],
          media: [122, 88, 56],
          clara: [148, 110, 72],
          veta: [70, 48, 30],
        },
        4
      ),
      2.3,
      { parallaxBias: 0.028 }
    )
  );
  sets.set(
    "madera_oscura",
    empaquetarTextureSet(
      scene,
      "madera_oscura",
      128,
      genMaderaPatrix(
        128,
        389,
        {
          oscura: [48, 34, 22],
          media: [68, 48, 32],
          clara: [86, 62, 42],
          veta: [34, 23, 15],
        },
        3
      ),
      2.2,
      { parallaxBias: 0.024 }
    )
  );
  sets.set(
    "tronco_corteza",
    empaquetarTextureSet(scene, "tronco_corteza", 128, genCortezaPatrix(128), 2.9, {
      parallaxBias: 0.034,
    })
  );
  sets.set(
    "techo_paja",
    empaquetarTextureSet(scene, "techo_paja", 128, genTechoPajaPatrix(128), 2.8, {
      parallaxBias: 0.036,
    })
  );
  sets.set(
    "piedra_cobble",
    empaquetarTextureSet(scene, "piedra_cobble", 128, genPiedraCobblePatrix(128), 3.1, {
      parallaxBias: 0.038,
    })
  );
  sets.set(
    "estuco_cal",
    empaquetarTextureSet(scene, "estuco_cal", 128, genEstucoCalPatrix(128), 1.4, {
      parallaxBias: 0.015,
    })
  );
  sets.set(
    "paja_paca",
    empaquetarTextureSet(scene, "paja_paca", 128, genTechoPajaPatrix(128), 2.4, {
      parallaxBias: 0.025,
    })
  );
  sets.set(
    "metal_forjado",
    empaquetarTextureSet(scene, "metal_forjado", 128, genMetalForjadoPatrix(128), 2.0, {
      parallaxBias: 0.015,
    })
  );
  sets.set(
    "follaje_roble",
    empaquetarTextureSet(scene, "follaje_roble", 128, genFollajeRoblePatrix(128), 2.1, {
      parallaxBias: 0,
      alphaCutout: true,
      doubleSided: true,
      translucency: 0.42,
    })
  );
  sets.set(
    "pino_agujas",
    empaquetarTextureSet(scene, "pino_agujas", 128, genPinoAgujasPatrix(128), 2.0, {
      parallaxBias: 0,
      alphaCutout: true,
      doubleSided: true,
      translucency: 0.3,
    })
  );
  sets.set(
    "pasto_tuft",
    empaquetarTextureSet(scene, "pasto_tuft", 128, genPasto3DTuftPatrix(128), 1.5, {
      parallaxBias: 0,
      alphaCutout: true,
      doubleSided: true,
      translucency: 0.48,
      wrapClampV: true,
    })
  );
  sets.set(
    "piedra_montana",
    empaquetarTextureSet(scene, "piedra_montana", 128, genPiedraMontanaPatrix(128), 2.4, {
      parallaxBias: 0.02,
    })
  );
  sets.set(
    "nieve_alpina",
    empaquetarTextureSet(scene, "nieve_alpina", 128, genNieveAlpinaPatrix(128), 1.4, {
      parallaxBias: 0.012,
    })
  );

  const banco: PatrixBanco = {
    sets,
    aguaNormal: crearMapaNormalAgua(scene, 128),
    materials: new Map(),
  };
  CACHE_POR_ESCENA.set(scene, banco);
  return banco;
}

export interface CrearPBRPatrixOpciones {
  nombre?: string;
  uScale?: number;
  vScale?: number;
  tint?: Color3;
  usarPOM?: boolean;
  metallicMax?: number;
  roughnessScale?: number;
  albedoColor?: Color3;
  cacheable?: boolean;
}

/**
 * Crea (o reutiliza) un PBRMaterial configurado con mapas Albedo + Normal/POM + ORM
 * estilo Patrix Texture Pack y shader realista.
 */
export function crearMaterialPatrixPBR(
  scene: Scene,
  id: PatrixMaterialId,
  opts: CrearPBRPatrixOpciones = {}
): PBRMaterial {
  const banco = obtenerBancoPatrix(scene);
  const set = banco.sets.get(id)!;
  const uScale = opts.uScale ?? 1;
  const vScale = opts.vScale ?? 1;
  const usarPOM = opts.usarPOM ?? set.parallaxBias > 0;
  const cacheKey = `${id}:${uScale.toFixed(2)}:${vScale.toFixed(2)}:${usarPOM ? 1 : 0}:${
    opts.tint ? opts.tint.toHexString() : "none"
  }`;

  if (opts.cacheable && banco.materials.has(cacheKey)) {
    return banco.materials.get(cacheKey)!;
  }

  const mat = new PBRMaterial(opts.nombre ?? `mat_patrix_${id}_${banco.materials.size}`, scene);

  const sampling = set.alphaCutout
    ? Texture.BILINEAR_SAMPLINGMODE
    : Texture.TRILINEAR_SAMPLINGMODE;

  let texAlbedo = set.albedo;
  let texBump = set.bumpHeight;
  let texOrm = set.orm;

  if (uScale !== 1 || vScale !== 1) {
    const scaleKey = `${uScale.toFixed(2)}:${vScale.toFixed(2)}`;
    let scaled = set.scaledCache.get(scaleKey);
    if (!scaled) {
      scaled = {
        albedo: crearRawRGBA(
          scene,
          set.albedoData,
          set.size,
          `patrix_${id}_albedo_${scaleKey}`,
          sampling,
          true,
          uScale,
          vScale,
          set.wrapClampV,
          set.alphaCutout
        ),
        bumpHeight: crearRawRGBA(
          scene,
          set.bumpData,
          set.size,
          `patrix_${id}_bump_${scaleKey}`,
          sampling,
          false,
          uScale,
          vScale,
          set.wrapClampV,
          false
        ),
        orm: crearRawRGBA(
          scene,
          set.ormData,
          set.size,
          `patrix_${id}_orm_${scaleKey}`,
          sampling,
          false,
          uScale,
          vScale,
          set.wrapClampV,
          false
        ),
      };
      set.scaledCache.set(scaleKey, scaled);
    }
    texAlbedo = scaled.albedo;
    texBump = scaled.bumpHeight;
    texOrm = scaled.orm;
  }

  mat.albedoTexture = texAlbedo;
  mat.albedoColor = opts.albedoColor
    ? opts.albedoColor.clone()
    : opts.tint
      ? opts.tint.clone()
      : Color3.White();

  mat.bumpTexture = texBump;
  mat.bumpTexture.level = 1.05;
  mat.invertNormalMapX = false;
  mat.invertNormalMapY = false;

  if (usarPOM && set.parallaxBias > 0) {
    // Parallax Offset estándar (sin raymarch / normalize(0) NaN al mirar perpendicular o rasante)
    mat.useParallax = true;
    mat.useParallaxOcclusion = false;
    mat.parallaxScaleBias = set.parallaxBias;
  }

  mat.metallicTexture = texOrm;
  mat.useRoughnessFromMetallicTextureAlpha = false;
  mat.useRoughnessFromMetallicTextureGreen = true;
  mat.useMetallnessFromMetallicTextureBlue = true;
  mat.useAmbientOcclusionFromMetallicTextureRed = true;
  mat.ambientTextureStrength = 0.85;
  mat.metallic = opts.metallicMax ?? 1.0;
  mat.roughness = opts.roughnessScale ?? 1.0;

  if (set.alphaCutout) {
    mat.albedoTexture.hasAlpha = true;
    mat.useAlphaFromAlbedoTexture = true;
    mat.transparencyMode = Material.MATERIAL_ALPHATEST;
    mat.alphaCutOff = 0.42;
    mat.needDepthPrePass = false;
  }

  if (set.doubleSided) {
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
  }

  if (set.translucency > 0) {
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = set.translucency;
    mat.subSurface.tintColor = new Color3(0.72, 0.88, 0.36);
  }

  mat.metadata = { ...(mat.metadata ?? {}), patrixPBR: true, patrixId: id };

  if (opts.cacheable) {
    banco.materials.set(cacheKey, mat);
  }
  return mat;
}
