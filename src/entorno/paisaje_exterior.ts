import {
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { crearMaterialPatrixPBR } from "../ui/texturas_patrix_pbr";

interface OpcionesPico {
  radio: number;
  alto: number;
  tess: number;
  niveles: number;
  semilla: number;
  perfil: "pico" | "domo";
  rugosidad: number;
  nieveDesde: number | null;
  colorBase: string[];
  neblina: number;
}

function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hex(h: string): Color3 {
  return Color3.FromHexString(h);
}

function construirMallaMataExterior(scene: Scene, nombre: string): Mesh {
  const posiciones: number[] = [];
  const normales: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const angulos = [0, (2 * Math.PI) / 3];
  const ancho = 0.56;
  const alto = 0.52;

  angulos.forEach((ang, idx) => {
    const dx = Math.cos(ang) * ancho * 0.5;
    const dz = Math.sin(ang) * ancho * 0.5;
    const base = idx * 4;
    posiciones.push(-dx, 0, -dz, dx, 0, dz, dx, alto, dz, -dx, alto, -dz);
    for (let k = 0; k < 4; k++) normales.push(0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const m = new Mesh(nombre, scene);
  const vd = new VertexData();
  vd.positions = posiciones;
  vd.normals = normales;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(m);
  return m;
}

function construirPico(scene: Scene, nombre: string, o: OpcionesPico): Mesh {
  const { tess: T, niveles: L } = o;
  const posiciones: number[] = [];
  const colores: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const paleta = o.colorBase.map(hex);
  const azulAtmos = hex("#9bb7d4");
  const escalaNieve = o.nieveDesde !== null ? 1.018 : 1.0;
  const lInicio = o.nieveDesde !== null ? o.nieveDesde : 0;

  const anillo: number[] = [];
  for (let l = lInicio; l <= L; l++) {
    const t = l / L;
    const base = o.perfil === "pico" ? 1 - t : Math.sqrt(Math.max(0, 1 - t * t));
    for (let i = 0; i < T; i++) {
      const ang = (i / T) * Math.PI * 2;
      const ruido = rnd(o.semilla * 31 + i * 7.3 + l * 3.1);
      const cresta =
        1 +
        o.rugosidad *
          (0.55 * Math.sin(ang * 3 + o.semilla) + 0.45 * Math.sin(ang * 5 + o.semilla * 2.1));
      const r =
        l === L ? 0 : o.radio * base * cresta * (1 + (ruido - 0.5) * o.rugosidad * 0.7);
      const angJ = ang + (rnd(o.semilla * 17 + i + l * 5) - 0.5) * 0.18;
      const yJ =
        t * o.alto +
        (l > 0 && l < L ? (rnd(o.semilla * 13 + i * 2 + l) - 0.5) * o.alto * 0.05 : 0);

      posiciones.push(Math.cos(angJ) * r * escalaNieve, yJ, Math.sin(angJ) * r * escalaNieve);
      uvs.push((i / T) * 4, t * 3);

      if (o.nieveDesde === null) {
        const k = Math.min(paleta.length - 1, t * (paleta.length - 1));
        const i0 = Math.floor(k);
        const i1 = Math.min(paleta.length - 1, i0 + 1);
        const f = k - i0;
        const var_ = 0.88 + rnd(o.semilla * 5 + i * 1.7 + l * 9.1) * 0.24;
        const c = Color3.Lerp(paleta[i0], paleta[i1], f).scale(var_);
        const cf = Color3.Lerp(c, azulAtmos, o.neblina * (0.65 - 0.45 * t));
        colores.push(clamp01(cf.r), clamp01(cf.g), clamp01(cf.b), 1);
      }
      if (l === L) break;
    }
    anillo.push(l);
  }

  const filas = L - lInicio + 1;
  for (let f = 0; f < filas - 2; f++) {
    for (let i = 0; i < T; i++) {
      const a = f * T + i;
      const b = f * T + ((i + 1) % T);
      const c = (f + 1) * T + i;
      const d = (f + 1) * T + ((i + 1) % T);
      indices.push(a, c, b, b, c, d);
    }
  }
  if (anillo.length >= 2) {
    const fUlt = filas - 2;
    const centro = posiciones.length / 3 - 1;
    for (let i = 0; i < T; i++) {
      const a = fUlt * T + i;
      const b = fUlt * T + ((i + 1) % T);
      indices.push(a, centro, b);
    }
  }

  const m = new Mesh(nombre, scene);
  const vd = new VertexData();
  vd.positions = posiciones;
  vd.indices = indices;
  vd.uvs = uvs;
  const normales: number[] = [];
  VertexData.ComputeNormals(posiciones, indices, normales);
  vd.normals = normales;
  if (o.nieveDesde === null) vd.colors = colores;
  vd.applyToMesh(m);
  m.convertToFlatShadedMesh();
  m.isPickable = false;
  return m;
}

/**
 * Paisaje alpino exterior estilo Patrix + Shader:
 * - Cordilleras con mapa normal rocoso PBR y cumbres nevadas.
 * - Colinas de pradera oliva y bosque de abetos con texturas de agujas alfa-cutout.
 * - Matas silvestres en planos cruzados y rocas musgosas.
 */
export class PaisajeExterior {
  public readonly root: TransformNode;
  public readonly matNieve: Material;
  public readonly meshesMontana: Mesh[] = [];
  private readonly matVertex: PBRMaterial;
  private readonly matCache = new Map<string, PBRMaterial>();

  constructor(
    private readonly scene: Scene,
    matNieve: Material,
    private readonly shadowGen: ShadowGenerator | null = null
  ) {
    this.root = new TransformNode("paisajeExterior", scene);
    this.matNieve = matNieve;

    // PBR rocoso con vertex colors multiplicados sobre detalle mineral
    this.matVertex = crearMaterialPatrixPBR(scene, "piedra_montana", {
      nombre: "patrixMontanaVertexPBR",
      uScale: 4,
      vScale: 4,
      usarPOM: false,
      albedoColor: Color3.White(),
    });
    this.matVertex.roughness = 0.92;

    this.construirMontanas();
    this.construirColinas();
    this.construirBosqueDePinos();
    this.construirFloresPastoYRocas();
  }

  private matSimple(h: string, roughness = 0.85): PBRMaterial {
    const k = `${h}_${roughness.toFixed(2)}`;
    let m = this.matCache.get(k);
    if (!m) {
      m = new PBRMaterial(`matPaisajePBR_${k}`, this.scene);
      m.albedoColor = Color3.FromHexString(h);
      m.metallic = 0;
      m.roughness = roughness;
      this.matCache.set(k, m);
    }
    return m;
  }

  private construirMontanas(): void {
    const coloresMontana = ["#6e9146", "#819f54", "#98968e", "#b5b3ad", "#d7d8d5"];
    let idx = 0;

    const anillos = [
      { n: 12, rMin: 84, rMax: 106, hMin: 24, hMax: 38, radioK: 0.68, neblina: 0.16 },
      { n: 15, rMin: 132, rMax: 165, hMin: 42, hMax: 66, radioK: 0.72, neblina: 0.34 },
    ];
    anillos.forEach((a, ai) => {
      for (let i = 0; i < a.n; i++) {
        const sem = ai * 100 + i + 1;
        const ang = (i / a.n) * Math.PI * 2 + (rnd(sem) - 0.5) * 0.22 + ai * 0.2;
        const r = a.rMin + rnd(sem * 2) * (a.rMax - a.rMin);
        const alto = a.hMin + rnd(sem * 3) * (a.hMax - a.hMin);
        const radio = alto * (0.95 + rnd(sem * 4) * 0.42) * a.radioK;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;

        const opciones: OpcionesPico = {
          radio,
          alto,
          tess: 12,
          niveles: 7,
          semilla: sem,
          perfil: "pico",
          rugosidad: 0.34,
          nieveDesde: null,
          colorBase: coloresMontana,
          neblina: a.neblina,
        };
        const cuerpo = construirPico(this.scene, `montana_${idx}`, opciones);
        cuerpo.position.set(x, -1.2, z);
        cuerpo.material = this.matVertex;
        cuerpo.parent = this.root;
        cuerpo.receiveShadows = true;
        cuerpo.freezeWorldMatrix();
        this.meshesMontana.push(cuerpo);

        if (alto > 30) {
          const nieve = construirPico(this.scene, `montanaNieve_${idx}`, {
            ...opciones,
            nieveDesde: 5,
          });
          nieve.position.copyFrom(cuerpo.position);
          nieve.material = this.matNieve;
          nieve.parent = this.root;
          nieve.receiveShadows = true;
          nieve.freezeWorldMatrix();
          this.meshesMontana.push(nieve);
        }

        if (rnd(sem * 9) > 0.35) {
          const lado = rnd(sem * 11) > 0.5 ? 1 : -1;
          const hombro = construirPico(this.scene, `montanaHombro_${idx}`, {
            ...opciones,
            radio: radio * 0.62,
            alto: alto * (0.5 + rnd(sem * 13) * 0.18),
            semilla: sem + 50,
            tess: 9,
            niveles: 5,
          });
          hombro.position.set(
            x + lado * radio * 0.75,
            -1.2,
            z + (rnd(sem * 12) - 0.5) * radio * 0.6
          );
          hombro.material = this.matVertex;
          hombro.parent = this.root;
          hombro.freezeWorldMatrix();
          this.meshesMontana.push(hombro);
        }
        idx++;
      }
    });
  }

  private construirColinas(): void {
    const verdes = ["#86aa54", "#96b860", "#a6c66d"];
    const defs: Array<[number, number, number, number]> = [
      [-52, -42, 20, 5.2],
      [48, -50, 22, 6.2],
      [-56, 28, 21, 5.8],
      [54, 30, 23, 6.4],
      [-36, 56, 19, 4.8],
      [38, 58, 21, 5.6],
      [0, -64, 24, 6.8],
      [-68, -8, 21, 5.4],
      [68, -10, 22, 6.0],
    ];
    defs.forEach(([x, z, r, h], i) => {
      const m = construirPico(this.scene, `colinaSuave_${i}`, {
        radio: r,
        alto: h,
        tess: 12,
        niveles: 4,
        semilla: 300 + i,
        perfil: "domo",
        rugosidad: 0.12,
        nieveDesde: null,
        colorBase: [verdes[i % 3], verdes[(i + 1) % 3]],
        neblina: 0.04,
      });
      m.position.set(x, -0.32, z);
      m.material = this.matVertex;
      m.receiveShadows = true;
      m.parent = this.root;
      m.freezeWorldMatrix();
    });
  }

  private zonaLibre(x: number, z: number): boolean {
    if (Math.abs(x) < 11 && Math.abs(z) < 11) return false;
    if (Math.abs(x) < 2.2 && z > 8) return false;
    if (x > -1 && x < 14 && z > 14 && z < 17.2) return false;
    if (Math.hypot(x - 14.5, z + 7.5) < 4.5) return false;
    if (Math.hypot(x - 14.2, z - 10.8) < 4) return false;
    if (Math.abs(x + 14.2) < 4.5 && Math.abs(z - 3.5) < 5.5) return false;
    if (Math.abs(x - 13.8) < 4 && Math.abs(z - 2) < 5) return false;
    return true;
  }

  private construirBosqueDePinos(): void {
    const matTronco = crearMaterialPatrixPBR(this.scene, "tronco_corteza", {
      nombre: "patrixPinoTronco",
      uScale: 1,
      vScale: 2,
      cacheable: true,
    });
    const matPino1 = crearMaterialPatrixPBR(this.scene, "pino_agujas", {
      nombre: "patrixPinoAgujas1",
      uScale: 2,
      vScale: 1,
      usarPOM: false,
      albedoColor: new Color3(0.95, 1.0, 0.92),
    });
    const matPino2 = crearMaterialPatrixPBR(this.scene, "pino_agujas", {
      nombre: "patrixPinoAgujas2",
      uScale: 2,
      vScale: 1,
      usarPOM: false,
      albedoColor: new Color3(1.04, 1.06, 0.92),
    });

    const tronco = MeshBuilder.CreateCylinder(
      "pinoTroncoM",
      { diameter: 0.42, height: 1.4, tessellation: 6 },
      this.scene
    );
    const cono1 = MeshBuilder.CreateCylinder(
      "pinoCono1M",
      { diameterTop: 0.1, diameterBottom: 2.7, height: 2.6, tessellation: 8 },
      this.scene
    );
    const cono2 = MeshBuilder.CreateCylinder(
      "pinoCono2M",
      { diameterTop: 0.08, diameterBottom: 2.0, height: 2.2, tessellation: 8 },
      this.scene
    );
    const cono3 = MeshBuilder.CreateCylinder(
      "pinoCono3M",
      { diameterTop: 0, diameterBottom: 1.25, height: 1.75, tessellation: 8 },
      this.scene
    );
    tronco.material = matTronco;
    cono1.material = matPino1;
    cono2.material = matPino2;
    cono3.material = matPino1;
    [tronco, cono1, cono2, cono3].forEach((m) => {
      m.isVisible = false;
      m.isPickable = false;
    });

    let colocados = 0;
    for (let i = 0; i < 320 && colocados < 130; i++) {
      const ang = rnd(i * 3.7) * Math.PI * 2;
      const r = 24 + rnd(i * 5.3) * 48;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const manchon = Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.05);
      if (manchon < -0.2) continue;

      const esc = 0.85 + rnd(i * 7.9) * 1.15;
      const y0 = -0.30;
      const rotY = rnd(i * 9.3) * Math.PI * 2;
      const mk = (m: Mesh, nom: string, y: number, sombreado = false) => {
        const inst = m.createInstance(`${nom}_${colocados}`);
        inst.position.set(x, y0 + y * esc, z);
        inst.scaling.setAll(esc);
        inst.rotation.y = rotY;
        inst.parent = this.root;
        inst.isPickable = false;
        inst.freezeWorldMatrix();
        if (sombreado && r < 42 && this.shadowGen) {
          this.shadowGen.addShadowCaster(inst);
        }
      };
      mk(tronco, "pTr", 0.65);
      mk(cono1, "pC1", 2.35, true);
      mk(cono2, "pC2", 3.65, true);
      mk(cono3, "pC3", 4.75);
      colocados++;
    }
  }

  private construirFloresPastoYRocas(): void {
    // Flores campestres sutiles (amarillo pálido, blanco crema, ocre cálido)
    const coloresFlor = ["#f3e08b", "#f4f1e6", "#eab308", "#e8c588", "#e59866"];
    const floresMaster = coloresFlor.map((c, i) => {
      const m = MeshBuilder.CreateBox(`florM_${i}`, { width: 0.11, height: 0.09, depth: 0.11 }, this.scene);
      m.material = this.matSimple(c, 0.72);
      m.isVisible = false;
      m.isPickable = false;
      return m;
    });
    const tallo = MeshBuilder.CreateBox("florTalloM", { width: 0.03, height: 0.28, depth: 0.03 }, this.scene);
    tallo.material = this.matSimple("#4c6e2c", 0.78);
    tallo.isVisible = false;
    tallo.isPickable = false;

    const matTuft = crearMaterialPatrixPBR(this.scene, "pasto_tuft", {
      nombre: "patrixExtPastoTuft",
      usarPOM: false,
    });
    const pastoMaster = construirMallaMataExterior(this.scene, "pastoAltoExtM");
    pastoMaster.material = matTuft;
    pastoMaster.isVisible = false;
    pastoMaster.isPickable = false;

    let nf = 0;
    let np = 0;
    for (let i = 0; i < 620 && np < 260; i++) {
      const ang = rnd(i * 2.9 + 1) * Math.PI * 2;
      const r = 11.2 + Math.pow(rnd(i * 4.1 + 2), 1.4) * 52;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;

      const t = rnd(i * 6.7);
      if (t < 0.28 && nf < 110) {
        const parche = Math.sin(x * 0.35) * Math.sin(z * 0.31);
        if (parche < 0.05) continue;
        const h = 0.7 + rnd(i * 8.1) * 0.65;
        const tl = tallo.createInstance(`florTallo_${nf}`);
        tl.position.set(x, -0.30 + 0.14 * h, z);
        tl.scaling.y = h;
        tl.parent = this.root;
        tl.isPickable = false;
        tl.freezeWorldMatrix();

        const f = floresMaster[Math.floor(rnd(i * 3.3) * floresMaster.length)].createInstance(`flor_${nf}`);
        f.position.set(x, -0.30 + 0.28 * h + 0.04, z);
        f.rotation.y = rnd(i) * Math.PI;
        f.parent = this.root;
        f.isPickable = false;
        f.freezeWorldMatrix();
        nf++;
      } else {
        const p = pastoMaster.createInstance(`pastoAlto_${np}`);
        const h = 0.65 + rnd(i * 5.5) * 0.95;
        p.position.set(x, -0.30, z);
        p.scaling.set(0.85 + rnd(i * 3.1) * 0.55, h, 0.85 + rnd(i * 3.1) * 0.55);
        p.rotation.y = rnd(i * 2.2) * Math.PI * 2;
        p.parent = this.root;
        p.isPickable = false;
        p.freezeWorldMatrix();
        np++;
      }
    }

    // Rocas exteriores con textura mineral PBR musgosa
    const matRoca1 = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixExtRoca1",
      uScale: 1,
      vScale: 1,
      cacheable: true,
    });
    const matRoca2 = crearMaterialPatrixPBR(this.scene, "piedra_montana", {
      nombre: "patrixExtRoca2",
      uScale: 1,
      vScale: 1,
      cacheable: true,
    });

    let nr = 0;
    for (let i = 0; i < 85 && nr < 48; i++) {
      const ang = rnd(i * 8.8 + 4) * Math.PI * 2;
      const r = 16 + rnd(i * 1.9 + 3) * 48;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const s = 0.35 + rnd(i * 2.7) * 0.65;
      const roca = MeshBuilder.CreatePolyhedron(`rocaExt_${nr}`, { type: 1, size: s }, this.scene);
      roca.position.set(x, -0.30 + s * 0.35, z);
      roca.scaling.set(1.2, 0.62, 0.95);
      roca.rotation.set(rnd(i) * 0.5, rnd(i * 2) * Math.PI, rnd(i * 3) * 0.4);
      roca.material = nr % 2 === 0 ? matRoca1 : matRoca2;
      roca.parent = this.root;
      roca.receiveShadows = true;
      roca.isPickable = false;
      roca.freezeWorldMatrix();
      nr++;
    }

    // Arbustos follaje alfa-cutout Patrix
    const matArbusto = crearMaterialPatrixPBR(this.scene, "follaje_roble", {
      nombre: "patrixExtArbusto",
      uScale: 1,
      vScale: 1,
      usarPOM: false,
      cacheable: true,
    });
    let na = 0;
    for (let i = 0; i < 75 && na < 38; i++) {
      const ang = rnd(i * 9.1 + 7) * Math.PI * 2;
      const r = 12.5 + rnd(i * 2.4 + 5) * 40;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const s = 0.72 + rnd(i * 3.1) * 0.68;
      const b = MeshBuilder.CreateBox(`arbusto_${na}`, { width: s * 1.25, height: s * 0.85, depth: s * 1.15 }, this.scene);
      b.position.set(x, -0.30 + s * 0.34, z);
      b.rotation.y = rnd(i * 4.7) * Math.PI;
      b.material = matArbusto;
      b.parent = this.root;
      b.receiveShadows = true;
      b.isPickable = false;
      b.freezeWorldMatrix();
      if (r < 26 && this.shadowGen) {
        this.shadowGen.addShadowCaster(b);
      }
      na++;
    }
  }
}
