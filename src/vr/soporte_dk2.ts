/**
 * Soporte para Oculus Rift DK2 (y cualquier visor solo-cabeza / 3DoF-6DoF sin controles de mano)
 *
 * El DK2 únicamente ofrece seguimiento de cabeza: no tiene controles Touch. Este módulo agrega:
 *
 * 1. Interacción por MIRADA (gaze) dentro de WebXR: una retícula 3D sigue el centro de la vista y la acción
 *    se dispara con Clic / Espacio (teclado-ratón) o con el botón A / RT de un gamepad (Xbox, etc.).
 *      - Mirar un montículo  -> usa la herramienta equipada (arar, sembrar, regar, abonar...)
 *      - Mirar una mazorca   -> cosechar
 *      - Mirar una espiga    -> polinizar
 *      - Mirar una huella    -> teletransportarse a esa estación
 *      - Mirar a Don Elote   -> escuchar un dato
 * 2. Locomoción en WebXR con teclado (WASD / flechas, giro discreto 30° con ← →) o gamepad
 *    (stick izquierdo = caminar, stick derecho = giro 30°).
 * 3. Gamepad también en escritorio / modo estéreo (A usar, B/LB/RB herramienta, X Don Elote, Y estación).
 * 4. MODO ESTÉREO SIDE-BY-SIDE (SBS) de respaldo con distorsión de lentes calibrada para el DK2
 *    (pantalla 1920x1080, IPD 64 mm). Se activa con [F8] o el botón «👓 DK2 Estéreo [F8]».
 * 5. Lectura directa del giroscopio USB del DK2 vía WebHID ([F9] o «🧭 Giroscopio DK2 [F9]») con
 *    calibración automática inicial y keep-alive sin depender de Meta Horizon Link ni SteamVR.
 */

import {
  Scene,
  Vector3,
  Quaternion,
  Color3,
  Mesh,
  AbstractMesh,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Ray,
  Axis,
  WebXRDefaultExperience,
  WebXRState,
  VRDeviceOrientationFreeCamera,
  VRCameraMetrics,
  Camera,
  Nullable
} from "@babylonjs/core";
import { SurcoMilpa } from "../surco_milpa";
import { ControladorJugador } from "../controlador_jugador";
import { InteraccionManos6DoF } from "./interaccion_manos_6dof";
import { LocomocionVR } from "./locomocion_vr";
import { EspantapajarosGuia } from "../educativo/espantapajaros_guia";

type TipoObjetivoMirada = "ninguno" | "nodo" | "cosecha" | "polen" | "teleport" | "donElote";

interface ObjetivoMirada {
  tipo: TipoObjetivoMirada;
  nodoId: number;
  punto: Vector3 | null;
  distancia: number;
}

export interface SlotHotbarVR {
  id: string;
  cantidad: number;
}

export interface EstadoInventarioVR {
  slots: Array<SlotHotbarVR | null>;
  mochila: Array<SlotHotbarVR | null>;
  slotActivo: number;
  mazorcasTroje: number;
  inventarioAbierto: boolean;
}

export interface OpcionesSoporteDK2 {
  onToast?: (msg: string) => void;
  onSiguienteEstacion?: () => void;
  onAsegurarJuegoActivo?: () => void;
  onCambioModoVR?: (enVR: boolean) => void;
  obtenerHotbar?: () => EstadoInventarioVR;
}

export type PerfilOpticoDK2 = "normal" | "amplio" | "plano";

/** Métricas ópticas calibradas para el Oculus Rift DK2 (panel 1920x1080 OLED, IPD 64 mm, lentes 63.5 mm) */
export function crearMetricasDK2(perfil: PerfilOpticoDK2 = "normal"): VRCameraMetrics {
  const m = VRCameraMetrics.GetDefault();
  m.hResolution = 1920;
  m.vResolution = 1080;
  m.hScreenSize = 0.12576;
  m.vScreenSize = 0.07074;
  m.vScreenCenter = 0.07074 / 2;
  m.eyeToScreenDistance = 0.041;
  m.lensSeparationDistance = 0.0635;
  m.interpupillaryDistance = 0.064;
  m.chromaAbCorrection = [0.996, -0.004, 1.014, 0.0];
  m.lensCenterOffset = 1 - (2 * m.lensSeparationDistance) / m.hScreenSize;
  if (perfil === "plano") {
    m.distortionK = [1.0, 0.0, 0.0, 0.0];
    m.postProcessScaleFactor = 1.0;
    m.compensateDistortion = false;
  } else if (perfil === "amplio") {
    m.distortionK = [1.0, 0.06, 0.04, 0.0];
    m.postProcessScaleFactor = 1.1;
    m.compensateDistortion = true;
  } else {
    // Coeficientes ajustados al aspecto 960x1080 por ojo del DK2 sin recorte excesivo de bordes
    m.distortionK = [1.0, 0.12, 0.1, 0.0];
    m.postProcessScaleFactor = 1.22;
    m.compensateDistortion = true;
  }
  return m;
}

const ZONA_MUERTA = 0.22;
const VELOCIDAD_XR_MS = 1.6;
const GIRO_DISCRETO = Math.PI / 6;

export class SoporteDK2 {
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  readonly surco: SurcoMilpa;
  readonly jugador: ControladorJugador;
  readonly interaccion: InteraccionManos6DoF;
  readonly locomocion: LocomocionVR;
  readonly espantapajaros: EspantapajarosGuia | null;
  readonly opciones: OpcionesSoporteDK2;
  public xr: WebXRDefaultExperience | null;

  /** Cámara estéreo SBS de respaldo (null cuando el modo está apagado) */
  public camaraSBS: Nullable<VRDeviceOrientationFreeCamera> = null;
  private camaraPreviaSBS: Nullable<Camera> = null;

  private reticula: TransformNode;
  private matReticula: StandardMaterial;
  private objetivo: ObjetivoMirada = { tipo: "ninguno", nodoId: -1, punto: null, distancia: 0 };

  private teclas: Record<string, boolean> = {};
  private botonesPrevios: boolean[] = [];
  private stickGiroArmado = true;
  private botonUI: HTMLButtonElement | null = null;
  private botonGyroUI: HTMLButtonElement | null = null;
  private hidDevice: any = null;
  private hidKeepAliveTimer: number | null = null;
  private hidInputHandler: ((ev: any) => void) | null = null;
  private autoReconnectRegistrado = false;
  private ultimoPaqueteHidMs = 0;
  private ultimoTsUs: number | null = null;
  private gyroBiasX = 0;
  private gyroBiasY = 0;
  private gyroCalibSumX = 0;
  private gyroCalibSumY = 0;
  private gyroCalibCount = 0;
  private pendingDeltaYaw = 0;
  private pendingDeltaPitch = 0;
  private hidPacketsReceived = 0;
  /** Sensibilidad del giroscopio (0.2 – 1.5). Ajustable con [F6] / [F7] */
  private sensibilidadGyro = 0.85;
  /** Velocidad angular filtrada (pasa-bajas) para eliminar picos/ticks */
  private gxFiltrado = 0;
  private gyFiltrado = 0;
  /** ReportID del sensor fijado al primer paquete válido (evita mezclar reportes distintos) */
  private reportIdSensor: number | null = null;

