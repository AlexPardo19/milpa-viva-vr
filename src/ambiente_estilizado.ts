import {
  AbstractMesh,
  CascadedShadowGenerator,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  ParticleSystem,
  PointLight,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  Scene,
} from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";
import { registrarCaja } from "./colisiones";
import { ClimateState, Metricas } from "./clima";
import { PaisajeExterior } from "./entorno/paisaje_exterior";
import { GranjaDecorativa } from "./entorno/granja_decorativa";
import { aplicarEstiloPatrix, ControladorEstiloPatrix } from "./estilo_patrix";
import { crearMaterialPatrixPBR, obtenerBancoPatrix } from "./ui/texturas_patrix_pbr";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function mezclarColor(a: Color3, b: Color3, t: number): Color3 {
  const k = clamp01(t);
  return new Color3(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k
  );
}

/** Genera la textura radial solar estilizada Patrix (núcleo superelíptico cálido con borde suave). */
function crearTexturaDiscoSolar(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("texPatrixSunDisc", { width: 256, height: 256 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 122);
  grad.addColorStop(0.0, "rgba(255, 255, 248, 1.0)");
  grad.addColorStop(0.28, "rgba(255, 246, 205, 0.98)");
  grad.addColorStop(0.50, "rgba(255, 208, 118, 0.84)");
  grad.addColorStop(0.74, "rgba(255, 148, 56, 0.30)");
  grad.addColorStop(1.0, "rgba(255, 120, 32, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Núcleo central ligeramente biselado (estética bloque-realista Patrix)
  ctx.save();
  ctx.translate(128, 128);
  const r = 46;
  const radCorner = 15;
  ctx.beginPath();
  ctx.moveTo(-r + radCorner, -r);
  ctx.lineTo(r - radCorner, -r);
  ctx.quadraticCurveTo(r, -r, r, -r + radCorner);
  ctx.lineTo(r, r - radCorner);
  ctx.quadraticCurveTo(r, r, r - radCorner, r);
  ctx.lineTo(-r + radCorner, r);
  ctx.quadraticCurveTo(-r, r, -r, r - radCorner);
  ctx.lineTo(-r, -r + radCorner);
  ctx.quadraticCurveTo(-r, -r, -r + radCorner, -r);
  ctx.closePath();
  const coreGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 58);
  coreGrad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  coreGrad.addColorStop(0.68, "rgba(255, 250, 224, 0.96)");
  coreGrad.addColorStop(1.0, "rgba(255, 218, 130, 0.0)");
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.restore();

  tex.update();
  return tex;
}

/** Genera corona atmosférica solar + haces suaves tipo shader crepuscular. */
function crearTexturaCoronaSolar(scene: Scene, conRayos: boolean): DynamicTexture {
  const tex = new DynamicTexture(
    conRayos ? "texPatrixSunRays" : "texPatrixSunCorona",
    { width: 512, height: 512 },
    scene,
    true
  );
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 512, 512);

  if (!conRayos) {
    const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 248);
    grad.addColorStop(0.0, "rgba(255, 242, 198, 0.85)");
    grad.addColorStop(0.22, "rgba(255, 200, 112, 0.45)");
    grad.addColorStop(0.55, "rgba(255, 136, 56, 0.14)");
    grad.addColorStop(1.0, "rgba(255, 92, 24, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  } else {
    ctx.save();
    ctx.translate(256, 256);
    const numRayos = 10;
    for (let i = 0; i < numRayos; i++) {
      ctx.save();
      ctx.rotate((i / numRayos) * Math.PI * 2);
      const largo = i % 2 === 0 ? 245 : 195;
      const ancho = i % 2 === 0 ? 28 : 20;
      const gRay = ctx.createLinearGradient(0, 0, largo, 0);
      gRay.addColorStop(0.0, "rgba(255, 232, 178, 0.48)");
      gRay.addColorStop(0.35, "rgba(255, 184, 96, 0.18)");
      gRay.addColorStop(1.0, "rgba(255, 130, 48, 0.0)");
      ctx.fillStyle = gRay;
      ctx.beginPath();
      ctx.moveTo(0, -ancho * 0.25);
      ctx.lineTo(largo, -ancho);
      ctx.lineTo(largo, ancho);
      ctx.lineTo(0, ancho * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  tex.update();
  return tex;
}

/** Genera textura lunar estilizada Patrix con mares lunares sutiles y halo de borde. */
function crearTexturaLuna(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("texPatrixMoonDisc", { width: 256, height: 256 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);

  // Halo exterior azul-plata sutil
  const aura = ctx.createRadialGradient(128, 128, 36, 128, 128, 118);
  aura.addColorStop(0.0, "rgba(218, 232, 255, 0.72)");
  aura.addColorStop(0.55, "rgba(148, 182, 244, 0.24)");
  aura.addColorStop(1.0, "rgba(100, 140, 220, 0.0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, 256, 256);

  // Cuerpo lunar suavemente redondeado
  ctx.save();
  ctx.translate(128, 128);
  const r = 64;
  const rc = 22;
  ctx.beginPath();
  ctx.moveTo(-r + rc, -r);
  ctx.lineTo(r - rc, -r);
  ctx.quadraticCurveTo(r, -r, r, -r + rc);
  ctx.lineTo(r, r - rc);
  ctx.quadraticCurveTo(r, r, r - rc, r);
  ctx.lineTo(-r + rc, r);
  ctx.quadraticCurveTo(-r, r, -r, r - rc);
  ctx.lineTo(-r, -r + rc);
  ctx.quadraticCurveTo(-r, -r, -r + rc, -r);
  ctx.closePath();
  ctx.clip();

  const baseMoon = ctx.createRadialGradient(-16, -18, 8, 0, 0, 88);
  baseMoon.addColorStop(0.0, "#f5f8ff");
  baseMoon.addColorStop(0.65, "#dce7fc");
  baseMoon.addColorStop(1.0, "#a9bedf");
  ctx.fillStyle = baseMoon;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // Mares y cráteres lunares sutiles
  const crateres: Array<[number, number, number, string]> = [
    [-22, -16, 19, "rgba(142, 162, 196, 0.34)"],
    [16, -12, 24, "rgba(130, 150, 186, 0.30)"],
    [-8, 18, 22, "rgba(136, 156, 192, 0.32)"],
    [24, 22, 14, "rgba(122, 142, 178, 0.28)"],
    [-30, 10, 11, "rgba(155, 174, 206, 0.25)"],
    [4, -34, 10, "rgba(138, 158, 194, 0.24)"],
  ];
  for (const [cx, cy, cr, col] of crateres) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  tex.update();
  return tex;
}

/** Crea textura nítida de punto estelar con suave destello en cruz. */
function crearTexturaEstrella(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("texPatrixStar", { width: 32, height: 32 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 32, 32);

  const g = ctx.createRadialGradient(16, 16, 0.5, 16, 16, 15);
  g.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  g.addColorStop(0.28, "rgba(245, 250, 255, 0.85)");
  g.addColorStop(0.65, "rgba(205, 225, 255, 0.18)");
  g.addColorStop(1.0, "rgba(180, 210, 255, 0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);

  tex.update();
  return tex;
}

/** Construye una bóveda ligera de cientos de estrellas multi-magnitud en una sola malla GPU. */
function crearCapaEstrellas(
  scene: Scene,
  nombre: string,
  cantidad: number,
  radio: number,
  tamBase: number,
  semilla: number,
  mat: StandardMaterial
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  let rng = semilla >>> 0;
  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  const paleta = [
    [1.0, 0.99, 0.95],  // blanco cálido
    [0.84, 0.91, 1.0],  // azul estelar
    [1.0, 0.90, 0.74],  // ámbar tenue
    [0.95, 0.97, 1.0],  // blanco puro
  ];

  const upRef = new Vector3(0, 1, 0);
  const altRef = new Vector3(1, 0, 0);

  for (let i = 0; i < cantidad; i++) {
    const phi = nextRand() * Math.PI * 2;
    const u = 0.035 + Math.pow(nextRand(), 0.78) * 0.945; // evitar bajo el horizonte
    const sinTheta = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = sinTheta * Math.cos(phi);
    const dy = u;
    const dz = sinTheta * Math.sin(phi);

    const dir = new Vector3(dx, dy, dz);
    const tangenteA = Vector3.Cross(Math.abs(dy) > 0.92 ? altRef : upRef, dir).normalize();
    const tangenteB = Vector3.Cross(dir, tangenteA).normalize();

    const cx = dx * radio;
    const cy = dy * radio;
    const cz = dz * radio;
    const esc = tamBase * (0.60 + Math.pow(nextRand(), 1.8) * 1.15);

    const col = paleta[i % paleta.length];
    const alpha = 0.42 + Math.pow(nextRand(), 0.9) * 0.58;
    const base = i * 4;

    const offsets = [
      [-esc, -esc, 0, 0],
      [esc, -esc, 1, 0],
      [esc, esc, 1, 1],
      [-esc, esc, 0, 1],
    ];
    for (const [ox, oy, pu, pv] of offsets) {
      positions.push(
        cx + tangenteA.x * ox + tangenteB.x * oy,
        cy + tangenteA.y * ox + tangenteB.y * oy,
        cz + tangenteA.z * ox + tangenteB.z * oy
      );
      normals.push(-dx, -dy, -dz);
      uvs.push(pu, pv);
      colors.push(col[0], col[1], col[2], alpha);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new Mesh(nombre, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(mesh);

  mesh.material = mat;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.infiniteDistance = true;
  mesh.alphaIndex = -12;
  return mesh;
}

/** Construye una malla ligera de matas de pasto en planos cruzados (pivote en base Y=0). */
function crearMallaMataPasto3D(scene: Scene, nombre: string): Mesh {
  const posiciones: number[] = [];
  const normales: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const ancho = 0.42;
  const alto = 0.28;
  const angulos = [0, Math.PI / 3, (2 * Math.PI) / 3];

  angulos.forEach((ang, idx) => {
    const hw = ancho * 0.5;
    const dx = Math.cos(ang) * hw;
    const dz = Math.sin(ang) * hw;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    const base = idx * 4;

    // 4 vértices del plano vertical centrado en X/Z con base exacta en Y = 0
    posiciones.push(
      -dx, 0, -dz,
      dx, 0, dz,
      dx, alto, dz,
      -dx, alto, -dz
    );
    for (let k = 0; k < 4; k++) {
      normales.push(nx, 0.25, nz);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const mesh = new Mesh(nombre, scene);
  const vd = new VertexData();
  vd.positions = posiciones;
  vd.normals = normales;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

/**
 * Escenario vivo estilo Patrix Texture Pack + Shader realista:
 * Cielo físico Rayleigh/Mie, IBL dinámico, sombras PCF 2048px, SSAO2, ACES + Bloom,
 * suelos/maderas/piedras con PBR + POM y follaje 3D alfa-cutout con translucidez.
 */
export class AmbienteEstilizado {
  readonly scene: Scene;
  readonly shadowGen: ShadowGenerator;
  readonly estiloPatrix: ControladorEstiloPatrix;

  readonly hemiLight: HemisphericLight;
  readonly sunLight: DirectionalLight;

  readonly grassMesh: Mesh;
  readonly soilMesh: Mesh;
  readonly moundMesh: Mesh;
  readonly bladeMaster: Mesh;
  readonly bladeInstances: Mesh[] = [];
  readonly puddleMesh: Mesh;

  readonly sunNode: TransformNode;
  readonly sunMesh: Mesh;
  readonly haloMesh: Mesh;
  readonly sunRaysMesh: Mesh;
  readonly moonMesh: Mesh;
  readonly moonHaloMesh: Mesh;
  readonly starNode: TransformNode;
  readonly starLayerA: Mesh;
  readonly starLayerB: Mesh;
  readonly clouds: TransformNode[] = [];
  readonly rainSystem: ParticleSystem | null = null;
  readonly volcanesMeshes: Mesh[] = [];

  private matGrass: PBRMaterial;
  private matSoil: PBRMaterial;
  private matMound: PBRMaterial;
  private matBlade: PBRMaterial;
  private matPuddle: PBRMaterial;
  private matSun: StandardMaterial;
  private matHalo: StandardMaterial;
  private matSunRays: StandardMaterial;
  private matMoon: StandardMaterial;
  private matMoonHalo: StandardMaterial;
  private matStarA: StandardMaterial;
  private matStarB: StandardMaterial;
  private matCloud: PBRMaterial;
  private matNieveVolcan!: PBRMaterial;
  private matFarolLuz!: StandardMaterial;
  private farolPointLight: PointLight | null = null;
  private fogonPointLight: PointLight | null = null;
  private intensidadStarBase = 0;
  private intensidadFogonBase = 0;
  private ultimoTiempoStarFade = 0;

  private readonly granjaDecorativa: GranjaDecorativa;
  private paisaje!: PaisajeExterior;
  private matCielo!: SkyMaterial;
  private cupulaCielo!: Mesh;
  private tiempoTotal = 0;
  private ultimoRefrescoIBL = -10;
  private ultimaHoraIBL = -99;
  private ultimaNubIBL = -99;

  constructor(scene: Scene) {
    this.scene = scene;
    scene.clearColor = new Color4(0.60, 0.78, 0.94, 1.0);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0034;
    scene.fogColor = new Color3(0.76, 0.85, 0.93);

    // 1. Iluminación direccional oblicua cálida + relleno de cielo frío + Cascaded Shadows
    this.hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    this.hemiLight.intensity = 0.56;
    this.hemiLight.diffuse = new Color3(0.74, 0.87, 1.0);
    this.hemiLight.groundColor = new Color3(0.32, 0.27, 0.19);

    this.sunLight = new DirectionalLight("sunDir", new Vector3(-0.55, -0.82, -0.45), scene);
    this.sunLight.position = new Vector3(-28, 36, -24);
    this.sunLight.intensity = 3.2;
    this.sunLight.shadowMinZ = 1;
    this.sunLight.shadowMaxZ = 115;

    const engNombre = scene.getEngine()?.getClassName?.() ?? scene.getEngine()?.constructor?.name ?? "";
    const esHeadless = engNombre === "NullEngine" || scene.getEngine()?.name === "Null";
    if (!esHeadless && CascadedShadowGenerator.IsSupported) {
      const csm = new CascadedShadowGenerator(2048, this.sunLight);
      csm.numCascades = 3;
      csm.lambda = 0.72;
      csm.cascadeBlendPercentage = 0.12;
      csm.stabilizeCascades = true;
      csm.depthClamp = true;
      csm.autoCalcDepthBounds = false;
      csm.shadowMaxZ = 105;
      csm.usePercentageCloserFiltering = true;
      csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      csm.bias = 0.0025;
      csm.normalBias = 0.02;
      this.shadowGen = csm;
    } else {
      this.shadowGen = new ShadowGenerator(2048, this.sunLight);
    }
    this.estiloPatrix = aplicarEstiloPatrix(
      scene,
      this.sunLight,
      this.hemiLight,
      this.shadowGen
    );

    const banco = obtenerBancoPatrix(scene);

    // 2. Materiales PBR del suelo principal con POM
    this.matGrass = crearMaterialPatrixPBR(scene, "pasto", {
      nombre: "patrixGrassPodio",
      uScale: 12,
      vScale: 12,
      albedoColor: new Color3(0.95, 1.0, 0.92),
    });

    this.matSoil = crearMaterialPatrixPBR(scene, "tierra_perfil", {
      nombre: "patrixSoilEstrato",
      uScale: 12,
      vScale: 2,
      albedoColor: Color3.White(),
    });

    this.matMound = crearMaterialPatrixPBR(scene, "tierra_surco", {
      nombre: "patrixMound",
      uScale: 2,
      vScale: 2,
      albedoColor: Color3.White(),
    });

    this.matBlade = crearMaterialPatrixPBR(scene, "pasto_tuft", {
      nombre: "patrixGrassTuft3D",
      usarPOM: false,
      albedoColor: new Color3(0.96, 1.0, 0.94),
    });

    this.matPuddle = new PBRMaterial("patrixPuddleMat", scene);
    this.matPuddle.albedoColor = new Color3(0.18, 0.34, 0.44);
    this.matPuddle.bumpTexture = banco.aguaNormal;
    this.matPuddle.bumpTexture.level = 0.45;
    this.matPuddle.metallic = 0.12;
    this.matPuddle.roughness = 0.06;
    this.matPuddle.alpha = 0.0;
    this.matPuddle.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    this.matPuddle.metadata = { patrixSkip: true };

    const texDiscoSol = crearTexturaDiscoSolar(scene);
    this.matSun = new StandardMaterial("sunMat", scene);
    this.matSun.diffuseTexture = texDiscoSol;
    this.matSun.useAlphaFromDiffuseTexture = true;
    this.matSun.diffuseColor = Color3.Black();
    this.matSun.emissiveColor = new Color3(1.0, 0.96, 0.84);
    this.matSun.alphaMode = Engine.ALPHA_ADD;
    this.matSun.disableDepthWrite = true;
    this.matSun.disableLighting = true;
    this.matSun.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matSun.backFaceCulling = false;
    this.matSun.metadata = { patrixSkip: true, esEmisivoReal: true };

    const texCoronaSol = crearTexturaCoronaSolar(scene, false);
    this.matHalo = new StandardMaterial("haloMat", scene);
    this.matHalo.diffuseTexture = texCoronaSol;
    this.matHalo.useAlphaFromDiffuseTexture = true;
    this.matHalo.diffuseColor = Color3.Black();
    this.matHalo.emissiveColor = new Color3(1.0, 0.86, 0.54);
    this.matHalo.alpha = 0.65;
    this.matHalo.alphaMode = Engine.ALPHA_ADD;
    this.matHalo.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matHalo.disableDepthWrite = true;
    this.matHalo.disableLighting = true;
    this.matHalo.backFaceCulling = false;
    this.matHalo.metadata = { patrixSkip: true, esEmisivoReal: true };

    const texRayosSol = crearTexturaCoronaSolar(scene, true);
    this.matSunRays = new StandardMaterial("sunRaysMat", scene);
    this.matSunRays.diffuseTexture = texRayosSol;
    this.matSunRays.useAlphaFromDiffuseTexture = true;
    this.matSunRays.diffuseColor = Color3.Black();
    this.matSunRays.emissiveColor = new Color3(1.0, 0.82, 0.48);
    this.matSunRays.alpha = 0.42;
    this.matSunRays.alphaMode = Engine.ALPHA_ADD;
    this.matSunRays.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matSunRays.disableDepthWrite = true;
    this.matSunRays.disableLighting = true;
    this.matSunRays.backFaceCulling = false;
    this.matSunRays.metadata = { patrixSkip: true, esEmisivoReal: true };

    const texLuna = crearTexturaLuna(scene);
    this.matMoon = new StandardMaterial("moonMat", scene);
    this.matMoon.diffuseTexture = texLuna;
    this.matMoon.useAlphaFromDiffuseTexture = true;
    this.matMoon.diffuseColor = Color3.Black();
    this.matMoon.emissiveColor = new Color3(0.90, 0.94, 1.0);
    this.matMoon.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    this.matMoon.disableDepthWrite = true;
    this.matMoon.disableLighting = true;
    this.matMoon.backFaceCulling = false;
    this.matMoon.metadata = { patrixSkip: true, esEmisivoReal: true };

    this.matMoonHalo = new StandardMaterial("moonHaloMat", scene);
    this.matMoonHalo.diffuseTexture = texCoronaSol;
    this.matMoonHalo.useAlphaFromDiffuseTexture = true;
    this.matMoonHalo.diffuseColor = Color3.Black();
    this.matMoonHalo.emissiveColor = new Color3(0.46, 0.64, 1.0);
    this.matMoonHalo.alpha = 0.32;
    this.matMoonHalo.alphaMode = Engine.ALPHA_ADD;
    this.matMoonHalo.disableDepthWrite = true;
    this.matMoonHalo.disableLighting = true;
    this.matMoonHalo.backFaceCulling = false;
    this.matMoonHalo.metadata = { patrixSkip: true, esEmisivoReal: true };

    const texEstrella = crearTexturaEstrella(scene);
    this.matStarA = new StandardMaterial("starMatA", scene);
    this.matStarA.diffuseTexture = texEstrella;
    this.matStarA.useAlphaFromDiffuseTexture = true;
    this.matStarA.diffuseColor = Color3.Black();
    this.matStarA.emissiveColor = Color3.White();
    this.matStarA.alpha = 0;
    this.matStarA.alphaMode = Engine.ALPHA_ADD;
    this.matStarA.disableDepthWrite = true;
    this.matStarA.disableLighting = true;
    this.matStarA.backFaceCulling = false;
    this.matStarA.metadata = { patrixSkip: true, esEmisivoReal: true };

    this.matStarB = new StandardMaterial("starMatB", scene);
    this.matStarB.diffuseTexture = texEstrella;
    this.matStarB.useAlphaFromDiffuseTexture = true;
    this.matStarB.diffuseColor = Color3.Black();
    this.matStarB.emissiveColor = Color3.White();
    this.matStarB.alpha = 0;
    this.matStarB.alphaMode = Engine.ALPHA_ADD;
    this.matStarB.disableDepthWrite = true;
    this.matStarB.disableLighting = true;
    this.matStarB.backFaceCulling = false;
    this.matStarB.metadata = { patrixSkip: true, esEmisivoReal: true };

    this.matCloud = new PBRMaterial("cloudMatPatrix", scene);
    this.matCloud.albedoColor = new Color3(0.96, 0.97, 0.99);
    this.matCloud.emissiveColor = new Color3(0.26, 0.29, 0.34);
    this.matCloud.metallic = 0;
    this.matCloud.roughness = 0.96;
    this.matCloud.alpha = 0.92;
    this.matCloud.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;

    // 3. Podio 18x18m + estrato de tierra + loma/charco heredados
    this.grassMesh = MeshBuilder.CreateBox(
      "grassGround",
      { width: 18, height: 0.30, depth: 18 },
      scene
    );
    this.grassMesh.position.y = -0.15;
    this.grassMesh.material = this.matGrass;
    this.grassMesh.receiveShadows = true;

    this.soilMesh = MeshBuilder.CreateBox(
      "soilBase",
      { width: 18, height: 1.2, depth: 18 },
      scene
    );
    this.soilMesh.position.y = -0.9;
    this.soilMesh.material = this.matSoil;
    this.soilMesh.receiveShadows = true;

    this.moundMesh = MeshBuilder.CreateBox(
      "soilMound",
      { width: 1.32, height: 0.26, depth: 1.32 },
      scene
    );
    this.moundMesh.position.y = 0.04;
    this.moundMesh.material = this.matMound;
    this.moundMesh.receiveShadows = true;

    this.puddleMesh = MeshBuilder.CreateBox(
      "rainPuddle",
      { width: 3.1, height: 0.025, depth: 2.3 },
      scene
    );
    this.puddleMesh.position.y = 0.024;
    this.puddleMesh.material = this.matPuddle;
    this.puddleMesh.receiveShadows = true;

    // 4. Matas de pasto 3D cruzadas alfa-cutout con flores silvestres (reemplazan cubos flotantes)
    this.bladeMaster = crearMallaMataPasto3D(scene, "bladeMaster");
    this.bladeMaster.material = this.matBlade;
    this.bladeMaster.isVisible = false;
    this.bladeMaster.receiveShadows = true;
    this.bladeMaster.isPickable = false;

    let colocadas = 0;
    for (let i = 0; i < 380 && colocadas < 220; i++) {
      const golden = i * 2.3999632;
      const frac = Math.sqrt((i + 0.5) / 380);
      const r = 1.8 + frac * 6.5;
      const bx = Math.cos(golden) * r + Math.sin(i * 4.1) * 0.32;
      const bz = Math.sin(golden) * r + Math.cos(i * 5.7) * 0.32;

      if (Math.abs(bx) > 8.15 || Math.abs(bz) > 8.15) continue;
      // Excluir camellón central
      if (Math.abs(bx) < 4.9 && Math.abs(bz) < 1.58) continue;
      // Excluir interior de cobertizo y zona frontal de mesas
      if (Math.abs(bx) < 1.7 && bz > -4.75 && bz < -2.9) continue;
      // Excluir vereda de piedra
      if (bx > -3.65 && bx < 3.45 && bz > -2.75 && bz < -1.95) continue;
      // Excluir zona de mesas laterales
      if ((Math.abs(bx - 2.8) < 1.0 && Math.abs(bz + 3.4) < 0.9) ||
          (Math.abs(bx + 3.1) < 1.0 && Math.abs(bz + 3.4) < 0.9)) {
        continue;
      }

      const b = this.bladeMaster.createInstance(`patrix_tuft_${colocadas}`) as unknown as Mesh;
      b.position.set(bx, -0.01, bz);
      const sx = 0.78 + ((i * 19) % 10) * 0.068;
      const sy = 0.72 + ((i * 29) % 10) * 0.075;
      b.scaling.set(sx, sy, sx);
      b.rotation.y = ((i * 47) % 360) * (Math.PI / 180);
      b.isPickable = false;
      b.receiveShadows = true;
      b.metadata = { baseRotY: b.rotation.y, phase: (i * 0.73) % (Math.PI * 2) };
      this.bladeInstances.push(b);
      colocadas++;
    }

    // 5. Sol Patrix + Corona + Rayos Crepusculares + Luna + Bóveda Estelar
    this.sunNode = new TransformNode("sunNode", scene);
    const configurarPlanoCeleste = (m: Mesh, alphaIdx: number, usarInfinite = false) => {
      m.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
      m.parent = this.sunNode;
      m.isPickable = false;
      m.applyFog = false;
      m.infiniteDistance = usarInfinite;
      m.alphaIndex = alphaIdx;
    };

    this.sunMesh = MeshBuilder.CreatePlane("sunMesh", { size: 28 }, scene);
    this.sunMesh.position.set(-180, 140, -140);
    this.sunMesh.material = this.matSun;
    configurarPlanoCeleste(this.sunMesh, -8);

    this.haloMesh = MeshBuilder.CreatePlane("haloMesh", { size: 88 }, scene);
    this.haloMesh.position.copyFrom(this.sunMesh.position);
    this.haloMesh.material = this.matHalo;
    configurarPlanoCeleste(this.haloMesh, -9);

    this.sunRaysMesh = MeshBuilder.CreatePlane("sunRaysMesh", { size: 112 }, scene);
    this.sunRaysMesh.position.copyFrom(this.sunMesh.position);
    this.sunRaysMesh.material = this.matSunRays;
    configurarPlanoCeleste(this.sunRaysMesh, -10);

    this.moonMesh = MeshBuilder.CreatePlane("moonMesh", { size: 24 }, scene);
    this.moonMesh.position.set(180, -140, 140);
    this.moonMesh.material = this.matMoon;
    configurarPlanoCeleste(this.moonMesh, -7);

    this.moonHaloMesh = MeshBuilder.CreatePlane("moonHaloMesh", { size: 64 }, scene);
    this.moonHaloMesh.position.copyFrom(this.moonMesh.position);
    this.moonHaloMesh.material = this.matMoonHalo;
    configurarPlanoCeleste(this.moonHaloMesh, -11);

    this.starNode = new TransformNode("starDomeNode", scene);
    this.starLayerA = crearCapaEstrellas(scene, "starLayerA", 380, 385, 1.45, 4242, this.matStarA);
    this.starLayerA.parent = this.starNode;
    this.starLayerB = crearCapaEstrellas(scene, "starLayerB", 340, 390, 1.15, 9187, this.matStarB);
    this.starLayerB.parent = this.starNode;

    // 6. Cielo atmosférico SkyMaterial + IBL
    this.construirCupulaCielo();

    // 7. Nubes altas suaves con volumen orgánico
    const cloudDefs = [
      [-14, 24, -14],
      [9, 26, -16],
      [-5, 25, 13],
      [15, 27, 8],
      [-19, 25, 3],
      [2, 28, -24],
    ];
    cloudDefs.forEach(([x, y, z], i) => {
      const n = new TransformNode(`cloud_${i}`, scene);
      n.position.set(x, y, z);
      const bloques = [
        [0, 0, 0, 4.4, 0.9, 2.5],
        [1.9, 0.25, 0.25, 2.8, 0.75, 2.0],
        [-1.8, -0.08, -0.25, 2.5, 0.65, 1.9],
      ];
      bloques.forEach(([bx, by, bz, w, h, d], bIdx) => {
        const box = MeshBuilder.CreateBox(
          `cloudBox_${i}_${bIdx}`,
          { width: w, height: h, depth: d },
          scene
        );
        box.position.set(bx, by, bz);
        box.material = this.matCloud;
        box.parent = n;
        box.isPickable = false;
        this.estiloPatrix.agregarMeshAIBL(box);
      });
      this.clouds.push(n);
    });

    // 8. Lluvia física sutil
    const engineNombre = scene.getEngine()?.constructor?.name ?? "";
    if (engineNombre !== "NullEngine") {
      this.rainSystem = new ParticleSystem("rainParticles", 420, scene);
      const texGota = new DynamicTexture("texGota", { width: 8, height: 32 }, scene, false);
      const gctx = texGota.getContext();
      gctx.clearRect(0, 0, 8, 32);
      gctx.fillStyle = "rgba(185, 222, 250, 0.82)";
      gctx.fillRect(3, 2, 2, 28);
      texGota.update();
      this.rainSystem.particleTexture = texGota;
      this.rainSystem.emitter = new Vector3(0, 9.5, 0);
      this.rainSystem.minEmitBox = new Vector3(-9, 0, -9);
      this.rainSystem.maxEmitBox = new Vector3(9, 0, 9);
      this.rainSystem.color1 = new Color4(0.75, 0.88, 0.98, 0.58);
      this.rainSystem.color2 = new Color4(0.58, 0.74, 0.92, 0.42);
      this.rainSystem.minSize = 0.08;
      this.rainSystem.maxSize = 0.14;
      this.rainSystem.minScaleY = 5.5;
      this.rainSystem.maxScaleY = 9.0;
      this.rainSystem.minLifeTime = 0.7;
      this.rainSystem.maxLifeTime = 1.05;
      this.rainSystem.emitRate = 0;
      this.rainSystem.direction1 = new Vector3(-0.35, -13, 0);
      this.rainSystem.direction2 = new Vector3(0.35, -15, 0);
      this.rainSystem.gravity = new Vector3(0, -8, 0);
      this.rainSystem.start();
    }

    // 9. Cobertizo Patrix + Detalles de milpa + Granja exterior + Cordillera
    this.construirCobertizoLobby();
    this.construirDetallesMilpaVoxel();
    this.granjaDecorativa = new GranjaDecorativa(scene, this.shadowGen);
    this.construirValleVolcanes();

    // Enlazar superficies reflectoras al agua del estanque exterior si existe
    this.granjaDecorativa.vincularAguaReflectiva([
      this.cupulaCielo,
      this.sunMesh,
      this.moonMesh,
      ...this.paisaje.meshesMontana,
    ]);

    this.estiloPatrix.unificarMaterialesRestantes();
    this.estiloPatrix.refrescarIBL();
  }

  private construirValleVolcanes(): void {
    this.matNieveVolcan = crearMaterialPatrixPBR(this.scene, "nieve_alpina", {
      nombre: "patrixNieveVolcan",
      uScale: 6,
      vScale: 6,
    });
    this.paisaje = new PaisajeExterior(this.scene, this.matNieveVolcan, this.shadowGen);
    this.volcanesMeshes.push(...this.paisaje.meshesMontana);
  }

  private construirCupulaCielo(): void {
    this.matCielo = new SkyMaterial("skyMatPatrix", this.scene);
    this.matCielo.backFaceCulling = false;
    this.matCielo.useSunPosition = true;
    this.matCielo.sunPosition = new Vector3(-28, 20, -24);
    this.matCielo.luminance = 0.96;
    this.matCielo.turbidity = 3.2;
    this.matCielo.rayleigh = 1.75;
    this.matCielo.mieCoefficient = 0.005;
    this.matCielo.mieDirectionalG = 0.82;
    this.matCielo.dithering = true;
    this.matCielo.metadata = { patrixSkip: true };

    this.cupulaCielo = MeshBuilder.CreateSphere(
      "cupulaCielo",
      { diameter: 900, segments: 28, sideOrientation: Mesh.BACKSIDE },
      this.scene
    );
    this.cupulaCielo.material = this.matCielo;
    this.cupulaCielo.isPickable = false;
    this.cupulaCielo.infiniteDistance = true;
    this.cupulaCielo.applyFog = false;

    this.estiloPatrix.agregarMeshAIBL(this.cupulaCielo);
    this.estiloPatrix.agregarMeshAIBL(this.sunMesh);
    this.estiloPatrix.agregarMeshAIBL(this.haloMesh);
    this.estiloPatrix.agregarMeshAIBL(this.moonMesh);
  }

  /**
   * Cobertizo rústico estilo aldea Patrix:
   * basas de piedra musgosa, pilares y tornapuntas de roble oscuro,
   * techo a dos aguas de paja dorada escalonada y farol de hierro forjado cálido.
   */
  private construirCobertizoLobby(): void {
    const shedRoot = new TransformNode("cobertizoLobby", this.scene);
    shedRoot.position.set(0, 0, -3.8);

    const matRoble = crearMaterialPatrixPBR(this.scene, "madera_roble", {
      nombre: "patrixCobertizoRoble",
      uScale: 2,
      vScale: 2,
      cacheable: true,
    });
    const matOscura = crearMaterialPatrixPBR(this.scene, "madera_oscura", {
      nombre: "patrixCobertizoOscura",
      uScale: 1,
      vScale: 3,
      cacheable: true,
    });
    const matCobble = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixCobertizoPiedra",
      uScale: 1,
      vScale: 1,
      cacheable: true,
    });
    const matPaja = crearMaterialPatrixPBR(this.scene, "techo_paja", {
      nombre: "patrixCobertizoPaja",
      uScale: 3,
      vScale: 2,
      cacheable: true,
    });
    const matForja = crearMaterialPatrixPBR(this.scene, "metal_forjado", {
      nombre: "patrixCobertizoForja",
      cacheable: true,
    });

    const posPostes: Array<[number, number]> = [
      [-1.3, -0.7],
      [1.3, -0.7],
      [-1.3, 0.7],
      [1.3, 0.7],
    ];

    posPostes.forEach(([x, z], i) => {
      // Plinto inferior de piedra musgosa
      const basa = MeshBuilder.CreateBox(
        `plintoCobertizo_${i}`,
        { width: 0.28, height: 0.26, depth: 0.28 },
        this.scene
      );
      basa.position.set(x, 0.13, z);
      basa.material = matCobble;
      basa.parent = shedRoot;
      basa.receiveShadows = true;
      this.shadowGen.addShadowCaster(basa);
      basa.freezeWorldMatrix();

      // Pilar de roble oscuro
      const p = MeshBuilder.CreateBox(
        `posteCobertizo_${i}`,
        { width: 0.16, height: 2.1, depth: 0.16 },
        this.scene
      );
      p.position.set(x, 1.25, z);
      p.material = matOscura;
      p.parent = shedRoot;
      p.receiveShadows = true;
      registrarCaja(`posteCobertizo_${i}`, x, -3.8 + z, 0.15, 0.15);
      this.shadowGen.addShadowCaster(p);
      p.freezeWorldMatrix();

      // Tornapuntas en X hacia la viga superior
      const braceX = MeshBuilder.CreateBox(
        `braceX_${i}`,
        { width: 0.10, height: 0.45, depth: 0.10 },
        this.scene
      );
      const sx = x < 0 ? 1 : -1;
      braceX.position.set(x + sx * 0.18, 2.02, z);
      braceX.rotation.z = sx * (Math.PI / 4);
      braceX.material = matRoble;
      braceX.parent = shedRoot;
      braceX.freezeWorldMatrix();
    });

    // Vigas horizontales principales (aleros + cabezales laterales)
    for (const zBeam of [-0.7, 0.7]) {
      const viga = MeshBuilder.CreateBox(
        `vigaCobertizo_${zBeam}`,
        { width: 3.15, height: 0.15, depth: 0.16 },
        this.scene
      );
      viga.position.set(0, 2.24, zBeam);
      viga.material = matOscura;
      viga.parent = shedRoot;
      viga.receiveShadows = true;
      this.shadowGen.addShadowCaster(viga);
      viga.freezeWorldMatrix();
    }

    for (const xBeam of [-1.3, 1.3]) {
      const cabezal = MeshBuilder.CreateBox(
        `cabezalCobertizo_${xBeam}`,
        { width: 0.15, height: 0.15, depth: 1.75 },
        this.scene
      );
      cabezal.position.set(xBeam, 2.24, 0);
      cabezal.material = matOscura;
      cabezal.parent = shedRoot;
      cabezal.receiveShadows = true;
      this.shadowGen.addShadowCaster(cabezal);
      cabezal.freezeWorldMatrix();
    }

    // Murete bajo de piedra atrás (protege la mesa sin bloquear el paso)
    const murete = MeshBuilder.CreateBox(
      "mureteFondoCobertizo",
      { width: 2.38, height: 0.42, depth: 0.20 },
      this.scene
    );
    murete.position.set(0, 0.21, -0.70);
    murete.material = matCobble;
    murete.parent = shedRoot;
    murete.receiveShadows = true;
    this.shadowGen.addShadowCaster(murete);
    murete.freezeWorldMatrix();

    // Techo a dos aguas de paja dorada escalonada estilo Patrix
    for (const lado of [-1, 1]) {
      const faldon = MeshBuilder.CreateBox(
        `techoPaja_${lado}`,
        { width: 3.55, height: 0.18, depth: 1.38 },
        this.scene
      );
      faldon.position.set(0, 2.58, lado * 0.56);
      faldon.rotation.x = lado * 0.46;
      faldon.material = matPaja;
      faldon.parent = shedRoot;
      faldon.receiveShadows = true;
      this.shadowGen.addShadowCaster(faldon);
      faldon.freezeWorldMatrix();
    }

    // Cumbrera superior de roble + remate de paja
    const cumbrera = MeshBuilder.CreateBox(
      "cumbreraCobertizo",
      { width: 3.65, height: 0.16, depth: 0.22 },
      this.scene
    );
    cumbrera.position.set(0, 2.90, 0);
    cumbrera.material = matOscura;
    cumbrera.parent = shedRoot;
    cumbrera.receiveShadows = true;
    this.shadowGen.addShadowCaster(cumbrera);
    cumbrera.freezeWorldMatrix();

    // Cabrios frontales visibles bajo el alero
    for (let rx = -1.35; rx <= 1.36; rx += 0.675) {
      const cabrio = MeshBuilder.CreateBox(
        `cabrio_${rx.toFixed(1)}`,
        { width: 0.08, height: 0.10, depth: 2.35 },
        this.scene
      );
      cabrio.position.set(rx, 2.34, 0);
      cabrio.material = matRoble;
      cabrio.parent = shedRoot;
      cabrio.freezeWorldMatrix();
    }

    // Farol rústico de hierro forjado + núcleo cálido + PointLight
    const farolSoporte = MeshBuilder.CreateBox(
      "farolSoporte",
      { width: 0.05, height: 0.26, depth: 0.05 },
      this.scene
    );
    farolSoporte.position.set(0, 2.08, 0.7);
    farolSoporte.material = matForja;
    farolSoporte.parent = shedRoot;

    const farolTapa = MeshBuilder.CreateBox(
      "farolTapa",
      { width: 0.22, height: 0.05, depth: 0.22 },
      this.scene
    );
    farolTapa.position.set(0, 1.98, 0.7);
    farolTapa.material = matForja;
    farolTapa.parent = shedRoot;

    const farol = MeshBuilder.CreateBox(
      "farolLuz",
      { width: 0.16, height: 0.20, depth: 0.16 },
      this.scene
    );
    farol.position.set(0, 1.87, 0.7);
    this.matFarolLuz = new StandardMaterial("farolLuzMat", this.scene);
    this.matFarolLuz.emissiveColor = new Color3(1.0, 0.74, 0.26).scale(1.45);
    this.matFarolLuz.diffuseColor = new Color3(1.0, 0.85, 0.45);
    this.matFarolLuz.disableLighting = true;
    this.matFarolLuz.metadata = { patrixSkip: true, esEmisivoReal: true };
    farol.material = this.matFarolLuz;
    farol.parent = shedRoot;

    this.farolPointLight = new PointLight(
      "farolLuzPuntual",
      new Vector3(0, 1.78, -3.05),
      this.scene
    );
    this.farolPointLight.diffuse = new Color3(1.0, 0.72, 0.32);
    this.farolPointLight.specular = new Color3(1.0, 0.78, 0.40);
    this.farolPointLight.intensity = 2.6;
    this.farolPointLight.range = 12.0;

    // Luz cálida de brasas sobre el fogón tradicional (x=2.8, z=-3.4) para atardeceres y noches
    this.fogonPointLight = new PointLight(
      "fogonLuzPuntual",
      new Vector3(3.15, 1.05, -3.4),
      this.scene
    );
    this.fogonPointLight.diffuse = new Color3(1.0, 0.56, 0.22);
    this.fogonPointLight.specular = new Color3(1.0, 0.65, 0.32);
    this.fogonPointLight.intensity = 0.6;
    this.fogonPointLight.range = 8.0;
  }

  /** Vereda empedrada musgosa, barda rústica de roble y 4 árboles con copas alfa-cutout. */
  private construirDetallesMilpaVoxel(): void {
    const matCobble = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
      nombre: "patrixDetallePiedra",
      uScale: 1,
      vScale: 1,
      cacheable: true,
    });
    const matRoble = crearMaterialPatrixPBR(this.scene, "madera_roble", {
      nombre: "patrixDetalleRoble",
      uScale: 2,
      vScale: 1,
      cacheable: true,
    });
    const matMaderaOsc = crearMaterialPatrixPBR(this.scene, "madera_oscura", {
      nombre: "patrixDetalleOscura",
      uScale: 1,
      vScale: 2,
      cacheable: true,
    });
    const matCorteza = crearMaterialPatrixPBR(this.scene, "tronco_corteza", {
      nombre: "patrixDetalleCorteza",
      uScale: 1,
      vScale: 2,
      cacheable: true,
    });
    const matFollaje = crearMaterialPatrixPBR(sceneSafe(this.scene), "follaje_roble", {
      nombre: "patrixDetalleFollaje",
      uScale: 1,
      vScale: 1,
      usarPOM: false,
      cacheable: true,
    });

    // 1. Vereda de lajas irregulares de piedra musgosa
    for (let x = -3.4; x <= 3.2; x += 0.62) {
      const idx = Math.round((x + 3.4) * 10);
      const laja = MeshBuilder.CreateBox(
        `vereda_${x.toFixed(1)}`,
        {
          width: 0.46 + (idx % 3) * 0.04,
          height: 0.032,
          depth: 0.44 + ((idx + 1) % 3) * 0.04,
        },
        this.scene
      );
      laja.position.set(x, 0.014, -2.35 + (idx % 2) * 0.06);
      laja.rotation.y = ((idx % 5) - 2) * 0.08;
      laja.material = matCobble;
      laja.receiveShadows = true;
      laja.isPickable = false;
      laja.freezeWorldMatrix();
    }

    // 2. Barda rústica de roble con portón de piedra al sur
    const limitesBarda: Array<[number, number, number, number]> = [
      [-8.4, 8.4, -8.4, 0],
      [-8.4, -1.4, 8.4, 0],
      [1.4, 8.4, 8.4, 0],
      [-8.4, 8.4, -8.4, 1],
      [-8.4, 8.4, 8.4, 1],
    ];
    limitesBarda.forEach(([minC, maxC, fijo, eje], idx) => {
      const largo = maxC - minC;
      const centro = (minC + maxC) / 2;
      for (const alt of [0.34, 0.68]) {
        const trav = MeshBuilder.CreateBox(
          `bardaTrav_${idx}_${alt}`,
          {
            width: eje === 0 ? largo : 0.08,
            height: 0.09,
            depth: eje === 1 ? largo : 0.08,
          },
          this.scene
        );
        trav.position.set(eje === 0 ? centro : fijo, alt, eje === 0 ? fijo : centro);
        trav.material = matRoble;
        trav.receiveShadows = true;
        this.shadowGen.addShadowCaster(trav);
        trav.freezeWorldMatrix();
      }
      const paso = Math.max(1.75, largo / Math.max(1, Math.round(largo / 2.1)));
      for (let c = minC; c <= maxC + 0.01; c += paso) {
        const poste = MeshBuilder.CreateBox(
          `bardaPoste_${idx}_${c.toFixed(1)}`,
          { width: 0.14, height: 0.96, depth: 0.14 },
          this.scene
        );
        poste.position.set(eje === 0 ? c : fijo, 0.48, eje === 0 ? fijo : c);
        poste.material = matMaderaOsc;
        poste.receiveShadows = true;
        this.shadowGen.addShadowCaster(poste);
        poste.freezeWorldMatrix();
      }
    });

    // Pilares de piedra musgosa y dintel de madera del portón
    [-1.45, 1.45].forEach((gx, gIdx) => {
      const base = MeshBuilder.CreateBox(
        `portonBase_${gIdx}`,
        { width: 0.36, height: 0.45, depth: 0.36 },
        this.scene
      );
      base.position.set(gx, 0.225, 8.4);
      base.material = matCobble;
      base.receiveShadows = true;
      this.shadowGen.addShadowCaster(base);
      base.freezeWorldMatrix();

      const pilar = MeshBuilder.CreateBox(
        `portonPilar_${gIdx}`,
        { width: 0.26, height: 1.92, depth: 0.26 },
        this.scene
      );
      pilar.position.set(gx, 0.96, 8.4);
      pilar.material = matCobble;
      pilar.receiveShadows = true;
      this.shadowGen.addShadowCaster(pilar);
      pilar.freezeWorldMatrix();
    });
    const dintel = MeshBuilder.CreateBox(
      "portonDintel",
      { width: 3.3, height: 0.22, depth: 0.30 },
      this.scene
    );
    dintel.position.set(0, 1.94, 8.4);
    dintel.material = matMaderaOsc;
    dintel.receiveShadows = true;
    this.shadowGen.addShadowCaster(dintel);
    dintel.freezeWorldMatrix();

    // 3. Cuatro robles de esquina con corteza profunda y copas alfa-cutout traslúcidas
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

      const tronco = MeshBuilder.CreateCylinder(
        `arbolTronco_${idx}`,
        { diameterTop: 0.36, diameterBottom: 0.54, height: 1.85, tessellation: 7 },
        this.scene
      );
      tronco.position.y = 0.92;
      tronco.material = matCorteza;
      tronco.parent = raiz;
      tronco.receiveShadows = true;
      registrarCaja(`arbol_${idx}`, ax, az, 0.42 * esc, 0.42 * esc);
      this.shadowGen.addShadowCaster(tronco);

      // Racimos superpuestos de hojas Patrix (cajas con follaje alfa-cutout + planos cruzados)
      const racimos: Array<[number, number, number, number, number, number]> = [
        [0, 2.05, 0, 2.0, 1.15, 2.0],
        [-0.45, 1.85, 0.35, 1.35, 0.9, 1.35],
        [0.48, 1.92, -0.30, 1.4, 0.95, 1.4],
        [0, 2.68, 0, 1.35, 0.9, 1.35],
      ];
      racimos.forEach(([rx, ry, rz, w, h, d], cIdx) => {
        const copa = MeshBuilder.CreateBox(
          `arbolCopa_${idx}_${cIdx}`,
          { width: w, height: h, depth: d },
          this.scene
        );
        copa.position.set(rx, ry, rz);
        copa.rotation.y = (idx * 0.7 + cIdx * 0.45);
        copa.material = matFollaje;
        copa.parent = raiz;
        copa.receiveShadows = true;
        this.shadowGen.addShadowCaster(copa);
      });
    });
  }

  /** Actualiza iluminación PBR, atmósfera SkyMaterial, sol, luna, estrellas, niebla y respuesta climática continua. */
  public aplicarClima(clima: ClimateState, metricas: Metricas): void {
    const elevDeg = metricas.elevacionSolar;
    const elevRad = (elevDeg * Math.PI) / 180;
    const azimRad = (metricas.azimutSolar * Math.PI) / 180;

    const cosElev = Math.cos(elevRad);
    const dirX = cosElev * Math.sin(azimRad);
    const dirY = Math.sin(elevRad);
    const dirZ = cosElev * Math.cos(azimRad);

    const horaNorm = ((clima.hora % 24) + 24) % 24;
    const esAtardecer = horaNorm >= 12.0;

    const factorNub = clamp01(clima.nubosidad / 100);
    const factorLluvia = clamp01(clima.lluvia / 25);
    const factorPM = clamp01((clima.pm25 - 15) / 110);
    const factorNiebla = clamp01(
      Math.max(factorNub * 0.28, (metricas.niebla ? 0.35 : 0) + Math.max(0, (clima.humedad - 74) / 26))
    );
    const factorTormenta = clamp01(factorNub * 0.55 + factorLluvia * 0.65);

    // Pesos continuos de elevación solar (transiciones suaves sin cortes abruptos)
    const wSol = smoothstep(-2.5, 6.0, elevDeg);
    const wDia = smoothstep(-1.0, 22.0, elevDeg);
    const wNoche = 1.0 - smoothstep(-11.0, 2.5, elevDeg);
    const wCrepusculo =
      clamp01(1.0 - Math.abs(elevDeg - 2.2) / 13.5) * (1.0 - factorTormenta * 0.45);

    // 1. Posicionar Sol (lejano detrás de las montañas) y Luna opuesta
    const sunDist = 260;
    const moonDist = 265;
    this.sunMesh.position.set(dirX * sunDist, dirY * sunDist, dirZ * sunDist);
    this.haloMesh.position.copyFrom(this.sunMesh.position);
    this.sunRaysMesh.position.copyFrom(this.sunMesh.position);

    this.moonMesh.position.set(-dirX * moonDist, -dirY * moonDist, -dirZ * moonDist);
    this.moonHaloMesh.position.copyFrom(this.moonMesh.position);

    // Visibilidad y tinte de Sol y Corona
    const solVis = smoothstep(-4.0, 1.8, elevDeg) * (1.0 - clamp01((factorNub - 0.58) / 0.36));
    this.sunMesh.isVisible = solVis > 0.02;
    this.haloMesh.isVisible = solVis > 0.02 && factorNub < 0.88;
    this.sunRaysMesh.isVisible = solVis > 0.05 && factorNub < 0.72;

    const solTintZenit = new Color3(1.0, 0.98, 0.90);
    const solTintCrep = esAtardecer
      ? new Color3(1.0, 0.80, 0.50)
      : new Color3(1.0, 0.86, 0.64);
    const solTint = mezclarColor(solTintCrep, solTintZenit, wDia);
    this.matSun.emissiveColor.copyFrom(solTint);
    this.matSun.alpha = solVis;

    const coronaScale = 1.0 + wCrepusculo * 0.44 + factorPM * 0.16;
    this.haloMesh.scaling.setAll(coronaScale);
    this.sunRaysMesh.scaling.setAll(1.0 + wCrepusculo * 0.52);
    this.matHalo.emissiveColor.copyFrom(
      mezclarColor(new Color3(1.0, 0.56, 0.24), new Color3(1.0, 0.88, 0.62), wDia)
    );
    this.matHalo.alpha = solVis * (0.58 + wCrepusculo * 0.28) * (1.0 - factorNub * 0.75);
    this.matSunRays.emissiveColor.copyFrom(this.matHalo.emissiveColor);
    this.matSunRays.alpha = solVis * (0.28 + wCrepusculo * 0.34) * (1.0 - factorNub * 0.85);

    // Visibilidad de Luna llena y halo lunar
    const lunaElevDeg = -elevDeg;
    const lunaVis =
      smoothstep(-5.0, 3.0, lunaElevDeg) *
      smoothstep(3.0, -7.0, elevDeg) *
      (1.0 - clamp01((factorNub - 0.62) / 0.34));
    this.moonMesh.isVisible = lunaVis > 0.02;
    this.moonHaloMesh.isVisible = lunaVis > 0.02;
    this.matMoon.alpha = lunaVis;
    this.matMoonHalo.alpha = lunaVis * 0.36 * (1.0 - factorNub * 0.65);

    // Estrellas nocturnas (atenuadas por crepúsculo, nubes, lluvia y niebla)
    this.intensidadStarBase = clamp01(
      wNoche *
        (1.0 - factorNub * 0.90) *
        (1.0 - factorLluvia * 0.85) *
        (1.0 - factorNiebla * 0.58)
    );
    const mostrarEstrellas = this.intensidadStarBase > 0.01;
    this.starLayerA.isVisible = mostrarEstrellas;
    this.starLayerB.isVisible = mostrarEstrellas;
    this.matStarA.alpha = mostrarEstrellas ? this.intensidadStarBase * 0.92 : 0;
    this.matStarB.alpha = mostrarEstrellas ? this.intensidadStarBase * 0.88 : 0;

    // 2. Luz direccional unificada (crossfade suave Sol <-> Luna con sombras continuas)
    const usarLuna = elevDeg < -1.5;
    const lightDirX = usarLuna ? -dirX : dirX;
    const lightDirY = Math.max(usarLuna ? 0.20 : 0.14, usarLuna ? -dirY : dirY);
    const lightDirZ = usarLuna ? -dirZ : dirZ;
    const lightLen = Math.hypot(lightDirX, lightDirY, lightDirZ) || 1;
    const lx = lightDirX / lightLen;
    const ly = lightDirY / lightLen;
    const lz = lightDirZ / lightLen;

    this.sunLight.position.set(lx * 64, ly * 64, lz * 64);
    this.sunLight.direction.set(-lx, -ly, -lz);

    const sunIntens =
      smoothstep(-1.5, 16.0, elevDeg) * (3.75 - 2.30 * factorNub - 0.65 * factorLluvia);
    const moonIntens =
      smoothstep(-1.5, -9.0, elevDeg) * (0.64 - 0.30 * factorNub - 0.14 * factorLluvia);
    this.sunLight.intensity = Math.max(0.06, sunIntens + moonIntens);

    const colorSolZenit = new Color3(1.0, 0.93, 0.80);
    const colorSolCrep = esAtardecer
      ? new Color3(1.0, 0.54, 0.28)
      : new Color3(1.0, 0.65, 0.42);
    let colorSol = mezclarColor(colorSolCrep, colorSolZenit, wDia);
    colorSol = mezclarColor(colorSol, new Color3(0.76, 0.81, 0.88), factorNub * 0.72);
    colorSol = mezclarColor(colorSol, new Color3(1.0, 0.82, 0.62), factorPM * 0.36);

    const colorLuna = mezclarColor(
      new Color3(0.56, 0.72, 1.0),
      new Color3(0.45, 0.54, 0.70),
      factorNub * 0.5
    );
    const colorDir = wSol > 0.01 ? mezclarColor(colorLuna, colorSol, wSol) : colorLuna;
    this.sunLight.diffuse.copyFrom(colorDir);
    this.sunLight.specular.copyFrom(mezclarColor(colorDir, Color3.White(), 0.24));

    const darknessBase = lerpNum(lerpNum(0.24, 0.14, wDia), 0.44, wNoche);
    this.shadowGen.setDarkness(Math.min(0.68, darknessBase + factorNub * 0.22));

    // 3. Iluminación hemisférica (cielo + rebote del suelo según hora y clima)
    const hemiDia = new Color3(0.76, 0.88, 1.0);
    const hemiCrep = esAtardecer
      ? new Color3(0.86, 0.56, 0.68)
      : new Color3(0.84, 0.66, 0.76);
    const hemiNoche = new Color3(0.24, 0.36, 0.64);
    let hemiDiff = mezclarColor(hemiDia, hemiCrep, wCrepusculo);
    hemiDiff = mezclarColor(hemiDiff, hemiNoche, wNoche);
    hemiDiff = mezclarColor(
      hemiDiff,
      usarLuna ? new Color3(0.20, 0.26, 0.38) : new Color3(0.58, 0.64, 0.72),
      factorNub * 0.58
    );
    if (clima.temperatura <= 3) {
      hemiDiff = mezclarColor(hemiDiff, new Color3(0.68, 0.84, 1.0), 0.22);
    }

    const gndDia = new Color3(0.36, 0.31, 0.22);
    const gndCrep = new Color3(0.42, 0.26, 0.19);
    const gndNoche = new Color3(0.11, 0.14, 0.21);
    const hemiGround = mezclarColor(mezclarColor(gndDia, gndCrep, wCrepusculo), gndNoche, wNoche);

    this.hemiLight.diffuse.copyFrom(hemiDiff);
    this.hemiLight.groundColor.copyFrom(hemiGround);
    const hemiIntBase = lerpNum(lerpNum(0.44, 0.62, wDia), 0.28, wNoche);
    this.hemiLight.intensity = Math.max(0.16, hemiIntBase * (1.0 - factorTormenta * 0.28));

    // 4. Atmósfera SkyMaterial (día azul radiante ~0.85, ocaso cobalto-ámbar ~0.88, noche profunda ~1.13)
    this.matCielo.sunPosition.set(dirX * 420, dirY * 420, dirZ * 420);
    this.matCielo.luminance = Math.max(
      0.52,
      Math.min(1.15, lerpNum(lerpNum(0.88, 0.84, wDia), 1.13, wNoche) - factorNub * 0.06)
    );
    this.matCielo.turbidity = Math.max(
      1.6,
      lerpNum(2.6, 4.6, wCrepusculo) + factorNub * 3.8 + factorPM * 4.5 - wNoche * 1.2
    );
    this.matCielo.rayleigh = Math.max(
      0.42,
      lerpNum(1.65, 2.15, wCrepusculo) * (1.0 - factorNub * 0.35) * (1.0 - wNoche * 0.45)
    );
    this.matCielo.mieCoefficient =
      lerpNum(0.0042, 0.011, wCrepusculo) + factorPM * 0.012 + factorNub * 0.005;
    this.matCielo.mieDirectionalG = lerpNum(0.82, 0.87, wCrepusculo);
    // Integrar niebla densa de tormenta/bruma sobre la cúpula celeste sin arruinar cielos despejados
    this.cupulaCielo.applyFog = factorTormenta > 0.55 || factorNiebla > 0.65;

    // 5. Niebla y color de fondo alineados con horario, PM2.5, tormenta y helada
    const fogDia = new Color3(0.74, 0.85, 0.95);
    const fogCrep = esAtardecer
      ? new Color3(0.86, 0.52, 0.36)
      : new Color3(0.84, 0.60, 0.54);
    const fogNoche = new Color3(0.04, 0.07, 0.15);
    let fogColor = mezclarColor(fogDia, fogCrep, wCrepusculo);
    fogColor = mezclarColor(fogColor, fogNoche, wNoche);
    const stormFog = usarLuna ? new Color3(0.06, 0.08, 0.13) : new Color3(0.46, 0.52, 0.59);
    fogColor = mezclarColor(fogColor, stormFog, factorTormenta * 0.78);
    if (factorPM > 0.05 && wSol > 0.1) {
      fogColor = mezclarColor(fogColor, new Color3(0.76, 0.66, 0.52), factorPM * wSol * 0.42);
    }

    this.scene.fogColor.copyFrom(fogColor);
    this.scene.fogDensity =
      lerpNum(0.0021, 0.0033, wCrepusculo) +
      wNoche * 0.0005 +
      factorNub * 0.0020 +
      factorLluvia * 0.0026 +
      factorNiebla * 0.0038 +
      factorPM * 0.0018;

    const clearCielo = mezclarColor(
      fogColor,
      usarLuna ? new Color3(0.02, 0.04, 0.10) : new Color3(0.56, 0.76, 0.94),
      0.32 * (1.0 - factorTormenta)
    );
    this.scene.clearColor.set(clearCielo.r, clearCielo.g, clearCielo.b, 1.0);

    // 6. Farol del cobertizo + brasas del fogón tradicional
    const factorCalidoNoche = clamp01(wNoche + wCrepusculo * 0.75 + factorTormenta * 0.35);
    if (this.farolPointLight) {
      this.farolPointLight.intensity = 0.6 + factorCalidoNoche * 6.4;
    }
    this.matFarolLuz.emissiveColor.set(
      1.0 * (0.65 + factorCalidoNoche * 0.95),
      0.72 * (0.65 + factorCalidoNoche * 0.95),
      0.26 * (0.65 + factorCalidoNoche * 0.95)
    );
    this.intensidadFogonBase = 0.25 + factorCalidoNoche * 3.8;
    if (this.fogonPointLight) {
      this.fogonPointLight.intensity = this.intensidadFogonBase;
    }

    // 7. Vegetación / Nieve estacional (helada, canícula/sequía, lluvia)
    let colorPasto = new Color3(0.95, 1.0, 0.92);
    let esFrost = false;
    if (clima.temperatura <= 3) {
      colorPasto = new Color3(0.74, 0.86, 0.90);
      esFrost = true;
    } else if (clima.temperatura >= 33 && metricas.irradiancia > 400) {
      const kSeco = Math.min(1, (clima.temperatura - 32) / 10);
      colorPasto = mezclarColor(colorPasto, new Color3(1.04, 0.90, 0.62), kSeco);
    } else if (clima.lluvia > 0.2) {
      colorPasto = new Color3(0.84, 0.95, 0.82);
    }
    this.matGrass.albedoColor = colorPasto;
    this.matBlade.albedoColor = colorPasto;
    this.matNieveVolcan.albedoColor = esFrost ? new Color3(0.90, 0.96, 1.0) : Color3.White();

    // 8. Partículas de lluvia
    if (this.rainSystem) {
      this.rainSystem.emitRate = clima.lluvia > 0.2 ? 90 + factorLluvia * 460 : 0;
    }

    // 9. Nubes con iluminación direccional de amanecer/ocaso/noche y tormenta
    const numNubesVisibles = Math.max(1, Math.round(factorNub * this.clouds.length));
    this.clouds.forEach((c, idx) => {
      c.setEnabled(idx < numNubesVisibles);
    });
    const nubDiaAlbedo = new Color3(0.98, 0.99, 1.0);
    const nubCrepAlbedo = esAtardecer
      ? new Color3(0.96, 0.66, 0.50)
      : new Color3(0.96, 0.74, 0.64);
    const nubNocheAlbedo = new Color3(0.24, 0.30, 0.44);
    let nubAlbedo = mezclarColor(nubDiaAlbedo, nubCrepAlbedo, wCrepusculo);
    nubAlbedo = mezclarColor(nubAlbedo, nubNocheAlbedo, wNoche);
    nubAlbedo = mezclarColor(
      nubAlbedo,
      usarLuna ? new Color3(0.14, 0.17, 0.24) : new Color3(0.50, 0.55, 0.62),
      factorNub * 0.72 + factorLluvia * 0.25
    );
    this.matCloud.albedoColor.copyFrom(nubAlbedo);

    const nubDiaEmissive = new Color3(0.22, 0.25, 0.31);
    const nubCrepEmissive = esAtardecer
      ? new Color3(0.44, 0.20, 0.12)
      : new Color3(0.38, 0.22, 0.18);
    const nubNocheEmissive = new Color3(0.03, 0.04, 0.08);
    let nubEmissive = mezclarColor(nubDiaEmissive, nubCrepEmissive, wCrepusculo);
    nubEmissive = mezclarColor(nubEmissive, nubNocheEmissive, wNoche);
    nubEmissive = mezclarColor(
      nubEmissive,
      usarLuna ? new Color3(0.02, 0.03, 0.05) : new Color3(0.12, 0.14, 0.18),
      factorNub * 0.65
    );
    this.matCloud.emissiveColor.copyFrom(nubEmissive);

    // 10. Sincronizar estanque exterior, ventanas del molino y color-grading ACES
    this.granjaDecorativa.actualizarAtmosfera(
      wNoche,
      wCrepusculo,
      factorNub,
      clima.viento,
      colorDir
    );
    this.estiloPatrix.aplicarGradoHorario(wDia, wNoche, wCrepusculo, factorNub, esAtardecer);
    this.estiloPatrix.actualizarRayosSolares(
      clamp01(wSol * (1.0 - factorNub * 0.85) * (0.45 + wCrepusculo * 0.85)),
      elevDeg > -1.0
    );

    // 11. Refresco inteligente de IBL (cada 0.15h o cambio climático notable para mantener 60fps)
    const cambioHora = Math.abs(clima.hora - this.ultimaHoraIBL);
    const cambioNub = Math.abs(clima.nubosidad - this.ultimaNubIBL);
    if (
      Math.abs(this.tiempoTotal - this.ultimoRefrescoIBL) > 0.75 &&
      (cambioHora >= 0.14 || cambioNub >= 6 || this.ultimaHoraIBL < 0)
    ) {
      this.estiloPatrix.refrescarIBL();
      this.ultimoRefrescoIBL = this.tiempoTotal;
      this.ultimaHoraIBL = clima.hora;
      this.ultimaNubIBL = clima.nubosidad;
    }
  }

  /** Actualiza humedad visual de suelos y charco con respuesta física de rugosidad PBR. */
  public actualizarHumedadVisual(humedadPorc: number): void {
    const h = Math.max(0, Math.min(1, humedadPorc / 100));
    // Tierra se oscurece y vuelve más especular/húmeda al bajar su roughness
    const mulSuelo = mezclarColor(new Color3(1.06, 0.98, 0.88), new Color3(0.56, 0.48, 0.40), h);
    this.matMound.albedoColor = mulSuelo;
    this.matMound.roughness = 1.0 - h * 0.42;

    if (h > 0.72) {
      const kCharco = (h - 0.72) / 0.28;
      this.matPuddle.alpha = kCharco * 0.72;
      this.puddleMesh.isVisible = true;
    } else {
      this.matPuddle.alpha = 0;
      this.puddleMesh.isVisible = false;
    }
  }

  /** Animación por frame: nubes, bóveda estelar, rayos solares, fogón, viento y animales. */
  public animar(dt: number, vientoMs: number): void {
    this.tiempoTotal += dt;
    const velNubes = (0.28 + vientoMs * 0.16) * dt;
    for (const c of this.clouds) {
      c.position.x += velNubes;
      if (c.position.x > 26) {
        c.position.x = -26;
      }
    }

    // Rotación y centelleo sutil en dos capas estelares
    if (this.intensidadStarBase > 0.01) {
      this.starNode.rotation.y += dt * 0.0024;
      const pulseA = 0.82 + 0.18 * Math.sin(this.tiempoTotal * 1.9);
      const pulseB = 0.80 + 0.20 * Math.cos(this.tiempoTotal * 2.5 + 1.1);
      this.matStarA.alpha = this.intensidadStarBase * pulseA;
      this.matStarB.alpha = this.intensidadStarBase * pulseB;
    } else if (this.ultimoTiempoStarFade !== 0) {
      this.matStarA.alpha = 0;
      this.matStarB.alpha = 0;
      this.ultimoTiempoStarFade = 0;
    }
    if (this.intensidadStarBase > 0.01) {
      this.ultimoTiempoStarFade = this.intensidadStarBase;
    }

    // Giro suave de los haces de corona solar en textura 2D (sin conflicto con billboard)
    if (this.sunRaysMesh.isVisible && this.matSunRays.diffuseTexture) {
      (this.matSunRays.diffuseTexture as DynamicTexture).wAng += dt * 0.055;
    }

    // Parpadeo cálido sutil de las brasas del fogón tradicional
    if (this.fogonPointLight && this.intensidadFogonBase > 0.3) {
      const flicker =
        0.92 +
        0.05 * Math.sin(this.tiempoTotal * 7.3) +
        0.03 * Math.cos(this.tiempoTotal * 13.1);
      this.fogonPointLight.intensity = this.intensidadFogonBase * flicker;
    }

    // Balanceo orgánico por brisa en las matas de pasto 3D (cero cubos flotantes)
    const ampViento = 0.04 + Math.min(0.14, vientoMs * 0.015);
    const freq = 1.9 + vientoMs * 0.35;
    for (let i = 0; i < this.bladeInstances.length; i++) {
      const b = this.bladeInstances[i];
      const meta = b.metadata as { phase?: number } | undefined;
      const phase = meta?.phase ?? 0;
      b.rotation.z = Math.sin(this.tiempoTotal * freq + phase + b.position.x * 0.5) * ampViento;
      b.rotation.x = Math.cos(this.tiempoTotal * freq * 0.7 + phase) * ampViento * 0.5;
    }

    this.granjaDecorativa.animar(dt, vientoMs);
  }
}

function sceneSafe(scene: Scene): Scene {
  return scene;
}
