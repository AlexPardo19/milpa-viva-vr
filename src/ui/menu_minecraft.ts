import {
  DificultadMundo,
  PartidaGuardada,
  PresetClimaMundo,
  eliminarPartida,
  listarPartidas
} from "../juego/persistencia_mundo";

export interface OpcionesNuevaPartida {
  nombre: string;
  presetClima: PresetClimaMundo;
  dificultad: DificultadMundo;
  semillaMundo: string;
}

export interface MenuPrincipalCallbacks {
  onCrearPartida: (opts: OpcionesNuevaPartida) => void;
  onCargarPartida: (partida: PartidaGuardada) => void;
  onAbrirControles: () => void;
  onAbrirAjustes: () => void;
}

export interface MenuPausaCallbacks {
  onReanudar: () => void;
  onGuardar: () => boolean;
  onAbrirDispensador: () => void;
  onAbrirControles: () => void;
  onAbrirAjustes: () => void;
  onReiniciar: () => void;
  onGuardarYSalir: () => void;
}

const SPLASHES = [
  "¡4 Razas Nativas!",
  "¡Alianza Tres Hermanas!",
  "¡Cuidado con las Orugas!",
  "¡Pixel-Art Criollo!",
  "¡Maíz Azul y Palomero!"
];

/**
 * Pantalla Principal Estilo Minecraft (Crear Partida, Cargar Mundo Guardado, Ajustes)
 * Se muestra sobre la vista panorámica del escenario 3D vivo antes de entrar al surco.
 */
export class MenuPrincipalMinecraft {
  public readonly overlay: HTMLDivElement;
  private cardPrincipal: HTMLDivElement;
  private cardCrear: HTMLDivElement;
  private cardCargar: HTMLDivElement;
  private listaMundosEl: HTMLDivElement;

  private inputNombre!: HTMLInputElement;
  private inputSemilla!: HTMLInputElement;
  private selectClima!: HTMLSelectElement;
  private selectDificultad!: HTMLSelectElement;

  constructor(private readonly callbacks: MenuPrincipalCallbacks) {
    this.overlay = document.createElement("div");
    this.overlay.id = "menuPrincipalMinecraft";
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2500;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(10, 22, 16, 0.52) 0%, rgba(15, 23, 18, 0.72) 100%);
      padding: 20px;
      font-family: "Pixelify Sans", monospace;
      user-select: none;
    `;

    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];

    // Logo clásico estilo Minecraft con subtítulo dinámico
    const header = document.createElement("div");
    header.style.cssText = `
      position: relative;
      text-align: center;
      margin-bottom: 22px;
    `;
    header.innerHTML = `
      <div style="
        font-size: clamp(30px, 5vw, 52px);
        font-weight: 900;
        letter-spacing: 2px;
        color: #fef08a;
        text-shadow: 0 4px 0 #78350f, 4px 4px 0 #1e293b, -2px -2px 0 #1e293b;
        line-height: 1.05;
      ">🌽 MILPA VIVA</div>
      <div style="
        font-size: 13px;
        color: #cbd5e1;
        letter-spacing: 3px;
        margin-top: 4px;
        text-shadow: 2px 2px 0 #000;
      ">EDICIÓN PIXEL VOXEL VR · AGROECOLOGÍA</div>
      <div style="
        margin-top: 6px;
        display: inline-block;
        background: rgba(15, 23, 18, 0.7);
        border: 2px solid #eab308;
        padding: 2px 10px;
        color: #fde047;
        font-size: 13px;
        font-weight: 700;
        text-shadow: 1px 1px 0 #000;
      ">${splash}</div>
    `;
    this.overlay.appendChild(header);

    // 1. Vista Principal
    this.cardPrincipal = document.createElement("div");
    this.cardPrincipal.className = "mc-panel";
    this.cardPrincipal.style.cssText = `
      width: 400px;
      max-width: 94vw;
      background: rgba(30, 41, 35, 0.90);
      border: 3px solid #94a3b8;
      box-shadow: inset 3px 3px 0 rgba(255,255,255,0.2), inset -3px -3px 0 rgba(0,0,0,0.6), 6px 6px 0 rgba(0,0,0,0.65);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    this.cardPrincipal.append(
      this.crearBotonMC("🌱 Crear Nueva Partida", "#15803d", "#86efac", () => {
        this.mostrarVista("crear");
      }),
      this.crearBotonMC("📂 Cargar Mundo Guardado", "#0369a1", "#7dd3fc", () => {
        this.renderListaMundos();
        this.mostrarVista("cargar");
      }),
      this.crearBotonMC("🎮 Controles y Mecánicas", "#78350f", "#fde68a", () => {
        this.callbacks.onAbrirControles();
      }),
      this.crearBotonMC("⚙️ Ajustes Gráficos y Sonido", "#475569", "#e2e8f0", () => {
        this.callbacks.onAbrirAjustes();
      })
    );

