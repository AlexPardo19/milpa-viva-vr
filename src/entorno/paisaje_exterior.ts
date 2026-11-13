/**
 * Paisaje exterior (fuera de la parcela jugable): montañas low-poly con bosque,
 * nieve en las cumbres, colinas suaves, pinos, flores silvestres, pasto alto y rocas.
 *
 * Las montañas se generan proceduralmente (anillos con ruido determinista) y la
 * nieve usa exactamente los mismos anillos que el cuerpo, por lo que encaja sin huecos.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  VertexData,
  TransformNode,
} from "@babylonjs/core";
import { crearTexRuidoSueloPixel } from "../ui/texturas_pixel_3d";

function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function mezcla(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hex(h: string): number[] {
  const c = Color3.FromHexString(h);
  return [c.r, c.g, c.b];
}

interface OpcionesPico {
  radio: number;
  alto: number;
  tess: number;
  niveles: number;
  semilla: number;
  perfil: "pico" | "domo";
  rugosidad: number;
  /** nivel desde el cual se genera solo la capa de nieve (null = cuerpo completo) */
  nieveDesde: number | null;
  colorBase: string[]; // de abajo hacia arriba (interpolado)
  neblina: number; // 0..1 mezcla con azul atmosférico
}

function construirPico(scene: Scene, nombre: string, o: OpcionesPico): Mesh {
  const { tess: T, niveles: L } = o;
  const posiciones: number[] = [];
  const colores: number[] = [];
  const indices: number[] = [];
  const paleta = o.colorBase.map(hex);
  const azulAtmos = hex("#9cc3e6");
  const escalaNieve = o.nieveDesde !== null ? 1.018 : 1.0;
  const lInicio = o.nieveDesde !== null ? o.nieveDesde : 0;

  const anillo: number[] = [];
  for (let l = lInicio; l <= L; l++) {
    const t = l / L;
    const base = o.perfil === "pico" ? 1 - t : Math.sqrt(Math.max(0, 1 - t * t));
    for (let i = 0; i < T; i++) {
      const ang = (i / T) * Math.PI * 2;
      const ruido = rnd(o.semilla * 31 + i * 7.3 + l * 3.1);
      const cresta = 1 + o.rugosidad * (0.55 * Math.sin(ang * 3 + o.semilla) + 0.45 * Math.sin(ang * 5 + o.semilla * 2.1));
      const r = l === L ? 0 : o.radio * base * cresta * (1 + (ruido - 0.5) * o.rugosidad * 0.7);
      const angJ = ang + (rnd(o.semilla * 17 + i + l * 5) - 0.5) * 0.18;
      const yJ = t * o.alto + (l > 0 && l < L ? (rnd(o.semilla * 13 + i * 2 + l) - 0.5) * o.alto * 0.05 : 0);
      anillo.push(Math.cos(angJ) * r * escalaNieve, yJ * (o.nieveDesde !== null ? 1.004 : 1), Math.sin(angJ) * r * escalaNieve);
      if (o.nieveDesde === null) {
        // Color por altura: bosque → roca → roca clara
        const k = Math.min(paleta.length - 1, t * (paleta.length - 1));
        const i0 = Math.floor(k);
        const i1 = Math.min(paleta.length - 1, i0 + 1);
        let c = mezcla(paleta[i0], paleta[i1], k - i0);
        const var_ = 0.88 + rnd(o.semilla * 5 + i * 1.7 + l * 9.1) * 0.24;
        c = [c[0] * var_, c[1] * var_, c[2] * var_];
        c = mezcla(c, azulAtmos, o.neblina);
        colores.push(c[0], c[1], c[2], 1);
      }
    }
  }
  for (let k = 0; k < anillo.length; k += 3) posiciones.push(anillo[k], anillo[k + 1], anillo[k + 2]);

  const filas = L - lInicio + 1;
  for (let f = 0; f < filas - 1; f++) {
    for (let i = 0; i < T; i++) {
      const a = f * T + i;
      const b = f * T + ((i + 1) % T);
      const c = (f + 1) * T + i;
      const d = (f + 1) * T + ((i + 1) % T);
      indices.push(a, c, b, b, c, d);
    }
  }
  // Tapa base para el cuerpo (evita ver el vacío si la cámara queda baja)
  if (o.nieveDesde === null) {
    const centro = posiciones.length / 3;
    posiciones.push(0, 0, 0);
    colores.push(0.2, 0.2, 0.2, 1);
    for (let i = 0; i < T; i++) indices.push(centro, i, (i + 1) % T);
  }

  const m = new Mesh(nombre, scene);
  const vd = new VertexData();
  vd.positions = posiciones;
  vd.indices = indices;
  const normales: number[] = [];
  VertexData.ComputeNormals(posiciones, indices, normales);
  vd.normals = normales;
  if (o.nieveDesde === null) vd.colors = colores;
  const uvs: number[] = [];
  for (let k = 0; k < posiciones.length; k += 3) {
    uvs.push((posiciones[k] + posiciones[k + 2]) * 0.12, posiciones[k + 1] * 0.12);
  }
  vd.uvs = uvs;
  vd.applyToMesh(m);
  m.convertToFlatShadedMesh();
  m.isPickable = false;
  m.useVertexColors = o.nieveDesde === null;
  return m;
}

