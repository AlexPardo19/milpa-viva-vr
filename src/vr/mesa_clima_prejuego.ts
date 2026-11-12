/**
 * Mesa de Control Climatológico 3D (Lobby Pre-Juego Diegético en VR) (v3.0)
 *
 * Diorama interactivo ubicado en el cobertizo rústico previo a la siembra.
 * En lugar de menús 2D, el niño manipula 4 controles físicos tridimensionales:
 * 1. Rueda Solar / Termómetro (Temperatura)
 * 2. Palanca de Lluvia y Sequía (Precipitación y Humedad)
 * 3. Fuelle de Viento / Veleta (Velocidad de Viento)
 * 4. Muestras de Tierra en Cubetas (pH y Sustrato)
 * Y un Orbe de Pronóstico 3D que indica la dificultad del reto ecológico.
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ShadowGenerator,
  Animation,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { ClimateState, ESCENARIOS } from "../clima";

export interface MesaClimaCallbacks {
  onIniciarCampo: (climaConfigurado: ClimateState) => void;
  onCambioClimaPreview: (clima: ClimateState) => void;
}

export class MesaClimaPrejuego {
  readonly scene: Scene;
  readonly root: TransformNode;
  private callbacks: MesaClimaCallbacks;
  private clima: ClimateState;

  // Mallas interactivas
  private mesaMesh!: Mesh;
  private orbeMesh!: Mesh;
  private orbeTex!: DynamicTexture;
  private btnIniciarCampo!: Mesh;
  private termometroCilindro!: Mesh;
  private palancaLluviaMesh!: Mesh;
  private veletaAspas!: Mesh;
  private cubetasTierra: Mesh[] = [];

  // Estado del diorama
  public visible = true;
  private nivelDificultad = 1; // 1 a 3 estrellas
  private nombreReto = "Temporal Óptimo (Amigable)";

  constructor(
    scene: Scene,
    climaInicial: ClimateState,
    callbacks: MesaClimaCallbacks,
    shadowGen: ShadowGenerator | null = null
  ) {
    this.scene = scene;
    this.clima = { ...climaInicial };
    this.callbacks = callbacks;
    this.root = new TransformNode("mesaClimaRoot", scene);
    
    // Ubicada en el cobertizo a espaldas del surco (z = -3.8m, orientada al campo)
    this.root.position.set(0, 0, -3.8);

    this.construirMesaMadera(shadowGen);
    this.construirTermometroRueda();
    this.construirPalancaLluvia();
    this.construirFuelleViento();
    this.construirCubetasTierra();
    this.construirOrbePronostico();
    this.construirBotonEntrarCampo();
  }

  private construirMesaMadera(shadowGen: ShadowGenerator | null): void {
    const woodMat = new StandardMaterial("matMesaClima", this.scene);
    woodMat.diffuseColor = Color3.FromHexString("#78350f");
    woodMat.emissiveColor = Color3.FromHexString("#451a03").scale(0.35);

    // Tablón superior
    this.mesaMesh = MeshBuilder.CreateBox("tablonMesa", {
      width: 2.20,
      height: 0.12,
      depth: 1.10
    }, this.scene);
    this.mesaMesh.position.set(0, 0.85, 0);
    this.mesaMesh.material = woodMat;
    this.mesaMesh.parent = this.root;
    this.mesaMesh.renderOutline = true;
    this.mesaMesh.outlineWidth = 0.018;
    this.mesaMesh.outlineColor = Color3.FromHexString("#25330f");

    // 4 Patas
    const posPatas = [
      [-0.95, -0.45],
      [0.95, -0.45],
      [-0.95, 0.45],
      [0.95, 0.45]
    ];
    for (let i = 0; i < posPatas.length; i++) {
      const [x, z] = posPatas[i];
      const pata = MeshBuilder.CreateCylinder(`pataMesa_${i}`, {
        diameter: 0.08,
        height: 0.85,
        tessellation: 12
      }, this.scene);
      pata.position.set(x, 0.425, z);
      pata.material = woodMat;
      pata.parent = this.root;
      pata.renderOutline = true;
      pata.outlineWidth = 0.012;
      pata.outlineColor = Color3.FromHexString("#25330f");
    }

    if (shadowGen) {
      shadowGen.addShadowCaster(this.mesaMesh);
    }
  }

  /**
   * Control 1: Termómetro / Rueda de Temperatura
   */
  private construirTermometroRueda(): void {
    const base = MeshBuilder.CreateBox("baseTermometro", { width: 0.28, height: 0.45, depth: 0.08 }, this.scene);
    base.position.set(-0.75, 1.14, -0.15);
    base.parent = this.root;

    const baseMat = new StandardMaterial("matBaseTermo", this.scene);
    baseMat.diffuseColor = Color3.FromHexString("#fef3c7");
    base.material = baseMat;
    base.renderOutline = true;
    base.outlineWidth = 0.012;
    base.outlineColor = Color3.FromHexString("#25330f");

    // Tubo del mercurio
    const tuboMat = new StandardMaterial("matTuboMercurio", this.scene);
    tuboMat.diffuseColor = Color3.FromHexString("#ef4444");
    tuboMat.emissiveColor = Color3.FromHexString("#dc2626").scale(0.5);

    this.termometroCilindro = MeshBuilder.CreateCylinder("mercurio", {
      diameter: 0.04,
      height: 0.28,
      tessellation: 12
    }, this.scene);
    this.termometroCilindro.position.set(-0.75, 1.12, -0.10);
    this.termometroCilindro.material = tuboMat;
    this.termometroCilindro.parent = this.root;

    // Botones 3D de +/- temperatura
    const btnMas = MeshBuilder.CreateSphere("btnTempMas", { diameter: 0.08 }, this.scene);
    btnMas.position.set(-0.75, 1.40, -0.15);
    btnMas.parent = this.root;
    const matMas = new StandardMaterial("matBtnTempMas", this.scene);
    matMas.diffuseColor = Color3.FromHexString("#ef4444");
    btnMas.material = matMas;
    btnMas.renderOutline = true;
    btnMas.outlineWidth = 0.01;
    btnMas.outlineColor = Color3.FromHexString("#25330f");

    const btnMenos = MeshBuilder.CreateSphere("btnTempMenos", { diameter: 0.08 }, this.scene);
    btnMenos.position.set(-0.75, 0.95, -0.15);
    btnMenos.parent = this.root;
    const matMenos = new StandardMaterial("matBtnTempMenos", this.scene);
    matMenos.diffuseColor = Color3.FromHexString("#38bdf8");
    btnMenos.material = matMenos;
    btnMenos.renderOutline = true;
    btnMenos.outlineWidth = 0.01;
    btnMenos.outlineColor = Color3.FromHexString("#25330f");

    // Interacción al hacer clic en los botones
    btnMas.actionManager = new ActionManager(this.scene);
    btnMas.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.ajustarTemperatura(this.clima.temperatura + 5);
      })
    );

    btnMenos.actionManager = new ActionManager(this.scene);
    btnMenos.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.ajustarTemperatura(this.clima.temperatura - 5);
      })
    );
  }

  /**
   * Control 2: Palanca de Lluvia y Sequía
   */
  private construirPalancaLluvia(): void {
    const base = MeshBuilder.CreateBox("basePalancaLluvia", { width: 0.22, height: 0.08, depth: 0.32 }, this.scene);
    base.position.set(-0.35, 0.94, -0.15);
    base.parent = this.root;
    const baseMat = new StandardMaterial("matBaseLluvia", this.scene);
    baseMat.diffuseColor = Color3.FromHexString("#e0f2fe");
    base.material = baseMat;
    base.renderOutline = true;
    base.outlineWidth = 0.012;
    base.outlineColor = Color3.FromHexString("#25330f");

    // Manija de la palanca
    this.palancaLluviaMesh = MeshBuilder.CreateCylinder("palancaLluvia", {
      diameter: 0.035,
      height: 0.24,
      tessellation: 12
    }, this.scene);
    this.palancaLluviaMesh.position.set(-0.35, 1.05, -0.15);
    this.palancaLluviaMesh.rotation.x = 0; // -0.4 = Sequía, 0 = Temporal, 0.4 = Tormenta
    this.palancaLluviaMesh.parent = this.root;

    const palancaMat = new StandardMaterial("matPalancaLluvia", this.scene);
    palancaMat.diffuseColor = Color3.FromHexString("#0284c7");
    this.palancaLluviaMesh.material = palancaMat;
    this.palancaLluviaMesh.renderOutline = true;
    this.palancaLluviaMesh.outlineWidth = 0.01;
    this.palancaLluviaMesh.outlineColor = Color3.FromHexString("#25330f");

    // Clic en la palanca alterna entre Sequía -> Temporal -> Tormenta
    this.palancaLluviaMesh.actionManager = new ActionManager(this.scene);
    this.palancaLluviaMesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        if (this.clima.lluvia < 1) {
          // Cambiar a Temporal
          this.clima.lluvia = 4;
          this.clima.humedad = 65;
          this.clima.humedadSuelo = 32;
          this.palancaLluviaMesh.rotation.x = 0;
        } else if (this.clima.lluvia < 15) {
          // Cambiar a Tormenta
          this.clima.lluvia = 35;
          this.clima.humedad = 90;
          this.clima.viento = 18;
          this.palancaLluviaMesh.rotation.x = 0.45;
        } else {
          // Cambiar a Sequía
          this.clima.lluvia = 0;
          this.clima.humedad = 22;
          this.clima.humedadSuelo = 10;
          this.palancaLluviaMesh.rotation.x = -0.45;
        }
        this.actualizarOrbe();
        this.callbacks.onCambioClimaPreview(this.clima);
      })
    );
  }

  /**
   * Control 3: Fuelle / Veleta de Viento
   */
  private construirFuelleViento(): void {
    const base = MeshBuilder.CreateCylinder("baseVeleta", { diameter: 0.14, height: 0.18 }, this.scene);
    base.position.set(0.35, 1.0, -0.15);
    base.parent = this.root;
    const baseMat = new StandardMaterial("matBaseVeleta", this.scene);
    baseMat.diffuseColor = Color3.FromHexString("#ca8a04");
    base.material = baseMat;

    this.veletaAspas = MeshBuilder.CreateBox("aspasVeleta", { width: 0.28, height: 0.05, depth: 0.02 }, this.scene);
    this.veletaAspas.position.set(0.35, 1.12, -0.15);
    this.veletaAspas.parent = this.root;
    const aspasMat = new StandardMaterial("matAspas", this.scene);
    aspasMat.diffuseColor = Color3.FromHexString("#fef08a");
    this.veletaAspas.material = aspasMat;
    this.veletaAspas.renderOutline = true;
    this.veletaAspas.outlineWidth = 0.01;
    this.veletaAspas.outlineColor = Color3.FromHexString("#25330f");

    // Clic alterna velocidad de viento: Calma (1 m/s) -> Brisa (4 m/s) -> Ventarrón (16 m/s)
    this.veletaAspas.actionManager = new ActionManager(this.scene);
    this.veletaAspas.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        if (this.clima.viento < 3) {
          this.clima.viento = 5.5;
        } else if (this.clima.viento < 10) {
          this.clima.viento = 17.0;
        } else {
          this.clima.viento = 1.2;
        }
        this.actualizarOrbe();
        this.callbacks.onCambioClimaPreview(this.clima);
      })
    );
  }

  /**
   * Control 4: Muestras de Suelo en Cubetas (pH y tipo de tierra)
   */
  private construirCubetasTierra(): void {
    const tipos = [
      { nombre: "Tierra Volcánica (Óptima)", ph: 6.8, col: "#58361b", x: 0.65 },
      { nombre: "Suelo Ácido (Aluminio)", ph: 4.5, col: "#991b1b", x: 0.82 },
      { nombre: "Suelo Alcalino", ph: 8.4, col: "#a16207", x: 0.99 }
    ];

    for (let i = 0; i < tipos.length; i++) {
      const t = tipos[i];
      const cubeta = MeshBuilder.CreateCylinder(`cubeta_${i}`, {
        diameterTop: 0.12,
        diameterBottom: 0.09,
        height: 0.12,
        tessellation: 12
      }, this.scene);
      cubeta.position.set(t.x, 0.96, -0.15);
      cubeta.parent = this.root;

      const mat = new StandardMaterial(`matCubeta_${i}`, this.scene);
      mat.diffuseColor = Color3.FromHexString(t.col);
      cubeta.material = mat;
      cubeta.renderOutline = true;
      cubeta.outlineWidth = 0.01;
      cubeta.outlineColor = Color3.FromHexString("#25330f");

      cubeta.actionManager = new ActionManager(this.scene);
      cubeta.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.clima.phSuelo = t.ph;
          this.actualizarOrbe();
          this.callbacks.onCambioClimaPreview(this.clima);
        })
      );
      this.cubetasTierra.push(cubeta);
    }
  }

  /**
   * Orbe Holográfico 3D de Pronóstico y Dificultad
   */
  private construirOrbePronostico(): void {
    // Esfera luminosa
    const orbeMat = new StandardMaterial("matOrbe", this.scene);
    orbeMat.diffuseColor = Color3.FromHexString("#fef08a");
    orbeMat.emissiveColor = Color3.FromHexString("#eab308").scale(0.5);

    this.orbeMesh = MeshBuilder.CreateSphere("orbeHolograma", { diameter: 0.32, segments: 16 }, this.scene);
    this.orbeMesh.position.set(0, 1.25, 0.10);
    this.orbeMesh.material = orbeMat;
    this.orbeMesh.parent = this.root;
    this.orbeMesh.renderOutline = true;
    this.orbeMesh.outlineWidth = 0.015;
    this.orbeMesh.outlineColor = Color3.FromHexString("#ca8a04");

    // Letrero holográfico 3D con la dificultad y predicción
    const W = 320;
    const H = 160;
    this.orbeTex = new DynamicTexture("texOrbePronostico", { width: W, height: H }, this.scene, true);

    const boardMat = new StandardMaterial("matBoardOrbe", this.scene);
    boardMat.diffuseTexture = this.orbeTex;
    boardMat.emissiveColor = new Color3(0.6, 0.6, 0.6);

    const board = MeshBuilder.CreatePlane("boardPronostico", { width: 0.60, height: 0.30 }, this.scene);
    board.position.set(0, 1.55, 0.10);
    board.material = boardMat;
    board.parent = this.root;
    board.renderOutline = true;
    board.outlineWidth = 0.015;
    board.outlineColor = Color3.FromHexString("#25330f");

    this.actualizarOrbe();
  }

  public actualizarOrbe(): void {
    // Evaluar dificultad y reto según clima
    if (this.clima.lluvia > 25 || this.clima.viento > 14) {
      this.nivelDificultad = 3;
      this.nombreReto = "🌪️ Tormenta y Viento (¡Riesgo de Acame!)";
    } else if (this.clima.temperatura > 35 || this.clima.humedadSuelo < 15) {
      this.nivelDificultad = 2;
      this.nombreReto = "☀️ Canícula / Sequía (¡Riega con frecuencia!)";
    } else if (this.clima.temperatura < 6) {
      this.nivelDificultad = 3;
      this.nombreReto = "❄️ Helada de Montaña (Elige Maíz Azul)";
    } else if (this.clima.phSuelo < 5.2) {
      this.nivelDificultad = 2;
      this.nombreReto = "🧪 Suelo Ácido (Requiere Abono Fuerte)";
    } else {
      this.nivelDificultad = 1;
      this.nombreReto = "🌱 Temporal Óptimo (Crecimiento Amigable)";
    }

    const ctx = this.orbeTex.getContext() as any;
    const W = 320;
    const H = 160;

    ctx.fillStyle = "#fffdf0";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 18px 'Pixelify Sans', 'Trebuchet MS', sans-serif";
    ctx.fillText("🔮 Pronóstico del Valle", 14, 26);

    ctx.font = "bold 13px 'Pixelify Sans', 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#b45309";
    this.dibujarTextoAjustado(ctx, this.nombreReto, 14, 48, W - 28, 16);

    ctx.fillStyle = "#0284c7";
    ctx.font = "12px 'Pixelify Sans', 'Trebuchet MS', sans-serif";
    ctx.fillText(`🌡️ Temp: ${Math.round(this.clima.temperatura)}°C | 💧 Lluvia: ${Math.round(this.clima.lluvia)} mm/h`, 14, 88);
    ctx.fillText(`💨 Viento: ${Math.round(this.clima.viento)} m/s | 🌍 pH: ${this.clima.phSuelo.toFixed(1)}`, 14, 110);

    // Estrellas de dificultad
    const estrellas = "⭐".repeat(this.nivelDificultad);
    ctx.fillStyle = "#eab308";
    ctx.font = "bold 14px 'Pixelify Sans', 'Trebuchet MS', sans-serif";
    ctx.fillText(`Dificultad: ${estrellas}`, 14, 138);

    this.orbeTex.update();
  }

  private dibujarTextoAjustado(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxW: number,
    lineHeight: number
  ): number {
    const palabras = text.split(" ");
    let lineaActual = "";
    let curY = y;

    for (let i = 0; i < palabras.length; i++) {
      const prueba = lineaActual ? lineaActual + " " + palabras[i] : palabras[i];
      if (ctx.measureText(prueba).width > maxW && lineaActual) {
        ctx.fillText(lineaActual, x, curY);
        lineaActual = palabras[i];
        curY += lineHeight;
      } else {
        lineaActual = prueba;
      }
    }
    if (lineaActual) {
      ctx.fillText(lineaActual, x, curY);
    }
    return curY;
  }

  private ajustarTemperatura(nuevaTemp: number): void {
    this.clima.temperatura = Math.max(-2, Math.min(45, nuevaTemp));
    const factorMercurio = (this.clima.temperatura + 2) / 47.0;
    this.termometroCilindro.scaling.y = Math.max(0.2, factorMercurio * 1.5);
    this.actualizarOrbe();
    this.callbacks.onCambioClimaPreview(this.clima);
  }

  /**
   * Botón 3D Grande: "¡Ir al Campo a Sembrar!"
   */
  private construirBotonEntrarCampo(): void {
    const matBtn = new StandardMaterial("matBtnEntrarCampo", this.scene);
    matBtn.diffuseColor = Color3.FromHexString("#22c55e");
    matBtn.emissiveColor = Color3.FromHexString("#15803d").scale(0.4);

    this.btnIniciarCampo = MeshBuilder.CreateBox("btnIniciarCampo", {
      width: 0.95,
      height: 0.16,
      depth: 0.28
    }, this.scene);
    this.btnIniciarCampo.position.set(0, 0.98, -0.42);
    this.btnIniciarCampo.material = matBtn;
    this.btnIniciarCampo.parent = this.root;
    this.btnIniciarCampo.renderOutline = true;
    this.btnIniciarCampo.outlineWidth = 0.018;
    this.btnIniciarCampo.outlineColor = Color3.FromHexString("#25330f");

    // Rótulo sobre el botón
    const texBtn = new DynamicTexture("texBtnIniciar", { width: 256, height: 64 }, this.scene, true);
    const ctx = texBtn.getContext() as any;
    ctx.fillStyle = "#15803d";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Trebuchet MS, sans-serif";
    ctx.fillText("🌱 ¡IR AL CAMPO!", 42, 40);
    texBtn.update();

    const matPlaca = new StandardMaterial("matPlacaIniciar", this.scene);
    matPlaca.diffuseTexture = texBtn;
    matPlaca.emissiveColor = new Color3(0.5, 0.5, 0.5);

    const placa = MeshBuilder.CreatePlane("placaBtnIniciar", { width: 0.90, height: 0.24 }, this.scene);
    placa.position.set(0, 1.07, -0.42);
    placa.rotation.x = Math.PI / 2;
    placa.material = matPlaca;
    placa.parent = this.root;

    // Al hacer clic, lanza el callback para entrar al surco
    this.btnIniciarCampo.actionManager = new ActionManager(this.scene);
    this.btnIniciarCampo.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.callbacks.onIniciarCampo(this.clima);
      })
    );
    placa.actionManager = new ActionManager(this.scene);
    placa.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.callbacks.onIniciarCampo(this.clima);
      })
    );
  }

  /**
   * Permite accionar cualquiera de los controles 3D de la Mesa de Clima usando las manos o el puntero en 1ª persona
   */
  public interactuarConMalla(meshName: string): { exito: boolean; mensaje: string } {
    if (meshName === "btnTempMas") {
      this.ajustarTemperatura(this.clima.temperatura + 5);
      return {
        exito: true,
        mensaje: `🌡️ Temperatura aumentada a ${Math.round(this.clima.temperatura)}°C (${this.nombreReto})`
      };
    }
    if (meshName === "btnTempMenos") {
      this.ajustarTemperatura(this.clima.temperatura - 5);
      return {
        exito: true,
        mensaje: `❄️ Temperatura reducida a ${Math.round(this.clima.temperatura)}°C (${this.nombreReto})`
      };
    }
    if (meshName === "mercurio" || meshName === "baseTermometro") {
      const nueva = this.clima.temperatura >= 35 ? 18 : this.clima.temperatura + 6;
      this.ajustarTemperatura(nueva);
      return {
        exito: true,
        mensaje: `🌡️ Termómetro ajustado a ${Math.round(this.clima.temperatura)}°C (${this.nombreReto})`
      };
    }
    if (meshName === "palancaLluvia" || meshName === "basePalancaLluvia") {
      let estadoLluvia = "";
      if (this.clima.lluvia < 1) {
        this.clima.lluvia = 4;
        this.clima.humedad = 65;
        this.clima.humedadSuelo = 32;
        this.palancaLluviaMesh.rotation.x = 0;
        estadoLluvia = "🌧️ Lluvia de Temporal (4 mm/h)";
      } else if (this.clima.lluvia < 15) {
        this.clima.lluvia = 35;
        this.clima.humedad = 90;
        this.clima.viento = 18;
        this.palancaLluviaMesh.rotation.x = 0.45;
        estadoLluvia = "⛈️ Tormenta Intensa (35 mm/h)";
      } else {
        this.clima.lluvia = 0;
        this.clima.humedad = 22;
        this.clima.humedadSuelo = 10;
        this.palancaLluviaMesh.rotation.x = -0.45;
        estadoLluvia = "☀️ Sequía / Cielo Despejado (0 mm/h)";
      }
      this.actualizarOrbe();
      this.callbacks.onCambioClimaPreview(this.clima);
      return { exito: true, mensaje: `🎛️ Palanca de Lluvia: ${estadoLluvia}` };
    }
    if (meshName === "aspasVeleta" || meshName === "baseVeleta") {
      if (this.clima.viento < 3) {
        this.clima.viento = 5.5;
      } else if (this.clima.viento < 10) {
        this.clima.viento = 17.0;
      } else {
        this.clima.viento = 1.2;
      }
      this.actualizarOrbe();
      this.callbacks.onCambioClimaPreview(this.clima);
      return {
        exito: true,
        mensaje: `💨 Veleta de Viento ajustada a ${this.clima.viento.toFixed(1)} m/s (${this.nombreReto})`
      };
    }
    if (meshName.startsWith("cubeta_")) {
      const idx = parseInt(meshName.split("_")[1], 10);
      const defs = [
        { nombre: "Tierra Volcánica Óptima (pH 6.8)", ph: 6.8 },
        { nombre: "Suelo Ácido con Aluminio (pH 4.5)", ph: 4.5 },
        { nombre: "Suelo Alcalino Calcáreo (pH 8.4)", ph: 8.4 }
      ];
      const d = defs[idx] || defs[0];
      this.clima.phSuelo = d.ph;
      this.actualizarOrbe();
      this.callbacks.onCambioClimaPreview(this.clima);
      return { exito: true, mensaje: `🧪 Muestra de Suelo seleccionada: ${d.nombre}` };
    }
    if (meshName === "btnIniciarCampo" || meshName === "placaBtnIniciar") {
      this.callbacks.onIniciarCampo(this.clima);
      return { exito: true, mensaje: "🌱 ¡Entrando al surco de milpa con el clima configurado!" };
    }
    return {
      exito: true,
      mensaje: `🔮 Pronóstico del Valle: ${this.nombreReto} (${Math.round(this.clima.temperatura)}°C, Lluvia ${Math.round(this.clima.lluvia)} mm/h, pH ${this.clima.phSuelo.toFixed(1)})`
    };
  }

  public animar(tiempo: number): void {
    // Giro suave de las aspas de la veleta según el viento
    if (this.veletaAspas) {
      this.veletaAspas.rotation.y += this.clima.viento * 0.04;
    }
    // Levitar el orbe holográfico
    if (this.orbeMesh) {
      this.orbeMesh.position.y = 1.25 + Math.sin(tiempo * 2.5) * 0.03;
    }
  }

  public setVisible(v: boolean): void {
    this.visible = v;
    this.root.setEnabled(v);
  }
}
