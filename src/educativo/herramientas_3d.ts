/**
 * Modelos 3D Procedurales de Herramientas Interactivas y Animaciones Fluidas
 *
 * Estilo Cel-Shaded / Caricatura con contorno de tinta (#25330f):
 *  - ⛏️ Azada de jardín (mango de madera, hoja metálica y animación física de cavado)
 *  - 💧 Regadera de jardín (cuerpo de lata celeste, asa, roseta, inclinación y ondas de agua)
 *  - 🌿 Pala / Saco de Abono orgánico con espolvoreo de estrellas mágicas
 *  - 🌰 Semillas de maíz doradas con trayectoria parabólica
 *  - 🧺 Canasta de cosecha tejida con recepción de mazorca y confeti
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  Mesh,
  MeshBuilder,
  TransformNode,
  Animation,
  EasingFunction,
  CircleEase,
  CubicEase,
  BackEase
} from "@babylonjs/core";
import { ParticulasEducativas } from "./particulas_educativas";

export class Herramientas3D {
  readonly scene: Scene;
  readonly particulas: ParticulasEducativas;

  // Nodos contenedores de cada herramienta
  readonly rootNode: TransformNode;
  readonly azadaNode: TransformNode;
  readonly regaderaNode: TransformNode;
  readonly abonoNode: TransformNode;
  readonly semillasNode: TransformNode;
  readonly canastaNode: TransformNode;

  // Semillas en la tierra
  readonly semillaEnTierraMesh: Mesh;

  // Surcos arados sobre el montículo
  readonly surcosTierra: Mesh[] = [];

  // Mallas principales para selección / highlight
  private mallasAzada: Mesh[] = [];
  private mallasRegadera: Mesh[] = [];
  private mallasAbono: Mesh[] = [];
  private mallasSemillas: Mesh[] = [];

  // Estado de animación
  private animando = false;

  // Posiciones de reposo base
  private readonly POS_AZADA_REPOSO = new Vector3(-2.2, 0.1, -1.2);
  private readonly ROT_AZADA_REPOSO = new Vector3(0, 0.6, -0.35);

  private readonly POS_REGADERA_REPOSO = new Vector3(-2.0, 0.1, 0.6);
  private readonly ROT_REGADERA_REPOSO = new Vector3(0, 1.2, 0);

  private readonly POS_ABONO_REPOSO = new Vector3(2.0, 0.1, 0.8);
  private readonly ROT_ABONO_REPOSO = new Vector3(0, -0.8, 0);

  private readonly POS_SEMILLAS_REPOSO = new Vector3(-0.8, 0.25, -2.0);

  constructor(scene: Scene, particulas: ParticulasEducativas) {
    this.scene = scene;
    this.particulas = particulas;

    this.rootNode = new TransformNode("herramientasRoot", scene);

    // 1. Crear herramientas procedurales
    this.azadaNode = this.construirAzada();
    this.regaderaNode = this.construirRegadera();
    this.abonoNode = this.construirAbono();
    this.semillasNode = this.construirSemillas();
    this.canastaNode = this.construirCanasta();

    // 2. Crear semilla enterrada incipiente
    this.semillaEnTierraMesh = this.construirSemillaTierra();

    // 3. Crear surcos arados procedurales sobre el montículo
    this.construirSurcosArados();

    // Posición inicial de reposo para las herramientas
    this.posicionarHerramientasReposo();

    // Ocultar las herramientas flotantes heredadas de v1 para evitar objetos flotando
    // (Las herramientas se sostienen en la mano del jugador mediante ViewmodelHerramientas y VR 6DoF)
    this.rootNode.setEnabled(false);
  }

  // Material con color emisivo plano de caricatura
  private mat(hex: string, em = 0.45): StandardMaterial {
    const m = new StandardMaterial(`matH_${hex}_${Math.random()}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(0, 0, 0);
    return m;
  }

  // Contorno de tinta estilo cel-shaded
  private ink(mesh: Mesh, thickness = 0.014, colHex = "#25330f"): void {
    mesh.outlineWidth = thickness;
    mesh.outlineColor = Color3.FromHexString(colHex);
    mesh.renderOutline = true;
  }

  // ---------------------------------------------------------------------------
  // A. CONSTRUCCIÓN DE LA AZADA ⛏️
  // ---------------------------------------------------------------------------
  private construirAzada(): TransformNode {
    const root = new TransformNode("azada", this.scene);
    root.parent = this.rootNode;

    // Mango de madera pulida
    const mango = MeshBuilder.CreateCylinder("mangoAzada", {
      height: 1.8,
      diameter: 0.065,
      tessellation: 12
    }, this.scene);
    mango.position.y = 0.9;
    mango.material = this.mat("#bfa052", 0.45);
    mango.parent = root;
    this.ink(mango, 0.012);
    this.mallasAzada.push(mango);

    // Conector metálico
    const conector = MeshBuilder.CreateCylinder("conectorAzada", {
      height: 0.12,
      diameter: 0.09,
      tessellation: 12
    }, this.scene);
    conector.position.y = 1.78;
    conector.material = this.mat("#475569", 0.4);
    conector.parent = root;
    this.ink(conector, 0.01);
    this.mallasAzada.push(conector);

    // Hoja metálica de corte
    const hoja = MeshBuilder.CreateBox("hojaAzada", {
      width: 0.38,
      height: 0.22,
      depth: 0.03
    }, this.scene);
    hoja.position.set(0, 1.86, 0.12);
    hoja.rotation.x = Math.PI / 4;
    hoja.material = this.mat("#94a3b8", 0.55);
    hoja.parent = root;
    this.ink(hoja, 0.014);
    this.mallasAzada.push(hoja);

    root.rotation.z = -0.4;
    root.scaling.setAll(0.85);
    return root;
  }

  // ---------------------------------------------------------------------------
  // B. CONSTRUCCIÓN DE LA REGADERA DE JARDÍN 💧
  // ---------------------------------------------------------------------------
  private construirRegadera(): TransformNode {
    const root = new TransformNode("regadera", this.scene);
    root.parent = this.rootNode;

    const cuerpo = MeshBuilder.CreateCylinder("cuerpoRegadera", {
      height: 0.65,
      diameterTop: 0.48,
      diameterBottom: 0.55,
      tessellation: 20
    }, this.scene);
    cuerpo.position.y = 0.32;
    cuerpo.material = this.mat("#38bdf8", 0.48);
    cuerpo.parent = root;
    this.ink(cuerpo, 0.015);
    this.mallasRegadera.push(cuerpo);

    const pathAsa: Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pathAsa.push(new Vector3(-0.35 + 0.35 * Math.cos(a), 0.35 + 0.4 * Math.sin(a), 0));
    }
    const asa = MeshBuilder.CreateTube("asaRegadera", {
      path: pathAsa,
      radius: 0.03,
      tessellation: 8
    }, this.scene);
    asa.material = this.mat("#0284c7", 0.45);
    asa.parent = root;
    this.ink(asa, 0.01);
    this.mallasRegadera.push(asa);

    const spout = MeshBuilder.CreateCylinder("spoutRegadera", {
      height: 0.75,
      diameterTop: 0.06,
      diameterBottom: 0.12,
      tessellation: 12
    }, this.scene);
    spout.position.set(0.38, 0.45, 0);
    spout.rotation.z = -Math.PI / 3.2;
    spout.material = this.mat("#38bdf8", 0.48);
    spout.parent = root;
    this.ink(spout, 0.012);
    this.mallasRegadera.push(spout);

    const roseta = MeshBuilder.CreateCylinder("rosetaRegadera", {
      height: 0.08,
      diameterTop: 0.22,
      diameterBottom: 0.12,
      tessellation: 16
    }, this.scene);
    roseta.position.set(0.72, 0.68, 0);
    roseta.rotation.z = -Math.PI / 3.2;
    roseta.material = this.mat("#facc15", 0.6);
    roseta.parent = root;
    this.ink(roseta, 0.012);
    this.mallasRegadera.push(roseta);

    root.scaling.setAll(0.9);
    return root;
  }

  // ---------------------------------------------------------------------------
  // C. CONSTRUCCIÓN DEL ABONO ORGÁNICO 🌿
  // ---------------------------------------------------------------------------
  private construirAbono(): TransformNode {
    const root = new TransformNode("abono", this.scene);
    root.parent = this.rootNode;

    const saco = MeshBuilder.CreateSphere("sacoAbono", {
      diameterX: 0.65,
      diameterY: 0.75,
      diameterZ: 0.5,
      segments: 16
    }, this.scene);
    saco.position.y = 0.38;
    saco.material = this.mat("#d97706", 0.42);
    saco.parent = root;
    this.ink(saco, 0.015);
    this.mallasAbono.push(saco);

    const nudo = MeshBuilder.CreateTorus("nudoSaco", {
      diameter: 0.2,
      thickness: 0.06,
      tessellation: 12
    }, this.scene);
    nudo.position.set(0, 0.72, 0);
    nudo.material = this.mat("#b45309", 0.45);
    nudo.parent = root;
    this.ink(nudo, 0.01);
    this.mallasAbono.push(nudo);

    const hojaIcon = MeshBuilder.CreateDisc("hojaIcon", {
      radius: 0.16,
      tessellation: 16
    }, this.scene);
    hojaIcon.position.set(0, 0.38, 0.26);
    hojaIcon.material = this.mat("#22c55e", 0.6);
    hojaIcon.parent = root;
    this.ink(hojaIcon, 0.01);
    this.mallasAbono.push(hojaIcon);

    root.scaling.setAll(0.95);
    return root;
  }

  // ---------------------------------------------------------------------------
  // D. CONSTRUCCIÓN DE LAS SEMILLAS DE MAÍZ 🌰
  // ---------------------------------------------------------------------------
  private construirSemillas(): TransformNode {
    const root = new TransformNode("semillas", this.scene);
    root.parent = this.rootNode;

    const offsets = [
      [0, 0.2, 0],
      [-0.12, 0.12, 0.08],
      [0.12, 0.14, -0.06]
    ];
    offsets.forEach(([x, y, z], idx) => {
      const g = MeshBuilder.CreateSphere(`granoSemilla_${idx}`, {
        diameterX: 0.18,
        diameterY: 0.26,
        diameterZ: 0.14,
        segments: 14
      }, this.scene);
      g.position.set(x, y, z);
      g.rotation.set(0.2 * idx, 0.5 * idx, -0.3);
      g.material = this.mat("#f59e0b", 0.6);
      g.parent = root;
      this.ink(g, 0.012, "#78350f");
      this.mallasSemillas.push(g);
    });

    return root;
  }

  // ---------------------------------------------------------------------------
  // E. CONSTRUCCIÓN DE LA CANASTA DE COSECHA 🧺
  // ---------------------------------------------------------------------------
  private construirCanasta(): TransformNode {
    const root = new TransformNode("canastaCosecha", this.scene);
    root.parent = this.rootNode;

    const base = MeshBuilder.CreateCylinder("baseCanasta", {
      height: 0.5,
      diameterTop: 0.85,
      diameterBottom: 0.65,
      tessellation: 20
    }, this.scene);
    base.position.y = 0.25;
    base.material = this.mat("#c2410c", 0.45);
    base.parent = root;
    this.ink(base, 0.015);

    const pathAsa: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      pathAsa.push(new Vector3(0.42 * Math.cos(a), 0.45 + 0.5 * Math.sin(a), 0));
    }
    const asa = MeshBuilder.CreateTube("asaCanasta", {
      path: pathAsa,
      radius: 0.035,
      tessellation: 8
    }, this.scene);
    asa.material = this.mat("#9a3412", 0.45);
    asa.parent = root;
    this.ink(asa, 0.012);

    root.position.set(2.2, 0, -0.8);
    root.scaling.setAll(0.9);
    return root;
  }

  // ---------------------------------------------------------------------------
  // F. SEMILLA INCIPIENTE EN LA TIERRA
  // ---------------------------------------------------------------------------
  private construirSemillaTierra(): Mesh {
    const s = MeshBuilder.CreateSphere("semillaEnTierra", {
      diameterX: 0.16,
      diameterY: 0.24,
      diameterZ: 0.12,
      segments: 12
    }, this.scene);
    s.position.set(0, 0.08, 0);
    s.rotation.set(Math.PI / 2.5, 0, 0);
    s.material = this.mat("#f59e0b", 0.55);
    s.parent = this.rootNode;
    this.ink(s, 0.012, "#78350f");
    s.isVisible = false;
    return s;
  }

  // ---------------------------------------------------------------------------
  // G. SURCOS DE TIERRA ARADA
  // ---------------------------------------------------------------------------
  private construirSurcosArados(): void {
    const matSurco = this.mat("#5a3414", 0.38);
    for (let i = -2; i <= 2; i++) {
      const r = 0.65 - Math.abs(i) * 0.1;
      const pts = [
        new Vector3(-r, 0.03, i * 0.26),
        new Vector3(0, 0.07, i * 0.28),
        new Vector3(r, 0.03, i * 0.26)
      ];
      const surco = MeshBuilder.CreateTube(`surco_${i}`, {
        path: pts,
        radius: 0.05,
        tessellation: 6
      }, this.scene);
      surco.material = matSurco;
      surco.parent = this.rootNode;
      this.ink(surco, 0.01, "#2e1a0a");
      surco.isVisible = false;
      this.surcosTierra.push(surco);
    }
  }

  // ---------------------------------------------------------------------------
  // POSICIONES DE REPOSO Y ANIMACIÓN FLOTANTE IDLE
  // ---------------------------------------------------------------------------
  public posicionarHerramientasReposo(): void {
    this.azadaNode.position.copyFrom(this.POS_AZADA_REPOSO);
    this.azadaNode.rotation.copyFrom(this.ROT_AZADA_REPOSO);

    this.regaderaNode.position.copyFrom(this.POS_REGADERA_REPOSO);
    this.regaderaNode.rotation.copyFrom(this.ROT_REGADERA_REPOSO);

    this.abonoNode.position.copyFrom(this.POS_ABONO_REPOSO);
    this.abonoNode.rotation.copyFrom(this.ROT_ABONO_REPOSO);

    this.semillasNode.position.copyFrom(this.POS_SEMILLAS_REPOSO);
    this.semillasNode.rotation.set(0, 0, 0);
  }

  /**
   * Suave animación de levitación en reposo (desactivada: herramientas en mano del jugador)
   */
  public animarIdle(_tiempoSeg: number): void {
    // Las herramientas ahora viven en el Viewmodel FPS y manos 6DoF, sin objetos flotantes
  }

  public actualizarTierraArada(_progreso: number): void {
    // Gestionado por nodo en SurcoMilpa
  }

  public mostrarSemillaEnTierra(_visible: boolean): void {
    this.semillaEnTierraMesh.isVisible = false;
  }

  // ---------------------------------------------------------------------------
  // ANIMACIONES INTERACTIVAS (delegadas al Viewmodel en primera persona)
  // ---------------------------------------------------------------------------

  public animarAzada(onFin?: () => void): void {
    onFin?.();
  }

  public animarRegadera(onFin?: () => void): void {
    onFin?.();
  }

  public animarAbono(onFin?: () => void): void {
    onFin?.();
  }

  public animarSemilla(onFin?: () => void): void {
    onFin?.();
  }

  /**
   * Anima la cosecha: vuelo de mazorca con parábola, rotación a la canasta y lluvia de confeti
   */
  public animarCosecha(earMesh: TransformNode | null, onFin?: () => void): void {
    this.particulas.efectoCosechaFestiva(new Vector3(0, 2.5, 0));
    if (earMesh) {
      const ease = new CubicEase();
      ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

      Animation.CreateAndStartAnimation(
        "earFly",
        earMesh,
        "position",
        30,
        35,
        earMesh.position,
        new Vector3(2.2, 0.6, -0.8),
        Animation.ANIMATIONLOOPMODE_CONSTANT,
        ease
      );
      Animation.CreateAndStartAnimation(
        "earScale",
        earMesh,
        "scaling",
        30,
        35,
        earMesh.scaling,
        new Vector3(0.4, 0.4, 0.4),
        Animation.ANIMATIONLOOPMODE_CONSTANT,
        ease
      );
    }
    setTimeout(() => {
      onFin?.();
    }, 1200);
  }
}
