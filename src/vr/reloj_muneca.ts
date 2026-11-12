/**
 * M2 y §5.6: Reloj de Muñeca Diegético con Caché de Hash (Zero-GC)
 *
 * Plano de 9×6 cm en el antebrazo no dominante con DynamicTexture (512×340).
 * Muestra: día de cultivo, etapa fenológica, barras de humedad y nutrientes,
 * triángulo de sinergia de la Tríada 🔺 y alerta 🔔 de plaga o evento activo.
 * Solo repinta la textura cuando el hash de estado cambia (§5.6).
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Mesh,
  MeshBuilder
} from "@babylonjs/core";
import { ManoVR } from "./mano_vr";
import { NodoSurco } from "../surco_milpa";
import { _tmpA } from "../juego/util";

export class RelojMuneca {
  readonly scene: Scene;
  readonly plano: Mesh;
  readonly tex: DynamicTexture;

  private ultimoHash = "";
  public alertaTexto = "";

  constructor(scene: Scene) {
    this.scene = scene;
    this.tex = new DynamicTexture("relojMunecaTex", { width: 512, height: 340 }, scene, true);

    const mat = new StandardMaterial("matRelojMuneca", scene);
    mat.diffuseTexture = this.tex;
    mat.emissiveColor = new Color3(0.85, 0.85, 0.85);
    mat.backFaceCulling = false;

    this.plano = MeshBuilder.CreatePlane("relojMuneca", { width: 0.095, height: 0.064 }, scene);
    this.plano.material = mat;
    this.plano.isVisible = false;
  }

  /**
   * Ancla el reloj a la mano no dominante y repinta solo si cambió el estado (§5.6)
   */
  public actualizar(
    manoReloj: ManoVR,
    posCabeza: Vector3,
    nodo: NodoSurco | undefined,
    alerta: string,
    daltonico = false
  ): void {
    this.alertaTexto = alerta;

    if (!manoReloj.conectada || !manoReloj.grip) {
      this.plano.isVisible = false;
      return;
    }

    if (this.plano.parent !== manoReloj.grip) {
      this.plano.parent = manoReloj.grip;
      this.plano.position.set(0, 0.035, 0.045);
      this.plano.rotation.x = Math.PI / 2.2;
    }

    // Verificar si el jugador mira hacia su muñeca (dot > 0.65)
    posCabeza.subtractToRef(this.plano.getAbsolutePosition(), _tmpA);
    _tmpA.normalize();
    const normal = this.plano.forward;
    const miraReloj = Math.abs(Vector3.Dot(_tmpA, normal)) > 0.55;

    this.plano.isVisible = miraReloj;
    if (!miraReloj || !nodo) return;

    const dia = Math.floor(nodo.diasCultivo);
    const hum = Math.round(nodo.humedadVWC);
    const npk = Math.round(nodo.nutrientesNPK);
    const triadaOk = nodo.frijolVid > 0.25 && nodo.calabazaCobertura > 0.25 && nodo.maleza < 30;
    const hash = `${nodo.id}|${dia}|${hum}|${npk}|${triadaOk ? 1 : 0}|${alerta}|${daltonico ? 1 : 0}`;

    if (hash === this.ultimoHash) return;
    this.ultimoHash = hash;

    const ctx = this.tex.getContext() as any;
    const W = 512;
    const H = 340;

    // Fondo estilo madera y pergamino cel-shaded
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = alerta ? "#ef4444" : "#fbbf24";
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.fillStyle = "#fef08a";
    ctx.font = "bold 28px Trebuchet MS, sans-serif";
    ctx.fillText(`⌚ Estación ${nodo.id + 1} · Día ${dia}`, 24, 44);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 22px Trebuchet MS, sans-serif";
    ctx.fillText(`Etapa: ${nodo.estadoCrec.etapa}`, 24, 82);

    // Barra de Agua
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`💧 Agua: ${hum}% VWC ${daltonico ? "[≈≈]" : ""}`, 24, 128);
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 140, 320, 22);
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(24, 140, Math.min(320, (hum / 50) * 320), 22);

    // Barra de Nutrientes
    ctx.fillStyle = "#4ade80";
    ctx.fillText(`🌿 NPK: ${npk}% ${daltonico ? "[◆◆]" : ""}`, 24, 198);
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 210, 320, 22);
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(24, 210, Math.min(320, (npk / 100) * 320), 22);

    // Indicador de Sinergia Tríada 🔺
    ctx.fillStyle = triadaOk ? "#fbbf24" : "#94a3b8";
    ctx.font = "bold 22px Trebuchet MS, sans-serif";
    ctx.fillText(
      triadaOk ? "🔺 Sinergia Tríada ACTIVA (+15%)" : "△ Tríada: asocia frijol y calabaza",
      24,
      272
    );

    // Alerta 🔔
    if (alerta) {
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold 22px Trebuchet MS, sans-serif";
      ctx.fillText(`🔔 ${alerta}`, 24, 314);
    } else {
      ctx.fillStyle = "#a7f3d0";
      ctx.font = "20px Trebuchet MS, sans-serif";
      ctx.fillText(`✨ Cuajado: ${Math.round(nodo.plantaInterna.cuajado * 100)}%`, 24, 314);
    }

    this.tex.update(false);
  }
}
