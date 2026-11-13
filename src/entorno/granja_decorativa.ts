import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import {
  crearMaterialPixelTex,
  crearTexAguaPixel,
  crearTexFollajePixel,
  crearTexMaderaPixel,
  crearTexPastoPixel,
  crearTexPiedraPixel,
  crearTexTejaPixel,
  crearTexTierraSurcoPixel
} from "../ui/texturas_pixel_3d";

interface AnimalDeGranja {
  tipo: "vaca" | "oveja" | "cerdo" | "gallina";
  root: TransformNode;
  cabeza: TransformNode;
  patas: Mesh[];
  centro: Vector3;
  radioX: number;
  radioZ: number;
  fase: number;
  velocidad: number;
}

/**
 * Escenario Decorativo Exterior (Pixel-Art / Voxel)
 *
 * Extiende el mundo más allá de la parcela jugable 18×18 m (barda en ±8.4 m):
 * - Planicie verde continua (~110×110 m) con camino rural, jagüey de agua,
 *   pacas de paja, arbustos y árboles exteriores.
 * - Molino de viento voxel animado que gira según la velocidad del viento.
 * - Animales de granja voxel (vacas, ovejas, cerdos, gallinas) pastando en
 *   potreros estrictamente fuera del área jugable (|x| >= 11 m o |z| >= 11 m).
 */
export class GranjaDecorativa {
  public readonly root: TransformNode;
  private readonly rotorMolino: TransformNode;
  private readonly animales: AnimalDeGranja[] = [];
  private readonly matCache = new Map<string, StandardMaterial>();
  private tiempo = 0;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode("granjaDecorativaRoot", this.scene);

