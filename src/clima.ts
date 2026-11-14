/**
 * Modelo climático y agrofisiológico del simulador (Zea mays L. raza Chalqueño).
 *
 * Contiene:
 *  - Variables ambientales medibles (temperatura, HR, presión, hora, nubosidad, viento, lluvia, CO2, suelo, pH, PM2.5).
 *  - 10 escenarios climáticos predefinidos.
 *  - Métricas derivadas (GHI, PAR, lux, UV, VPD, punto de rocío, Penman-Monteith ET0, fotosíntesis C4, 6 índices de estrés).
 */

import { CFG, presionSaturacion, puntoDeRocio, clamp01 } from "./nucleo";

export interface ClimateState {
  temperatura: number;   // °C               (-5 a 50)
  humedad: number;       // % HR             (0 a 100)
  presion: number;       // hPa              (700 a 1050)
  hora: number;          // h solar local    (0 a 24)
  nubosidad: number;     // % cielo cubierto (0 a 100)
  viento: number;        // m/s a 10 m       (0 a 25)
  lluvia: number;        // mm/h             (0 a 50)
  co2: number;           // ppm              (200 a 2000)
  humedadSuelo: number;  // % VWC            (0 a 60)
  phSuelo: number;       // pH               (3.5 a 9)
  pm25: number;          // µg/m³            (0 a 300)
}

export type ClimateKey = keyof ClimateState;

export interface VariableDef {
  key: ClimateKey;
  etiqueta: string;
  unidad: string;
  min: number;
  max: number;
  paso: number;
  color: string;
}

export const VARIABLES: VariableDef[] = [
  { key: "temperatura", etiqueta: "Temperatura", unidad: "°C", min: -5, max: 50, paso: 1, color: "#fb923c" },
  { key: "humedad", etiqueta: "Humedad Relativa", unidad: "%", min: 0, max: 100, paso: 1, color: "#38bdf8" },
  { key: "presion", etiqueta: "Presión Atmosférica", unidad: "hPa", min: 700, max: 1050, paso: 1, color: "#a78bfa" },
  { key: "hora", etiqueta: "Hora Solar", unidad: "h", min: 0, max: 24, paso: 0.02, color: "#facc15" },
  { key: "nubosidad", etiqueta: "Nubosidad", unidad: "%", min: 0, max: 100, paso: 1, color: "#cbd5e1" },
  { key: "viento", etiqueta: "Velocidad del Viento", unidad: "m/s", min: 0, max: 25, paso: 0.5, color: "#5eead4" },
  { key: "lluvia", etiqueta: "Precipitación", unidad: "mm/h", min: 0, max: 50, paso: 0.5, color: "#60a5fa" },
  { key: "co2", etiqueta: "CO₂ Atmosférico", unidad: "ppm", min: 200, max: 2000, paso: 10, color: "#f472b6" },
  { key: "humedadSuelo", etiqueta: "Humedad del Suelo", unidad: "% VWC", min: 0, max: 60, paso: 1, color: "#a3e635" },
  { key: "phSuelo", etiqueta: "pH del Suelo", unidad: "", min: 3.5, max: 9, paso: 0.1, color: "#e879f9" },
  { key: "pm25", etiqueta: "Partículas PM2.5", unidad: "µg/m³", min: 0, max: 300, paso: 1, color: "#d6d3d1" }
];

export const CLIMA_INICIAL: ClimateState = {
  temperatura: 24,
  humedad: 62,
  presion: CFG.presionBase, // 780 hPa (Valles Altos de México)
  hora: 13.5,
  nubosidad: 20,
  viento: 2.5,
  lluvia: 0,
  co2: 420,
  humedadSuelo: 32,
  phSuelo: 6.4,
  pm25: 12
};

