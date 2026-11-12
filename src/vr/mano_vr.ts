/**
 * Fase 0 y M1: ManoVR — Seguimiento 6DoF, Velocidad EMA, Oscilación y Háptica (Zero-GC)
 *
 * Calcula en cada fotograma sin asignar objetos en el heap:
 * - Posición mundial y orientación del mando o mano XR.
 * - Velocidad tridimensional suavizada por media móvil exponencial (EMA 60/40).
 * - Frecuencia de sacudida vertical en Hz (para polinización manual y sonaja).
 * - Ángulo de inclinación respecto a la vertical (para el caudal continuo de la regadera).
 * - Pulsos hápticos seguros modulados por la configuración de accesibilidad (M14).
 */

import {
  AbstractMesh,
  Vector3,
  WebXRDefaultExperience,
  WebXRAbstractMotionController
} from "@babylonjs/core";

export type LadoMano = "left" | "right";

export class ManoVR {
  public conectada = false;
  public grip: AbstractMesh | null = null;
  public pointer: AbstractMesh | null = null;

  // Estado preasignado (Zero-GC)
  public readonly pos = new Vector3();
  public readonly vel = new Vector3();
  public readonly dirUp = new Vector3(0, 1, 0);
  public velEscalar = 0;
  public gatillo = 0;            // 0..1
  public agarre = 0;             // 0..1
  public frecuenciaSacudida = 0; // Hz aprox.
  public anguloInclinacionGrados = 0; // 0° vertical -> 90° horizontal

  private readonly posPrev = new Vector3();
  private tienePrev = false;
  private mc: WebXRAbstractMotionController | null = null;

  // Detección de cruces por cero de velocidad vertical
  private signoPrev = 0;
  private tUltimoCruce = 0;
  private tAcum = 0;

  // Multiplicador de intensidad háptica desde AjustesSistema (M14)
  public factorHaptico = 1.0;

  constructor(public readonly lado: LadoMano, xr: WebXRDefaultExperience | null) {
    if (!xr || !xr.input) return;

    xr.input.onControllerAddedObservable.add((src) => {
      src.onMotionControllerInitObservable.add((mc) => {
        if (mc.handedness !== this.lado) return;
        this.mc = mc;
        this.grip = src.grip ?? src.pointer;
        this.pointer = src.pointer;
        this.conectada = true;

        const trig = mc.getComponent("xr-standard-trigger");
        const sq = mc.getComponent("xr-standard-squeeze");
        trig?.onButtonStateChangedObservable.add((c) => {
          this.gatillo = c.value;
        });
        sq?.onButtonStateChangedObservable.add((c) => {
          this.agarre = c.value;
        });
      });
    });

    xr.input.onControllerRemovedObservable.add((src) => {
      if (src.grip === this.grip || src.pointer === this.pointer) {
        this.conectada = false;
        this.mc = null;
        this.grip = null;
        this.pointer = null;
      }
    });
  }

  /**
   * Llamar una vez por fotograma con dt en segundos.
   */
  public actualizar(dt: number): void {
    if (!this.grip || dt <= 0) return;
    this.pos.copyFrom(this.grip.absolutePosition);

    if (this.tienePrev) {
      const k = 1 / dt;
      // EMA: 60% valor nuevo, 40% histórico (reduce ruido del tracking)
      this.vel.x = this.vel.x * 0.4 + (this.pos.x - this.posPrev.x) * k * 0.6;
      this.vel.y = this.vel.y * 0.4 + (this.pos.y - this.posPrev.y) * k * 0.6;
      this.vel.z = this.vel.z * 0.4 + (this.pos.z - this.posPrev.z) * k * 0.6;
      this.velEscalar = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    }
    this.posPrev.copyFrom(this.pos);
    this.tienePrev = true;

    // Ángulo de inclinación del mando para regadera continua (M1)
    if (this.grip.up) {
      this.dirUp.copyFrom(this.grip.up);
      const dotY = Math.max(-1, Math.min(1, this.dirUp.y));
      this.anguloInclinacionGrados = (Math.acos(dotY) * 180) / Math.PI;
    }

    // Frecuencia de sacudida vertical (cruces por cero)
    this.tAcum += dt;
    const s = this.vel.y > 0.35 ? 1 : this.vel.y < -0.35 ? -1 : 0;
    if (s !== 0 && s !== this.signoPrev) {
      if (this.signoPrev !== 0) {
        const semi = this.tAcum - this.tUltimoCruce;
        if (semi > 0.04) {
          this.frecuenciaSacudida = 0.5 / semi;
        }
      }
      this.signoPrev = s;
      this.tUltimoCruce = this.tAcum;
    }
    if (this.tAcum - this.tUltimoCruce > 0.55) {
      this.frecuenciaSacudida = 0;
    }
  }

  /**
   * Háptica segura: nunca lanza excepción si el mando o navegador no la soporta.
   */
  public pulso(intensidad: number, ms: number): void {
    const f = this.factorHaptico;
    if (f <= 0) return;
    try {
      this.mc?.pulse(Math.min(1, Math.max(0, intensidad * f)), ms);
    } catch {
      // Dispositivo sin actuador háptico
    }
  }
}