  private hud3DPlane: Mesh | null = null;
  private hud3DTex: DynamicTexture | null = null;
  private hud3DKey = "";
  private hudModo: "normal" | "compacto" | "oculto" = "normal";
  private perfilOptico: PerfilOpticoDK2 = "normal";
  private escalaRenderSBS = 1.0;
  private scalingPrevioEngine: number | null = null;
  private resizeTimerId: number | null = null;
  private mensajeVRTexto = "";
  private mensajeVRExpiraMs = 0;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    surco: SurcoMilpa,
    jugador: ControladorJugador,
    interaccion: InteraccionManos6DoF,
    locomocion: LocomocionVR,
    espantapajaros: EspantapajarosGuia | null,
    xr: WebXRDefaultExperience | null,
    opciones: OpcionesSoporteDK2 = {}
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.surco = surco;
    this.jugador = jugador;
    this.interaccion = interaccion;
    this.locomocion = locomocion;
    this.espantapajaros = espantapajaros;
    this.xr = xr;
    this.opciones = opciones;

    const r = this.crearReticula();
    this.reticula = r.nodo;
    this.matReticula = r.mat;

    try {
      const guardada = parseFloat(localStorage.getItem("milpa_dk2_sens_v2") ?? "");
      if (!isNaN(guardada)) this.sensibilidadGyro = Math.max(0.2, Math.min(1.5, guardada));
    } catch {}

