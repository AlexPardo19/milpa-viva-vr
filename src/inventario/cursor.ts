/**
 * Cursor y Reglas de Manipulación de Ítems Estilo Minecraft (v4.0 — Milpa Viva VR)
 *
 * Implementa semántica Minecraft de clics en ranuras:
 *  - Clic Izquierdo: recoger pila / colocar todo / intercambiar / apilar.
 *  - Clic Derecho: recoger la mitad / colocar 1 unidad.
 *  - Shift + Clic: transferencia rápida entre inventarios (jugador <-> cofre/troje).
 */

import { HerramientaTipo } from "../educativo/estado_educativo";
import { Inventario, ItemStack, DEFS, mismaClase } from "./inventario";

export class CursorInventario {
  public enMano: ItemStack | null = null;
  private oyentes: Array<() => void> = [];

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
   * Clic izquierdo:
   *  - Sin ítem en mano: recoge la pila completa.
   *  - Con ítem en mano y ranura vacía: coloca toda la pila en mano.
   *  - Misma clase: apila hasta maxStack y retiene el sobrante en mano.
   *  - Distinta clase: intercambia lo que está en mano con la ranura.
   */
  clicIzq(inv: Inventario, i: number): void {
    const s = inv.slots[i];

    if (!this.enMano) {
      if (s) {
        this.enMano = s;
        inv.slots[i] = null;
      }
    } else if (!s) {
      inv.slots[i] = this.enMano;
      this.enMano = null;
    } else if (mismaClase(s, this.enMano)) {
      const max = (DEFS[s.id]?.maxStack ?? 64);
      const mov = Math.min(max - s.cantidad, this.enMano.cantidad);
      if (mov > 0) {
        s.cantidad += mov;
        this.enMano.cantidad -= mov;
        if (this.enMano.cantidad <= 0) {
          this.enMano = null;
        }
      }
    } else {
      // Intercambio
      inv.slots[i] = this.enMano;
      this.enMano = s;
    }

    inv.notificar();
    this.notificar();
  }

  /**
   * Clic derecho:
   *  - Sin ítem en mano y ranura ocupada: toma la mitad de la pila (redondeo hacia arriba).
   *  - Con ítem en mano y ranura vacía: coloca 1 unidad.
   *  - Con ítem en mano y misma clase: añade 1 unidad si no excede maxStack.
   *  - Con ítem en mano y distinta clase: intercambia.
   */
  clicDer(inv: Inventario, i: number): void {
    const s = inv.slots[i];

    if (!this.enMano && s) {
      const mitad = Math.ceil(s.cantidad / 2);
      this.enMano = {
        id: s.id,
        cantidad: mitad,
        meta: s.meta ? { ...s.meta } : undefined
      };
      s.cantidad -= mitad;
      if (s.cantidad <= 0) {
        inv.slots[i] = null;
      }
    } else if (this.enMano && (!s || mismaClase(s, this.enMano))) {
      const max = (DEFS[this.enMano.id]?.maxStack ?? 64);
      if (!s) {
        inv.slots[i] = {
          id: this.enMano.id,
          cantidad: 1,
          meta: this.enMano.meta ? { ...this.enMano.meta } : undefined
        };
        this.enMano.cantidad--;
      } else if (s.cantidad < max) {
        s.cantidad++;
        this.enMano.cantidad--;
      } else {
        return; // Pila llena
      }

      if (this.enMano.cantidad <= 0) {
        this.enMano = null;
      }
    } else if (this.enMano && s) {
      // Intercambio
      inv.slots[i] = this.enMano;
      this.enMano = s;
    }

    inv.notificar();
    this.notificar();
  }

  /**
   * Shift + Clic: Mueve la pila al inventario opuesto de inmediato
   */
  shiftClic(origen: Inventario, i: number, destino: Inventario): void {
    origen.moverA(destino, i);
  }
}

/**
 * Determina qué herramienta lógica se activa según el ítem en la ranura activa de la hotbar.
 */
export function herramientaDeSlot(s: ItemStack | null): HerramientaTipo {
  if (!s) return "mano";
  const mapa: Record<string, HerramientaTipo> = {
    azada: "azada",
    semilla: "semilla",
    semilla_chalqueno: "semilla_chalqueno",
    semilla_azul: "semilla_azul",
    semilla_rojo: "semilla_rojo",
    semilla_palomero: "semilla_palomero",
    grano: "semilla",
    regadera: "regadera",
    abono: "abono",
    sol: "sol",
    guante: "cosecha",
    cosecha: "cosecha",
    frijol: "frijol",
    calabaza: "calabaza",
    mano: "mano"
  };
  return mapa[s.id] ?? "mano";
}
