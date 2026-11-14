import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector2,
  Vector3,
} from "@babylonjs/core";
import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";
import { esEngineHeadless } from "../estilo_patrix";
import { crearMaterialPatrixPBR, obtenerBancoPatrix } from "../ui/texturas_patrix_pbr";

interface AnimalDeGranja {
  tipo: "vaca" | "oveja" | "cerdo" | "gallina";
  root: TransformNode;
  cabeza: TransformNode;
  patas: Mesh[];
  centro: Vector3;
  rangoX: number;
  rangoZ: number;
  velocidad: number;
  fase: number;
}

/**
 * Entorno rural exterior estilo Patrix + Shader:
 * - Planicie PBR de pradera continua con zócalo de piedra musgosa.
 * - Estanque exterior con reflejos y refracción reales (WaterMaterial + mapa normal).
 * - Molino de viento rústico con estuco encalado, vigas de roble oscuro y techo de paja dorada.
 * - Corrales, pacas, árboles alfa-cutout y animales sombreados físicamente.
 */
export class GranjaDecorativa {
  public readonly root: TransformNode;
  private readonly rotorMolino: TransformNode;
  private readonly animales: AnimalDeGranja[] = [];
  private readonly matCache = new Map<string, PBRMaterial>();
  private aguaMat: WaterMaterial | null = null;
  private espejoAguaMesh: Mesh | null = null;
  private meshesMolinoReflejo: AbstractMesh[] = [];
  private tiempo = 0;

  constructor(
    private readonly scene: Scene,
    private readonly shadowGen: ShadowGenerator | null = null
  ) {
    this.root = new TransformNode("granjaDecorativaRoot", scene);

    this.construirPlanicieExterior();
    this.rotorMolino = this.construirMolinoDeViento(new Vector3(14.2, -0.30, 10.8), -2.25);
    this.construirPotrerosYDecoracionExterior();
    this.construirAnimalesDeGranja();
  }

  /** Vincula cielo, montañas y estructuras para reflejarse en el estanque exterior. */
  public vincularAguaReflectiva(meshes: AbstractMesh[]): void {
    if (!this.aguaMat) return;
    for (const m of meshes) {
      if (m && m !== this.espejoAguaMesh) {
        this.aguaMat.addToRenderList(m);
      }
    }
    for (const m of this.meshesMolinoReflejo) {
      this.aguaMat.addToRenderList(m);
    }
  }

  private matPBRSimple(hex: string, roughness = 0.84): PBRMaterial {
    const k = `${hex}_${roughness.toFixed(2)}`;
    const prev = this.matCache.get(k);
    if (prev) return prev;
    const m = new PBRMaterial(`matGranjaPBR_${k}`, this.scene);
    m.albedoColor = Color3.FromHexString(hex);
    m.metallic = 0.0;
    m.roughness = roughness;
    this.matCache.set(k, m);
    return m;
  }

  private box(
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    mat: PBRMaterial | StandardMaterial | WaterMaterial,
    parent: TransformNode = this.root,
    castShadow = false
  ): Mesh {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    m.position.copyFrom(pos);
    m.material = mat;
    m.parent = parent;
    m.receiveShadows = true;
    m.isPickable = false;
    if (castShadow && this.shadowGen) {
      this.shadowGen.addShadowCaster(m);
    }
    return m;
  }