    this.configurarEntrada();
    this.crearBotonUI();
    if (xr) this.vincularXR(xr);

    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
      this.actualizar(dt);
    });
  }

  get enXR(): boolean {
    return !!this.xr && this.xr.baseExperience.state === WebXRState.IN_XR;
  }

  get enSBS(): boolean {
    return this.camaraSBS !== null;
  }

  get usarMiradaXR(): boolean {
    if (!this.enXR || !this.xr) return false;
    return this.xr.input.controllers.every((c) => !c.motionController);
  }

  private vincularXR(xr: WebXRDefaultExperience): void {
    xr.baseExperience.onStateChangedObservable.add((estado) => {
      if (estado === WebXRState.IN_XR) {
        if (this.enSBS) this.desactivarSBS();
        this.jugador.entradaBloqueadaXR = true;
        if (document.pointerLockElement) document.exitPointerLock();
        setTimeout(() => {
          const cam = xr.baseExperience.camera;
          if (cam.position.y < 0.8) cam.position.y = 1.35;
        }, 400);
        this.opciones.onToast?.(
          "🥽 Visor VR activo: mira un objeto y pulsa Clic / Espacio / botón A para interactuar"
        );
      } else if (estado === WebXRState.NOT_IN_XR) {
        this.jugador.entradaBloqueadaXR = false;
        this.reticula.setEnabled(false);
      }
    });
  }

  public alternarSBS(): void {
    if (this.enSBS) this.desactivarSBS();
    else this.activarSBS();
  }

  private crearCamaraSBS(): VRDeviceOrientationFreeCamera {
    const fps = this.jugador.camaraFPS;
    const metricas = crearMetricasDK2(this.perfilOptico);
    const cam = new VRDeviceOrientationFreeCamera(
      "camaraDK2_SBS",
      fps.position.clone(),
      this.scene,
      metricas.compensateDistortion,
      metricas
    );
    cam.inputs.clear();
    cam.minZ = fps.minZ;
    cam.maxZ = fps.maxZ;
    cam.rotationQuaternion = Quaternion.FromEulerVector(fps.rotation);
    return cam;
  }

  private forzarRedimension(): void {
    const engine = this.scene.getEngine();
    engine.resize();
    if (this.resizeTimerId !== null) {
      window.clearTimeout(this.resizeTimerId);
    }
    this.resizeTimerId = window.setTimeout(() => {
      this.resizeTimerId = null;
      this.scene.getEngine().resize();
    }, 120);
  }

  public activarSBS(): void {
    if (this.enSBS || this.enXR) return;
    this.cerrarModalBienvenida();
    if (this.jugador.modo !== "fps") this.jugador.activarModo("fps");

    const engine = this.scene.getEngine();
    this.scalingPrevioEngine = engine.getHardwareScalingLevel();
    if (Math.abs(this.escalaRenderSBS - 1.0) > 0.01) {
      engine.setHardwareScalingLevel(1 / this.escalaRenderSBS);
    }

    const cam = this.crearCamaraSBS();
    this.camaraPreviaSBS = this.jugador.camaraFPS;
    this.camaraSBS = cam;
    this.scene.activeCamera = cam;

    // Sincronizar PrePassRenderer AHORA (antes del 1er frame VR) para que scene.prePass sea false
    // y postProcessManager._prepareFrame() inicialice VRDistortionCorrectionPostProcess sin crashear.
    this.opciones.onCambioModoVR?.(true);
    if (this.scene.prePassRenderer) {
      this.scene.prePassRenderer.markAsDirty();
      this.scene.prePassRenderer.update();
    }

    document.body.classList.add("modo-dk2-sbs");
    const elemFS = document.documentElement;
    if (!document.fullscreenElement && elemFS.requestFullscreen) {
      elemFS.requestFullscreen().catch(() => {});
    }
    this.forzarRedimension();
    this.actualizarBotonUI();
    this.mostrarMensajeVR(
      `👓 DK2 Estéreo (${Math.round(this.escalaRenderSBS * 100)}% res · F3 Lente · F4 Res · F10 HUD · Esc/F8 Salir)`,
      4200
    );
  }

  public desactivarSBS(): void {
    if (!this.camaraSBS) return;
    const previa =
      this.jugador.modo === "fps"
        ? this.jugador.camaraFPS
        : (this.camaraPreviaSBS ?? this.jugador.camaraFPS);

    // Restaurar la cámara activa ANTES de destruir la cámara SBS para mantener íntegro el pipeline
    this.scene.activeCamera = previa;
    const vieja = this.camaraSBS;
    this.camaraSBS = null;
    this.camaraPreviaSBS = null;
    vieja.dispose();

    if (this.scalingPrevioEngine !== null) {
      this.scene.getEngine().setHardwareScalingLevel(this.scalingPrevioEngine);
      this.scalingPrevioEngine = null;
    }
    this.reticula.setEnabled(false);
    if (this.hud3DPlane) this.hud3DPlane.setEnabled(false);
    document.body.classList.remove("modo-dk2-sbs");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    this.opciones.onCambioModoVR?.(false);
    if (this.scene.prePassRenderer) {
      this.scene.prePassRenderer.markAsDirty();
      this.scene.prePassRenderer.update();
    }
    this.jugador.camaraFPS.computeWorldMatrix();
    this.forzarRedimension();
    this.actualizarBotonUI();
  }

  /** Muestra un aviso o diálogo dentro del HUD 3D para que sea legible con el visor puesto */
  public mostrarMensajeVR(texto: string, duracionMs = 4500): void {
    const limpio = String(texto || "").replace(/\s+/g, " ").trim();
    if (!limpio) return;
    this.mensajeVRTexto = limpio;
    this.mensajeVRExpiraMs = performance.now() + duracionMs;
    this.hud3DKey = "";
  }

  private actualizar(dt: number): void {
    // 1. Aplicar directamente los deltas filtrados del giroscopio en el frame actual (respuesta inmediata)
    if (Math.abs(this.pendingDeltaYaw) > 1e-6 || Math.abs(this.pendingDeltaPitch) > 1e-6) {
      const fps = this.jugador.camaraFPS;
      fps.rotation.y += this.pendingDeltaYaw;
      fps.rotation.x += this.pendingDeltaPitch;
      const maxPitch = Math.PI / 2.2;
      fps.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, fps.rotation.x));
      this.pendingDeltaYaw = 0;
      this.pendingDeltaPitch = 0;
    }

    if (this.enSBS) {
      if (this.jugador.modo !== "fps") {
        this.jugador.activarModo("fps");
        this.scene.activeCamera = this.camaraSBS;
      }
      this.jugador.camaraFPS.computeWorldMatrix();
    }

    if (this.camaraSBS) {
      const fps = this.jugador.camaraFPS;
      if (this.scene.activeCamera !== this.camaraSBS) this.scene.activeCamera = this.camaraSBS;
      this.camaraSBS.position.copyFrom(fps.position);
      Quaternion.FromEulerVectorToRef(fps.rotation, this.camaraSBS.rotationQuaternion!);
    }

    this.procesarGamepad(dt);
    if (this.enXR) this.procesarTecladoXR(dt);

    if (this.usarMiradaXR) {
      this.objetivo = this.calcularObjetivoMirada();
      this.posicionarReticulaXR();
      if (this.hud3DPlane) this.hud3DPlane.setEnabled(false);
    } else if (this.enSBS) {
      this.posicionarReticulaSBS();
      this.actualizarHud3DSBS();
    } else {
      this.reticula.setEnabled(false);
      if (this.hud3DPlane) this.hud3DPlane.setEnabled(false);
    }
  }

  private calcularObjetivoMirada(): ObjetivoMirada {
    const vacio: ObjetivoMirada = { tipo: "ninguno", nodoId: -1, punto: null, distancia: 0 };
    if (!this.xr) return vacio;
    const cam = this.xr.baseExperience.camera;
    const origen = cam.globalPosition.clone();
    const dir = cam.getDirection(Axis.Z);
    const ray = new Ray(origen, dir, 30);

    const pick = this.scene.pickWithRay(ray, (m) => this.esPickeable(m));
    if (!pick || !pick.hit || !pick.pickedMesh || !pick.pickedPoint) return vacio;

    const mesh = pick.pickedMesh;
    const punto = pick.pickedPoint.clone();
    const base = { punto, distancia: pick.distance };

    const idxPad = this.surco.nodos.findIndex((n) => n.marcadorTeleport === mesh);
    if (idxPad >= 0) return { tipo: "teleport", nodoId: this.surco.nodos[idxPad].id, ...base };

    const nombre = mesh.name;
    if (nombre.includes("monticuloNodo_") || nombre.includes("charcoNodo_")) {
      const id = parseInt(nombre.split("_")[1], 10);
      if (!isNaN(id)) return { tipo: "nodo", nodoId: id, ...base };
    }
    if (/cob|husk|silk|shank/i.test(nombre)) {
      return { tipo: "cosecha", nodoId: this.surco.obtenerNodoCercano(punto).id, ...base };
    }
    if (/tassel/i.test(nombre)) {
      return { tipo: "polen", nodoId: this.surco.obtenerNodoCercano(punto).id, ...base };
    }
    if (this.tieneAncestro(mesh, "espantapajarosRoot")) {
      return { tipo: "donElote", nodoId: -1, ...base };
    }
    const cercano = this.surco.obtenerNodoCercano(punto);
    if (Vector3.Distance(punto, cercano.posicionMundo) < 0.9) {
      return { tipo: "nodo", nodoId: cercano.id, ...base };
    }
    return { tipo: "ninguno", nodoId: -1, ...base };
  }

  private esPickeable(m: AbstractMesh): boolean {
    if (!m.isPickable || !m.isEnabled() || !m.isVisible) return false;
    if (this.tieneAncestro(m, "reticulaDK2")) return false;
    let p = m.parent;
    while (p) {
      if (p instanceof Camera) return false;
      p = p.parent;
    }
    return true;
  }

  private tieneAncestro(m: AbstractMesh, nombre: string): boolean {
    let p: any = m;
    while (p) {
      if (p.name === nombre) return true;
      p = p.parent;
    }
    return false;
  }

  private cerrarModalBienvenida(): boolean {
    this.opciones.onAsegurarJuegoActivo?.();
    const pausa = document.getElementById("menuPausaMinecraft");
    if (pausa && pausa.style.display !== "none") {
      pausa.style.display = "none";
    }
    const modal = document.getElementById("modalControlesBienvenida");
    if (modal && modal.style.display !== "none") {
      const btnCerrar = document.getElementById("btnCerrarModalControlesX") as HTMLButtonElement | null;
      if (btnCerrar) btnCerrar.click();
      else modal.style.display = "none";
      return true;
    }
    return false;
  }

  public accionPrincipal(): void {
    if (this.cerrarModalBienvenida()) return;
    if (!this.enXR) {
      this.jugador.usarHerramientaActiva();
      return;
    }
    const obj = this.usarMiradaXR ? this.objetivo : this.calcularObjetivoMirada();
    switch (obj.tipo) {
      case "nodo":
        this.interaccion.ejecutarAccionEnNodo(obj.nodoId);
        break;
      case "cosecha":
        this.interaccion.intentarCosechaNodo(obj.nodoId);
        break;
      case "polen":
        this.interaccion.onSacudidaPolen?.(obj.nodoId);
        break;
      case "teleport":
        this.locomocion.teletransportarANodo(obj.nodoId);
        this.opciones.onToast?.(`👣 Estación ${obj.nodoId + 1}`);
        break;
      case "donElote":
        this.espantapajaros?.compartirSiguienteDato();
        break;
      default:
        this.interaccion.ejecutarAccionEnNodoActual();
    }
  }

  private crearReticula(): { nodo: TransformNode; mat: StandardMaterial } {
    const nodo = new TransformNode("reticulaDK2", this.scene);
    nodo.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    const mat = new StandardMaterial("matReticulaDK2", this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;

    const anillo = MeshBuilder.CreateTorus(
      "reticulaDK2_anillo",
      { diameter: 0.05, thickness: 0.008, tessellation: 32 },
      this.scene
    );
    anillo.rotation.x = Math.PI / 2;
    const punto = MeshBuilder.CreateDisc("reticulaDK2_punto", { radius: 0.006, tessellation: 16 }, this.scene);

    for (const m of [anillo, punto] as Mesh[]) {
      m.parent = nodo;
      m.material = mat;
      m.isPickable = false;
      m.renderingGroupId = 3;
      m.alwaysSelectAsActiveMesh = true;
    }
    nodo.setEnabled(false);
    return { nodo, mat };
  }

  private posicionarReticulaXR(): void {
    if (!this.xr) return;
    const cam = this.xr.baseExperience.camera;
    const dist = this.objetivo.punto ? Math.min(this.objetivo.distancia, 6) : 2.5;
    const pos = cam.globalPosition.add(cam.getDirection(Axis.Z).scale(Math.max(dist - 0.02, 0.4)));
    this.reticula.parent = null;
    this.reticula.position.copyFrom(pos);
    this.reticula.scaling.setAll(Math.max(dist, 0.5));
    this.matReticula.emissiveColor =
      this.objetivo.tipo === "ninguno" ? new Color3(1, 1, 1) : new Color3(0.35, 1, 0.35);
    this.reticula.setEnabled(true);
  }

  private posicionarReticulaSBS(): void {
    const fps = this.jugador.camaraFPS;
    this.reticula.parent = null;
    this.reticula.position.copyFrom(fps.position.add(fps.getDirection(Axis.Z).scale(2)));
    this.reticula.scaling.setAll(2);
    const enfocado = this.jugador.tipoObjetivoEnfocado !== "ninguno";
    this.matReticula.emissiveColor = enfocado ? new Color3(0.35, 1, 0.35) : new Color3(1, 1, 1);
    this.reticula.setEnabled(true);
  }

  private actualizarHud3DSBS(): void {
    const hotbar = this.opciones.obtenerHotbar?.();
    const inventarioAbierto = !!hotbar?.inventarioAbierto;

    if (this.hudModo === "oculto" && !inventarioAbierto) {
      if (this.hud3DPlane) this.hud3DPlane.setEnabled(false);
      return;
    }

    if (!this.hud3DPlane || !this.hud3DTex) {
      const tex = new DynamicTexture("texHud3DDK2", { width: 1024, height: 320 }, this.scene, true);
      tex.hasAlpha = true;
      tex.anisotropicFilteringLevel = 4;
      const mat = new StandardMaterial("matHud3DDK2", this.scene);
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.useAlphaFromDiffuseTexture = true;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.disableDepthWrite = true;

      const plane = MeshBuilder.CreatePlane("hud3DDK2", { width: 1.12, height: 0.35 }, this.scene);
      plane.material = mat;
      plane.isPickable = false;
      plane.renderingGroupId = 3;
      plane.alwaysSelectAsActiveMesh = true;
      this.hud3DPlane = plane;
      this.hud3DTex = tex;
    }

    const fps = this.jugador.camaraFPS;
    const fwd = fps.getDirection(Axis.Z);
    const up = fps.getDirection(Axis.Y);
    const esCompacto = this.hudModo === "compacto";
    const dist = inventarioAbierto ? 1.75 : esCompacto ? 2.15 : 2.0;
    const offsetY = inventarioAbierto ? -0.04 : esCompacto ? -0.44 : -0.34;
    const pos = fps.position.add(fwd.scale(dist)).add(up.scale(offsetY));
    this.hud3DPlane.position.copyFrom(pos);
    this.hud3DPlane.rotation.copyFrom(fps.rotation);
    this.hud3DPlane.scaling.setAll(inventarioAbierto ? 1.12 : esCompacto ? 0.78 : 1.0);
    this.hud3DPlane.setEnabled(true);

    const herramienta = this.jugador.viewmodel.herramientaActual;
    const objetivo = this.jugador.tipoObjetivoEnfocado;
    const nodoId = this.surco.nodoSeleccionadoId;
    const nodo = this.surco.nodos[nodoId];
    const ahora = performance.now();
    const msgActivo = ahora < this.mensajeVRExpiraMs ? this.mensajeVRTexto : "";

    const slotsData: Array<SlotHotbarVR> = (hotbar && hotbar.slots.length > 0
      ? hotbar.slots.slice(0, 9).map((s) => s ?? { id: "", cantidad: 0 })
      : [
          { id: "mano", cantidad: 1 },
          { id: "azada", cantidad: 1 },
          { id: "semilla_chalqueno", cantidad: 1 },
          { id: "semilla_azul", cantidad: 1 },
          { id: "semilla_rojo", cantidad: 1 },
          { id: "semilla_palomero", cantidad: 1 },
          { id: "regadera", cantidad: 1 },
          { id: "abono", cantidad: 1 },
          { id: "cosecha", cantidad: 1 }
        ]);
    const mochilaData: Array<SlotHotbarVR> = hotbar?.mochila
      ? hotbar.mochila.map((s) => s ?? { id: "", cantidad: 0 })
      : [];
    const mazorcasTroje = hotbar?.mazorcasTroje ?? 0;
    const slotActivoIdx = hotbar ? hotbar.slotActivo : slotsData.findIndex((s) => s.id === herramienta);
    const tierraPct = nodo ? Math.round(nodo.tierraArada) : 0;
    const h2oPct = nodo ? Math.round(nodo.humedadVWC * 100) : 0;
    const diaCult = nodo ? Math.floor(nodo.diasCultivo) : 0;
    const etapa = nodo?.sembrada ? nodo.plantaInterna?.estado ?? "" : "Sin siembra";
    const resumenSlots = slotsData.map((s) => `${s.id}:${s.cantidad}`).join(",");
    const resumenMochila = mochilaData.map((s) => `${s.id}:${s.cantidad}`).join(",");
    const clave = `${this.hudModo}|${inventarioAbierto}|${herramienta}|${slotActivoIdx}|${objetivo}|${nodoId}|${tierraPct}|${h2oPct}|${diaCult}|${etapa}|${resumenSlots}|${resumenMochila}|${mazorcasTroje}|${msgActivo}`;
    if (clave === this.hud3DKey) return;
    this.hud3DKey = clave;

    const ctx = this.hud3DTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 1024, 320);

    const metaPorId: Record<string, { icono: string; label: string }> = {
      mano: { icono: "✋", label: "Mano" },
      azada: { icono: "⛏️", label: "Azada" },
      semilla_chalqueno: { icono: "🌽", label: "Chalq" },
      semilla_azul: { icono: "💜", label: "Azul" },
      semilla_rojo: { icono: "❤️", label: "Rojo" },
      semilla_palomero: { icono: "🍿", label: "Palom" },
      regadera: { icono: "💧", label: "Agua" },
      abono: { icono: "🌿", label: "Abono" },
      cosecha: { icono: "🧺", label: "Cosech" },
      frijol: { icono: "🫘", label: "Frijol" },
      calabaza: { icono: "🎃", label: "Calab" },
      sol: { icono: "☀️", label: "Sol+15" },
      mazorca: { icono: "🌽", label: "Mazor" },
      grano: { icono: "🌱", label: "Grano" }
    };

    const dibujarRanuras = (
      lista: Array<SlotHotbarVR>,
      y: number,
      slotW: number,
      slotH: number,
      gap: number,
      esHotbar: boolean,
      baseIndex: number
    ) => {
      const startX = (1024 - (lista.length * slotW + (lista.length - 1) * gap)) / 2;
      for (let i = 0; i < lista.length; i++) {
        const s = lista[i];
        const x = startX + i * (slotW + gap);
        const activo = esHotbar && (hotbar ? i === slotActivoIdx : s.id === herramienta);
        const meta = s.id ? (metaPorId[s.id] ?? { icono: "📦", label: s.id.slice(0, 6) }) : { icono: "", label: "" };

        ctx.fillStyle = activo ? "rgba(234, 179, 8, 0.42)" : "rgba(15, 23, 42, 0.90)";
        ctx.fillRect(x, y, slotW, slotH);
        ctx.strokeStyle = activo ? "#fde047" : "#64748b";
        ctx.lineWidth = activo ? 6 : 2;
        ctx.strokeRect(x, y, slotW, slotH);

        ctx.fillStyle = activo ? "#fef08a" : "#94a3b8";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`${baseIndex + i}`, x + 7, y + 6);

        if (s.cantidad > 1 || (!esHotbar && s.cantidad > 0)) {
          ctx.fillStyle = "#fde047";
          ctx.font = "bold 18px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`x${s.cantidad}`, x + slotW - 7, y + 6);
        }

        if (meta.icono) {
          ctx.font = slotH >= 100 ? "40px sans-serif" : "30px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(meta.icono, x + slotW / 2, y + slotH * 0.50);
        }

        if (meta.label) {
          ctx.fillStyle = activo ? "#fef08a" : "#e2e8f0";
          ctx.font = "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(meta.label, x + slotW / 2, y + slotH - 5);
        }
      }
    };

    if (inventarioAbierto) {
      // Panel 3D ampliado del Inventario Completo + Mochila + Troje dentro de los lentes
      ctx.fillStyle = "rgba(9, 14, 24, 0.94)";
      ctx.fillRect(16, 4, 992, 312);
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 4, 992, 312);

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎒 INVENTARIO, MOCHILA Y TROJE  [I / Botón Y para cerrar]", 512, 30);

      // Fila superior: 9 ranuras de la Hotbar
      dibujarRanuras(slotsData, 54, 98, 114, 8, true, 1);

      // Fila inferior: Mochila (10..N) + Resumen destacado del Troje
      const mochilaItems = mochilaData.length > 0 ? mochilaData : [];
      const totalBloques = mochilaItems.length + 1;
      const wBloque = 122;
      const gapBloque = 12;
      const startMochila = (1024 - (totalBloques * wBloque + (totalBloques - 1) * gapBloque)) / 2;
      const yMochila = 186;
      const hMochila = 112;

      for (let i = 0; i < mochilaItems.length; i++) {
        const s = mochilaItems[i];
        const x = startMochila + i * (wBloque + gapBloque);
        const meta = s.id ? (metaPorId[s.id] ?? { icono: "📦", label: s.id.slice(0, 6) }) : { icono: "", label: "Vacío" };
        ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
        ctx.fillRect(x, yMochila, wBloque, hMochila);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, yMochila, wBloque, hMochila);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 17px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`M${i + 1}`, x + 7, yMochila + 6);

        if (s.cantidad > 0) {
          ctx.fillStyle = "#fde047";
          ctx.font = "bold 18px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`x${s.cantidad}`, x + wBloque - 7, yMochila + 6);
        }
        if (meta.icono) {
          ctx.font = "36px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(meta.icono, x + wBloque / 2, yMochila + 56);
        }
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(meta.label, x + wBloque / 2, yMochila + hMochila - 6);
      }

      // Tarjeta destacada del Troje
      const xTroje = startMochila + mochilaItems.length * (wBloque + gapBloque);
      ctx.fillStyle = "rgba(21, 128, 61, 0.45)";
      ctx.fillRect(xTroje, yMochila, wBloque, hMochila);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.strokeRect(xTroje, yMochila, wBloque, hMochila);
      ctx.fillStyle = "#bbf7d0";
      ctx.font = "bold 17px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("TROJE", xTroje + wBloque / 2, yMochila + 8);
      ctx.font = "34px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("🏛️", xTroje + wBloque / 2, yMochila + 55);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 20px monospace";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${mazorcasTroje} maz.`, xTroje + wBloque / 2, yMochila + hMochila - 6);

      this.hud3DTex.update();
      return;
    }

    // 1. Franja superior: avisos / diálogos de Don Elote
    if (msgActivo) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
      ctx.fillRect(36, 4, 952, 58);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 4, 952, 58);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const maxChars = 68;
      const textoRecortado = msgActivo.length > maxChars ? `${msgActivo.slice(0, maxChars - 1)}…` : msgActivo;
      if (textoRecortado.length > 46) {
        const corte = textoRecortado.lastIndexOf(" ", 44);
        const idxCorte = corte > 20 ? corte : 44;
        const l1 = textoRecortado.slice(0, idxCorte).trim();
        const l2 = textoRecortado.slice(idxCorte).trim();
        ctx.fillText(l1, 512, 21);
        ctx.fillText(l2, 512, 45);
      } else {
        ctx.fillText(textoRecortado, 512, 33);
      }
    }

    // 2. Franja media: herramienta activa + estación + telemetría
    ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
    ctx.fillRect(52, 70, 920, 46);
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3;
    ctx.strokeRect(52, 70, 920, 46);

    const nombres: Record<string, string> = {
      mano: "✋ Mano",
      azada: "⛏️ Azada",
      semilla_chalqueno: "🌽 Chalqueño",
      semilla_azul: "💜 Maíz Azul",
      semilla_rojo: "❤️ Maíz Rojo",
      semilla_palomero: "🍿 Palomero",
      regadera: "💧 Regadera",
      abono: "🌿 Abono",
      cosecha: "🧺 Cosecha"
    };
    const infoEstado =
      objetivo === "don_elote"
        ? "🧑‍🌾 Don Elote [E / Botón X]"
        : objetivo !== "ninguno" && objetivo !== "nodo"
        ? `🎯 ${objetivo.toUpperCase()} · Est. ${nodoId + 1}`
        : `Est. ${nodoId + 1} · Tierra ${tierraPct}% · H2O ${h2oPct}% · Día ${diaCult} (${etapa})`;
    ctx.fillStyle = "#fef08a";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${nombres[herramienta] ?? herramienta}  |  ${infoEstado}`, 512, 94);

    // 3. Barra inferior: 9 ranuras sincronizadas con el inventario
    dibujarRanuras(slotsData, 128, 98, 124, 8, true, 1);

    // 4. Cuarta franja inferior: resumen compacto de Mochila + Troje siempre visible
    const itemsMochilaTexto = mochilaData
      .filter((s) => s.id && s.cantidad > 0)
      .map((s) => {
        const meta = metaPorId[s.id] ?? { icono: "📦", label: s.id };
        return `${meta.icono} ${meta.label} x${s.cantidad}`;
      });
    const textoMochila = itemsMochilaTexto.length > 0 ? itemsMochilaTexto.join("  ·  ") : "Mochila vacía";
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.fillRect(52, 264, 920, 44);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 264, 920, 44);

    ctx.fillStyle = "#bae6fd";
    ctx.font = "bold 19px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`🎒 ${textoMochila}   |   🏛️ Troje: ${mazorcasTroje} maz.   [I / Y: Inventario]`, 512, 287);

    this.hud3DTex.update();
  }

  private configurarEntrada(): void {
    window.addEventListener("keydown", (ev) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      this.teclas[ev.code] = true;

      if (ev.code === "F3") {
        ev.preventDefault();
        const perfiles: PerfilOpticoDK2[] = ["normal", "amplio", "plano"];
        this.perfilOptico = perfiles[(perfiles.indexOf(this.perfilOptico) + 1) % perfiles.length];
        if (this.camaraSBS) {
          const vieja = this.camaraSBS;
          const nueva = this.crearCamaraSBS();
          this.camaraSBS = nueva;
          this.scene.activeCamera = nueva;
          vieja.dispose();
          if (this.scene.prePassRenderer) {
            this.scene.prePassRenderer.markAsDirty();
            this.scene.prePassRenderer.update();
          }
          this.forzarRedimension();
        }
        const etiqueta: Record<PerfilOpticoDK2, string> = {
          normal: "Estándar DK2 (Lentes A)",
          amplio: "Amplio / Lentes B",
          plano: "Plano SBS 1:1 (sin curvatura)"
        };
        this.mostrarMensajeVR(`🔍 Lente DK2: ${etiqueta[this.perfilOptico]} [F3]`, 2800);
        this.opciones.onToast?.(`🔍 Lente DK2: ${etiqueta[this.perfilOptico]}`);
        return;
      }
      if (ev.code === "F4") {
        ev.preventDefault();
        const escalas = [1.0, 1.25, 1.5];
        const idx = escalas.indexOf(this.escalaRenderSBS);
        this.escalaRenderSBS = escalas[(idx + 1) % escalas.length];
        if (this.enSBS) {
          this.scene.getEngine().setHardwareScalingLevel(1 / this.escalaRenderSBS);
          this.forzarRedimension();
        }
        const w = Math.round(1920 * this.escalaRenderSBS);
        const h = Math.round(1080 * this.escalaRenderSBS);
        this.mostrarMensajeVR(`🖥️ Resolución DK2: ${Math.round(this.escalaRenderSBS * 100)}% (${w}×${h}) [F4]`, 2800);
        this.opciones.onToast?.(`🖥️ Resolución DK2: ${Math.round(this.escalaRenderSBS * 100)}% (${w}×${h})`);
        return;
      }
      if (ev.code === "F8") {
        ev.preventDefault();
        this.alternarSBS();
        return;
      }
      if (ev.code === "F9") {
        ev.preventDefault();
        this.conectarGiroscopioDK2();
        return;
      }
      if (ev.code === "F10") {
        ev.preventDefault();
        const orden: Array<"normal" | "compacto" | "oculto"> = ["normal", "compacto", "oculto"];
        this.hudModo = orden[(orden.indexOf(this.hudModo) + 1) % orden.length];
        this.hud3DKey = "";
        this.mostrarMensajeVR(`🖥️ HUD DK2: ${this.hudModo.toUpperCase()} [F10]`, 2200);
        return;
      }
      if (ev.code === "F6" || ev.code === "F7" || ev.code === "BracketLeft" || ev.code === "BracketRight") {
        ev.preventDefault();
        const paso = ev.code === "F7" || ev.code === "BracketRight" ? 0.1 : -0.1;
        this.sensibilidadGyro = Math.round(Math.max(0.2, Math.min(1.5, this.sensibilidadGyro + paso)) * 10) / 10;
        try {
          localStorage.setItem("milpa_dk2_sens_v2", String(this.sensibilidadGyro));
        } catch {}
        this.opciones.onToast?.(`🧭 Sensibilidad del giroscopio: ${Math.round(this.sensibilidadGyro * 100)}%`);
        return;
      }
      if (!this.enXR) return;
      if (ev.code === "Space") {
        ev.preventDefault();
        this.accionPrincipal();
      } else if (ev.code === "ArrowLeft") {
        this.girarXR(-GIRO_DISCRETO);
      } else if (ev.code === "ArrowRight") {
        this.girarXR(GIRO_DISCRETO);
      }
    });
    window.addEventListener("keyup", (ev) => {
      this.teclas[ev.code] = false;
    });
    window.addEventListener("blur", () => {
      this.teclas = {};
    });
    document.addEventListener("fullscreenchange", () => {
      this.forzarRedimension();
    });

    this.canvas.addEventListener("pointerdown", (ev) => {
      if (this.enXR && ev.button === 0) this.accionPrincipal();
    });
  }

  private procesarTecladoXR(dt: number): void {
    let adelante = 0;
    let lado = 0;
    if (this.teclas["KeyW"] || this.teclas["ArrowUp"]) adelante += 1;
    if (this.teclas["KeyS"] || this.teclas["ArrowDown"]) adelante -= 1;
    if (this.teclas["KeyD"]) lado += 1;
    if (this.teclas["KeyA"]) lado -= 1;
    if (adelante || lado) this.moverXR(adelante, lado, dt);
  }

  private moverXR(adelante: number, lado: number, dt: number): void {
    if (!this.xr) return;
    const cam = this.xr.baseExperience.camera;
    const fwd = cam.getDirection(Axis.Z);
    fwd.y = 0;
    if (fwd.lengthSquared() < 1e-4) return;
    fwd.normalize();
    const der = Vector3.Cross(Vector3.Up(), fwd).normalize();
    const mov = fwd.scale(adelante).addInPlace(der.scale(lado));
    if (mov.lengthSquared() > 1) mov.normalize();
    cam.position.addInPlace(mov.scale(VELOCIDAD_XR_MS * dt));
  }

  private girarXR(angulo: number): void {
    if (!this.xr) return;
    const cam = this.xr.baseExperience.camera;
    if (!cam.rotationQuaternion) cam.rotationQuaternion = Quaternion.Identity();
    cam.rotationQuaternion.multiplyInPlace(Quaternion.FromEulerAngles(0, angulo, 0));
  }

  private procesarGamepad(dt: number): void {
    // En modo escritorio/SBS el mando Xbox Series S|X lo gestiona ControladorXbox (evita doble entrada)
    if (!this.enXR) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected && p.mapping === "standard") {
        gp = p;
        break;
      }
    }
    if (!gp) return;

    const eje = (i: number) => {
      const v = gp!.axes[i] ?? 0;
      return Math.abs(v) < ZONA_MUERTA ? 0 : v;
    };
    const lx = eje(0);
    const ly = eje(1);
    const rx = eje(2);
    const ry = eje(3);

    if (this.enXR) {
      if (lx || ly) this.moverXR(-ly, lx, dt);
      if (Math.abs(rx) > 0.7 && this.stickGiroArmado) {
        this.girarXR(Math.sign(rx) * GIRO_DISCRETO);
        this.stickGiroArmado = false;
      } else if (Math.abs(rx) < 0.3) {
        this.stickGiroArmado = true;
      }
    } else if (this.jugador.modo === "fps") {
      const fps = this.jugador.camaraFPS;
      if (lx || ly) {
        const yaw = fps.rotation.y;
        const vel = (gp.buttons[10]?.pressed ? this.jugador.velocidadCorrer : this.jugador.velocidadCaminar) * dt;
        fps.position.x += (Math.sin(yaw) * -ly + Math.cos(yaw) * lx) * vel;
        fps.position.z += (Math.cos(yaw) * -ly - Math.sin(yaw) * lx) * vel;
      }
      if (rx || ry) {
        fps.rotation.y += rx * 2.4 * dt;
        fps.rotation.x = Math.max(-1.35, Math.min(1.35, fps.rotation.x + ry * 1.8 * dt));
      }
    }

    const flanco = (i: number) => {
      const ahora = !!gp!.buttons[i]?.pressed;
      const antes = !!this.botonesPrevios[i];
      return ahora && !antes;
    };
    if (flanco(0) || flanco(7)) this.accionPrincipal(); // A / RT
    if (flanco(1) || flanco(5)) this.jugador.ciclarHerramienta(1); // B / RB
    if (flanco(4)) this.jugador.ciclarHerramienta(-1); // LB
    if (flanco(2)) this.espantapajaros?.compartirSiguienteDato(); // X
    if (flanco(3)) this.opciones.onSiguienteEstacion?.(); // Y
    if (flanco(8)) this.alternarSBS(); // Back / View
    if (flanco(9) && this.xr && !this.enXR) {
      this.xr.baseExperience.enterXRAsync("immersive-vr", "local-floor").catch(() => {
        this.opciones.onToast?.("⚠️ No se detectó un visor WebXR. Prueba el modo estéreo [F8].");
      });
    }

    this.botonesPrevios = gp.buttons.map((b) => b.pressed);
  }

  private desempaquetar21Bits(dv: DataView, offset: number): [number, number, number] {
    const b0 = dv.getUint8(offset);
    const b1 = dv.getUint8(offset + 1);
    const b2 = dv.getUint8(offset + 2);
    const b3 = dv.getUint8(offset + 3);
    const b4 = dv.getUint8(offset + 4);
    const b5 = dv.getUint8(offset + 5);
    const b6 = dv.getUint8(offset + 6);
    const b7 = dv.getUint8(offset + 7);

    let x = (b0 << 13) | (b1 << 5) | ((b2 & 0xf8) >> 3);
    let y = ((b2 & 0x07) << 18) | (b3 << 10) | (b4 << 2) | ((b5 & 0xc0) >> 6);
    let z = ((b5 & 0x3f) << 15) | (b6 << 7) | ((b7 & 0xfe) >> 1);

    if (x & 0x100000) x |= ~0x1fffff;
    if (y & 0x100000) y |= ~0x1fffff;
    if (z & 0x100000) z |= ~0x1fffff;
    return [x, y, z];
  }

  private async cerrarDispositivoHID(): Promise<void> {
    if (this.hidKeepAliveTimer !== null) {
      window.clearInterval(this.hidKeepAliveTimer);
      this.hidKeepAliveTimer = null;
    }
    if (this.hidDevice) {
      if (this.hidInputHandler) {
        try {
          this.hidDevice.removeEventListener("inputreport", this.hidInputHandler);
        } catch {}
        this.hidInputHandler = null;
      }
      try {
        await this.hidDevice.close();
      } catch {}
      this.hidDevice = null;
    }
  }

  private async abrirDispositivoHID(dev: any): Promise<void> {
    await this.cerrarDispositivoHID();
    if (!dev.opened) await dev.open();
    this.hidDevice = dev;
    this.hidPacketsReceived = 0;
    this.gyroBiasX = 0;
    this.gyroBiasY = 0;
    this.gyroCalibSumX = 0;
    this.gyroCalibSumY = 0;
    this.gyroCalibCount = 0;
    this.pendingDeltaYaw = 0;
    this.pendingDeltaPitch = 0;
    this.gxFiltrado = 0;
    this.gyFiltrado = 0;
    this.reportIdSensor = null;
    this.ultimoPaqueteHidMs = 0;
    this.ultimoTsUs = null;
    this.jugador.camaraFPS.rotation.x = 0;

    const tieneInputReports = Array.isArray(dev.collections)
      ? dev.collections.some((c: any) => Array.isArray(c.inputReports) && c.inputReports.length > 0)
      : true;
    if (!tieneInputReports) {
      this.opciones.onToast?.("⚠️ Ese puerto HID no envía sensor; prueba el otro 'Rift DK2' de la lista.");
    }

    const activarTrackerDK2 = async () => {
      if (!this.hidDevice || !this.hidDevice.opened) return;
      try {
        // Feature Report 0x02 con Flag_CommandKeepAlive (0x20) -> 0x3c para que no duerma tras ~10 s
        await this.hidDevice.sendFeatureReport(0x02, new Uint8Array([0x00, 0x00, 0x3c, 0x00, 0x10, 0x27]));
      } catch {}
    };

    const enviarKeepAlive = async () => {
      if (!this.hidDevice || !this.hidDevice.opened) return;
      try {
        await this.hidDevice.sendFeatureReport(0x11, new Uint8Array([0x00, 0x00, 0x0b, 0x10, 0x27]));
      } catch {
        try {
          await this.hidDevice.sendFeatureReport(0x08, new Uint8Array([0x00, 0x00, 0x10, 0x27]));
        } catch {}
      }
    };

    await activarTrackerDK2();
    await enviarKeepAlive();

    this.hidKeepAliveTimer = window.setInterval(async () => {
      await enviarKeepAlive();
      if (this.ultimoPaqueteHidMs > 0 && performance.now() - this.ultimoPaqueteHidMs > 1500) {
        await activarTrackerDK2();
        await enviarKeepAlive();
      }
    }, 1500);

    this.hidInputHandler = (ev: any) => {
      const dv: DataView = ev.data;
      // El reporte del sensor DK2 mide ~63 bytes; descartar reportes cortos de otro tipo
      if (!dv || dv.byteLength < 55) return;
      if (this.reportIdSensor === null) this.reportIdSensor = ev.reportId;
      if (ev.reportId !== this.reportIdSensor) return;

      this.ultimoPaqueteHidMs = performance.now();
      this.hidPacketsReceived++;
      if (this.hidPacketsReceived === 1) {
        this.actualizarBotonUI();
      }

      const esDK2 = ev.reportId === 11 || dv.byteLength >= 62;
      let numSamples: number;
      let dtSample: number;
      let baseOffset: number;

      if (esDK2) {
        // Protocolo DK2 (ReportID 0x0B): encabezado de 11 bytes antes de las muestras IMU
        const rawCount = dv.getUint8(2);
        if (rawCount === 0) return;
        numSamples = Math.min(rawCount, 2);
        baseOffset = 11;
        const tsUs = dv.getUint32(7, true);
        let dtTotal = rawCount * 0.001;
        if (this.ultimoTsUs !== null) {
          const diffUs = (tsUs - this.ultimoTsUs) >>> 0;
          if (diffUs > 0 && diffUs < 50000) {
            dtTotal = diffUs * 1e-6;
          }
        }
        this.ultimoTsUs = tsUs;
        dtSample = Math.min(Math.max(dtTotal / numSamples, 0.0005), 0.01);
      } else {
        // Fallback DK1 (ReportID 0x01): encabezado de 7 bytes
        const rawCount = dv.getUint8(0);
        if (rawCount === 0) return;
        numSamples = Math.min(rawCount, 3);
        baseOffset = 7;
        dtSample = 0.001;
      }

      const ALFA = 0.45;

      for (let i = 0; i < numSamples; i++) {
        const base = baseOffset + i * 16;
        if (base + 16 > dv.byteLength) break;
        const [gxRaw, gyRaw] = this.desempaquetar21Bits(dv, base + 8);

        const gxRawRad = gxRaw * 0.0001;
        const gyRawRad = gyRaw * 0.0001;

        // Descartar valores fuera de rango físico (> 20 rad/s)
        if (Math.abs(gxRawRad) > 20 || Math.abs(gyRawRad) > 20) continue;

        if (this.gyroCalibCount < 60) {
          this.gyroCalibSumX += gxRawRad;
          this.gyroCalibSumY += gyRawRad;
          this.gyroCalibCount++;
          if (this.gyroCalibCount === 60) {
            this.gyroBiasX = this.gyroCalibSumX / 60;
            this.gyroBiasY = this.gyroCalibSumY / 60;
            this.opciones.onToast?.("🧭 Giroscopio DK2 calibrado y listo. Ajusta sensibilidad con [F6] / [F7].");
          }
          continue;
        }

        const gx = gxRawRad - this.gyroBiasX;
        const gy = gyRawRad - this.gyroBiasY;

        this.gxFiltrado += (gx - this.gxFiltrado) * ALFA;
        this.gyFiltrado += (gy - this.gyFiltrado) * ALFA;

        // Zona muerta pequeña para eliminar deriva residual en reposo
        const fx = Math.abs(this.gxFiltrado) < 0.012 ? 0 : this.gxFiltrado;
        const fy = Math.abs(this.gyFiltrado) < 0.012 ? 0 : this.gyFiltrado;

        this.pendingDeltaYaw -= fy * dtSample * this.sensibilidadGyro;
        this.pendingDeltaPitch -= fx * dtSample * this.sensibilidadGyro;
      }
    };

    dev.addEventListener("inputreport", this.hidInputHandler);
    this.actualizarBotonUI();
    this.opciones.onToast?.("🧭 ¡Giroscopio USB del DK2 activo! Mueve el casco para girar la vista.");
  }

  public async conectarGiroscopioDK2(): Promise<void> {
    this.cerrarModalBienvenida();
    const navHid = (navigator as any).hid;
    if (!navHid) {
      this.opciones.onToast?.("⚠️ Usa Google Chrome o Microsoft Edge para leer el sensor USB del DK2 (WebHID).");
      return;
    }

    if (!this.autoReconnectRegistrado) {
      this.autoReconnectRegistrado = true;
      navHid.addEventListener("connect", async (ev: any) => {
        const d = ev?.device;
        if (!d || d.vendorId !== 0x2833) return;
        const tieneInput = Array.isArray(d.collections)
          ? d.collections.some((c: any) => Array.isArray(c.inputReports) && c.inputReports.length > 0)
          : false;
        if (!tieneInput) return;
        try {
          await this.abrirDispositivoHID(d);
          this.opciones.onToast?.("🔌 DK2 reconectado automáticamente.");
        } catch {}
      });
    }

    if (this.hidDevice) {
      await this.cerrarDispositivoHID();
      this.actualizarBotonUI();
      this.opciones.onToast?.("🧭 Giroscopio USB del DK2 desconectado.");
      return;
    }

    try {
      let devices = await navHid.requestDevice({ filters: [{ vendorId: 0x2833 }] });
      if (!devices || devices.length === 0) {
        devices = await navHid.requestDevice({ filters: [] });
      }
      if (!devices || devices.length === 0) return;

      await this.abrirDispositivoHID(devices[0]);
    } catch (err) {
      console.warn("No se pudo abrir el sensor WebHID del DK2:", err);
      this.opciones.onToast?.("⚠️ No se pudo conectar el sensor USB del DK2.");
    }
  }

  private crearBotonUI(): void {
    const estilo = document.createElement("style");
    estilo.textContent = `
      #panelBotonesDK2 {
        position: fixed; left: 12px; bottom: 58px; z-index: 1000;
        display: flex; gap: 8px;
      }
      .btn-dk2 {
        background: #1e293b; color: #fef08a; border: 2px solid #000;
        font-family: inherit; font-size: 13px; font-weight: bold;
        padding: 8px 12px; cursor: pointer; box-shadow: 2px 2px 0 #000;
      }
      .btn-dk2:hover { background: #334155; }
      body.modo-dk2-sbs > *:not(#renderCanvas):not(#panelBotonesDK2) {
        display: none !important;
      }
      body.modo-dk2-sbs #panelBotonesDK2 { opacity: 0.15; }
      body.modo-dk2-sbs #panelBotonesDK2:hover { opacity: 1; }
    `;
    document.head.appendChild(estilo);

    const contenedor = document.createElement("div");
    contenedor.id = "panelBotonesDK2";

    const btn = document.createElement("button");
    btn.id = "btnDK2SBS";
    btn.className = "btn-dk2";
    btn.title = "Vista estereoscópica para Oculus Rift DK2 conectado como monitor extendido [F8]";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.alternarSBS();
      btn.blur();
    });

    const btnGyro = document.createElement("button");
    btnGyro.id = "btnDK2Gyro";
    btnGyro.className = "btn-dk2";
    btnGyro.title = "Conectar el giroscopio USB del casco DK2 por WebHID para mover la vista con la cabeza [F9]";
    btnGyro.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.conectarGiroscopioDK2();
      btnGyro.blur();
    });

    contenedor.appendChild(btn);
    contenedor.appendChild(btnGyro);
    document.body.appendChild(contenedor);
    this.botonUI = btn;
    this.botonGyroUI = btnGyro;
    this.actualizarBotonUI();
  }

  private actualizarBotonUI(): void {
    if (this.botonUI) {
      this.botonUI.textContent = this.enSBS ? "✖ Salir estéreo DK2 [F8]" : "👓 DK2 Estéreo [F8]";
    }
    if (this.botonGyroUI) {
      this.botonGyroUI.textContent = this.hidDevice
        ? this.hidPacketsReceived > 0
          ? "🧭 Giroscopio DK2: ACTIVO [F9]"
          : "🧭 Giroscopio DK2: SIN DATOS [F9]"
        : "🧭 Giroscopio DK2 [F9]";
    }
  }
}
