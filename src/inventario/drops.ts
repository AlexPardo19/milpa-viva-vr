/**
 * Sistema de Drops Físicos y Recolección Magnética Estilo Minecraft (v4.1 — Milpa Viva VR)
 *
 * Correcciones v4.1:
 * - Imán apunta a la altura real del torso/pecho (jPos.y - 0.45) y mide distancia XZ horizontal.
 * - Materiales cacheados por color (0 fugas de StandardMaterial) y tope de 48 drops activos.
 * - Regex de clic acepta dropMesh_, dropHusk_ y dropGrain_.
 * - Colisión básica con obstáculos sólidos y elevación del camellón del surco.
 * - Cooldown independiente (cooldownIman) sin corromper d.edad ni snap en el aire.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
  TransformNode,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { Inventario, ItemStack } from "./inventario";
import { resolverColisiones } from "../colisiones";

export interface ItemDropFisico {
  id: number;
  root: TransformNode;
  mesh: Mesh;
  stack: ItemStack;
  velocidad: Vector3;
  enSuelo: boolean;
  sueloY: number;
  edad: number;
  cooldownIman: number;
  recogido: boolean;
}

export class SistemaDrops {
  private drops: ItemDropFisico[] = [];
  private contadorId = 0;
  private readonly MAX_DROPS = 48;
  private readonly dirTmp = new Vector3();
  private readonly targetTmp = new Vector3();
  private cacheMats = new Map<string, StandardMaterial>();

  constructor(
    private scene: Scene,
    private inv: Inventario,
    private posJugador: () => Vector3,
    private alRecoger: (stack: ItemStack) => void,
    private alLleno: () => void
  ) {}

  private obtenerMat(hex: string, emScale = 0.36): StandardMaterial {
    const key = `${hex}_${emScale}`;
    const cached = this.cacheMats.get(key);
    if (cached) return cached;
    const mat = new StandardMaterial(`matDropCache_${key}`, this.scene);
    const col = Color3.FromHexString(hex);
    mat.diffuseColor = col;
    mat.emissiveColor = col.scale(emScale);
    mat.specularColor = Color3.Black();
    this.cacheMats.set(key, mat);
    return mat;
  }

  private alturaSueloEn(x: number, z: number): number {
    // Camellón elevado del surco central (W = 5.2, D = 0.95, H = 0.18 + montículos ~0.12)
    if (Math.abs(x) <= 2.65 && Math.abs(z) <= 0.52) {
      return 0.36;
    }
    return 0.2;
  }

  /**
   * Genera y arroja un drop 3D físico al mundo en una posición dada.
   */
  soltar(stack: ItemStack, pos: Vector3): ItemDropFisico {
    // Tope de seguridad de drops simultáneos (descarta el más antiguo)
    if (this.drops.length >= this.MAX_DROPS) {
      const viejo = this.drops.shift();
      if (viejo) {
        viejo.recogido = true;
        viejo.root.dispose(false, false);
      }
    }

    const id = ++this.contadorId;
    const root = new TransformNode(`dropRoot_${id}`, this.scene);
    root.position.copyFrom(pos).addInPlaceFromFloats(0, 0.55, 0);

    // Color según variedad o ítem
    let colorHex = "#fbbf24";
    let colorAcentoHex = "#fde68a";
    if (stack.id === "huitlacoche") {
      colorHex = "#475569";
      colorAcentoHex = "#cbd5e1";
    } else if (stack.id === "quelite") {
      colorHex = "#15803d";
      colorAcentoHex = "#86efac";
    } else if (stack.id === "semilla_azul" || stack.meta?.variedad?.toLowerCase().includes("azul")) {
      colorHex = "#312e81";
      colorAcentoHex = "#6366f1";
    } else if (stack.id === "semilla_rojo" || stack.meta?.variedad?.toLowerCase().includes("rojo")) {
      colorHex = "#991b1b";
      colorAcentoHex = "#ef4444";
    } else if (
      stack.id === "semilla_palomero" ||
      stack.meta?.variedad?.toLowerCase().includes("palomero")
    ) {
      colorHex = "#d97706";
      colorAcentoHex = "#fef3c7";
    } else if (stack.id === "semilla_chalqueno" || stack.id === "semilla" || stack.id === "grano") {
      colorHex = "#eab308";
      colorAcentoHex = "#fef08a";
    } else if (stack.id === "frijol") {
      colorHex = "#581c87";
      colorAcentoHex = "#c084fc";
    } else if (stack.id === "calabaza") {
      colorHex = "#ea580c";
      colorAcentoHex = "#fed7aa";
    }

    const esSemilla =
      stack.id.startsWith("semilla") ||
      stack.id === "grano" ||
      stack.id === "frijol" ||
      stack.id === "calabaza";

    const mat = this.obtenerMat(colorHex, 0.36);

    let mesh: Mesh;
    if (esSemilla) {
      mesh = MeshBuilder.CreateBox(
        `dropMesh_${id}`,
        { width: 0.14, height: 0.15, depth: 0.09 },
        this.scene
      );
      mesh.material = mat;
      mesh.parent = root;

      const matBolsa = this.obtenerMat("#d6b888", 0.28);
      const cuello = MeshBuilder.CreateBox(
        `dropHusk_${id}`,
        { width: 0.11, height: 0.035, depth: 0.075 },
        this.scene
      );
      cuello.position.y = 0.092;
      cuello.material = matBolsa;
      cuello.isPickable = false;
      cuello.parent = mesh;

      const matGrano = this.obtenerMat(colorAcentoHex, 0.42);
      [-0.03, 0, 0.03].forEach((gx, idx) => {
        const g = MeshBuilder.CreateBox(
          `dropGrain_${id}_${idx}`,
          { width: 0.028, height: 0.028, depth: 0.028 },
          this.scene
        );
        g.position.set(gx, 0.122, idx === 1 ? 0.015 : -0.01);
        g.material = matGrano;
        g.isPickable = false;
        g.parent = mesh;
      });
    } else {
      mesh = MeshBuilder.CreateCylinder(
        `dropMesh_${id}`,
        {
          height: 0.22,
          diameterTop: 0.055,
          diameterBottom: 0.075,
          tessellation: 8
        },
        this.scene
      );
      mesh.rotation.z = Math.PI / 3;
      mesh.material = mat;
      mesh.parent = root;

      const matHusk = this.obtenerMat("#fde68a", 0.22);
      const husk = MeshBuilder.CreateCylinder(
        `dropHusk_${id}`,
        { height: 0.08, diameterTop: 0.08, diameterBottom: 0.04, tessellation: 6 },
        this.scene
      );
      husk.position.y = -0.07;
      husk.material = matHusk;
      husk.isPickable = false;
      husk.parent = mesh;
    }

    const ang = Math.random() * Math.PI * 2;
    const horizSpeed = 0.75 + Math.random() * 0.85;
    const velocidad = new Vector3(
      Math.cos(ang) * horizSpeed,
      2.3 + Math.random() * 1.1,
      Math.sin(ang) * horizSpeed
    );

    const drop: ItemDropFisico = {
      id,
      root,
      mesh,
      stack: { ...stack, meta: stack.meta ? { ...stack.meta } : undefined },
      velocidad,
      enSuelo: false,
      sueloY: 0.2,
      edad: 0,
      cooldownIman: 0.45,
      recogido: false
    };

    mesh.isPickable = true;
    mesh.actionManager = new ActionManager(this.scene);
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.recogerDirecto(drop);
      })
    );

    this.drops.push(drop);
    return drop;
  }

  public recogerDirecto(drop: ItemDropFisico): boolean {
    if (drop.recogido) return false;
    const sobra = this.inv.anadir(drop.stack);
    const recogidos = drop.stack.cantidad - sobra;

    if (recogidos > 0) {
      this.alRecoger({ ...drop.stack, cantidad: recogidos });
    }

    if (sobra === 0) {
      drop.recogido = true;
      drop.root.dispose(false, false);
      this.drops = this.drops.filter((d) => d.id !== drop.id);
      return true;
    } else {
      drop.stack.cantidad = sobra;
      drop.cooldownIman = 2.0;
      this.alLleno();
      return false;
    }
  }

  public recogerPorMeshName(meshName: string): boolean {
    const match = meshName.match(/drop(?:Mesh|Husk|Grain)_(\d+)/);
    if (!match) return false;
    const id = parseInt(match[1], 10);
    const drop = this.drops.find((d) => d.id === id);
    if (!drop) return false;
    return this.recogerDirecto(drop);
  }

  /**
   * Actualiza el ciclo de vida, física, flotación y atracción magnética hacia el pecho del jugador
   */
  actualizar(dt: number): void {
    if (this.drops.length === 0) return;
    const jPos = this.posJugador();
    const pechoY = Math.max(0.75, jPos.y - 0.45);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.recogido) continue;

      d.edad += dt;
      if (d.cooldownIman > 0) d.cooldownIman = Math.max(0, d.cooldownIman - dt);

      const dPos = d.root.position;
      const distXZ = Math.hypot(dPos.x - jPos.x, dPos.z - jPos.z);

      // Imán estilo Minecraft (radio horizontal 2.2 m hacia el pecho, sin volar sobre la cabeza)
      if (d.cooldownIman <= 0 && distXZ < 2.2) {
        d.enSuelo = false;
        this.targetTmp.set(jPos.x, pechoY, jPos.z);
        this.targetTmp.subtractToRef(dPos, this.dirTmp);
        const distActual = this.dirTmp.length();

        if (distActual < 0.48) {
          const sobra = this.inv.anadir(d.stack);
          const cantidadRecogida = d.stack.cantidad - sobra;
          if (cantidadRecogida > 0) {
            this.alRecoger({ ...d.stack, cantidad: cantidadRecogida });
          }

          if (sobra === 0) {
            d.recogido = true;
            d.root.dispose(false, false);
            this.drops.splice(i, 1);
            continue;
          } else {
            d.stack.cantidad = sobra;
            d.cooldownIman = 2.0;
            this.alLleno();
          }
        } else {
          this.dirTmp.normalize();
          const velIman = 5.5 + (2.2 - distXZ) * 4.0;
          dPos.addInPlace(this.dirTmp.scale(dt * velIman));
        }
      } else {
        // Balística y gravedad con altura real del suelo/camellón y rebote en obstáculos
        if (!d.enSuelo) {
          d.velocidad.y -= 9.8 * dt;
          dPos.addInPlace(d.velocidad.scale(dt));
          resolverColisiones(dPos, 0.12);

          const pisoY = this.alturaSueloEn(dPos.x, dPos.z);
          if (dPos.y <= pisoY) {
            dPos.y = pisoY;
            d.sueloY = pisoY;
            if (Math.abs(d.velocidad.y) > 0.8) {
              d.velocidad.y = -d.velocidad.y * 0.35;
              d.velocidad.x *= 0.5;
              d.velocidad.z *= 0.5;
            } else {
              d.enSuelo = true;
              d.velocidad.setAll(0);
            }
          }
        } else {
          d.root.rotation.y += dt * 1.8;
          dPos.y = d.sueloY + Math.sin(d.edad * 3.2 + d.id) * 0.04;
        }
      }

      // Desaparición tras 300 segundos (5 minutos)
      if (d.edad > 300) {
        d.recogido = true;
        d.root.dispose(false, false);
        this.drops.splice(i, 1);
      }
    }
  }

  limpiar(): void {
    for (const d of this.drops) {
      d.root.dispose(false, false);
    }
    this.drops = [];
  }
}
