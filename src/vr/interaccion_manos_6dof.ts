/**
 * Controlador de Interacción 6DoF y Cinemática de Herramientas (v4.0)
 *
 * Administra:
 * - Instancias de ManoVR (izquierda y derecha) con velocidad EMA, sacudida, inclinación y háptica segura (H3, M1).
 * - Resolución espacial sobre el nodo más cercano a la mano (H4: RADIO_INTERACCION_M = 0.55 m).
 * - Detección física de golpe de Azada (velocidad vertical < -1.2 m/s y potencia 0.5..1.4).
 * - Riego continuo proporcional al ángulo de inclinación de la Regadera (smoothstep 35°..110°).
 * - Sacudida de espiga para polinización manual (> 3 Hz) y jalón de maleza/quelites.
 * - Soporte complementario bidireccional para ratón, teclado y pantallas táctiles.
 */

import {
  Scene,
  Vector3,
  WebXRDefaultExperience,
  WebXRInputSource,
  PointerEventTypes
} from "@babylonjs/core";
import { SurcoMilpa } from "../surco_milpa";
import { CanastaRecoleccion3D } from "./canasta_cosecha";
import { Herramientas3D } from "../educativo/herramientas_3d";
import {
  HerramientaTipo,
  variedadDeHerramienta
} from "../educativo/estado_educativo";
import { ParticulasEducativas } from "../educativo/particulas_educativas";
import { ManoVR } from "./mano_vr";
import { AjustesSistema } from "../juego/ajustes";
import { clamp, smoothstep } from "../juego/util";

export class InteraccionManos6DoF {
  readonly scene: Scene;
  readonly surco: SurcoMilpa;
  readonly canasta: CanastaRecoleccion3D | null;
  readonly herramientas: Herramientas3D | null;
  readonly particulas: ParticulasEducativas | null;
  public xr: WebXRDefaultExperience | null;
  public ajustes: AjustesSistema | null = null;

  public manoIzq: ManoVR;
  public manoDer: ManoVR;

  public herramientaActiva: HerramientaTipo = "azada";
  public readonly RADIO_INTERACCION_M = 0.55;

  private ultimoGolpeAzadaMs = 0;
  private ultimoAbonoMs = 0;
  private ultimaPolinizacionMs = 0;

  public onMensajeToast?: (texto: string) => void;
  public onSacudidaPolen?: (nodoId: number) => void;
  public onJalonMaleza?: (nodoId: number, velocidadY: number) => void;
  public onCosecharMazorca?: (nodoId: number, variedad: any, calidad: number) => void;
  public modoFPSActivo = true;

  constructor(
    scene: Scene,
    surco: SurcoMilpa,
    canasta: CanastaRecoleccion3D | null,
    herramientas: Herramientas3D | null,
    particulas: ParticulasEducativas | null,
    xr: WebXRDefaultExperience | null = null,
    ajustes: AjustesSistema | null = null
  ) {
    this.scene = scene;
    this.surco = surco;
    this.canasta = canasta;
    this.herramientas = herramientas;
    this.particulas = particulas;
    this.xr = xr;
    this.ajustes = ajustes;

    this.manoIzq = new ManoVR("left", xr);
    this.manoDer = new ManoVR("right", xr);

    if (this.xr) {
      this.vincularXR(this.xr);
    }
    this.configurarPunteroDesktop();
  }

