import { ClimateState, CLIMA_INICIAL } from "../clima";
import { ItemStack } from "../inventario/inventario";
import { CultivoAsociado, Planta, TipoSemilla } from "../nucleo";

export type PresetClimaMundo = "templado" | "temporal" | "sequia" | "helada";
export type DificultadMundo = "tranquilo" | "normal" | "extremo";

export interface NodoGuardado {
  id: number;
  variedad: TipoSemilla;
  cultivoAsociado: CultivoAsociado;
  tierraArada: number;
  sembrada: boolean;
  humedadVWC: number;
  nutrientesNPK: number;
  gddAcumulados: number;
  frame60: number;
  cosechada: boolean;
  diasCultivo: number;
  maleza: number;
  plaga: number;
  polinizacion: number;
  tutorado: boolean;
  proteccion: 0 | 1 | 2;
  calidad: number;
  frijolVid: number;
  calabazaCobertura: number;
  plantaInterna: Planta;
}

export interface PartidaGuardada {
  id: string;
  nombre: string;
  dificultad: DificultadMundo;
  presetClima: PresetClimaMundo;
  semillaMundo: string;
  actualizadoEn: number;
  diaMaximo: number;
  clima: ClimateState;
  nodos: NodoGuardado[];
  slotsJugador: (ItemStack | null)[];
  slotsTroje: (ItemStack | null)[];
  almacenPorVariedad: Record<TipoSemilla, number>;
}

const STORAGE_KEY_WORLDS = "milpaviva.mundos.v1";

export function climaDesdePreset(preset: PresetClimaMundo): ClimateState {
  switch (preset) {
    case "temporal":
      return {
        ...CLIMA_INICIAL,
        temperatura: 21,
        humedad: 78,
        lluvia: 9,
        nubosidad: 65,
        viento: 3.4,
        humedadSuelo: 34
      };
    case "sequia":
      return {
        ...CLIMA_INICIAL,
        temperatura: 33,
        humedad: 28,
        lluvia: 0,
        nubosidad: 10,
        viento: 4.2,
        humedadSuelo: 14
      };
    case "helada":
      return {
        ...CLIMA_INICIAL,
        temperatura: 3,
        humedad: 52,
        lluvia: 0,
        nubosidad: 35,
        viento: 2.8,
        humedadSuelo: 24
      };
    case "templado":
    default:
      return { ...CLIMA_INICIAL };
  }
}

export function listarPartidas(): PartidaGuardada[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WORLDS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => (b.actualizadoEn || 0) - (a.actualizadoEn || 0));
  } catch {
    return [];
  }
}

export function guardarPartida(partida: PartidaGuardada): void {
  try {
    const actuales = listarPartidas().filter((p) => p.id !== partida.id);
    actuales.unshift(partida);
    localStorage.setItem(STORAGE_KEY_WORLDS, JSON.stringify(actuales.slice(0, 12)));
  } catch {
    // Almacenamiento bloqueado o lleno en contexto sandbox
  }
}

export function cargarPartida(id: string): PartidaGuardada | null {
  return listarPartidas().find((p) => p.id === id) || null;
}

export function eliminarPartida(id: string): void {
  try {
    const restantes = listarPartidas().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY_WORLDS, JSON.stringify(restantes));
  } catch {
    // No-op
  }
}
