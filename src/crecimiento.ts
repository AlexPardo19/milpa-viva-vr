/**
 * Motor de Crecimiento, Fenología y Time-Lapse para Zea mays L. (raza Chalqueño).
 *
 * Conecta el modelo biológico puro (nucleo.ts) con la simulación interactiva:
 * - Ciclo de 1 a 240 días guiado por Grados Día de Desarrollo (GDD).
 * - Historial en caché (SnapshotDia) para avance y retroceso instantáneo al arrastrar sliders.
 * - Respuestas reversibles de marchitez vs. letalidad y degradación post-mortem.
 */

import { ClimateState, Metricas } from "./clima";
import {
  CFG,
  Planta,
  ClimaDia,
  Etapa,
  crearPlanta,
  pasoDia,
  etapaDe,
  nombreEtapa,
  gddDia,
  estreses,
  clamp01
} from "./nucleo";

export type EtapaFenologica = string;

export interface SnapshotDia {
  planta: Planta;
  biomasa: number;
}

export interface EstadoCrecimiento {
  dia: number;                     // Día del ciclo (1.0 a 240.0)
  diaEnteroSimulado: number;       // Último día entero procesado por pasoDia
  timeLapseActivo: boolean;        // Si el time-lapse está corriendo
  velocidadDiasPorSeg: number;     // Días de simulación por segundo real (1, 3, 6, 12)
  gddAcumulado: number;            // Grados Día acumulados (°C·día, base 8°C)
  biomasaGramos: number;           // Materia seca aérea acumulada (g)
  saludVital: number;              // 0.0 (muerta) a 1.0 (óptima vitalidad)
  etapa: EtapaFenologica;
  estaMuerta: boolean;
  causaMuerte: string | null;
  diasBajoSequia: number;
  diasBajoEncharcamiento: number;
  diasBajoCalor: number;

  // Moduladores morfológicos para la renderización 3D estilizada:
  pesoBrote: number;               // 1.0 (plántula) -> 0.0 (adulta)
  pesoMuerte: number;              // 0.0 (viva) -> 1.0 (acame y necrosis total)
  degradacion: number;             // 0.0 (viva) -> 1.0 (degradación avanzada)
  diasMuerta: number;              // Días transcurridos tras la muerte
  pesoSequia: number;              // 0.0 -> 1.0 (acartuchamiento y marchitez)
  pesoFrio: number;                // 0.0 -> 1.0 (flaccidez)
  acameGrados: number;             // Inclinación basal (0° a 55°)
  amarillamiento: number;          // 0.0 -> 1.0 (clorosis / senescencia)
  antocianina: number;             // 0.0 -> 1.0 (púrpura por pH ácido)
  escalaPlanta: number;            // Escala geométrica (0.20 a 1.0)
  alturaMetros: number;            // Altura relativa (0.28 a 6.6m estilizada)
  factorClorofila: number;         // 1.0 (verde vivo) -> 0.0 (amarillo/marrón)

  // Mazorca / Elote (Zea mays L.)
  eloteVis: number;
  eloteCrec: number;
  bracteasAbre: number;
  granoLlenado: number;
  aborto: number;
  estigmaSeco: number;
  bracteasSeco: number;
  cuajado: number;
  asiDias: number;

  plantaInterna: Planta;
  historial: Map<number, SnapshotDia>;
}

