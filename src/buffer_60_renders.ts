/**
 * Pipeline de Interpolación y Búfer de 60 Renders / Estados (v3.0)
 *
 * Estandariza la evolución ontogénica, biomecánica y ambiental del maíz en
 * 60 estados precalculados y continuos (Frames 0 a 59), permitiendo una
 * fluidez de 60 FPS estables sin reconstrucción de mallas (sin GC spikes).
 */

import { Vector3, Animation, Color3 } from "@babylonjs/core";
import { TipoSemilla, VARIEDADES_MAIZ, Etapa, CFG } from "./nucleo";

export const TOTAL_FRAMES_60 = 60;

/** Estado morfológico completo interpolado de una planta en un frame [0..59] */
export interface EstadoMorph60 {
  frame: number;                // 0.0 a 59.0 (con fracción sub-frame)
  frameEntero: number;          // 0 a 59
  gdd: number;                  // GDD acumulados
  etapaNombre: string;          // VE, V4, VT, R3, etc.
  etapaCodigo: Etapa;
  
  // Altura y grosor del tallo
  alturaM: number;              // Altura física en metros
  escalaY: number;              // Multiplicador de escala Y del tallo
  grosorTallo: number;          // Radio de caña en metros
  numEntrenudos: number;        // Cantidad de nudos visibles (1 a 14)
  
  // Follaje
  numHojas: number;             // Hojas activas (0 a 16)
  largoHojaMax: number;         // Longitud de hoja principal en metros
  curvaturaHoja: number;        // Factor de caída por gravedad / turgencia
  curlSequia: number;           // Enrollamiento en cartucho (0..1)
  
  // Inflorescencia masculina (Espiga / Panoja)
  espigaVisible: boolean;
  espigaApertura: number;       // 0 (cerrada en vaina) a 1 (11 ramas abiertas con polen)
  
  // Órgano reproductivo femenino (Mazorca / Elote)
  eloteVisible: boolean;
  eloteEscala: number;          // 0 (jilote incipiente) a 1 (mazorca llena R3-R6)
  totomoxtleAbre: number;       // 0 (cerrado) a 1 (abierto exponiendo granos)
  granoLlenado: number;         // 0 (acuoso) a 1 (granos firmes dorados)
  estigmasColor: Color3;        // Filamentos frescos (rubio/dorado) a secos (café)
  
  // Anclaje radicular
  raicesZancoVisibles: boolean;
  raicesZancoEscala: number;    // Contrafuertes de sujeción
  
  // Colorimetría
  colorCaña: Color3;
  colorHoja: Color3;
  colorGrano: Color3;
}

/** Estado de deformación y textura del suelo en el surco (60 estados) */
export interface EstadoSueloSurco60 {
  frameArado: number;           // 0 a 59
  rugosidad: number;            // 0.0 (compacto) a 1.0 (arado esponjoso)
  profundidadSurco: number;     // Metros de hendidura de siembra
  colorTierra: Color3;          // De ocre claro seco a café oscuro fértil
  laminillaAgua: number;        // 0 a 1 (espejo de agua por encharcamiento)
}

// ---------------------------------------------------------------------------
// Tablas de Consulta Precalculadas (Look-Up Tables: LUTs de 60 elementos)
// ---------------------------------------------------------------------------

export const LUT_ALTURA_NORMA = new Float32Array(TOTAL_FRAMES_60);
export const LUT_HOJAS_COUNT = new Int32Array(TOTAL_FRAMES_60);
export const LUT_ESPIGA_APERTURA = new Float32Array(TOTAL_FRAMES_60);
export const LUT_ELOTE_ESCALA = new Float32Array(TOTAL_FRAMES_60);
export const LUT_TOTOMOX_ABRE = new Float32Array(TOTAL_FRAMES_60);
export const LUT_RAICES_ZANCO = new Float32Array(TOTAL_FRAMES_60);
export const LUT_HOJA_CURL = new Float32Array(TOTAL_FRAMES_60);

