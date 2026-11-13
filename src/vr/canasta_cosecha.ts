/**
 * Canasta de Recolección y Carrito Agrícola Portátil (v3.0)
 *
 * Implementa la canasta física de mimbre que apila los elotes cosechados
 * por variedad genética, y el carrito de madera que sigue al jugador
 * a lo largo de la hilera de cultivo.
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ShadowGenerator,
  Animation
} from "@babylonjs/core";
import {
  configurarSamplingPixel,
  crearTexMaderaPixel,
  dibujarMarcoLetreroPixel,
} from "../ui/texturas_pixel_3d";
import { VariedadMaizConfig, VARIEDADES_MAIZ } from "../nucleo";

export class CanastaRecoleccion3D {
  readonly scene: Scene;
  readonly root: TransformNode;
  
  private basketMesh!: Mesh;
  private basketMat!: StandardMaterial;
  private badgeTex!: DynamicTexture;
  private badgeMesh!: Mesh;
  
  // Mazorcas recolectadas físicamente apiladas
  private elotesRecolectados: Mesh[] = [];
  public totalCosechados = 0;
  public conteoPorVariedad: Record<string, number> = {
    chalqueno: 0,
    azul: 0,
    rojo: 0,
    palomero: 0
  };

  // Ingredientes adicionales de la Milpa Viva v4.0 (M3, M5, M7, M8)
  public quelites = 0;
  public frijol = 0;
  public calabaza = 0;
  public calidadesRecolectadas: number[] = [];

  constructor(scene: Scene, parent: TransformNode | null = null) {
    this.scene = scene;
    this.root = new TransformNode("canastaRecoleccionRoot", scene);
    if (parent) {
      this.root.parent = parent;
    }

    this.construirCanasta();
    this.construirBadge();
  }

  private construirCanasta(): void {
    // Cesta de mimbre tejida
    this.basketMat = new StandardMaterial("matBasket", this.scene);
    this.basketMat.diffuseColor = Color3.FromHexString("#b45309");
    this.basketMat.emissiveColor = Color3.FromHexString("#78350f").scale(0.35);
    this.basketMat.specularColor = new Color3(0.05, 0.05, 0.05);

    this.basketMesh = MeshBuilder.CreateBox("cestaMimbre", {
      width: 0.50,
      height: 0.28,
      depth: 0.38
    }, this.scene);
    this.basketMesh.position.set(0, 0.14, 0);
    this.basketMesh.material = this.basketMat;
    this.basketMesh.parent = this.root;

    this.basketMesh.renderOutline = true;
    this.basketMesh.outlineWidth = 0.015;
    this.basketMesh.outlineColor = Color3.FromHexString("#25330f");

    // Asa arqueada
    const asa = MeshBuilder.CreateTorus("asaCanasta", {
      diameter: 0.44,
      thickness: 0.035,
      tessellation: 24
    }, this.scene);
    asa.rotation.z = Math.PI / 2;
    asa.position.set(0, 0.28, 0);
    asa.material = this.basketMat;
    asa.parent = this.root;
    asa.renderOutline = true;
    asa.outlineWidth = 0.012;
    asa.outlineColor = Color3.FromHexString("#25330f");
  }

  private construirBadge(): void {
    const W = 256;
    const H = 120;
    this.badgeTex = new DynamicTexture("texBadgeCanasta", { width: W, height: H }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    configurarSamplingPixel(this.badgeTex);

    const mat = new StandardMaterial("matBadgeCanasta", this.scene);
    mat.diffuseTexture = this.badgeTex;
    mat.emissiveColor = new Color3(0.6, 0.6, 0.6);

    this.badgeMesh = MeshBuilder.CreatePlane("badgeCanasta", { width: 0.38, height: 0.18 }, this.scene);
    this.badgeMesh.position.set(0, 0.38, 0.20);
    this.badgeMesh.rotation.x = -Math.PI / 9;
    this.badgeMesh.material = mat;
    this.badgeMesh.parent = this.root;

    this.actualizarBadge();
  }

  public actualizarBadge(): void {
    const ctx = this.badgeTex.getContext() as any;
    const W = 256;
    const H = 120;

    dibujarMarcoLetreroPixel(ctx, W, H, "#fef3c7", "#451a03", "#ca8a04", 4);

    ctx.fillStyle = "#854d0e";
    ctx.font = "bold 20px 'Pixelify Sans', monospace";
    ctx.fillText(`🧺 Cosecha: ${this.totalCosechados} / 6 Elotes`, 14, 28);

    ctx.font = "bold 15px 'Pixelify Sans', monospace";
    ctx.fillStyle = "#d97706";
    ctx.fillText(`🌽 Chalqueño: ${this.conteoPorVariedad.chalqueno}`, 14, 52);
    ctx.fillStyle = "#4338ca";
    ctx.fillText(`🟣 Azul: ${this.conteoPorVariedad.azul}`, 140, 52);

    ctx.fillStyle = "#b91c1c";
    ctx.fillText(`🔴 Rojo: ${this.conteoPorVariedad.rojo}`, 14, 76);
    ctx.fillStyle = "#ea580c";
    ctx.fillText(`🟠 Palomero: ${this.conteoPorVariedad.palomero}`, 140, 76);

    ctx.fillStyle = "#15803d";
    ctx.font = "bold 12px 'Pixelify Sans', monospace";
    ctx.fillText(
      `🌿 Quelites: ${this.quelites} | 🫘 Frijol: ${this.frijol} | 🌼 Calab.: ${this.calabaza}`,
      10,
      102
    );

    this.badgeTex.update();
  }

  /**
   * Calidad promedio (0..1) de las mazorcas recolectadas para cocina (M8) y semilla (M9)
   */
  public get calidadPromedio(): number {
    if (this.calidadesRecolectadas.length === 0) return 0.85;
    const sum = this.calidadesRecolectadas.reduce((a, b) => a + b, 0);
    return sum / this.calidadesRecolectadas.length;
  }

  /**
   * Deposita quelites, vainas de frijol o flores/calabacitas en la canasta (M3, M7)
   */
  public depositarIngrediente(tipo: "quelite" | "frijol" | "calabaza", cantidad = 1): void {
    if (tipo === "quelite") this.quelites += cantidad;
    else if (tipo === "frijol") this.frijol += cantidad;
    else if (tipo === "calabaza") this.calabaza += cantidad;
    this.actualizarBadge();
  }

  /**
   * Retira mazorcas para cocinar en el fogón (M8) o guardar en banco de semillas (M9)
   */
  public retirarMazorca(variedad?: string, cantidad = 1): boolean {
    if (this.totalCosechados < cantidad) return false;
    if (variedad && (this.conteoPorVariedad[variedad] ?? 0) >= cantidad) {
      this.conteoPorVariedad[variedad] -= cantidad;
    } else {
      let rest = cantidad;
      for (const k of Object.keys(this.conteoPorVariedad)) {
        const disp = this.conteoPorVariedad[k];
        const quita = Math.min(disp, rest);
        this.conteoPorVariedad[k] -= quita;
        rest -= quita;
        if (rest <= 0) break;
      }
    }
    this.totalCosechados = Math.max(0, this.totalCosechados - cantidad);
    for (let i = 0; i < cantidad; i++) {
      const m = this.elotesRecolectados.pop();
      m?.dispose();
    }
    this.actualizarBadge();
    return true;
  }

  /**
   * Deposita físicamente un elote dentro de la canasta
   */
  public depositarMazorca(variedad: VariedadMaizConfig, origen?: Vector3, calidad = 0.9): void {
    this.totalCosechados++;
    this.calidadesRecolectadas.push(calidad);
    if (this.conteoPorVariedad[variedad.tipo] !== undefined) {
      this.conteoPorVariedad[variedad.tipo]++;
    }

    // Crear modelo de elote miniatura apilado en la canasta
    const cobMat = new StandardMaterial(`cobBasketMat_${this.totalCosechados}`, this.scene);
    cobMat.diffuseColor = Color3.FromHexString(variedad.colorHex);
    cobMat.emissiveColor = Color3.FromHexString(variedad.colorHex).scale(0.35);

    const cobMesh = MeshBuilder.CreateCylinder(`cobBasket_${this.totalCosechados}`, {
      height: 0.22,
      diameterTop: 0.05,
      diameterBottom: 0.07,
      tessellation: 12
    }, this.scene);

    cobMesh.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    cobMesh.rotation.y = (Math.random() - 0.5) * 0.5;

    // Disposición apilada en la canasta
    const offsetX = ((this.totalCosechados - 1) % 3 - 1) * 0.12;
    const offsetZ = Math.floor((this.totalCosechados - 1) / 3) * 0.10 - 0.05;
    const targetY = 0.12 + Math.floor((this.totalCosechados - 1) / 3) * 0.06;

    const targetPos = new Vector3(offsetX, targetY, offsetZ);

    if (origen) {
      cobMesh.position.copyFrom(origen);
      Animation.CreateAndStartAnimation(
        `flyToBasket_${this.totalCosechados}`,
        cobMesh,
        "position",
        60,
        30,
        cobMesh.position,
        this.root.position.add(targetPos),
        Animation.ANIMATIONLOOPMODE_CONSTANT,
        undefined,
        () => {
          cobMesh.parent = this.root;
          cobMesh.position.copyFrom(targetPos);
        }
      );
    } else {
      cobMesh.position.copyFrom(targetPos);
      cobMesh.parent = this.root;
    }

    cobMesh.material = cobMat;
    cobMesh.renderOutline = true;
    cobMesh.outlineWidth = 0.012;
    cobMesh.outlineColor = Color3.FromHexString("#25330f");

    this.elotesRecolectados.push(cobMesh);
    this.actualizarBadge();
  }
}