export class PaisajeExterior {
  public readonly root: TransformNode;
  public readonly matNieve: StandardMaterial;
  public readonly meshesMontana: Mesh[] = [];
  private readonly matVertex: StandardMaterial;
  private readonly matCache = new Map<string, StandardMaterial>();

  constructor(private readonly scene: Scene, matNieve: StandardMaterial) {
    this.root = new TransformNode("paisajeExteriorRoot", scene);
    this.matNieve = matNieve;

    this.matVertex = new StandardMaterial("matMontanaVertex", scene);
    this.matVertex.diffuseColor = new Color3(1, 1, 1);
    this.matVertex.diffuseTexture = crearTexRuidoSueloPixel(scene);
    this.matVertex.emissiveColor = new Color3(0.30, 0.30, 0.30);
    this.matVertex.specularColor = Color3.Black();

    this.construirMontanas();
    this.construirColinas();
    this.construirBosqueDePinos();
    this.construirFloresPastoYRocas();
  }

  private mat(h: string, em = 0.3): StandardMaterial {
    const k = `${h}_${em}`;
    let m = this.matCache.get(k);
    if (!m) {
      m = new StandardMaterial(`matPaisaje_${k}`, this.scene);
      const c = Color3.FromHexString(h);
      m.diffuseColor = c;
      m.emissiveColor = c.scale(em);
      m.specularColor = Color3.Black();
      this.matCache.set(k, m);
    }
    return m;
  }