    this.construirPlanicieExterior();
    this.rotorMolino = this.construirMolinoDeViento(new Vector3(14.2, -0.30, 10.8), -2.25);
    this.construirPotrerosYDecoracionExterior();
    this.construirAnimalesDeGranja();
  }

  private mat(hex: string, em = 0.20): StandardMaterial {
    const k = `${hex}_${em.toFixed(2)}`;
    const prev = this.matCache.get(k);
    if (prev) return prev;
    const m = new StandardMaterial(`matGranja_${k}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = Color3.Black();
    this.matCache.set(k, m);
    return m;
  }

  private box(
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vector3,
    material: StandardMaterial,
    parent: TransformNode,
    outline = false
  ): Mesh {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    m.position.copyFrom(pos);
    m.material = material;
    m.isPickable = false;
    m.parent = parent;
    if (outline) {
      m.renderOutline = true;
      m.outlineWidth = 0.015;
      m.outlineColor = Color3.FromHexString("#1e293b");
    }
    return m;
  }

  private construirPlanicieExterior(): void {
    // 1. Planicie continua de pradera pixelada (~110×110 m) ligeramente bajo el podio 18×18
    const texPradera = crearTexPastoPixel(this.scene, 180, 180);
    const matPradera = crearMaterialPixelTex(
      this.scene,
      "matPlaniciePraderaPx",
      texPradera,
      "#295114",
      0.16
    );

    const planicie = MeshBuilder.CreateBox(
      "planicieExterior",
      { width: 420, height: 0.4, depth: 420 },
      this.scene
    );
    planicie.position.set(0, -0.50, 0);
    planicie.material = matPradera;
    planicie.receiveShadows = true;
    planicie.isPickable = false;
    planicie.freezeWorldMatrix();
    planicie.parent = this.root;

    // 2. Zócalo / borde de piedra perimetral del podio 18×18 para transición nítida a la planicie
    const texPiedra = crearTexPiedraPixel(this.scene, 14, 1);
    const matZocalo = crearMaterialPixelTex(this.scene, "matZocaloPodio", texPiedra, "#475569", 0.14);
    [
      { x: 0, z: 9.05, w: 18.3, d: 0.24 },
      { x: 0, z: -9.05, w: 18.3, d: 0.24 },
      { x: 9.05, z: 0, w: 0.24, d: 18.1 },
      { x: -9.05, z: 0, w: 0.24, d: 18.1 }
    ].forEach((b, idx) => {
      const m = this.box(`zocaloPodio_${idx}`, b.w, 0.34, b.d, new Vector3(b.x, -0.16, b.z), matZocalo, this.root);
      m.freezeWorldMatrix();
    });

    // 3. Camino rural de tierra y piedra que sale del huerto hacia la pradera
    const texCamino = crearTexTierraSurcoPixel(this.scene, 2, 12);
    const matCamino = crearMaterialPixelTex(this.scene, "matCaminoRuralPx", texCamino, "#5c3d1e", 0.18);
    const tramo1 = this.box("caminoRural_1", 2.4, 0.04, 18, new Vector3(0, -0.29, 18), matCamino, this.root);
    tramo1.freezeWorldMatrix();
    const tramo2 = this.box("caminoRural_2", 14, 0.04, 2.4, new Vector3(6.2, -0.29, 15.5), matCamino, this.root);
    tramo2.freezeWorldMatrix();

    // 4. Las colinas y montañas suaves ahora las genera PaisajeExterior (ambiente_estilizado)

    // 5. Jagüey / Estanque de agua voxel en el prado derecho (x = 14.5, z = -7.5)
    const texAgua = crearTexAguaPixel(this.scene, 3, 2);
    const matAgua = crearMaterialPixelTex(this.scene, "matEstanquePx", texAgua, "#0e7490", 0.24);
    const espejo = this.box("estanqueAgua", 5.2, 0.05, 3.8, new Vector3(14.5, -0.28, -7.5), matAgua, this.root);
    espejo.freezeWorldMatrix();

    // Borde de piedras y carrizos alrededor del jagüey
    const piedrasPos = [
      [11.8, -7.2],
      [11.9, -9.0],
      [14.5, -9.6],
      [17.2, -8.5],
      [17.1, -6.1],
      [13.4, -5.5]
    ];
    piedrasPos.forEach(([px, pz], idx) => {
      this.box(
        `rocaEstanque_${idx}`,
        0.55,
        0.32,
        0.50,
        new Vector3(px, -0.18, pz),
        matZocalo,
        this.root,
        true
      ).freezeWorldMatrix();
    });
  }

  private construirMolinoDeViento(pos: Vector3, rotY: number): TransformNode {
    const molino = new TransformNode("molinoVientoRoot", this.scene);
    molino.position.copyFrom(pos);
    molino.rotation.y = rotY;
    molino.parent = this.root;

    const texPiedra = crearTexPiedraPixel(this.scene, 2, 2);
    const matPiedra = crearMaterialPixelTex(this.scene, "matMolinoPiedra", texPiedra, "#475569", 0.16);
    const texMadera = crearTexMaderaPixel(this.scene, false, 2, 2);
    const matMadera = crearMaterialPixelTex(this.scene, "matMolinoMadera", texMadera, "#78350f", 0.18);
    const texTeja = crearTexTejaPixel(this.scene, 3, 2);
    const matTeja = crearMaterialPixelTex(this.scene, "matMolinoTeja", texTeja, "#991b1b", 0.22);

    const matMuro = this.mat("#f5f5dc", 0.20);
    const matVentana = this.mat("#fde047", 0.55);
    const matLona = this.mat("#fef3c7", 0.28);

    // Base escalonada de piedra
    this.box("molinoBase1", 3.1, 0.7, 3.1, new Vector3(0, 0.35, 0), matPiedra, molino, true);
    this.box("molinoBase2", 2.7, 1.3, 2.7, new Vector3(0, 1.35, 0), matPiedra, molino, true);

    // Cuerpo principal encalado y vigas de madera
    this.box("molinoCuerpo1", 2.3, 2.3, 2.3, new Vector3(0, 3.15, 0), matMuro, molino, true);
    this.box("molinoCuerpo2", 1.9, 1.5, 1.9, new Vector3(0, 5.05, 0), matMuro, molino, true);

    // Vigas esquineras voxel
    [
      [-1.12, -1.12],
      [1.12, -1.12],
      [-1.12, 1.12],
      [1.12, 1.12]
    ].forEach(([vx, vz], idx) => {
      this.box(`molinoViga_${idx}`, 0.22, 3.8, 0.22, new Vector3(vx, 3.8, vz), matMadera, molino);
    });

    // Puerta y ventanas cálidas
    this.box("molinoPuerta", 0.85, 1.35, 0.15, new Vector3(0, 0.70, 1.38), matMadera, molino, true);
    this.box("molinoVentanaFrente", 0.55, 0.60, 0.14, new Vector3(0, 3.4, 1.16), matVentana, molino, true);
    this.box("molinoVentanaLat", 0.14, 0.55, 0.55, new Vector3(1.16, 3.4, 0), matVentana, molino, true);

    // Tejado escalonado rojo pixel-art
    this.box("molinoTecho1", 2.35, 0.45, 2.35, new Vector3(0, 6.02, 0), matTeja, molino, true);
    this.box("molinoTecho2", 1.65, 0.55, 1.65, new Vector3(0, 6.52, 0), matTeja, molino, true);
    this.box("molinoTecho3", 0.85, 0.45, 0.85, new Vector3(0, 7.02, 0), matTeja, molino, true);

    // Eje y Rotor de Aspas (animado continuamente con el viento)
    this.box("molinoEje", 0.36, 0.36, 0.55, new Vector3(0, 5.25, 1.15), matMadera, molino, true);

    const rotor = new TransformNode("molinoRotor", this.scene);
    rotor.position.set(0, 5.25, 1.46);
    rotor.parent = molino;

    this.box("molinoBuje", 0.42, 0.42, 0.28, new Vector3(0, 0, 0), matMadera, rotor, true);

    // 4 Aspas en cruz estilo Minecraft
    for (let i = 0; i < 4; i++) {
      const brazo = new TransformNode(`molinoBrazo_${i}`, this.scene);
      brazo.rotation.z = (i * Math.PI) / 2;
      brazo.parent = rotor;

      this.box(`molinoMastil_${i}`, 0.16, 3.55, 0.14, new Vector3(0, 1.95, 0), matMadera, brazo, true);
      this.box(`molinoVela_${i}`, 0.78, 2.75, 0.06, new Vector3(0.46, 2.25, 0.03), matLona, brazo, true);
      // Listones transversales de la vela
      for (let t = 0; t < 4; t++) {
        this.box(
          `molinoListon_${i}_${t}`,
          0.84,
          0.08,
          0.10,
          new Vector3(0.46, 1.15 + t * 0.72, 0.02),
          matMadera,
          brazo
        );
      }
    }

    return rotor;
  }

  private construirPotrerosYDecoracionExterior(): void {
    const texMadera = crearTexMaderaPixel(this.scene, true, 2, 1);
    const matMadera = crearMaterialPixelTex(this.scene, "matCorralExt", texMadera, "#92400e", 0.16);
    const texFollaje = crearTexFollajePixel(this.scene);
    const matHoja = crearMaterialPixelTex(this.scene, "matHojaExt", texFollaje, "#1e4610", 0.18);
    const matPaja = this.mat("#eab308", 0.18);

    // Pequeños corrales abiertos fuera de la zona jugable (x=-14 y x=14)
    const corrales = [
      { cx: -14.2, cz: 3.5, rx: 3.2, rz: 4.5 },
      { cx: 13.8, cz: 2.0, rx: 2.8, rz: 3.8 }
    ];
    corrales.forEach((c, cIdx) => {
      const esquinas = [
        [c.cx - c.rx, c.cz - c.rz],
        [c.cx + c.rx, c.cz - c.rz],
        [c.cx + c.rx, c.cz + c.rz],
        [c.cx - c.rx, c.cz + c.rz]
      ];
      esquinas.forEach(([ex, ez], pIdx) => {
        this.box(`posteCorral_${cIdx}_${pIdx}`, 0.18, 0.95, 0.18, new Vector3(ex, 0.16, ez), matMadera, this.root)
          .freezeWorldMatrix();
      });
      // Barandales en 3 lados (abierto visualmente hacia el surco)
      this.box(`barandalCorralN_${cIdx}`, c.rx * 2, 0.10, 0.08, new Vector3(c.cx, 0.42, c.cz + c.rz), matMadera, this.root)
        .freezeWorldMatrix();
      this.box(`barandalCorralS_${cIdx}`, c.rx * 2, 0.10, 0.08, new Vector3(c.cx, 0.42, c.cz - c.rz), matMadera, this.root)
        .freezeWorldMatrix();
    });

    // Pacas de paja pixeladas junto al molino y potreros
    const pacas = [
      [11.6, 8.2],
      [12.3, 8.4],
      [11.9, 8.3, 0.45],
      [-12.2, 7.6],
      [-12.9, 7.8]
    ];
    pacas.forEach((p, idx) => {
      const py = (p[2] ?? 0) - 0.05;
      this.box(`pacaPaja_${idx}`, 0.72, 0.48, 0.56, new Vector3(p[0], py, p[1]), matPaja, this.root, true)
        .freezeWorldMatrix();
    });

    // Árboles voxel y arbustos en la planicie exterior (fuera del patio ±10 m)
    const arbolesExt = [
      [-16.5, -13.5, 1.15],
      [-21.0, 9.0, 1.3],
      [19.5, -13.0, 1.2],
      [18.5, 15.0, 1.25],
      [-7.5, 17.5, 1.1],
      [8.5, 19.5, 1.15],
      [-19.5, -3.5, 1.0],
      [18.5, 1.5, 1.05]
    ];
    arbolesExt.forEach(([ax, az, esc], idx) => {
      const raizA = new TransformNode(`arbolExt_${idx}`, this.scene);
      raizA.position.set(ax, -0.30, az);
      raizA.scaling.setAll(esc);
      raizA.parent = this.root;
      this.box(`troncoExt_${idx}`, 0.48, 1.9, 0.48, new Vector3(0, 0.95, 0), matMadera, raizA, true);
      this.box(`copaExt1_${idx}`, 2.1, 1.15, 2.1, new Vector3(0, 2.25, 0), matHoja, raizA, true);
      this.box(`copaExt2_${idx}`, 1.35, 0.85, 1.35, new Vector3(0, 3.1, 0), matHoja, raizA, true);
    });
  }

  private construirAnimalesDeGranja(): void {
    // Todos los centros están estrictamente en |x| >= 12.2 m o |z| >= 12.0 m (fuera del patio 18×18)
    const specs: Array<{ tipo: AnimalDeGranja["tipo"]; pos: Vector3; rx: number; rz: number; vel: number }> = [
      { tipo: "vaca", pos: new Vector3(-13.8, -0.30, 3.2), rx: 1.5, rz: 1.8, vel: 0.45 },
      { tipo: "vaca", pos: new Vector3(-15.0, -0.30, 5.8), rx: 1.2, rz: 1.4, vel: 0.38 },
      { tipo: "oveja", pos: new Vector3(-13.2, -0.30, -4.5), rx: 1.6, rz: 1.6, vel: 0.55 },
      { tipo: "oveja", pos: new Vector3(-14.6, -0.30, -7.2), rx: 1.4, rz: 1.2, vel: 0.50 },
      { tipo: "cerdo", pos: new Vector3(13.6, -0.30, 1.6), rx: 1.3, rz: 1.5, vel: 0.62 },
      { tipo: "cerdo", pos: new Vector3(14.8, -0.30, 3.4), rx: 1.1, rz: 1.2, vel: 0.58 },
      { tipo: "gallina", pos: new Vector3(12.6, -0.30, 6.2), rx: 1.0, rz: 1.1, vel: 1.15 },
      { tipo: "gallina", pos: new Vector3(13.9, -0.30, 7.3), rx: 0.9, rz: 1.0, vel: 1.25 },
      { tipo: "gallina", pos: new Vector3(-12.5, -0.30, 11.4), rx: 1.2, rz: 0.9, vel: 1.10 }
    ];

    specs.forEach((sp, idx) => {
      const raiz = new TransformNode(`animal_${sp.tipo}_${idx}`, this.scene);
      raiz.position.copyFrom(sp.pos);
      raiz.parent = this.root;

      const cabeza = new TransformNode(`animalCabeza_${idx}`, this.scene);
      cabeza.parent = raiz;

      const patas: Mesh[] = [];
      const matOjo = this.mat("#0f172a", 0.15);

      if (sp.tipo === "vaca") {
        const matPiel = this.mat("#f8fafc", 0.22);
        const matMancha = this.mat(idx % 2 === 0 ? "#451a03" : "#1e293b", 0.18);
        const matCuerno = this.mat("#cbd5e1", 0.2);

        this.box(`vacaCuerpo_${idx}`, 0.72, 0.62, 1.15, new Vector3(0, 0.74, 0), matPiel, raiz, true);
        this.box(`vacaMancha1_${idx}`, 0.75, 0.34, 0.44, new Vector3(0, 0.80, -0.15), matMancha, raiz);
        this.box(`vacaMancha2_${idx}`, 0.32, 0.28, 0.32, new Vector3(0.22, 0.70, 0.32), matMancha, raiz);

        cabeza.position.set(0, 0.92, 0.66);
        this.box(`vacaCab_${idx}`, 0.46, 0.44, 0.42, Vector3.Zero(), matPiel, cabeza, true);
        this.box(`vacaHocico_${idx}`, 0.38, 0.20, 0.12, new Vector3(0, -0.10, 0.22), this.mat("#fda4af", 0.2), cabeza);
        this.box(`vacaCuernoL_${idx}`, 0.09, 0.16, 0.09, new Vector3(-0.22, 0.22, 0.02), matCuerno, cabeza);
        this.box(`vacaCuernoR_${idx}`, 0.09, 0.16, 0.09, new Vector3(0.22, 0.22, 0.02), matCuerno, cabeza);
        this.box(`vacaOjoL_${idx}`, 0.06, 0.06, 0.04, new Vector3(-0.14, 0.06, 0.21), matOjo, cabeza);
        this.box(`vacaOjoR_${idx}`, 0.06, 0.06, 0.04, new Vector3(0.14, 0.06, 0.21), matOjo, cabeza);

        [
          [-0.22, -0.38],
          [0.22, -0.38],
          [-0.22, 0.38],
          [0.22, 0.38]
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`vacaPata_${idx}_${pIdx}`, 0.18, 0.46, 0.18, new Vector3(px, 0.23, pz), matMancha, raiz, true)
          );
        });
      } else if (sp.tipo === "oveja") {
        const matLana = this.mat("#fefce8", 0.25);
        const matCara = this.mat("#334155", 0.18);

        this.box(`ovejaCuerpo_${idx}`, 0.64, 0.56, 0.88, new Vector3(0, 0.60, 0), matLana, raiz, true);
        cabeza.position.set(0, 0.72, 0.52);
        this.box(`ovejaCab_${idx}`, 0.36, 0.34, 0.36, Vector3.Zero(), matCara, cabeza, true);
        this.box(`ovejaCopete_${idx}`, 0.38, 0.14, 0.32, new Vector3(0, 0.18, -0.02), matLana, cabeza);
        this.box(`ovejaOjoL_${idx}`, 0.05, 0.05, 0.04, new Vector3(-0.11, 0.05, 0.18), matOjo, cabeza);
        this.box(`ovejaOjoR_${idx}`, 0.05, 0.05, 0.04, new Vector3(0.11, 0.05, 0.18), matOjo, cabeza);

        [
          [-0.18, -0.26],
          [0.18, -0.26],
          [-0.18, 0.26],
          [0.18, 0.26]
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`ovejaPata_${idx}_${pIdx}`, 0.14, 0.36, 0.14, new Vector3(px, 0.18, pz), matCara, raiz, true)
          );
        });
      } else if (sp.tipo === "cerdo") {
        const matRosa = this.mat("#f9a8d4", 0.22);
        const matHoc = this.mat("#f472b6", 0.24);

        this.box(`cerdoCuerpo_${idx}`, 0.56, 0.48, 0.84, new Vector3(0, 0.48, 0), matRosa, raiz, true);
        cabeza.position.set(0, 0.54, 0.50);
        this.box(`cerdoCab_${idx}`, 0.42, 0.38, 0.38, Vector3.Zero(), matRosa, cabeza, true);
        this.box(`cerdoHocico_${idx}`, 0.24, 0.16, 0.10, new Vector3(0, -0.06, 0.21), matHoc, cabeza, true);
        this.box(`cerdoOjoL_${idx}`, 0.06, 0.06, 0.04, new Vector3(-0.13, 0.06, 0.19), matOjo, cabeza);
        this.box(`cerdoOjoR_${idx}`, 0.06, 0.06, 0.04, new Vector3(0.13, 0.06, 0.19), matOjo, cabeza);

        [
          [-0.17, -0.26],
          [0.17, -0.26],
          [-0.17, 0.26],
          [0.17, 0.26]
        ].forEach(([px, pz], pIdx) => {
          patas.push(
            this.box(`cerdoPata_${idx}_${pIdx}`, 0.14, 0.28, 0.14, new Vector3(px, 0.14, pz), matRosa, raiz, true)
          );
        });
      } else {
        const matPluma = this.mat("#ffffff", 0.28);
        const matPico = this.mat("#f59e0b", 0.28);
        const matCresta = this.mat("#dc2626", 0.28);

        this.box(`gallinaCuerpo_${idx}`, 0.26, 0.24, 0.34, new Vector3(0, 0.26, 0), matPluma, raiz, true);
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
        radioX: sp.rx,
        radioZ: sp.rz,
        fase: idx * 1.4,
        velocidad: sp.vel
      });
    });
  }

  public animar(dt: number, vientoMs: number): void {
    this.tiempo += dt;

    // 1. Giro de aspas del molino proporcional al viento real
    this.rotorMolino.rotation.z += dt * (0.45 + Math.max(0, vientoMs) * 0.15);

    // 2. Caminata / pastoreo suave de los animales en sus potreros exteriores
    for (let i = 0; i < this.animales.length; i++) {
      const a = this.animales[i];
      const ang = this.tiempo * a.velocidad * 0.55 + a.fase;
      const nx = a.centro.x + Math.cos(ang) * a.radioX;
      const nz = a.centro.z + Math.sin(ang * 0.8) * a.radioZ;
      const dx = -Math.sin(ang) * a.radioX;
      const dz = Math.cos(ang * 0.8) * a.radioZ * 0.8;

      a.root.position.set(nx, a.centro.y, nz);
      a.root.rotation.y = Math.atan2(dx, dz);

      // Cabeceo de pastoreo o picoteo
      if (a.tipo === "gallina") {
        a.cabeza.rotation.x = Math.max(0, Math.sin(this.tiempo * 4.5 + a.fase)) * 0.45;
      } else {
        a.cabeza.rotation.x = (0.15 + Math.sin(this.tiempo * 1.2 + a.fase) * 0.22);
      }

      // Balanceo ligero de patas al caminar
      const paso = Math.sin(this.tiempo * a.velocidad * 7.0 + a.fase) * 0.25;
      for (let p = 0; p < a.patas.length; p++) {
        a.patas[p].rotation.x = p % 2 === 0 ? paso : -paso;
      }
    }
  }
}
