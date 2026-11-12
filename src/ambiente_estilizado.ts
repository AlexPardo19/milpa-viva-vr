/**
 * Entorno estilizado (Cel-Shaded / Caricatura) con Babylon.js
 *
 * Reproduce fielmente el escenario botánico de la imagen de referencia:
 * - Podio cilíndrico de césped verde vibrante (#8fd44a) con borde de tinta oscura (#25330f).
 * - Estrato de suelo edáfico marrón (#8a5a2b).
 * - Montículo central de aporque de milpa (#7a4c22) con borde de tinta.
 * - 80 briznas 3D cónicas de pasto dispersas sobre el terreno.
 * - Lámina de agua reflectante reactiva al encharcamiento e hipoxia radicular.
 * - Sol de caricatura (#ffd53a) con halo radiante translúcido (#ffe680) orientado por la hora solar.
 * - Nubes esponjosas de esferas blancas compuestas que viajan con el viento.
 * - Efecto de lluvia suave o tormenta según la variable de precipitación.
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
  Texture,
  DynamicTexture
} from "@babylonjs/core";
import { ClimateState, Metricas } from "./clima";

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

  constructor(scene: Scene) {
    this.scene = scene;
    scene.clearColor = new Color4(0.74, 0.90, 0.97, 1.0);

    // 1. ILUMINACIÓN ESTILIZADA
    this.hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    this.hemiLight.intensity = 0.85;
    this.hemiLight.groundColor = new Color3(0.75, 0.65, 0.45);

    this.sunLight = new DirectionalLight("sunDir", new Vector3(-0.5, -1, -0.4), scene);
    this.sunLight.position = new Vector3(6, 12, 5);
    this.sunLight.intensity = 0.65;

    this.shadowGen = new ShadowGenerator(1024, this.sunLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 24;
    this.shadowGen.setDarkness(0.5);

    // 2. MATERIALES BASE REALISTAS DE CAMPO AGRÍCOLA
    this.matGrass = this.crearMat("#5a8c32", 0.22);
    this.matSoil = this.crearMat("#6e4724", 0.20);
    this.matMound = this.crearMat("#5c3a1c", 0.20);
    this.matBlade = this.crearMat("#467524", 0.22);
    this.matSun = this.crearMat("#ffd53a", 0.95);
    this.matHalo = this.crearMat("#ffe680", 0.85);
    this.matHalo.alpha = 0.25;
    this.matCloud = this.crearMat("#f8fafc", 0.65);

    this.matPuddle = new StandardMaterial("matPuddle", scene);
    this.matPuddle.diffuseColor = new Color3(0.12, 0.18, 0.22);
    this.matPuddle.specularColor = new Color3(0.8, 0.8, 0.8);
    this.matPuddle.alpha = 0.0;

    // 3. SUELO CILÍNDRICO CARICATURA (ampliado a 18m para alojar surco y cobertizo)
    this.grassMesh = MeshBuilder.CreateCylinder("grassPodium", { diameter: 18, height: 0.3, tessellation: 56 }, scene);
    this.grassMesh.position.y = -0.15;
    this.grassMesh.material = this.matGrass;
    this.grassMesh.receiveShadows = true;
    this.grassMesh.freezeWorldMatrix();

    this.soilMesh = MeshBuilder.CreateCylinder("soilStratum", { diameter: 17.6, height: 1.2, tessellation: 56 }, scene);
    this.soilMesh.position.y = -0.9;
    this.soilMesh.material = this.matSoil;
    this.soilMesh.freezeWorldMatrix();

    // Montículo de siembra central
    this.moundMesh = MeshBuilder.CreateSphere("mound", { diameter: 1.9 }, scene);
    this.moundMesh.scaling.y = 0.22;
    this.moundMesh.material = this.matMound;
    this.moundMesh.receiveShadows = true;
    this.aplicarTinta(this.moundMesh, 0.03);

    // Lámina de encharcamiento sobre el montículo
    this.puddleMesh = MeshBuilder.CreateCylinder("puddle", { diameter: 1.6, height: 0.01, tessellation: 32 }, scene);
    this.puddleMesh.position.y = 0.022;
    this.puddleMesh.material = this.matPuddle;

    // Construcción del Valle de Volcanes 360° y Cobertizo
    this.construirValleVolcanes();
    this.construirCobertizoLobby();

    // 4. BRIZNAS DE PASTO 3D DISPERSAS
    this.bladeMaster = MeshBuilder.CreateCylinder(
      "bladeMaster",
      { diameterTop: 0, diameterBottom: 0.12, height: 0.5, tessellation: 5 },
      scene
    );
    this.bladeMaster.material = this.matBlade;
    this.bladeMaster.isVisible = false;

    for (let i = 0; i < 80; i++) {
      const a = (i * 7.13) % (Math.PI * 2);
      const r = 1.2 + ((i * 13.7) % 5.2);
      const b = this.bladeMaster.createInstance(`blade_${i}`);
      b.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      b.scaling.y = 0.6 + ((i * 3.3) % 1.0);
      b.rotation.set((((i % 7) - 3.5) / 7) * 0.5, 0, (((i % 5) - 2.5) / 5) * 0.5);
      this.bladeInstances.push(b as unknown as Mesh);
    }

    // 5. SOL Y HALO LUMINOSO
    this.sunNode = new TransformNode("sunNode", scene);
    this.sunMesh = MeshBuilder.CreateSphere("sunMesh", { diameter: 3 }, scene);
    this.sunMesh.position.set(-18, 13, -16);
    this.sunMesh.material = this.matSun;
    this.sunMesh.parent = this.sunNode;

    this.haloMesh = MeshBuilder.CreateSphere("haloMesh", { diameter: 4.6 }, scene);
    this.haloMesh.position.copyFrom(this.sunMesh.position);
    this.haloMesh.material = this.matHalo;
    this.haloMesh.parent = this.sunNode;

    // 6. NUBES VOLUMÉTRICAS DE CARICATURA (COMPUESTAS DE ESFERAS)
    const defNubes = [
      [-12, 10, -8, 1.2],
      [10, 11, -12, 1.5],
      [14, 9, 6, 1.0],
      [-8, 12, 12, 1.3]
    ];
    defNubes.forEach(([x, y, z, s], idx) => {
      const n = new TransformNode(`cloud_${idx}`, scene);
      n.position.set(x, y, z);
      n.scaling.setAll(s);

      const esferas = [
        [0, 0, 0, 2.2],
        [1.4, -0.2, 0.2, 1.7],
        [-1.4, -0.2, 0, 1.6],
        [0.5, 0.5, 0, 1.5]
      ];
      esferas.forEach(([ea, eb, ec, ed], cIdx) => {
        const sph = MeshBuilder.CreateSphere(`c_${idx}_${cIdx}`, { diameter: ed, segments: 10 }, scene);
        sph.position.set(ea, eb, ec);
        sph.material = this.matCloud;
        sph.parent = n;
      });
      this.clouds.push(n);
    });

    // 7. SISTEMA DE LLUVIA DINÁMICO
    this.rainSystem = new ParticleSystem("rainSystem", 600, scene);
    const texRain = new DynamicTexture("texRainAmb", { width: 16, height: 64 }, scene, false);
    const rCtx = texRain.getContext() as any;
    rCtx.fillStyle = "rgba(186, 230, 253, 0.9)";
    rCtx.fillRect(6, 0, 4, 64);
    texRain.update();

    this.rainSystem.particleTexture = texRain;
    this.rainSystem.emitter = new Vector3(0, 15, 0);
    this.rainSystem.minEmitBox = new Vector3(-8, 0, -8);
    this.rainSystem.maxEmitBox = new Vector3(8, 0, 8);
    this.rainSystem.color1 = new Color4(0.7, 0.85, 1.0, 0.85);
    this.rainSystem.color2 = new Color4(0.5, 0.75, 0.95, 0.65);
    this.rainSystem.colorDead = new Color4(0.4, 0.6, 0.9, 0.0);
    this.rainSystem.minSize = 0.15;
    this.rainSystem.maxSize = 0.35;
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

  private aplicarTinta(m: Mesh, width = 0.02, col = "#25330f"): Mesh {
    m.renderOutline = true;
    m.outlineWidth = width;
    m.outlineColor = Color3.FromHexString(col);
    return m;
  }

  private construirValleVolcanes(): void {
    const matVolcan = this.crearMat("#4b5563", 0.35);
    this.matNieveVolcan = this.crearMat("#f8fafc", 0.85);

    const configs = [
      { a: 0.35, r: 30, h: 14, d: 18, nombre: "Popo" },
      { a: 0.95, r: 33, h: 12, d: 16, nombre: "Izta" },
      { a: 2.15, r: 28, h: 9, d: 14, nombre: "Ajusco" },
      { a: 3.65, r: 32, h: 11, d: 15, nombre: "Nevado" },
      { a: 5.05, r: 29, h: 8.5, d: 13, nombre: "Cerro" }
    ];

    for (const c of configs) {
      const x = Math.cos(c.a) * c.r;
      const z = Math.sin(c.a) * c.r;

      const v = MeshBuilder.CreateCylinder(`volcan_${c.nombre}`, {
        diameterTop: 0.5,
        diameterBottom: c.d,
        height: c.h,
        tessellation: 16
      }, this.scene);
      v.position.set(x, c.h / 2 - 2, z);
      v.material = matVolcan;
      v.freezeWorldMatrix();
      this.volcanesMeshes.push(v);

      // Cráter nevado superior (sin outline en fondo lejano, H10)
      const nieve = MeshBuilder.CreateCylinder(`nieve_${c.nombre}`, {
        diameterTop: 0.5,
        diameterBottom: c.d * 0.32,
        height: c.h * 0.28,
        tessellation: 16
      }, this.scene);
      nieve.position.set(x, c.h - 2 - (c.h * 0.28) / 2, z);
      nieve.material = this.matNieveVolcan;
      nieve.freezeWorldMatrix();
      this.volcanesMeshes.push(nieve);
    }
  }

  private construirCobertizoLobby(): void {
    const woodMat = this.crearMat("#78350f", 0.35);
    const roofMat = this.crearMat("#b45309", 0.40);

    const shedRoot = new TransformNode("cobertizoRoot", this.scene);
    shedRoot.position.set(0, 0, -3.8);
    shedRoot.computeWorldMatrix(true);

    // 4 Postes de madera
    const posPostes = [
      [-1.3, -0.7],
      [1.3, -0.7],
      [-1.3, 0.7],
      [1.3, 0.7]
    ];
    for (let i = 0; i < posPostes.length; i++) {
      const [x, z] = posPostes[i];
      const p = MeshBuilder.CreateCylinder(`posteCobertizo_${i}`, { diameter: 0.10, height: 2.2 }, this.scene);
      p.position.set(x, 1.1, z);
      p.material = woodMat;
      p.parent = shedRoot;
      this.aplicarTinta(p, 0.015);
      p.computeWorldMatrix(true);
      p.freezeWorldMatrix();
    }

    // Techo a dos aguas
    const techo = MeshBuilder.CreateCylinder("techoCobertizo", {
      diameterTop: 0.2,
      diameterBottom: 1.8,
      height: 3.0,
      tessellation: 3
    }, this.scene);
    techo.rotation.z = Math.PI / 2;
    techo.position.set(0, 2.35, 0);
    techo.material = roofMat;
    techo.parent = shedRoot;
    this.aplicarTinta(techo, 0.02);
    techo.computeWorldMatrix(true);
    techo.freezeWorldMatrix();
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
      this.hemiLight.intensity = 0.25;
      this.sunLight.intensity = 0.05;
      this.matSun.diffuseColor = Color3.FromHexString("#cbd5e1");
      this.matSun.emissiveColor = new Color3(0.2, 0.2, 0.25);
    } else if (metricas.elevacionSolar < 15) {
      // Amanecer / Atardecer
      this.scene.clearColor = new Color4(0.92, 0.72, 0.58, 1.0);
      this.hemiLight.intensity = 0.65;
      this.sunLight.intensity = 0.55;
      this.matSun.diffuseColor = Color3.FromHexString("#fb923c");
      this.matSun.emissiveColor = new Color3(0.9, 0.4, 0.1);
    } else {
      // Día pleno despejado o nuboso
      const factorNub = clima.nubosidad / 100;
      const cDia = Color3.Lerp(
        Color3.FromHexString("#bde7f4"),
        Color3.FromHexString("#94a3b8"),
        factorNub * 0.7
      );
      this.scene.clearColor = new Color4(cDia.r, cDia.g, cDia.b, 1.0);
      this.hemiLight.intensity = 0.85 - 0.3 * factorNub;
      this.sunLight.intensity = 0.65 - 0.45 * factorNub;
      this.matSun.diffuseColor = Color3.FromHexString("#ffd53a");
      this.matSun.emissiveColor = Color3.FromHexString("#ffd53a");
    }

    // 3. Respuesta visual al encharcamiento (humedad del suelo > 38%)
    if (metricas.encharcamiento > 0.05) {
      this.matPuddle.alpha = Math.min(0.85, metricas.encharcamiento * 0.95);
      this.matMound.diffuseColor = Color3.FromHexString("#4a2e12"); // Tierra húmeda oscura
    } else {
      this.matPuddle.alpha = 0.0;
      this.matMound.diffuseColor = Color3.FromHexString("#7a4c22"); // Tierra seca clara
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
    const cTierra = Color3.Lerp(Color3.FromHexString("#8a5a2b"), Color3.FromHexString("#3d240e"), fHum);
    this.matMound.diffuseColor = cTierra;
    this.matMound.emissiveColor = cTierra.scale(0.35);

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
  }
}