/**
 * Carretilla de Madera Móvil que transporta las herramientas y la canasta
 */
export class CarritoAgricola3D {
  readonly scene: Scene;
  readonly root: TransformNode;
  public canasta: CanastaRecoleccion3D;
  
  private ruedas: Mesh[] = [];
  public targetX = 0;

  constructor(scene: Scene, shadowGen: ShadowGenerator | null = null) {
    this.scene = scene;
    this.root = new TransformNode("carritoAgricolaRoot", scene);
    this.root.position.set(0, 0, -1.45); // Al frente de las huellas de teletransporte

    this.construirEstructura(shadowGen);
    this.canasta = new CanastaRecoleccion3D(scene, this.root);
    this.canasta.root.position.set(0.35, 0.28, 0); // En la parte trasera de la carretilla
  }

  private construirEstructura(shadowGen: ShadowGenerator | null): void {
    const woodMat = new StandardMaterial("matCarritoMadera", this.scene);
    woodMat.diffuseTexture = crearTexMaderaPixel(this.scene, false, 2, 1);
    woodMat.diffuseColor = Color3.FromHexString("#e2be94");
    woodMat.emissiveColor = Color3.FromHexString("#451a03").scale(0.32);

    // Caja de carga de la carretilla
    const caja = MeshBuilder.CreateBox("cajaCarro", {
      width: 1.20,
      height: 0.22,
      depth: 0.55
    }, this.scene);
    caja.position.set(0, 0.28, 0);
    caja.material = woodMat;
    caja.parent = this.root;

    // Ruedas cuadradas/octogonales voxel en los extremos
    const wheelMat = new StandardMaterial("matRuedaCarro", this.scene);
    wheelMat.diffuseTexture = crearTexMaderaPixel(this.scene, false, 1, 1);
    wheelMat.diffuseColor = Color3.FromHexString("#cfa372");

    const posX = [-0.45, 0.45];
    for (const x of posX) {
      const rueda = MeshBuilder.CreateBox(`rueda_${x}`, {
        width: 0.08,
        height: 0.28,
        depth: 0.28
      }, this.scene);
      rueda.position.set(x, 0.14, 0);
      rueda.material = wheelMat;
      rueda.parent = this.root;
      this.ruedas.push(rueda);
    }

    if (shadowGen) {
      shadowGen.addShadowCaster(caja);
    }
  }

  /**
   * Actualiza la posición suave de la carretilla para acompañar al jugador
   */
  public actualizar(dt: number): void {
    const vel = 2.5; // Velocidad de traslación
    const dx = this.targetX - this.root.position.x;
    if (Math.abs(dx) > 0.02) {
      const step = Math.sign(dx) * Math.min(Math.abs(dx), vel * dt);
      this.root.position.x += step;

      // Giro cinemático de ruedas
      for (const rueda of this.ruedas) {
        rueda.rotation.x += step * 4.0;
      }
    }
  }
}