  private construirMontanas(): void {
    const coloresMontana = ["#3f7d36", "#4f8a3a", "#7a6a50", "#8b8478", "#a8a39a"];
    let idx = 0;

    const anillos = [
      { n: 11, rMin: 82, rMax: 100, hMin: 24, hMax: 40, radioK: 0.95, neblina: 0.10 },
      { n: 14, rMin: 125, rMax: 150, hMin: 42, hMax: 68, radioK: 0.95, neblina: 0.38 },
    ];
    anillos.forEach((a, ai) => {
      for (let i = 0; i < a.n; i++) {
        const sem = ai * 100 + i + 1;
        const ang = (i / a.n) * Math.PI * 2 + (rnd(sem) - 0.5) * 0.22 + ai * 0.2;
        const r = a.rMin + rnd(sem * 2) * (a.rMax - a.rMin);
        const alto = a.hMin + rnd(sem * 3) * (a.hMax - a.hMin);
        const radio = alto * (1.15 + rnd(sem * 4) * 0.6) * a.radioK;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;

        const opciones: OpcionesPico = {
          radio, alto, tess: 9, niveles: 8, semilla: sem, perfil: "pico",
          rugosidad: 0.32, nieveDesde: null, colorBase: coloresMontana, neblina: a.neblina,
        };
        const cuerpo = construirPico(this.scene, `montana_${idx}`, opciones);
        cuerpo.position.set(x, -1.2, z);
        cuerpo.material = this.matVertex;
        cuerpo.parent = this.root;
        cuerpo.freezeWorldMatrix();
        this.meshesMontana.push(cuerpo);

        if (alto > 30) {
          const nieve = construirPico(this.scene, `montanaNieve_${idx}`, {
            ...opciones, nieveDesde: 5,
          });
          nieve.position.copyFrom(cuerpo.position);
          nieve.material = this.matNieve;
          nieve.parent = this.root;
          nieve.freezeWorldMatrix();
          this.meshesMontana.push(nieve);
        }
        // Picos secundarios (hombros) para silueta menos simétrica
        if (rnd(sem * 9) > 0.35) {
          const lado = rnd(sem * 11) > 0.5 ? 1 : -1;
          const hombro = construirPico(this.scene, `montanaHombro_${idx}`, {
            ...opciones,
            radio: radio * 0.62,
            alto: alto * 0.62,
            semilla: sem + 50,
            neblina: a.neblina,
          });
          hombro.position.set(x + lado * radio * 0.75, -1.2, z + (rnd(sem * 12) - 0.5) * radio * 0.6);
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
    const verdes = ["#4e9a2f", "#5fae38", "#78c04a"];
    const defs = [
      [-26, 20, 17, 3.2], [26, 18, 15, 3.6], [-27, -20, 16, 3.0], [27, -22, 19, 4.2],
      [3, 30, 21, 2.8], [-22, 0, 11, 2.4], [38, 0, 16, 3.4], [-40, 8, 18, 3.8],
      [-12, -34, 18, 3.4], [16, -36, 17, 3.0], [-36, 30, 16, 3.2], [38, 32, 17, 3.0],
    ];
    defs.forEach(([x, z, r, h], i) => {
      const m = construirPico(this.scene, `colinaSuave_${i}`, {
        radio: r, alto: h, tess: 12, niveles: 4, semilla: 300 + i, perfil: "domo",
        rugosidad: 0.10, nieveDesde: null, colorBase: [verdes[i % 3], verdes[(i + 1) % 3]], neblina: 0,
      });
      m.position.set(x, -0.32, z);
      m.material = this.matVertex;
      m.parent = this.root;
      m.freezeWorldMatrix();
    });
  }

  private zonaLibre(x: number, z: number): boolean {
    if (Math.abs(x) < 11 && Math.abs(z) < 11) return false;           // parcela y zócalo
    if (Math.abs(x) < 2.2 && z > 8) return false;                       // camino principal
    if (x > -1 && x < 14 && z > 14 && z < 17.2) return false;           // camino lateral
    if (Math.hypot(x - 14.5, z + 7.5) < 4.5) return false;              // estanque
    if (Math.hypot(x - 14.2, z - 10.8) < 4) return false;               // molino
    if (Math.abs(x + 14.2) < 4.5 && Math.abs(z - 3.5) < 5.5) return false; // corral izq
    if (Math.abs(x - 13.8) < 4 && Math.abs(z - 2) < 5) return false;     // corral der
    return true;
  }

  private construirBosqueDePinos(): void {
    const matTronco = this.mat("#5b3a1c", 0.2);
    const matPino1 = this.mat("#1f6b34", 0.28);
    const matPino2 = this.mat("#2a8040", 0.28);

    const tronco = MeshBuilder.CreateCylinder("pinoTroncoM", { diameter: 0.4, height: 1.3, tessellation: 6 }, this.scene);
    const cono1 = MeshBuilder.CreateCylinder("pinoCono1M", { diameterTop: 0, diameterBottom: 2.6, height: 2.6, tessellation: 7 }, this.scene);
    const cono2 = MeshBuilder.CreateCylinder("pinoCono2M", { diameterTop: 0, diameterBottom: 1.9, height: 2.2, tessellation: 7 }, this.scene);
    const cono3 = MeshBuilder.CreateCylinder("pinoCono3M", { diameterTop: 0, diameterBottom: 1.2, height: 1.7, tessellation: 7 }, this.scene);
    tronco.material = matTronco;
    cono1.material = matPino1;
    cono2.material = matPino2;
    cono3.material = matPino1;
    [tronco, cono1, cono2, cono3].forEach((m) => {
      m.isVisible = false;
      m.isPickable = false;
      m.convertToFlatShadedMesh();
    });

    let colocados = 0;
    for (let i = 0; i < 700 && colocados < 190; i++) {
      // Concentrar pinos en la franja de las faldas (r 34-70), con claros
      const ang = rnd(i * 3.7) * Math.PI * 2;
      const r = 30 + rnd(i * 5.3) * 42;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      // Agrupar en manchones: ruido de baja frecuencia
      const manchon = Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.05);
      if (manchon < 0.25) continue;
      if (!this.zonaLibre(x, z)) continue;
      const esc = 0.8 + rnd(i * 7.9) * 1.1;
      const y0 = -0.30;
      const mk = (m: Mesh, nom: string, y: number) => {
        const inst = m.createInstance(`${nom}_${colocados}`);
        inst.position.set(x, y0 + y * esc, z);
        inst.scaling.setAll(esc);
        inst.isPickable = false;
        inst.parent = this.root;
        inst.freezeWorldMatrix();
      };
      mk(tronco, "pinoTr", 0.65);
      mk(cono1, "pinoC1", 2.2);
      mk(cono2, "pinoC2", 3.7);
      mk(cono3, "pinoC3", 5.0);
      colocados++;
    }
  }

  private construirFloresPastoYRocas(): void {
    const coloresFlor = ["#fde047", "#f472b6", "#ffffff", "#c084fc", "#fb7185", "#fb923c"];
    const floresMaster = coloresFlor.map((c, i) => {
      const m = MeshBuilder.CreateBox(`florM_${i}`, { width: 0.14, height: 0.14, depth: 0.14 }, this.scene);
      m.material = this.mat(c, 0.6);
      m.isVisible = false;
      m.isPickable = false;
      return m;
    });
    const tallo = MeshBuilder.CreateBox("florTalloM", { width: 0.04, height: 0.34, depth: 0.04 }, this.scene);
    tallo.material = this.mat("#3f8f2a", 0.3);
    tallo.isVisible = false;
    tallo.isPickable = false;

    const pastoMasters = ["#3f8f2a", "#52a636", "#2f7a22"].map((c, i) => {
      const m = MeshBuilder.CreateBox(`pastoAltoM_${i}`, { width: 0.10, height: 0.5, depth: 0.10 }, this.scene);
      m.material = this.mat(c, 0.3);
      m.isVisible = false;
      m.isPickable = false;
      return m;
    });

    let nf = 0;
    let np = 0;
    for (let i = 0; i < 1500 && (nf < 260 || np < 420); i++) {
      const ang = rnd(i * 2.9 + 1) * Math.PI * 2;
      const r = 11.5 + Math.pow(rnd(i * 4.1 + 2), 1.5) * 55;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const t = rnd(i * 6.7);
      if (t < 0.38 && nf < 260) {
        // Florcita: tallo + capullo, agrupadas en parches
        const parche = Math.sin(x * 0.35) * Math.sin(z * 0.31);
        if (parche < -0.15) continue;
        const h = 0.7 + rnd(i * 8.1) * 0.8;
        const tl = tallo.createInstance(`florTallo_${nf}`);
        tl.position.set(x, -0.30 + 0.17 * h, z);
        tl.scaling.y = h;
        tl.isPickable = false;
        tl.parent = this.root;
        tl.freezeWorldMatrix();
        const f = floresMaster[Math.floor(rnd(i * 3.3) * floresMaster.length)].createInstance(`flor_${nf}`);
        f.position.set(x, -0.30 + 0.34 * h + 0.05, z);
        f.rotation.y = rnd(i) * 3;
        f.isPickable = false;
        f.parent = this.root;
        f.freezeWorldMatrix();
        nf++;
      } else if (np < 420) {
        const p = pastoMasters[i % 3].createInstance(`pastoAlto_${np}`);
        const h = 0.6 + rnd(i * 5.5) * 1.1;
        p.position.set(x, -0.30 + 0.25 * h, z);
        p.scaling.set(1 + rnd(i) * 0.8, h, 1 + rnd(i + 1) * 0.8);
        p.rotation.y = rnd(i * 2.2) * 3;
        p.isPickable = false;
        p.parent = this.root;
        p.freezeWorldMatrix();
        np++;
      }
    }

    // Rocas grises dispersas
    const matRoca = this.mat("#8a8f98", 0.28);
    const matRoca2 = this.mat("#6b7280", 0.28);
    let nr = 0;
    for (let i = 0; i < 200 && nr < 38; i++) {
      const ang = rnd(i * 8.8 + 4) * Math.PI * 2;
      const r = 13 + rnd(i * 1.9 + 3) * 55;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const s = 0.4 + rnd(i * 2.7) * 1.1;
      const roca = MeshBuilder.CreatePolyhedron(`rocaExt_${nr}`, { type: 1, size: s }, this.scene);
      roca.position.set(x, -0.30 + s * 0.35, z);
      roca.scaling.set(1.2, 0.7, 1);
      roca.rotation.y = rnd(i) * 6;
      roca.material = nr % 2 ? matRoca : matRoca2;
      roca.isPickable = false;
      roca.parent = this.root;
      roca.freezeWorldMatrix();
      nr++;
    }

    // Arbustos redondeados
    const matArbusto = this.mat("#3f9a35", 0.3);
    let na = 0;
    for (let i = 0; i < 200 && na < 36; i++) {
      const ang = rnd(i * 9.1 + 7) * Math.PI * 2;
      const r = 12.5 + rnd(i * 2.4 + 5) * 40;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!this.zonaLibre(x, z)) continue;
      const s = 0.7 + rnd(i * 3.1) * 0.7;
      const b = MeshBuilder.CreateSphere(`arbusto_${na}`, { diameter: s, segments: 4 }, this.scene);
      b.position.set(x, -0.30 + s * 0.3, z);
      b.scaling.y = 0.75;
      b.material = matArbusto;
      b.isPickable = false;
      b.parent = this.root;
      b.convertToFlatShadedMesh();
      b.freezeWorldMatrix();
      na++;
    }
  }
}
