/**
 * Modelo de Datos del Inventario Estilo Minecraft (v4.1 — Milpa Viva VR)
 *
 * Fuente única de verdad para herramientas, semillas, cosechas (elote R3 vs grano seco R6),
 * huitlacoche y quelites, con notificaciones por lote y consumo consciente de variedad.
 */

import { TipoSemilla } from "../nucleo";

export type CategoriaItem = "herramienta" | "cosecha" | "semilla" | "insumo";

export interface DefItem {
  id: string;
  nombre: string;
  icono: string; // Clave en ICONOS_PIXEL
  maxStack: number;
  categoria: CategoriaItem;
  descripcion?: string;
}

export interface ItemStack {
  id: string;
  cantidad: number;
  meta?: {
    variedad?: string;
    calidad?: number; // 0..1
    madurez?: "elote" | "grano_seco";
  };
}

export const DEFS: Record<string, DefItem> = {
  mano: {
    id: "mano",
    nombre: "Manos Libres",
    icono: "mano",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Palpa plantas, deshierba y retira plagas con tus manos"
  },
  azada: {
    id: "azada",
    nombre: "Azada Campesina",
    icono: "azada",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Labra los surcos y abre zanjas de drenaje en suelos encharcados"
  },
  semilla: {
    id: "semilla",
    nombre: "Semillas de Maíz",
    icono: "grano",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Granos criollos seleccionados para la siembra"
  },
  regadera: {
    id: "regadera",
    nombre: "Regadera Campesina",
    icono: "regadera",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Riega la tierra para mantener la humedad óptima de cada raza"
  },
  abono: {
    id: "abono",
    nombre: "Abono Orgánico (Composta NPK)",
    icono: "abono",
    maxStack: 64,
    categoria: "insumo",
    descripcion: "Nutrientes N-P-K orgánicos para el vigor y llenado de grano"
  },
  sol: {
    id: "sol",
    nombre: "Energía Solar (+15 Días)",
    icono: "sol",
    maxStack: 1,
    categoria: "insumo",
    descripcion: "Acelera el ciclo biológico de la milpa con autopausa en alertas"
  },
  guante: {
    id: "guante",
    nombre: "Guante de Cosecha",
    icono: "mano",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Permite pizcar mazorcas maduras sin dañar la planta"
  },
  cosecha: {
    id: "cosecha",
    nombre: "Guante de Cosecha",
    icono: "mazorca",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Pizca elotes tiernos (R3) o mazorcas secas de semilla (R6)"
  },
  mazorca: {
    id: "mazorca",
    nombre: "Mazorca de Maíz",
    icono: "mazorca",
    maxStack: 64,
    categoria: "cosecha",
    descripcion: "Fruto de la milpa: almacénalo en la troje, cocínalo o desgránalo en semilla"
  },
  huitlacoche: {
    id: "huitlacoche",
    nombre: "Huitlacoche Gourmet",
    icono: "huitlacoche",
    maxStack: 64,
    categoria: "cosecha",
    descripcion: "Hongo comestible Ustilago maydis apreciado en la alta cocina mexicana"
  },
  quelite: {
    id: "quelite",
    nombre: "Quelites de la Milpa",
    icono: "abono",
    maxStack: 64,
    categoria: "cosecha",
    descripcion: "Quintonil, verdolaga, quelite cenizo y epazote frescos para el Fogón"
  },
  grano: {
    id: "grano",
    nombre: "Grano de Maíz",
    icono: "grano",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Semilla criolla desgranada para continuar el ciclo agrícola"
  },
  frijol: {
    id: "frijol",
    nombre: "Semilla de Frijol Ayocote",
    icono: "frijol",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Phaseolus coccineus: fija nitrógeno (Rhizobium) y refuerza el tallo"
  },
  calabaza: {
    id: "calabaza",
    nombre: "Semilla de Calabaza Criolla",
    icono: "calabaza",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Cucurbita pepo: acolchado vivo que conserva humedad y frena malezas"
  },
  semilla_chalqueno: {
    id: "semilla_chalqueno",
    nombre: "Semilla Maíz Chalqueño",
    icono: "grano_chalqueno",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Raza dentada de Valles Altos (3.5 m), alto rendimiento y demanda de NPK"
  },
  semilla_azul: {
    id: "semilla_azul",
    nombre: "Semilla Maíz Azul Cónico",
    icono: "grano_azul",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Raza de alta montaña rica en antocianinas y gran resistencia a heladas"
  },
  semilla_rojo: {
    id: "semilla_rojo",
    nombre: "Semilla Maíz Rojo (Sangre de Cristo)",
    icono: "grano_rojo",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Cónico Norteño: campeón en secano y sequía, sensible al encharcamiento"
  },
  semilla_palomero: {
    id: "semilla_palomero",
    nombre: "Semilla Palomero Toluqueño",
    icono: "grano_palomero",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Subespecie everta reventadora de porte bajo (2.1 m) y doble raíz zanco"
  }
};

