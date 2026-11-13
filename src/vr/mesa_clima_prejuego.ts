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
  Texture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ShadowGenerator,
  Animation,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { ClimateState, ESCENARIOS } from "../clima";
import { registrarSolidoDesdeNodo } from "../colisiones";
import {
  configurarSamplingPixel,
  crearTexMaderaPixel,
  dibujarMarcoLetreroPixel,
} from "../ui/texturas_pixel_3d";

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
    this.construirRotulosIntuitivos();
    registrarSolidoDesdeNodo(this.root, "mesaClima", 0.02);
  }

  /** Cartel doble cara (se lee desde ambos lados de la mesa). */
  private crearRotulo(
    nombre: string,
    ancho: number,
    alto: number,
    pos: Vector3,
    fondo: string,
    borde: string,
    lineas: Array<{ txt: string; px: number; color: string }>,
    rotX = 0
  ): void {
    const W = 256;
    const H = Math.max(48, Math.round((W * alto) / ancho));
    const tex = new DynamicTexture(`tex_${nombre}`, { width: W, height: H }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    configurarSamplingPixel(tex);
    const ctx = tex.getContext() as any;
    dibujarMarcoLetreroPixel(ctx, W, H, fondo, borde);
    ctx.textAlign = "center";
    const total = lineas.reduce((a, l) => a + l.px * 1.2, 0);
    let y = (H - total) / 2 + lineas[0].px;
    for (const l of lineas) {
      ctx.fillStyle = l.color;
      ctx.font = `bold ${l.px}px 'Pixelify Sans', monospace`;
      ctx.fillText(l.txt, W / 2, y);
      y += l.px * 1.2;
    }
    tex.update();

    const mat = new StandardMaterial(`mat_${nombre}`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.55, 0.55, 0.55);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = true;

    for (const lado of [0, 1]) {
      const p = MeshBuilder.CreatePlane(`${nombre}_${lado}`, { width: ancho, height: alto }, this.scene);
      p.position.copyFrom(pos);
      p.position.z += lado === 0 ? -0.006 : 0.006;
      p.rotation.x = rotX;
      p.rotation.y = lado === 0 ? 0 : Math.PI;
      p.material = mat;
      p.parent = this.root;
      p.isPickable = false;
    }
  }

  /** Rótulos grandes encima de cada control para que su función sea evidente. */
  private construirRotulosIntuitivos(): void {
    // Panel trasero elevado con título general
    this.crearRotulo("rotuloTitulo", 1.5, 0.22, new Vector3(0, 1.92, 0.10), "#14532d", "#4ade80", [
      { txt: "🌦️ MESA DEL CLIMA", px: 30, color: "#fef08a" },
    ]);
    this.crearRotulo("rotuloAyuda", 1.5, 0.16, new Vector3(0, 1.74, 0.10), "#1e293b", "#94a3b8", [
      { txt: "1) Elige el clima  2) ¡Ve al campo!", px: 20, color: "#e2e8f0" },
    ]);

    // Etiquetas flotantes sobre cada control (sobre la mesa, legibles de frente y de espaldas)
    const alturaRot = 1.62;
    this.crearRotulo("rotuloTemp", 0.34, 0.14, new Vector3(-0.75, alturaRot, -0.15), "#7c2d12", "#fb923c", [
      { txt: "🌡️ CALOR", px: 24, color: "#ffedd5" },
    ]);
    this.crearRotulo("rotuloLluvia", 0.34, 0.14, new Vector3(-0.35, 1.30, -0.15), "#075985", "#38bdf8", [
      { txt: "🌧️ LLUVIA", px: 24, color: "#e0f2fe" },
    ]);
    this.crearRotulo("rotuloViento", 0.34, 0.14, new Vector3(0.35, 1.30, -0.15), "#115e59", "#5eead4", [
      { txt: "💨 VIENTO", px: 24, color: "#ccfbf1" },
    ]);
    this.crearRotulo("rotuloSuelo", 0.52, 0.14, new Vector3(0.82, 1.20, -0.15), "#713f12", "#facc15", [
      { txt: "🧪 SUELO (pH)", px: 22, color: "#fef9c3" },
    ]);

    // Símbolos + y − sobre los botones del termómetro
    this.crearRotulo("rotuloMas", 0.10, 0.10, new Vector3(-0.60, 1.40, -0.20), "#991b1b", "#fca5a5", [
      { txt: "+", px: 48, color: "#ffffff" },
    ]);
    this.crearRotulo("rotuloMenos", 0.10, 0.10, new Vector3(-0.60, 0.95, -0.20), "#075985", "#7dd3fc", [
      { txt: "−", px: 48, color: "#ffffff" },
    ]);

    // Indicaciones de la palanca (posiciones) y del viento
    this.crearRotulo("rotuloPalancaGuia", 0.46, 0.09, new Vector3(-0.35, 0.80, -0.30), "#0f172a", "#38bdf8", [
      { txt: "Clic: ☀️ → 🌦️ → ⛈️", px: 18, color: "#bae6fd" },
    ], 0);
    this.crearRotulo("rotuloVientoGuia", 0.46, 0.09, new Vector3(0.35, 0.80, -0.30), "#0f172a", "#5eead4", [
      { txt: "Clic: calma → brisa → fuerte", px: 15, color: "#99f6e4" },
    ]);
    this.crearRotulo("rotuloSueloGuia", 0.52, 0.09, new Vector3(0.82, 0.80, -0.30), "#0f172a", "#facc15", [
      { txt: "Elige 1 tierra: rojo=ácido", px: 15, color: "#fef08a" },
    ]);
  }

  private construirMesaMadera(shadowGen: ShadowGenerator | null): void {
    const woodMat = new StandardMaterial("matMesaClima", this.scene);
    woodMat.diffuseTexture = crearTexMaderaPixel(this.scene, false, 3, 2);
    woodMat.diffuseColor = Color3.FromHexString("#dfb88b");
    woodMat.emissiveColor = Color3.FromHexString("#3f1d08").scale(0.30);

    // Tablón superior pixel-art
    this.mesaMesh = MeshBuilder.CreateBox("tablonMesa", {
      width: 2.20,
      height: 0.12,
      depth: 1.10
    }, this.scene);
    this.mesaMesh.position.set(0, 0.85, 0);
    this.mesaMesh.material = woodMat;
    this.mesaMesh.parent = this.root;

    // 4 Patas cuadradas tipo voxel
    const posPatas = [
      [-0.95, -0.45],
      [0.95, -0.45],
      [-0.95, 0.45],
      [0.95, 0.45]
    ];
    for (let i = 0; i < posPatas.length; i++) {
      const [x, z] = posPatas[i];
      const pata = MeshBuilder.CreateBox(`pataMesa_${i}`, {
        width: 0.10,
        height: 0.85,
        depth: 0.10
      }, this.scene);
      pata.position.set(x, 0.425, z);
      pata.material = woodMat;
      pata.parent = this.root;
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
    // Cristal voxel luminoso
    const orbeMat = new StandardMaterial("matOrbe", this.scene);
    orbeMat.diffuseColor = Color3.FromHexString("#fef08a");
    orbeMat.emissiveColor = Color3.FromHexString("#eab308").scale(0.55);

    this.orbeMesh = MeshBuilder.CreateBox("orbeHolograma", { size: 0.28 }, this.scene);
    this.orbeMesh.position.set(0, 1.25, 0.10);
    this.orbeMesh.rotation.y = Math.PI / 4;
    this.orbeMesh.material = orbeMat;
    this.orbeMesh.parent = this.root;

    // Letrero holográfico 3D pixel-art con la dificultad y predicción
    const W = 320;
    const H = 160;
    this.orbeTex = new DynamicTexture("texOrbePronostico", { width: W, height: H }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    configurarSamplingPixel(this.orbeTex);

    const boardMat = new StandardMaterial("matBoardOrbe", this.scene);
    boardMat.diffuseTexture = this.orbeTex;
    boardMat.emissiveColor = new Color3(0.6, 0.6, 0.6);

    const board = MeshBuilder.CreatePlane("boardPronostico", { width: 0.60, height: 0.30 }, this.scene);
    board.position.set(0, 1.55, 0.10);
    board.material = boardMat;
    board.parent = this.root;

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

    dibujarMarcoLetreroPixel(ctx, W, H, "#fffdf0", "#451a03", "#d97706", 4);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 18px 'Pixelify Sans', monospace";
    ctx.fillText("🔮 Pronóstico del Valle", 14, 26);

    ctx.font = "bold 13px 'Pixelify Sans', monospace";
    ctx.fillStyle = "#b45309";
    this.dibujarTextoAjustado(ctx, this.nombreReto, 14, 48, W - 28, 16);

    ctx.fillStyle = "#0284c7";
    ctx.font = "12px 'Pixelify Sans', monospace";
    ctx.fillText(`🌡️ Temp: ${Math.round(this.clima.temperatura)}°C | 💧 Lluvia: ${Math.round(this.clima.lluvia)} mm/h`, 14, 88);
    ctx.fillText(`💨 Viento: ${Math.round(this.clima.viento)} m/s | 🌍 pH: ${this.clima.phSuelo.toFixed(1)}`, 14, 110);

    // Estrellas de dificultad
    const estrellas = "⭐".repeat(this.nivelDificultad);
    ctx.fillStyle = "#eab308";
    ctx.font = "bold 14px 'Pixelify Sans', monospace";
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

    // Rótulo pixel-art sobre el botón
    const texBtn = new DynamicTexture("texBtnIniciar", { width: 256, height: 64 }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    configurarSamplingPixel(texBtn);
    const ctx = texBtn.getContext() as any;
    dibujarMarcoLetreroPixel(ctx, 256, 64, "#15803d", "#052e16", "#4ade80", 3);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'Pixelify Sans', monospace";
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
