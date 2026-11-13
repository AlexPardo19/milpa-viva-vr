/**
 * Generador procedural del Maíz Estilizado (Cel-Shaded / Caricatura) con Babylon.js
 *
 * Reproduce exactamente la estética visual de la imagen de referencia:
 * - Caña segmentada con nudos toroidales y raíces de anclaje (brace roots).
 * - Hojas acintadas en cinta (Ribbon) con nervadura central prominente y contornos de tinta (#25330f).
 * - Mazorcas (elotes) con textura procedural de granos dorados (DynamicTexture), totomoxtle envolvente y estigmas.
 * - Espiga apical (panícula) con raquis ramificado y anteras productoras de polen.
 * - Animación biomecánica continua (oscilación de tallo, aleteo foliar desfasado y espiga con viento).
 * - Respuestas fenológicas y de estrés: brote inicial VE, porte adulto V8, floración VT,
 *   llenado de grano R3, senescencia R6, acartuchamiento por sequía, escarcha por helada y acame por tormenta.
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
  AbstractMesh
} from "@babylonjs/core";
import { EstadoCrecimiento } from "./crecimiento";
import { ClimateState, Metricas } from "./clima";
import { TipoSemilla, VARIEDADES_MAIZ, Causa } from "./nucleo";

export interface LeafItem {
  node: TransformNode;
  mesh: Mesh;
  ribMesh: Mesh;
  ph: number;
  amp: number;
  baseAz: number;
  esSeca?: boolean;
}

export class MaizEstilizado {
  readonly scene: Scene;
  readonly shadowGen: ShadowGenerator | null;
  readonly root: TransformNode;
  readonly idPrefix: string;
  public variedad: TipoSemilla;

  // Componentes principales
  public readonly plantNode: TransformNode;
  private leaves: LeafItem[] = [];
  public ears: TransformNode[] = [];
  private leafCollars: Mesh[] = [];
  private tasselNode: TransformNode | null = null;
  private tasselAnthers: AbstractMesh[] = [];
  public braceRoots: Mesh[] = [];
  private stalkMesh: Mesh | null = null;
  private nodeMeshes: Mesh[] = [];

  // Materiales estilizados reutilizables
  private stalkMat!: StandardMaterial;
  private nodeMat!: StandardMaterial;
  private ribMat!: StandardMaterial;
  private huskMat!: StandardMaterial;
  private tasselMat!: StandardMaterial;
  private braceRootMat!: StandardMaterial;
  private greenMats: StandardMaterial[] = [];
  private dryLeafMats: StandardMaterial[] = [];
  private frostMat!: StandardMaterial;
  private rotMat!: StandardMaterial;
  private cobMat!: StandardMaterial;
  private kernelTex!: DynamicTexture;
  private silkMatsFresco: StandardMaterial[] = [];
  private silkMatsSeco: StandardMaterial[] = [];
  private antherMatFresco!: StandardMaterial;
  private antherMatSeco!: StandardMaterial;

  // Estado dinámico
  private lastHeight = -1;
  private lastStage = "";
  private lastDia = -1;
  private lastEstrésHidrico = -1;
  private lastSecado = -1;
  private lastMuerta = false;
  private lastCausaMuerte = "";
  private lastCuajado = 1.0;
  private contornoCerca = true;

  constructor(
    scene: Scene,
    shadowGen: ShadowGenerator | null = null,
    idPrefix = "maiz",
    variedad: TipoSemilla = "chalqueno"
  ) {
    this.scene = scene;
    this.shadowGen = shadowGen;
    this.idPrefix = idPrefix;
    this.variedad = variedad;
    this.root = new TransformNode(`${idPrefix}_root`, scene);
    this.plantNode = new TransformNode(`${idPrefix}_plantNode`, scene);
    this.plantNode.parent = this.root;

    this.crearMateriales();
    this.construir(6.6, 8, true, true, 1.0, 3);
  }

  // Helper para crear materiales botánicos realistas con iluminación suave y especular orgánico
  private mat(hex: string, em = 0.20, spec = 0.06): StandardMaterial {
    const m = new StandardMaterial(`m_${hex}_${Math.random().toString(36).substring(2, 6)}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(spec, spec, spec * 0.8);
    m.specularPower = 32;
    m.backFaceCulling = false;
    return m;
  }

  // Helper para aplicar contorno sutil de definición (optimizado con LOD H10)
  private ink(mesh: AbstractMesh, width = 0.007, colorHex = "#1e2910"): AbstractMesh {
    mesh.renderOutline = this.contornoCerca;
    mesh.outlineWidth = Math.min(0.009, width);
    mesh.outlineColor = Color3.FromHexString(colorHex);
    return mesh;
  }

  /**
   * Activa/desactiva contornos según distancia de cámara (LOD de contorno §6.2 / H10)
   */
  public actualizarContornoDistancia(cerca: boolean): void {
    if (this.contornoCerca === cerca) return;
    this.contornoCerca = cerca;
    if (this.stalkMesh) this.stalkMesh.renderOutline = cerca;
    this.leaves.forEach((l) => {
      l.mesh.renderOutline = cerca;
    });
  }

  private cast(mesh: Mesh): Mesh {
    if (this.shadowGen) {
      this.shadowGen.addShadowCaster(mesh);
    }
    return mesh;
  }

  // Genera la textura procedural con degradados radiales realistas para las 16 hileras de granos y máscara de cuajado (M5)
  private generarTexturaGranos(colorHex: string, cuajado = 1.0): DynamicTexture {
    if (this.kernelTex) {
      this.kernelTex.dispose();
    }
    const W = 256;
    const Ht = 512;
    const tex = new DynamicTexture(`${this.idPrefix}_texGranos_${colorHex}`, { width: W, height: Ht }, this.scene, true);
    const ctx = tex.getContext() as any;

    const cBase = Color3.FromHexString(colorHex);
    ctx.fillStyle = cBase.scale(0.55).toHexString();
    ctx.fillRect(0, 0, W, Ht);

    const cols = 16;
    const rows = 22;
    const cw = W / cols;
    const rh = Ht / rows;

    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        // Semilla pseudoaleatoria determinista por posición de grano para reflejar el cuajado (M5)
        const hash = Math.sin((r * 19 + i * 37 + 7) * 12.9898) * 43758.5453;
        const rnd = hash - Math.floor(hash);
        // Mayor probabilidad de aborto en la punta apical (r < 5)
        const umbralLocal = r < 5 ? cuajado * 0.85 : cuajado;
        const granoCuajado = rnd <= umbralLocal;

        const x = i * cw + cw / 2;
        const y = r * rh + rh / 2;

        if (!granoCuajado) {
          // Óvulo no polinizado (hueco pálido de olote)
          ctx.fillStyle = "#c9ba8e";
          ctx.beginPath();
          ctx.ellipse(x, y, cw * 0.30, rh * 0.30, 0, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        const grad = ctx.createRadialGradient(x - cw * 0.12, y - rh * 0.15, 1, x, y, cw * 0.6);
        const hexLower = colorHex.toLowerCase();

        if (hexLower === "#fff09a") {
          // Fase R1-R2 (ampolla lechosa tierna)
          grad.addColorStop(0, "#fef9c3");
          grad.addColorStop(0.55, "#fde047");
          grad.addColorStop(1, "#ca8a04");
        } else if (hexLower.includes("38250b") || hexLower.includes("422c0c")) {
          // Mazorca necrótica post-mortem
          grad.addColorStop(0, "#5a3d1c");
          grad.addColorStop(0.55, "#3d250d");
          grad.addColorStop(1, "#201205");
        } else if (hexLower.includes("991b1b") || hexLower.includes("b91c1c") || hexLower.includes("7f1d1d")) {
          // Maíz Rojo «Sangre de Cristo» (Carmesí-granate profundo, SIN blanco para evitar tono rosa)
          grad.addColorStop(0, "#dc2626");
          grad.addColorStop(0.55, "#991b1b");
          grad.addColorStop(1, "#450a0a");
        } else if (hexLower.includes("312e81") || hexLower.includes("4338ca") || hexLower.includes("1e1b4b")) {
          // Maíz Azul Cónico (Índigo-pizarra profundo rico en antocianinas)
          grad.addColorStop(0, "#4f46e5");
          grad.addColorStop(0.55, "#312e81");
          grad.addColorStop(1, "#1e1b4b");
        } else if (hexLower.includes("d97706") || hexLower.includes("f97316") || hexLower.includes("b45309")) {
          // Maíz Palomero Toluqueño (Ámbar-naranja cristalino)
          grad.addColorStop(0, "#fbbf24");
          grad.addColorStop(0.55, "#d97706");
          grad.addColorStop(1, "#78350f");
        } else {
          // Maíz Chalqueño / Grano dentado dorado
          grad.addColorStop(0, "#fef08a");
          grad.addColorStop(0.55, "#eab308");
          grad.addColorStop(1, "#854d0e");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y, cw * 0.46, rh * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    tex.update();
    this.kernelTex = tex;
    return tex;
  }

  private crearMateriales(): void {
    const varCfg = VARIEDADES_MAIZ[this.variedad || "chalqueno"];
    this.stalkMat = this.mat("#5c992c", 0.18);
    this.nodeMat = this.mat("#386b1a", 0.18);
    this.ribMat = this.mat("#85b847", 0.18);
    this.huskMat = this.mat(varCfg.colorBracteasHex, 0.18);
    this.tasselMat = this.mat("#a8b058", 0.18);
    this.braceRootMat = this.mat("#9e8244", 0.18);
    this.greenMats = ["#488e24", "#3d7a1e", "#5ca32e"].map((hex) => this.mat(hex, 0.18));
    this.dryLeafMats = ["#b5923e", "#9e7b2f", "#826220"].map((hex) => this.mat(hex, 0.18));
    this.frostMat = this.mat("#2f434a", 0.18);
    this.rotMat = this.mat("#24180d", 0.16);
    this.silkMatsFresco = ["#c8873a", "#d9b359", "#8c5222", "#e6be65"].map((hex) => this.mat(hex, 0.20));
    this.silkMatsSeco = ["#5c3412", "#3d220a", "#78471c", "#4a2a0e"].map((hex) => this.mat(hex, 0.18));
    this.antherMatFresco = this.mat("#d9be45", 0.22);
    this.antherMatSeco = this.mat("#9e843c", 0.18);

    this.cobMat = new StandardMaterial(`${this.idPrefix}_cobMat`, this.scene);
    this.kernelTex = this.generarTexturaGranos(varCfg.colorHex);
    this.cobMat.diffuseTexture = this.kernelTex;
    const cGrano = Color3.FromHexString(varCfg.colorHex);
    this.cobMat.emissiveColor = cGrano.scale(0.18);
    this.cobMat.specularColor = new Color3(0.08, 0.08, 0.06);
  }

  /**
   * Construye o reconstruye la planta paramétricamente según el estado ontogenético,
   * límite biológico de altura, secado progresivo (senescencia) y causa de muerte climática.
   */
  public construir(
    altura = 6.6,
    numHojas = 8,
    mostrarEspiga = true,
    mostrarElotes = true,
    eloteTamano = 1.0,
    peelCount = 3,
    hojasMarchitas = 0.0,
    granoHex = "#ffd21f",
    estigmaHex = "#c8873a",
    espigaAbierta = true,
    cuajado = 1.0,
    secado = 0.0,
    causaMuerte?: Causa
  ): void {
    // 1. Limpiar geometría anterior de forma recursiva para evitar cualquier nodo o malla huérfana flotante
    if (this.stalkMesh) {
      this.stalkMesh.dispose();
      this.stalkMesh = null;
    }
    this.nodeMeshes.forEach((n) => n.dispose());
    this.nodeMeshes = [];
    this.braceRoots.forEach((r) => r.dispose());
    this.braceRoots = [];
    this.leaves.forEach((l) => l.node.dispose());
    this.leaves = [];
    this.leafCollars.forEach((c) => c.dispose());
    this.leafCollars = [];
    this.ears.forEach((e) => e.dispose());
    this.ears = [];
    if (this.tasselNode) {
      this.tasselNode.dispose();
      this.tasselNode = null;
    }
    this.tasselAnthers = [];
    // Limpiar cualquier hijo remanente de plantNode (ej. leafAzNode az_k)
    this.plantNode.getChildren().slice().forEach((child) => child.dispose(false));

    const H = Math.max(0.6, altura);
    const plant = this.plantNode;
    const esMuerteSequiaCalor = causaMuerte === "sequia" || causaMuerte === "calor";
    const esMuerteHelada = causaMuerte === "helada";
    const esMuerteEnch = causaMuerte === "encharcamiento" || causaMuerte === "pudricion_semilla";
    const esMuerteAgotamiento = causaMuerte === "agotamiento";

    // Rasgos morfológicos específicos por raza/especie de maíz
    const factorGrosorVar =
      this.variedad === "chalqueno"
        ? 1.14
        : this.variedad === "azul"
        ? 1.02
        : this.variedad === "rojo"
        ? 0.94
        : 0.86; // palomero toluqueño: caña más esbelta
    const factorAnchoHojaVar =
      this.variedad === "chalqueno"
        ? 1.15
        : this.variedad === "azul"
        ? 1.0
        : this.variedad === "rojo"
        ? 0.86
        : 0.78;
    const droopBaseVar =
      this.variedad === "chalqueno"
        ? 0.88
        : this.variedad === "azul"
        ? 0.72
        : this.variedad === "rojo"
        ? 0.76
        : 0.62; // hojas más erectas en razas de altiplano frío

    // Curvatura del tallo (con deformación específica si murió por helada, sequía o senescencia)
    const P = (t: number) => {
      let x = 0.20 * Math.sin(t * 2.6);
      let y = t * H;
      let z = 0.09 * Math.sin(t * 3.4 + 1);

      if (esMuerteHelada && t > 0.60) {
        // Colapso apical por congelamiento de tejidos tiernos
        const f = (t - 0.60) / 0.40;
        x += 0.42 * f * f;
        y -= 0.32 * f * f * (H / 6.6);
      } else if (esMuerteSequiaCalor) {
        // Arqueamiento por deshidratación severa de caña
        x += 0.28 * t * t;
        y *= 0.96;
      } else if (secado > 0.5 || esMuerteAgotamiento) {
        // Ligera inclinación de rastrojo seco (zacate en pie)
        x += 0.16 * secado * t * t;
      }
      return new Vector3(x, y, z);
    };

    // Orientación tangente local del tallo en la altura normalizada t
    const orientacionTallo = (t: number) => {
      const pA = P(Math.max(0, t - 0.025));
      const pB = P(Math.min(1, t + 0.025));
      const d = pB.subtract(pA);
      const dy = Math.max(0.01, d.y);
      return {
        rotZ: -Math.atan2(d.x, dy),
        rotX: Math.atan2(d.z, dy)
      };
    };

    const factorAdelgazamiento = esMuerteSequiaCalor ? 0.75 : secado > 0.5 ? 1.0 - 0.15 * secado : 1.0;
    const rad = (t: number) =>
      0.2 * (1 - 0.45 * t) * Math.min(1.0, H / 5.5) * factorAdelgazamiento * factorGrosorVar;

    // --- A. CAÑA PRINCIPAL (TALLO) ---
    const stalkSteps = 25;
    const stalkPath: Vector3[] = [];
    for (let i = 0; i < stalkSteps; i++) {
      stalkPath.push(P(i / (stalkSteps - 1)));
    }
    const stalk = MeshBuilder.CreateTube(
      "stalk",
      {
        path: stalkPath,
        radiusFunction: (i) => Math.max(0.035, rad(i / (stalkSteps - 1))),
        tessellation: 18,
        cap: Mesh.CAP_ALL
      },
      this.scene
    );
    stalk.material = this.stalkMat;
    stalk.parent = plant;
    this.ink(stalk, 0.025);
    this.cast(stalk);
    this.stalkMesh = stalk;

    // --- B. ANILLOS DE NUDOS (ENTRENUDOS ALINEADOS CON LA TANGENTE DEL TALLO) ---
    const numNodes = Math.min(8, Math.max(1, Math.round(H * 1.25)));
    for (let k = 1; k <= numNodes; k++) {
      const t = k / (numNodes + 1.2);
      const n = MeshBuilder.CreateTorus(
        `node_${k}`,
        {
          diameter: 2 * rad(t) + 0.02,
          thickness: 0.07 * (H / 6.6),
          tessellation: 20
        },
        this.scene
      );
      n.position = P(t);
      const ori = orientacionTallo(t);
      n.rotation.z = ori.rotZ;
      n.rotation.x = ori.rotX;
      // Si murió por encharcamiento, los nudos basales se ven ennegrecidos/podridos
      n.material = esMuerteEnch && k <= 3 ? this.rotMat : this.nodeMat;
      n.parent = plant;
      this.nodeMeshes.push(n);
    }

    // --- C. RAÍCES DE ANCLAJE DE DOBLE NIVEL (BRACE ROOTS ANCLADAS AL MONTÍCULO) ---
    // Se emparentan a `this.root` (no a `this.plantNode`) para que permanezcan enterradas en la tierra
    // incluso cuando el tallo sufre acame o se inclina al morir, evitando raíces flotantes en el aire.
    const umbralBrace1 = this.variedad === "palomero" ? 2.0 : 2.6;
    const umbralBrace2 = this.variedad === "palomero" ? 3.4 : 4.8;
    if (H >= umbralBrace1) {
      const matRaiz = esMuerteEnch ? this.rotMat : this.braceRootMat;
      const numTier1 = H >= 4.2 || this.variedad === "palomero" ? 6 : 4;
      const pBase1 = P(0.05);
      for (let i = 0; i < numTier1; i++) {
        const a = i * ((Math.PI * 2) / numTier1) + 0.25;
        const pts = [
          new Vector3(pBase1.x + Math.cos(a) * 0.16, 0.36 * (H / 6.6), pBase1.z + Math.sin(a) * 0.16),
          new Vector3(Math.cos(a) * 0.38, 0.18 * (H / 6.6), Math.sin(a) * 0.38),
          new Vector3(Math.cos(a) * 0.62, -0.10, Math.sin(a) * 0.62)
        ];
        const r = MeshBuilder.CreateTube(
          `brace_t1_${i}`,
          { path: pts, radius: 0.044 * factorAdelgazamiento * factorGrosorVar, tessellation: 7 },
          this.scene
        );
        r.material = matRaiz;
        r.parent = this.root;
        this.braceRoots.push(r);
      }

      if (H >= umbralBrace2) {
        const numTier2 = 8;
        const pBase2 = P(0.09);
        for (let i = 0; i < numTier2; i++) {
          const a = i * ((Math.PI * 2) / numTier2) + 0.25 + (Math.PI / 8);
          const pts = [
            new Vector3(pBase2.x + Math.cos(a) * 0.18, 0.58 * (H / 6.6), pBase2.z + Math.sin(a) * 0.18),
            new Vector3(Math.cos(a) * 0.46, 0.28 * (H / 6.6), Math.sin(a) * 0.46),
            new Vector3(Math.cos(a) * 0.74, -0.10, Math.sin(a) * 0.74)
          ];
          const r = MeshBuilder.CreateTube(
            `brace_t2_${i}`,
            { path: pts, radius: 0.036 * factorAdelgazamiento * factorGrosorVar, tessellation: 7 },
            this.scene
          );
          r.material = matRaiz;
          r.parent = this.root;
          this.braceRoots.push(r);
        }
      }
    }

    // --- D. HOJAS ACINTADAS EN CINTA (RIBBON) CON SECADO PROGRESIVO DE BASE A ÁPICE ---
    const leafCount = Math.max(2, numHojas);
    // El secado fisiológico o por sequía avanza desde las hojas inferiores (k=0) hacia las superiores
    const numHojasSecas = causaMuerte
      ? leafCount
      : Math.min(leafCount, Math.floor(leafCount * Math.pow(secado, 0.82) * 1.15));

    for (let k = 0; k < leafCount; k++) {
      const t = 0.07 + k * (0.85 / Math.max(1, leafCount));
      const az = k * Math.PI + Math.sin(k * 1.7) * 0.5;
      const factorLargoVar = this.variedad === "chalqueno" ? 1.08 : this.variedad === "palomero" ? 0.86 : 0.98;
      const L = (3.1 - k * 0.14) * (H / 6.6) * factorLargoVar;
      const esHojaSeca = k < numHojasSecas;

      // Caída foliar (droop) y ancho (w) según raza, estado hídrico, senescencia o causa de muerte
      let droop = droopBaseVar - k * 0.065;
      let w = 0.4 * (H / 6.6) * factorAnchoHojaVar;
      let curlFactor = hojasMarchitas;

      if (esMuerteHelada) {
        // Hojas quemadas por helada: flácidas y colgadas abruptamente
        droop = 1.72;
        w = 0.25 * (H / 6.6) * factorAnchoHojaVar;
        curlFactor = 0.55;
      } else if (esMuerteSequiaCalor) {
        // Hojas achicharradas por sequía/calor: muy enrolladas y caídas
        droop = 1.62;
        w = 0.18 * (H / 6.6) * factorAnchoHojaVar;
        curlFactor = 1.0;
      } else if (esHojaSeca) {
        // Hoja inferior o de planta en secado/senescencia: doblada hacia abajo como zacate seco
        droop = 1.32 + 0.28 * secado;
        w = 0.26 * (H / 6.6) * factorAnchoHojaVar;
        curlFactor = Math.max(hojasMarchitas, 0.45 + 0.45 * secado);
      } else if (hojasMarchitas > 0.05 || secado > 0.1) {
        droop = droopBaseVar + 0.65 * Math.max(hojasMarchitas, secado * 0.7);
        w = (0.4 - 0.16 * Math.max(hojasMarchitas, secado * 0.6)) * (H / 6.6) * factorAnchoHojaVar;
      }

      const leafAzNode = new TransformNode(`az_${k}`, this.scene);
      leafAzNode.parent = plant;
      leafAzNode.position = P(t);
      const oriHoja = orientacionTallo(t);
      leafAzNode.rotation.z = oriHoja.rotZ;
      leafAzNode.rotation.x = oriHoja.rotX;
      leafAzNode.rotation.y = -az;

      const matHoja = esMuerteHelada
        ? this.frostMat
        : esMuerteEnch && k < 2
        ? this.rotMat
        : esHojaSeca
        ? this.dryLeafMats[k % this.dryLeafMats.length]
        : this.greenMats[k % this.greenMats.length];

      // Vaina / collar foliar envolvente alineada con la tangente local del tallo
      const collar = MeshBuilder.CreateCylinder(
        `leafCollar_${k}`,
        {
          height: 0.14 * (H / 6.6),
          diameter: 2 * rad(t) + 0.024,
          tessellation: 16
        },
        this.scene
      );
      collar.position = P(t);
      collar.rotation.z = oriHoja.rotZ;
      collar.rotation.x = oriHoja.rotX;
      collar.material = matHoja;
      collar.parent = plant;
      this.leafCollars.push(collar);

      const swayNode = new TransformNode(`sway_${k}`, this.scene);
      swayNode.parent = leafAzNode;

      const Lf: Vector3[] = [];
      const M: Vector3[] = [];
      const R: Vector3[] = [];
      const ph = Math.random() * 6.28;
      const r0 = rad(t);
      const crinkleAmp = esHojaSeca || esMuerteSequiaCalor ? 0.075 : 0.045;

      for (let sIdx = 0; sIdx <= 16; sIdx++) {
        const s = sIdx / 16;
        const out = r0 + L * (esHojaSeca ? 0.76 : 0.9) * Math.pow(s, 0.9);
        const up = L * (0.5 * s - droop * s * s);
        const ww = w * Math.sin(Math.PI * Math.pow(s, 0.6));
        const rip = crinkleAmp * Math.sin(s * (esHojaSeca ? 22 : 16) + ph) * s;
        // Acartuchamiento por estrés hídrico o secado
        const curl = curlFactor * 0.36 * Math.sin(s * Math.PI);

        Lf.push(new Vector3(out, up - 0.4 * ww + rip + curl, ww));
        M.push(new Vector3(out, up, 0));
        R.push(new Vector3(out, up - 0.4 * ww - rip + curl, -ww));
      }

      const leafMesh = MeshBuilder.CreateRibbon(
        `leafMesh_${k}`,
        { pathArray: [Lf, M, R], sideOrientation: Mesh.DOUBLESIDE },
        this.scene
      );
      leafMesh.material = matHoja;
      leafMesh.parent = swayNode;
      this.ink(leafMesh, 0.012);
      this.cast(leafMesh);

      // Nervadura central (tubo elevado)
      const rib = MeshBuilder.CreateTube(
        `rib_${k}`,
        {
          path: M.map((p) => p.add(new Vector3(0, 0.012, 0))),
          radius: 0.016,
          tessellation: 5
        },
        this.scene
      );
      rib.material = esHojaSeca ? this.dryLeafMats[0] : this.ribMat;
      rib.parent = swayNode;

      this.leaves.push({
        node: swayNode,
        mesh: leafMesh,
        ribMesh: rib,
        ph,
        amp: (0.05 + 0.02 * (L / 3)) * (esHojaSeca ? 0.55 : 1.0),
        baseAz: az,
        esSeca: esHojaSeca
      });
    }

    // --- E. ELOTES / MAZORCAS CON TOTOMOXTO Y ESTIGMAS ---
    if (mostrarElotes && H >= 3.4) {
      this.cobMat.diffuseTexture = this.generarTexturaGranos(granoHex, cuajado);

      const makeEar = (
        tEar: number,
        az: number,
        tilt: number,
        pCount: number,
        _silkCol: string,
        scale: number
      ) => {
        const earNode = new TransformNode("earNode", this.scene);
        earNode.parent = plant;
        earNode.position = P(tEar);
        const oriEar = orientacionTallo(tEar);
        earNode.rotation.z = oriEar.rotZ;
        earNode.rotation.x = oriEar.rotX;
        earNode.rotation.y = -az;

        const tl = new TransformNode("earTilt", this.scene);
        tl.parent = earNode;
        tl.position.x = rad(tEar) + 0.02;
        // En secado avanzado o muerte, la mazorca se dobla hacia abajo ("dobla del maíz")
        const tiltSeco = tilt + Math.max(0, secado - 0.45) * 0.75 + (causaMuerte ? 0.35 : 0);
        tl.rotation.z = -tiltSeco;
        tl.scaling.setAll(scale);

        // Morfología de la mazorca según la raza de maíz
        const E =
          this.variedad === "chalqueno"
            ? 1.62
            : this.variedad === "azul"
            ? 1.48
            : this.variedad === "rojo"
            ? 1.38
            : 1.18; // palomero toluqueño: mazorca pequeña cónica
        const anchoMazorca =
          this.variedad === "chalqueno"
            ? 0.54
            : this.variedad === "azul"
            ? 0.48
            : this.variedad === "rojo"
            ? 0.47
            : 0.38;

        const cob = MeshBuilder.CreateSphere("cob", { diameter: 1, segments: 24 }, this.scene);
        cob.scaling.set(anchoMazorca, E, anchoMazorca);
        cob.position.y = E / 2 + 0.05;
        cob.material = this.cobMat;
        cob.parent = tl;
        this.ink(cob, 0.02, "#6b4a00");
        this.cast(cob);

        const shank = MeshBuilder.CreateCylinder("shank", { diameter: 0.22, height: 0.25, tessellation: 10 }, this.scene);
        shank.position.y = 0.1;
        shank.material = this.huskMat;
        shank.parent = tl;

        const N = 6;
        for (let i = 0; i < N; i++) {
          const phi = (i * 2 * Math.PI) / N + 0.3;
          const pe = i < pCount;
          const Lf: Vector3[] = [];
          const M: Vector3[] = [];
          const R: Vector3[] = [];

          for (let k = 0; k <= 14; k++) {
            const s = k / 14;
            let y = 0.04 + s * E * 0.95;
            let rho = Math.max(
              0.11,
              (anchoMazorca * 0.5) * Math.sqrt(Math.max(0, 1 - Math.pow((y - E * 0.53) / (E * 0.5), 2))) + 0.042
            );
            const f = pe ? Math.max(0, (s - 0.3) / 0.7) : Math.max(0, (s - 0.8) / 0.2);
            rho += (pe ? 0.92 : 0.28) * Math.pow(f, 1.6);
            y -= (pe ? 0.55 : 0.05) * f * f;
            const al = (Math.PI / N) * 1.35 * (1 - 0.9 * Math.pow(s, 2.2));

            const pt = (a: number, rr: number) => new Vector3(rr * Math.cos(a), y, rr * Math.sin(a));
            Lf.push(pt(phi - al, rho));
            M.push(pt(phi, rho + 0.03));
            R.push(pt(phi + al, rho));
          }

          const h = MeshBuilder.CreateRibbon(`husk_${i}`, { pathArray: [Lf, M, R], sideOrientation: Mesh.DOUBLESIDE }, this.scene);
          h.material = this.huskMat;
          h.parent = tl;
          this.ink(h, 0.014, "#25330f");
          this.cast(h);
        }

        // Estigmas ("pelos de elote") cayendo con gravedad natural hacia abajo
        const silkMats = secado > 0.6 || causaMuerte ? this.silkMatsSeco : this.silkMatsFresco;
        for (let i = 0; i < 24; i++) {
          const a = i * 2.399;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const y0 = E * 0.96;
          const rSpill = 0.06 + 0.16 * ((i % 5) / 4);
          const droopY = 0.32 + 0.14 * Math.sin(i * 1.3);
          const pts = [
            new Vector3(0, y0, 0),
            new Vector3(0.05 * c, y0 + 0.05, 0.05 * s),
            new Vector3(rSpill * 0.85 * c, y0 - droopY * 0.45, rSpill * 0.85 * s),
            new Vector3(rSpill * 1.15 * c, y0 - droopY, rSpill * 1.15 * s)
          ];
          const sk = MeshBuilder.CreateTube(`silk_${i}`, { path: pts, radius: 0.008, tessellation: 4 }, this.scene);
          sk.material = silkMats[i % silkMats.length];
          sk.parent = tl;
        }

        this.ears.push(earNode);
      };

      const peelEfectivo = secado > 0.75 || esMuerteAgotamiento ? 6 : Math.max(1, peelCount);
      const factorEscalaVar =
        this.variedad === "chalqueno"
          ? 1.08
          : this.variedad === "palomero"
          ? 0.82
          : 0.98;
      const escalaEloteEfectiva =
        (esMuerteSequiaCalor ? eloteTamano * 0.72 : eloteTamano) * factorEscalaVar;

      if (this.variedad === "palomero") {
        // El Maíz Palomero Toluqueño es prolífico: produce de 2 a 3 mazorcas pequeñas puntiagudas
        makeEar(0.42, Math.PI * 0.5, 0.42, peelEfectivo, estigmaHex, escalaEloteEfectiva);
        if (H >= 3.6) {
          makeEar(0.56, -Math.PI * 0.5, 0.40, peelEfectivo, estigmaHex, escalaEloteEfectiva * 0.92);
        }
        if (H >= 4.4) {
          makeEar(0.68, Math.PI * 0.25, 0.38, peelEfectivo, estigmaHex, escalaEloteEfectiva * 0.84);
        }
      } else {
        // Mazorca principal (nudo medio 0.46)
        makeEar(0.46, Math.PI * 0.5, 0.5, peelEfectivo, estigmaHex, escalaEloteEfectiva);

        // Mazorca secundaria (nudo 0.62 en plantas vigorosas)
        if (H >= 5.2) {
          makeEar(0.62, -Math.PI * 0.5, 0.45, peelEfectivo, estigmaHex, escalaEloteEfectiva * 0.88);
        }
      }
    }

    // --- F. ESPIGA APICAL (PANÍCULA / FLORACIÓN MASCULINA) ---
    if (mostrarEspiga && H >= 3.2) {
      const tassel = new TransformNode("tassel", this.scene);
      tassel.parent = plant;
      tassel.position = P(1);
      const oriTassel = orientacionTallo(0.98);
      tassel.rotation.z = oriTassel.rotZ;
      tassel.rotation.x = oriTassel.rotX;

      const inclinacionEspigaSeca = secado * 0.25 + (causaMuerte ? 0.35 : 0);
      const spike = MeshBuilder.CreateTube(
        "spikeCentral",
        {
          path: [
            new Vector3(0, 0, 0),
            new Vector3(0.03 + inclinacionEspigaSeca * 0.4, 0.6, 0),
            new Vector3(inclinacionEspigaSeca, 1.25 - inclinacionEspigaSeca * 0.35, 0.04)
          ],
          radius: 0.04 * factorAdelgazamiento,
          tessellation: 8,
          cap: Mesh.CAP_ALL
        },
        this.scene
      );
      spike.material = this.tasselMat;
      spike.parent = tassel;
      this.ink(spike, 0.016, "#25330f");
      this.cast(spike);

      // Emparentar antherMaster a tassel para que se elimine automáticamente al reconstruir la planta
      const anther = MeshBuilder.CreateSphere("antherMaster", { diameter: 1, segments: 6 }, this.scene);
      anther.scaling.set(0.05, 0.1, 0.05);
      anther.material = secado > 0.6 ? this.antherMatSeco : this.antherMatFresco;
      anther.isVisible = false;
      anther.parent = tassel;

      // Anteras visibles solo mientras no se haya secado por completo la espiga
      const mostrarAnteras = espigaAbierta && secado < 0.75 && !causaMuerte;
      if (mostrarAnteras) {
        for (let k = 1; k <= 9; k++) {
          const inst = anther.createInstance(`anth_spike_${k}`);
          inst.parent = tassel;
          const yS = 0.20 + k * 0.11;
          const aS = k * 1.95;
          inst.position = new Vector3(Math.cos(aS) * 0.048, yS, Math.sin(aS) * 0.048);
          inst.rotation.set(Math.random() * 0.6, Math.random() * 6.0, Math.random() * 0.6);
          this.tasselAnthers.push(inst);
        }
      }

      const numBranches = espigaAbierta ? (this.variedad === "palomero" ? 13 : 10) : 4;
      const caidaRama = 0.55 + 0.45 * secado + (causaMuerte ? 0.35 : 0);
      for (let b = 0; b < numBranches; b++) {
        const sp = 0.2 + b * 0.082;
        const a = b * 2.4;
        const l = (espigaAbierta ? 1.02 : 0.45) - sp * 0.45;
        const pts: Vector3[] = [];

        for (let k = 0; k <= 8; k++) {
          const s = k / 8;
          const o = l * s;
          pts.push(
            new Vector3(
              Math.cos(a) * o,
              sp * 1.2 + o * 0.45 - (caidaRama * o * o) / l,
              Math.sin(a) * o
            )
          );
        }

        const br = MeshBuilder.CreateTube(
          `branch_${b}`,
          { path: pts, radius: 0.02 * factorAdelgazamiento, tessellation: 5 },
          this.scene
        );
        br.material = this.tasselMat;
        br.parent = tassel;
        this.ink(br, 0.012, "#25330f");

        if (mostrarAnteras) {
          for (let k = 2; k <= 8; k++) {
            const inst = anther.createInstance(`anth_${b}_${k}`);
            inst.parent = tassel;
            inst.position = pts[k].add(new Vector3(0, -0.05, 0));
            inst.rotation.set(Math.random() * 0.8, Math.random() * 6, Math.random() * 0.8);
            this.tasselAnthers.push(inst);
          }
        }
      }

      this.tasselNode = tassel;
    }
  }

  public setVariedad(variedad: TipoSemilla): void {
    if (this.variedad === variedad && this.cobMat) return;
    this.variedad = variedad;
    const varCfg = VARIEDADES_MAIZ[this.variedad || "chalqueno"];
    if (this.huskMat) {
      const ch = Color3.FromHexString(varCfg.colorBracteasHex);
      this.huskMat.diffuseColor = ch;
      this.huskMat.emissiveColor = ch.scale(0.18);
    }
    if (this.cobMat) {
      this.cobMat.diffuseTexture = this.generarTexturaGranos(varCfg.colorHex, this.lastCuajado);
      const cg = Color3.FromHexString(varCfg.colorHex);
      this.cobMat.emissiveColor = cg.scale(0.18);
    }
    this.lastDia = -1;
    this.lastStage = "";
    this.lastHeight = -1;
  }

  /**
   * Actualiza los colores y morfología según la etapa fenológica, límite de crecimiento, secado y causa de muerte
   */
  public sincronizarConEstado(estado: EstadoCrecimiento, _clima: ClimateState, metricas: Metricas): void {
    const diaEntero = Math.floor(estado.dia);
    const etapa = estado.etapa;
    const p = estado.plantaInterna;
    if (p.variedad && p.variedad !== this.variedad) {
      this.setVariedad(p.variedad);
    } else if (p.variedad) {
      this.variedad = p.variedad;
    }

    // Calcular altura paramétrica base según etapa (0.9m en VE -> 6.6m en VT)
    let altBase = 6.6;
    let numHojas = 8;
    let tieneEspiga = true;
    let tieneElotes = true;
    let eloteTamano = 1.0;
    let peel = 3;
    const varCfg = VARIEDADES_MAIZ[this.variedad || "chalqueno"];
    let granoCol = varCfg.colorHex;
    let estigmaCol = "#c8873a";

    if (p.estado === "SEMILLA") {
      this.root.setEnabled(false);
      return;
    }
    this.root.setEnabled(true);

    if (etapa.includes("VE")) {
      altBase = 0.9;
      numHojas = 2;
      tieneEspiga = false;
      tieneElotes = false;
    } else if (etapa.includes("V2")) {
      altBase = 1.6;
      numHojas = 3;
      tieneEspiga = false;
      tieneElotes = false;
    } else if (etapa.includes("V4")) {
      altBase = 2.4;
      numHojas = 4;
      tieneEspiga = false;
      tieneElotes = false;
    } else if (etapa.includes("V6")) {
      altBase = 3.6;
      numHojas = 6;
      tieneEspiga = false;
      tieneElotes = false;
    } else if (etapa.includes("V8")) {
      altBase = 4.8;
      numHojas = 8;
      tieneEspiga = true;
      tieneElotes = false;
    } else if (etapa.includes("V12")) {
      altBase = 5.8;
      numHojas = 8;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 0.35;
      peel = 1;
    } else if (etapa.includes("VT")) {
      altBase = 6.6;
      numHojas = 8;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 0.50;
      peel = 1;
      estigmaCol = "#e8c46a";
    } else if (etapa.includes("R1")) {
      altBase = 6.6;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 0.65;
      peel = 2;
      granoCol = "#fff09a";
      estigmaCol = "#e8c46a";
    } else if (etapa.includes("R2")) {
      altBase = 6.6;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 0.85;
      peel = 2;
      granoCol = "#fff09a";
      estigmaCol = "#c8873a";
    } else if (etapa.includes("R3") || etapa.includes("R4")) {
      altBase = 6.6;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 1.0;
      peel = 4;
      granoCol = varCfg.colorHex;
      estigmaCol = "#c8873a";
    } else if (etapa.includes("R5")) {
      altBase = 6.6;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 1.0;
      peel = 5;
      granoCol = varCfg.colorHex;
      estigmaCol = "#9a5d28";
    } else if (etapa.includes("R6") || p.estado === "MADURA") {
      altBase = 6.6;
      tieneEspiga = true;
      tieneElotes = true;
      eloteTamano = 1.0;
      peel = 5;
      granoCol = varCfg.colorSecoHex || varCfg.colorHex;
      estigmaCol = "#6a3d18";
    }

    // Aplicar LÍMITE REAL DE ALTURA alcanzado por la planta según las condiciones climáticas y su vigor:
    // Si la planta sufrió estrés durante la etapa vegetativa, su techo de altura queda reducido permanentemente;
    // y una vez alcanzada la floración (VT), deja de crecer hacia arriba.
    const rTamano = p.rasgosHeredados?.rTamano ?? 1.0;
    let factorTecho = 1.0;
    if (p.alturaTecho && p.alturaTecho > 0.30) {
      factorTecho = Math.max(0.42, Math.min(1.15, p.alturaTecho / varCfg.alturaMetrosMax));
    } else if (p.vigor > 0) {
      factorTecho = (0.45 + 0.55 * p.vigor) * rTamano;
    }
    const alt = Math.max(0.85, Math.min(6.6 * 1.12, altBase * factorTecho));

    const secado = Math.max(p.secado ?? 0, estado.amarillamiento * 0.75);
    const causaMuerte = estado.estaMuerta ? (p.causaMuerte ?? "sequia") : undefined;

    if (estado.estaMuerta) {
      if (causaMuerte === "agotamiento") {
        // Muerte post-madurez (zacate seco en pie): conserva granos secos de la variedad
        granoCol = varCfg.colorSecoHex || "#e09800";
        estigmaCol = "#4a2c11";
      } else {
        granoCol = "#38250b";
        estigmaCol = "#221205";
      }
    }

    const marchitas = Math.max(estado.pesoSequia, secado * 0.65);
    const cuajadoActual = p.cuajado ?? 1.0;
    const causaStr = causaMuerte ?? "";

    if (
      Math.abs(this.lastHeight - alt) > 0.25 ||
      this.lastStage !== etapa ||
      Math.abs(this.lastEstrésHidrico - marchitas) > 0.20 ||
      Math.abs(this.lastSecado - secado) > 0.14 ||
      this.lastMuerta !== estado.estaMuerta ||
      this.lastCausaMuerte !== causaStr ||
      Math.abs(this.lastCuajado - cuajadoActual) > 0.08 ||
      this.lastDia !== diaEntero
    ) {
      this.construir(
        alt,
        numHojas,
        tieneEspiga,
        tieneElotes,
        eloteTamano,
        peel,
        marchitas,
        granoCol,
        estigmaCol,
        etapa.includes("VT") || etapa.includes("R"),
        cuajadoActual,
        secado,
        causaMuerte
      );
      this.lastHeight = alt;
      this.lastStage = etapa;
      this.lastDia = diaEntero;
      this.lastEstrésHidrico = marchitas;
      this.lastSecado = secado;
      this.lastMuerta = estado.estaMuerta;
      this.lastCausaMuerte = causaStr;
      this.lastCuajado = cuajadoActual;
    }

    // Actualizar colores dinámicos según el estado vital, secado y causa de muerte
    this.aplicarColoracion(estado, metricas);
  }

  private aplicarColoracion(estado: EstadoCrecimiento, metricas: Metricas): void {
    const varCfg = VARIEDADES_MAIZ[this.variedad || "chalqueno"];
    const p = estado.plantaInterna;
    const secado = Math.max(p.secado ?? 0, estado.amarillamiento * 0.7);
    const causa = p.causaMuerte;

    let colTallo = Color3.FromHexString("#7ccc3c");
    let colNudo = Color3.FromHexString("#3f9a22");
    let colHoja = Color3.FromHexString("#5cb82e");
    let colTotomoxtle = Color3.FromHexString(varCfg.colorBracteasHex);
    let colEspiga = Color3.FromHexString("#b9c46a");
    let colRaiz = Color3.FromHexString("#c9a95c");

    if (estado.estaMuerta) {
      const deg = estado.degradacion;
      if (causa === "helada") {
        // Render de muerte por helada: tonos gris-azulado oscuro y escarcha necrótica
        colTallo = Color3.Lerp(Color3.FromHexString("#395059"), Color3.FromHexString("#1e2b30"), deg);
        colNudo = Color3.FromHexString("#24343b");
        colHoja = Color3.Lerp(Color3.FromHexString("#2f434a"), Color3.FromHexString("#182226"), deg);
        colTotomoxtle = Color3.FromHexString("#4a5d61");
        colEspiga = Color3.FromHexString("#47595e");
        colRaiz = Color3.FromHexString("#3b4a4f");
      } else if (causa === "encharcamiento" || causa === "pudricion_semilla") {
        // Render de muerte por encharcamiento / asfixia radicular: base negra lodosa y follaje pardo-amarillento
        colTallo = Color3.Lerp(Color3.FromHexString("#524d24"), Color3.FromHexString("#261d10"), deg);
        colNudo = Color3.FromHexString("#24180d");
        colHoja = Color3.Lerp(Color3.FromHexString("#7d6b26"), Color3.FromHexString("#332612"), deg);
        colTotomoxtle = Color3.FromHexString("#6e5e2b");
        colEspiga = Color3.FromHexString("#635629");
        colRaiz = Color3.FromHexString("#1f140a");
      } else if (causa === "agotamiento") {
        // Render de muerte por fin de ciclo (senescencia post-R6): zacate seco color paja dorada
        colTallo = Color3.Lerp(Color3.FromHexString("#cbb062"), Color3.FromHexString("#8c7338"), deg);
        colNudo = Color3.FromHexString("#9c803e");
        colHoja = Color3.Lerp(Color3.FromHexString("#c4a858"), Color3.FromHexString("#826b32"), deg);
        colTotomoxtle = Color3.FromHexString("#dfd096");
        colEspiga = Color3.FromHexString("#c2a85d");
        colRaiz = Color3.FromHexString("#967a3c");
      } else {
        // Render de muerte por sequía / calor extremo: ocre quemado y café cenizo quebradizo
        colTallo = Color3.Lerp(Color3.FromHexString("#8a5c24"), Color3.FromHexString("#3d250e"), deg);
        colNudo = Color3.FromHexString("#5c3a14");
        colHoja = Color3.Lerp(Color3.FromHexString("#7d501e"), Color3.FromHexString("#2e1b0a"), deg);
        colTotomoxtle = Color3.FromHexString("#9e793c");
        colEspiga = Color3.FromHexString("#7a5926");
        colRaiz = Color3.FromHexString("#593d1c");
      }
    } else {
      // Planta viva: transiciones por estrés y secado progresivo (senescencia de madurez o sequía)
      if (estado.amarillamiento > 0.08 || metricas.estresHidrico > 0.25) {
        const factor = Math.min(1.0, Math.max(estado.amarillamiento, metricas.estresHidrico));
        colHoja = Color3.Lerp(colHoja, Color3.FromHexString("#c8b846"), factor * 0.75);
        colTallo = Color3.Lerp(colTallo, Color3.FromHexString("#a8bf43"), factor * 0.55);
      }
      // Tono bronce/oliva oscuro natural de antocianinas en nudos (sin matiz rosa ni magenta)
      if (estado.antocianina > 0.1 || this.variedad === "azul") {
        const fAnt = this.variedad === "azul" ? Math.max(0.35, estado.antocianina) : estado.antocianina;
        colNudo = Color3.Lerp(colNudo, Color3.FromHexString("#3b3026"), fAnt * 0.65);
        colTallo = Color3.Lerp(colTallo, Color3.FromHexString("#4a5934"), fAnt * 0.30);
      }
      // Escarcha azulada por frío
      if (estado.pesoFrio > 0.1) {
        colHoja = Color3.Lerp(colHoja, Color3.FromHexString("#8bb8c2"), estado.pesoFrio * 0.75);
      }
      // Secado progresivo de caña, totomoxtle y espiga (R5 -> R6 -> Post-R6 o sequía severa)
      if (secado > 0.12) {
        const fSec = Math.min(1.0, (secado - 0.12) / 0.88);
        colTallo = Color3.Lerp(colTallo, Color3.FromHexString("#d4b868"), fSec * 0.88);
        colNudo = Color3.Lerp(colNudo, Color3.FromHexString("#a3863e"), fSec * 0.85);
        colHoja = Color3.Lerp(colHoja, Color3.FromHexString("#ccb462"), fSec * 0.82);
        colTotomoxtle = Color3.Lerp(colTotomoxtle, Color3.FromHexString("#e2d298"), fSec * 0.92);
        colEspiga = Color3.Lerp(colEspiga, Color3.FromHexString("#c9b062"), fSec * 0.90);
        colRaiz = Color3.Lerp(colRaiz, Color3.FromHexString("#9e8244"), fSec * 0.75);
      }
    }

    this.stalkMat.diffuseColor = colTallo;
    this.stalkMat.emissiveColor = colTallo.scale(0.18);
    this.nodeMat.diffuseColor = colNudo;
    this.nodeMat.emissiveColor = colNudo.scale(0.18);
    this.huskMat.diffuseColor = colTotomoxtle;
    this.huskMat.emissiveColor = colTotomoxtle.scale(0.18);
    this.tasselMat.diffuseColor = colEspiga;
    this.tasselMat.emissiveColor = colEspiga.scale(0.18);
    this.braceRootMat.diffuseColor = colRaiz;
    this.braceRootMat.emissiveColor = colRaiz.scale(0.18);

    this.greenMats.forEach((m) => {
      m.diffuseColor = colHoja;
      m.emissiveColor = colHoja.scale(0.18);
    });

    // Actualizar matiz de hojas secas según la causa de muerte o senescencia
    const colHojaSecaBase =
      estado.estaMuerta && (causa === "sequia" || causa === "calor")
        ? Color3.FromHexString("#784b1a")
        : Color3.FromHexString("#b8953d");
    this.dryLeafMats.forEach((m, idx) => {
      const c = colHojaSecaBase.scale(1.0 - idx * 0.1);
      m.diffuseColor = c;
      m.emissiveColor = c.scale(0.18);
    });
  }

  /**
   * Bucle de oscilación biomecánica por viento y acame permanente
   */
  public animarViento(timeSeg: number, vientoMs: number, acameGrados: number, estaMuerta: boolean): void {
    const w = vientoMs / 5.0; // Normalizado
    const radAcame = (acameGrados * Math.PI) / 180;

    // Oscilación de tallo
    if (estaMuerta) {
      this.plantNode.rotation.z = -radAcame - 0.25 + Math.sin(timeSeg * 1.5) * 0.005 * w;
      this.plantNode.rotation.x = Math.cos(timeSeg * 1.2) * 0.003 * w;
    } else {
      const oscZ = Math.sin(timeSeg * (1.8 + w * 0.2)) * 0.015 * w;
      const oscX = Math.cos(timeSeg * 1.3) * 0.01 * w;
      this.plantNode.rotation.z = -radAcame + oscZ;
      this.plantNode.rotation.x = oscX;
    }

    // Aleteo y oscilación independiente de cada hoja
    this.leaves.forEach((l) => {
      l.node.rotation.z = Math.sin(timeSeg * 1.3 + l.ph) * l.amp * w;
      l.node.rotation.x = Math.cos(timeSeg * 0.9 + l.ph) * 0.03 * w;
    });

    // Ondulación de la espiga apical
    if (this.tasselNode) {
      this.tasselNode.rotation.z = Math.sin(timeSeg * 1.1) * 0.06 * w;
      this.tasselNode.rotation.x = Math.cos(timeSeg * 0.9) * 0.05 * w;
    }
  }

  /**
   * Obtiene la referencia al nodo del elote principal para la animación de cosecha
   */
  public getEarNode(): TransformNode | null {
    return this.ears.length > 0 ? this.ears[0] : null;
  }

  /**
   * Oculta las mazorcas una vez cosechadas
   */
  public ocultarMazorcas(): void {
    this.ears.forEach((e) => e.setEnabled(false));
  }
}