export const MAPA_ITEM_VARIEDAD: Record<string, TipoSemilla> = {
  semilla_chalqueno: "chalqueno",
  semilla_azul: "azul",
  semilla_rojo: "rojo",
  semilla_palomero: "palomero"
};

export function variedadDeItemId(id: string): TipoSemilla | undefined {
  return MAPA_ITEM_VARIEDAD[id];
}

export function itemIdSemillaPorVariedad(v: TipoSemilla): string {
  switch (v) {
    case "azul":
      return "semilla_azul";
    case "rojo":
      return "semilla_rojo";
    case "palomero":
      return "semilla_palomero";
    default:
      return "semilla_chalqueno";
  }
}

export const tierCalidad = (c = 0.5): number => (c >= 0.85 ? 2 : c >= 0.6 ? 1 : 0);

export const claveItem = (s: ItemStack): string =>
  `${s.id}|${s.meta?.variedad ?? ""}|${s.meta?.madurez ?? ""}|${tierCalidad(s.meta?.calidad)}`;

export const mismaClase = (a: ItemStack, b: ItemStack): boolean =>
  claveItem(a) === claveItem(b);

export class Inventario {
  readonly slots: (ItemStack | null)[];
  private oyentes: Array<() => void> = [];

  constructor(public readonly tamano: number) {
    this.slots = Array.from({ length: tamano }, () => null);
  }

  suscribir(cb: () => void): () => void {
    this.oyentes.push(cb);
    return () => {
      this.oyentes = this.oyentes.filter((x) => x !== cb);
    };
  }

  notificar(): void {
    for (let i = 0; i < this.oyentes.length; i++) {
      this.oyentes[i]();
    }
  }

  private anadirSilencioso(stack: ItemStack): number {
    if (stack.cantidad <= 0) return 0;
    const def = DEFS[stack.id] || { maxStack: 64 };
    const max = def.maxStack;
    let resto = stack.cantidad;

    // 1) Completar pilas existentes compatibles
    for (let i = 0; i < this.slots.length; i++) {
      if (resto <= 0) break;
      const s = this.slots[i];
      if (s && mismaClase(s, stack) && s.cantidad < max) {
        const mov = Math.min(max - s.cantidad, resto);
        s.cantidad += mov;
        resto -= mov;
      }
    }

    // 2) Asignar a ranuras vacías
    for (let i = 0; i < this.slots.length && resto > 0; i++) {
      if (!this.slots[i]) {
        const mov = Math.min(max, resto);
        this.slots[i] = {
          id: stack.id,
          cantidad: mov,
          meta: stack.meta ? { ...stack.meta } : undefined
        };
        resto -= mov;
      }
    }

    return resto;
  }

  /**
   * Añade una pila; devuelve la cantidad que NO cupo (0 si todo cupo).
   */
  anadir(stack: ItemStack): number {
    const resto = this.anadirSilencioso(stack);
    this.notificar();
    return resto;
  }