  /**
   * H1: Vincula la experiencia WebXR y sus controladores 6DoF
   */
  public vincularXR(xr: WebXRDefaultExperience): void {
    this.xr = xr;
    if (!xr.input) return;

    xr.input.onControllerAddedObservable.add((controller: WebXRInputSource) => {
      controller.onMotionControllerInitObservable.add((motionController) => {
        // Gatillo principal (Trigger) -> Accionar herramienta sobre el nodo más cercano a la mano (H4)
        const trigger = motionController.getComponent("xr-standard-trigger");
        if (trigger) {
          trigger.onButtonStateChangedObservable.add((component) => {
            if (component.pressed) {
              const pos = controller.grip ? controller.grip.position : controller.pointer.position;
              const nodoCercano = this.surco.obtenerNodoCercano(pos);
              if (Vector3.Distance(pos, nodoCercano.posicionMundo) <= this.RADIO_INTERACCION_M * 1.4) {
                this.ejecutarAccionEnNodo(nodoCercano.id);
              } else {
                this.ejecutarAccionEnNodoActual();
              }
            }
          });
        }

        // Gatillo lateral (Grip) -> Agarre de mazorca
        const squeeze = motionController.getComponent("xr-standard-squeeze");
        if (squeeze) {
          squeeze.onButtonStateChangedObservable.add((component) => {
            if (component.pressed) {
              const pos = controller.grip ? controller.grip.position : controller.pointer.position;
              this.intentarCosechaManual(pos);
            }
          });
        }
      });
    });
  }

  /**
   * Obtiene la mano dominante activa según los ajustes de accesibilidad
   */
  public obtenerManoDominante(): ManoVR {
    if (this.ajustes && this.ajustes.valores.manoDominante === "left") {
      return this.manoIzq;
    }
    return this.manoDer;
  }

  /**
   * Obtiene la mano no dominante (donde se ancla el Reloj de Muñeca)
   */
  public obtenerManoNoDominante(): ManoVR {
    if (this.ajustes && this.ajustes.valores.manoDominante === "left") {
      return this.manoDer;
    }
    return this.manoIzq;
  }

  /**
   * H3, H4 & M1: Bucle por frame que evalúa gestos físicos 6DoF (velocidad de golpe, inclinación, sacudida)
   */
  public actualizar(dt: number): void {
    const fHaptico = this.ajustes ? this.ajustes.valores.intensidadHaptica : 1.0;
    this.manoIzq.factorHaptico = fHaptico;
    this.manoDer.factorHaptico = fHaptico;

    this.manoIzq.actualizar(dt);
    this.manoDer.actualizar(dt);

    const mano = this.obtenerManoDominante();
    if (!mano.conectada) return;

    const nodoCercano = this.surco.obtenerNodoCercano(mano.pos);
    const dist = Vector3.Distance(mano.pos, nodoCercano.posicionMundo);
    if (dist > this.RADIO_INTERACCION_M) return;

    // Seleccionar automáticamente el nodo más cercano a la mano en VR (H4)
    this.surco.nodoSeleccionadoId = nodoCercano.id;

    const ahora = performance.now();
    const factorUmbral = this.ajustes ? this.ajustes.factorUmbralGesto : 1.0;

    // 1. Azada física por golpe descendente (v.y < -1.2 m/s)
    if (this.herramientaActiva === "azada") {
      if (mano.vel.y < -1.2 * factorUmbral && ahora - this.ultimoGolpeAzadaMs > 550) {
        this.ultimoGolpeAzadaMs = ahora;
        const potencia = clamp((-mano.vel.y) / 2.0, 0.5, 1.4);
        const res = this.surco.arar(nodoCercano.id, potencia);
        mano.pulso(0.7 * clamp(potencia, 0.5, 1.0), 45);
        if (this.herramientas) this.herramientas.animarAzada();
        if (this.onMensajeToast) this.onMensajeToast(res.mensaje);
      }
    }
    // 2. Regadera continua proporcional al ángulo de inclinación (35° a 110°)
    else if (this.herramientaActiva === "regadera") {
      const angulo = mano.anguloInclinacionGrados;
      if (angulo > 35) {
        const caudal = smoothstep(35, 110, angulo);
        this.surco.regarContinuo(nodoCercano.id, caudal, dt);
        mano.pulso(0.18 * caudal, 16);
      }
    }
    // 3. Abono por gesto de esparcir con gatillo presionado
    else if (this.herramientaActiva === "abono") {
      if (mano.velEscalar > 0.9 * factorUmbral && mano.gatillo > 0.4 && ahora - this.ultimoAbonoMs > 800) {
        this.ultimoAbonoMs = ahora;
        const res = this.surco.abonar(nodoCercano.id);
        mano.pulso(0.35, 30);
        if (this.onMensajeToast) this.onMensajeToast(res.mensaje);
      }
    }

    // 4. Polinización manual sacudiendo la espiga (> 3 Hz) cerca de la parte alta de la planta
    if (
      mano.frecuenciaSacudida > 3.0 * factorUmbral &&
      mano.pos.y > 0.9 &&
      ahora - this.ultimaPolinizacionMs > 700
    ) {
      this.ultimaPolinizacionMs = ahora;
      mano.pulso(0.25, 25);
      if (this.onSacudidaPolen) {
        this.onSacudidaPolen(nodoCercano.id);
      }
    }

    // 5. Jalón vertical con grip para arrancar maleza/quelites a ras de suelo
    if (
      mano.agarre > 0.6 &&
      mano.pos.y < 0.55 &&
      mano.vel.y > 0.35 * factorUmbral &&
      nodoCercano.maleza > 5
    ) {
      if (this.onJalonMaleza) {
        this.onJalonMaleza(nodoCercano.id, mano.vel.y);
        mano.pulso(0.4, 30);
      }
    }
  }