    // 2. Vista Crear Nueva Partida
    this.cardCrear = document.createElement("div");
    this.cardCrear.className = "mc-panel";
    this.cardCrear.style.cssText = `
      width: 460px;
      max-width: 95vw;
      background: rgba(30, 41, 35, 0.94);
      border: 3px solid #94a3b8;
      box-shadow: 6px 6px 0 rgba(0,0,0,0.7);
      padding: 18px;
      display: none;
      flex-direction: column;
      gap: 11px;
      color: #f8fafc;
    `;
    this.cardCrear.innerHTML = `
      <div style="font-size:18px; font-weight:800; color:#fef08a; border-bottom:2px solid #475569; padding-bottom:6px; text-shadow:2px 2px 0 #000;">
        🌍 Crear Nueva Parcela de Milpa
      </div>
      <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#cbd5e1;">
        Nombre de la Partida
        <input id="mcInputNombreMundo" type="text" value="Mi Milpa Criolla" maxlength="28"
          style="background:#0f172a; color:#fff; border:2px solid #64748b; padding:7px 9px; font-family:inherit; font-size:14px;" />
      </label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#cbd5e1;">
          Clima Inicial
          <select id="mcSelectClimaMundo"
            style="background:#0f172a; color:#fff; border:2px solid #64748b; padding:7px 8px; font-family:inherit; font-size:13px;">
            <option value="templado">⛅ Valle Templado</option>
            <option value="temporal">🌧️ Temporal Lluvioso</option>
            <option value="sequia">☀️ Sequía Severa</option>
            <option value="helada">❄️ Helada de Altiplano</option>
          </select>
        </label>
        <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#cbd5e1;">
          Dificultad / Plagas
          <select id="mcSelectDifMundo"
            style="background:#0f172a; color:#fff; border:2px solid #64748b; padding:7px 8px; font-family:inherit; font-size:13px;">
            <option value="normal">🌽 Normal (Con Plagas)</option>
            <option value="tranquilo">🕊️ Tranquilo (Sin Plagas)</option>
            <option value="extremo">🌪️ Extremo (Clima Duro)</option>
          </select>
        </label>
      </div>
      <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#cbd5e1;">
        Semilla del Mundo (Opcional)
        <input id="mcInputSemillaMundo" type="text" placeholder="Ej. CHALCO-2026" maxlength="24"
          style="background:#0f172a; color:#fff; border:2px solid #64748b; padding:7px 9px; font-family:inherit; font-size:13px;" />
      </label>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button id="mcBtnConfirmarCrear" class="mc-boton" style="flex:1; background:#15803d; color:#fff; padding:10px; font-size:14px;">
          ✅ ¡Crear Mundo!
        </button>
        <button id="mcBtnVolverCrear" class="mc-boton" style="background:#475569; color:#fff; padding:10px 16px; font-size:14px;">
          ← Volver
        </button>
      </div>
    `;

    this.inputNombre = this.cardCrear.querySelector("#mcInputNombreMundo")!;
    this.inputSemilla = this.cardCrear.querySelector("#mcInputSemillaMundo")!;
    this.selectClima = this.cardCrear.querySelector("#mcSelectClimaMundo")!;
    this.selectDificultad = this.cardCrear.querySelector("#mcSelectDifMundo")!;

    this.cardCrear.querySelector("#mcBtnConfirmarCrear")?.addEventListener("click", () => {
      const nombre = this.inputNombre.value.trim() || "Mi Milpa Criolla";
      const semillaMundo =
        this.inputSemilla.value.trim() || `MILPA-${Math.floor(1000 + Math.random() * 9000)}`;
      this.ocultar();
      this.callbacks.onCrearPartida({
        nombre,
        presetClima: this.selectClima.value as PresetClimaMundo,
        dificultad: this.selectDificultad.value as DificultadMundo,
        semillaMundo
      });
    });
    this.cardCrear.querySelector("#mcBtnVolverCrear")?.addEventListener("click", () => {
      this.mostrarVista("principal");
    });

