/**
 * Sistema de Locomoción Confortable para Realidad Virtual y Desktop (v4.0)
 *
 * Provee:
 * 1. Teletransporte nativo WebXR (WebXRFeatureName.TELEPORTATION) con snap points y giro discreto (30°).
 * 2. Teletransporte instantáneo anti-mareo entre las 6 estaciones, el Cobertizo, el Fogón y el Banco de Semillas.
 * 3. Sincronización del rig WebXR (`xr.baseExperience.camera`) y cámara desktop (`ArcRotateCamera`).
 * 4. Viñeta de confort dinámica anti-cinetosis.
 */

import {
  Scene,
  Vector3,
  ArcRotateCamera,
  WebXRDefaultExperience,
  WebXRFeatureName,
  WebXRState,
  Mesh,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { SurcoMilpa } from "../surco_milpa";
import { CarritoAgricola3D } from "./canasta_cosecha";
import { AjustesSistema } from "../juego/ajustes";

export class LocomocionVR {
  readonly scene: Scene;
  readonly surco: SurcoMilpa;
  readonly carrito: CarritoAgricola3D | null;
  readonly camara: ArcRotateCamera | null;
  public xr: WebXRDefaultExperience | null;
  public ajustes: AjustesSistema | null = null;

  public nodoActualIndex = 0;
  public enLobby = true;
  public onTeletransportar?: (posicion: Vector3, mirarA: Vector3) => void;

  constructor(
    scene: Scene,
    surco: SurcoMilpa,
    carrito: CarritoAgricola3D | null,
    camara: ArcRotateCamera | null,
    xr: WebXRDefaultExperience | null = null,
    ajustes: AjustesSistema | null = null
  ) {
    this.scene = scene;
    this.surco = surco;
    this.carrito = carrito;
    this.camara = camara;
    this.xr = xr;
    this.ajustes = ajustes;

    this.configurarPadsTeletransporte();
    if (this.xr) {
      this.vincularXR(this.xr);
    }
  }

  /**
   * H1 & H6: Configura el feature nativo de Teletransporte WebXR con puntos de anclaje y Snap Turn (30°)
   */
  public vincularXR(xr: WebXRDefaultExperience): void {
    this.xr = xr;
    try {
      const fm = xr.baseExperience.featuresManager;
      const snapPoints: Vector3[] = this.surco.nodos.map(
        (n) => new Vector3(n.x, 0, -1.25)
      );
      // Puntos adicionales: Lobby (Cobertizo), Fogón de Cocina y Banco de Semillas
      snapPoints.push(new Vector3(0, 0, -2.5));
      snapPoints.push(new Vector3(2.8, 0, -2.4));
      snapPoints.push(new Vector3(-2.2, 0, -2.6));

      const pisos: Mesh[] = this.surco.nodos.map((n) => n.marcadorTeleport);
      const sueloBase = this.scene.getMeshByName("ground") as Mesh | null;
      if (sueloBase) pisos.push(sueloBase);

      fm.enableFeature(WebXRFeatureName.TELEPORTATION, "stable", {
        xrInput: xr.input,
        floorMeshes: pisos,
        snapPositions: snapPoints,
        snapToPositionRadius: 0.75,
        parabolicRayEnabled: true,
        rotationEnabled: true,
        rotationAngle: Math.PI / 6, // 30° snap turn confortable
        timeToTeleport: 120
      });
    } catch {
      // Fallback silencioso si el navegador emulado no soporta featuresManager completo
    }
  }

  /**
   * Registra interacción al tocar o hacer clic sobre los pads de huellas circulares
   */
  private configurarPadsTeletransporte(): void {
    for (const nodo of this.surco.nodos) {
      const pad = nodo.marcadorTeleport;
      pad.actionManager = new ActionManager(this.scene);
      pad.actionManager.registerAction(
        new ExecuteCodeAction(
          ActionManager.OnPickTrigger,
          () => {
            this.teletransportarANodo(nodo.id);
          }
        )
      );
    }
  }

  /**
   * Traslada al jugador frente a una estación específica de la hilera (H6)
   */
  public teletransportarANodo(nodoId: number): void {
    const nodo = this.surco.nodos[nodoId];
    if (!nodo) return;

    this.nodoActualIndex = nodoId;
    this.surco.nodoSeleccionadoId = nodoId;
    this.enLobby = false;

    if (this.ajustes) {
      this.ajustes.activarVinetaConfort(260);
    }

    // Acompañar con la carretilla agrícola
    if (this.carrito) {
      this.carrito.targetX = nodo.x;
    }

    // Si estamos dentro de sesión inmersiva WebXR, mover la cámara XR real
    if (
      this.xr &&
      this.xr.baseExperience &&
      this.xr.baseExperience.state === WebXRState.IN_XR
    ) {
      const alturaOjos = this.ajustes?.valores.modoSentado ? 1.45 : 1.6;
      this.xr.baseExperience.camera.position.set(nodo.x, alturaOjos, -1.25);
    }

    // Teletransporte de cámara Desktop / Fallback
    if (this.camara) {
      const targetPos = new Vector3(nodo.x, 0.95, 0);
      this.camara.target = targetPos;
      this.camara.alpha = -Math.PI / 2;
      this.camara.beta = Math.PI / 2.38;
      this.camara.radius = 2.4;
    }

    // Resaltar pad activo
    for (let i = 0; i < this.surco.nodos.length; i++) {
      const n = this.surco.nodos[i];
      n.marcadorTeleport.scaling.setAll(i === nodoId ? 1.25 : 1.0);
    }

    this.onTeletransportar?.(
      new Vector3(nodo.x, 1.55, -1.35),
      new Vector3(nodo.x, 1.05, 0)
    );
  }

  /**
   * Regresa la vista al Cobertizo / Mesa de Control Climatológico
   */
  public teletransportarALobby(): void {
    this.enLobby = true;
    if (this.ajustes) {
      this.ajustes.activarVinetaConfort(260);
    }

    if (
      this.xr &&
      this.xr.baseExperience &&
      this.xr.baseExperience.state === WebXRState.IN_XR
    ) {
      const alturaOjos = this.ajustes?.valores.modoSentado ? 1.45 : 1.6;
      this.xr.baseExperience.camera.position.set(0, alturaOjos, -2.5);
    }

    if (this.camara) {
      this.camara.target = new Vector3(0, 1.15, -3.8);
      this.camara.alpha = -Math.PI / 2;
      this.camara.beta = Math.PI / 2.45;
      this.camara.radius = 2.8;
    }

    this.onTeletransportar?.(
      new Vector3(0, 1.55, -1.9),
      new Vector3(0, 1.15, -3.8)
    );
  }

  /**
   * Teletransporta al jugador frente al Fogón de Cocina Tradicional (M8)
   */
  public teletransportarAFogon(): void {
    this.enLobby = true;
    if (this.ajustes) {
      this.ajustes.activarVinetaConfort(260);
    }

    if (
      this.xr &&
      this.xr.baseExperience &&
      this.xr.baseExperience.state === WebXRState.IN_XR
    ) {
      const alturaOjos = this.ajustes?.valores.modoSentado ? 1.45 : 1.6;
      this.xr.baseExperience.camera.position.set(2.8, alturaOjos, -2.3);
    }

    if (this.camara) {
      this.camara.target = new Vector3(2.8, 0.9, -3.4);
      this.camara.alpha = -Math.PI / 2;
      this.camara.beta = Math.PI / 2.4;
      this.camara.radius = 2.2;
    }

    this.onTeletransportar?.(
      new Vector3(2.8, 1.55, -2.1),
      new Vector3(2.8, 0.95, -3.4)
    );
  }

  /**
   * Teletransporta al jugador frente a la Mesa del Banco de Semillas (M9)
   */
  public teletransportarABancoSemillas(): void {
    this.enLobby = true;
    if (this.ajustes) {
      this.ajustes.activarVinetaConfort(260);
    }

    if (
      this.xr &&
      this.xr.baseExperience &&
      this.xr.baseExperience.state === WebXRState.IN_XR
    ) {
      const alturaOjos = this.ajustes?.valores.modoSentado ? 1.45 : 1.6;
      this.xr.baseExperience.camera.position.set(-2.2, alturaOjos, -2.5);
    }

    if (this.camara) {
      this.camara.target = new Vector3(-2.2, 0.95, -3.6);
      this.camara.alpha = -Math.PI / 2;
      this.camara.beta = Math.PI / 2.4;
      this.camara.radius = 2.2;
    }

    this.onTeletransportar?.(
      new Vector3(-2.8, 1.55, -2.1),
      new Vector3(-3.0, 0.95, -3.4)
    );
  }
}
