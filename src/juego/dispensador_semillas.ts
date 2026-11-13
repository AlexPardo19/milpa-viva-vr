import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  DynamicTexture,
  Texture,
  ActionManager,
  ExecuteCodeAction,
  ShadowGenerator,
  Mesh
} from "@babylonjs/core";
import { registrarSolidoDesdeNodo } from "../colisiones";
import { Inventario, DEFS } from "../inventario/inventario";
import { AudioSintetizador } from "../audio_sintetizador";
import { generarDataUrlIcono } from "../ui/iconos_pixel";
import {
  crearTexMaderaPixel,
  crearTexPiedraPixel,
  crearMaterialPixelTex,
  dibujarMarcoLetreroPixel
} from "../ui/texturas_pixel_3d";

interface SemillaDispensable {
  id: string;
  etiqueta: string;
  colorHex: string;
  cantidadLote: number;
}

const CATALOGO_SEMILLAS: SemillaDispensable[] = [
  { id: "semilla_chalqueno", etiqueta: "Maíz Chalqueño", colorHex: "#eab308", cantidadLote: 16 },
  { id: "semilla_azul", etiqueta: "Maíz Azul Cónico", colorHex: "#4f46e5", cantidadLote: 16 },
  { id: "semilla_rojo", etiqueta: "Maíz Rojo Sangre", colorHex: "#dc2626", cantidadLote: 16 },
  { id: "semilla_palomero", etiqueta: "Palomero Toluqueño", colorHex: "#f59e0b", cantidadLote: 16 },
  { id: "frijol", etiqueta: "Frijol Ayocote", colorHex: "#9333ea", cantidadLote: 16 },
  { id: "calabaza", etiqueta: "Calabaza Criolla", colorHex: "#ea580c", cantidadLote: 16 }
];

/**
 * Dispensador Comunal de Semillas 3D (Pixel-Art / Voxel)
 * Ubicado en el patio izquierdo (-4.65, 0, -2.35) para reponer cualquier
 * variedad de maíz o cultivo asociado en caso de agotarse.
 */
export class DispensadorSemillas {
  public readonly raiz: TransformNode;
  private modalEl: HTMLDivElement | null = null;
  private listaEl: HTMLDivElement | null = null;

