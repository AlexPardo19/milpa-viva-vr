/**
 * Modelo en Primera Persona de Herramientas y Manos (Viewmodel FPS)
 *
 * Renderiza la herramienta equipada directamente en el campo de visión del jugador
 * con balanceo natural al caminar (weapon bobbing), balanceo de respiración (idle sway)
 * y animaciones dinámicas de impacto (blandir azada, inclinar regadera, sembrar y cosechar).
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  Mesh,
  MeshBuilder,
  TransformNode,
  Camera
} from "@babylonjs/core";
import { HerramientaTipo } from "../educativo/estado_educativo";
import { AudioSintetizador } from "../audio_sintetizador";
import { ParticulasEducativas } from "../educativo/particulas_educativas";

export class ViewmodelHerramientas {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly root: TransformNode;
  readonly audio: AudioSintetizador;
  readonly particulas: ParticulasEducativas;

  // Nodos de herramientas individuales
  private nodoManos!: TransformNode;
  private manoIzqVM!: TransformNode;
  private manoDerVM!: TransformNode;
  private nodoAzada!: TransformNode;
  private nodoSemillas!: TransformNode;
  private nodoRegadera!: TransformNode;
  private nodoAbono!: TransformNode;
  private nodoCosecha!: TransformNode;

  // Estado
  public herramientaActual: HerramientaTipo = "azada";
  public estaAnimando = false;
  private tiempoIdle = 0;
  private animacionProgreso = 0;
  private tipoAnimacion: HerramientaTipo | null = null;
  private onImpactoCallback: (() => void) | null = null;

  // Posiciones de reposo relativas a la cámara
  private readonly POS_REPOSO = new Vector3(0.24, -0.16, 0.52);
  private readonly ROT_REPOSO = new Vector3(0.08, -0.12, -0.05);

  constructor(
    scene: Scene,
    camera: Camera,
    audio: AudioSintetizador,
    particulas: ParticulasEducativas
  ) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.particulas = particulas;

    this.root = new TransformNode("viewmodelRoot", scene);
    this.root.parent = camera;
    this.root.position.copyFrom(this.POS_REPOSO);
    this.root.rotation.copyFrom(this.ROT_REPOSO);

    this.construirModelos();
    this.equipar("azada");
  }

  private mat(hex: string, em = 0.45): StandardMaterial {
    const m = new StandardMaterial(`matVM_${hex}_${Math.random()}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    return m;
  }

  private ink(mesh: Mesh, width = 0.012, colHex = "#25330f"): void {
    mesh.renderOutline = true;
    mesh.outlineWidth = width;
    mesh.outlineColor = Color3.FromHexString(colHex);
  }

  private construirModelos(): void {
    // 1. AZADA EN PRIMERA PERSONA
    this.nodoAzada = new TransformNode("vmAzada", this.scene);
    this.nodoAzada.parent = this.root;

    const mango = MeshBuilder.CreateCylinder("vmMangoAzada", { height: 1.1, diameter: 0.045 }, this.scene);
    mango.rotation.x = Math.PI / 3.0;
    mango.rotation.z = -0.15;
    mango.position.set(0, 0.15, 0.22);
    mango.material = this.mat("#bfa052", 0.5);
    mango.parent = this.nodoAzada;
    this.ink(mango);

    const conector = MeshBuilder.CreateCylinder("vmConectorAzada", { height: 0.10, diameter: 0.065 }, this.scene);
    conector.rotation.x = Math.PI / 3.0;
    conector.rotation.z = -0.15;
    conector.position.set(-0.06, 0.52, 0.58);
    conector.material = this.mat("#334155", 0.5);
    conector.parent = this.nodoAzada;
    this.ink(conector);

    const hoja = MeshBuilder.CreateBox("vmHojaAzada", { width: 0.28, height: 0.20, depth: 0.025 }, this.scene);
    hoja.position.set(-0.06, 0.52, 0.64);
    hoja.rotation.x = Math.PI / 1.5;
    hoja.rotation.y = -0.25;
    hoja.rotation.z = 0.2;
    hoja.material = this.mat("#cbd5e1", 0.7);
    hoja.parent = this.nodoAzada;
    this.ink(hoja, 0.015);

    // Dos manos caricaturescas envolviendo el mango
    const mano1 = MeshBuilder.CreateSphere("vmManoAzada1", { diameterX: 0.10, diameterY: 0.08, diameterZ: 0.12 }, this.scene);
    mano1.position.set(0.02, 0.02, 0.10);
    mano1.material = this.mat("#fed7aa", 0.6);
    mano1.parent = this.nodoAzada;
    this.ink(mano1);

    const mano2 = MeshBuilder.CreateSphere("vmManoAzada2", { diameterX: 0.09, diameterY: 0.08, diameterZ: 0.11 }, this.scene);
    mano2.position.set(-0.02, 0.25, 0.32);
    mano2.material = this.mat("#fed7aa", 0.6);
    mano2.parent = this.nodoAzada;
    this.ink(mano2);

    // 2. BOLSA DE SEMILLAS
    this.nodoSemillas = new TransformNode("vmSemillas", this.scene);
    this.nodoSemillas.parent = this.root;

    const saco = MeshBuilder.CreateSphere("vmSacoSemillas", { diameterX: 0.18, diameterY: 0.22, diameterZ: 0.18 }, this.scene);
    saco.position.set(0.04, 0.14, 0.32);
    saco.material = this.mat("#d97706", 0.6);
    saco.parent = this.nodoSemillas;
    this.ink(saco);

    // Semillas asomándose
    const granos = MeshBuilder.CreateSphere("vmGranosAsomados", { diameter: 0.08 }, this.scene);
    granos.position.set(0.04, 0.24, 0.32);
    granos.material = this.mat("#fbbf24", 0.75);
    granos.parent = this.nodoSemillas;
    this.ink(granos);

    const manoSaco = MeshBuilder.CreateSphere("vmManoSaco", { diameterX: 0.10, diameterY: 0.08, diameterZ: 0.11 }, this.scene);
    manoSaco.position.set(0.04, 0.05, 0.28);
    manoSaco.material = this.mat("#fed7aa", 0.6);
    manoSaco.parent = this.nodoSemillas;
    this.ink(manoSaco);

    // 3. REGADERA METÁLICA
    this.nodoRegadera = new TransformNode("vmRegadera", this.scene);
    this.nodoRegadera.parent = this.root;

    const cuerpoReg = MeshBuilder.CreateCylinder("vmCuerpoReg", { height: 0.22, diameter: 0.16 }, this.scene);
    cuerpoReg.position.set(0.02, 0.06, 0.26);
    cuerpoReg.material = this.mat("#0284c7", 0.65);
    cuerpoReg.parent = this.nodoRegadera;
    this.ink(cuerpoReg);

    const canoReg = MeshBuilder.CreateCylinder("vmCanoReg", { height: 0.22, diameterTop: 0.035, diameterBottom: 0.05 }, this.scene);
    canoReg.position.set(-0.06, 0.14, 0.38);
    canoReg.rotation.x = -Math.PI / 3.8;
    canoReg.rotation.y = -Math.PI / 8;
    canoReg.material = this.mat("#0284c7", 0.65);
    canoReg.parent = this.nodoRegadera;
    this.ink(canoReg);

    const rosetaReg = MeshBuilder.CreateSphere("vmRosetaReg", { diameter: 0.075 }, this.scene);
    rosetaReg.position.set(-0.11, 0.22, 0.46);
    rosetaReg.material = this.mat("#facc15", 0.75);
    rosetaReg.parent = this.nodoRegadera;
    this.ink(rosetaReg);

    // 4. ABONO ORGÁNICO
    this.nodoAbono = new TransformNode("vmAbono", this.scene);
    this.nodoAbono.parent = this.root;

    const sacoAbono = MeshBuilder.CreateBox("vmSacoAbono", { width: 0.18, height: 0.22, depth: 0.12 }, this.scene);
    sacoAbono.position.set(0.03, 0.08, 0.24);
    sacoAbono.material = this.mat("#15803d", 0.6);
    sacoAbono.parent = this.nodoAbono;
    this.ink(sacoAbono);

    const humus = MeshBuilder.CreateSphere("vmHumusAbono", { diameter: 0.12 }, this.scene);
    humus.position.set(0.03, 0.19, 0.24);
    humus.material = this.mat("#451a03", 0.7);
    humus.parent = this.nodoAbono;
    this.ink(humus);

    // 5. GUANTELETE / MANO LIBRE DE COSECHA
    this.nodoCosecha = new TransformNode("vmCosecha", this.scene);
    this.nodoCosecha.parent = this.root;

    const guante = MeshBuilder.CreateBox("vmGuanteCosecha", { width: 0.14, height: 0.16, depth: 0.09 }, this.scene);
    guante.position.set(0.03, 0.05, 0.24);
    guante.material = this.mat("#ea580c", 0.65);
    guante.parent = this.nodoCosecha;
    this.ink(guante);

    const dedos = MeshBuilder.CreateBox("vmDedosCosecha", { width: 0.12, height: 0.08, depth: 0.07 }, this.scene);
    dedos.position.set(0.03, 0.15, 0.26);
    dedos.material = this.mat("#fed7aa", 0.65);
    dedos.parent = this.nodoCosecha;
    this.ink(dedos);

    // 6. MANOS LIBRES EN PRIMERA PERSONA (Ambas manos articuladas para interactuar con el entorno)
    this.nodoManos = new TransformNode("vmManosLibres", this.scene);
    this.nodoManos.parent = this.root;

    const matPiel = this.mat("#fed7aa", 0.62);
    const matManga = this.mat("#15803d", 0.52);
    const matPuno = this.mat("#fbbf24", 0.65);

    const crearManoArticulada = (prefijo: string, signoLado: -1 | 1): TransformNode => {
      const nodo = new TransformNode(prefijo, this.scene);
      nodo.parent = this.nodoManos;

      // Antebrazo / Manga campesina
      const manga = MeshBuilder.CreateCylinder(
        `${prefijo}_manga`,
        { height: 0.18, diameterTop: 0.078, diameterBottom: 0.095, tessellation: 12 },
        this.scene
      );
      manga.rotation.x = Math.PI / 2.6;
      manga.rotation.z = -signoLado * 0.18;
      manga.position.set(0, -0.04, 0.02);
      manga.material = matManga;
      manga.parent = nodo;
      this.ink(manga, 0.011);

      // Puño bordado de la camisa
      const puno = MeshBuilder.CreateTorus(
        `${prefijo}_puno`,
        { diameter: 0.082, thickness: 0.018, tessellation: 14 },
        this.scene
      );
      puno.rotation.x = Math.PI / 2.6;
      puno.position.set(0, 0.01, 0.09);
      puno.material = matPuno;
      puno.parent = nodo;
      this.ink(puno, 0.008);

      // Palma redondeada
      const palma = MeshBuilder.CreateSphere(
        `${prefijo}_palma`,
        { diameterX: 0.105, diameterY: 0.068, diameterZ: 0.115, segments: 12 },
        this.scene
      );
      palma.position.set(0, 0.045, 0.155);
      palma.rotation.x = 0.25;
      palma.rotation.z = -signoLado * 0.22;
      palma.material = matPiel;
      palma.parent = nodo;
      this.ink(palma, 0.011);

      // Dedo pulgar oponible
      const pulgar = MeshBuilder.CreateCylinder(
        `${prefijo}_pulgar`,
        { height: 0.065, diameterTop: 0.022, diameterBottom: 0.028, tessellation: 10 },
        this.scene
      );
      pulgar.position.set(-signoLado * 0.048, 0.055, 0.165);
      pulgar.rotation.x = Math.PI / 3.2;
      pulgar.rotation.z = signoLado * 0.55;
      pulgar.material = matPiel;
      pulgar.parent = nodo;
      this.ink(pulgar, 0.008);

      // 4 Dedos articulados ligeramente curvados listos para interactuar
      const offsetsDedos = [-0.033, -0.011, 0.011, 0.033];
      const largosDedos = [0.062, 0.070, 0.064, 0.052];
      for (let d = 0; d < 4; d++) {
        const dedo = MeshBuilder.CreateCylinder(
          `${prefijo}_dedo_${d}`,
          { height: largosDedos[d], diameterTop: 0.018, diameterBottom: 0.022, tessellation: 10 },
          this.scene
        );
        dedo.position.set(offsetsDedos[d], 0.068, 0.222);
        dedo.rotation.x = Math.PI / 2.5;
        dedo.rotation.y = offsetsDedos[d] * 1.5;
        dedo.material = matPiel;
        dedo.parent = nodo;
        this.ink(dedo, 0.008);
      }

      return nodo;
    };

    // Posicionar Mano Izquierda y Mano Derecha encuadrando la vista en primera persona
    this.manoIzqVM = crearManoArticulada("vmManoLibreIzq", -1);
    this.manoIzqVM.position.set(-0.46, -0.02, 0.08);
    this.manoIzqVM.rotation.set(0.05, 0.22, -0.08);

    this.manoDerVM = crearManoArticulada("vmManoLibreDer", 1);
    this.manoDerVM.position.set(-0.02, -0.02, 0.08);
    this.manoDerVM.rotation.set(0.05, -0.12, 0.08);
  }

  /**
   * Cambia la herramienta activa en la mano del jugador
   */
  public equipar(herramienta: HerramientaTipo): void {
    this.herramientaActual = herramienta;

    this.nodoManos.setEnabled(herramienta === "mano");
    this.nodoAzada.setEnabled(herramienta === "azada");
    this.nodoSemillas.setEnabled(herramienta === "semilla");
    this.nodoRegadera.setEnabled(herramienta === "regadera");
    this.nodoAbono.setEnabled(herramienta === "abono");
    this.nodoCosecha.setEnabled(herramienta === "cosecha" || herramienta === "sol");

    // Pequeño retroceso al sacar la herramienta o mostrar las manos
    this.root.position.y = this.POS_REPOSO.y - 0.12;
  }

  /**
   * Ejecuta el golpe / acción física de la herramienta en primera persona
   */
  public accionar(onImpacto?: () => void): void {
    if (this.estaAnimando) return;

    this.estaAnimando = true;
    this.animacionProgreso = 0;
    this.tipoAnimacion = this.herramientaActual;
    this.onImpactoCallback = onImpacto || null;

    if (this.herramientaActual === "regadera") {
      this.audio.iniciarAgua();
    }
  }

  /**
   * Actualiza el balanceo natural (bobbing) y la cinemática de la herramienta
   */
  public actualizar(dt: number, velocidadMovimiento: number): void {
    this.tiempoIdle += dt;

    // 1. Balanceo natural por respiración (idle breathing)
    const factorSway = Math.min(1.0, velocidadMovimiento * 0.4 + 0.3);
    const bobX = Math.sin(this.tiempoIdle * 2.5) * 0.015 * factorSway;
    const bobY = Math.abs(Math.sin(this.tiempoIdle * 5.0)) * 0.02 * factorSway;

    // 2. Si no hay acción activa, mantener reposo suave con bobbing
    if (!this.estaAnimando) {
      this.root.position.x = this.POS_REPOSO.x + bobX;
      this.root.position.y += (this.POS_REPOSO.y - bobY - this.root.position.y) * 0.18;
      this.root.position.z = this.POS_REPOSO.z;

      this.root.rotation.x = this.ROT_REPOSO.x;
      this.root.rotation.y = this.ROT_REPOSO.y;
      this.root.rotation.z = this.ROT_REPOSO.z + bobX * 0.5;

      // Balanceo alternado de ambas manos cuando "mano" está equipada
      if (this.herramientaActual === "mano" && this.manoIzqVM && this.manoDerVM) {
        const oscIzq = Math.sin(this.tiempoIdle * 4.5) * 0.018 * factorSway;
        const oscDer = -Math.sin(this.tiempoIdle * 4.5) * 0.018 * factorSway;
        this.manoIzqVM.position.set(-0.46 - bobX * 0.6, -0.02 + oscIzq, 0.08 + oscDer * 0.6);
        this.manoIzqVM.rotation.set(0.05 + oscIzq * 1.5, 0.22, -0.08);
        this.manoDerVM.position.set(-0.02 + bobX * 0.6, -0.02 + oscDer, 0.08 + oscIzq * 0.6);
        this.manoDerVM.rotation.set(0.05 + oscDer * 1.5, -0.12, 0.08);
      }
      return;
    }

    // 3. Ejecución de animación de acción
    this.animacionProgreso += dt * 3.8;

    switch (this.tipoAnimacion) {
      case "mano": {
        // Ambas manos se extienden al frente para tocar / agarrar / interactuar con el entorno
        if (this.animacionProgreso < 0.45) {
          const f = this.animacionProgreso / 0.45;
          this.root.position.z = this.POS_REPOSO.z + f * 0.24;
          this.root.position.y = this.POS_REPOSO.y + f * 0.05;
          if (this.manoIzqVM && this.manoDerVM) {
            this.manoIzqVM.position.x = -0.46 + f * 0.12;
            this.manoDerVM.position.x = -0.02 - f * 0.10;
            this.manoIzqVM.rotation.x = 0.05 + f * 0.42;
            this.manoDerVM.rotation.x = 0.05 + f * 0.42;
          }
        } else if (this.animacionProgreso < 0.65) {
          if (this.onImpactoCallback) {
            this.audio.clickUI();
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        } else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.65) / 0.35;
          const inv = 1 - f;
          this.root.position.z = this.POS_REPOSO.z + 0.24 * inv;
          this.root.position.y = this.POS_REPOSO.y + 0.05 * inv;
          if (this.manoIzqVM && this.manoDerVM) {
            this.manoIzqVM.position.x = -0.46 + 0.12 * inv;
            this.manoDerVM.position.x = -0.02 - 0.10 * inv;
            this.manoIzqVM.rotation.x = 0.05 + 0.42 * inv;
            this.manoDerVM.rotation.x = 0.05 + 0.42 * inv;
          }
        } else {
          this.estaAnimando = false;
        }
        break;
      }

      case "azada": {
        // Fase 1 (0 -> 0.45): Preparar y levantar
        if (this.animacionProgreso < 0.45) {
          const f = this.animacionProgreso / 0.45;
          this.root.rotation.x = this.ROT_REPOSO.x - f * 0.65;
          this.root.position.y = this.POS_REPOSO.y + f * 0.14;
          this.root.position.z = this.POS_REPOSO.z - f * 0.08;
        }
        // Fase 2 (0.45 -> 0.65): Golpe rápido hacia abajo
        else if (this.animacionProgreso < 0.65) {
          const f = (this.animacionProgreso - 0.45) / 0.20;
          this.root.rotation.x = this.ROT_REPOSO.x - 0.65 + f * 1.35;
          this.root.position.y = this.POS_REPOSO.y + 0.14 - f * 0.28;
          this.root.position.z = this.POS_REPOSO.z - 0.08 + f * 0.25;

          // Punto de impacto en el ápice inferior
          if (this.onImpactoCallback && f >= 0.75) {
            this.audio.golpeAzada();
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        }
        // Fase 3 (0.65 -> 1.0): Recuperación elástica
        else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.65) / 0.35;
          this.root.rotation.x = this.ROT_REPOSO.x + 0.70 * (1 - f);
          this.root.position.y = this.POS_REPOSO.y - 0.14 * (1 - f);
          this.root.position.z = this.POS_REPOSO.z + 0.17 * (1 - f);
        } else {
          this.estaAnimando = false;
        }
        break;
      }

      case "regadera": {
        // Inclinación hacia adelante para verter agua
        if (this.animacionProgreso < 0.3) {
          const f = this.animacionProgreso / 0.3;
          this.root.rotation.z = this.ROT_REPOSO.z - f * 0.75;
          this.root.position.y = this.POS_REPOSO.y - f * 0.06;
          this.root.position.z = this.POS_REPOSO.z + f * 0.15;
        } else if (this.animacionProgreso < 0.85) {
          // Mantener vertido y punto de impacto hídrico
          if (this.onImpactoCallback && this.animacionProgreso > 0.45) {
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        } else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.85) / 0.15;
          this.root.rotation.z = this.ROT_REPOSO.z - 0.75 * (1 - f);
          this.root.position.y = this.POS_REPOSO.y - 0.06 * (1 - f);
          this.root.position.z = this.POS_REPOSO.z + 0.15 * (1 - f);
        } else {
          this.audio.detenerAgua();
          this.estaAnimando = false;
        }
        break;
      }

      case "semilla": {
        // Lanzar semillas con impulso
        if (this.animacionProgreso < 0.4) {
          const f = this.animacionProgreso / 0.4;
          this.root.position.z = this.POS_REPOSO.z + f * 0.22;
          this.root.rotation.x = this.ROT_REPOSO.x - f * 0.4;
        } else if (this.animacionProgreso < 0.6) {
          if (this.onImpactoCallback) {
            this.audio.semillas();
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        } else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.6) / 0.4;
          this.root.position.z = this.POS_REPOSO.z + 0.22 * (1 - f);
          this.root.rotation.x = this.ROT_REPOSO.x - 0.4 * (1 - f);
        } else {
          this.estaAnimando = false;
        }
        break;
      }

      case "abono": {
        if (this.animacionProgreso < 0.4) {
          const f = this.animacionProgreso / 0.4;
          this.root.position.z = this.POS_REPOSO.z + f * 0.20;
          this.root.position.y = this.POS_REPOSO.y + f * 0.08;
        } else if (this.animacionProgreso < 0.6) {
          if (this.onImpactoCallback) {
            this.audio.abono();
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        } else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.6) / 0.4;
          this.root.position.z = this.POS_REPOSO.z + 0.20 * (1 - f);
          this.root.position.y = this.POS_REPOSO.y + 0.08 * (1 - f);
        } else {
          this.estaAnimando = false;
        }
        break;
      }

      case "cosecha":
      default: {
        // Mano toma y tira con fuerza
        if (this.animacionProgreso < 0.5) {
          const f = this.animacionProgreso / 0.5;
          this.root.position.z = this.POS_REPOSO.z + f * 0.30;
          this.root.rotation.y = this.ROT_REPOSO.y + f * 0.35;
        } else if (this.animacionProgreso < 0.7) {
          if (this.onImpactoCallback) {
            this.audio.cosecha();
            this.onImpactoCallback();
            this.onImpactoCallback = null;
          }
        } else if (this.animacionProgreso <= 1.0) {
          const f = (this.animacionProgreso - 0.7) / 0.3;
          this.root.position.z = this.POS_REPOSO.z + 0.30 * (1 - f);
          this.root.rotation.y = this.ROT_REPOSO.y + 0.35 * (1 - f);
        } else {
          this.estaAnimando = false;
        }
        break;
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }
}
