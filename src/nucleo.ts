/**
 * Núcleo desacoplado de simulación agrofisiológica para Zea mays L. (raza Chalqueño).
 *
 * Módulo puro: SIN dependencias de Babylon.js ni del DOM.
 * Modela termodinámica del aire, radiación solar, fotosíntesis C4, fenología guiada por GDD,
 * reglas de germinación, letalidad acumulativa por factor, reversibilidad de marchitez
 * y dinámica del fruto (elote/mazorca).
 */

// ---------------------------------------------------------------------------
// 1. Constantes globales y configuración agrofisiológica (CFG)
// ---------------------------------------------------------------------------

export const CFG = {
  // Presión atmosférica nativa (Valles Altos de México: 1,800–2,700 m s. n. m.)
  presionBase: 780.0,            // hPa (≈ 2,240 m s. n. m. en Mesa Central)
  presionMin: 700.0,             // hPa (≈ 3,000 m s. n. m.)
  presionMax: 1050.0,            // hPa (nivel del mar y altas presiones)

  // Termodinámica de Magnus y psicrometría unificada (FAO-56)
  magnusC1: 17.27,
  magnusC2: 237.3,
  constantePsicrometricaFactor: 0.000665, // γ = 0.000665 * (P / 10) kPa/°C

  // Parámetros térmicos del Maíz Chalqueño
  tBase: 8.0,                    // °C temperatura base de desarrollo (adaptación a frío de altura)
  tCorteSuperior: 32.0,          // °C techo térmico fisiológico para GDD
  deltaTermicaDiurnaDefecto: 12.0, // °C amplitud diurna si solo se provee T media

  // Umbrales de fenología térmica en GDD acumulados (base 8 °C)
  gddEmergencia: 80.0,           // GDD siembra -> emergencia VE
  gddVE: 0.0,                    // VE (Emergencia)
  gddV2: 90.0,                   // V2 (2ª hoja desplegada con lígula visible)
  gddV4: 210.0,                  // V4 (Plántula establecida)
  gddV6: 360.0,                  // V6 (Punto de crecimiento emerge sobre el suelo)
  gddV8: 540.0,                  // V8 (Elongación rápida de caña, susceptible a acame)
  gddV12: 760.0,                 // V12 (Diferenciación de mazorca y número de óvulos)
  gddVT: 1020.0,                 // VT (Antesis / Panoja masculina abierta y emitiendo polen)
  gddR1: 1080.0,                 // R1 (Silking / Estigmas femeninos emergen del jilote)
  gddR2: 1260.0,                 // R2 (Ampolla / Blister: granos con fluido claro)
  gddR3: 1380.0,                 // R3 (Leche / Milk: ELOTE apto para cosecha en fresco)
  gddR4: 1470.0,                 // R4 (Pastoso / Dough: consistencia de masa de almidón)
  gddR5: 1620.0,                 // R5 (Dentado / Dent: formación de hendidura en corona)
  gddR6: 1880.0,                 // R6 (Madurez fisiológica / Capa negra)

  // Características hidrofísicas del suelo franco típico de Valles Altos
  pmp: 12.0,                     // % VWC Punto de marchitez permanente (PMP)
  cc: 32.0,                      // % VWC Capacidad de campo (CC)
  saturacion: 45.0,              // % VWC Humedad de saturación
  umbralEncharcamiento: 38.0,    // % VWC Inicio de restricción de oxígeno
  umbralEncharcamientoSevero: 52.0, // % VWC Hipoxia radicular crítica

  // Letalidad, germinación y estreses
  acameLetal: false,             // Si true, acame = MUERTA; si false, acame = ACAMADA (planta viva a 55°)
  diasSueloFrioMax: 21,          // Días en suelo < 10 °C para pudrición de semilla
  diasSueloSaturadoMax: 3,       // Días en suelo > 45 % VWC y T > 15 °C para anoxia de semilla
  diasSemillaSecaMax: 21,        // Días en suelo <= PMP para desecación de semilla
  diasSequiaExtremaMax: 5.5,     // Días acumulados en sequía extrema (E_suelo >= 0.9)
  diasCalorExtremoMax: 4.5,      // Días consecutivos con T_max > 40 °C
  tempCalorLetalInstantaneo: 45.0, // °C de golpe de calor que causa muerte inmediata
  tempHeladaSevera: -2.5,        // °C temperatura crítica de congelación de tejidos
  horasHeladaSeveraLetal: 2.0,   // Horas bajo -2.5 °C para causar daño severo o letal
  asiBaseDias: 2.0,              // Días de ASI base en condiciones óptimas
  asiFactorEstres: 6.0,          // Incremento de ASI por unidad de estrés en floración
  cuajadoSensibilidad: 1.3,      // Pendiente de caída de cuajado con estrés en floración

  // Fotosíntesis C4 (Zea mays L.)
  aMax0: 42.0,                   // µmol CO2 / m² / s (asimilación potencial máxima C4)
  kPAR: 300.0,                   // µmol fotones / m² / s (saturación fotosintética de luz C4)
  kCO2: 40.0,                    // ppm (baja sensibilidad de carboxilación C4 a CO2 ambiente)
  tOptimaFotosintesis: 27.0,     // °C centro de la curva gaussiana fotosintética
  tSigmaFotosintesis: 9.5,       // Dispersión gaussiana de temperatura
  respiracionBase: 1.2,          // µmol CO2 / m² / s a 25 °C
  q10Respiracion: 2.0            // Coeficiente térmico de respiración
};

/** Reglas unificadas de jugabilidad y umbrales 6DoF (v4.0 Milpa Viva VR) */
export const REGLAS_JUEGO = {
  DIAS_COSECHA_MIN: 145,       // elote tierno (R3)
  DIAS_MADUREZ: 163,           // madurez fisiológica para semilla
  UMBRAL_AZADA_MS: 1.2,        // m/s mínimos de golpe de azada
  RADIO_INTERACCION_M: 0.55    // distancia mano–planta para actuar
} as const;

// ---------------------------------------------------------------------------
// 2. Tipos y modelos de datos
// ---------------------------------------------------------------------------

export enum Etapa {
  SEMILLA = 0,
  VE = 1,
  V2 = 2,
  V4 = 3,
  V6 = 4,
  V8 = 5,
  V12 = 6,
  VT = 7,
  R1 = 8,
  R2 = 9,
  R3 = 10,
  R4 = 11,
  R5 = 12,
  R6 = 13
}

export type EstadoPlanta = 'SEMILLA' | 'VIVA' | 'ACAMADA' | 'MADURA' | 'MUERTA';

export type TipoSemilla = 'chalqueno' | 'azul' | 'rojo' | 'palomero';
export type CultivoAsociado = 'ninguno' | 'frijol' | 'calabaza';