  public onMensajeToast?: (msg: string) => void;
  public onActualizarUI?: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly invJugador: Inventario,
    private readonly audio: AudioSintetizador,
    private readonly shadowGen: ShadowGenerator | null = null
  ) {
    this.raiz = new TransformNode("dispensadorSemillasRoot", this.scene);
    this.raiz.position.set(-4.65, 0, -2.35);
    this.raiz.rotation.y = 0.25;
    this.raiz.computeWorldMatrix(true);

    this.construirDispensador3D();
    this.construirModalUI();
  }

  private registrarPick(mesh: any): void {
    mesh.isPickable = true;
    mesh.actionManager = new ActionManager(this.scene);
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => this.interactuar(mesh.name))
    );
  }

  /** Un botón de color entrega directamente su semilla; cualquier otra parte abre el catálogo completo. */
  public interactuar(meshName: string): void {
    if (meshName.startsWith("dispensadorBoton_")) {
      const idx = parseInt(meshName.split("_")[1], 10);
      const s = CATALOGO_SEMILLAS[idx];
      if (s) {
        this.animarBoton(idx);
        this.entregarSemilla(s, s.cantidadLote);
        return;
      }
    }
    this.abrir();
  }

  private animarBoton(idx: number): void {
    const b = this.botones[idx];
    if (!b) return;
    b.position.z = 0.285 - 0.03;
    setTimeout(() => (b.position.z = 0.285), 160);
  }

  private crearTexto(
    nombre: string,
    w: number,
    h: number,
    dibujar: (ctx: any, w: number, h: number) => void
  ): StandardMaterial {
    const tex = new DynamicTexture(nombre, { width: w, height: h }, this.scene, false);
    const ctx = tex.getContext() as any;
    dibujar(ctx, w, h);
    tex.update();
    tex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
    const mat = new StandardMaterial(`mat_${nombre}`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.5);
    mat.specularColor = Color3.Black();
    return mat;
  }

  private botones: Mesh[] = [];

  private construirDispensador3D(): void {
    const texPiedra = crearTexPiedraPixel(this.scene, 2, 2);
    const texMadera = crearTexMaderaPixel(this.scene, true, 2, 2);

    const matPiedra = crearMaterialPixelTex(this.scene, "matDispPiedra", texPiedra, "#475569", 0.14);
    const matMadera = crearMaterialPixelTex(this.scene, "matDispMadera", texMadera, "#78350f", 0.18);

    const matTecho = new StandardMaterial("matDispTecho", this.scene);
    matTecho.diffuseColor = Color3.FromHexString("#b91c1c");
    matTecho.emissiveColor = Color3.FromHexString("#7f1d1d").scale(0.32);
    matTecho.specularColor = Color3.Black();

    const matOscuro = new StandardMaterial("matDispBoca", this.scene);
    matOscuro.diffuseColor = Color3.FromHexString("#0f172a");
    matOscuro.specularColor = Color3.Black();

    const matMetal = new StandardMaterial("matDispMetal", this.scene);
    matMetal.diffuseColor = Color3.FromHexString("#94a3b8");
    matMetal.specularColor = Color3.Black();

    const caja = (
      nombre: string, w: number, h: number, d: number,
      x: number, y: number, z: number, mat: StandardMaterial,
      opts: { pick?: boolean; sombra?: boolean; contorno?: boolean } = {}
    ): Mesh => {
      const m = MeshBuilder.CreateBox(nombre, { width: w, height: h, depth: d }, this.scene);
      m.position.set(x, y, z);
      m.material = mat;
      m.parent = this.raiz;
      if (opts.contorno) {
        m.renderOutline = true;
        m.outlineWidth = 0.01;
        m.outlineColor = Color3.FromHexString("#1e293b");
      }
      if (opts.sombra) this.shadowGen?.addShadowCaster(m);
      if (opts.pick !== false) this.registrarPick(m);
      return m;
    };

    // Pedestal de mampostería + gabinete de madera (estilo máquina expendedora)
    caja("dispensadorBase", 1.4, 0.30, 0.66, 0, 0.15, 0, matPiedra, { sombra: true });
    caja("dispensadorCuerpo", 1.3, 1.45, 0.50, 0, 1.025, 0, matMadera, { sombra: true, contorno: true });
    caja("dispensadorTecho", 1.46, 0.12, 0.70, 0, 1.81, 0, matTecho, { sombra: true, contorno: true });

    // Letrero superior claro
    const matCartel = this.crearTexto("texDispCartel", 384, 112, (ctx, w, h) => {
      dibujarMarcoLetreroPixel(ctx, w, h, "#3f240c", "#d97706");
      ctx.textAlign = "center";
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 40px 'Pixelify Sans', monospace";
      ctx.fillText("🌰 SEMILLAS", w / 2, 50);
      ctx.fillStyle = "#bbf7d0";
      ctx.font = "bold 19px 'Pixelify Sans', monospace";
      ctx.fillText("Pulsa el botón de tu semilla", w / 2, 82);
    });
    const cartelFondo = caja("dispensadorCartelFondo", 1.34, 0.40, 0.08, 0, 2.08, 0.05, matMadera, { contorno: true });
    cartelFondo.isPickable = true;
    const cartel = MeshBuilder.CreatePlane("dispensadorCartel", { width: 1.26, height: 0.37 }, this.scene);
    cartel.position.set(0, 2.08, 0.093);
    cartel.rotation.y = Math.PI;
    cartel.material = matCartel;
    cartel.parent = this.raiz;
    this.registrarPick(cartel);

    // Flecha amarilla indicadora sobre el cartel
    const matFlecha = new StandardMaterial("matDispFlecha", this.scene);
    matFlecha.diffuseColor = Color3.FromHexString("#fde047");
    matFlecha.emissiveColor = Color3.FromHexString("#facc15").scale(0.7);
    matFlecha.specularColor = Color3.Black();
    const flecha = caja("dispensadorFlecha", 0.16, 0.16, 0.16, 0, 2.42, 0.05, matFlecha, { pick: false });
    flecha.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    this.flecha = flecha;

    // 6 ventanas de cristal con la semilla, etiqueta y botón de color debajo
    const n = CATALOGO_SEMILLAS.length;
    const paso = 0.205;
    const x0 = -((n - 1) * paso) / 2;
    CATALOGO_SEMILLAS.forEach((s, i) => {
      const x = x0 + i * paso;
      const col = Color3.FromHexString(s.colorHex);

      // Marco oscuro y montón de semillas visible a través del cristal
      caja(`dispensadorMarco_${i}`, 0.19, 0.42, 0.04, x, 1.40, 0.255, matOscuro);
      const matSemilla = new StandardMaterial(`matDispSemilla_${i}`, this.scene);
      matSemilla.diffuseColor = col;
      matSemilla.emissiveColor = col.scale(0.45);
      matSemilla.specularColor = Color3.Black();
      caja(`dispensadorSemillaPila_${i}`, 0.15, 0.20, 0.04, x, 1.29, 0.262, matSemilla);

      const matCristal = new StandardMaterial(`matDispCristal_${i}`, this.scene);
      matCristal.diffuseColor = Color3.FromHexString("#bae6fd");
      matCristal.emissiveColor = Color3.FromHexString("#7dd3fc").scale(0.35);
      matCristal.alpha = 0.38;
      matCristal.specularColor = Color3.White();
      caja(`dispensadorVentana_${i}`, 0.16, 0.36, 0.02, x, 1.40, 0.285, matCristal);

      // Etiqueta con nombre de la variedad
      const partes = s.etiqueta.split(" ");
      const matEtiq = this.crearTexto(`texDispEtiq_${i}`, 128, 96, (ctx, w, h) => {
        ctx.fillStyle = "#fffbeb";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = s.colorHex;
        ctx.fillRect(0, 0, w, 14);
        ctx.fillStyle = "#1e293b";
        ctx.textAlign = "center";
        ctx.font = "bold 20px 'Pixelify Sans', monospace";
        const l1 = i < 4 ? "MAÍZ" : partes[0].toUpperCase();
        const l2 = i < 4 ? partes[partes.length - 1] === "Cónico" ? "AZUL" : partes[partes.length - 1].toUpperCase() : "";
        ctx.fillText(l1, w / 2, 46);
        if (l2) ctx.fillText(l2, w / 2, 76);
        else {
          ctx.font = "16px 'Pixelify Sans', monospace";
          ctx.fillText("x" + s.cantidadLote, w / 2, 76);
        }
      });
      const etiq = MeshBuilder.CreatePlane(`dispensadorEtiqueta_${i}`, { width: 0.18, height: 0.135 }, this.scene);
      etiq.position.set(x, 1.10, 0.2515);
      etiq.rotation.y = Math.PI;
      etiq.material = matEtiq;
      etiq.parent = this.raiz;
      this.registrarPick(etiq);

      // Botón grande de color
      const matBoton = new StandardMaterial(`matDispBoton_${i}`, this.scene);
      matBoton.diffuseColor = col;
      matBoton.emissiveColor = col.scale(0.6);
      matBoton.specularColor = Color3.White();
      const boton = caja(`dispensadorBoton_${i}`, 0.14, 0.14, 0.06, x, 0.91, 0.285, matBoton, { contorno: true });
      this.botones.push(boton);
    });

    // Boca de salida + bandeja receptora
    caja("dispensadorBocaSalida", 1.0, 0.20, 0.06, 0, 0.58, 0.255, matOscuro);
    const matBandeja = this.crearTexto("texDispBandeja", 256, 48, (ctx, w, h) => {
      ctx.fillStyle = "#64748b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f1f5f9";
      ctx.textAlign = "center";
      ctx.font = "bold 22px 'Pixelify Sans', monospace";
      ctx.fillText("▼ RECOGE AQUÍ ▼", w / 2, 32);
    });
    caja("dispensadorBandeja", 1.1, 0.06, 0.26, 0, 0.46, 0.38, matMetal, { contorno: true });
    const textoBandeja = MeshBuilder.CreatePlane("dispensadorBandejaTexto", { width: 0.9, height: 0.12 }, this.scene);
    textoBandeja.rotation.x = Math.PI / 2;
    textoBandeja.position.set(0, 0.4925, 0.38);
    textoBandeja.rotation.set(-Math.PI / 2, Math.PI, 0);
    textoBandeja.material = matBandeja;
    textoBandeja.parent = this.raiz;
    this.registrarPick(textoBandeja);

    // Los objetos ahora son sólidos: no se pueden atravesar
    registrarSolidoDesdeNodo(this.raiz, "dispensador");
  }

  private flecha: Mesh | null = null;

  /** Animación suave de la flecha indicadora (llamar cada frame si se desea). */
  public animar(t: number): void {
    if (this.flecha) this.flecha.position.y = 2.42 + Math.sin(t * 3) * 0.05;
  }

  private construirModalUI(): void {
    const modal = document.createElement("div");
    modal.id = "dispensadorSemillasModal";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(5, 10, 8, 0.72);
      z-index: 2300;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;

    const card = document.createElement("div");
    card.className = "mc-panel";
    card.style.cssText = `
      width: 560px;
      max-width: 95vw;
      background: #c6c6c6;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #1e293b;
      font-family: "Pixelify Sans", monospace;
    `;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #777; padding-bottom:8px;">
        <div>
          <div style="font-size:18px; font-weight:700; color:#14532d;">🌰 Dispensador Comunal de Semillas</div>
          <div style="font-size:12px; color:#334155;">Repón cualquier raza de maíz criollo, frijol o calabaza si se agotan en tu parcela.</div>
        </div>
        <button id="btnCerrarDispensador" class="mc-boton" style="background:#991b1b; color:#fff; padding:4px 10px; font-size:14px;">✕</button>
      </div>
      <div id="dispensadorLista" style="display:grid; grid-template-columns:1fr; gap:8px;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:6px; border-top:2px solid #777;">
        <button id="btnRecargarTodasSemillas" class="mc-boton" style="background:#15803d; color:#fff; padding:8px 14px; font-size:13px; flex:1;">
          ✨ Recargar Todas (+16 c/u)
        </button>
        <button id="btnListoDispensador" class="mc-boton" style="background:#475569; color:#fff; padding:8px 14px; font-size:13px;">
          Cerrar [Esc]
        </button>
      </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);
    this.modalEl = modal;
    this.listaEl = card.querySelector("#dispensadorLista");

    card.querySelector("#btnCerrarDispensador")?.addEventListener("click", () => this.cerrar());
    card.querySelector("#btnListoDispensador")?.addEventListener("click", () => this.cerrar());
    card.querySelector("#btnRecargarTodasSemillas")?.addEventListener("click", () => {
      let recibidas = 0;
      for (const s of CATALOGO_SEMILLAS) {
        const res = this.invJugador.agregar({ id: s.id, cantidad: s.cantidadLote });
        recibidas += s.cantidadLote - res.sobrante;
      }
      this.audio.semillas();
      this.renderLista();
      this.onActualizarUI?.();
      this.onMensajeToast?.(
        recibidas > 0
          ? `🌰 ¡Dispensador entregó ${recibidas} semillas variadas a tu inventario!`
          : "🎒 Tu mochila ya tiene espacio completo para estas semillas."
      );
    });
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) this.cerrar();
    });
  }

  private renderLista(): void {
    if (!this.listaEl) return;
    this.listaEl.innerHTML = "";

    for (const s of CATALOGO_SEMILLAS) {
      const def = DEFS[s.id];
      const total = this.invJugador.contar(s.id);
      const iconoUrl = def ? generarDataUrlIcono(def.icono, 2) : "";

      const fila = document.createElement("div");
      fila.style.cssText = `
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        background:#8b8b8b; border:2px solid; border-color:#373737 #fff #fff #373737;
        padding:6px 10px; color:#fff;
      `;

      const izq = document.createElement("div");
      izq.style.cssText = "display:flex; align-items:center; gap:10px; min-width:0;";
      izq.innerHTML = `
        <div style="width:32px; height:32px; background:#555; border:2px solid ${s.colorHex}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${iconoUrl ? `<img src="${iconoUrl}" style="width:26px; height:26px; image-rendering:pixelated;" />` : ""}
        </div>
        <div>
          <div style="font-size:13px; font-weight:700; text-shadow:1px 1px 0 #000;">${s.etiqueta}</div>
          <div style="font-size:11px; color:${total === 0 ? "#fecaca" : "#dcfce7"};">
            En inventario: <strong>${total}</strong>${total === 0 ? " (¡Agotada!)" : ""}
          </div>
        </div>
      `;

      const der = document.createElement("div");
      der.style.cssText = "display:flex; gap:6px; flex-shrink:0;";

      const btn16 = document.createElement("button");
      btn16.className = "mc-boton";
      btn16.style.cssText = "background:#0369a1; color:#fff; padding:5px 10px; font-size:12px;";
      btn16.textContent = `+${s.cantidadLote}`;
      btn16.addEventListener("click", () => this.entregarSemilla(s, s.cantidadLote));

      const btn64 = document.createElement("button");
      btn64.className = "mc-boton";
      btn64.style.cssText = "background:#a16207; color:#fff; padding:5px 10px; font-size:12px;";
      btn64.textContent = "Llenar (64)";
      btn64.addEventListener("click", () => this.entregarSemilla(s, 64));

      der.append(btn16, btn64);
      fila.append(izq, der);
      this.listaEl.appendChild(fila);
    }
  }

  private entregarSemilla(s: SemillaDispensable, cantidad: number): void {
    const res = this.invJugador.agregar({ id: s.id, cantidad });
    const entregadas = cantidad - res.sobrante;
    this.audio.semillas();
    this.renderLista();
    this.onActualizarUI?.();
    if (entregadas > 0) {
      this.onMensajeToast?.(`🌰 Recibiste +${entregadas} semillas de ${s.etiqueta}.`);
    } else {
      this.onMensajeToast?.(`🎒 Sin espacio libre para agregar más ${s.etiqueta}.`);
    }
  }

  public estaAbierto(): boolean {
    return !!this.modalEl && this.modalEl.style.display === "flex";
  }

  public abrir(): void {
    if (!this.modalEl) return;
    this.renderLista();
    this.modalEl.style.display = "flex";
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  public cerrar(): void {
    if (this.modalEl) {
      this.modalEl.style.display = "none";
    }
  }
}