/** 10 Escenarios predefinidos para Maíz Chalqueño */
export const ESCENARIOS: { nombre: string; valores: Partial<ClimateState> }[] = [
  {
    nombre: "Temporal Óptimo",
    valores: { temperatura: 24, humedad: 62, presion: 780, hora: 13.5, nubosidad: 20, viento: 2.5, lluvia: 0, co2: 420, humedadSuelo: 32, phSuelo: 6.4, pm25: 12 }
  },
  {
    nombre: "Canícula / Sequía",
    valores: { temperatura: 35, humedad: 22, presion: 785, hora: 15, nubosidad: 5, viento: 4.0, lluvia: 0, co2: 420, humedadSuelo: 11, phSuelo: 6.5, pm25: 35 }
  },
  {
    nombre: "Helada Otoño",
    valores: { temperatura: -3, humedad: 85, presion: 795, hora: 6.5, nubosidad: 10, viento: 1.0, lluvia: 0, co2: 415, humedadSuelo: 24, phSuelo: 6.4, pm25: 10 }
  },
  {
    nombre: "Tormenta / Acame",
    valores: { temperatura: 17, humedad: 96, presion: 765, hora: 17.5, nubosidad: 95, viento: 21.0, lluvia: 40, co2: 415, humedadSuelo: 52, phSuelo: 6.2, pm25: 5 }
  },
  {
    nombre: "Suelo Ácido (Al)",
    valores: { temperatura: 23, humedad: 58, presion: 780, hora: 12, nubosidad: 30, viento: 3.0, lluvia: 0, co2: 420, humedadSuelo: 30, phSuelo: 4.3, pm25: 15 }
  },
  {
    nombre: "Ola de Calor",
    valores: { temperatura: 42, humedad: 28, presion: 782, hora: 14.5, nubosidad: 5, viento: 2.0, lluvia: 0, co2: 420, humedadSuelo: 18, phSuelo: 6.5, pm25: 45 }
  },
  {
    nombre: "Atardecer Valles",
    valores: { temperatura: 21, humedad: 60, presion: 780, hora: 18.2, nubosidad: 25, viento: 3.5, lluvia: 0, co2: 420, humedadSuelo: 30, phSuelo: 6.5, pm25: 25 }
  },
  {
    nombre: "Suelo Alcalino",
    valores: { temperatura: 24, humedad: 55, presion: 780, hora: 13, nubosidad: 15, viento: 2.0, lluvia: 0, co2: 420, humedadSuelo: 28, phSuelo: 8.5, pm25: 20 }
  },
  {
    nombre: "Invernadero CO₂",
    valores: { temperatura: 26, humedad: 68, presion: 780, hora: 12, nubosidad: 0, viento: 0.5, lluvia: 0, co2: 1200, humedadSuelo: 34, phSuelo: 6.4, pm25: 5 }
  },
  {
    nombre: "Noche Fresca",
    valores: { temperatura: 12, humedad: 78, presion: 782, hora: 23, nubosidad: 15, viento: 1.5, lluvia: 0, co2: 430, humedadSuelo: 30, phSuelo: 6.4, pm25: 8 }
  }
];

export interface Metricas {
  // Posición solar
  sunDir: { x: number; y: number; z: number };
  elevacionSolar: number;   // grados
  azimutSolar: number;      // grados
  esDeDia: boolean;

  // Radiación
  irradiancia: number;      // W/m² (GHI)
  par: number;              // µmol fotones / m² / s
  lux: number;              // lx
  indiceUV: number;         // adimensional

  // Termodinámica
  puntoRocio: number;       // °C
  vpd: number;              // kPa
  humedadAbsoluta: number;  // g/m³
  densidadAire: number;     // kg/m³
  visibilidad: number;      // km
  niebla: number;           // 0..1

  // Agrofisiología
  et0: number;              // mm/h
  transpiracion: number;    // mm/h
  fotosintesis: number;     // µmol CO₂ / m² / s
  conductancia: number;     // 0..1
  riesgoFungico: number;    // 0..1

  // Índices de estrés (0..1)
  estresHidrico: number;
  estresCalor: number;
  estresFrio: number;
  estresNutricional: number;
  estresMecanico: number;
  encharcamiento: number;
  saludGeneral: number;     // 0..1
}

export const LATITUD = 19.43;        // Valles Altos Mesa Central
export const DIA_DEL_ANIO = 105;     // Mediados de abril

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export { presionSaturacion, puntoDeRocio };

/** Vector solar astronómico */
export function posicionSolar(hora: number) {
  const lat = rad(LATITUD);
  const dec = rad(23.44 * Math.sin((2 * Math.PI * (284 + DIA_DEL_ANIO)) / 365));
  const H = rad(15 * (hora - 12));

  const este = -Math.cos(dec) * Math.sin(H);
  const norte = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H);
  const arriba = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const len = Math.hypot(este, norte, arriba);

  const dir = { x: este / len, y: arriba / len, z: norte / len };
  const elevacion = deg(Math.asin(dir.y));
  let azimut = deg(Math.atan2(dir.x, dir.z));
  if (azimut < 0) azimut += 360;
  return { dir, elevacion, azimut };
}