export function climaAClimaDia(clima: ClimateState): ClimaDia {
  let tMax: number;
  let tMin: number;
  let tMed: number;
  let tSuelo: number;
  let horasBajoMenos2_5 = 0.0;

  if (clima.temperatura < 8.0) {
    tMin = clima.temperatura;
    tMax = Math.max(clima.temperatura + 6.0, 6.0);
    tMed = (tMax + tMin) / 2.0;
    tSuelo = Math.max(4.0, tMed);
    horasBajoMenos2_5 = tMin <= CFG.tempHeladaSevera ? 3.5 : 0.0;
  } else {
    tMax = clima.temperatura;
    tMin = Math.max(2.0, clima.temperatura - 14.0);
    tMed = (tMax + tMin) / 2.0;
    tSuelo = Math.max(6.0, tMed + 1.0);
  }

  return {
    tMax,
    tMin,
    tMed,
    tSuelo,
    hr: clima.humedad,
    vwc: clima.humedadSuelo,
    ph: clima.phSuelo,
    viento: clima.viento,
    lluvia: clima.lluvia,
    co2: clima.co2,
    presion: clima.presion,
    horasBajoMenos2_5,
    nubosidad: clima.nubosidad,
    pm25: clima.pm25,
    hora: clima.hora
  };
}

export function clonarPlanta(p: Planta): Planta {
  return {
    ...p,
    estresFloracion: [...p.estresFloracion]
  };
}

function construirTrayectoriaBase(diaObjetivo: number): { planta: Planta; biomasa: number; historial: Map<number, SnapshotDia> } {
  const climaOptimo: ClimaDia = {
    tMax: 24,
    tMin: 10,
    tMed: 17,
    tSuelo: 17,
    hr: 62,
    vwc: 32,
    ph: 6.4,
    viento: 2.5,
    lluvia: 0,
    co2: 420,
    presion: CFG.presionBase,
    horasBajoMenos2_5: 0
  };

  let p = crearPlanta();
  let bio = 0.15;
  const historial = new Map<number, SnapshotDia>();
  historial.set(1, { planta: clonarPlanta(p), biomasa: bio });

  const dMax = Math.max(1, Math.min(240, Math.round(diaObjetivo)));
  for (let d = 2; d <= dMax; d++) {
    p = pasoDia(p, climaOptimo);
    if (p.estado === 'VIVA' || p.estado === 'ACAMADA') {
      bio = Math.min(420, bio + 1.45 * p.vigor);
    }
    historial.set(d, { planta: clonarPlanta(p), biomasa: bio });
  }

  return { planta: p, biomasa: bio, historial };
}

export const ESTADO_CRECIMIENTO_INICIAL: EstadoCrecimiento = (() => {
  const diaInicial = 163.0; // R3 (Leche / ELOTE desarrollado con granos y totomoxtle entreabierto)
  const base = construirTrayectoriaBase(diaInicial);
  const p = base.planta;

  return {
    dia: diaInicial,
    diaEnteroSimulado: Math.round(diaInicial),
    timeLapseActivo: false,
    velocidadDiasPorSeg: 3.0,
    gddAcumulado: p.gdd,
    biomasaGramos: base.biomasa,
    saludVital: p.vigor,
    etapa: nombreEtapa(etapaDe(p.gdd)),
    estaMuerta: false,
    causaMuerte: null,
    diasBajoSequia: 0,
    diasBajoEncharcamiento: 0,
    diasBajoCalor: 0,

    pesoBrote: p.brote,
    pesoMuerte: p.muerte,
    degradacion: p.degradacion,
    diasMuerta: p.diasMuerta,
    pesoSequia: p.sequia,
    pesoFrio: p.frio,
    acameGrados: p.acameGrados,
    amarillamiento: p.amarillamiento,
    antocianina: p.antocianina,
    escalaPlanta: p.escala,
    alturaMetros: p.alturaMetros,
    factorClorofila: 1.0,

    eloteVis: p.eloteVis,
    eloteCrec: p.eloteCrec,
    bracteasAbre: p.bracteasAbre,
    granoLlenado: p.granoLlenado,
    aborto: p.aborto,
    estigmaSeco: p.estigmaSeco,
    bracteasSeco: p.bracteasSeco,
    cuajado: p.cuajado,
    asiDias: p.asiDias,

    plantaInterna: p,
    historial: base.historial
  };
})();