export interface VariedadMaizConfig {
  tipo: TipoSemilla;
  nombre: string;
  especieBotanica: string;
  origenBiogeografico: string;
  subtitulo: string;
  colorHex: string;
  colorBracteasHex: string;
  colorSecoHex: string;
  alturaMetrosMax: number;
  tBase: number;
  tCorte: number;
  tempOptimaMin: number;
  tempOptimaMax: number;
  vwcOptimoMin: number;
  vwcOptimoMax: number;
  phOptimoMin: number;
  phOptimoMax: number;
  gddCicloCompleto: number;
  pmp: number; // % VWC
  cc: number;
  resistenciaFrio: number; // 0..1
  resistenciaSequia: number; // 0..1
  resistenciaViento: number; // 0..1
  resistenciaEncharcamiento: number; // 0..1
  mazorcasTipicas: number; // 1 a 3
  condicionesFavorables: string;
  queLePerjudica: string;
  descripcionPedagogica: string;
}

export const VARIEDADES_MAIZ: Record<TipoSemilla, VariedadMaizConfig> = {
  chalqueno: {
    tipo: 'chalqueno',
    nombre: 'Maíz Chalqueño',
    especieBotanica: 'Zea mays L. subsp. mays (Raza Chalqueño)',
    origenBiogeografico: 'Valles Altos Centrales de México (1,800–2,600 m s.n.m.)',
    subtitulo: 'Raza monumental de Valles Altos (Grano Dentado Amarillo-Cremoso)',
    colorHex: '#eab308',
    colorBracteasHex: '#65a30d',
    colorSecoHex: '#ca8a04',
    alturaMetrosMax: 3.50,
    tBase: 8.0,
    tCorte: 32.0,
    tempOptimaMin: 18.0,
    tempOptimaMax: 26.0,
    vwcOptimoMin: 24.0,
    vwcOptimoMax: 34.0,
    phOptimoMin: 6.0,
    phOptimoMax: 7.2,
    gddCicloCompleto: 2050.0,
    pmp: 12.0,
    cc: 32.0,
    resistenciaFrio: 0.60,
    resistenciaSequia: 0.50,
    resistenciaViento: 0.40, // Gran porte (3.50 m) -> susceptible a acame con viento fuerte
    resistenciaEncharcamiento: 0.50,
    mazorcasTipicas: 1,
    condicionesFavorables: 'Clima templado subhúmedo (18–26 °C), buena humedad constante (24–34% VWC) y suelos profundos ricos en Nitrógeno (NPK ≥ 55%, asociación con Frijol).',
    queLePerjudica: 'Vientos fuertes (> 11 m/s provocan acame severo por su altura de 3.5 m si no tiene Tutor [T]), sequía (< 15% VWC) y suelos pobres en nutrientes (NPK < 35%).',
    descripcionPedagogica: 'Zea mays subsp. mays raza Chalqueño: caña monumental de hasta 3.5 m y mazorca cónica-cilíndrica de alto rendimiento. Exige suelo fértil y aporque/tutor contra el viento.'
  },
  azul: {
    tipo: 'azul',
    nombre: 'Maíz Azul (Cónico)',
    especieBotanica: 'Zea mays L. subsp. mays (Raza Cónico Azul)',
    origenBiogeografico: 'Alta Montaña del Eje Neovolcánico (2,200–3,000 m s.n.m.)',
    subtitulo: 'Raza de alta montaña rica en antocianinas antioxidantes',
    colorHex: '#312e81',
    colorBracteasHex: '#4d7c0f',
    colorSecoHex: '#1e1b4b',
    alturaMetrosMax: 2.60,
    tBase: 6.0, // Muy adaptado al frío de montaña
    tCorte: 29.0,
    tempOptimaMin: 12.0,
    tempOptimaMax: 22.0,
    vwcOptimoMin: 20.0,
    vwcOptimoMax: 32.0,
    phOptimoMin: 5.5,
    phOptimoMax: 6.8,
    gddCicloCompleto: 1650.0, // Ciclo más corto adaptado a heladas tempranas
    pmp: 11.0,
    cc: 30.0,
    resistenciaFrio: 0.95, // Altísima resistencia a helada (-5.2 °C)
    resistenciaSequia: 0.55,
    resistenciaViento: 0.70,
    resistenciaEncharcamiento: 0.60,
    mazorcasTipicas: 1,
    condicionesFavorables: 'Clima frío a fresco de montaña (12–22 °C), humedad moderada (20–32% VWC) y suelos volcánicos ligeramente ácidos (pH 5.5–6.8). Resiste heladas hasta -5 °C.',
    queLePerjudica: 'Calor excesivo (> 28 °C deshidrata la planta y esteriliza su polen en floración), sequía atmosférica (HR < 35%) y suelos alcalinos (pH > 7.5).',
    descripcionPedagogica: 'Zea mays subsp. mays raza Cónico Azul: rico en antocianinas que protegen sus tejidos del frío de alta montaña y radiación UV, pero sufre con el calor intenso.'
  },
  rojo: {
    tipo: 'rojo',
    nombre: 'Maíz Rojo (Sangre de Cristo)',
    especieBotanica: 'Zea mays L. subsp. mays (Raza Cónico Norteño / Celaya)',
    origenBiogeografico: 'Semidesierto y Bajío Seco Mexicano (1,200–2,100 m s.n.m.)',
    subtitulo: 'Raza de secano profundo con raíces adaptadas a la aridez',
    colorHex: '#991b1b',
    colorBracteasHex: '#4d7c0f',
    colorSecoHex: '#7f1d1d',
    alturaMetrosMax: 2.80,
    tBase: 9.0,
    tCorte: 35.0,
    tempOptimaMin: 22.0,
    tempOptimaMax: 34.0,
    vwcOptimoMin: 12.0,
    vwcOptimoMax: 26.0,
    phOptimoMin: 6.2,
    phOptimoMax: 7.8,
    gddCicloCompleto: 1850.0,
    pmp: 8.5, // Resiste suelos muy secos antes de marchitar
    cc: 28.0,
    resistenciaFrio: 0.40,
    resistenciaSequia: 0.95, // Gran campeona en sequía
    resistenciaViento: 0.65,
    resistenciaEncharcamiento: 0.25, // Se pudre rápido si se inunda
    mazorcasTipicas: 1,
    condicionesFavorables: 'Clima cálido y soleado (22–34 °C), suelos bien drenados con humedad baja a moderada (12–26% VWC, PMP de solo 8.5%). Tolera canículas y sequías.',
    queLePerjudica: 'Exceso de riego y encharcamiento (> 34% VWC provoca asfixia y pudrición radicular rápida) y frío o heladas (< 8 °C detiene su crecimiento; muere a -1.5 °C).',
    descripcionPedagogica: 'Zea mays subsp. mays raza Cónico Norteño «Sangre de Cristo»: campeona en tierras áridas y cálidas, pero muy vulnerable al exceso de agua y a las heladas.'
  },
  palomero: {
    tipo: 'palomero',
    nombre: 'Maíz Palomero Toluqueño',
    especieBotanica: 'Zea mays L. subsp. everta (Raza Palomero Toluqueño)',
    origenBiogeografico: 'Valle de Toluca y Altiplano Mexiquense (2,400–2,850 m s.n.m.)',
    subtitulo: 'Subespecie ancestral reventadora de porte bajo y doble raíz zanco',
    colorHex: '#d97706',
    colorBracteasHex: '#65a30d',
    colorSecoHex: '#b45309',
    alturaMetrosMax: 2.10,
    tBase: 7.5,
    tCorte: 30.5,
    tempOptimaMin: 14.0,
    tempOptimaMax: 24.0,
    vwcOptimoMin: 22.0,
    vwcOptimoMax: 34.0,
    phOptimoMin: 5.6,
    phOptimoMax: 7.0,
    gddCicloCompleto: 1520.0,
    pmp: 10.5,
    cc: 30.0,
    resistenciaFrio: 0.72,
    resistenciaSequia: 0.60,
    resistenciaViento: 0.96, // Porte bajo y anclaje doble -> casi inmune al acame
    resistenciaEncharcamiento: 0.65,
    mazorcasTipicas: 2,
    condicionesFavorables: 'Clima templado-frío y ventoso de altiplano (14–24 °C), humedad constante en emergencia (22–34% VWC) y parcela limpia de maleza. Ciclo rápido y resistente a vendavales.',
    queLePerjudica: 'Competencia por maleza (> 25% de maleza lo ahoga por su porte bajo de 2.1 m), olas de calor (> 30 °C) y sobremaduración en campo post-R6.',
    descripcionPedagogica: 'Zea mays subsp. everta raza Palomero Toluqueño: grano cristalino reventador, porte bajo (2.1 m) con raíces zanco dobles contra el viento. Requiere deshierbe oportuno.'
  }
};

