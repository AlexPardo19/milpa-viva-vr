/**
 * M2: Cinturón Diegético de Herramientas 3D (v4.0 — Milpa Viva VR)
 *
 * Reemplaza los menús flotantes en Realidad Virtual por 5 ranuras físicas
 * alrededor de la cintura del jugador (0.92 m de pie · 0.68 m en modo sentado).
 * Sigue suavemente la posición y orientación horizontal de la cabeza.
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { HerramientaTipo } from "../educativo/estado_educativo";
import { ManoVR } from "./mano_vr";
import { crearTexturaPixel } from "../ui/texto_pixel";
import { dibujarIcono } from "../ui/iconos_pixel";

interface RanuraCinturon {
  herramienta: HerramientaTipo;
  icono: string;
  etiqueta: string;
  colorHex: string;
  anguloOffset: number;
  mesh: Mesh;
  mat: StandardMaterial;
}

export class CinturonHerramientas {
  readonly scene: Scene;
  readonly root: TransformNode;
  public ranuras: RanuraCinturon[] = [];
  public herramientaEquipada: HerramientaTipo = "azada";
  public modoSentado = false;
  public manoDominante: "right" | "left" = "right";

  private yawActual = 0;
  private agarrePrev = 0;

  public onEquipar?: (herramienta: HerramientaTipo) => void;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("cinturonVRRoot", scene);
    this.construirRanuras();
    this.root.setEnabled(false); // Se activa automáticamente en sesión XR o cuando se solicita
  }

  private construirRanuras(): void {
    const defs: Omit<RanuraCinturon, "mesh" | "mat">[] = [
      { herramienta: "mano", icono: "mano", etiqueta: "Manos", colorHex: "#f59e0b", anguloOffset: -0.90 },
      { herramienta: "azada", icono: "azada", etiqueta: "Azada", colorHex: "#d97706", anguloOffset: -0.54 },
      { herramienta: "semilla", icono: "grano", etiqueta: "Semilla", colorHex: "#eab308", anguloOffset: -0.18 },
      { herramienta: "regadera", icono: "regadera", etiqueta: "Agua", colorHex: "#0284c7", anguloOffset: 0.18 },
      { herramienta: "abono", icono: "abono", etiqueta: "Abono", colorHex: "#16a34a", anguloOffset: 0.54 },
      { herramienta: "cosecha", icono: "mazorca", etiqueta: "Cosecha", colorHex: "#f97316", anguloOffset: 0.90 }
    ];

    const radio = 0.34;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const tex = crearTexturaPixel(this.scene, `texRanura_${d.herramienta}`, 32, 32, (ctx) => {
        ctx.fillStyle = "#c6c6c6";
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = d.colorHex;
        ctx.fillRect(0, 0, 32, 2);
        ctx.fillRect(0, 30, 32, 2);
        dibujarIcono(ctx, d.icono, 8, 3, 1);
        ctx.font = 'bold 9px "Pixelify Sans", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = "#1e1e1e";
        ctx.fillText(d.etiqueta, 16, 27);
      });

      const mat = new StandardMaterial(`matRanura_${d.herramienta}`, this.scene);
      mat.diffuseTexture = tex;
      mat.emissiveColor = Color3.FromHexString(d.colorHex).scale(0.45);
      mat.specularColor = Color3.Black();

      const mesh = MeshBuilder.CreateCylinder(`ranuraCinturon_${d.herramienta}`, {
        diameter: 0.11,
        height: 0.04,
        tessellation: 16
      }, this.scene);
      mesh.rotation.x = Math.PI / 3;
      mesh.position.set(
        Math.sin(d.anguloOffset) * radio,
        0,
        Math.cos(d.anguloOffset) * radio
      );
      mesh.material = mat;
      mesh.parent = this.root;

      mesh.actionManager = new ActionManager(this.scene);
      mesh.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.seleccionar(d.herramienta);
        })
      );

      this.ranuras.push({ ...d, mesh, mat });
    }
  }

  public seleccionar(h: HerramientaTipo): void {
    this.herramientaEquipada = h;
    for (let i = 0; i < this.ranuras.length; i++) {
      const r = this.ranuras[i];
      const activo = r.herramienta === h;
      r.mesh.scaling.setAll(activo ? 1.25 : 1.0);
    }
    this.onEquipar?.(h);
  }

  /**
   * Actualiza la posición del cinturón siguiendo suavemente la cadera del jugador
   * y detecta si la mano dominante agarra una ranura con grip.
   */
  public actualizar(dt: number, posCabeza: Vector3, yawCabeza: number, manoDom?: ManoVR): void {
    if (!this.root.isEnabled()) return;

    const alturaCadera = this.modoSentado ? posCabeza.y - 0.36 : posCabeza.y - 0.62;
    this.root.position.set(posCabeza.x, Math.max(0.48, alturaCadera), posCabeza.z);

    // Retardo suave de orientación horizontal
    const diff = yawCabeza - this.yawActual;
    this.yawActual += diff * Math.min(1, dt * 6.0);
    this.root.rotation.y = this.yawActual;

    // Detección de agarre 6DoF en las ranuras del cinturón
    if (manoDom && manoDom.conectada) {
      const pulsoGrip = manoDom.agarre > 0.65 && this.agarrePrev <= 0.65;
      this.agarrePrev = manoDom.agarre;

      if (pulsoGrip) {
        for (let i = 0; i < this.ranuras.length; i++) {
          const r = this.ranuras[i];
          const dist = Vector3.Distance(manoDom.pos, r.mesh.getAbsolutePosition());
          if (dist < 0.16) {
            this.seleccionar(r.herramienta);
            manoDom.pulso(0.45, 30);
            break;
          }
        }
      }
    }
  }
}
