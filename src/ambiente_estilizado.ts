/**
 * Entorno Pixel-Art / Voxel con Babylon.js
 *
 * Escenario milpero rural en estética voxel y pixel-art con texturas NEAREST:
 * - Isla cuadrada 18×18 m de césped pixelado y perfil edáfico estratificado.
 * - Montículo central y lámina de agua reactiva con textura pixelada.
 * - Valles volcánicos escalonados tipo voxel en 360° con cumbres nevadas reactivas al frío.
 * - Cobertizo rústico de vigas cuadradas, tejado escalonado y farol nocturno.
 * - Barda de madera perimetral, vereda de piedra y árboles voxel en las esquinas.
 * - Sol cuadrado voxel con halo, nubes cúbicas desplazadas por el viento y lluvia pixelada.
 */

import {
  Scene,
  Vector3,
  Color3,
  Color4,
  StandardMaterial,
  Mesh,
  MeshBuilder,
  TransformNode,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  ParticleSystem,
  DynamicTexture,
} from "@babylonjs/core";
import { aplicarEstiloMako } from "./estilo_mako";
import { registrarCaja } from "./colisiones";
import { ClimateState, Metricas } from "./clima";
import { PaisajeExterior } from "./entorno/paisaje_exterior";
import { GranjaDecorativa } from "./entorno/granja_decorativa";
import {
  configurarSamplingPixel,
  crearMaterialPixelTex,
  crearTexAguaPixel,
  crearTexFollajePixel,
  crearTexMaderaPixel,
  crearTexPastoPixel,
  crearTexPerfilTierraPixel,
  crearTexPiedraPixel,
  crearTexTejaPixel,
  crearTexTierraSurcoPixel,
} from "./ui/texturas_pixel_3d";

export class AmbienteEstilizado {
  readonly scene: Scene;
  readonly shadowGen: ShadowGenerator;

  // Luces
  readonly hemiLight: HemisphericLight;
  readonly sunLight: DirectionalLight;

  // Mallas del podio y suelo
  readonly grassMesh: Mesh;
  readonly soilMesh: Mesh;
  readonly moundMesh: Mesh;
  readonly bladeMaster: Mesh;
  readonly bladeInstances: Mesh[] = [];
  readonly puddleMesh: Mesh;

  // Sol y cielo
  readonly sunNode: TransformNode;
  readonly sunMesh: Mesh;
  readonly haloMesh: Mesh;
  readonly clouds: TransformNode[] = [];
  readonly rainSystem: ParticleSystem | null = null;
  readonly volcanesMeshes: Mesh[] = [];

  // Materiales
  private matGrass: StandardMaterial;
  private matSoil: StandardMaterial;
  private matMound: StandardMaterial;
  private matBlade: StandardMaterial;
  private matPuddle: StandardMaterial;
  private matSun: StandardMaterial;
  private matHalo: StandardMaterial;
  private matCloud: StandardMaterial;
  private matNieveVolcan!: StandardMaterial;
  private matFarolLuz!: StandardMaterial;
  private readonly granjaDecorativa: GranjaDecorativa;
  private paisaje!: PaisajeExterior;
  private matCielo!: StandardMaterial;
  private cupulaCielo!: Mesh;