    // 3. Vista Cargar Partidas Guardadas
    this.cardCargar = document.createElement("div");
    this.cardCargar.className = "mc-panel";
    this.cardCargar.style.cssText = `
      width: 500px;
      max-width: 95vw;
      background: rgba(30, 41, 35, 0.94);
      border: 3px solid #94a3b8;
      box-shadow: 6px 6px 0 rgba(0,0,0,0.7);
      padding: 18px;
      display: none;
      flex-direction: column;
      gap: 10px;
      color: #f8fafc;
    `;
    this.cardCargar.innerHTML = `
      <div style="font-size:18px; font-weight:800; color:#7dd3fc; border-bottom:2px solid #475569; padding-bottom:6px; text-shadow:2px 2px 0 #000;">
        📂 Seleccionar Partida Guardada
      </div>
      <div id="mcListaMundos" style="display:flex; flex-direction:column; gap:8px; max-height:290px; overflow-y:auto;"></div>
      <button id="mcBtnVolverCargar" class="mc-boton" style="background:#475569; color:#fff; padding:9px; font-size:13px;">
        ← Volver al Menú Principal
      </button>
    `;
    this.listaMundosEl = this.cardCargar.querySelector("#mcListaMundos")!;
    this.cardCargar.querySelector("#mcBtnVolverCargar")?.addEventListener("click", () => {
      this.mostrarVista("principal");
    });

    this.overlay.append(this.cardPrincipal, this.cardCrear, this.cardCargar);
    document.body.appendChild(this.overlay);
  }

  private crearBotonMC(
    texto: string,
    bg: string,
    fg: string,
    onClick: () => void
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "mc-boton";
    b.style.cssText = `
      background: ${bg};
      color: ${fg};
      padding: 11px 16px;
      font-size: 15px;
      font-weight: 800;
      text-shadow: 2px 2px 0 #000;
      border: 3px solid;
      border-color: rgba(255,255,255,0.45) rgba(0,0,0,0.85) rgba(0,0,0,0.85) rgba(255,255,255,0.45);
      cursor: pointer;
    `;
    b.textContent = texto;
    b.addEventListener("click", onClick);
    return b;
  }

  private mostrarVista(vista: "principal" | "crear" | "cargar"): void {
    this.cardPrincipal.style.display = vista === "principal" ? "flex" : "none";
    this.cardCrear.style.display = vista === "crear" ? "flex" : "none";
    this.cardCargar.style.display = vista === "cargar" ? "flex" : "none";
  }

  private renderListaMundos(): void {
    const partidas = listarPartidas();
    this.listaMundosEl.innerHTML = "";
    if (partidas.length === 0) {
      this.listaMundosEl.innerHTML = `
        <div style="padding:18px; text-align:center; background:#0f172a; border:2px dashed #475569; color:#94a3b8; font-size:13px;">
          Aún no hay partidas guardadas.<br/>Crea una partida nueva y guárdala desde el menú de Pausa [Esc].
        </div>
      `;
      return;
    }

    for (const p of partidas) {
      const fecha = new Date(p.actualizadoEn).toLocaleString();
      const fila = document.createElement("div");
      fila.style.cssText = `
        display:flex; justify-content:space-between; align-items:center; gap:10px;
        background:#0f172a; border:2px solid #475569; padding:8px 10px;
      `;
      fila.innerHTML = `
        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:#fef08a;">🌽 ${p.nombre}</div>
          <div style="font-size:11px; color:#94a3b8;">
            Día máx: ${Math.floor(p.diaMaximo || 0)} · Clima: ${p.presetClima} · ${fecha}
          </div>
        </div>
      `;
      const acciones = document.createElement("div");
      acciones.style.cssText = "display:flex; gap:6px; flex-shrink:0;";

      const btnJugar = document.createElement("button");
      btnJugar.className = "mc-boton";
      btnJugar.style.cssText = "background:#15803d; color:#fff; padding:6px 12px; font-size:12px;";
      btnJugar.textContent = "▶ Jugar";
      btnJugar.addEventListener("click", () => {
        this.ocultar();
        this.callbacks.onCargarPartida(p);
      });

      const btnBorrar = document.createElement("button");
      btnBorrar.className = "mc-boton";
      btnBorrar.style.cssText = "background:#991b1b; color:#fff; padding:6px 9px; font-size:12px;";
      btnBorrar.textContent = "🗑️";
      btnBorrar.title = "Eliminar partida guardada";
      btnBorrar.addEventListener("click", () => {
        eliminarPartida(p.id);
        this.renderListaMundos();
      });

      acciones.append(btnJugar, btnBorrar);
      fila.appendChild(acciones);
      this.listaMundosEl.appendChild(fila);
    }
  }

  public estaAbierto(): boolean {
    return this.overlay.style.display !== "none";
  }

  public mostrar(): void {
    this.mostrarVista("principal");
    this.overlay.style.display = "flex";
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  public ocultar(): void {
    this.overlay.style.display = "none";
  }
}