  private construirPlanicieExterior(): void {
    const matPradera = crearMaterialPatrixPBR(this.scene, "pasto", {
      nombre: "patrixPraderaExterior",
      uScale: 210,
      vScale: 210,
      usarPOM: false,
      albedoColor: new Color3(0.92, 0.98, 0.88),
    });

    const planicie = this.box(
      "planicieExterior",
      420,
      0.40,
      420,
      new Vector3(0, -0.50, 0),
      matPradera,
      this.root
    );
    planicie.freezeWorldMatrix();

    // Zócalo perimetral de piedra musgosa alrededor del patio elevado 18×18
    const matZocalo = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixZocaloCobble",
      uScale: 6,
      vScale: 1,
      cacheable: true,
    });
    [
      { x: 0, z: -9.05, w: 18.2, d: 0.24 },
      { x: 0, z: 9.05, w: 18.2, d: 0.24 },
      { x: 9.05, z: 0, w: 0.24, d: 18.1 },
      { x: -9.05, z: 0, w: 0.24, d: 18.1 },
    ].forEach((b, idx) => {
      const m = this.box(
        `zocaloPodio_${idx}`,
        b.w,
        0.34,
        b.d,
        new Vector3(b.x, -0.16, b.z),
        matZocalo,
        this.root
      );
      m.freezeWorldMatrix();
    });

    // Camino rural terroso hacia el sur y molino
    const matCamino = crearMaterialPatrixPBR(this.scene, "tierra_surco", {
      nombre: "patrixCaminoRural",
      uScale: 2,
      vScale: 10,
      albedoColor: new Color3(1.12, 1.05, 0.94),
    });
    const tramo1 = this.box(
      "caminoRural_1",
      2.4,
      0.04,
      18,
      new Vector3(0, -0.29, 18),
      matCamino,
      this.root
    );
    tramo1.freezeWorldMatrix();
    const tramo2 = this.box(
      "caminoRural_2",
      14,
      0.04,
      2.4,
      new Vector3(6.2, -0.29, 15.5),
      matCamino,
      this.root
    );
    tramo2.freezeWorldMatrix();

    // Lecho somero de guijarros claros para refracción turquesa estilo BSL/Patrix
    const matFondoEstanque = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixFondoEstanque",
      uScale: 3.5,
      vScale: 2.5,
      albedoColor: new Color3(1.18, 1.12, 0.96),
      usarPOM: false,
    });
    const fondoEstanque = this.box(
      "fondoEstanque",
      5.15,
      0.03,
      3.75,
      new Vector3(14.5, -0.29, -7.5),
      matFondoEstanque,
      this.root
    );
    fondoEstanque.freezeWorldMatrix();

    // Estanque exterior con shader de agua reflectiva y olas suaves (fallback PBR en NullEngine)
    const banco = obtenerBancoPatrix(this.scene);
    let matAgua: PBRMaterial | WaterMaterial;
    if (!esEngineHeadless(this.scene)) {
      const wMat = new WaterMaterial(
        "patrixAguaEstanque",
        this.scene,
        new Vector2(512, 512)
      );
      wMat.bumpTexture = banco.aguaNormal;
      wMat.windForce = -2.1;
      wMat.windDirection = new Vector2(1.0, 0.45);
      wMat.waveHeight = 0.015;
      wMat.bumpHeight = 0.10;
      wMat.waveLength = 0.16;
      wMat.waveSpeed = 9;
      wMat.waveCount = 22;
      wMat.waterColor = new Color3(0.14, 0.48, 0.56);
      wMat.colorBlendFactor = 0.18;
      wMat.waterColor2 = new Color3(0.28, 0.64, 0.76);
      wMat.colorBlendFactor2 = 0.16;
      wMat.fresnelSeparate = true;
      wMat.bumpAffectsReflection = true;
      wMat.specularColor = new Color3(1.0, 0.96, 0.88);
      wMat.specularPower = 110;
      wMat.addToRenderList(planicie);
      wMat.addToRenderList(fondoEstanque);
      this.aguaMat = wMat;
      matAgua = wMat;
    } else {
      const pbrAgua = new PBRMaterial("patrixAguaFallback", this.scene);
      pbrAgua.albedoColor = new Color3(0.16, 0.48, 0.56);
      pbrAgua.bumpTexture = banco.aguaNormal;
      pbrAgua.metallic = 0.15;
      pbrAgua.roughness = 0.06;
      matAgua = pbrAgua;
    }

    const espejo = MeshBuilder.CreateGround(
      "estanqueAgua",
      { width: 5.2, height: 3.8, subdivisions: 16 },
      this.scene
    );
    espejo.position.set(14.5, -0.23, -7.5);
    espejo.material = matAgua;
    espejo.parent = this.root;
    espejo.receiveShadows = true;
    espejo.isPickable = false;
    espejo.freezeWorldMatrix();
    this.espejoAguaMesh = espejo;

    // Borde segmentado de piedras musgosas (UV cúbico 1:1 sin estiramiento) alrededor del estanque
    const matPiedra = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixPiedraEstanque",
      uScale: 0.75,
      vScale: 0.35,
      cacheable: true,
    });
    const agregarBorde = (ox: number, oz: number, ow: number, oh: number, od: number, id: string) => {
      const p = this.box(id, ow, oh, od, new Vector3(ox, -0.22 + (oh - 0.22) * 0.5, oz), matPiedra, this.root, true);
      p.freezeWorldMatrix();
      this.aguaMat?.addToRenderList(p);
    };
    const pasosX = 7;
    const largoSegX = 5.6 / pasosX;
    for (let i = 0; i < pasosX; i++) {
      const x = 14.5 - 2.8 + largoSegX * (i + 0.5);
      const h = 0.20 + ((i * 7) % 3) * 0.03;
      agregarBorde(x, -9.5, largoSegX - 0.03, h, 0.38, `piedraEstN_${i}`);
      agregarBorde(x, -5.5, largoSegX - 0.03, h, 0.38, `piedraEstS_${i}`);
    }
    const pasosZ = 5;
    const largoSegZ = 3.9 / pasosZ;
    for (let i = 0; i < pasosZ; i++) {
      const z = -7.5 - 1.95 + largoSegZ * (i + 0.5);
      const h = 0.21 + ((i * 5) % 3) * 0.03;
      agregarBorde(11.8, z, 0.38, h, largoSegZ - 0.03, `piedraEstO_${i}`);
      agregarBorde(17.2, z, 0.38, h, largoSegZ - 0.03, `piedraEstE_${i}`);
    }
  }

  private construirMolinoDeViento(pos: Vector3, rotY: number): TransformNode {
    const molino = new TransformNode("molinoVientoRoot", this.scene);
    molino.position.copyFrom(pos);
    molino.rotation.y = rotY;
    molino.parent = this.root;

    const matPiedra = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixMolinoPiedra",
      uScale: 2,
      vScale: 2,
      cacheable: true,
    });
    const matMuro = crearMaterialPatrixPBR(this.scene, "estuco_cal", {
      nombre: "patrixMolinoEstuco",
      uScale: 2,
      vScale: 2,
      cacheable: true,
    });
    const matMadera = crearMaterialPatrixPBR(this.scene, "madera_oscura", {
      nombre: "patrixMolinoMadera",
      uScale: 1,
      vScale: 2,
      cacheable: true,
    });
    const matTeja = crearMaterialPatrixPBR(this.scene, "techo_paja", {
      nombre: "patrixMolinoTechoPaja",
      uScale: 2,
      vScale: 2,
      cacheable: true,
    });
    const matLona = crearMaterialPatrixPBR(this.scene, "estuco_cal", {
      nombre: "patrixMolinoLona",
      uScale: 1,
      vScale: 3,
      albedoColor: new Color3(1.04, 1.0, 0.90),
    });

    const matVentana = new StandardMaterial("matVentanaMolino", this.scene);
    matVentana.diffuseColor = new Color3(1.0, 0.78, 0.35);
    matVentana.emissiveColor = new Color3(1.0, 0.68, 0.24).scale(1.1);
    matVentana.metadata = { patrixSkip: true, esEmisivoReal: true };

    // Base escalonada de mampostería
    this.meshesMolinoReflejo.push(
      this.box("molinoBase1", 3.1, 0.7, 3.1, new Vector3(0, 0.35, 0), matPiedra, molino, true),
      this.box("molinoBase2", 2.7, 1.3, 2.7, new Vector3(0, 1.35, 0), matPiedra, molino, true),
      this.box("molinoCuerpo1", 2.3, 2.3, 2.3, new Vector3(0, 3.15, 0), matMuro, molino, true),
      this.box("molinoCuerpo2", 1.9, 1.5, 1.9, new Vector3(0, 5.05, 0), matMuro, molino, true)
    );

    // Vigas esquineras de entramado rústico
    [
      [-1.12, -1.12],
      [1.12, -1.12],
      [-1.12, 1.12],
      [1.12, 1.12],
    ].forEach(([vx, vz], idx) => {
      this.meshesMolinoReflejo.push(
        this.box(`molinoViga_${idx}`, 0.22, 3.8, 0.22, new Vector3(vx, 3.8, vz), matMadera, molino, true)
      );
    });

    // Puerta y ventanas cálidas
    this.box("molinoPuerta", 0.85, 1.35, 0.15, new Vector3(0, 0.70, 1.38), matMadera, molino, true);
    this.box("molinoVentanaFrente", 0.55, 0.60, 0.14, new Vector3(0, 3.4, 1.16), matVentana, molino);
    this.box("molinoVentanaLat", 0.14, 0.55, 0.55, new Vector3(1.16, 3.4, 0), matVentana, molino);

    // Techo escalonado de paja dorada Patrix
    this.meshesMolinoReflejo.push(
      this.box("molinoTecho1", 2.35, 0.45, 2.35, new Vector3(0, 6.02, 0), matTeja, molino, true),
      this.box("molinoTecho2", 1.65, 0.55, 1.65, new Vector3(0, 6.52, 0), matTeja, molino, true),
      this.box("molinoTecho3", 0.85, 0.45, 0.85, new Vector3(0, 7.02, 0), matTeja, molino, true)
    );

    // Eje y rotor animado
    this.box("molinoEje", 0.36, 0.36, 0.55, new Vector3(0, 5.25, 1.15), matMadera, molino, true);

    const rotor = new TransformNode("molinoRotor", this.scene);
    rotor.position.set(0, 5.25, 1.46);
    rotor.parent = molino;

    this.box("molinoBuje", 0.42, 0.42, 0.28, new Vector3(0, 0, 0), matMadera, rotor, true);

    for (let i = 0; i < 4; i++) {
      const brazo = new TransformNode(`molinoBrazo_${i}`, this.scene);
      brazo.rotation.z = (i * Math.PI) / 2;
      brazo.parent = rotor;

      this.box(`molinoMastil_${i}`, 0.16, 3.55, 0.14, new Vector3(0, 1.95, 0), matMadera, brazo, true);
      this.box(`molinoVela_${i}`, 0.78, 2.75, 0.06, new Vector3(0.46, 2.25, 0.03), matLona, brazo, true);
      for (let t = 0; t < 4; t++) {
        this.box(
          `molinoTravesano_${i}_${t}`,
          0.90,
          0.08,
          0.10,
          new Vector3(0.42, 1.1 + t * 0.78, 0),
          matMadera,
          brazo
        );
      }
    }

    return rotor;
  }

  private construirPotrerosYDecoracionExterior(): void {
    const matMadera = crearMaterialPatrixPBR(this.scene, "madera_roble", {
      nombre: "patrixCorralRoble",
      uScale: 2,
      vScale: 1,
      cacheable: true,
    });
    const matPaja = crearMaterialPatrixPBR(this.scene, "paja_paca", {
      nombre: "patrixPacaPaja",
      uScale: 1,
      vScale: 1,
      albedoColor: new Color3(1.12, 1.04, 0.85),
    });
    const matCorteza = crearMaterialPatrixPBR(this.scene, "tronco_corteza", {
      nombre: "patrixExtCorteza",
      uScale: 1,
      vScale: 2,
      cacheable: true,
    });
    const matHoja = crearMaterialPatrixPBR(this.scene, "follaje_roble", {
      nombre: "patrixExtHoja",
      uScale: 1,
      vScale: 1,
      usarPOM: false,
      cacheable: true,
    });

    const corrales = [
      { cx: -14.2, cz: 3.5, rx: 3.2, rz: 4.5 },
      { cx: 13.8, cz: 2.0, rx: 2.8, rz: 3.8 },
    ];
    corrales.forEach((c, cIdx) => {
      const esquinas = [
        [c.cx - c.rx, c.cz - c.rz],
        [c.cx + c.rx, c.cz - c.rz],
        [c.cx + c.rx, c.cz + c.rz],
        [c.cx - c.rx, c.cz + c.rz],
      ];
      esquinas.forEach(([ex, ez], pIdx) => {
        this.box(
          `posteCorral_${cIdx}_${pIdx}`,
          0.18,
          0.95,
          0.18,
          new Vector3(ex, 0.16, ez),
          matMadera,
          this.root,
          true
        ).freezeWorldMatrix();
      });

      this.box(
        `barandalCorralN_${cIdx}`,
        c.rx * 2,
        0.10,
        0.08,
        new Vector3(c.cx, 0.42, c.cz + c.rz),
        matMadera,
        this.root
      ).freezeWorldMatrix();
      this.box(
        `barandalCorralS_${cIdx}`,
        c.rx * 2,
        0.10,
        0.08,
        new Vector3(c.cx, 0.42, c.cz - c.rz),
        matMadera,
        this.root
      ).freezeWorldMatrix();
    });

    // Pacas de paja exteriores
    const pacas = [
      [11.6, 8.2],
      [12.3, 8.4],
      [11.9, 8.3, 0.45],
      [-12.2, 7.6],
      [-12.9, 7.8],
    ];
    pacas.forEach((p, idx) => {
      const py = (p[2] ?? 0) - 0.05;
      this.box(
        `pacaPaja_${idx}`,
        0.72,
        0.48,
        0.56,
        new Vector3(p[0], py, p[1]),
        matPaja,
        this.root,
        true
      ).freezeWorldMatrix();
    });

    // Árboles dispersos en la pradera con copas alfa-cutout traslúcidas
    const arbolesExt: Array<[number, number, number]> = [
      [-16.5, -13.5, 1.15],
      [-21.0, 9.0, 1.3],
      [19.5, -13.0, 1.2],
      [18.5, 15.0, 1.25],
      [-7.5, 17.5, 1.1],
      [8.5, 19.5, 1.15],
      [-19.5, -3.5, 1.0],
      [18.5, 1.5, 1.05],
    ];
    arbolesExt.forEach(([ax, az, esc], idx) => {
      const raizA = new TransformNode(`arbolExt_${idx}`, this.scene);
      raizA.position.set(ax, -0.30, az);
      raizA.scaling.setAll(esc);
      raizA.parent = this.root;

      const tronco = MeshBuilder.CreateCylinder(
        `troncoExt_${idx}`,
        { diameterTop: 0.36, diameterBottom: 0.56, height: 1.95, tessellation: 7 },
        this.scene
      );
      tronco.position.set(0, 0.96, 0);
      tronco.material = matCorteza;
      tronco.parent = raizA;
      tronco.receiveShadows = true;
      this.shadowGen?.addShadowCaster(tronco);

      const c1 = this.box(`copaExt1_${idx}`, 2.2, 1.2, 2.2, new Vector3(0, 2.28, 0), matHoja, raizA, true);
      c1.rotation.y = idx * 0.6;
      const c2 = this.box(`copaExt2_${idx}`, 1.45, 0.9, 1.45, new Vector3(0, 3.08, 0), matHoja, raizA, true);
      c2.rotation.y = idx * 0.6 + 0.5;
    });
  }

  private construirAnimalesDeGranja(): void {
    const specs: Array<{
      tipo: AnimalDeGranja["tipo"];
      pos: Vector3;
      rx: number;
      rz: number;
      vel: number;
    }> = [
      { tipo: "vaca", pos: new Vector3(-13.8, -0.30, 3.2), rx: 1.5, rz: 1.8, vel: 0.45 },
      { tipo: "vaca", pos: new Vector3(-15.0, -0.30, 5.8), rx: 1.2, rz: 1.4, vel: 0.38 },
      { tipo: "oveja", pos: new Vector3(-13.2, -0.30, -4.5), rx: 1.6, rz: 1.6, vel: 0.55 },
      { tipo: "oveja", pos: new Vector3(-14.6, -0.30, -7.2), rx: 1.4, rz: 1.2, vel: 0.50 },
      { tipo: "cerdo", pos: new Vector3(13.6, -0.30, 1.6), rx: 1.3, rz: 1.5, vel: 0.62 },
      { tipo: "cerdo", pos: new Vector3(14.8, -0.30, 3.4), rx: 1.1, rz: 1.2, vel: 0.58 },
      { tipo: "gallina", pos: new Vector3(12.6, -0.30, 6.2), rx: 1.0, rz: 1.1, vel: 1.15 },
      { tipo: "gallina", pos: new Vector3(13.9, -0.30, 7.3), rx: 0.9, rz: 1.0, vel: 1.25 },
      { tipo: "gallina", pos: new Vector3(-12.5, -0.30, 11.4), rx: 1.2, rz: 0.9, vel: 1.10 },
    ];

    specs.forEach((sp, idx) => {
      const raiz = new TransformNode(`animal_${sp.tipo}_${idx}`, this.scene);
      raiz.position.copyFrom(sp.pos);
      raiz.parent = this.root;

      const cabeza = new TransformNode(`animalCabeza_${idx}`, this.scene);
      cabeza.parent = raiz;

      const patas: Mesh[] = [];
      const matOjo = this.matPBRSimple("#18181b", 0.35);

      if (sp.tipo === "vaca") {
        const matPiel = this.matPBRSimple("#edeae2", 0.85);
        const matMancha = this.matPBRSimple("#362b22", 0.88);
        const matCuerno = this.matPBRSimple("#d6ccb8", 0.55);

        this.box(`vacaCuerpo_${idx}`, 0.72, 0.62, 1.15, new Vector3(0, 0.74, 0), matPiel, raiz, true);
        this.box(`vacaMancha1_${idx}`, 0.75, 0.34, 0.44, new Vector3(0, 0.80, -0.15), matMancha, raiz);
        this.box(`vacaMancha2_${idx}`, 0.32, 0.28, 0.32, new Vector3(0.22, 0.70, 0.32), matMancha, raiz);

        cabeza.position.set(0, 0.92, 0.66);
        this.box(`vacaCab_${idx}`, 0.46, 0.44, 0.42, Vector3.Zero(), matPiel, cabeza, true);
        this.box(`vacaHocico_${idx}`, 0.38, 0.20, 0.12, new Vector3(0, -0.10, 0.22), this.matPBRSimple("#dba1a5", 0.72), cabeza);
        this.box(`vacaCuernoL_${idx}`, 0.09, 0.16, 0.09, new Vector3(-0.22, 0.22, 0.02), matCuerno, cabeza);
        this.box(`vacaCuernoR_${idx}`, 0.09, 0.16, 0.09, new Vector3(0.22, 0.22, 0.02), matCuerno, cabeza);
        this.box(`vacaOjoL_${idx}`, 0.06, 0.06, 0.04, new Vector3(-0.14, 0.06, 0.21), matOjo, cabeza);
        this.box(`vacaOjoR_${idx}`, 0.06, 0.06, 0.04, new Vector3(0.14, 0.06, 0.21), matOjo, cabeza);

        [
          [-0.22, 0.38],
          [0.22, 0.38],
          [-0.22, -0.38],
          [0.22, -0.38],
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`vacaPata_${idx}_${pIdx}`, 0.18, 0.46, 0.18, new Vector3(px, 0.23, pz), matMancha, raiz, true)
          );
        });
      } else if (sp.tipo === "oveja") {
        const matLana = this.matPBRSimple("#e8e4da", 0.96);
        const matCara = this.matPBRSimple("#c7b8a3", 0.85);

        this.box(`ovejaCuerpo_${idx}`, 0.64, 0.56, 0.88, new Vector3(0, 0.60, 0), matLana, raiz, true);
        cabeza.position.set(0, 0.72, 0.52);
        this.box(`ovejaCab_${idx}`, 0.36, 0.34, 0.36, Vector3.Zero(), matCara, cabeza, true);
        this.box(`ovejaCopete_${idx}`, 0.38, 0.14, 0.32, new Vector3(0, 0.18, -0.02), matLana, cabeza);
        this.box(`ovejaOjoL_${idx}`, 0.05, 0.05, 0.04, new Vector3(-0.11, 0.05, 0.18), matOjo, cabeza);
        this.box(`ovejaOjoR_${idx}`, 0.05, 0.05, 0.04, new Vector3(0.11, 0.05, 0.18), matOjo, cabeza);

        [
          [-0.18, 0.28],
          [0.18, 0.28],
          [-0.18, -0.28],
          [0.18, -0.28],
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`ovejaPata_${idx}_${pIdx}`, 0.14, 0.36, 0.14, new Vector3(px, 0.18, pz), matCara, raiz, true)
          );
        });
      } else if (sp.tipo === "cerdo") {
        const matRosa = this.matPBRSimple("#d89a9c", 0.78);
        const matTrompa = this.matPBRSimple("#c47c7f", 0.72);

        this.box(`cerdoCuerpo_${idx}`, 0.56, 0.48, 0.84, new Vector3(0, 0.48, 0), matRosa, raiz, true);
        cabeza.position.set(0, 0.54, 0.50);
        this.box(`cerdoCab_${idx}`, 0.42, 0.40, 0.38, Vector3.Zero(), matRosa, cabeza, true);
        this.box(`cerdoHocico_${idx}`, 0.22, 0.16, 0.10, new Vector3(0, -0.04, 0.22), matTrompa, cabeza);
        this.box(`cerdoOjoL_${idx}`, 0.05, 0.05, 0.04, new Vector3(-0.14, 0.07, 0.19), matOjo, cabeza);
        this.box(`cerdoOjoR_${idx}`, 0.05, 0.05, 0.04, new Vector3(0.14, 0.07, 0.19), matOjo, cabeza);

        [
          [-0.17, 0.26],
          [0.17, 0.26],
          [-0.17, -0.26],
          [0.17, -0.26],
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`cerdoPata_${idx}_${pIdx}`, 0.15, 0.28, 0.15, new Vector3(px, 0.14, pz), matRosa, raiz, true)
          );
        });
      } else {
        const matPluma = this.matPBRSimple("#efeadd", 0.88);
        const matCresta = this.matPBRSimple("#b82924", 0.74);
        const matPico = this.matPBRSimple("#d49b2a", 0.68);

        this.box(`gallinaCuerpo_${idx}`, 0.28, 0.26, 0.36, new Vector3(0, 0.26, 0), matPluma, raiz, true);
        this.box(`gallinaAlaL_${idx}`, 0.05, 0.16, 0.24, new Vector3(-0.16, 0.26, 0), matPluma, raiz);
        this.box(`gallinaAlaR_${idx}`, 0.05, 0.16, 0.24, new Vector3(0.16, 0.26, 0), matPluma, raiz);
        cabeza.position.set(0, 0.40, 0.18);
        this.box(`gallinaCab_${idx}`, 0.18, 0.20, 0.18, Vector3.Zero(), matPluma, cabeza, true);
        this.box(`gallinaCresta_${idx}`, 0.06, 0.08, 0.12, new Vector3(0, 0.13, 0), matCresta, cabeza);
        this.box(`gallinaPico_${idx}`, 0.08, 0.06, 0.10, new Vector3(0, -0.01, 0.12), matPico, cabeza);

        [-0.07, 0.07].forEach((px, pIdx) => {
          patas.push(
            this.box(`gallinaPata_${idx}_${pIdx}`, 0.05, 0.16, 0.05, new Vector3(px, 0.08, 0), matPico, raiz)
          );
        });
      }

      this.animales.push({
        tipo: sp.tipo,
        root: raiz,
        cabeza,
        patas,
        centro: sp.pos.clone(),
        rangoX: sp.rx,
        rangoZ: sp.rz,
        velocidad: sp.vel,
        fase: idx * 1.37,
      });
    });
  }

  /** Adapta reflejos del estanque exterior, oleaje y luces de las ventanas del molino según hora y clima. */
  public actualizarAtmosfera(
    factorNoche: number,
    factorCrepusculo: number,
    factorNub: number,
    vientoMs: number,
    colorLuz: Color3
  ): void {
    const matVentana = this.scene.getMaterialByName("matVentanaMolino") as StandardMaterial | null;
    if (matVentana) {
      const glow = 0.18 + Math.max(factorCrepusculo * 0.9, factorNoche * 1.45) + factorNub * 0.25;
      matVentana.emissiveColor.set(1.0 * glow, 0.70 * glow, 0.28 * glow);
    }

    if (this.aguaMat) {
      const kOscuro = Math.min(1, factorNoche * 0.85 + factorNub * 0.25);
      const diaCol1 = new Color3(0.14, 0.48, 0.56);
      const crepCol1 = new Color3(0.46, 0.36, 0.44);
      const nocheCol1 = new Color3(0.09, 0.18, 0.34);

      const base1 = Color3.Lerp(diaCol1, crepCol1, factorCrepusculo);
      const fin1 = Color3.Lerp(base1, nocheCol1, kOscuro);

      const diaCol2 = new Color3(0.28, 0.64, 0.76);
      const crepCol2 = new Color3(0.76, 0.52, 0.48);
      const nocheCol2 = new Color3(0.16, 0.30, 0.52);

      const base2 = Color3.Lerp(diaCol2, crepCol2, factorCrepusculo);
      const fin2 = Color3.Lerp(base2, nocheCol2, kOscuro);

      this.aguaMat.waterColor.copyFrom(fin1);
      this.aguaMat.waterColor2.copyFrom(fin2);
      this.aguaMat.colorBlendFactor = 0.18 + factorCrepusculo * 0.10 + factorNoche * 0.12;
      this.aguaMat.colorBlendFactor2 = 0.16 + factorCrepusculo * 0.10 + factorNoche * 0.10;
      this.aguaMat.specularColor.copyFrom(colorLuz);
      this.aguaMat.specularPower = 72 + factorNoche * 48;
      this.aguaMat.windForce = -(1.3 + Math.min(2.2, Math.max(0, vientoMs) * 0.22));
      this.aguaMat.waveHeight = 0.015 + Math.min(0.018, Math.max(0, vientoMs) * 0.0012);
    }
  }

  public animar(dt: number, vientoMs: number): void {
    this.tiempo += dt;

    this.rotorMolino.rotation.z += dt * (0.45 + Math.max(0, vientoMs) * 0.15);

    for (let i = 0; i < this.animales.length; i++) {
      const a = this.animales[i];
      const ang = this.tiempo * a.velocidad + a.fase;
      const nx = a.centro.x + Math.sin(ang) * a.rangoX;
      const nz = a.centro.z + Math.cos(ang * 0.8) * a.rangoZ;
      const dx = Math.cos(ang) * a.rangoX * a.velocidad;
      const dz = -Math.sin(ang * 0.8) * a.rangoZ * a.velocidad * 0.8;

      a.root.position.set(nx, a.centro.y, nz);
      a.root.rotation.y = Math.atan2(dx, dz);

      if (a.tipo === "gallina") {
        a.cabeza.rotation.x = Math.max(0, Math.sin(this.tiempo * 4.5 + a.fase)) * 0.45;
      } else {
        a.cabeza.rotation.x = Math.max(0, Math.sin(this.tiempo * 1.2 + a.fase) - 0.3) * 0.42;
      }

      const paso = Math.sin(this.tiempo * (4.0 + a.velocidad * 3) + a.fase) * 0.25;
      a.patas.forEach((p, pIdx) => {
        p.rotation.x = pIdx % 2 === 0 ? paso : -paso;
      });
    }
  }
}
