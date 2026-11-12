/**
 * Sistema de Drops Físicos y Recolección Magnética Estilo Minecraft (v4.0 — Milpa Viva VR)
 *
 * Los ítems caen al cosechar con impulso parabólico, rebotan en el suelo,
 * flotan y giran sobre su eje. Cuando el jugador se acerca a menos de 2.2 metros,
 * son atraídos magnéticamente hacia su inventario con retroalimentación sonora y visual.
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
import { Inventario, ItemStack, DEFS } from "./inventario";
import { VARIEDADES_MAIZ, TipoSemilla } from "../nucleo";

export interface ItemDropFisico {
  id: number;
  root: TransformNode;
  mesh: Mesh;
  stack: ItemStack;
  velocidad: Vector3;
  enSuelo: boolean;
  edad: number;
  recogido: boolean;
}

export class SistemaDrops {
  private drops: ItemDropFisico[] = [];
  private contadorId = 0;
  private readonly dirTmp = new Vector3();
  private readonly targetTmp = new Vector3();

  constructor(
    private scene: Scene,
    private inv: Inventario,
    private posJugador: () => Vector3,
    private alRecoger: (stack: ItemStack) => void,
    private alLleno: () => void
  ) {}

  /**
   * Genera y arroja un drop 3D físico al mundo en una posición dada.
   */
  soltar(stack: ItemStack, pos: Vector3): ItemDropFisico {
    const id = ++this.contadorId;
    const root = new TransformNode(`dropRoot_${id}`, this.scene);
    root.position.copyFrom(pos).addInPlaceFromFloats(0, 0.45, 0);

    // Color según variedad o ítem
    let colorHex = "#fbbf24";
    if (stack.meta?.variedad) {
      const v = stack.meta.variedad.toLowerCase();
      if (v.includes("azul") || v.includes("morado")) colorHex = "#4338ca";
      else if (v.includes("rojo")) colorHex = "#b91c1c";
      else if (v.includes("palomero")) colorHex = "#ea580c";
      else if (v.includes("cacahuacintle")) colorHex = "#fef08a";
      else colorHex = "#fbbf24";
    } else if (stack.id === "frijol") {
      colorHex = "#7c3aed";
    } else if (stack.id === "calabaza") {
      colorHex = "#f97316";
    }

    const mat = new StandardMaterial(`matDrop_${id}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(colorHex);
    mat.emissiveColor = Color3.FromHexString(colorHex).scale(0.4);
    mat.specularColor = Color3.Black(); // Look opaco estilo Minecraft

    // Modelo voxel/cilindro estilizado con reborde
    const mesh = MeshBuilder.CreateCylinder(
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
    mesh.renderOutline = true;
    mesh.outlineWidth = 0.012;
    mesh.outlineColor = Color3.FromHexString("#1e293b");
    mesh.parent = root;

    // Totomoxtle / bráctea en la base
    const matHusk = new StandardMaterial(`matDropHusk_${id}`, this.scene);
    matHusk.diffuseColor = Color3.FromHexString("#fde68a");
    matHusk.specularColor = Color3.Black();
    const husk = MeshBuilder.CreateCylinder(
      `dropHusk_${id}`,
      { height: 0.08, diameterTop: 0.08, diameterBottom: 0.04, tessellation: 6 },
      this.scene
    );
    husk.position.y = -0.07;
    husk.material = matHusk;
    husk.parent = mesh;

    // Impulso físico aleatorio estilo Minecraft
    const ang = Math.random() * Math.PI * 2;
    const horizSpeed = 0.8 + Math.random() * 0.9;
    const velocidad = new Vector3(
      Math.cos(ang) * horizSpeed,
      2.4 + Math.random() * 1.2,
      Math.sin(ang) * horizSpeed
    );

    const drop: ItemDropFisico = {
      id,
      root,
      mesh,
      stack: { ...stack, meta: stack.meta ? { ...stack.meta } : undefined },
      velocidad,
      enSuelo: false,
      edad: 0,
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

  /**
   * Intenta recoger directamente un drop por interacción de raycast o clic
   */
  public recogerDirecto(drop: ItemDropFisico): boolean {
    if (drop.recogido) return false;
    const sobra = this.inv.anadir(drop.stack);
    const recogidos = drop.stack.cantidad - sobra;

    if (recogidos > 0) {
      this.alRecoger({ ...drop.stack, cantidad: recogidos });
    }

    if (sobra === 0) {
      drop.recogido = true;
      drop.root.dispose();
      this.drops = this.drops.filter((d) => d.id !== drop.id);
      return true;
    } else {
      drop.stack.cantidad = sobra;
      this.alLleno();
      return false;
    }
  }

  public recogerPorMeshName(meshName: string): boolean {
    const match = meshName.match(/dropMesh_(\d+)/);
    if (!match) return false;
    const id = parseInt(match[1], 10);
    const drop = this.drops.find((d) => d.id === id);
    if (!drop) return false;
    return this.recogerDirecto(drop);
  }

  /**
   * Actualiza el ciclo de vida, física, flotación y atracción magnética
   */
  actualizar(dt: number): void {
    if (this.drops.length === 0) return;
    const jPos = this.posJugador();

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.recogido) continue;

      d.edad += dt;
      const dPos = d.root.position;
      const dist = Vector3.Distance(dPos, jPos);

      // Imán estilo Minecraft (radio 2.2 m tras 0.45 s de vida)
      if (d.edad > 0.45 && dist < 2.2) {
        this.targetTmp.copyFrom(jPos).addInPlaceFromFloats(0, 0.65, 0);
        this.targetTmp.subtractToRef(dPos, this.dirTmp);
        const distActual = this.dirTmp.length();

        if (distActual < 0.48) {
          // Llegó al jugador
          const sobra = this.inv.anadir(d.stack);
          const cantidadRecogida = d.stack.cantidad - sobra;
          if (cantidadRecogida > 0) {
            this.alRecoger({ ...d.stack, cantidad: cantidadRecogida });
          }

          if (sobra === 0) {
            d.recogido = true;
            d.root.dispose();
            this.drops.splice(i, 1);
            continue;
          } else {
            d.stack.cantidad = sobra;
            this.alLleno();
            d.edad = -1.5; // Pausa antes de reintentar atracción
          }
        } else {
          this.dirTmp.normalize();
          const velIman = 5.5 + (2.2 - dist) * 4.0;
          dPos.addInPlace(this.dirTmp.scale(dt * velIman));
        }
      } else {
        // Balística y gravedad
        if (!d.enSuelo) {
          d.velocidad.y -= 9.8 * dt;
          dPos.addInPlace(d.velocidad.scale(dt));

          // Contacto con el suelo
          if (dPos.y <= 0.2) {
            dPos.y = 0.2;
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
          // Rotación y flotación suave estilo Minecraft
          d.root.rotation.y += dt * 1.8;
          dPos.y = 0.2 + Math.sin(d.edad * 3.2 + d.id) * 0.04;
        }
      }

      // Desaparición tras 300 segundos (5 minutos)
      if (d.edad > 300) {
        d.recogido = true;
        d.root.dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  limpiar(): void {
    for (const d of this.drops) {
      d.root.dispose();
    }
    this.drops = [];
  }
}