export interface CultivoAsociadoEfecto {
  tipo: CultivoAsociado;
  nombre: string;
  icono: string;
  beneficioNitrogenoDia: number; // e.g. +1.5% N por día (Frijol)
  factorEvaporacionSuelo: number; // e.g. 0.65 (Calabaza - mulch vivo)
  descripcion: string;
}

export const CULTIVOS_ASOCIADOS: Record<CultivoAsociado, CultivoAsociadoEfecto> = {
  ninguno: {
    tipo: 'ninguno',
    nombre: 'Solo Maíz',
    icono: '🌽',
    beneficioNitrogenoDia: 0,
    factorEvaporacionSuelo: 1.0,
    descripcion: 'Monocultivo tradicional sin plantas acompañantes.'
  },
  frijol: {
    tipo: 'frijol',
    nombre: 'Frijol Enredador',
    icono: '🫘',
    beneficioNitrogenoDia: 1.5,
    factorEvaporacionSuelo: 0.95,
    descripcion: 'Trepa por la caña y fija nitrógeno natural (+1.5% N/día) para enriquecer el suelo.'
  },
  calabaza: {
    tipo: 'calabaza',
    nombre: 'Calabaza Rastrera',
    icono: '🎃',
    beneficioNitrogenoDia: 0,
    factorEvaporacionSuelo: 0.65, // Reduce evaporación 35%
    descripcion: 'Hojas anchas que cubren el suelo como mulch vivo, conservando 35% más de humedad.'
  }
};

export type Causa =
  | 'helada'
  | 'calor'
  | 'sequia'
  | 'encharcamiento'
  | 'acame'
  | 'pudricion_semilla'
  | 'agotamiento';

export interface ClimaDia {
  tMax: number;                  // °C
  tMin: number;                  // °C
  tMed: number;                  // °C
  tSuelo: number;                // °C
  hr: number;                    // %
  vwc: number;                   // % VWC
  ph: number;                    // escala pH
  viento: number;                // m/s
  lluvia: number;                // mm/h o mm acumulados
  co2: number;                   // ppm
  presion: number;               // hPa
  horasBajoMenos2_5: number;     // Horas en el día con T <= -2.5 °C
  nubosidad?: number;            // %
  pm25?: number;                 // µg/m³
  hora?: number;                 // h solar (0 a 24)
  estresBiotico?: number;        // 0..1 daño por plagas (cogollero / aves, M4)
}

export interface Estreses {
  suelo: number;                 // 0..1
  vpd: number;                   // 0..1
  hidrico: number;               // 0..1
  calor: number;                 // 0..1
  frio: number;                  // 0..1
  ench: number;                  // 0..1
  pH: number;                    // 0..1
  mec: number;                   // 0..1
  mecRaw: number;                // >= 0 (sin clamp, para umbral de acame)
  biotico?: number;              // 0..1 estrés por plaga / herbivoría (v4.0)
  globalPonderado: number;       // 0..1 (solo UI / visualización)
}

export interface RasgosHeredables {
  rVigor: number;                // 0.8..1.2
  rSequia: number;               // 0.8..1.2
  rFrio: number;                 // 0.8..1.2
  rCiclo: number;                // 0.8..1.2
  rTamano: number;               // 0.8..1.2
}

export interface Planta {
  variedad: TipoSemilla;
  cultivoAsociado: CultivoAsociado;
  rasgosHeredados?: RasgosHeredables;
  estado: EstadoPlanta;
  gddSiembra: number;            // acumulado antes de emerger
  gdd: number;                   // reloj fenológico térmico
  vigor: number;                 // 0..1 (integrador de vitalidad y biomasa)
  diasSequiaExtrema: number;     // acumulador letalidad sequía
  diasCalorExtremo: number;      // acumulador letalidad canícula
  diasEncharcado: number;        // acumulador letalidad hipoxia
  diasSueloFrio: number;         // acumulador frío en semilla
  diasSueloSaturado: number;     // acumulador saturación en semilla
  diasSemillaSeca: number;       // acumulador sequía en semilla
  estresFloracion: number[];     // estrés diario en ventana de polinización
  causaMuerte?: Causa;

  // Variables morfológicas (para renderizado estilizado y visual)
  escala: number;                // escala relativa de la planta (0.20 a 1.0)
  alturaMetros: number;          // altura equivalente en metros (0.20 a 3.50m según variedad y vigor)
  alturaTecho: number;           // límite máximo real de altura alcanzado al llegar a VT
  limiteAlcanzado: boolean;      // true cuando alcanzó su límite vegetativo y dejó de crecer en altura
  secado: number;                // 0 (verde turgente) -> 1 (planta seca / senescente o rastrojo)
  brote: number;                 // 1 (plántula inicial) -> 0 (adulta)
  muerte: number;                // 0 (viva) -> 1 (colapso necrótico)
  degradacion: number;           // 0 (viva) -> 1 (degradación post-mortem avanzada)
  diasMuerta: number;            // días transcurridos tras morir
  sequia: number;                // 0..1 (acartuchamiento y decaimiento foliar)
  frio: number;                  // 0..1 (flaccidez y contracción por helada)
  acameGrados: number;           // rotación basal de la caña (0° a 55°)
  amarillamiento: number;        // 0..1 clorosis y senescencia
  antocianina: number;           // 0..1 enrojecimiento por pH ácido / frío

