/**
 * Controlador de Jugador Estilo Minecraft en Primera Persona (FPS) y Modo Orbital (v4.0)
 *
 * Características estilo Minecraft:
 * - Movimiento libre con WASD / Flechas + Shift para correr.
 * - Giro de cámara con ratón (PointerLock) y rueda del ratón (Mouse Wheel) para cambiar de herramienta en la Hotbar.
 * - Caja 3D selectora de bloque/estación (Selection Box) que resalta el montículo o estación apuntada.
 * - Clic Izquierdo: Usa la herramienta equipada en la mano sobre el bloque/planta apuntada.
 * - Clic Derecho: Acción contextual rápida estilo Minecraft (cosechar mazorca madura, recoger drop, deshierbar, polinizar o abrir estación 3D).
 * - Alternancia limpia con Modo Orbital mediante [V].
 */

import { resolverColisiones } from "./colisiones";
import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  UniversalCamera,
  ArcRotateCamera,
  Mesh,
  MeshBuilder,
  AbstractMesh
} from "@babylonjs/core";
import { ViewmodelHerramientas } from "./vr/viewmodel_herramientas";
import { SurcoMilpa, NodoSurco } from "./surco_milpa";
import { EspantapajarosGuia } from "./educativo/espantapajaros_guia";
import { AudioSintetizador } from "./audio_sintetizador";
import {
  HerramientaTipo,
  variedadDeHerramienta
} from "./educativo/estado_educativo";
import { CanastaRecoleccion3D } from "./vr/canasta_cosecha";
import { REGLAS_JUEGO, VARIEDADES_MAIZ } from "./nucleo";

export type ModoCamara = "fps" | "orbital";

export type TipoObjetivo3D =
  | "ninguno"
  | "nodo"
  | "don_elote"
  | "drop_mazorca"
  | "almacen"
  | "canasta"
  | "fogon"
  | "banco"
  | "dispensador"
  | "codice"
  | "maleza"
  | "fauna"
  | "triada_cosecha"
  | "mesa_clima";

const ORDEN_HOTBAR: HerramientaTipo[] = [
  "mano",
  "azada",
  "semilla_chalqueno",
  "semilla_azul",
  "semilla_rojo",
  "semilla_palomero",
  "regadera",
  "abono",
  "cosecha"
];

export class ControladorJugador {
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  readonly camaraFPS: UniversalCamera;
  readonly camaraOrbital: ArcRotateCamera;
  readonly viewmodel: ViewmodelHerramientas;
  readonly surco: SurcoMilpa;
  readonly espantapajaros: EspantapajarosGuia;
  readonly audio: AudioSintetizador;
  readonly canasta: CanastaRecoleccion3D | null;

  public modo: ModoCamara = "fps";
  public velocidadCaminar = 3.1;
  public velocidadCorrer = 5.0;

  // Estado de teclas, mando Xbox Series S y física de salto
  private teclasPresionadas: Record<string, boolean> = {};
  private mouseBloqueado = false;
  private pointerLockFallido = false;
  private timerPaso = 0;
  private bobTimer = 0;
  private velY = 0;
  private enSuelo = true;
  private readonly ALTURA_OJOS = 1.55;

  public moveAnalogicoForward = 0;
  public moveAnalogicoRight = 0;
  public lookAnalogicoYaw = 0;
  public lookAnalogicoPitch = 0;
  public corriendoGamepad = false;
  public usandoGamepad = false;

  // Retícula tipo cruz (+) estilo Minecraft y tooltip en pantalla
  private reticulaElem!: HTMLDivElement;
  private tooltipElem!: HTMLDivElement;

  // Caja 3D de selección de bloque estilo Minecraft
  private cajaSeleccionMesh!: Mesh;

  // Callbacks hacia main.ts
  public onAccionAgronomica?: (tipo: HerramientaTipo, nodoId: number) => void;
  public onAccionContextualDerecho?: (nodoId: number) => void;
  public onCambioHerramientaRueda?: (herramienta: HerramientaTipo) => void;
  public onWheelHotbar?: (dir: -1 | 1) => void;
  public onInteractuarObjeto3D?: (
    tipo: TipoObjetivo3D,
    meshName: string,
    nodoId?: number
  ) => void;
  public onHablarDonElote?: () => void;
  public onToast?: (msg: string) => void;

  // Estado del objeto enfocado actualmente por la mira (raycast <= 6.5 m)
  public nodoEnfocado: NodoSurco | null = null;
  public tipoObjetivoEnfocado: TipoObjetivo3D = "ninguno";
  public meshEnfocadoNombre = "";
  public miraEnDonElote = false;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    camaraOrbital: ArcRotateCamera,
    surco: SurcoMilpa,
    espantapajaros: EspantapajarosGuia,
    audio: AudioSintetizador,
    canasta: CanastaRecoleccion3D | null,
    particulas: any
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.camaraOrbital = camaraOrbital;
    this.surco = surco;
    this.espantapajaros = espantapajaros;
    this.audio = audio;
    this.canasta = canasta;

    // 1. Inicializar Cámara en Primera Persona (UniversalCamera)
    this.camaraFPS = new UniversalCamera("camaraFPS", new Vector3(0, 1.55, -2.1), scene);
    this.camaraFPS.setTarget(new Vector3(-0.35, 0.38, 0));
    this.camaraFPS.inputs.clear();
    this.camaraFPS.minZ = 0.12;
    this.camaraFPS.maxZ = 1200.0;

