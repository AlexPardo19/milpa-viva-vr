/**
 * Utilidades matemáticas y vectores preasignados (Zero-GC) para Milpa Viva v4.0
 *
 * Regla de oro: evitar `new Vector3` o `new Color3` dentro de bucles por fotograma.
 */

import { Vector3, Color3 } from "@babylonjs/core";

export const _tmpA = new Vector3();
export const _tmpB = new Vector3();
export const _tmpC = new Vector3();
export const _tmpD = new Vector3();
export const _tmpColA = new Color3();
export const _tmpColB = new Color3();

export const clamp = (x: number, min: number, max: number): number =>
  x < min ? min : x > max ? max : x;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Generador pseudoaleatorio determinista (Mulberry32).
 * Evita depender de Math.random() cuando se requiere reproducibilidad por semilla.
 */
export function crearRng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