// Inicialización matemática de las LUTs de 60 estados
(() => {
  for (let i = 0; i < TOTAL_FRAMES_60; i++) {
    const t = i / (TOTAL_FRAMES_60 - 1); // 0.0 a 1.0
    
    // Curva sigmoide asimétrica biológica para altura (lenta al inicio, exponencial en V6-VT, plateau en floración)
    const sigmoide = 1.0 / (1.0 + Math.exp(-9.0 * (t - 0.45)));
    LUT_ALTURA_NORMA[i] = Math.max(0.06, sigmoide);

    // Hojas: emergen de 0 hasta 16 hojas progresivas en los primeros 38 frames
    if (i < 6) {
      LUT_HOJAS_COUNT[i] = Math.floor(i / 3); // 0 a 2 hojas (VE-V1)
    } else if (i < 38) {
      LUT_HOJAS_COUNT[i] = Math.min(16, Math.floor(2 + ((i - 6) / 32) * 14));
    } else {
      LUT_HOJAS_COUNT[i] = 16;
    }

    // Espiga: emerge en frame 31 (VT), abre completamente en frame 38
    if (i < 31) {
      LUT_ESPIGA_APERTURA[i] = 0.0;
    } else if (i <= 38) {
      LUT_ESPIGA_APERTURA[i] = (i - 31) / 7.0;
    } else {
      LUT_ESPIGA_APERTURA[i] = 1.0;
    }

    // Elote: visible a partir del frame 34 (V12-VT), crece hasta frame 48 (R3)
    if (i < 34) {
      LUT_ELOTE_ESCALA[i] = 0.0;
      LUT_TOTOMOX_ABRE[i] = 0.0;
    } else if (i <= 48) {
      LUT_ELOTE_ESCALA[i] = (i - 34) / 14.0;
      LUT_TOTOMOX_ABRE[i] = Math.max(0.0, (i - 40) / 10.0) * 0.75; // Se entreabre en R2-R3
    } else {
      LUT_ELOTE_ESCALA[i] = 1.0;
      LUT_TOTOMOX_ABRE[i] = Math.min(1.0, 0.75 + ((i - 48) / 11.0) * 0.25);
    }

    // Raíces zanco: emergen a partir del frame 24 (V8) y crecen hasta frame 36
    if (i < 24) {
      LUT_RAICES_ZANCO[i] = 0.0;
    } else if (i <= 36) {
      LUT_RAICES_ZANCO[i] = (i - 24) / 12.0;
    } else {
      LUT_RAICES_ZANCO[i] = 1.0;
    }

    // Curvatura natural de las hojas con la gravedad
    LUT_HOJA_CURL[i] = 0.25 + 0.55 * Math.sin(t * Math.PI * 0.5);
  }
})();

/**
 * Mapea GDD acumulados al frame continuo [0.0 .. 59.0]
 */
export function gddAFrame60(gdd: number, gddCiclo: number = CFG.gddR6): number {
  const norm = Math.max(0.0, Math.min(1.0, gdd / gddCiclo));
  return norm * (TOTAL_FRAMES_60 - 1);
}

/**
 * Obtiene el estado morfológico interpolado para cualquier frame continuo [0.0..59.0]
 */