  // Mazorca / Elote (Zea mays L.)
  eloteVis: number;              // 0 (sin elote) o 1 (elote visible)
  eloteCrec: number;             // 0 (jilote pequeño) -> 1 (tamaño completo)
  bracteasAbre: number;          // 0..1 (separación y apertura de totomoxtle)
  granoLlenado: number;          // 0..1 (desarrollo y volumen de granos)
  aborto: number;                // 0..1 (punta estéril / aborto apical por estrés)
  estigmaSeco: number;           // 0 (estigmas frescos amarillos) -> 1 (secos café tostado)
  bracteasSeco: number;          // 0 (hojas de mazorca verdes) -> 1 (pajizo seco)
  asiDias: number;               // Intervalo antesis-estigmas (ASI)
  cuajado: number;               // Fracción de fecundación de granos (0..1)
}

// ---------------------------------------------------------------------------
// 3. Funciones utilitarias matemáticas y termodinámicas
// ---------------------------------------------------------------------------

export const clamp01 = (v: number): number => Math.max(0.0, Math.min(1.0, v));

/** Presión de vapor de saturación (kPa) según fórmula de Tetens / Magnus */
export function presionSaturacion(t: number): number {
  return 0.6108 * Math.exp((CFG.magnusC1 * t) / (t + CFG.magnusC2));
}

/** Punto de rocío (°C) según fórmula unificada de Magnus */
export function puntoDeRocio(t: number, hr: number): number {
  const h = Math.max(0.1, Math.min(100.0, hr));
  const gamma = Math.log(h / 100.0) + (CFG.magnusC1 * t) / (CFG.magnusC2 + t);
  return (CFG.magnusC2 * gamma) / (CFG.magnusC1 - gamma);
}

/**
 * Grados Día de Desarrollo (GDD) adaptados a los umbrales térmicos de cada raza de maíz.
 */
export function gddDia(d: ClimaDia, cfg = CFG, varCfg?: VariedadMaizConfig): number {
  const tBase = varCfg ? varCfg.tBase : cfg.tBase;
  const tCorte = varCfg ? varCfg.tCorte : cfg.tCorteSuperior;
  const tMaxEff = Math.min(tCorte, Math.max(tBase, d.tMax));
  const tMinEff = Math.min(tCorte, Math.max(tBase, d.tMin));
  const tMedEff = (tMaxEff + tMinEff) / 2.0;
  return Math.max(0.0, tMedEff - tBase);
}

/**
 * Normaliza variables climáticas a un ClimaDia completo.
 */
export function normalizarClimaDia(
  parcial: Partial<ClimaDia> & { temperatura?: number; humedad?: number; humedadSuelo?: number; phSuelo?: number }
): ClimaDia {
  const t = parcial.tMed ?? parcial.temperatura ?? 24.0;
  const delta = CFG.deltaTermicaDiurnaDefecto;
  const tMax = parcial.tMax ?? (t + delta / 2.0);
  const tMin = parcial.tMin ?? (t - delta / 2.0);
  const hr = parcial.hr ?? parcial.humedad ?? 62.0;
  const vwc = parcial.vwc ?? parcial.humedadSuelo ?? 32.0;
  const ph = parcial.ph ?? parcial.phSuelo ?? 6.4;
  const viento = parcial.viento ?? 2.5;
  const lluvia = parcial.lluvia ?? 0.0;
  const co2 = parcial.co2 ?? 420.0;
  const presion = parcial.presion ?? CFG.presionBase;
  const horasBajoMenos2_5 = parcial.horasBajoMenos2_5 ?? (tMin <= -2.5 ? 3.0 : 0.0);

  return {
    tMax,
    tMin,
    tMed: t,
    tSuelo: parcial.tSuelo ?? t,
    hr,
    vwc,
    ph,
    viento,
    lluvia,
    co2,
    presion,
    horasBajoMenos2_5,
    nubosidad: parcial.nubosidad ?? 20.0,
    pm25: parcial.pm25 ?? 12.0,
    hora: parcial.hora ?? 13.5
  };
}

/**
 * Determina la etapa fenológica a partir de los GDD acumulados, escalando
 * proporcionalmente según el ciclo térmico de la variedad nativa (gddCicloCompleto).
 */
export function etapaDe(gdd: number, cfg = CFG, varCfg?: VariedadMaizConfig): Etapa {
  const escalaCiclo = varCfg ? varCfg.gddCicloCompleto / cfg.gddR6 : 1.0;
  const g = gdd / Math.max(0.5, escalaCiclo);
  if (g < cfg.gddV2) return Etapa.VE;
  if (g < cfg.gddV4) return Etapa.V2;
  if (g < cfg.gddV6) return Etapa.V4;
  if (g < cfg.gddV8) return Etapa.V6;
  if (g < cfg.gddV12) return Etapa.V8;
  if (g < cfg.gddVT) return Etapa.V12;
  if (g < cfg.gddR1) return Etapa.VT;
  if (g < cfg.gddR2) return Etapa.R1;
  if (g < cfg.gddR3) return Etapa.R2;
  if (g < cfg.gddR4) return Etapa.R3;
  if (g < cfg.gddR5) return Etapa.R4;
  if (g < cfg.gddR6) return Etapa.R5;
  return Etapa.R6;
}

export function nombreEtapa(etapa: Etapa): string {
  switch (etapa) {
    case Etapa.SEMILLA: return "SEMILLA (Siembra)";
    case Etapa.VE: return "VE (Emergencia)";
    case Etapa.V2: return "V2 (2ª Hoja Desplegada)";
    case Etapa.V4: return "V4 (Plántula Establecida)";
    case Etapa.V6: return "V6 (Inicio Elongación Caña)";
    case Etapa.V8: return "V8 (Crecimiento Vegetativo Rápido)";
    case Etapa.V12: return "V12 (Pre-Floración Densa)";
    case Etapa.VT: return "VT (Floración / Panoja Abierta)";
    case Etapa.R1: return "R1 (Floración Femenina / Jilote)";
    case Etapa.R2: return "R2 (Ampolla / Blister)";
    case Etapa.R3: return "R3 (Leche / ELOTE)";
    case Etapa.R4: return "R4 (Pastoso / Dough)";
    case Etapa.R5: return "R5 (Dentado / Dent)";
    case Etapa.R6: return "R6 (Madurez Fisiológica)";
    default: return "DESCONOCIDA";
  }
}

// ---------------------------------------------------------------------------
// 4. Cálculo de estreses biofísicos individuales y fotosíntesis C4
// ---------------------------------------------------------------------------

