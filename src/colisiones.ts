/**
 * Colisiones físicas sencillas (XZ) para objetos sólidos de la parcela.
 *
 * Cada objeto sólido se registra con su caja envolvente en el plano del suelo.
 * El jugador (círculo de radio RADIO_JUGADOR) es empujado fuera de ellas, de modo
 * que ya no se puedan atravesar el dispensador, la mesa de clima, el fogón, etc.
 */

import { Mesh, TransformNode, Vector3 } from "@babylonjs/core";

interface CajaSolida {
  nombre: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const RADIO_JUGADOR = 0.32;
const cajas: CajaSolida[] = [];

export function registrarCaja(nombre: string, cx: number, cz: number, ancho: number, fondo: number): void {
  cajas.push({
    nombre,
    minX: cx - ancho / 2,
    maxX: cx + ancho / 2,
    minZ: cz - fondo / 2,
    maxZ: cz + fondo / 2,
  });
}

/**
 * Registra como sólido el contorno en planta de un nodo y sus descendientes.
 * Solo cuentan mallas bajas (que tocan el suelo), para no bloquear con elementos flotantes.
 */
export function registrarSolidoDesdeNodo(nodo: TransformNode, nombre: string, margen = 0): void {
  nodo.computeWorldMatrix(true);
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  const mallas = nodo.getChildMeshes(false) as Mesh[];
  if (nodo instanceof Mesh) mallas.push(nodo);
  for (const m of mallas) {
    if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    if (bb.minimumWorld.y > 0.9) continue; // elementos elevados no bloquean el paso
    if (bb.maximumWorld.y < 0.08) continue; // losas planas no son obstáculos
    min = Vector3.Minimize(min, bb.minimumWorld);
    max = Vector3.Maximize(max, bb.maximumWorld);
  }
  if (!isFinite(min.x)) return;
  cajas.push({
    nombre,
    minX: min.x - margen,
    maxX: max.x + margen,
    minZ: min.z - margen,
    maxZ: max.z + margen,
  });
}

/** Resuelve la colisión de un punto (círculo) contra todas las cajas; modifica pos in-place. */
export function resolverColisiones(pos: { x: number; z: number }, radio = RADIO_JUGADOR): void {
  for (let iter = 0; iter < 3; iter++) {
    let movido = false;
    for (const c of cajas) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radio * radio) continue;

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radio;
        pos.z = cz + (dz / d) * radio;
      } else {
        // El centro quedó dentro de la caja: expulsar por el lado más cercano
        const izq = pos.x - c.minX;
        const der = c.maxX - pos.x;
        const aba = pos.z - c.minZ;
        const arr = c.maxZ - pos.z;
        const m = Math.min(izq, der, aba, arr);
        if (m === izq) pos.x = c.minX - radio;
        else if (m === der) pos.x = c.maxX + radio;
        else if (m === aba) pos.z = c.minZ - radio;
        else pos.z = c.maxZ + radio;
      }
      movido = true;
    }
    if (!movido) break;
  }
}