export function reiniciarCrecimiento(estado: EstadoCrecimiento, clima: ClimateState): void {
  const pNueva = crearPlanta();
  estado.dia = 1.0;
  estado.diaEnteroSimulado = 1;
  estado.timeLapseActivo = false;
  estado.gddAcumulado = 0.0;
  estado.biomasaGramos = 0.15;
  estado.saludVital = 1.0;
  estado.etapa = nombreEtapa(Etapa.SEMILLA);
  estado.estaMuerta = false;
  estado.causaMuerte = null;
  estado.diasBajoSequia = 0;
  estado.diasBajoEncharcamiento = 0;
  estado.diasBajoCalor = 0;

  estado.pesoBrote = 1.0;
  estado.pesoMuerte = 0.0;
  estado.degradacion = 0.0;
  estado.diasMuerta = 0.0;
  estado.pesoSequia = 0.0;
  estado.pesoFrio = 0.0;
  estado.acameGrados = 0.0;
  estado.amarillamiento = 0.0;
  estado.antocianina = 0.0;
  estado.escalaPlanta = 0.28;
  estado.alturaMetros = 0.28;
  estado.factorClorofila = 1.0;

  estado.eloteVis = 0;
  estado.eloteCrec = 0.0;
  estado.bracteasAbre = 0.0;
  estado.granoLlenado = 0.0;
  estado.aborto = 0.0;
  estado.estigmaSeco = 0.0;
  estado.bracteasSeco = 0.0;
  estado.cuajado = 1.0;
  estado.asiDias = CFG.asiBaseDias;

  estado.plantaInterna = pNueva;
  estado.historial.clear();
  estado.historial.set(1, { planta: clonarPlanta(pNueva), biomasa: 0.15 });

  clima.humedadSuelo = 32.0;
  clima.temperatura = 24.0;
  clima.hora = 13.5;
}

export function sincronizarEstadoDesdePlanta(
  estado: EstadoCrecimiento,
  p: Planta,
  clima: ClimateState,
  metricas: Metricas,
  biomasa: number
): void {
  estado.gddAcumulado = p.gdd;
  estado.biomasaGramos = biomasa;
  estado.saludVital = p.estado === 'MUERTA' ? 0.0 : p.vigor;
  estado.estaMuerta = p.estado === 'MUERTA';
  estado.causaMuerte = p.causaMuerte ? `Letalidad por ${p.causaMuerte.toUpperCase()}` : null;

  if (p.estado === 'SEMILLA') {
    estado.etapa = nombreEtapa(Etapa.SEMILLA);
  } else {
    estado.etapa = nombreEtapa(etapaDe(p.gdd));
  }

  estado.pesoBrote = p.brote;
  estado.pesoMuerte = p.muerte;
  estado.degradacion = p.degradacion;
  estado.diasMuerta = p.diasMuerta;
  estado.pesoSequia = Math.max(p.sequia, metricas.estresHidrico * 0.85);
  estado.pesoFrio = Math.max(p.frio, metricas.estresFrio * 0.80);
  estado.acameGrados = p.acameGrados;
  estado.amarillamiento = p.amarillamiento;
  estado.antocianina = Math.max(p.antocianina, metricas.estresNutricional * 0.70);
  estado.escalaPlanta = p.escala;
  estado.alturaMetros = p.alturaMetros;

  const factorClorosis = Math.max(p.amarillamiento, metricas.estresHidrico * 0.7, metricas.estresCalor * 0.7);
  estado.factorClorofila = clamp01(1.0 - factorClorosis) * estado.saludVital;

  estado.eloteVis = p.eloteVis;
  estado.eloteCrec = p.eloteCrec;
  estado.bracteasAbre = p.bracteasAbre;
  estado.granoLlenado = p.granoLlenado;
  estado.aborto = p.aborto;
  estado.estigmaSeco = p.estigmaSeco;
  estado.bracteasSeco = p.bracteasSeco;
  estado.cuajado = p.cuajado;
  estado.asiDias = p.asiDias;
}