/**
 * Menú de Pausa Dentro del Juego Estilo Minecraft ([Esc] o botón Pausa)
 */
export class MenuPausaMinecraft {
  public readonly overlay: HTMLDivElement;
  private tituloMundoEl: HTMLDivElement;
  private statusEl: HTMLDivElement;

  constructor(private readonly callbacks: MenuPausaCallbacks) {
    this.overlay = document.createElement("div");
    this.overlay.id = "menuPausaMinecraft";
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2400;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(5, 10, 8, 0.65);
      font-family: "Pixelify Sans", monospace;
      user-select: none;
    `;

    const card = document.createElement("div");
    card.className = "mc-panel";
    card.style.cssText = `
      width: 370px;
      max-width: 92vw;
      background: rgba(30, 41, 35, 0.94);
      border: 3px solid #94a3b8;
      box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.72);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 9px;
    `;

    this.tituloMundoEl = document.createElement("div");
    this.tituloMundoEl.style.cssText = `
      text-align: center;
      font-size: 19px;
      font-weight: 800;
      color: #fef08a;
      text-shadow: 2px 2px 0 #000;
      padding-bottom: 6px;
      border-bottom: 2px solid #475569;
    `;
    this.tituloMundoEl.textContent = "⏸️ Juego en Pausa";

    this.statusEl = document.createElement("div");
    this.statusEl.style.cssText = `
      text-align: center;
      font-size: 12px;
      min-height: 16px;
      color: #86efac;
      text-shadow: 1px 1px 0 #000;
    `;

    const mkBtn = (label: string, bg: string, fg: string, fn: () => void) => {
      const b = document.createElement("button");
      b.className = "mc-boton";
      b.style.cssText = `
        background: ${bg};
        color: ${fg};
        padding: 9px 14px;
        font-size: 14px;
        font-weight: 700;
        text-shadow: 1px 1px 0 #000;
        border: 3px solid;
        border-color: rgba(255,255,255,0.4) rgba(0,0,0,0.85) rgba(0,0,0,0.85) rgba(255,255,255,0.4);
        cursor: pointer;
      `;
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    };

    card.append(
      this.tituloMundoEl,
      this.statusEl,
      mkBtn("▶ Reanudar Juego", "#15803d", "#ffffff", () => this.ocultar(true)),
      mkBtn("💾 Guardar Partida", "#0369a1", "#ffffff", () => {
        const ok = this.callbacks.onGuardar();
        this.statusEl.textContent = ok
          ? "✅ ¡Progreso guardado correctamente!"
          : "⚠️ No se pudo guardar en localStorage.";
      }),
      mkBtn("🌰 Dispensador de Semillas", "#a16207", "#fef08a", () => {
        this.ocultar(false);
        this.callbacks.onAbrirDispensador();
      }),
      mkBtn("🎮 Controles y Mecánicas [?]", "#334155", "#f8fafc", () => {
        this.ocultar(false);
        this.callbacks.onAbrirControles();
      }),
      mkBtn("⚙️ Ajustes [O]", "#475569", "#f8fafc", () => {
        this.ocultar(false);
        this.callbacks.onAbrirAjustes();
      }),
      mkBtn("🔄 Reiniciar Parcela", "#92400e", "#fed7aa", () => {
        this.ocultar(false);
        this.callbacks.onReiniciar();
      }),
      mkBtn("🚪 Guardar y Salir al Menú", "#991b1b", "#ffffff", () => {
        this.ocultar(false);
        this.callbacks.onGuardarYSalir();
      })
    );

    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);
  }

  public estaAbierto(): boolean {
    return this.overlay.style.display === "flex";
  }

  public abrir(nombreMundo: string): void {
    this.tituloMundoEl.textContent = `⏸️ ${nombreMundo}`;
    this.statusEl.textContent = "";
    this.overlay.style.display = "flex";
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  public ocultar(notificarReanudar = false): void {
    this.overlay.style.display = "none";
    if (notificarReanudar) {
      this.callbacks.onReanudar();
    }
  }
}