    // 2. Inicializar Viewmodel de Manos y Herramientas
    this.viewmodel = new ViewmodelHerramientas(scene, this.camaraFPS, audio, particulas);

    // 3. Crear caja 3D resaltadora de bloque estilo Minecraft
    this.construirCajaSeleccionBloque();

    // 4. Crear elementos del HUD (Retícula + y Tooltip de bloque)
    this.crearHUD();

    // 5. Configurar eventos de entrada (WASD, Ratón, Rueda de Hotbar, Clic Izquierdo/Derecho)
    this.configurarEntrada();

    // Iniciar en Modo FPS
    this.activarModo("fps");
  }

  private construirCajaSeleccionBloque(): void {
    const mat = new StandardMaterial("matCajaSeleccionMinecraft", this.scene);
    mat.diffuseColor = Color3.FromHexString("#fef08a");
    mat.emissiveColor = Color3.FromHexString("#fbbf24");
    mat.alpha = 0.28;
    mat.wireframe = true;

    this.cajaSeleccionMesh = MeshBuilder.CreateBox(
      "cajaSeleccionMinecraft",
      { width: 0.74, height: 0.24, depth: 0.74 },
      this.scene
    );
    this.cajaSeleccionMesh.material = mat;
    this.cajaSeleccionMesh.isPickable = false;
    this.cajaSeleccionMesh.setEnabled(false);
  }

  private crearHUD(): void {
    // Retícula central tipo cruz (+) estilo Minecraft
    this.reticulaElem = document.createElement("div");
    this.reticulaElem.id = "fpsReticle";
    this.reticulaElem.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      width: 18px; height: 18px;
      margin-left: -9px; margin-top: -9px;
      pointer-events: none; z-index: 999;
      display: flex; align-items: center; justify-content: center;
      color: rgba(255, 255, 255, 0.88);
      font-family: "Pixelify Sans", monospace; font-size: 20px; font-weight: 900;
      text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.85);
      transition: transform 0.1s ease, color 0.1s ease;
    `;
    this.reticulaElem.textContent = "+";
    document.body.appendChild(this.reticulaElem);

    // Tooltip informativo translúcido y discreto debajo de la retícula
    this.tooltipElem = document.createElement("div");
    this.tooltipElem.id = "fpsTooltip";
    this.tooltipElem.style.cssText = `
      position: fixed; top: calc(50% + 22px); left: 50%;
      transform: translateX(-50%);
      background-color: rgba(12, 18, 14, 0.56);
      color: #fef08a; padding: 4px 10px;
      border-radius: 0; font-family: "Pixelify Sans", "VT323", monospace;
      font-size: 13px; font-weight: 700; letter-spacing: 0.2px;
      text-shadow: 1px 1px 0 #000;
      pointer-events: none; z-index: 999;
      box-shadow: 2px 2px 0 rgba(0,0,0,0.45);
      border: 1px solid rgba(251, 191, 36, 0.50); display: none;
      white-space: nowrap;
    `;
    document.body.appendChild(this.tooltipElem);
  }

  public hayModalAbierto(): boolean {
    const idsModales = [
      "menuPrincipalMinecraft",
      "menuPausaMinecraft",
      "dispensadorSemillasModal",
      "modalAlmacenMazorcas",
      "almacenMazorcasModal",
      "mc-cofre-overlay",
      "fogonCocinaModal",
      "bancoSemillasModal",
      "codiceMaizModal",
      "fichaCultivoModal",
      "modalFogonCocina",
      "modalBancoSemillas",
      "modalCodiceMilpa",
      "modalControlesBienvenida",
      "modalAjustesVR"
    ];
    for (const id of idsModales) {
      const el = document.getElementById(id);
      if (el) {
        const display = getComputedStyle(el).display;
        if (display !== "none" && display !== "") {
          return true;
        }
      }
    }
    if (document.querySelector(".panel-clima-card.visible")) return true;
    if (document.querySelector(".modal-celebracion.visible")) return true;
    return false;
  }

  private configurarEntrada(): void {
    window.addEventListener("keydown", (ev) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      this.teclasPresionadas[ev.code] = true;
    });

    window.addEventListener("keyup", (ev) => {
      this.teclasPresionadas[ev.code] = false;
    });

    // Limpiar teclas presionadas al perder foco de la ventana (evita caminar infinito)
    window.addEventListener("blur", () => {
      this.teclasPresionadas = {};
    });

    // Desactivar menú contextual del navegador en el canvas para permitir Clic Derecho estilo Minecraft
    this.canvas.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });

    document.addEventListener("pointerlockchange", () => {
      this.mouseBloqueado = document.pointerLockElement === (this.canvas as unknown as Element);
      if (this.mouseBloqueado) this.pointerLockFallido = false;
    });

    document.addEventListener("pointerlockerror", () => {
      this.pointerLockFallido = true;
    });

    // Movimiento de ratón para mirar alrededor
    window.addEventListener("mousemove", (ev) => {
      if (this.modo !== "fps" || this.hayModalAbierto()) return;

      if (this.mouseBloqueado || ev.buttons === 1) {
        const sensX = 0.0024;
        const sensY = 0.0022;

        this.camaraFPS.rotation.y += ev.movementX * sensX;
        this.camaraFPS.rotation.x += ev.movementY * sensY;

        const maxPitch = Math.PI / 2.25;
        this.camaraFPS.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.camaraFPS.rotation.x));
      }
    });

    // Rueda del ratón (Mouse Wheel) en modo FPS -> Cambiar ranura de la Hotbar estilo Minecraft
    this.canvas.addEventListener(
      "wheel",
      (ev) => {
        if (this.modo !== "fps" || this.hayModalAbierto()) return;
        ev.preventDefault();
        const dir: -1 | 1 = ev.deltaY > 0 ? 1 : -1;
        if (this.onWheelHotbar) {
          this.onWheelHotbar(dir);
          return;
        }
        const idxActual = ORDEN_HOTBAR.indexOf(this.viewmodel.herramientaActual);
        const nuevoIdx = (idxActual + dir + ORDEN_HOTBAR.length) % ORDEN_HOTBAR.length;
        const nuevaH = ORDEN_HOTBAR[nuevoIdx];
        this.equipar(nuevaH);
        this.onCambioHerramientaRueda?.(nuevaH);
      },
      { passive: false }
    );

    // Clic Izquierdo (adquirir PointerLock o usar herramienta) y Clic Derecho (interacción contextual)
    this.canvas.addEventListener("pointerdown", (ev) => {
      if (this.modo !== "fps" || this.hayModalAbierto()) return;
      if (ev.button === 0) {
        // El primer clic que adquiere PointerLock no debe disparar la herramienta accidentalmente
        if (
          !this.mouseBloqueado &&
          !this.pointerLockFallido &&
          typeof this.canvas.requestPointerLock === "function"
        ) {
          try {
            const req = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            if (req && typeof req.catch === "function") {
              req.catch(() => {
                this.pointerLockFallido = true;
              });
            }
          } catch {
            this.pointerLockFallido = true;
          }
          return;
        }
        this.usarHerramientaActiva();
      } else if (ev.button === 2) {
        this.ejecutarInteraccionContextualDerecho();
      }
    });
  }

  public alternarModo(): void {
    if (this.modo === "fps") {
      this.activarModo("orbital");
    } else {
      this.activarModo("fps");
    }
  }

  public activarModo(modo: ModoCamara): void {
    this.modo = modo;

    if (modo === "fps") {
      this.scene.activeCamera = this.camaraFPS;
      // En FPS el raycast central de ControladorJugador gestiona todos los clics (evita doble disparo con ActionManager)
      this.scene.skipPointerDownPicking = true;
      this.viewmodel.setVisible(true);
      this.reticulaElem.style.display = "flex";
      this.onToast?.(
        "🎮 Modo Primera Persona (Minecraft): [WASD] Caminar · [1-9 / Rueda] Ítems · [Clic] Usar / Recolectar"
      );
    } else {
      this.scene.activeCamera = this.camaraOrbital;
      this.scene.skipPointerDownPicking = false;
      this.camaraOrbital.setTarget(new Vector3(0, 0.7, -0.6));
      this.camaraOrbital.alpha = -Math.PI / 2.25;
      this.camaraOrbital.beta = Math.PI / 3.0;
      this.camaraOrbital.radius = 11.2;
      this.viewmodel.cancelarAnimacion();
      this.viewmodel.setVisible(false);
      this.reticulaElem.style.display = "none";
      this.tooltipElem.style.display = "none";
      this.cajaSeleccionMesh.setEnabled(false);
      if (document.exitPointerLock) document.exitPointerLock();
      this.onToast?.("🔍 Modo Orbital: Arrastra el ratón para rotar la cámara ([V] para volver a 1ª persona).");
    }
  }

  /**
   * Clic Izquierdo / Gatillo RT:
   * Golpea / acciona con la herramienta equipada en la mano sobre el objeto o bloque apuntado.
   */
  public usarHerramientaActiva(): void {
    // En Modo Orbital el viewmodel no actualiza por frame: ejecutar directamente sobre la estación seleccionada
    if (this.modo === "orbital") {
      this.onAccionAgronomica?.(this.viewmodel.herramientaActual, this.surco.nodoSeleccionadoId);
      return;
    }
    if (this.viewmodel.estaAnimando) return;

    // Capturar snapshot del objetivo al momento del clic (antes del retardo de 120 ms del swing)
    const snapTipo = this.tipoObjetivoEnfocado;
    const snapMesh = this.meshEnfocadoNombre;
    const snapNodoId = this.nodoEnfocado?.id;
    const snapDonElote = this.miraEnDonElote;
    const snapHerramienta = this.viewmodel.herramientaActual;

    this.viewmodel.accionar(() => {
      // 1. Si apunta a un drop físico de mazorca en el suelo, recogerlo
      if (snapTipo === "drop_mazorca") {
        this.onInteractuarObjeto3D?.("drop_mazorca", snapMesh);
        return;
      }

      // 2. Si apunta a Don Elote
      if (snapTipo === "don_elote" || snapDonElote) {
        this.espantapajaros.compartirSiguienteDato();
        this.onHablarDonElote?.();
        return;
      }

      // 3. Si apunta a una estación interactiva (Troje/Almacén, Canasta, Fogón, Banco de Semillas, Códice, Mesa Clima)
      if (
        snapTipo === "almacen" ||
        snapTipo === "canasta" ||
        snapTipo === "fogon" ||
        snapTipo === "banco" ||
        snapTipo === "dispensador" ||
        snapTipo === "codice" ||
        snapTipo === "mesa_clima" ||
        snapTipo === "maleza" ||
        snapTipo === "fauna" ||
        snapTipo === "triada_cosecha"
      ) {
        this.onInteractuarObjeto3D?.(snapTipo, snapMesh, snapNodoId);
        return;
      }

      // 4. Si apunta a un bloque/estación de cultivo del surco
      if (snapNodoId !== undefined) {
        this.surco.nodoSeleccionadoId = snapNodoId;
        this.onAccionAgronomica?.(snapHerramienta, snapNodoId);
      } else {
        // Si está muy cerca de un nodo del surco (< 1.85 m), aplicar sobre ese nodo cercano
        const cercano = this.surco.obtenerNodoCercano(this.camaraFPS.position);
        const distXZ = Math.hypot(
          this.camaraFPS.position.x - cercano.posicionMundo.x,
          this.camaraFPS.position.z - cercano.posicionMundo.z
        );
        if (distXZ <= 1.85) {
          this.surco.nodoSeleccionadoId = cercano.id;
          this.onAccionAgronomica?.(snapHerramienta, cercano.id);
        } else {
          this.onToast?.("🎯 Acércate y apunta a un montículo del surco, mazorca o estación 3D.");
        }
      }
    });
  }

  /**
   * Clic Derecho (estilo Minecraft):
   * Interacción contextual directa con lo que tienes enfrente sin necesidad de cambiar de herramienta:
   */
  public ejecutarInteraccionContextualDerecho(): void {
    if (this.modo === "orbital") {
      this.onAccionContextualDerecho?.(this.surco.nodoSeleccionadoId);
      return;
    }
    if (this.tipoObjetivoEnfocado !== "ninguno" && this.tipoObjetivoEnfocado !== "nodo") {
      this.onInteractuarObjeto3D?.(
        this.tipoObjetivoEnfocado,
        this.meshEnfocadoNombre,
        this.nodoEnfocado?.id
      );
      return;
    }

    if (this.nodoEnfocado) {
      const snapNodoId = this.nodoEnfocado.id;
      this.viewmodel.accionar(() => {
        this.onAccionContextualDerecho?.(snapNodoId);
      });
    }
  }

  public equipar(herramienta: HerramientaTipo): void {
    this.viewmodel.equipar(herramienta);
  }

  public liberarPuntero(): void {
    if (this.mouseBloqueado && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  public saltar(): boolean {
    if (this.modo === "fps" && this.enSuelo && !this.hayModalAbierto()) {
      this.velY = 3.8;
      this.enSuelo = false;
      return true;
    }
    return false;
  }

  public actualizar(dt: number): void {
    if (this.hayModalAbierto()) return;

    if (this.modo === "orbital") {
      if (Math.abs(this.lookAnalogicoYaw) > 0.001 || Math.abs(this.lookAnalogicoPitch) > 0.001) {
        this.camaraOrbital.alpha -= this.lookAnalogicoYaw * dt * 2.4;
        this.camaraOrbital.beta = Math.max(
          0.2,
          Math.min(Math.PI / 2.08, this.camaraOrbital.beta - this.lookAnalogicoPitch * dt * 1.8)
        );
      }
      if (Math.abs(this.moveAnalogicoForward) > 0.001) {
        this.camaraOrbital.radius = Math.max(
          3.0,
          Math.min(65.0, this.camaraOrbital.radius - this.moveAnalogicoForward * dt * 12.0)
        );
      }
      return;
    }

    // 1. Detección de teclas de movimiento + Stick Izquierdo (Mando Xbox Series S)
    let moveForward = 0;
    let moveRight = 0;

    if (this.teclasPresionadas["KeyW"] || this.teclasPresionadas["ArrowUp"]) moveForward += 1;
    if (this.teclasPresionadas["KeyS"] || this.teclasPresionadas["ArrowDown"]) moveForward -= 1;
    if (this.teclasPresionadas["KeyD"]) moveRight += 1;
    if (this.teclasPresionadas["KeyA"]) moveRight -= 1;

    if (Math.abs(this.moveAnalogicoForward) > 0.001 || Math.abs(this.moveAnalogicoRight) > 0.001) {
      moveForward += this.moveAnalogicoForward;
      moveRight += this.moveAnalogicoRight;
    } else {
      this.corriendoGamepad = false;
    }

    // Giro suave con flechas izquierda/derecha o Stick Derecho del mando Xbox Series S
    if (this.teclasPresionadas["ArrowLeft"]) {
      this.camaraFPS.rotation.y -= dt * 2.2;
    }
    if (this.teclasPresionadas["ArrowRight"]) {
      this.camaraFPS.rotation.y += dt * 2.2;
    }
    if (Math.abs(this.lookAnalogicoYaw) > 0.001 || Math.abs(this.lookAnalogicoPitch) > 0.001) {
      this.camaraFPS.rotation.y += this.lookAnalogicoYaw * 2.65 * dt;
      this.camaraFPS.rotation.x += this.lookAnalogicoPitch * 2.1 * dt;
      const maxPitch = Math.PI / 2.25;
      this.camaraFPS.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.camaraFPS.rotation.x));
    }

    // Salto estilo Minecraft con Barra Espaciadora [Space] o Botón [A] en Xbox
    if (this.teclasPresionadas["Space"] && this.enSuelo) {
      this.velY = 3.8;
      this.enSuelo = false;
    }

    const magMovimiento = Math.min(1.0, Math.hypot(moveForward, moveRight));
    const estaMoviendose = magMovimiento > 0.02;
    if (magMovimiento < 0.35) {
      this.corriendoGamepad = false;
    }
    const corriendo =
      this.teclasPresionadas["ShiftLeft"] ||
      this.teclasPresionadas["ShiftRight"] ||
      this.corriendoGamepad;
    const velocidad = (corriendo ? this.velocidadCorrer : this.velocidadCaminar) * magMovimiento;

    if (estaMoviendose) {
      const yaw = this.camaraFPS.rotation.y;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const dirX = fwdX * moveForward + rightX * moveRight;
      const dirZ = fwdZ * moveForward + rightZ * moveRight;
      const len = Math.hypot(dirX, dirZ) || 1;

      const prevX = this.camaraFPS.position.x;
      const prevZ = this.camaraFPS.position.z;

      this.camaraFPS.position.x += (dirX / len) * velocidad * dt;
      this.camaraFPS.position.z += (dirZ / len) * velocidad * dt;

      // Límites cuadrados acordes a la cerca perimetral (±8.0 m)
      const LIMITE_PARCELA = 8.0;
      this.camaraFPS.position.x = Math.max(-LIMITE_PARCELA, Math.min(LIMITE_PARCELA, this.camaraFPS.position.x));
      this.camaraFPS.position.z = Math.max(-LIMITE_PARCELA, Math.min(LIMITE_PARCELA, this.camaraFPS.position.z));

      // Colisiones físicas con objetos sólidos DESPUÉS del límite perimetral
      resolverColisiones(this.camaraFPS.position);
      this.camaraFPS.position.x = Math.max(-LIMITE_PARCELA, Math.min(LIMITE_PARCELA, this.camaraFPS.position.x));
      this.camaraFPS.position.z = Math.max(-LIMITE_PARCELA, Math.min(LIMITE_PARCELA, this.camaraFPS.position.z));

      const distReal = Math.hypot(this.camaraFPS.position.x - prevX, this.camaraFPS.position.z - prevZ);
      if (this.enSuelo && distReal > 0.002) {
        this.timerPaso += distReal;
        const pasoMeta = corriendo ? 1.45 : 1.15;
        if (this.timerPaso >= pasoMeta) {
          this.timerPaso = 0;
          this.audio.paso();
        }
      }
    }

    // Física vertical (salto + gravedad + balanceo de cabeza independiente de FPS)
    if (!this.enSuelo) {
      this.camaraFPS.position.y += this.velY * dt;
      this.velY -= 9.8 * dt;
      if (this.camaraFPS.position.y <= this.ALTURA_OJOS) {
        this.camaraFPS.position.y = this.ALTURA_OJOS;
        this.velY = 0;
        this.enSuelo = true;
      }
    } else if (estaMoviendose) {
      this.bobTimer += dt * (corriendo ? 11.5 : 8.0);
      const bobY = Math.sin(this.bobTimer) * 0.035;
      this.camaraFPS.position.y = this.ALTURA_OJOS + bobY;
    } else {
      this.camaraFPS.position.y +=
        (this.ALTURA_OJOS - this.camaraFPS.position.y) * (1 - Math.exp(-10 * dt));
    }

    // 2. Actualizar Viewmodel de Herramientas
    this.viewmodel.actualizar(dt, estaMoviendose ? velocidad : 0);

    // 3. Raycast central estilo Minecraft desde la mira (+)
    this.actualizarRaycast();
  }

  /**
   * Resuelve si una malla golpeada por el raycast pertenece a alguna de las 6 estaciones del surco
   */
  private resolverNodoDeMalla(mesh: AbstractMesh): NodoSurco | null {
    // 1. Por nombre directo
    const match = mesh.name.match(
      /(?:monticuloNodo|surcoRidge|charcoNodo|padTeleport|letrero|tutorNodo|petateNodo|granoNodo|tuboFrijol|vainaFrijol|hojaCalabaza|florCalabaza|frutoCalabaza|gajoCal|guiaCalabaza|pecioloCal|calizFlor|pedunculoCal|folioloFrijol|florFrijol)_(\d+)/
    );
    if (match) {
      const id = parseInt(match[1], 10);
      return this.surco.nodos[id] || null;
    }

    // 2. Recorrer jerarquía de padres por si golpeó el tallo, hoja, mazorca, espiga o cultivo asociado
    let actual: any = mesh;
    while (actual) {
      if (typeof actual.name === "string") {
        const mMaiz = actual.name.match(/(?:maiz|triadaFrijol|triadaCalabaza)_(\d+)/);
        if (mMaiz) {
          const id = parseInt(mMaiz[1], 10);
          return this.surco.nodos[id] || null;
        }
      }
      actual = actual.parent;
    }

    // 3. Si golpeó el camellón de tierra general, elegir el nodo más cercano al punto de impacto
    if (mesh.name === "camellonSurco") {
      return null;
    }

    return null;
  }

  /**
   * Lanza un rayo desde el centro de la pantalla (+) con alcance estilo Minecraft (6.5 m)
   */
  private actualizarRaycast(): void {
    const ray = this.camaraFPS.getForwardRay(6.5);
    const hit = this.scene.pickWithRay(
      ray,
      (m) =>
        m.isPickable &&
        m.isVisible &&
        m.isEnabled() &&
        !m.name.includes("vm") &&
        m.name !== "grassGround" &&
        m.name !== "grassPodium" &&
        m.name !== "soilBase" &&
        m.name !== "soilStratum" &&
        m.name !== "cajaSeleccionMinecraft"
    );

    this.nodoEnfocado = null;
    this.tipoObjetivoEnfocado = "ninguno";
    this.meshEnfocadoNombre = "";
    this.miraEnDonElote = false;
    this.cajaSeleccionMesh.setEnabled(false);

    if (hit && hit.hit && hit.pickedMesh) {
      const mesh = hit.pickedMesh;
      const meshName = mesh.name;
      this.meshEnfocadoNombre = meshName;

      // 1. ¿Apunta a un Drop Físico 3D de Mazorca en el suelo?
      if (
        meshName.includes("dropMesh_") ||
        meshName.includes("dropHusk_") ||
        meshName.includes("mazorcaDrop")
      ) {
        this.tipoObjetivoEnfocado = "drop_mazorca";
        this.resaltarReticula(true);
        this.mostrarTooltip("🌽 Mazorca Cosechada: [Clic] o acércate para recogerla");
        return;
      }

      // 2. ¿Apunta a la Troje / Almacén de Mazorcas?
      if (meshName.includes("almacen")) {
        this.tipoObjetivoEnfocado = "almacen";
        this.resaltarReticula(true);
        this.mostrarTooltip(
          "🏛️ Troje de Almacenamiento: [Clic] Guardar mazorcas de tu mano · [I] Abrir Almacén"
        );
        return;
      }

      // 2b. ¿Apunta a la Canasta / Carretilla Agrícola?
      if (
        meshName.includes("cestaMimbre") ||
        meshName.includes("asaCanasta") ||
        meshName.includes("badgeCanasta") ||
        meshName.includes("cajaCarro") ||
        meshName.includes("rueda_") ||
        meshName.includes("cobBasket_")
      ) {
        this.tipoObjetivoEnfocado = "canasta";
        this.resaltarReticula(true);
        this.mostrarTooltip(
          "🧺 Canasta y Carretilla Agrícola: [Clic] Ver tu cosecha o guardar en Troje · [I] Almacén"
        );
        return;
      }

      // 3. ¿Apunta a Don Elote?
      if (
        meshName.includes("Espanta") ||
        meshName.includes("Sombrero") ||
        meshName.includes("globo") ||
        meshName.includes("bocaPunto") ||
        meshName.includes("bigote")
      ) {
        this.miraEnDonElote = true;
        this.tipoObjetivoEnfocado = "don_elote";
        this.resaltarReticula(true);
        this.mostrarTooltip("🧑‍🌾 Don Elote: [Clic] o [E] para consejo agronómico");
        return;
      }

      // 4. ¿Apunta a vaina de frijol o flor/fruto de calabaza cosechable?
      if (
        meshName.includes("vainaFrijol_") ||
        meshName.includes("florCalabaza_") ||
        meshName.includes("frutoCalabaza_") ||
        meshName.includes("gajoCal_")
      ) {
        const nodo = this.resolverNodoDeMalla(mesh);
        if (nodo) {
          this.nodoEnfocado = nodo;
          this.tipoObjetivoEnfocado = "triada_cosecha";
          this.mostrarCajaSeleccionEnNodo(nodo);
          this.resaltarReticula(true);
          this.mostrarTooltip(
            `🫘🎃 Cultivo Asociado (Planta ${nodo.id + 1}): [Clic] Cosechar ingrediente de la Tríada`
          );
          return;
        }
      }

      // 5. ¿Apunta a Maleza o Quelites?
      if (meshName.includes("maleza") || meshName.includes("quelite")) {
        const pt = hit.pickedPoint || mesh.getAbsolutePosition();
        const nodo = this.surco.obtenerNodoCercano(pt);
        this.nodoEnfocado = nodo;
        this.tipoObjetivoEnfocado = "maleza";
        this.mostrarCajaSeleccionEnNodo(nodo);
        this.resaltarReticula(true);
        this.mostrarTooltip(`🌿 Maleza / Quelites (Planta ${nodo.id + 1}): [Clic] o [X] Arrancar de raíz`);
        return;
      }

      // 6. ¿Apunta a Fauna (Gusano, Ave, Abeja, Catarina)?
      if (
        meshName.includes("larva") ||
        meshName.includes("ave") ||
        meshName.includes("abeja") ||
        meshName.includes("catarina") ||
        meshName.includes("catCab")
      ) {
        const pt = hit.pickedPoint || mesh.getAbsolutePosition();
        const nodo = this.surco.obtenerNodoCercano(pt);
        this.nodoEnfocado = nodo;
        this.tipoObjetivoEnfocado = "fauna";
        this.resaltarReticula(true);
        this.mostrarTooltip("🐞 Fauna de la Milpa: [Clic] Interactuar / Retirar plaga");
        return;
      }

      // 7. ¿Apunta a una Estación / Planta del Surco de Milpa?
      let nodo = this.resolverNodoDeMalla(mesh);
      if (!nodo && meshName === "camellonSurco" && hit.pickedPoint) {
        const cand = this.surco.obtenerNodoCercano(hit.pickedPoint);
        if (Vector3.Distance(hit.pickedPoint, cand.posicionMundo) < 0.48) {
          nodo = cand;
        }
      }
      if (nodo) {
        this.nodoEnfocado = nodo;
        this.tipoObjetivoEnfocado = "nodo";
        this.surco.nodoSeleccionadoId = nodo.id;
        this.mostrarCajaSeleccionEnNodo(nodo);
        this.resaltarReticula(true);

        const accionDesc = this.obtenerDescripcionAccion(this.viewmodel.herramientaActual, nodo);
        this.mostrarTooltip(`🌱 Estación #${nodo.id + 1}: ${accionDesc}`);
        return;
      }

      // 8. ¿Apunta al Fogón, Banco de Semillas, Códice o Mesa de Clima?
      if (meshName.includes("fogon")) {
        this.tipoObjetivoEnfocado = "fogon";
        this.resaltarReticula(true);
        this.mostrarTooltip("🔥 Fogón Tradicional: [Clic Izq] Cocinar a mano · [Clic Der / F] Abrir Recetario");
        return;
      }
      if (meshName.includes("banco")) {
        this.tipoObjetivoEnfocado = "banco";
        this.resaltarReticula(true);
        this.mostrarTooltip("🧬 Banco de Semillas: [Clic] o [M] Abrir Selección Masal");
        return;
      }
      if (meshName.includes("dispensador")) {
        this.tipoObjetivoEnfocado = "dispensador";
        this.resaltarReticula(true);
        this.mostrarTooltip("🌰 Dispensador de Semillas: [Clic] en un botón de color = recibir esa semilla · [U] catálogo completo");
        return;
      }
      if (meshName.includes("codice")) {
        this.tipoObjetivoEnfocado = "codice";
        this.resaltarReticula(true);
        this.mostrarTooltip("📖 Códice del Maíz: [Clic] o [K] Abrir Páginas Ilustradas");
        return;
      }
      const meshLow = meshName.toLowerCase();
      if (
        meshLow.includes("btn") ||
        meshLow.includes("termo") ||
        meshLow.includes("mercurio") ||
        meshLow.includes("palanca") ||
        meshLow.includes("aspas") ||
        meshLow.includes("veleta") ||
        meshLow.includes("cubeta") ||
        meshLow.includes("orbe") ||
        meshLow.includes("pronostico") ||
        meshLow.includes("placabtniniciar") ||
        meshLow.includes("tablonmesa")
      ) {
        this.tipoObjetivoEnfocado = "mesa_clima";
        this.resaltarReticula(true);
        let descClima = "🎛️ Mesa de Clima 3D: [Clic] Accionar control";
        if (meshLow.includes("temp") || meshLow.includes("termo") || meshLow.includes("mercurio")) {
          descClima = "🌡️ Termómetro 3D: [Clic] Ajustar Temperatura";
        } else if (meshLow.includes("palanca") || meshLow.includes("lluvia")) {
          descClima = "🌧️ Palanca de Lluvia: [Clic] Alternar Sequía / Temporal / Tormenta";
        } else if (meshLow.includes("aspas") || meshLow.includes("veleta")) {
          descClima = "💨 Veleta de Viento: [Clic] Alternar velocidad del viento";
        } else if (meshLow.includes("cubeta")) {
          descClima = "🧪 Cubeta de Suelo: [Clic] Cambiar pH de la tierra";
        } else if (meshLow.includes("iniciar")) {
          descClima = "🌱 ¡Ir al Campo!: [Clic] Comenzar siembra en el surco";
        } else if (meshLow.includes("orbe") || meshLow.includes("pronostico")) {
          descClima = "🔮 Orbe de Pronóstico: [Clic] Ver estado o abrir Panel de Clima [C]";
        }
        this.mostrarTooltip(descClima);
        return;
      }
    }

    this.resaltarReticula(false);
    this.tooltipElem.style.display = "none";
  }

  private mostrarCajaSeleccionEnNodo(nodo: NodoSurco): void {
    this.cajaSeleccionMesh.position.set(
      nodo.posicionMundo.x,
      nodo.posicionMundo.y + 0.06,
      nodo.posicionMundo.z
    );
    this.cajaSeleccionMesh.setEnabled(true);
  }

  private obtenerDescripcionAccion(herramienta: HerramientaTipo, nodo: NodoSurco): string {
    const dia = nodo.diasCultivo;
    const estaMuerta = nodo.sembrada && (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta);
    const listaCosecha = this.surco.estaListoParaCosecha(nodo.id);
    const tipoCosecha = this.surco.obtenerTipoCosecha(nodo.id);
    const etiquetaCosecha =
      tipoCosecha === "grano_seco"
        ? "Grano Seco R6 (ideal nixtamal/semilla)"
        : "Elote Tierno R3 (esquites/elotes)";

    if (estaMuerta && !nodo.cosechada) {
      if (listaCosecha) {
        return `🌽 Mazorca seca lista ([9] Cosechar o [Clic Der]) · [Q] Quitar`;
      }
      return `💀 Planta seca (${nodo.plantaInterna.causaMuerte || "estrés"}): [Q] o Azada [2] para limpiar`;
    }

    if (listaCosecha && herramienta !== "cosecha" && herramienta !== "mano") {
      return `🌽 ¡Listo (${etiquetaCosecha})! [Clic Der] o [9] Guante para cosechar · [L] Ficha`;
    }

    switch (herramienta) {
      case "mano":
        if (nodo.cosechada) {
          return `✋ [Clic Izq] Arrancar rastrojo a mano y limpiar montículo`;
        }
        if (listaCosecha) {
          return `✋ [Clic Izq] ¡Cosechar ${etiquetaCosecha} con las manos! 🌽`;
        }
        if (nodo.plaga > 5) {
          return `✋ [Clic Izq] Retirar plagas con las manos (${Math.round(nodo.plaga)}%) 🐛`;
        }
        if (nodo.maleza > 5) {
          return `✋ [Clic Izq] Arrancar maleza / quelites a mano (${Math.round(nodo.maleza)}%) 🌿`;
        }
        const etapaN = this.surco.obtenerEtapaNodo(nodo.id);
        if (
          nodo.sembrada &&
          etapaN >= 7 &&
          etapaN <= 10 &&
          nodo.polinizacion < 0.98
        ) {
          return `✋ [Clic Izq] Sacudir espiga con la mano para polinizar (${Math.round(nodo.polinizacion * 100)}%) 🌼`;
        }
        if (!nodo.sembrada && nodo.tierraArada < 100) {
          return `✋ [Clic Izq] Aflojar terrones a mano (${Math.round(nodo.tierraArada)}%) o usa Azada [2]`;
        }
        if (!nodo.sembrada && nodo.tierraArada >= 100) {
          return `✋ [Clic Izq] Sembrar semilla de ${nodo.variedad.toUpperCase()} con la mano 🌱`;
        }
        return `✋ [Clic Izq] Inspeccionar planta (Día ${Math.floor(dia)} · [L] Ficha Clínica) 🔍`;
      case "azada":
        if (nodo.cosechada) {
          return `[Clic Izq] o [Q] Retirar rastrojo y preparar tierra ⛏️`;
        }
        return nodo.tierraArada < 100
          ? `[Clic Izq] Arar tierra (${Math.round(nodo.tierraArada)}%) ⛏️`
          : nodo.sembrada
          ? `Planta activa · [Q] Quitar planta si deseas reiniciar`
          : `Tierra 100% arada · Equipa una Semilla [3-6] para sembrar ✨`;
      case "semilla":
      case "semilla_chalqueno":
      case "semilla_azul":
      case "semilla_rojo":
      case "semilla_palomero": {
        const vHerr = variedadDeHerramienta(herramienta);
        const nombreVar = vHerr ? VARIEDADES_MAIZ[vHerr].nombre : nodo.variedad.toUpperCase();
        return !nodo.sembrada || nodo.cosechada
          ? `[Clic Izq] Sembrar ${nombreVar} aquí (cualquier casilla) 🌰`
          : `Sembrada (Día ${Math.floor(dia)}) · Asocia Frijol [B] o Calabaza [N]`;
      }
      case "frijol":
        return !nodo.sembrada
          ? `Siembra maíz primero [3-6] para asociar Frijol Ayocote 🫘`
          : nodo.frijolVid > 0.1
          ? `🫘 Frijol Ayocote asociado (${Math.round(nodo.frijolVid * 100)}% guía · fija Nitrógeno)`
          : `🫘 [Clic Izq] Asociar Frijol Ayocote enredado (+Nitrógeno al suelo)`;
      case "calabaza":
        return !nodo.sembrada
          ? `Siembra maíz primero [3-6] para asociar Calabaza Criolla 🎃`
          : nodo.calabazaCobertura > 0.1
          ? `🎃 Calabaza Criolla cubriendo suelo (${Math.round(nodo.calabazaCobertura * 100)}% sombra)`
          : `🎃 [Clic Izq] Sembrar Calabaza Criolla (retiene humedad y frena maleza)`;
      case "regadera":
        return `[Clic Izq] Regar agua (${Math.round(nodo.humedadVWC)}% VWC) 💧`;
      case "abono":
        return `[Clic Izq] Abonar nutrientes (N:${Math.round(nodo.nSuelo)} P:${Math.round(nodo.pSuelo)} K:${Math.round(nodo.kSuelo)}) 🌿`;
      case "cosecha":
        return nodo.cosechada
          ? `Mazorca cosechada · [Q] o Azada [2] para limpiar rastrojo`
          : listaCosecha
          ? `[Clic Izq] ¡Cosechar ${etiquetaCosecha}! (Calidad ${Math.round(nodo.calidad * 100)}%) 🌽`
          : `En crecimiento (${nodo.estadoCrec.etapa} · Día ${Math.floor(dia)}) · [Y] +15d o [J] Crecer`;
      case "sol":
        return `[Clic Izq] Avanzar +15 Días de Sol ☀️`;
      default:
        return `[Clic] Interactuar · [Q] Quitar · [O] Ficha Clínica`;
    }
  }

  private resaltarReticula(activa: boolean): void {
    if (activa) {
      this.reticulaElem.style.transform = "scale(1.35)";
      this.reticulaElem.style.color = "#fbbf24";
    } else {
      this.reticulaElem.style.transform = "scale(1.0)";
      this.reticulaElem.style.color = "rgba(255, 255, 255, 0.92)";
    }
  }

  private mostrarTooltip(texto: string): void {
    if (this.usandoGamepad) {
      texto = texto
        .replace(/\[Clic Izq\]/g, "[RT]")
        .replace(/\[Clic Der \/ F\]/g, "[LT / X]")
        .replace(/\[Clic Der\]/g, "[LT]")
        .replace(/\[Clic\]/g, "[RT / X]")
        .replace(/\[Q\]/g, "[B]")
        .replace(/\[I\]/g, "[Y]")
        .replace(/\[E\]/g, "[X]");
    }
    this.tooltipElem.textContent = texto;
    this.tooltipElem.style.display = "block";
  }

  public get posicionMundo(): Vector3 {
    return this.camaraFPS.position;
  }

  public teletransportarA(posicion: Vector3, mirarA?: Vector3): void {
    this.velY = 0;
    this.enSuelo = true;
    this.camaraFPS.position.set(posicion.x, this.ALTURA_OJOS, posicion.z);
    this.camaraFPS.setTarget(mirarA ?? new Vector3(posicion.x, 0.52, 0));
  }
}
