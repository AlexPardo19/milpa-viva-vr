/**
 * Generador Procedural de Texturas Pixel-Art para Mallas 3D (v4.1 — Milpa Viva VR)
 *
 * Crea mosaicos DynamicTexture de 16×16 / 32×32 píxeles con filtrado cercano
 * (`Texture.NEAREST_SAMPLINGMODE`) y sin mipmaps, logrando una estética pixel art
 * nítida tipo Minecraft / voxel en terreno, surco, madera, piedra, teja y agua.
 */

import {
  Scene,
  DynamicTexture,
  Texture,
  Color3,
  StandardMaterial
} from "@babylonjs/core";

function hash2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Configura cualquier DynamicTexture existente en modo pixel art nítido (sin borrosidad bilineal).
 */
export function configurarSamplingPixel(tex: DynamicTexture): DynamicTexture {
  tex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  tex.anisotropicFilteringLevel = 1;
  return tex;
}

/**
 * Helper base para generar un mosaico pixelado determinista (compatible con NullEngine).
 */
export function crearMosaicoPixel(
  scene: Scene,
  nombre: string,
  sizePx: number,
  uScale: number,
  vScale: number,
  pintarCelda: (x: number, y: number, rnd: number) => string,
  seed = 1
): DynamicTexture {
  const tex = new DynamicTexture(
    nombre,
    { width: sizePx, height: sizePx },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE
  );
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const rnd = hash2D(x, y, seed);
      ctx.fillStyle = pintarCelda(x, y, rnd);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = uScale;
  tex.vScale = vScale;
  tex.anisotropicFilteringLevel = 1;
  tex.update(false);
  return tex;
}

/**
 * Paleta y patrones inspirados en el pack "Mako" (Waypoint Studios):
 * píxeles nítidos de 32×32, colores vivos pero suaves, poco contraste entre píxeles
 * vecinos, manchones de luz/sombra, sin bordes duros ni contornos negros.
 */
const TAM = 32;

/** Ruido mezclado: detalle fino + manchones de 2×2 y 4×4 px (aspecto "pintado a mano"). */
function ruido(x: number, y: number, seed: number): number {
  const fino = hash2D(x, y, seed);
  const medio = hash2D(Math.floor(x / 2), Math.floor(y / 2), seed + 3);
  const grande = hash2D(Math.floor(x / 4), Math.floor(y / 4), seed + 7);
  return fino * 0.45 + medio * 0.3 + grande * 0.25;
}

function elegir(paleta: string[], r: number): string {
  const i = Math.min(paleta.length - 1, Math.max(0, Math.floor(r * paleta.length)));
  return paleta[i];
}

/** Pasto: verde fresco con manchones claros, briznas y alguna flor rosada/blanca */
export function crearTexPastoPixel(scene: Scene, uScale = 14, vScale = 14): DynamicTexture {
  const paleta = ["#4f9a2e", "#5aa832", "#66b53a", "#74c243", "#86d052"];
  return crearMosaicoPixel(
    scene,
    "texPxPasto",
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      if (rnd > 0.992) return "#f9a8d4"; // pétalo rosado (sakura)
      if (rnd > 0.986) return "#fef3c7";
      // Briznas: pequeñas marcas verticales más claras
      if (hash2D(x, Math.floor(y / 3), 21) > 0.9 && y % 3 !== 2) return "#9be15d";
      return elegir(paleta, ruido(x, y, 11));
    },
    11
  ) ;
}

/** Perfil lateral: borde de pasto ondulado sobre tierra con piedritas */
export function crearTexPerfilTierraPixel(scene: Scene, uScale = 16, vScale = 1): DynamicTexture {
  const tierra = ["#6b4423", "#76502b", "#815a32", "#8c643a"];
  return crearMosaicoPixel(
    scene,
    "texPxPerfilTierra",
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      const borde = 5 + Math.floor(hash2D(Math.floor(x / 2), 0, 5) * 4);
      if (y < borde - 2) return elegir(["#5aa832", "#66b53a", "#74c243"], ruido(x, y, 4));
      if (y < borde) return "#4f9a2e"; // sombra bajo el pasto
      if (rnd > 0.93) return "#a8a29e"; // piedrita
      return elegir(tierra, ruido(x, y, 23));
    },
    23
  );
}

