/**
 * Modelo en Primera Persona Voxel / Pixel-Art de Herramientas y Mano (Viewmodel FPS)
 *
 * Encuadrado en la esquina inferior derecha estilo Minecraft para mantener
 * despejado el centro de visión, con geometría modular voxel, balanceo natural
 * y soporte completo para todas las herramientas y semillas de la hotbar.
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

  // Nodos individuales por ítem/herramienta
  private nodoManos!: TransformNode;
  private manoDerVM!: TransformNode;
  private nodoAzada!: TransformNode;
  private nodoSemillas!: TransformNode;
  private nodoSemillaChalqueno!: TransformNode;
  private nodoSemillaAzul!: TransformNode;
  private nodoSemillaRojo!: TransformNode;
  private nodoSemillaPalomero!: TransformNode;
  private nodoRegadera!: TransformNode;
  private nodoAbono!: TransformNode;
  private nodoSol!: TransformNode;
  private nodoCosecha!: TransformNode;
  private nodoFrijol!: TransformNode;
  private nodoCalabaza!: TransformNode;

  // Caché de materiales reutilizables
  private matCache = new Map<string, StandardMaterial>();

  // Estado
  public herramientaActual: HerramientaTipo = "mano";
  public estaAnimando = false;
  private tiempoIdle = 0;
  private animacionProgreso = 0;
  private tipoAnimacion: HerramientaTipo | null = null;
  private onImpactoCallback: (() => void) | null = null;

  // Posición de reposo inferior-derecha estilo Minecraft (sin invadir la retícula)
  private readonly POS_REPOSO = new Vector3(0.32, -0.26, 0.45);
  private readonly ROT_REPOSO = new Vector3(0.10, -0.32, -0.06);

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
    this.equipar("mano");
  }

  private mat(hex: string, em = 0.24): StandardMaterial {
    const key = `${hex}_${em.toFixed(2)}`;
    const existente = this.matCache.get(key);
    if (existente) return existente;

    const m = new StandardMaterial(`matVM_${key}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    this.matCache.set(key, m);
    return m;
  }

  private ink(mesh: Mesh, width = 0.0035, colHex = "#1a240a"): void {
    mesh.renderOutline = true;
    mesh.outlineWidth = width;
    mesh.outlineColor = Color3.FromHexString(colHex);
    mesh.isPickable = false;
  }

  private crearBrazoPixelBase(parent: TransformNode, prefijo: string): void {
    const manga = MeshBuilder.CreateBox(
      `${prefijo}_manga`,
      { width: 0.085, height: 0.085, depth: 0.14 },
      this.scene
    );
    manga.position.set(0.02, -0.06, -0.02);
    manga.rotation.set(0.18, -0.1, 0);
    manga.material = this.mat("#15803d", 0.25);
    manga.parent = parent;
    this.ink(manga);

    const puno = MeshBuilder.CreateBox(
      `${prefijo}_puno`,
      { width: 0.088, height: 0.088, depth: 0.024 },
      this.scene
    );
    puno.position.set(0.015, -0.04, 0.055);
    puno.rotation.set(0.18, -0.1, 0);
    puno.material = this.mat("#fbbf24", 0.28);
    puno.parent = parent;
    this.ink(puno);

    const palma = MeshBuilder.CreateBox(
      `${prefijo}_palma`,
      { width: 0.072, height: 0.072, depth: 0.11 },
      this.scene
    );
    palma.position.set(0.01, -0.015, 0.115);
    palma.rotation.set(0.18, -0.1, 0);
    palma.material = this.mat("#fdba74", 0.26);
    palma.parent = parent;
    this.ink(palma);
  }

  private crearBolsaPixel(
    nombreNodo: string,
    colorBolsa: string,
    colorContenido: string,
    tamGrano = 0.028,
    colorCinta?: string
  ): TransformNode {
    const nodo = new TransformNode(nombreNodo, this.scene);
    nodo.parent = this.root;
    this.crearBrazoPixelBase(nodo, nombreNodo);

    const bolsa = MeshBuilder.CreateBox(
      `vm_${nombreNodo}_bolsa`,
      { width: 0.095, height: 0.105, depth: 0.075 },
      this.scene
    );
    bolsa.position.set(-0.005, 0.045, 0.155);
    bolsa.material = this.mat(colorBolsa, 0.26);
    bolsa.parent = nodo;
    this.ink(bolsa);

    if (colorCinta) {
      const banda = MeshBuilder.CreateBox(
        `vm_${nombreNodo}_banda`,
        { width: 0.101, height: 0.032, depth: 0.081 },
        this.scene
      );
      banda.position.set(-0.005, 0.045, 0.155);
      banda.material = this.mat(colorCinta, 0.34);
      banda.parent = nodo;
      this.ink(banda, 0.0024);
    }

    const boca = MeshBuilder.CreateBox(
      `vm_${nombreNodo}_boca`,
      { width: 0.078, height: 0.024, depth: 0.058 },
      this.scene
    );
    boca.position.set(-0.005, 0.105, 0.155);
    boca.material = this.mat("#78350f", 0.24);
    boca.parent = nodo;
    this.ink(boca, 0.003);

    const offsets = [
      [-0.018, 0.12, 0.142],
      [0.014, 0.126, 0.154],
      [-0.003, 0.132, 0.172],
      [0.012, 0.118, 0.135]
    ];
    offsets.forEach(([ox, oy, oz], idx) => {
      const p = MeshBuilder.CreateBox(
        `vm_${nombreNodo}_grano_${idx}`,
        { size: tamGrano },
        this.scene
      );
      p.position.set(ox, oy, oz);
      p.material = this.mat(colorContenido, 0.36);
      p.parent = nodo;
      this.ink(p, 0.0025);
    });

    return nodo;
  }

  private construirModelos(): void {
    // 1. MANOS LIBRES (brazo voxel estilo Minecraft)
    this.nodoManos = new TransformNode("vmManosLibres", this.scene);
    this.nodoManos.parent = this.root;
    this.manoDerVM = new TransformNode("vmManoLibreDer", this.scene);
    this.manoDerVM.parent = this.nodoManos;
    this.crearBrazoPixelBase(this.manoDerVM, "vmMano");

    // 2. AZADA CAMPESINA VOXEL (compacta en esquina inferior derecha)
    this.nodoAzada = new TransformNode("vmAzada", this.scene);
    this.nodoAzada.parent = this.root;
    this.crearBrazoPixelBase(this.nodoAzada, "vmAzada");

    const pivoteAzada = new TransformNode("vmAzadaPivote", this.scene);
    pivoteAzada.parent = this.nodoAzada;
    pivoteAzada.position.set(-0.01, 0.015, 0.15);
    pivoteAzada.rotation.set(0.45, 0.08, 0.08);

    const mango = MeshBuilder.CreateBox(
      "vmMangoAzada",
      { width: 0.026, height: 0.34, depth: 0.026 },
      this.scene
    );
    mango.position.set(0, 0.11, 0.04);
    mango.material = this.mat("#a16207", 0.24);
    mango.parent = pivoteAzada;
    this.ink(mango);

    const cabezal = MeshBuilder.CreateBox(
      "vmConectorAzada",
      { width: 0.042, height: 0.036, depth: 0.042 },
      this.scene
    );
    cabezal.position.set(0, 0.27, 0.04);
    cabezal.material = this.mat("#334155", 0.26);
    cabezal.parent = pivoteAzada;
    this.ink(cabezal);

    const hoja = MeshBuilder.CreateBox(
      "vmHojaAzada",
      { width: 0.045, height: 0.024, depth: 0.13 },
      this.scene
    );
    hoja.position.set(0, 0.26, 0.11);
    hoja.rotation.x = 0.22;
    hoja.material = this.mat("#94a3b8", 0.28);
    hoja.parent = pivoteAzada;
    this.ink(hoja);

    const filo = MeshBuilder.CreateBox(
      "vmFiloAzada",
      { width: 0.047, height: 0.032, depth: 0.026 },
      this.scene
    );
    filo.position.set(0, 0.238, 0.165);
    filo.material = this.mat("#cbd5e1", 0.32);
    filo.parent = pivoteAzada;
    this.ink(filo);

    // 3. BOLSAS DE SEMILLAS DE MAÍZ VOXEL (distintas razas con banda de color y granos)
    this.nodoSemillas = this.crearBolsaPixel("vmSemillas", "#d6b888", "#fbbf24", 0.030, "#eab308");
    this.nodoSemillaChalqueno = this.crearBolsaPixel(
      "vmSemillaChalqueno",
      "#d6b888",
      "#fef08a",
      0.032,
      "#eab308"
    );
    this.nodoSemillaAzul = this.crearBolsaPixel(
      "vmSemillaAzul",
      "#d6b888",
      "#4f46e5",
      0.030,
      "#312e81"
    );
    this.nodoSemillaRojo = this.crearBolsaPixel(
      "vmSemillaRojo",
      "#d6b888",
      "#ef4444",
      0.030,
      "#991b1b"
    );
    this.nodoSemillaPalomero = this.crearBolsaPixel(
      "vmSemillaPalomero",
      "#d6b888",
      "#fef3c7",
      0.026,
      "#d97706"
    );

    // 4. REGADERA VOXEL PIXEL-ART
    this.nodoRegadera = new TransformNode("vmRegadera", this.scene);
    this.nodoRegadera.parent = this.root;
    this.crearBrazoPixelBase(this.nodoRegadera, "vmReg");

    const cuerpoReg = MeshBuilder.CreateBox(
      "vmCuerpoReg",
      { width: 0.11, height: 0.115, depth: 0.12 },
      this.scene
    );
    cuerpoReg.position.set(-0.01, 0.04, 0.17);
    cuerpoReg.material = this.mat("#0284c7", 0.28);
    cuerpoReg.parent = this.nodoRegadera;
    this.ink(cuerpoReg);

    const asaReg = MeshBuilder.CreateBox(
      "vmAsaReg",
      { width: 0.024, height: 0.075, depth: 0.07 },
      this.scene
    );
    asaReg.position.set(-0.01, 0.115, 0.14);
    asaReg.material = this.mat("#0369a1", 0.26);
    asaReg.parent = this.nodoRegadera;
    this.ink(asaReg);

    const canoReg = MeshBuilder.CreateBox(
      "vmCanoReg",
      { width: 0.028, height: 0.028, depth: 0.11 },
      this.scene
    );
    canoReg.position.set(-0.03, 0.065, 0.25);
    canoReg.rotation.x = -0.45;
    canoReg.material = this.mat("#38bdf8", 0.3);
    canoReg.parent = this.nodoRegadera;
    this.ink(canoReg);

    const rosetaReg = MeshBuilder.CreateBox(
      "vmRosetaReg",
      { width: 0.046, height: 0.046, depth: 0.028 },
      this.scene
    );
    rosetaReg.position.set(-0.03, 0.095, 0.305);
    rosetaReg.rotation.x = -0.45;
    rosetaReg.material = this.mat("#eab308", 0.34);
    rosetaReg.parent = this.nodoRegadera;
    this.ink(rosetaReg);

    // 5. ABONO ORGÁNICO VOXEL
    this.nodoAbono = this.crearBolsaPixel("vmAbono", "#15803d", "#5c3416", 0.036);

    // 6. AMULETO DE ENERGÍA SOLAR (+15 DÍAS)
    this.nodoSol = new TransformNode("vmSol", this.scene);
    this.nodoSol.parent = this.root;
    this.crearBrazoPixelBase(this.nodoSol, "vmSol");

    const solCentro = MeshBuilder.CreateBox(
      "vmSolNucleo",
      { width: 0.085, height: 0.085, depth: 0.032 },
      this.scene
    );
    solCentro.position.set(-0.01, 0.06, 0.17);
    solCentro.material = this.mat("#f59e0b", 0.42);
    solCentro.parent = this.nodoSol;
    this.ink(solCentro);

    const solCentroClaro = MeshBuilder.CreateBox(
      "vmSolBrillo",
      { width: 0.052, height: 0.052, depth: 0.040 },
      this.scene
    );
    solCentroClaro.position.set(-0.01, 0.06, 0.17);
    solCentroClaro.material = this.mat("#fef08a", 0.55);
    solCentroClaro.parent = this.nodoSol;
    this.ink(solCentroClaro, 0.0025);

    // 7. GUANTE Y CESTA DE COSECHA VOXEL
    this.nodoCosecha = new TransformNode("vmCosecha", this.scene);
    this.nodoCosecha.parent = this.root;
    this.crearBrazoPixelBase(this.nodoCosecha, "vmCosecha");

    const guante = MeshBuilder.CreateBox(
      "vmGuanteCosecha",
      { width: 0.09, height: 0.085, depth: 0.12 },
      this.scene
    );
    guante.position.set(0.005, 0.01, 0.145);
    guante.material = this.mat("#ea580c", 0.28);
    guante.parent = this.nodoCosecha;
    this.ink(guante);

    // 8. SEMILLAS ASOCIADAS: FRIJOL Y CALABAZA (saquitos detallados con banda)
    this.nodoFrijol = this.crearBolsaPixel("vmFrijol", "#d6b888", "#a855f7", 0.030, "#581c87");
    this.nodoCalabaza = this.crearBolsaPixel("vmCalabaza", "#d6b888", "#fef3c7", 0.032, "#ea580c");
  }

  /**
   * Cambia la herramienta activa en la mano del jugador
   */
  public equipar(herramienta: HerramientaTipo): void {
    this.herramientaActual = herramienta;

    this.nodoManos.setEnabled(herramienta === "mano");
    this.nodoAzada.setEnabled(herramienta === "azada");
    this.nodoSemillas.setEnabled(herramienta === "semilla");
    this.nodoSemillaChalqueno.setEnabled(herramienta === "semilla_chalqueno");
    this.nodoSemillaAzul.setEnabled(herramienta === "semilla_azul");
    this.nodoSemillaRojo.setEnabled(herramienta === "semilla_rojo");
    this.nodoSemillaPalomero.setEnabled(herramienta === "semilla_palomero");
    this.nodoRegadera.setEnabled(herramienta === "regadera");
    this.nodoAbono.setEnabled(herramienta === "abono");
    this.nodoSol.setEnabled(herramienta === "sol");
    this.nodoCosecha.setEnabled(herramienta === "cosecha");
    this.nodoFrijol.setEnabled(herramienta === "frijol");
    this.nodoCalabaza.setEnabled(herramienta === "calabaza");

    // Animación rápida de levantamiento al cambiar ranura
    this.root.position.y = this.POS_REPOSO.y - 0.10;
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

    const factorSway = Math.min(1.0, velocidadMovimiento * 0.35 + 0.25);
    const bobX = Math.sin(this.tiempoIdle * 2.6) * 0.009 * factorSway;
    const bobY = Math.abs(Math.sin(this.tiempoIdle * 5.2)) * 0.012 * factorSway;

    if (!this.estaAnimando) {
      this.root.position.x = this.POS_REPOSO.x + bobX;
      this.root.position.y += (this.POS_REPOSO.y - bobY - this.root.position.y) * 0.22;
      this.root.position.z = this.POS_REPOSO.z;

      this.root.rotation.x = this.ROT_REPOSO.x;
      this.root.rotation.y = this.ROT_REPOSO.y;
      this.root.rotation.z = this.ROT_REPOSO.z + bobX * 0.6;
      return;
    }

    this.animacionProgreso += dt * 5.0;

    // Disparo fiable del impacto (no depende de caer dentro de un sub-intervalo si hay caída de FPS)
    const ejecutarImpacto = (sonido?: () => void) => {
      if (this.onImpactoCallback) {
        sonido?.();
        this.onImpactoCallback();
        this.onImpactoCallback = null;
      }
    };

    switch (this.tipoAnimacion) {
      case "mano": {
        if (this.animacionProgreso < 0.45) {
          const f = this.animacionProgreso / 0.45;
          this.root.position.z = this.POS_REPOSO.z + f * 0.16;
          this.root.position.x = this.POS_REPOSO.x - f * 0.08;
          this.root.rotation.x = this.ROT_REPOSO.x + f * 0.28;
        } else if (this.animacionProgreso < 0.65) {
          ejecutarImpacto(() => this.audio.clickUI());
        } else if (this.animacionProgreso <= 1.0) {
          ejecutarImpacto(() => this.audio.clickUI());
          const inv = 1 - (this.animacionProgreso - 0.65) / 0.35;
          this.root.position.z = this.POS_REPOSO.z + 0.16 * inv;
          this.root.position.x = this.POS_REPOSO.x - 0.08 * inv;
          this.root.rotation.x = this.ROT_REPOSO.x + 0.28 * inv;
        } else {
          ejecutarImpacto(() => this.audio.clickUI());
          this.estaAnimando = false;
        }
        break;
      }

      case "azada": {
        if (this.animacionProgreso < 0.40) {
          const f = this.animacionProgreso / 0.40;
          this.root.rotation.x = this.ROT_REPOSO.x - f * 0.55;
          this.root.position.y = this.POS_REPOSO.y + f * 0.08;
        } else if (this.animacionProgreso < 0.65) {
          const f = (this.animacionProgreso - 0.40) / 0.25;
          this.root.rotation.x = this.ROT_REPOSO.x - 0.55 + f * 1.15;
          this.root.position.y = this.POS_REPOSO.y + 0.08 - f * 0.14;
          this.root.position.z = this.POS_REPOSO.z + f * 0.14;

          if (f >= 0.55) {
            ejecutarImpacto(() => this.audio.golpeAzada());
          }
        } else if (this.animacionProgreso <= 1.0) {
          ejecutarImpacto(() => this.audio.golpeAzada());
          const inv = 1 - (this.animacionProgreso - 0.65) / 0.35;
          this.root.rotation.x = this.ROT_REPOSO.x + 0.60 * inv;
          this.root.position.y = this.POS_REPOSO.y - 0.06 * inv;
          this.root.position.z = this.POS_REPOSO.z + 0.14 * inv;
        } else {
          ejecutarImpacto(() => this.audio.golpeAzada());
          this.estaAnimando = false;
        }
        break;
      }

      case "regadera": {
        if (this.animacionProgreso < 0.3) {
          const f = this.animacionProgreso / 0.3;
          this.root.rotation.z = this.ROT_REPOSO.z + f * 0.52;
          this.root.rotation.x = this.ROT_REPOSO.x + f * 0.32;
          this.root.position.z = this.POS_REPOSO.z + f * 0.12;
        } else if (this.animacionProgreso < 0.85) {
          if (this.animacionProgreso > 0.40) {
            ejecutarImpacto();
          }
        } else if (this.animacionProgreso <= 1.0) {
          ejecutarImpacto();
          const inv = 1 - (this.animacionProgreso - 0.85) / 0.15;
          this.root.rotation.z = this.ROT_REPOSO.z + 0.52 * inv;
          this.root.rotation.x = this.ROT_REPOSO.x + 0.32 * inv;
          this.root.position.z = this.POS_REPOSO.z + 0.12 * inv;
        } else {
          ejecutarImpacto();
          this.audio.detenerAgua();
          this.estaAnimando = false;
        }
        break;
      }

      case "semilla":
      case "semilla_chalqueno":
      case "semilla_azul":
      case "semilla_rojo":
      case "semilla_palomero":
      case "abono":
      case "frijol":
      case "calabaza": {
        if (this.animacionProgreso < 0.4) {
          const f = this.animacionProgreso / 0.4;
          this.root.position.z = this.POS_REPOSO.z + f * 0.16;
          this.root.rotation.x = this.ROT_REPOSO.x + f * 0.35;
        } else if (this.animacionProgreso < 0.6) {
          ejecutarImpacto(() =>
            this.tipoAnimacion === "abono" ? this.audio.abono() : this.audio.semillas()
          );
        } else if (this.animacionProgreso <= 1.0) {
          ejecutarImpacto(() =>
            this.tipoAnimacion === "abono" ? this.audio.abono() : this.audio.semillas()
          );
          const inv = 1 - (this.animacionProgreso - 0.6) / 0.4;
          this.root.position.z = this.POS_REPOSO.z + 0.16 * inv;
          this.root.rotation.x = this.ROT_REPOSO.x + 0.35 * inv;
        } else {
          ejecutarImpacto(() =>
            this.tipoAnimacion === "abono" ? this.audio.abono() : this.audio.semillas()
          );
          this.estaAnimando = false;
        }
        break;
      }

      case "sol":
      case "cosecha":
      default: {
        if (this.animacionProgreso < 0.5) {
          const f = this.animacionProgreso / 0.5;
          this.root.position.z = this.POS_REPOSO.z + f * 0.18;
          this.root.rotation.y = this.ROT_REPOSO.y + f * 0.28;
        } else if (this.animacionProgreso < 0.7) {
          ejecutarImpacto(() => this.audio.cosecha());
        } else if (this.animacionProgreso <= 1.0) {
          ejecutarImpacto(() => this.audio.cosecha());
          const inv = 1 - (this.animacionProgreso - 0.7) / 0.3;
          this.root.position.z = this.POS_REPOSO.z + 0.18 * inv;
          this.root.rotation.y = this.ROT_REPOSO.y + 0.28 * inv;
        } else {
          ejecutarImpacto(() => this.audio.cosecha());
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