export function obtenerEstadoMorph60(
  frameFloat: number,
  variedadTipo: TipoSemilla = 'chalqueno',
  estresHidrico: number = 0.0,
  estresFrio: number = 0.0
): EstadoMorph60 {
  const fClamped = Math.max(0.0, Math.min(TOTAL_FRAMES_60 - 1, frameFloat));
  const f0 = Math.floor(fClamped);
  const f1 = Math.min(TOTAL_FRAMES_60 - 1, f0 + 1);
  const frac = fClamped - f0;

  const variedad = VARIEDADES_MAIZ[variedadTipo];

  // Interpolación de altura
  const altNorm0 = LUT_ALTURA_NORMA[f0];
  const altNorm1 = LUT_ALTURA_NORMA[f1];
  const altNorm = altNorm0 + (altNorm1 - altNorm0) * frac;
  const alturaM = 0.20 + (variedad.alturaMetrosMax - 0.20) * altNorm;

  // Hojas
  const numHojas = LUT_HOJAS_COUNT[f0];
  const curvaturaHoja = LUT_HOJA_CURL[f0] * (1.0 - 0.4 * estresHidrico);
  const curlSequia = Math.min(1.0, estresHidrico * 1.25);

  // Espiga y Elote
  const espigaApertura = LUT_ESPIGA_APERTURA[f0] + (LUT_ESPIGA_APERTURA[f1] - LUT_ESPIGA_APERTURA[f0]) * frac;
  const eloteEscala = LUT_ELOTE_ESCALA[f0] + (LUT_ELOTE_ESCALA[f1] - LUT_ELOTE_ESCALA[f0]) * frac;
  const totomoxtleAbre = LUT_TOTOMOX_ABRE[f0] + (LUT_TOTOMOX_ABRE[f1] - LUT_TOTOMOX_ABRE[f0]) * frac;
  const raicesZanco = LUT_RAICES_ZANCO[f0] + (LUT_RAICES_ZANCO[f1] - LUT_RAICES_ZANCO[f0]) * frac;

  // Etiqueta de etapa
  let etapaNombre = "SEMILLA";
  let etapaCodigo = Etapa.SEMILLA;
  if (f0 >= 55) { etapaNombre = "R6 (Madurez / Semilla Seca)"; etapaCodigo = Etapa.R6; }
  else if (f0 >= 50) { etapaNombre = "R5 (Dentado)"; etapaCodigo = Etapa.R5; }
  else if (f0 >= 46) { etapaNombre = "R4 (Pastoso)"; etapaCodigo = Etapa.R4; }
  else if (f0 >= 42) { etapaNombre = "R3 (Leche / ELOTE FRESCO)"; etapaCodigo = Etapa.R3; }
  else if (f0 >= 38) { etapaNombre = "R2 (Ampolla)"; etapaCodigo = Etapa.R2; }
  else if (f0 >= 35) { etapaNombre = "R1 (Jilote / Cabellos)"; etapaCodigo = Etapa.R1; }
  else if (f0 >= 31) { etapaNombre = "VT (Espiga Masculina)"; etapaCodigo = Etapa.VT; }
  else if (f0 >= 26) { etapaNombre = "V12 (Definición Mazorca)"; etapaCodigo = Etapa.V12; }
  else if (f0 >= 20) { etapaNombre = "V8 (Raíces Zanco)"; etapaCodigo = Etapa.V8; }
  else if (f0 >= 14) { etapaNombre = "V6 (Elongación Rápida)"; etapaCodigo = Etapa.V6; }
  else if (f0 >= 8) { etapaNombre = "V4 (Plántula Establecida)"; etapaCodigo = Etapa.V4; }
  else if (f0 >= 4) { etapaNombre = "V2 (Primeras 2 Hojas)"; etapaCodigo = Etapa.V2; }
  else if (f0 >= 1) { etapaNombre = "VE (Emergencia de Coleóptilo)"; etapaCodigo = Etapa.VE; }

  // Colorimetría Toon
  const colorCañaBase = Color3.FromHexString("#76c827");
  const colorHojaBase = Color3.FromHexString(f0 >= 50 ? "#c09337" : "#5dae26");
  const colorGranoBase = Color3.FromHexString(variedad.colorHex);

  return {
    frame: fClamped,
    frameEntero: f0,
    gdd: (fClamped / 59.0) * variedad.gddCicloCompleto,
    etapaNombre,
    etapaCodigo,
    alturaM,
    escalaY: altNorm,
    grosorTallo: 0.02 + 0.038 * altNorm,
    numEntrenudos: Math.min(14, Math.floor(1 + altNorm * 13)),
    numHojas,
    largoHojaMax: 0.25 + 0.70 * altNorm,
    curvaturaHoja,
    curlSequia,
    espigaVisible: f0 >= 30,
    espigaApertura,
    eloteVisible: f0 >= 34,
    eloteEscala,
    totomoxtleAbre,
    granoLlenado: Math.min(1.0, eloteEscala * 1.1),
    estigmasColor: f0 >= 45 ? Color3.FromHexString("#78350f") : Color3.FromHexString("#fbbf24"),
    raicesZancoVisibles: f0 >= 22,
    raicesZancoEscala: raicesZanco,
    colorCaña: colorCañaBase,
    colorHoja: colorHojaBase,
    colorGrano: colorGranoBase
  };
}

/**
 * Obtiene el estado de 60 renders del suelo para un nodo del surco
 */
export function obtenerEstadoSuelo60(
  labranzaPct: number,    // 0..100%
  humedadVWC: number,     // 0..60%
  encharcamiento: boolean
): EstadoSueloSurco60 {
  const normArado = Math.max(0.0, Math.min(1.0, labranzaPct / 100.0));
  const frameArado = Math.floor(normArado * (TOTAL_FRAMES_60 - 1));

  // Colorimetría del suelo según hidratación
  const seco = Color3.FromHexString("#c28e53");
  const humedo = Color3.FromHexString("#58361b");
  const factorHumedad = Math.min(1.0, Math.max(0.0, (humedadVWC - 8.0) / 30.0));
  const colorTierra = Color3.Lerp(seco, humedo, factorHumedad);

  return {
    frameArado,
    rugosidad: normArado,
    profundidadSurco: 0.04 * normArado,
    colorTierra,
    laminillaAgua: encharcamiento ? Math.min(1.0, (humedadVWC - 38.0) / 12.0) : 0.0
  };
}

/**
 * Creador estandarizado de animaciones con 60 keyframes exactos a 60 FPS
 */
export function crearAnimacion60Frames(
  nombre: string,
  propiedad: string,
  tipoAnimacion: number,
  generadorClaves: (t: number) => any
): Animation {
  const anim = new Animation(
    `anim60_${nombre}`,
    propiedad,
    60, // 60 Hz / FPS
    tipoAnimacion,
    Animation.ANIMATIONLOOPMODE_CONSTANT
  );

  const keys: { frame: number; value: any }[] = [];
  for (let f = 0; f < TOTAL_FRAMES_60; f++) {
    const t = f / (TOTAL_FRAMES_60 - 1);
    keys.push({ frame: f, value: generadorClaves(t) });
  }
  anim.setKeys(keys);
  return anim;
}