  cuenta(id: string): number {
    let total = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        total += s.cantidad;
      }
    }
    return total;
  }

  contar(id: string): number {
    return this.cuenta(id);
  }

  agregar(stack: ItemStack): { sobrante: number } {
    return { sobrante: this.anadir(stack) };
  }

  consumirUno(slotIndex: number): boolean {
    const s = this.slots[slotIndex];
    if (!s || s.cantidad <= 0) return false;
    s.cantidad -= 1;
    if (s.cantidad <= 0) {
      this.slots[slotIndex] = null;
    }
    this.notificar();
    return true;
  }

  consumirPorId(id: string, cantidad = 1): boolean {
    if (this.cuenta(id) < cantidad) return false;
    let pendiente = cantidad;
    for (let i = 0; i < this.slots.length && pendiente > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.cantidad > 0) {
        const tomar = Math.min(s.cantidad, pendiente);
        s.cantidad -= tomar;
        pendiente -= tomar;
        if (s.cantidad <= 0) {
          this.slots[i] = null;
        }
      }
    }
    this.notificar();
    return true;
  }

  /**
   * Consume 1 mazorca (priorizando la variedad preferida si se indica) y devuelve sus metadatos reales.
   */
  consumirMazorca(variedadPreferida?: string): {
    exito: boolean;
    variedad?: string;
    calidad: number;
    madurez?: "elote" | "grano_seco";
  } {
    const prefLower = variedadPreferida?.toLowerCase();
    let idx = -1;
    if (prefLower) {
      idx = this.slots.findIndex(
        (s) =>
          s &&
          s.id === "mazorca" &&
          s.cantidad > 0 &&
          (s.meta?.variedad || "").toLowerCase().includes(prefLower)
      );
    }
    if (idx < 0) {
      idx = this.slots.findIndex((s) => s && s.id === "mazorca" && s.cantidad > 0);
    }
    if (idx < 0) return { exito: false, calidad: 0 };

    const s = this.slots[idx]!;
    const variedad = s.meta?.variedad || "chalqueno";
    const calidad = s.meta?.calidad ?? 0.85;
    const madurez = s.meta?.madurez;
    s.cantidad -= 1;
    if (s.cantidad <= 0) this.slots[idx] = null;
    this.notificar();
    return { exito: true, variedad, calidad, madurez };
  }

  limpiar(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = null;
    }
    this.notificar();
  }

  cuentaPorVariedad(id: string, variedad: string): number {
    let total = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.meta?.variedad === variedad) {
        total += s.cantidad;
      }
    }
    return total;
  }

  /**
   * Mueve una cantidad del slot `i` a otro inventario (p. ej. Shift+Clic).
   * Devuelve lo que no cupo en el destino.
   */
  moverA(destino: Inventario, i: number, cantidad?: number, silenciarNotif = false): number {
    const s = this.slots[i];
    if (!s) return 0;
    const n = Math.min(cantidad ?? s.cantidad, s.cantidad);
    if (n <= 0) return 0;

    const copiaParaDestino: ItemStack = {
      id: s.id,
      cantidad: n,
      meta: s.meta ? { ...s.meta } : undefined
    };

    const sobra = destino.anadirSilencioso(copiaParaDestino);
    const transferido = n - sobra;
    s.cantidad -= transferido;

    if (s.cantidad <= 0) {
      this.slots[i] = null;
    }

    if (!silenciarNotif && transferido > 0) {
      this.notificar();
      destino.notificar();
    }
    return sobra;
  }

  /**
   * Mueve todos los ítems de un tipo (o todos desde `desdeSlot`) hacia el inventario destino
   * con una sola notificación por lote. Devuelve la cantidad total movida.
   */
  moverTodoDe(destino: Inventario, id?: string, desdeSlot = 0): number {
    let totalMovido = 0;
    for (let i = desdeSlot; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && (!id || s.id === id)) {
        const cantAntes = s.cantidad;
        const sobra = this.moverA(destino, i, cantAntes, true);
        totalMovido += cantAntes - sobra;
      }
    }
    if (totalMovido > 0) {
      this.notificar();
      destino.notificar();
    }
    return totalMovido;
  }

  /**
   * Ordena el inventario compactando pilas iguales y agrupando por categoría
   */
  ordenar(): void {
    const stacks: ItemStack[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.cantidad > 0) {
        stacks.push(s);
        this.slots[i] = null;
      }
    }

    // Compactar respetando mismaClase (variedad + madurez + tierCalidad)
    for (let i = 0; i < stacks.length; i++) {
      const a = stacks[i];
      if (a.cantidad <= 0) continue;
      const max = DEFS[a.id]?.maxStack ?? 64;
      for (let j = i + 1; j < stacks.length; j++) {
        const b = stacks[j];
        if (b.cantidad > 0 && mismaClase(a, b)) {
          const espacio = max - a.cantidad;
          if (espacio > 0) {
            const mov = Math.min(espacio, b.cantidad);
            a.cantidad += mov;
            b.cantidad -= mov;
          }
        }
      }
    }

    const validos = stacks.filter((s) => s.cantidad > 0);
    validos.sort((a, b) => {
      if (a.id !== b.id) return a.id.localeCompare(b.id);
      const varA = a.meta?.variedad || "";
      const varB = b.meta?.variedad || "";
      return varA.localeCompare(varB);
    });

    for (let i = 0; i < validos.length && i < this.tamano; i++) {
      this.slots[i] = validos[i];
    }

    this.notificar();
  }

  serializar(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s, meta: s.meta ? { ...s.meta } : undefined } : null));
  }

  deserializar(datos: (ItemStack | null)[]): void {
    if (!Array.isArray(datos)) return;
    for (let i = 0; i < this.tamano; i++) {
      const d = datos[i];
      if (d && d.id && d.cantidad > 0) {
        this.slots[i] = {
          id: d.id,
          cantidad: d.cantidad,
          meta: d.meta ? { ...d.meta } : undefined
        };
      } else {
        this.slots[i] = null;
      }
    }
    this.notificar();
  }
}