export function avanzarDesarrollo(
  estado: EstadoCrecimiento,
  clima: ClimateState,
  metricas: Metricas,
  dtSegundos: number
): void {
  if (estado.dia >= 240.0) {
    estado.dia = 240.0;
    estado.timeLapseActivo = false;
    return;
  }

  const dtDias = dtSegundos * estado.velocidadDiasPorSeg;
  const nuevoDia = Math.min(240.0, estado.dia + dtDias);

  const diaActualEntero = Math.floor(estado.dia);
  const nuevoDiaEntero = Math.floor(nuevoDia);

  if (nuevoDiaEntero > diaActualEntero) {
    for (let d = diaActualEntero + 1; d <= nuevoDiaEntero; d++) {
      const climaDia = climaAClimaDia(clima);
      pasoDia(estado.plantaInterna, climaDia);

      // Balance hídrico simplificado de suelo
      const etDiaMm = metricas.et0 * 12.0 * 0.035;
      const lluviaMm = clima.lluvia * 1.5;
      clima.humedadSuelo = Math.max(8.0, Math.min(58.0, clima.humedadSuelo - etDiaMm + lluviaMm * 0.4));

      // Biomasa acumulada
      if (estado.plantaInterna.estado !== 'SEMILLA' && estado.plantaInterna.estado !== 'MUERTA') {
        const deltaBiomasa = Math.max(0.05, metricas.fotosintesis * 0.08 * estado.plantaInterna.vigor);
        estado.biomasaGramos += deltaBiomasa;
      }

      estado.historial.set(d, {
        planta: clonarPlanta(estado.plantaInterna),
        biomasa: estado.biomasaGramos
      });

      if (estado.plantaInterna.estado === 'MUERTA') {
        estado.estaMuerta = true;
      }
    }
    estado.diaEnteroSimulado = nuevoDiaEntero;
  }

  estado.dia = nuevoDia;
  sincronizarEstadoDesdePlanta(estado, estado.plantaInterna, clima, metricas, estado.biomasaGramos);
}

export function irADia(estado: EstadoCrecimiento, diaDestino: number, clima: ClimateState): void {
  const target = Math.max(1.0, Math.min(240.0, diaDestino));
  const targetEntero = Math.floor(target);

  if (targetEntero <= estado.diaEnteroSimulado && estado.historial.has(targetEntero)) {
    const snap = estado.historial.get(targetEntero)!;
    estado.plantaInterna = clonarPlanta(snap.planta);
    estado.biomasaGramos = snap.biomasa;
    estado.dia = target;
    estado.diaEnteroSimulado = targetEntero;
    const m = { ...clima, ...climaAClimaDia(clima) };
    return;
  }

  // Si se avanza más allá de lo simulado, simular hasta targetEntero
  const inicio = estado.diaEnteroSimulado;
  for (let d = inicio + 1; d <= targetEntero; d++) {
    const climaDia = climaAClimaDia(clima);
    pasoDia(estado.plantaInterna, climaDia);
    if (estado.plantaInterna.estado !== 'SEMILLA' && estado.plantaInterna.estado !== 'MUERTA') {
      estado.biomasaGramos += 0.85 * estado.plantaInterna.vigor;
    }
    estado.historial.set(d, {
      planta: clonarPlanta(estado.plantaInterna),
      biomasa: estado.biomasaGramos
    });
  }

  estado.dia = target;
  estado.diaEnteroSimulado = targetEntero;
}

export function notificarCambioClima(estado: EstadoCrecimiento, clima: ClimateState): void {
  const climaDia = climaAClimaDia(clima);
  const e = estreses(climaDia, estado.plantaInterna);

  if (!estado.estaMuerta) {
    estado.pesoSequia = Math.max(estado.plantaInterna.sequia, e.hidrico * 0.85);
    estado.pesoFrio = Math.max(estado.plantaInterna.frio, e.frio * 0.80);
    estado.antocianina = Math.max(estado.plantaInterna.antocianina, e.pH * 0.70);
  }
}