/** Tierra de cultivo arada: surcos suaves, cálida y húmeda */
export function crearTexTierraSurcoPixel(scene: Scene, uScale = 6, vScale = 2): DynamicTexture {
  const alta = ["#7a5230", "#855b36", "#90663d"];
  const baja = ["#5a3a20", "#654427", "#704c2d"];
  return crearMosaicoPixel(
    scene,
    "texPxTierraSurco",
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      const cresta = y % 8 < 4;
      const r = ruido(x, y, 37);
      if (cresta) return rnd > 0.94 ? "#a57a4a" : elegir(alta, r);
      return rnd > 0.95 ? "#4a2f19" : elegir(baja, r);
    },
    37
  );
}

/** Tablones de roble: vetas verticales suaves y juntas sutiles */
export function crearTexMaderaPixel(
  scene: Scene,
  clara = false,
  uScale = 2,
  vScale = 2
): DynamicTexture {
  const paleta = clara
    ? ["#c99a5b", "#d3a566", "#dcb073", "#b98c50"]
    : ["#8f6234", "#9b6c3b", "#a8784a", "#7d5229"];
  const junta = clara ? "#8f6a3a" : "#5e3d1d";
  return crearMosaicoPixel(
    scene,
    `texPxMadera_${clara ? "clara" : "osc"}_${uScale}_${vScale}`,
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      if (y % 8 === 0) return junta; // junta entre tablones
      const tablon = Math.floor(y / 8);
      const desfase = hash2D(tablon, 0, 9);
      // Veta vertical: columnas con tono propio
      const veta = hash2D(Math.floor(x / 2) + Math.floor(desfase * 8), tablon, 17);
      if (rnd > 0.96) return paleta[3];
      return elegir(paleta, veta * 0.7 + rnd * 0.3);
    },
    clara ? 51 : 59
  );
}

/** Tejado de teja de barro: filas escalonadas, naranja cálido */
export function crearTexTejaPixel(scene: Scene, uScale = 4, vScale = 3): DynamicTexture {
  const paleta = ["#c4552d", "#cf6035", "#d96c3d", "#e07a49"];
  return crearMosaicoPixel(
    scene,
    "texPxTeja",
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      const fila = Math.floor(y / 8);
      const px = (x + (fila % 2) * 4) % 8;
      if (y % 8 === 7) return "#8f3a1e"; // sombra bajo la hilera
      if (px === 0) return "#a8431f";
      return elegir(paleta, ruido(x, y, 73) * 0.8 + rnd * 0.2);
    },
    73
  );
}

/** Piedra / adobe empedrado: bloques limpios con borde claro arriba y sombra abajo */
export function crearTexPiedraPixel(scene: Scene, uScale = 2, vScale = 2): DynamicTexture {
  const paleta = ["#8a8d94", "#94979e", "#9ea1a8", "#7d8087"];
  return crearMosaicoPixel(
    scene,
    `texPxPiedra_${uScale}_${vScale}`,
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      const fila = Math.floor(y / 8);
      const off = (fila % 2) * 8;
      const xc = (x + off) % 16;
      if (y % 8 === 0 || xc === 0) return "#5f6269"; // mortero
      if (y % 8 === 1 || xc === 1) return "#b4b7bd"; // bisel de luz
      if (rnd > 0.965) return "#7fae5a"; // pizca de musgo
      return elegir(paleta, ruido(x, y, 89));
    },
    89
  );
}