  /**
   * Configura la interacción con ratón o toque de pantalla (solo activo en modo Orbital sin PointerLock)
   */
  private configurarPunteroDesktop(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (this.modoFPSActivo || document.pointerLockElement) return;
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const pick = pointerInfo.pickInfo;
        if (pick && pick.hit && pick.pickedMesh) {
          const meshName = pick.pickedMesh.name;

          // 1. Clic directo en un montículo o camellón
          if (meshName.includes("monticuloNodo_") || meshName.includes("charcoNodo_")) {
            const idStr = meshName.split("_")[1];
            const nodoId = parseInt(idStr, 10);
            if (!isNaN(nodoId)) {
              this.ejecutarAccionEnNodo(nodoId);
            }
          }
          // 2. Clic directo en una mazorca lista para cosechar
          else if (
            meshName.includes("cob") ||
            meshName.includes("husk") ||
            meshName.includes("silk") ||
            meshName.includes("shank")
          ) {
            const nodoCercano = this.surco.obtenerNodoCercano(pick.pickedMesh.getAbsolutePosition());
            this.intentarCosechaNodo(nodoCercano.id);
          }
          // 3. Clic directo en la espiga (tassel) -> Polinización manual en Desktop (M5)
          else if (meshName.includes("tassel")) {
            const nodoCercano = this.surco.obtenerNodoCercano(pick.pickedMesh.getAbsolutePosition());
            if (this.onSacudidaPolen) {
              this.onSacudidaPolen(nodoCercano.id);
            }
          }
        }
      }
    });
  }

  /**
   * Ejecuta la herramienta activa sobre la estación actualmente seleccionada
   */
  public ejecutarAccionEnNodoActual(): void {
    this.ejecutarAccionEnNodo(this.surco.nodoSeleccionadoId);
  }

  /**
   * Ejecuta la acción agronómica sobre un nodo específico
   */
  public ejecutarAccionEnNodo(nodoId: number): void {
    const nodo = this.surco.nodos[nodoId];
    if (!nodo) return;

    this.surco.nodoSeleccionadoId = nodoId;
    const mano = this.obtenerManoDominante();

    switch (this.herramientaActiva) {
      case "azada": {
        const resA = this.surco.arar(nodoId, 1.0);
        mano.pulso(0.6, 40);
        if (this.herramientas) {
          this.herramientas.animarAzada();
        }
        if (this.onMensajeToast) this.onMensajeToast(resA.mensaje);
        break;
      }

      case "semilla":
      case "semilla_chalqueno":
      case "semilla_azul":
      case "semilla_rojo":
      case "semilla_palomero": {
        const varElegida = variedadDeHerramienta(this.herramientaActiva) ?? undefined;
        const resS = this.surco.sembrar(nodoId, varElegida);
        mano.pulso(0.3, 25);
        if (this.herramientas && resS.exito) {
          this.herramientas.animarSemilla();
        }
        if (this.onMensajeToast) this.onMensajeToast(resS.mensaje);
        break;
      }

      case "regadera": {
        const resR = this.surco.regar(nodoId);
        mano.pulso(0.35, 30);
        if (this.herramientas) {
          this.herramientas.animarRegadera();
        }
        if (this.onMensajeToast) this.onMensajeToast(resR.mensaje);
        break;
      }

      case "abono": {
        const resAb = this.surco.abonar(nodoId);
        mano.pulso(0.35, 25);
        if (this.herramientas) {
          this.herramientas.animarAbono();
        }
        if (this.onMensajeToast) this.onMensajeToast(resAb.mensaje);
        break;
      }

      case "cosecha": {
        this.intentarCosechaNodo(nodoId);
        break;
      }

      case "mano": {
        const dia = nodo.diasCultivo;
        const estaMuerta = nodo.sembrada && (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta);
        if (
          nodo.sembrada &&
          !nodo.cosechada &&
          (dia >= 145 || (estaMuerta && nodo.plantaInterna.causaMuerte === "agotamiento"))
        ) {
          this.intentarCosechaNodo(nodoId);
        } else if (nodo.maleza > 5) {
          if (this.onJalonMaleza) {
            this.onJalonMaleza(nodoId, 0.8);
          }
          mano.pulso(0.4, 30);
          if (this.onMensajeToast) this.onMensajeToast(`🌿 Deshierbaste a mano en estación #${nodoId + 1}`);
        } else if (!nodo.sembrada && nodo.tierraArada < 100) {
          const resA = this.surco.arar(nodoId, 0.5);
          mano.pulso(0.35, 25);
          if (this.onMensajeToast) this.onMensajeToast(resA.mensaje);
        } else if (!nodo.sembrada && nodo.tierraArada >= 100) {
          const resS = this.surco.sembrar(nodoId);
          mano.pulso(0.3, 20);
          if (this.onMensajeToast) this.onMensajeToast(resS.mensaje);
        } else {
          mano.pulso(0.2, 15);
          if (this.onMensajeToast) {
            this.onMensajeToast(
              `✋ Suelo: Humedad ${Math.round(nodo.humedadVWC)}% VWC, Nutrientes ${Math.round(nodo.nutrientesNPK)}% NPK (Día ${Math.floor(dia)})`
            );
          }
        }
        break;
      }
    }
  }

  /**
   * Intenta cosechar la mazorca de un nodo y soltar los drops físicos 3D / depositar en canasta
   */
  public intentarCosechaNodo(nodoId: number): void {
    const res = this.surco.cosechar(nodoId);
    if (res.exito && res.variedad) {
      this.obtenerManoDominante().pulso(0.65, 50);
      if (this.onCosecharMazorca) {
        this.onCosecharMazorca(nodoId, res.variedad, res.calidad || 0.9);
      } else if (this.canasta) {
        const nodo = this.surco.nodos[nodoId];
        this.canasta.depositarMazorca(
          res.variedad,
          nodo.posicionMundo.add(new Vector3(0, 1.2, 0)),
          res.calidad || 1.0
        );
      }
    }
    if (this.onMensajeToast) {
      this.onMensajeToast(res.mensaje);
    }
  }

  /**
   * Intenta cosecha física manual si la mano está cerca del elote
   */
  public intentarCosechaManual(posMano: Vector3): void {
    const nodo = this.surco.obtenerNodoCercano(posMano);
    const posMazorca = nodo.posicionMundo.add(new Vector3(0, 1.1, 0));
    const dist = Vector3.Distance(posMano, posMazorca);
    if (dist < 0.65) {
      this.intentarCosechaNodo(nodo.id);
    }
  }
}