export function estreses(d: ClimaDia, p?: Planta, cfg = CFG): Estreses {
  const varCfg = p ? VARIEDADES_MAIZ[p.variedad || 'chalqueno'] : undefined;
  const pmpVar = varCfg ? varCfg.pmp : cfg.pmp;
  const ccVar = varCfg ? varCfg.cc : cfg.cc;
  const tBaseVar = varCfg ? varCfg.tBase : cfg.tBase;
  const tCorteVar = varCfg ? varCfg.tCorte : cfg.tCorteSuperior;
  const resEnch = varCfg ? varCfg.resistenciaEncharcamiento : 0.5;

  const es = presionSaturacion(d.tMed);
  const ea = (es * d.hr) / 100.0;
  const vpd = Math.max(0.0, es - ea);

  // 1. Estrés hídrico en suelo (acorde al PMP y CC de la raza de maíz)
  const umbralOptimoSuelo = Math.max(pmpVar + 6.0, ccVar * 0.82);
  let suelo = 0.0;
  if (d.vwc < umbralOptimoSuelo) {
    suelo = clamp01((umbralOptimoSuelo - d.vwc) / Math.max(4.0, umbralOptimoSuelo - pmpVar));
  }

  // 2. Estrés atmosférico por déficit de presión de vapor (VPD)
  let estresVpd = 0.0;
  if (vpd > 1.6) {
    estresVpd = clamp01((vpd - 1.6) / 2.4);
  }

  // Estrés hídrico integrado
  const hidrico = clamp01(Math.max(suelo, estresVpd * 0.7));

  // 3. Estrés térmico por calor (según techo térmico tCorte de la variedad)
  let calor = 0.0;
  if (d.tMax > tCorteVar) {
    calor = clamp01((d.tMax - tCorteVar) / Math.max(6.0, 45.0 - tCorteVar));
  }

  // 4. Estrés térmico por frío (según tBase y resistencia al frío de la variedad)
  let frio = 0.0;
  if (d.tMin < tBaseVar) {
    const pisoFrio = varCfg ? -2.0 - 4.0 * varCfg.resistenciaFrio : -4.0;
    frio = clamp01((tBaseVar - d.tMin) / Math.max(4.0, tBaseVar - pisoFrio));
  }

  // 5. Encharcamiento e hipoxia (razas sensibles como Rojo sufren antes, desde ~34% VWC)
  const umbralEnchVar = varCfg
    ? Math.min(cfg.umbralEncharcamiento, varCfg.vwcOptimoMax + 6.0 + 4.0 * resEnch)
    : cfg.umbralEncharcamiento;
  let ench = 0.0;
  if (d.vwc > umbralEnchVar) {
    ench = clamp01((d.vwc - umbralEnchVar) / Math.max(10.0, 56.0 - umbralEnchVar));
  }

  // 6. Estrés químico por pH de suelo acorde a la adaptación edáfica de cada especie
  const phMinOpt = varCfg ? varCfg.phOptimoMin : 5.8;
  const phMaxOpt = varCfg ? varCfg.phOptimoMax : 7.5;
  let pH = 0.0;
  if (d.ph < phMinOpt) {
    pH = clamp01((phMinOpt - d.ph) / Math.max(1.5, phMinOpt - 3.5));
  } else if (d.ph > phMaxOpt) {
    pH = clamp01((d.ph - phMaxOpt) / Math.max(1.2, 9.0 - phMaxOpt));
  }

  // 7. Estrés mecánico por viento
  const u2 = d.viento * 0.75;
  const mecRaw = Math.pow(u2 / 12.0, 2.0);
  const mec = clamp01(mecRaw);

  // 8. Estrés biótico por plagas (M4)
  const biotico = clamp01(d.estresBiotico ?? 0.0);

  // Ponderación global para telemetría
  const globalPonderado = clamp01(
    0.26 * hidrico +
    0.18 * calor +
    0.14 * frio +
    0.14 * ench +
    0.09 * pH +
    0.09 * mec +
    0.10 * biotico
  );

  return {
    suelo,
    vpd: estresVpd,
    hidrico,
    calor,
    frio,
    ench,
    pH,
    mec,
    mecRaw,
    biotico,
    globalPonderado
  };
}

/**
 * Fotosíntesis neta C4 (Zea mays L.)
 */
export function fotosintesisNetaC4(d: ClimaDia, par: number, estres: Estreses, cfg = CFG): number {
  if (par <= 5.0) return -cfg.respiracionBase;

  const fLuz = par / (par + cfg.kPAR);
  const fCO2 = d.co2 / (d.co2 + cfg.kCO2);
  const dt = d.tMed - cfg.tOptimaFotosintesis;
  const fTemp = Math.exp(-0.5 * Math.pow(dt / cfg.tSigmaFotosintesis, 2.0));
  const fAgua = Math.max(0.05, 1.0 - estres.hidrico);
  const aBruta = cfg.aMax0 * fLuz * fCO2 * fTemp * fAgua;

  const rSuelo = cfg.respiracionBase * Math.pow(cfg.q10Respiracion, (d.tMed - 25.0) / 10.0);
  return Math.max(-rSuelo, aBruta - rSuelo);
}

// ---------------------------------------------------------------------------
// 5. Fábrica e inicialización de planta
// ---------------------------------------------------------------------------

export function crearPlanta(variedad: TipoSemilla = 'chalqueno', cultivoAsociado: CultivoAsociado = 'ninguno'): Planta {
  return {
    variedad,
    cultivoAsociado,
    estado: 'SEMILLA',
    gddSiembra: 0.0,
    gdd: 0.0,
    vigor: 1.0,
    diasSequiaExtrema: 0.0,
    diasCalorExtremo: 0.0,
    diasEncharcado: 0.0,
    diasSueloFrio: 0.0,
    diasSueloSaturado: 0.0,
    diasSemillaSeca: 0.0,
    estresFloracion: [],
    causaMuerte: undefined,

    escala: 0.28,
    alturaMetros: 0.28,
    alturaTecho: 0.28,
    limiteAlcanzado: false,
    secado: 0.0,
    brote: 1.0,
    muerte: 0.0,
    degradacion: 0.0,
    diasMuerta: 0.0,
    sequia: 0.0,
    frio: 0.0,
    acameGrados: 0.0,
    amarillamiento: 0.0,
    antocianina: 0.0,

    eloteVis: 0,
    eloteCrec: 0.0,
    bracteasAbre: 0.0,
    granoLlenado: 0.0,
    aborto: 0.0,
    estigmaSeco: 0.0,
    bracteasSeco: 0.0,
    asiDias: CFG.asiBaseDias,
    cuajado: 1.0
  };
}

// ---------------------------------------------------------------------------
// 6. Motor del paso diario fenológico (pasoDia)
// ---------------------------------------------------------------------------