/** Agua clara con destellos */
export function crearTexAguaPixel(scene: Scene, uScale = 3, vScale = 1): DynamicTexture {
  const paleta = ["#2f8fd0", "#3a9ddc", "#48aae6", "#5bb8ee"];
  return crearMosaicoPixel(
    scene,
    "texPxAgua",
    TAM,
    uScale,
    vScale,
    (x, y, rnd) => {
      if ((x + y * 3) % 13 === 0 && rnd > 0.4) return "#d7f0ff";
      return elegir(paleta, ruido(x, y, 101));
    },
    101
  );
}

/** Follaje: hojas verdes con motitas de flor de cerezo */
export function crearTexFollajePixel(scene: Scene): DynamicTexture {
  const paleta = ["#2f7d32", "#3a8c3a", "#47a043", "#58b34f"];
  return crearMosaicoPixel(
    scene,
    "texPxFollaje",
    TAM,
    1,
    1,
    (x, y, rnd) => {
      if (rnd > 0.955) return "#f9b4d2";
      if (rnd > 0.945) return "#fde2ee";
      return elegir(paleta, ruido(x, y, 131));
    },
    131
  );
}

/** Grano pixelado neutro (blanco/gris claro) para teñir dinámicamente sin oscurecer el color */
export function crearTexRuidoSueloPixel(scene: Scene): DynamicTexture {
  return crearMosaicoPixel(
    scene,
    "texPxRuidoSuelo",
    TAM,
    1,
    1,
    (x, y) => {
      const v = ruido(x, y, 149);
      return v > 0.7 ? "#ffffff" : v > 0.4 ? "#f1f1f1" : "#e2e2e2";
    },
    149
  );
}

const cacheBloques = new Map<string, DynamicTexture>();

/**
 * Textura pixelada genérica para cualquier color plano: así TODAS las superficies
 * comparten el mismo lenguaje visual (ruido suave de 32 px) en lugar de colores lisos.
 */
export function crearTexBloqueColor(scene: Scene, hexBase: string, variacion = 0.10): DynamicTexture {
  const clave = `${hexBase}_${variacion}`;
  const previa = cacheBloques.get(clave);
  if (previa) return previa;
  const c = Color3.FromHexString(hexBase);
  const tex = crearMosaicoPixel(
    scene,
    `texPxBloque_${clave}`,
    TAM,
    1,
    1,
    (x, y) => {
      const k = 1 + (ruido(x, y, 211) - 0.5) * 2 * variacion;
      const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * k)));
      return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
    },
    211
  );
  cacheBloques.set(clave, tex);
  return tex;
}

/** Material estilo bloque (textura de ruido tintada + sin brillo especular). */
export function crearMaterialBloque(scene: Scene, nombre: string, hex: string, emisivo = 0.2): StandardMaterial {
  const m = new StandardMaterial(nombre, scene);
  m.diffuseTexture = crearTexBloqueColor(scene, hex);
  m.specularColor = Color3.Black();
  if (emisivo > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emisivo);
  return m;
}

/**
 * Crea rápidamente un StandardMaterial pixel-art opaco (specular mínimo para lectura clara).
 */
export function crearMaterialPixelTex(
  scene: Scene,
  nombre: string,
  tex: DynamicTexture,
  emissive = "#000000",
  emissiveScale = 0
): StandardMaterial {
  const m = new StandardMaterial(nombre, scene);
  m.diffuseTexture = tex;
  m.specularColor = new Color3(0.03, 0.03, 0.03);
  if (emissiveScale > 0) {
    m.emissiveColor = Color3.FromHexString(emissive).scale(emissiveScale);
  }
  return m;
}

/**
 * Dibuja un marco pixelado biselado (100% fillRect, seguro en NullEngine) sobre cualquier DynamicTexture de letrero.
 */
export function dibujarMarcoLetreroPixel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fondo: string,
  bordeExt = "#1e293b",
  bordeLuz = "#fbbf24",
  grosor = 4
): void {
  ctx.fillStyle = bordeExt;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bordeLuz;
  ctx.fillRect(grosor, grosor, w - grosor * 2, h - grosor * 2);
  ctx.fillStyle = fondo;
  ctx.fillRect(grosor * 2, grosor * 2, w - grosor * 4, h - grosor * 4);
}