export function calcularMetricas(c: ClimateState): Metricas {
  const sol = posicionSolar(c.hora);
  const sinE = Math.max(0, sol.dir.y);
  const esDeDia = sol.elevacion > -0.5;

  // Radiación global incidente
  const nub = c.nubosidad / 100;
  const ghiDespejado = sinE > 0.01 ? 1098 * sinE * Math.exp(-0.057 / sinE) : 0;
  const factorNubes = 1 - 0.75 * Math.pow(nub, 3.4);
  const factorAerosol = Math.exp(-c.pm25 / 900);
  const factorLluvia = 1 - 0.5 * clamp01(c.lluvia / 30);
  const irradiancia = ghiDespejado * factorNubes * factorAerosol * factorLluvia;
  const par = irradiancia * 2.02;
  const lux = irradiancia * 110;
  const indiceUV = Math.max(0, 12.5 * Math.pow(sinE, 2.42) * factorNubes * (0.6 + 0.4 * factorAerosol));

  // Termodinámica
  const es = presionSaturacion(c.temperatura);
  const ea = (es * c.humedad) / 100;
  const vpd = Math.max(0, es - ea);
  const puntoRoc = puntoDeRocio(c.temperatura, c.humedad);
  const humedadAbsoluta = (2167.4 * ea) / (273.15 + c.temperatura);
  const densidadAire = (c.presion * 100 - ea * 1000 * 0.378) / (287.05 * (c.temperatura + 273.15));

  // Niebla y visibilidad
  const spread = c.temperatura - puntoRoc;
  const niebla = clamp01((2.5 - spread) / 2.5) * clamp01(1 - (c.viento - 3) / 6) * (c.humedad >= 90 ? 1 : 0.4);
  const sigma =
    0.012 +
    c.pm25 * 0.0045 * (1 + Math.pow(clamp01((c.humedad - 60) / 40), 2) * 2) +
    0.25 * Math.pow(c.lluvia, 0.63) +
    niebla * 25;
  const visibilidad = Math.min(80, 3.912 / sigma);

  // FAO-56 Penman-Monteith
  const Rs = irradiancia * 0.0036;
  const Rn = 0.77 * Rs - (esDeDia ? 0.04 : 0.03) * (1 - 0.6 * nub);
  const G = esDeDia ? 0.1 * Rn : 0.5 * Rn;
  const Cd = esDeDia ? 0.34 : 0.96;
  const delta = (4098 * es) / Math.pow(c.temperatura + 237.3, 2);
  const gamma = CFG.constantePsicrometricaFactor * (c.presion / 10);
  const u2 = c.viento * 0.748;
  const et0 = Math.max(
    0,
    (0.408 * delta * (Rn - G) + gamma * (37 / (c.temperatura + 273)) * u2 * vpd) /
      (delta + gamma * (1 + Cd * u2))
  );

  // Índices de estrés
  const estresSuelo = c.humedadSuelo < 26.0
    ? clamp01((26.0 - c.humedadSuelo) / (26.0 - CFG.pmp))
    : 0;
  const estresVPD = vpd > 1.6 ? clamp01((vpd - 1.6) / 2.4) : 0;
  const estresHidrico = clamp01(Math.max(estresSuelo, estresVPD * 0.7));

  const encharcamiento = c.humedadSuelo > CFG.umbralEncharcamiento
    ? clamp01((c.humedadSuelo - CFG.umbralEncharcamiento) / (58.0 - CFG.umbralEncharcamiento))
    : 0;

  const estresCalor = c.temperatura > 28.0
    ? clamp01((c.temperatura - 28.0) / (45.0 - 28.0))
    : 0;

  const estresFrio = c.temperatura < 8.0
    ? clamp01((8.0 - c.temperatura) / (8.0 - (-4.0)))
    : 0;

  const estresNutricional = c.phSuelo < 5.8
    ? clamp01((5.8 - c.phSuelo) / (5.8 - 3.5))
    : c.phSuelo > 7.5
    ? clamp01((c.phSuelo - 7.5) / (9.0 - 7.5))
    : 0;

  const estresMecanico = clamp01(Math.pow(u2 / 12.0, 2.0));

  // Conductancia estomática y transpiración
  const fLuz = par / (par + 180);
  const fVpd = Math.max(0.1, 1 - 0.35 * estresVPD);
  const fAgua = Math.max(0.05, 1 - estresSuelo);
  const conductancia = clamp01(fLuz * fVpd * fAgua);
  const transpiracion = Math.max(0, et0 * 1.15 * conductancia);

  // Fotosíntesis neta C4
  const aMax = CFG.aMax0;
  const fCO2 = c.co2 / (c.co2 + CFG.kCO2);
  const dtOpt = c.temperatura - CFG.tOptimaFotosintesis;
  const fT = Math.exp(-0.5 * Math.pow(dtOpt / CFG.tSigmaFotosintesis, 2.0));
  const resp = CFG.respiracionBase * Math.pow(CFG.q10Respiracion, (c.temperatura - 25) / 10);
  const fotosintesis = Math.max(-resp, aMax * (par / (par + CFG.kPAR)) * fCO2 * fT * fAgua - resp);

  // Riesgo fúngico
  const riesgoFungico = clamp01(
    (c.humedad >= 85 ? (c.humedad - 85) / 15 : 0) * 0.5 +
    (c.temperatura >= 18 && c.temperatura <= 28 ? 1 : 0.3) * 0.3 +
    (c.lluvia > 0 ? 0.2 : 0)
  );

  // Salud general integradora (para telemetría)
  const penalizacion =
    0.30 * estresHidrico +
    0.20 * estresCalor +
    0.15 * estresFrio +
    0.15 * encharcamiento +
    0.10 * estresNutricional +
    0.10 * estresMecanico;
  const saludGeneral = clamp01(1.0 - penalizacion);

  return {
    sunDir: sol.dir,
    elevacionSolar: sol.elevacion,
    azimutSolar: sol.azimut,
    esDeDia,
    irradiancia,
    par,
    lux,
    indiceUV,
    puntoRocio: puntoRoc,
    vpd,
    humedadAbsoluta,
    densidadAire,
    visibilidad,
    niebla,
    et0,
    transpiracion,
    fotosintesis,
    conductancia,
    riesgoFungico,
    estresHidrico,
    estresCalor,
    estresFrio,
    estresNutricional,
    estresMecanico,
    encharcamiento,
    saludGeneral
  };
}