  constructor(scene: Scene) {
    this.scene = scene;
    scene.clearColor = new Color4(0.62, 0.82, 0.96, 1.0);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0042;
    scene.fogColor = new Color3(0.72, 0.87, 0.97);

    // 1. ILUMINACIÓN PIXEL-ART NÍTIDA
    this.hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    this.hemiLight.intensity = 0.88;
    this.hemiLight.groundColor = new Color3(0.65, 0.56, 0.38);

    this.sunLight = new DirectionalLight("sunDir", new Vector3(-0.5, -1, -0.4), scene);
    this.sunLight.position = new Vector3(6, 12, 5);
    this.sunLight.intensity = 0.65;

    this.shadowGen = new ShadowGenerator(1024, this.sunLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 12;
    this.shadowGen.setDarkness(0.45);

    aplicarEstiloMako(scene, this.sunLight, this.hemiLight);

    // 2. MATERIALES PIXEL-ART CON TEXTURAS NEAREST
    const texPasto = crearTexPastoPixel(scene, 14, 14);
    this.matGrass = crearMaterialPixelTex(scene, "matGrassPixel", texPasto, "#2f5718", 0.14);

    const texPerfil = crearTexPerfilTierraPixel(scene, 16, 1);
    this.matSoil = crearMaterialPixelTex(scene, "matSoilPixel", texPerfil, "#3b2310", 0.12);

    const texSurco = crearTexTierraSurcoPixel(scene, 3, 2);
    this.matMound = crearMaterialPixelTex(scene, "matMoundPixel", texSurco, "#3d2511", 0.16);

    const texFollaje = crearTexFollajePixel(scene);
    this.matBlade = crearMaterialPixelTex(scene, "matBladePixel", texFollaje, "#254d14", 0.16);

    this.matSun = this.crearMat("#ffd53a", 0.95);
    this.matHalo = this.crearMat("#ffe680", 0.85);
    this.matHalo.alpha = 0.24;
    this.matCloud = this.crearMat("#f8fafc", 0.72);

    const texAgua = crearTexAguaPixel(scene, 2, 2);
    this.matPuddle = crearMaterialPixelTex(scene, "matPuddle", texAgua, "#0e7490", 0.12);
    this.matPuddle.specularColor = new Color3(0.4, 0.5, 0.6);
    this.matPuddle.alpha = 0.0;

    // 3. ISLA VOXEL DE CÉSPED Y ESTRATO EDÁFICO (18×18 m)
    this.grassMesh = MeshBuilder.CreateBox(
      "grassPodium",
      { width: 18, height: 0.3, depth: 18 },
      scene
    );
    this.grassMesh.position.y = -0.15;
    this.grassMesh.material = this.matGrass;
    this.grassMesh.receiveShadows = true;
    this.grassMesh.freezeWorldMatrix();

    this.soilMesh = MeshBuilder.CreateBox(
      "soilStratum",
      { width: 17.6, height: 1.2, depth: 17.6 },
      scene
    );
    this.soilMesh.position.y = -0.9;
    this.soilMesh.material = this.matSoil;
    this.soilMesh.freezeWorldMatrix();

    // Montículo voxel central bajo el camellón
    this.moundMesh = MeshBuilder.CreateBox(
      "mound",
      { width: 1.9, height: 0.14, depth: 1.6 },
      scene
    );
    this.moundMesh.position.y = 0.04;
    this.moundMesh.material = this.matMound;
    this.moundMesh.receiveShadows = true;
    this.moundMesh.isPickable = false;

    // Lámina cuadrada pixelada de encharcamiento
    this.puddleMesh = MeshBuilder.CreateBox(
      "puddle",
      { width: 1.5, height: 0.015, depth: 1.3 },
      scene
    );
    this.puddleMesh.position.y = 0.024;
    this.puddleMesh.material = this.matPuddle;
    this.puddleMesh.isPickable = false;

    // Construcción del Valle de Volcanes voxel 360°, Planicie Exterior, Molino, Animales, Cobertizo y Árboles
    this.granjaDecorativa = new GranjaDecorativa(scene);
    this.construirCupulaCielo();
    this.construirValleVolcanes();
    this.construirCobertizoLobby();
    this.construirDetallesMilpaVoxel();

    // 4. MATAS DE PASTO PIXEL-ART DISPERSAS FUERA DE LAS ZONAS DE TRABAJO
    this.bladeMaster = MeshBuilder.CreateBox(
      "bladeMaster",
      { width: 0.16, height: 0.14, depth: 0.16 },
      scene
    );
    this.bladeMaster.material = this.matBlade;
    this.bladeMaster.isVisible = false;
    this.bladeMaster.isPickable = false;

    let colocadas = 0;
    for (let i = 0; i < 140 && colocadas < 80; i++) {
      const a = (i * 7.13) % (Math.PI * 2);
      const r = 2.6 + ((i * 13.7) % 5.4);
      const bx = Math.cos(a) * r;
      const bz = Math.sin(a) * r;

      // Evitar el camellón central y la zona frontal de estaciones/vereda
      if (Math.abs(bx) < 3.6 && bz > -1.9 && bz < 1.3) continue;
      if (Math.abs(bx) < 4.5 && bz <= -1.1 && bz >= -5.0) continue;

      const b = this.bladeMaster.createInstance(`blade_${colocadas}`);
      b.position.set(bx, 0.055, bz);
      b.scaling.set(0.85 + (i % 3) * 0.2, 0.65 + ((i * 3.3) % 0.7), 0.85 + (i % 2) * 0.25);
      b.rotation.set(0, (i * 1.1) % (Math.PI * 2), 0);
      b.isPickable = false;
      this.bladeInstances.push(b as unknown as Mesh);
      colocadas++;
    }

    // 5. SOL VOXEL CUADRADO Y HALO LUMINOSO
    this.sunNode = new TransformNode("sunNode", scene);
    this.sunMesh = MeshBuilder.CreateBox("sunMesh", { size: 3.1 }, scene);
    this.sunMesh.position.set(-18, 13, -16);
    this.sunMesh.material = this.matSun;
    this.sunMesh.isPickable = false;
    this.sunMesh.parent = this.sunNode;

    this.haloMesh = MeshBuilder.CreateBox("haloMesh", { size: 4.5 }, scene);
    this.haloMesh.position.copyFrom(this.sunMesh.position);
    this.haloMesh.material = this.matHalo;
    this.haloMesh.isPickable = false;
    this.haloMesh.parent = this.sunNode;

    // 6. NUBES VOXEL CÚBICAS DE ESTILO PIXEL-ART
    const defNubes = [
      [-12, 10.5, -8, 1.15],
      [10, 11.5, -12, 1.35],
      [14, 9.8, 6, 1.0],
      [-8, 12.2, 12, 1.25],
    ];
    defNubes.forEach(([x, y, z, s], idx) => {
      const n = new TransformNode(`cloud_${idx}`, scene);
      n.position.set(x, y, z);
      n.scaling.setAll(s);

      const bloques = [
        [0, 0, 0, 3.2, 0.65, 2.0],
        [1.1, 0.35, 0.2, 2.0, 0.55, 1.5],
        [-1.15, -0.08, -0.15, 2.1, 0.50, 1.5],
        [0.15, 0.55, -0.1, 1.6, 0.45, 1.2],
      ];
      bloques.forEach(([bx, by, bz, w, h, d], cIdx) => {
        const box = MeshBuilder.CreateBox(
          `c_${idx}_${cIdx}`,
          { width: w, height: h, depth: d },
          scene
        );
        box.position.set(bx, by, bz);
        box.material = this.matCloud;
        box.isPickable = false;
        box.parent = n;
      });
      this.clouds.push(n);
    });

    // 7. SISTEMA DE LLUVIA PIXELADO
    this.rainSystem = new ParticleSystem("rainSystem", 600, scene);
    const texRain = new DynamicTexture("texRainAmb", { width: 16, height: 64 }, scene, false);
    configurarSamplingPixel(texRain);
    const rCtx = texRain.getContext() as CanvasRenderingContext2D;
    rCtx.fillStyle = "rgba(186, 230, 253, 0.92)";
    rCtx.fillRect(6, 0, 4, 64);
    texRain.update();

    this.rainSystem.particleTexture = texRain;
    this.rainSystem.emitter = new Vector3(0, 15, 0);
    this.rainSystem.minEmitBox = new Vector3(-8, 0, -8);
    this.rainSystem.maxEmitBox = new Vector3(8, 0, 8);
    this.rainSystem.color1 = new Color4(0.7, 0.85, 1.0, 0.85);
    this.rainSystem.color2 = new Color4(0.5, 0.75, 0.95, 0.65);
    this.rainSystem.colorDead = new Color4(0.4, 0.6, 0.9, 0.0);
    this.rainSystem.minSize = 0.14;
    this.rainSystem.maxSize = 0.30;
    this.rainSystem.minLifeTime = 0.6;
    this.rainSystem.maxLifeTime = 1.0;
    this.rainSystem.emitRate = 0;
    this.rainSystem.gravity = new Vector3(0, -22, 0);
    this.rainSystem.direction1 = new Vector3(-0.2, -1, -0.2);
    this.rainSystem.direction2 = new Vector3(0.2, -1, 0.2);
    this.rainSystem.minEmitPower = 8.0;
    this.rainSystem.maxEmitPower = 14.0;
    this.rainSystem.start();
  }

  private crearMat(hex: string, em = 0.40): StandardMaterial {
    const m = new StandardMaterial(`m_${hex}_amb`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(0, 0, 0);
    return m;
  }

  private construirValleVolcanes(): void {
    this.matNieveVolcan = this.crearMat("#f8fafc", 0.82);
    this.paisaje = new PaisajeExterior(this.scene, this.matNieveVolcan);
    this.volcanesMeshes.push(...this.paisaje.meshesMontana);
  }

  /** Cúpula de cielo con degradado azul claro (horizonte pálido → cenit azul cielo). */
  private construirCupulaCielo(): void {
    const tex = new DynamicTexture("texCielo", { width: 8, height: 256 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, "#5fb4ee");   // cenit
    g.addColorStop(0.45, "#8fcdf5");
    g.addColorStop(0.5, "#b9e3fa");   // horizonte
    g.addColorStop(1.0, "#d4eefb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    tex.update();

    this.matCielo = new StandardMaterial("matCupulaCielo", this.scene);
    this.matCielo.diffuseColor = Color3.Black();
    this.matCielo.specularColor = Color3.Black();
    this.matCielo.emissiveTexture = tex;
    this.matCielo.disableLighting = true;
    this.matCielo.backFaceCulling = false;
    this.matCielo.fogEnabled = false;

    const domo = MeshBuilder.CreateSphere("cupulaCielo", { diameter: 900, segments: 24, sideOrientation: Mesh.BACKSIDE }, this.scene);
    domo.material = this.matCielo;
    domo.isPickable = false;
    domo.infiniteDistance = true;
    domo.applyFog = false;
    this.cupulaCielo = domo;
  }

  /** Ajusta la cúpula según la hora (día / atardecer / noche) y la nubosidad. */
  private tintarCielo(nivel: number, tinte: Color3): void {
    if (!this.matCielo || !this.matCielo.emissiveTexture) return;
    this.matCielo.emissiveTexture.level = nivel;
    this.matCielo.emissiveColor = tinte;
  }

  private construirCobertizoLobby(): void {
    const texMadera = crearTexMaderaPixel(this.scene, false, 1, 4);
    const woodMat = crearMaterialPixelTex(this.scene, "matCobertizoMaderaPx", texMadera, "#451a03", 0.18);

    const texTeja = crearTexTejaPixel(this.scene, 4, 2);
    const roofMat = crearMaterialPixelTex(this.scene, "matCobertizoTejaPx", texTeja, "#7c2d12", 0.22);

    const shedRoot = new TransformNode("cobertizoRoot", this.scene);
    shedRoot.position.set(0, 0, -3.8);
    shedRoot.computeWorldMatrix(true);

    // 4 postes cuadrados tipo voxel
    const posPostes = [
      [-1.3, -0.7],
      [1.3, -0.7],
      [-1.3, 0.7],
      [1.3, 0.7],
    ];
    for (let i = 0; i < posPostes.length; i++) {
      const [x, z] = posPostes[i];
      const p = MeshBuilder.CreateBox(
        `posteCobertizo_${i}`,
        { width: 0.15, height: 2.2, depth: 0.15 },
        this.scene
      );
      p.position.set(x, 1.1, z);
      p.material = woodMat;
      p.isPickable = false;
      p.parent = shedRoot;
      registrarCaja(`posteCobertizo_${i}`, x, -3.8 + z, 0.15, 0.15);
      this.shadowGen.addShadowCaster(p);
      p.computeWorldMatrix(true);
      p.freezeWorldMatrix();
    }

    // Vigas horizontales superiores
    for (const zBeam of [-0.7, 0.7]) {
      const viga = MeshBuilder.CreateBox(
        `vigaCobertizo_${zBeam}`,
        { width: 2.8, height: 0.14, depth: 0.16 },
        this.scene
      );
      viga.position.set(0, 2.15, zBeam);
      viga.material = woodMat;
      viga.isPickable = false;
      viga.parent = shedRoot;
      viga.computeWorldMatrix(true);
      viga.freezeWorldMatrix();
    }

    // Tejado escalonado voxel de 3 niveles
    const techoTiers = [
      { w: 3.1, h: 0.14, d: 1.9, y: 2.26 },
      { w: 2.9, h: 0.16, d: 1.25, y: 2.41 },
      { w: 2.75, h: 0.16, d: 0.6, y: 2.57 },
    ];
    techoTiers.forEach((tier, idx) => {
      const t = MeshBuilder.CreateBox(
        `techoCobertizo_${idx}`,
        { width: tier.w, height: tier.h, depth: tier.d },
        this.scene
      );
      t.position.set(0, tier.y, 0);
      t.material = roofMat;
      t.isPickable = false;
      t.parent = shedRoot;
      this.shadowGen.addShadowCaster(t);
      t.computeWorldMatrix(true);
      t.freezeWorldMatrix();
    });

    // Farol pixelado colgante para ambientar amanecer/noche
    const matCadena = this.crearMat("#1e293b", 0.25);
    const farolSoporte = MeshBuilder.CreateBox(
      "farolSoporteCobertizo",
      { width: 0.05, height: 0.16, depth: 0.05 },
      this.scene
    );
    farolSoporte.position.set(0, 2.02, 0.7);
    farolSoporte.material = matCadena;
    farolSoporte.isPickable = false;
    farolSoporte.parent = shedRoot;

    this.matFarolLuz = this.crearMat("#fbbf24", 0.65);
    const farol = MeshBuilder.CreateBox(
      "farolCobertizo",
      { width: 0.16, height: 0.18, depth: 0.16 },
      this.scene
    );
    farol.position.set(0, 1.88, 0.7);
    farol.material = this.matFarolLuz;
    farol.isPickable = false;
    farol.parent = shedRoot;
  }

  /**
   * Añade barda rústica perimetral, vereda de piedra y árboles voxel decorativos.
   */
  private construirDetallesMilpaVoxel(): void {
    const texMaderaClara = crearTexMaderaPixel(this.scene, true, 2, 1);
    const matCerca = crearMaterialPixelTex(this.scene, "matCercaPixel", texMaderaClara, "#4a2c10", 0.16);

    const texMaderaOscura = crearTexMaderaPixel(this.scene, false, 1, 3);
    const matTronco = crearMaterialPixelTex(this.scene, "matTroncoArbolPx", texMaderaOscura, "#3d220a", 0.15);

    const texFollaje = crearTexFollajePixel(this.scene);
    const matCopa = crearMaterialPixelTex(this.scene, "matCopaArbolPx", texFollaje, "#1e4610", 0.18);

    const texPiedra = crearTexPiedraPixel(this.scene, 2, 2);
    const matPiedra = crearMaterialPixelTex(this.scene, "matVeredaPiedraPx", texPiedra, "#334155", 0.16);

    // 1. Vereda de lajas pixeladas uniendo Banco, Cobertizo y Fogón
    for (let x = -3.4; x <= 3.2; x += 0.65) {
      const laja = MeshBuilder.CreateBox(
        `vereda_${x.toFixed(1)}`,
        { width: 0.46, height: 0.025, depth: 0.42 },
        this.scene
      );
      laja.position.set(x, 0.012, -2.35 + ((Math.round(x * 10) % 2) * 0.06));
      laja.material = matPiedra;
      laja.receiveShadows = true;
      laja.isPickable = false;
      laja.freezeWorldMatrix();
    }

    // 2. Barda rústica voxel alrededor del perímetro exterior (±8.4m) con portón abierto al sur (hacia el camino)
    const limitesBarda: Array<[number, number, number, number]> = [
      [-8.4, 8.4, -8.4, 0],   // borde trasero z = -8.4
      [-8.4, -1.4, 8.4, 0],   // borde delantero izq z = 8.4
      [1.4, 8.4, 8.4, 0],     // borde delantero der z = 8.4
      [-8.4, 8.4, -8.4, 1],   // borde izquierdo x = -8.4
      [-8.4, 8.4, 8.4, 1],    // borde derecho x = 8.4
    ];
    limitesBarda.forEach(([minC, maxC, fijo, eje], idx) => {
      const largo = maxC - minC;
      const centro = (minC + maxC) / 2;
      for (const alt of [0.34, 0.66]) {
        const trav = MeshBuilder.CreateBox(
          `bardaTrav_${idx}_${alt}`,
          eje === 0
            ? { width: largo, height: 0.08, depth: 0.07 }
            : { width: 0.07, height: 0.08, depth: largo },
          this.scene
        );
        trav.position.set(eje === 0 ? centro : fijo, alt, eje === 0 ? fijo : centro);
        trav.material = matCerca;
        trav.isPickable = false;
        trav.freezeWorldMatrix();
      }
      for (let c = minC; c <= maxC + 0.01; c += Math.max(1.75, largo / Math.max(1, Math.round(largo / 2.1)))) {
        const poste = MeshBuilder.CreateBox(
          `bardaPoste_${idx}_${c.toFixed(1)}`,
          { width: 0.13, height: 0.92, depth: 0.13 },
          this.scene
        );
        poste.position.set(eje === 0 ? c : fijo, 0.46, eje === 0 ? fijo : c);
        poste.material = matCerca;
        poste.isPickable = false;
        poste.freezeWorldMatrix();
      }
    });
    // Arco del portón hacia la planicie (z = 8.4)
    [-1.4, 1.4].forEach((gx, gIdx) => {
      const pilar = MeshBuilder.CreateBox(`portonPilar_${gIdx}`, { width: 0.22, height: 1.85, depth: 0.22 }, this.scene);
      pilar.position.set(gx, 0.92, 8.4);
      pilar.material = matTronco;
      pilar.isPickable = false;
      pilar.freezeWorldMatrix();
    });
    const dintel = MeshBuilder.CreateBox("portonDintel", { width: 3.1, height: 0.22, depth: 0.26 }, this.scene);
    dintel.position.set(0, 1.85, 8.4);
    dintel.material = matCerca;
    dintel.isPickable = false;
    dintel.freezeWorldMatrix();

    // 3. Árboles voxel decorativos en las 4 esquinas exteriores (sin bloquear cámaras ni estaciones)
    const arboles: Array<[number, number, number]> = [
      [-7.1, 6.2, 1.05],
      [7.0, 6.3, 1.15],
      [-7.2, -6.5, 0.95],
      [7.1, -6.4, 1.10],
    ];
    arboles.forEach(([ax, az, esc], idx) => {
      const raiz = new TransformNode(`arbolVoxel_${idx}`, this.scene);
      raiz.position.set(ax, 0, az);
      raiz.scaling.setAll(esc);

      const tronco = MeshBuilder.CreateBox(
        `troncoVoxel_${idx}`,
        { width: 0.42, height: 1.55, depth: 0.42 },
        this.scene
      );
      tronco.position.y = 0.775;
      tronco.material = matTronco;
      tronco.isPickable = false;
      tronco.parent = raiz;
      registrarCaja(`arbol_${idx}`, ax, az, 0.42 * esc, 0.42 * esc);
      this.shadowGen.addShadowCaster(tronco);

      const copaInf = MeshBuilder.CreateBox(
        `copaInfVoxel_${idx}`,
        { width: 1.65, height: 0.85, depth: 1.65 },
        this.scene
      );
      copaInf.position.y = 1.85;
      copaInf.material = matCopa;
      copaInf.isPickable = false;
      copaInf.parent = raiz;
      this.shadowGen.addShadowCaster(copaInf);

      const copaSup = MeshBuilder.CreateBox(
        `copaSupVoxel_${idx}`,
        { width: 1.10, height: 0.72, depth: 1.10 },
        this.scene
      );
      copaSup.position.y = 2.55;
      copaSup.material = matCopa;
      copaSup.isPickable = false;
      copaSup.parent = raiz;
      this.shadowGen.addShadowCaster(copaSup);
    });
  }

  /**
   * Actualiza la atmósfera, sol, iluminación y encharcamiento en respuesta al clima
   */
  public aplicarClima(clima: ClimateState, metricas: Metricas): void {
    // 1. Orientación solar
    const elev = Math.max(-5, metricas.elevacionSolar);
    const dist = 24.0;
    const radElev = (elev * Math.PI) / 180;
    const radAz = (metricas.azimutSolar * Math.PI) / 180;

    const sunX = dist * Math.cos(radElev) * Math.sin(radAz);
    const sunY = Math.max(1.0, dist * Math.sin(radElev));
    const sunZ = dist * Math.cos(radElev) * Math.cos(radAz);

    this.sunMesh.position.set(sunX, sunY, sunZ);
    this.haloMesh.position.copyFrom(this.sunMesh.position);
    this.sunLight.position.copyFrom(this.sunMesh.position);
    this.sunLight.direction = new Vector3(-sunX, -sunY, -sunZ).normalize();

    // 2. Color del cielo diurno vs nocturno / atardecer
    if (metricas.elevacionSolar < 0) {
      // Noche
      this.scene.clearColor = new Color4(0.08, 0.12, 0.20, 1.0);
      this.tintarCielo(0.10, new Color3(0.02, 0.04, 0.10));
      this.hemiLight.intensity = 0.28;
      this.sunLight.intensity = 0.06;
      this.matSun.diffuseColor = Color3.FromHexString("#cbd5e1");
      this.matSun.emissiveColor = new Color3(0.2, 0.2, 0.25);
      if (this.matFarolLuz) {
        this.matFarolLuz.emissiveColor = Color3.FromHexString("#fbbf24").scale(1.1);
      }
    } else if (metricas.elevacionSolar < 15) {
      // Amanecer / Atardecer
      this.scene.clearColor = new Color4(0.92, 0.72, 0.58, 1.0);
      this.tintarCielo(0.78, new Color3(0.30, 0.14, 0.04));
      this.hemiLight.intensity = 0.65;
      this.sunLight.intensity = 0.55;
      this.matSun.diffuseColor = Color3.FromHexString("#fb923c");
      this.matSun.emissiveColor = new Color3(0.9, 0.4, 0.1);
      if (this.matFarolLuz) {
        this.matFarolLuz.emissiveColor = Color3.FromHexString("#fbbf24").scale(0.85);
      }
    } else {
      // Día pleno despejado o nuboso
      const factorNub = clima.nubosidad / 100;
      const cDia = Color3.Lerp(
        Color3.FromHexString("#9fd3f5"),
        Color3.FromHexString("#94a3b8"),
        factorNub * 0.7
      );
      this.tintarCielo(1.0 - 0.35 * factorNub, new Color3(0.28 * factorNub, 0.30 * factorNub, 0.32 * factorNub));
      this.scene.clearColor = new Color4(cDia.r, cDia.g, cDia.b, 1.0);
      this.hemiLight.intensity = 0.88 - 0.3 * factorNub;
      this.sunLight.intensity = 0.65 - 0.45 * factorNub;
      this.matSun.diffuseColor = Color3.FromHexString("#ffd53a");
      this.matSun.emissiveColor = Color3.FromHexString("#ffd53a");
      if (this.matFarolLuz) {
        this.matFarolLuz.emissiveColor = Color3.FromHexString("#fbbf24").scale(0.45);
      }
    }
    this.scene.fogColor.set(this.scene.clearColor.r, this.scene.clearColor.g, this.scene.clearColor.b);

    // 3. Respuesta visual al encharcamiento (humedad del suelo > 38%)
    if (metricas.encharcamiento > 0.05) {
      this.matPuddle.alpha = Math.min(0.85, metricas.encharcamiento * 0.95);
      this.matMound.diffuseColor = Color3.FromHexString("#4a2e12");
    } else {
      this.matPuddle.alpha = 0.0;
      this.matMound.diffuseColor = Color3.FromHexString("#a17449");
    }

    // 4. Visibilidad de nubes según nubosidad
    const visNubes = clima.nubosidad > 5;
    this.clouds.forEach((c) => c.setEnabled(visNubes));

    // 5. Precipitación / Lluvia dinámica
    if (this.rainSystem) {
      if (clima.lluvia > 0.5) {
        this.rainSystem.emitRate = Math.min(800, clima.lluvia * 22);
        this.rainSystem.gravity.x = clima.viento * 0.9;
      } else {
        this.rainSystem.emitRate = 0;
      }
    }

    // 6. Nieve en los volcanes si hay frío / helada
    if (this.matNieveVolcan) {
      if (clima.temperatura <= 5.0) {
        this.matNieveVolcan.diffuseColor = Color3.FromHexString("#ffffff");
        this.matNieveVolcan.emissiveColor = Color3.FromHexString("#f1f5f9").scale(0.8);
      } else {
        this.matNieveVolcan.diffuseColor = Color3.FromHexString("#94a3b8");
        this.matNieveVolcan.emissiveColor = Color3.FromHexString("#64748b").scale(0.3);
      }
    }
  }

  /**
   * Actualiza visualmente el color de la tierra y charcos según el nivel de agua infantil
   */
  public actualizarHumedadVisual(humedadPorc: number): void {
    const fHum = Math.min(1.0, Math.max(0.0, (humedadPorc - 15) / 70));
    const cTierra = Color3.Lerp(
      Color3.FromHexString("#d6b48a"),
      Color3.FromHexString("#613a18"),
      fHum
    );
    this.matMound.diffuseColor = cTierra;
    this.matMound.emissiveColor = cTierra.scale(0.25);

    if (humedadPorc > 80) {
      this.matPuddle.alpha = Math.min(0.85, (humedadPorc - 80) / 20);
    } else {
      this.matPuddle.alpha = 0.0;
    }
  }

  /**
   * Bucle de animación de nubes con el viento
   */
  public animar(dt: number, vientoMs: number): void {
    const velNubes = dt * (0.2 + 0.3 * (vientoMs / 5.0));
    this.clouds.forEach((c) => {
      c.position.x += velNubes;
      if (c.position.x > 24) {
        c.position.x = -24;
      }
    });
    this.granjaDecorativa.animar(dt, vientoMs);
  }
}