export function pasoDia(p: Planta, d: ClimaDia, cfg = CFG): Planta {
  const varCfg = VARIEDADES_MAIZ[p.variedad || 'chalqueno'];
  const escalaCiclo = varCfg.gddCicloCompleto / cfg.gddR6;

  if (p.estado === 'MUERTA') {
    p.diasMuerta += 1.0;
    p.degradacion = Math.min(1.0, p.diasMuerta / 14.0);
    p.secado = Math.min(1.0, (p.secado ?? 0.5) + 0.12);
    if (p.causaMuerte === 'acame' || p.causaMuerte === 'encharcamiento' || p.degradacion > 0.65) {
      p.acameGrados = Math.min(65.0, Math.max(p.acameGrados, 38.0 + p.degradacion * 27.0));
    } else {
      p.acameGrados = Math.min(28.0, p.acameGrados + p.degradacion * 18.0);
    }
    p.amarillamiento = 1.0;
    p.vigor = 0.0;
    return p;
  }

  const e = estreses(d, p, cfg);
  const rCiclo = p.rasgosHeredados?.rCiclo ?? 1.0;
  const rSequia = p.rasgosHeredados?.rSequia ?? 1.0;
  const rFrio = p.rasgosHeredados?.rFrio ?? 1.0;
  const rVigor = p.rasgosHeredados?.rVigor ?? 1.0;
  const rTamano = p.rasgosHeredados?.rTamano ?? 1.0;

  // -------------------------------------------------------------------------
  // FASE A: SEMILLA (Germinación y Emergencia acorde a la variedad)
  // -------------------------------------------------------------------------
  if (p.estado === 'SEMILLA') {
    const umbralSueloFrio = varCfg.tBase + 1.5;
    if (d.tSuelo < umbralSueloFrio) {
      p.diasSueloFrio += 1.0 * (1.35 - 0.65 * varCfg.resistenciaFrio * rFrio);
      if (p.diasSueloFrio >= cfg.diasSueloFrioMax) {
        p.estado = 'MUERTA';
        p.causaMuerte = 'pudricion_semilla';
        p.secado = 0.8;
        p.vigor = 0.0;
        return p;
      }
    } else {
      p.diasSueloFrio = Math.max(0.0, p.diasSueloFrio - 0.5);
    }

    if (d.vwc > cfg.saturacion && d.tSuelo > 14.0) {
      p.diasSueloSaturado += 1.0 * (1.45 - 0.75 * varCfg.resistenciaEncharcamiento);
      if (p.diasSueloSaturado >= cfg.diasSueloSaturadoMax) {
        p.estado = 'MUERTA';
        p.causaMuerte = 'encharcamiento';
        p.secado = 0.6;
        p.vigor = 0.0;
        return p;
      }
    } else {
      p.diasSueloSaturado = Math.max(0.0, p.diasSueloSaturado - 0.5);
    }

    if (d.vwc <= varCfg.pmp) {
      p.diasSemillaSeca += 1.0 * (1.40 - 0.70 * varCfg.resistenciaSequia * rSequia);
      if (p.diasSemillaSeca >= cfg.diasSemillaSecaMax) {
        p.estado = 'MUERTA';
        p.causaMuerte = 'sequia';
        p.secado = 1.0;
        p.vigor = 0.0;
        return p;
      }
    } else {
      p.diasSemillaSeca = Math.max(0.0, p.diasSemillaSeca - 0.5);
    }

    const tEmerg = Math.max(0.0, Math.min(varCfg.tCorte, d.tSuelo) - varCfg.tBase);
    const humedadApta = d.vwc >= (varCfg.pmp + 4.0) && d.vwc <= cfg.saturacion;
    if (d.tSuelo >= umbralSueloFrio && humedadApta) {
      p.gddSiembra += tEmerg;
      if (p.gddSiembra >= cfg.gddEmergencia * escalaCiclo) {
        p.estado = 'VIVA';
        p.gdd = 0.0;
        p.vigor = 1.0;
        p.escala = 0.28;
        p.alturaMetros = 0.28;
        p.alturaTecho = 0.28;
        p.limiteAlcanzado = false;
        p.secado = 0.0;
        p.brote = 1.0;
      }
    }
    return p;
  }

  // -------------------------------------------------------------------------
  // FASE B: PLANTA EMERGIDA (VIVA / ACAMADA / MADURA)
  // -------------------------------------------------------------------------

  const etapaActual = etapaDe(p.gdd, cfg, varCfg);

  // 1. Letalidad instantánea por golpe de calor extremo (modulado por variedad)
  const tempCalorLetal = cfg.tempCalorLetalInstantaneo - (1.0 - varCfg.resistenciaSequia) * 2.5;
  if (d.tMax >= tempCalorLetal) {
    p.estado = 'MUERTA';
    p.causaMuerte = 'calor';
    p.secado = 1.0;
    p.amarillamiento = 1.0;
    p.muerte = 1.0;
    p.vigor = 0.0;
    return p;
  }

  // 2. Letalidad y daño severo por helada acorde a la resistencia al frío de cada maíz
  // Ej.: Maíz Rojo (0.45) muere a ~ -1.8 °C; Chalqueño (0.60) a ~ -2.6 °C; Azul (0.95) resiste hasta -5.2 °C
  const tempHeladaLetal = -0.2 - 5.2 * varCfg.resistenciaFrio * rFrio;
  if (d.tMin <= tempHeladaLetal && (d.horasBajoMenos2_5 >= cfg.horasHeladaSeveraLetal || d.tMin <= tempHeladaLetal - 0.8)) {
    if (etapaActual >= Etapa.V4) {
      p.estado = 'MUERTA';
      p.causaMuerte = 'helada';
      p.frio = 1.0;
      p.secado = 0.85;
      p.muerte = 1.0;
      p.vigor = 0.0;
      return p;
    } else {
      p.vigor = Math.max(0.15, p.vigor * 0.45);
      p.frio = 0.9;
    }
  } else if (d.tMin <= tempHeladaLetal + 2.0) {
    // Helada moderada que quema follaje y reduce vigor en variedades sensibles al frío
    const danoFrio = (1.25 - 0.85 * varCfg.resistenciaFrio * rFrio) * 0.14;
    p.vigor = Math.max(0.05, p.vigor - danoFrio);
    p.frio = clamp01(p.frio + 0.35);
    p.secado = clamp01((p.secado ?? 0) + danoFrio * 0.8);
  }

  // 3. Acumuladores de estrés letal por Sequía, Calor y Encharcamiento según cada variedad
  // La marchitez letal ocurre cuando la humedad cae cerca o por debajo del Punto de Marchitez Permanente (PMP) de cada raza
  if (d.vwc <= varCfg.pmp + 1.5 || e.suelo >= 0.88) {
    const bajoPmp = d.vwc <= varCfg.pmp ? 1.0 : 0.45;
    const factorVulnSequia = Math.max(0.22, 1.45 - 1.15 * varCfg.resistenciaSequia * rSequia);
    p.diasSequiaExtrema += (0.55 + 0.65 * e.suelo) * factorVulnSequia * bajoPmp;
    p.secado = clamp01((p.secado ?? 0) + 0.09 * e.suelo * factorVulnSequia);
    if (p.diasSequiaExtrema >= cfg.diasSequiaExtremaMax) {
      p.estado = 'MUERTA';
      p.causaMuerte = 'sequia';
      p.secado = 1.0;
      p.amarillamiento = 1.0;
      p.sequia = 1.0;
      p.muerte = 1.0;
      p.vigor = 0.0;
      return p;
    }
  } else {
    p.diasSequiaExtrema = Math.max(0.0, p.diasSequiaExtrema - 0.5);
  }

  const umbralCalorSevero = varCfg.tCorte + 4.5; // Azul sufre desde 34.5 °C; Rojo hasta 38.5 °C
  if (d.tMax >= umbralCalorSevero) {
    const factorVulnCalor = Math.max(0.35, 1.40 - 0.80 * varCfg.resistenciaSequia * rSequia);
    p.diasCalorExtremo += factorVulnCalor;
    p.secado = clamp01((p.secado ?? 0) + 0.08 * factorVulnCalor);
    if (p.diasCalorExtremo >= cfg.diasCalorExtremoMax) {
      p.estado = 'MUERTA';
      p.causaMuerte = 'calor';
      p.secado = 1.0;
      p.amarillamiento = 1.0;
      p.muerte = 1.0;
      p.vigor = 0.0;
      return p;
    }
  } else {
    p.diasCalorExtremo = Math.max(0.0, p.diasCalorExtremo - 0.5);
  }

  if (e.ench >= 0.55) {
    const factorVulnEnch = Math.max(0.35, 1.60 - 1.05 * varCfg.resistenciaEncharcamiento);
    p.diasEncharcado += (0.65 + 0.55 * e.ench) * factorVulnEnch;
    const maxDiasEnch = d.tMed > 20.0 ? 3.0 : 6.0;
    if (p.diasEncharcado >= maxDiasEnch) {
      p.estado = 'MUERTA';
      p.causaMuerte = 'encharcamiento';
      p.secado = 0.75;
      p.amarillamiento = 1.0;
      p.acameGrados = Math.max(p.acameGrados, 38.0);
      p.muerte = 1.0;
      p.vigor = 0.0;
      return p;
    }
  } else {
    p.diasEncharcado = Math.max(0.0, p.diasEncharcado - 0.5);
  }

  // 4. Mecánica de Acame por Viento y Suelo Saturado (modulado por porte y raíces de la variedad)
  const umbralBase = d.vwc > cfg.umbralEncharcamiento ? 14.0 : 18.0;
  const umbralAcameViento = umbralBase * (0.62 + 0.72 * varCfg.resistenciaViento);
  if (d.viento >= umbralAcameViento && etapaActual >= Etapa.V8) {
    p.acameGrados = 55.0;
    if (cfg.acameLetal) {
      p.estado = 'MUERTA';
      p.causaMuerte = 'acame';
      p.muerte = 1.0;
      p.vigor = 0.0;
      return p;
    } else {
      p.estado = 'ACAMADA';
      p.vigor = Math.max(0.25, p.vigor * 0.75);
    }
  }

  // 5. Acumulación fenológica de Grados Día (ajustada por tBase/tCorte de la variedad y rCiclo)
  const deltaGdd = gddDia(d, cfg, varCfg) / Math.max(0.8, Math.min(1.2, rCiclo));
  p.gdd += deltaGdd;

  // Modulaciones por cultivo asociado (Tríada Mesoamericana) y rasgos heredables
  let eHidricoEfectivo = e.hidrico * (1.0 - Math.min(0.85, 0.45 * varCfg.resistenciaSequia * rSequia));
  let eFrioEfectivo = e.frio * (1.0 - Math.min(0.85, 0.55 * varCfg.resistenciaFrio * rFrio));
  if (p.cultivoAsociado === 'calabaza') {
    eHidricoEfectivo *= 0.65; // Mulch vivo retiene 35% de evaporación
  }

  // 6. Vigor multiplicativo (se actualiza durante el crecimiento activo antes de R6; en madurez se preserva)
  const eBiotico = e.biotico ?? 0.0;
  const penalizacionVigor =
    (1.0 - 0.62 * eHidricoEfectivo) *
    (1.0 - 0.52 * e.calor) *
    (1.0 - 0.52 * eFrioEfectivo) *
    (1.0 - 0.58 * e.ench) *
    (1.0 - 0.35 * e.pH) *
    (1.0 - 0.50 * eBiotico);

  if (deltaGdd > 0.1 && p.estado !== 'MADURA') {
    p.vigor = clamp01((p.vigor * 0.91 + penalizacionVigor * 0.09) * (0.98 + 0.02 * rVigor));
    if (p.cultivoAsociado === 'frijol') {
      p.vigor = clamp01(p.vigor + 0.015); // Fijación biológica de N
    }
    // Bono por encontrarse en la ventana agroclimática favorable de la especie
    const enTempOptima = d.tMed >= varCfg.tempOptimaMin && d.tMed <= varCfg.tempOptimaMax;
    const enVwcOptimo = d.vwc >= varCfg.vwcOptimoMin && d.vwc <= varCfg.vwcOptimoMax;
    if (enTempOptima && enVwcOptimo && e.globalPonderado < 0.22) {
      p.vigor = clamp01(p.vigor + 0.012);
    }
    // Penalizaciones específicas por lo que perjudica a cada especie:
    // - Cónico Azul: sufre deshidratación y daño térmico cuando T_max > 28 °C y HR < 35%
    if (p.variedad === 'azul' && (d.tMax > 28.0 || d.hr < 35.0)) {
      const excCalorAzul = Math.max(0, (d.tMax - 28.0) / 10.0) + (d.hr < 35.0 ? 0.08 : 0);
      p.vigor = clamp01(p.vigor - 0.022 * excCalorAzul);
    }
    // - Sangre de Cristo (Rojo): sufre pudrición radicular acelerada con exceso de humedad (> 34% VWC) o frío (< 10 °C)
    if (p.variedad === 'rojo') {
      if (d.vwc > 34.0) {
        p.vigor = clamp01(p.vigor - 0.028 * ((d.vwc - 34.0) / 12.0));
      }
      if (d.tMed < 11.0) {
        p.vigor = clamp01(p.vigor - 0.018 * ((11.0 - d.tMed) / 8.0));
      }
    }
  }

  // Colapso por pérdida crítica de vigor acumulada ante mal clima
  if (p.vigor <= 0.10) {
    p.estado = 'MUERTA';
    if (eFrioEfectivo >= eHidricoEfectivo && eFrioEfectivo >= e.calor && eFrioEfectivo >= e.ench) {
      p.causaMuerte = 'helada';
    } else if (e.ench >= eHidricoEfectivo && e.ench >= e.calor) {
      p.causaMuerte = 'encharcamiento';
    } else if (e.calor > eHidricoEfectivo) {
      p.causaMuerte = 'calor';
    } else {
      p.causaMuerte = 'sequia';
    }
    p.secado = p.causaMuerte === 'helada' ? 0.85 : 1.0;
    p.amarillamiento = 1.0;
    p.muerte = 1.0;
    p.vigor = 0.0;
    return p;
  }

  // 7. Marchitez Reversible, Senescencia (Secado) y Límite Real de Crecimiento Vegetativo
  p.sequia = clamp01(p.sequia * 0.72 + eHidricoEfectivo * 0.28);
  p.frio = clamp01(p.frio * 0.70 + eFrioEfectivo * 0.30);
  p.amarillamiento = clamp01(
    p.amarillamiento + 0.04 * eHidricoEfectivo + 0.025 * e.calor + 0.02 * e.ench + 0.03 * eBiotico
  );
  p.antocianina = clamp01(p.antocianina * 0.85 + (p.variedad === 'azul' ? 0.35 : (e.pH + eFrioEfectivo * 0.5) * 0.18));

  const gddV6_var = cfg.gddV6 * escalaCiclo;
  const gddV12_var = cfg.gddV12 * escalaCiclo;
  const gddVT_var = cfg.gddVT * escalaCiclo;
  const gddR1_var = cfg.gddR1 * escalaCiclo;
  const gddR2_var = cfg.gddR2 * escalaCiclo;
  const gddR3_var = cfg.gddR3 * escalaCiclo;
  const gddR4_var = cfg.gddR4 * escalaCiclo;
  const gddR5_var = cfg.gddR5 * escalaCiclo;
  const gddR6_var = varCfg.gddCicloCompleto;

  // LÍMITE REAL DE CRECIMIENTO EN ALTURA:
  // El maíz solo elonga su tallo hasta VT (floración masculina). Al llegar a VT, su altura
  // queda fijada en su techo biológico alcanzado (modulado por la variedad y el vigor logrado).
  const factorVigorAltura = 0.42 + 0.58 * p.vigor;
  if (p.gdd < gddVT_var && !p.limiteAlcanzado) {
    const fGdd = Math.min(1.0, p.gdd / gddVT_var);
    p.escala = (0.22 + 0.78 * fGdd * factorVigorAltura) * rTamano;
    p.alturaMetros = (0.25 + (varCfg.alturaMetrosMax - 0.25) * fGdd * factorVigorAltura) * rTamano;
    p.alturaTecho = Math.max(p.alturaTecho ?? 0.28, p.alturaMetros);
  } else {
    p.limiteAlcanzado = true;
    if (!p.alturaTecho || p.alturaTecho <= 0.30) {
      p.alturaTecho = (0.25 + (varCfg.alturaMetrosMax - 0.25) * factorVigorAltura) * rTamano;
    }
    p.alturaMetros = p.alturaTecho;
    p.escala = clamp01(p.alturaTecho / varCfg.alturaMetrosMax) * rTamano;
  }
  p.brote = Math.max(0.0, 1.0 - (p.gdd / gddV6_var));

  // 8. Mazorca y Órgano Reproductivo (Zea mays L.)
  if (p.gdd >= gddV12_var) {
    p.eloteVis = 1;
    const estresHoy = Math.max(eHidricoEfectivo, e.calor, e.ench, eFrioEfectivo * 0.8);
    p.estresFloracion.push(estresHoy);

    const fCrec = Math.min(1.0, (p.gdd - gddV12_var) / Math.max(10.0, gddR3_var - gddV12_var));
    p.eloteCrec = fCrec * (0.55 + 0.45 * p.vigor);

    if (p.gdd >= gddVT_var && p.gdd <= gddR2_var) {
      const promedioEstresFlor = p.estresFloracion.reduce((a, b) => a + b, 0) / p.estresFloracion.length;
      p.asiDias = cfg.asiBaseDias + cfg.asiFactorEstres * promedioEstresFlor;
      p.cuajado = clamp01(1.0 - cfg.cuajadoSensibilidad * promedioEstresFlor);
      p.aborto = clamp01(1.0 - p.cuajado);
    }

    if (p.gdd >= gddR1_var) {
      p.bracteasAbre = Math.min(1.0, (p.gdd - gddR1_var) / Math.max(10.0, gddR4_var - gddR1_var));
    }

    if (p.gdd >= gddR2_var) {
      p.granoLlenado = Math.min(1.0, (p.gdd - gddR2_var) / Math.max(10.0, gddR5_var - gddR2_var)) * p.cuajado;
      p.estigmaSeco = Math.min(1.0, (p.gdd - gddR2_var) / Math.max(10.0, gddR4_var - gddR2_var));
    }

    if (p.gdd >= gddR5_var) {
      p.bracteasSeco = Math.min(1.0, (p.gdd - gddR5_var) / Math.max(10.0, gddR6_var - gddR5_var));
    }
  }

  // 9. Secado Progresivo (Senescencia R5 -> Post-R6 o desecación climática) y Muerte por Fin de Ciclo
  if (p.gdd >= gddR5_var) {
    const secadoSenescencia = clamp01((p.gdd - gddR5_var) / Math.max(50.0, gddR6_var * 1.38 - gddR5_var));
    p.secado = clamp01(Math.max(p.secado ?? 0, secadoSenescencia));
    p.amarillamiento = clamp01(Math.max(p.amarillamiento, secadoSenescencia * 0.95));
  } else {
    const estresDesecante = Math.max(eHidricoEfectivo, e.calor * 0.9);
    if (estresDesecante > 0.35) {
      p.secado = clamp01((p.secado ?? 0) + (estresDesecante - 0.25) * 0.06);
    } else {
      // Ligera recuperación de turgencia en hojas superiores si aún es vegetativa y se riega
      p.secado = Math.max(0.0, (p.secado ?? 0) - 0.02);
    }
  }

  if (p.gdd >= gddR6_var) {
    p.estado = 'MADURA';
    p.amarillamiento = Math.max(p.amarillamiento, 0.85);
    p.bracteasSeco = 1.0;
    p.estigmaSeco = 1.0;
  }

  // Si continúa pasando el tiempo mucho después de la madurez fisiológica R6 sin cosechar,
  // la planta se seca por completo (zacate seco) y muere por agotamiento natural de su ciclo anual.
  if (p.gdd >= gddR6_var * 1.58) {
    p.estado = 'MUERTA';
    p.causaMuerte = 'agotamiento';
    p.secado = 1.0;
    p.amarillamiento = 1.0;
    p.bracteasSeco = 1.0;
    p.estigmaSeco = 1.0;
    p.muerte = 1.0;
    p.vigor = 0.0;
  }

  return p;
}
