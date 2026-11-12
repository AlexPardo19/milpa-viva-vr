/**
 * Modelo de Datos del Inventario Estilo Minecraft (v4.0 — Milpa Viva VR)
 *
 * Soporta ranuras fijas, apilado hasta maxStack (64 o 1), clasificación por variedad
 * y calidad de grano/mazorca, eventos reactivos y persistencia.
 */

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
  };
}

export const DEFS: Record<string, DefItem> = {
  mano: {
    id: "mano",
    nombre: "Manos Libres",
    icono: "mano",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Palpa plantas, deshierba y recoge maleza con tus manos"
  },
  azada: {
    id: "azada",
    nombre: "Azada Campesina",
    icono: "azada",
    maxStack: 1,
    categoria: "herramienta",
    descripcion: "Labra y airea los surcos para preparar la tierra"
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
    descripcion: "Riega la tierra para mantener la humedad óptima"
  },
  abono: {
    id: "abono",
    nombre: "Abono Orgánico (Composta)",
    icono: "abono",
    maxStack: 64,
    categoria: "insumo",
    descripcion: "Nutrientes orgánicos para el desarrollo del maíz"
  },
  sol: {
    id: "sol",
    nombre: "Energía Solar (+15 Días)",
    icono: "sol",
    maxStack: 1,
    categoria: "insumo",
    descripcion: "Acelera el ciclo biológico de la milpa"
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
    descripcion: "Pizca mazorcas listas para el troje"
  },
  mazorca: {
    id: "mazorca",
    nombre: "Mazorca de Maíz",
    icono: "mazorca",
    maxStack: 64,
    categoria: "cosecha",
    descripcion: "Fruto de la milpa, listo para almacenar o desgranar"
  },
  grano: {
    id: "grano",
    nombre: "Grano de Maíz",
    icono: "grano",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Semilla criolla para continuar el ciclo agrícola"
  },
  frijol: {
    id: "frijol",
    nombre: "Semilla de Frijol Ayocote",
    icono: "frijol",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Fija nitrógeno en el suelo y se enreda en el tallo del maíz"
  },
  calabaza: {
    id: "calabaza",
    nombre: "Semilla de Calabaza Criolla",
    icono: "calabaza",
    maxStack: 64,
    categoria: "semilla",
    descripcion: "Cubre el suelo conservando la humedad y controlando malezas"
  }
};

export const tierCalidad = (c = 0.5): number => (c >= 0.85 ? 2 : c >= 0.6 ? 1 : 0);

export const claveItem = (s: ItemStack): string =>
  `${s.id}|${s.meta?.variedad ?? ""}|${tierCalidad(s.meta?.calidad)}`;

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

  /**
   * Añade una pila; devuelve la cantidad que NO cupo (0 si todo cupo).
   */
  anadir(stack: ItemStack): number {
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
  moverA(destino: Inventario, i: number, cantidad?: number): number {
    const s = this.slots[i];
    if (!s) return 0;
    const n = Math.min(cantidad ?? s.cantidad, s.cantidad);
    if (n <= 0) return 0;

    const copiaParaDestino: ItemStack = {
      id: s.id,
      cantidad: n,
      meta: s.meta ? { ...s.meta } : undefined
    };

    const sobra = destino.anadir(copiaParaDestino);
    const transferido = n - sobra;
    s.cantidad -= transferido;

    if (s.cantidad <= 0) {
      this.slots[i] = null;
    }

    this.notificar();
    destino.notificar();
    return sobra;
  }

  /**
   * Mueve todos los ítems de un tipo (o todos si no se pasa id) hacia el inventario destino.
   */
  moverTodoDe(destino: Inventario, id?: string): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && (!id || s.id === id)) {
        this.moverA(destino, i);
      }
    }
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

    // Compactar
    for (let i = 0; i < stacks.length; i++) {
      const a = stacks[i];
      if (a.cantidad <= 0) continue;
      const max = (DEFS[a.id]?.maxStack ?? 64);
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
    // Ordenar por tipo de ítem y variedad
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
