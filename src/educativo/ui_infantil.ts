/**
 * Interfaz de Usuario Compacta y No Intrusiva (HUD 2D + Soporte WebXR)
 *
 * Características:
 *  - Barra superior compacta dividida en 3 zonas sin invadir el espacio visual 3D:
 *      1. Izquierda: Estado compacto de parcela (Tierra, Agua, NPK, Día/Etapa e Inventario Mano/Troje).
 *      2. Centro: Píldora compacta de misión activa y calendario ritual.
 *      3. Derecha: Barra dedicada de botones de Menús con atajos de teclado:
 *         [M] Semillas · [I] Troje · [F] Fogón · [K] Códice · [C] Clima · [H] Lab 3D · [?] Controles · [O] Ajustes · [👁️] Vista Limpia.
 *  - Barra inferior estilo Hotbar (1–6 + Crecimiento) con cajón desplegable «🌿 Labores [▾]»
 *    para acciones agronómicas secundarias ([X] Deshierbar, [P] Polinizar, [B] +Frijol, [N] +Calabaza, [T] Tutor, [G] Petate).
 */

import { EstadoEducativo, HerramientaTipo, MENSAJES_FASES } from "./estado_educativo";

export interface UIEducativaCallbacks {
  onSeleccionarHerramienta: (herramienta: HerramientaTipo) => void;
  onEjecutarAccion: (herramienta: HerramientaTipo) => void;
  onToggleTimeLapse: () => void;
  onAvanzarSemana: () => void;
  onReiniciar: () => void;
  onToggleModoCientifico: () => boolean;
  // Callbacks v4.0 Milpa Viva y Menús
  onQuitarPlanta?: () => void;
  onDeshierbar?: () => void;
  onPolinizar?: () => void;
  onSembrarFrijol?: () => void;
  onSembrarCalabaza?: () => void;
  onColocarTutor?: () => void;
  onColocarPetate?: () => void;
  onAbrirFogon?: () => void;
  onAbrirBancoSemillas?: () => void;
  onAbrirCodice?: () => void;
  onAbrirAjustes?: () => void;
  onAbrirAlmacen?: () => void;
  onToggleClima?: () => void;
  onAbrirControles?: () => void;
}

export class UIEducativa {
  private estado: EstadoEducativo;
  private callbacks: UIEducativaCallbacks;
  private container: HTMLDivElement;

  // Elementos DOM reactivos
  private topRow!: HTMLDivElement;
  private cardMision!: HTMLDivElement;
  private badgePaso!: HTMLSpanElement;
  private txtTituloMision!: HTMLSpanElement;
  private txtSubtituloMision!: HTMLDivElement;
  private txtConsejoMision!: HTMLDivElement;

  private barTierra!: HTMLDivElement;
  private txtTierra!: HTMLSpanElement;

  private barAgua!: HTMLDivElement;
  private txtAgua!: HTMLSpanElement;

  private barNutrientes!: HTMLDivElement;
  private txtNutrientes!: HTMLSpanElement;

  private txtDia!: HTMLSpanElement;
  private txtEtapa!: HTMLSpanElement;

  private botonesHerramientas: Map<HerramientaTipo, HTMLButtonElement> = new Map();
  private btnSolPlay?: HTMLButtonElement;
  private modalTrofeo!: HTMLDivElement;

  // Elementos v4.0 Milpa Viva
  private bannerEventoClimatico!: HTMLDivElement;
  private txtCalendarioRitual!: HTMLSpanElement;
  private txtMisionActivaV4!: HTMLSpanElement;
  private txtInventarioMazorcas!: HTMLDivElement;
  private laboresDrawer!: HTMLDivElement;
  private laboresAbierto = false;
  private hudCompactoOculto = false;

  constructor(estado: EstadoEducativo, callbacks: UIEducativaCallbacks) {
    this.estado = estado;
    this.callbacks = callbacks;

    this.container = document.createElement("div");
    this.container.id = "ui-educativa-container";
    document.body.appendChild(this.container);

    this.inyectarEstilos();
    this.crearEstructuraDOM();
    this.estado.suscribir(() => this.actualizarUI());
    this.actualizarUI();
  }

  private inyectarEstilos(): void {
    const style = document.createElement("style");
    style.textContent = `
      #ui-educativa-container {
        position: fixed;
        inset: 0;
        pointer-events: none;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: #1e293b;
        user-select: none;
        z-index: 100;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 8px 12px;
        box-sizing: border-box;
      }

      /* Fila Superior Compacta (No invade el centro de la pantalla) */
      .hud-top-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        pointer-events: none;
      }

      /* 1. Panel Izquierdo Compacto de Estado de Parcela */
      .stats-panel {
        pointer-events: auto;
        background: rgba(15, 23, 18, 0.84);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(74, 222, 128, 0.45);
        border-radius: 14px;
        padding: 8px 11px;
        width: 210px;
        color: #f8fafc;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .stats-header-dia {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        padding-bottom: 4px;
        margin-bottom: 6px;
      }
      .dia-numero {
        font-size: 15px;
        font-weight: 900;
        color: #fbbf24;
      }
      .dia-etapa {
        font-size: 10.5px;
        font-weight: 700;
        color: #86efac;
        text-align: right;
      }
      .stat-item {
        margin-bottom: 5px;
      }
      .stat-label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10.5px;
        font-weight: 700;
        color: #e2e8f0;
        margin-bottom: 2px;
      }
      .stat-bar-bg {
        height: 6px;
        background: rgba(255, 255, 255, 0.14);
        border-radius: 4px;
        overflow: hidden;
      }
      .stat-bar-fill {
        height: 100%;
        width: 0%;
        border-radius: 4px;
        transition: width 0.35s ease;
      }
      .fill-tierra { background: linear-gradient(90deg, #d97706, #f59e0b); }
      .fill-agua { background: linear-gradient(90deg, #0284c7, #38bdf8); }
      .fill-nutrientes { background: linear-gradient(90deg, #16a34a, #4ade80); }

      .inv-mazorcas-pill {
        margin-top: 6px;
        background: rgba(245, 158, 11, 0.18);
        border: 1px solid rgba(251, 191, 36, 0.5);
        border-radius: 8px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 800;
        color: #fde68a;
        text-align: center;
        cursor: pointer;
      }
      .inv-mazorcas-pill:hover {
        background: rgba(245, 158, 11, 0.32);
      }

      /* 2. Píldora Central Compacta de Misión */
      .mision-header {
        pointer-events: auto;
        max-width: 390px;
        background: rgba(15, 23, 18, 0.82);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(251, 191, 36, 0.5);
        border-radius: 14px;
        padding: 6px 12px;
        color: #f8fafc;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: opacity 0.2s ease;
      }
      .mision-top-line {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mision-icono {
        font-size: 20px;
        line-height: 1;
      }
      .mision-badge {
        background: rgba(251, 191, 36, 0.2);
        color: #fde047;
        border: 1px solid #eab308;
        border-radius: 8px;
        padding: 1px 6px;
        font-size: 9.5px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .mision-titulo {
        font-size: 13px;
        font-weight: 800;
        color: #ffffff;
      }
      .mision-subtitulo {
        font-size: 11px;
        color: #cbd5e1;
        line-height: 1.25;
      }
      .mision-meta-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 10px;
        color: #93c5fd;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 3px;
      }

      /* 3. Barra Derecha de Botones de Menús */
      .menus-top-bar {
        pointer-events: auto;
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 5px;
        max-width: 440px;
      }
      .menu-top-btn {
        background: rgba(15, 23, 18, 0.86);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(255, 255, 255, 0.22);
        border-radius: 10px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 700;
        color: #f8fafc;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
        transition: all 0.15s ease;
      }
      .menu-top-btn:hover {
        background: rgba(30, 41, 59, 0.95);
        border-color: #fbbf24;
        transform: translateY(-1px);
      }
      .menu-top-btn kbd {
        background: rgba(255, 255, 255, 0.14);
        border-radius: 4px;
        padding: 0px 4px;
        font-size: 9.5px;
        color: #fde68a;
        font-family: inherit;
      }

      /* Banner Meteorológico Compacto */
      .banner-clima-alerta {
        position: fixed;
        top: 68px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(153, 27, 27, 0.92);
        color: #fef2f2;
        border: 1.5px solid #fca5a5;
        border-radius: 12px;
        padding: 5px 14px;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
        display: none;
        pointer-events: auto;
        z-index: 140;
      }

      /* Zona Inferior: Cajón de Labores + Hotbar */
      .hud-bottom-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        margin: 0 auto;
        pointer-events: none;
      }

      .labores-drawer {
        pointer-events: auto;
        display: none;
        flex-wrap: wrap;
        justify-content: center;
        gap: 5px;
        background: rgba(15, 23, 18, 0.88);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(74, 222, 128, 0.45);
        border-radius: 14px;
        padding: 6px 10px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      }
      .labores-drawer.abierto {
        display: flex;
      }
      .labor-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 9px;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 700;
        color: #ecfdf5;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .labor-btn:hover {
        background: rgba(16, 185, 129, 0.28);
        border-color: #34d399;
      }

      /* Hotbar Inferior Compacta Estilo Minecraft */
      .toolbar-container {
        pointer-events: auto;
        background: rgba(15, 23, 18, 0.88);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(255, 255, 255, 0.24);
        border-radius: 16px;
        padding: 5px 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .tool-btn {
        background: rgba(255, 255, 255, 0.07);
        border: 1.5px solid rgba(255, 255, 255, 0.18);
        border-radius: 11px;
        padding: 5px 10px;
        min-width: 58px;
        font-size: 11px;
        font-weight: 700;
        color: #e2e8f0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        transition: all 0.15s ease;
        outline: none;
      }
      .tool-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: translateY(-2px);
      }
      .tool-btn.active {
        background: rgba(234, 179, 8, 0.28);
        border-color: #fbbf24;
        color: #fef08a;
        box-shadow: 0 0 12px rgba(234, 179, 8, 0.45);
        transform: translateY(-2px);
      }
      .tool-btn-icon {
        font-size: 18px;
        line-height: 1;
      }
      .btn-accion-rapida {
        background: rgba(22, 163, 74, 0.28);
        border-color: #4ade80;
        color: #bbf7d0;
      }
      .btn-labores-toggle {
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(52, 211, 153, 0.5);
        color: #a7f3d0;
      }

      .hud-oculto .stats-panel,
      .hud-oculto .mision-header,
      .hud-oculto .labores-drawer {
        opacity: 0;
        pointer-events: none;
        transform: translateY(-8px);
      }

      /* Modal de Celebración / Trofeo */
      .modal-celebracion {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.68);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        z-index: 2600;
      }
      .modal-celebracion.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .trofeo-card {
        background: #fffdf0;
        border: 3.5px solid #2a3417;
        border-radius: 26px;
        padding: 26px 30px;
        max-width: 440px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.45);
      }
      .trofeo-icono {
        font-size: 60px;
        margin-bottom: 8px;
      }
      .trofeo-titulo {
        font-size: 24px;
        font-weight: 900;
        color: #ca8a04;
        margin: 0 0 8px 0;
      }
      .trofeo-subtitulo {
        font-size: 14px;
        color: #334155;
        font-weight: 600;
        line-height: 1.4;
        margin: 0 0 16px 0;
      }
      .medallas-row {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 18px;
        flex-wrap: wrap;
      }
      .medalla-item {
        background: #fef08a;
        border: 1.5px solid #eab308;
        border-radius: 10px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 800;
      }
      .btn-reiniciar-cultivo {
        background: #16a34a;
        color: #ffffff;
        border: 2px solid #14532d;
        border-radius: 14px;
        padding: 10px 22px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }

      @media (max-width: 900px) {
        .mision-header { display: none; }
        .stats-panel { width: 175px; padding: 6px 8px; }
        .menus-top-bar { max-width: 290px; }
      }
    `;
    document.head.appendChild(style);
  }

  private crearEstructuraDOM(): void {
    this.topRow = document.createElement("div");
    this.topRow.className = "hud-top-row";

    // 1. Panel Izquierdo Compacto: Día + Barras + Mano/Troje
    const stats = document.createElement("div");
    stats.className = "stats-panel";
    stats.innerHTML = `
      <div class="stats-header-dia">
        <span class="dia-numero" id="txtDiaNumero">Día 0</span>
        <span class="dia-etapa" id="txtEtapaNombre">Suelo Listo</span>
      </div>
      <div class="stat-item">
        <div class="stat-label-row">
          <span>⛏️ Tierra</span>
          <span id="valTierra">0%</span>
        </div>
        <div class="stat-bar-bg"><div class="stat-bar-fill fill-tierra" id="barTierra"></div></div>
      </div>
      <div class="stat-item">
        <div class="stat-label-row">
          <span>💧 Agua</span>
          <span id="valAgua">18%</span>
        </div>
        <div class="stat-bar-bg"><div class="stat-bar-fill fill-agua" id="barAgua"></div></div>
      </div>
      <div class="stat-item">
        <div class="stat-label-row">
          <span>🌿 NPK</span>
          <span id="valNutrientes">20%</span>
        </div>
        <div class="stat-bar-bg"><div class="stat-bar-fill fill-nutrientes" id="barNutrientes"></div></div>
      </div>
      <div class="inv-mazorcas-pill" id="txtInventarioMazorcas" title="Clic para abrir la Troje [I]">
        🎒 Mano: 0 🌽 | 🏛️ Troje: 0 🌽
      </div>
    `;
    this.txtDia = stats.querySelector("#txtDiaNumero")!;
    this.txtEtapa = stats.querySelector("#txtEtapaNombre")!;
    this.barTierra = stats.querySelector("#barTierra")!;
    this.txtTierra = stats.querySelector("#valTierra")!;
    this.barAgua = stats.querySelector("#barAgua")!;
    this.txtAgua = stats.querySelector("#valAgua")!;
    this.barNutrientes = stats.querySelector("#barNutrientes")!;
    this.txtNutrientes = stats.querySelector("#valNutrientes")!;
    this.txtInventarioMazorcas = stats.querySelector("#txtInventarioMazorcas")!;
    this.txtInventarioMazorcas.addEventListener("click", () => this.callbacks.onAbrirAlmacen?.());
    this.topRow.appendChild(stats);

    // 2. Píldora Central Compacta de Misión y Calendario
    this.cardMision = document.createElement("div");
    this.cardMision.className = "mision-header";
    this.cardMision.innerHTML = `
      <div class="mision-top-line">
        <span class="mision-icono">🌱</span>
        <span class="mision-badge">Paso 1</span>
        <span class="mision-titulo">Título de la Misión</span>
      </div>
      <div class="mision-subtitulo">Subtítulo instructivo</div>
      <div class="mision-consejo" style="display:none;"></div>
      <div class="mision-meta-row">
        <span id="txtCalendarioRitual">🕯️ 2 Feb: Bendición</span>
        <span id="txtMisionActivaV4">🎯 Labranza</span>
      </div>
    `;
    this.badgePaso = this.cardMision.querySelector(".mision-badge")!;
    this.txtTituloMision = this.cardMision.querySelector(".mision-titulo")!;
    this.txtSubtituloMision = this.cardMision.querySelector(".mision-subtitulo")!;
    this.txtConsejoMision = this.cardMision.querySelector(".mision-consejo")!;
    this.txtCalendarioRitual = this.cardMision.querySelector("#txtCalendarioRitual")!;
    this.txtMisionActivaV4 = this.cardMision.querySelector("#txtMisionActivaV4")!;
    this.topRow.appendChild(this.cardMision);

    // 3. Barra Superior Derecha de Botones de Menús Dedicados
    const menusBar = document.createElement("div");
    menusBar.className = "menus-top-bar";

    const botonesMenus: { icon: string; label: string; key: string; fn: () => void }[] = [
      { icon: "🧬", label: "Semillas", key: "M", fn: () => this.callbacks.onAbrirBancoSemillas?.() },
      { icon: "🏛️", label: "Troje", key: "I", fn: () => this.callbacks.onAbrirAlmacen?.() },
      { icon: "🔥", label: "Fogón", key: "F", fn: () => this.callbacks.onAbrirFogon?.() },
      { icon: "📖", label: "Códice", key: "K", fn: () => this.callbacks.onAbrirCodice?.() },
      { icon: "⛅", label: "Clima", key: "C", fn: () => this.callbacks.onToggleClima?.() },
      { icon: "🔬", label: "Lab 3D", key: "H", fn: () => this.callbacks.onToggleModoCientifico() },
      { icon: "🎮", label: "Controles", key: "?", fn: () => this.callbacks.onAbrirControles?.() },
      { icon: "⚙️", label: "Ajustes", key: "O", fn: () => this.callbacks.onAbrirAjustes?.() }
    ];

    botonesMenus.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "menu-top-btn";
      btn.innerHTML = `<span>${m.icon}</span><span>${m.label}</span><kbd>${m.key}</kbd>`;
      btn.addEventListener("click", () => m.fn());
      menusBar.appendChild(btn);
    });

    // Botón para ocultar/mostrar paneles informativos y despejar la vista
    const btnVistaLimpia = document.createElement("button");
    btnVistaLimpia.className = "menu-top-btn";
    btnVistaLimpia.title = "Ocultar o mostrar paneles superiores para vista limpia";
    btnVistaLimpia.innerHTML = `<span>👁️</span><span>HUD</span>`;
    btnVistaLimpia.addEventListener("click", () => {
      this.hudCompactoOculto = !this.hudCompactoOculto;
      this.container.classList.toggle("hud-oculto", this.hudCompactoOculto);
    });
    menusBar.appendChild(btnVistaLimpia);

    this.topRow.appendChild(menusBar);
    this.container.appendChild(this.topRow);

    // Banner de Alerta Meteorológica (M6)
    this.bannerEventoClimatico = document.createElement("div");
    this.bannerEventoClimatico.className = "banner-clima-alerta";
    this.container.appendChild(this.bannerEventoClimatico);

    // Modal de Celebración de Trofeo
    this.modalTrofeo = document.createElement("div");
    this.modalTrofeo.className = "modal-celebracion";
    this.modalTrofeo.innerHTML = `
      <div class="trofeo-card">
        <div class="trofeo-icono">🏆</div>
        <h2 class="trofeo-titulo">¡Maestro Agricultor de la Milpa!</h2>
        <p class="trofeo-subtitulo">
          Lograste cultivar y cosechar la milpa respetando los límites biológicos y climáticos de cada especie de maíz.
        </p>
        <div class="medallas-row">
          <div class="medalla-item">⛏️ Tierra Arada</div>
          <div class="medalla-item">🌰 Semilla Criolla</div>
          <div class="medalla-item">💧 Riego Óptimo</div>
          <div class="medalla-item">🌽 Cosecha en Troje</div>
        </div>
        <button class="btn-reiniciar-cultivo" id="btnSembrarDeNuevo">
          🌱 ¡Continuar en la Milpa!
        </button>
      </div>
    `;
    const btnRestart = this.modalTrofeo.querySelector("#btnSembrarDeNuevo")!;
    btnRestart.addEventListener("click", () => {
      this.modalTrofeo.classList.remove("visible");
      this.callbacks.onReiniciar();
    });
    this.container.appendChild(this.modalTrofeo);
  }

  /**
   * Refresca todos los elementos visuales según el estado actual
   */
  public actualizarUI(): void {
    const info = MENSAJES_FASES[this.estado.fase];

    const iconoEl = this.cardMision.querySelector(".mision-icono")!;
    iconoEl.textContent = info.icono;
    this.badgePaso.textContent = this.estado.fase.toUpperCase();
    this.txtTituloMision.textContent = info.titulo;
    this.txtSubtituloMision.textContent = info.subtitulo;
    this.txtConsejoMision.textContent = `💡 ${info.consejo}`;

    // Actualizar Barras de Salud Compactas
    this.barTierra.style.width = `${this.estado.tierraArada}%`;
    this.txtTierra.textContent = `${this.estado.tierraArada}%`;

    this.barAgua.style.width = `${this.estado.humedadSuelo}%`;
    let aguaEstado = `${Math.round(this.estado.humedadSuelo)}%`;
    if (this.estado.humedadSuelo < 28) aguaEstado += " (Seco)";
    else if (this.estado.humedadSuelo > 78) aguaEstado += " (Exceso)";
    else aguaEstado += " (Óptimo)";
    this.txtAgua.textContent = aguaEstado;

    this.barNutrientes.style.width = `${this.estado.nutrientesSuelo}%`;
    this.txtNutrientes.textContent = `${Math.round(this.estado.nutrientesSuelo)}%`;

    // Actualizar Día y Etapa
    this.txtDia.textContent = `Día ${Math.floor(this.estado.diaActual)}`;
    this.txtEtapa.textContent = this.estado.obtenerNombreEtapa();

    // Actualizar Botón de Herramienta Activa
    if (this.botonesHerramientas.size > 0) {
      this.botonesHerramientas.forEach((btn, hId) => {
        btn.classList.toggle("active", hId === this.estado.herramientaSeleccionada);
      });
    }

    // Estado del botón Time-Lapse
    if (this.btnSolPlay) {
      if (this.estado.reproduciendoCrecimiento) {
        this.btnSolPlay.classList.add("active");
        this.btnSolPlay.innerHTML = `<span class="tool-btn-icon">⏸</span><span>Pausa</span>`;
      } else {
        this.btnSolPlay.classList.remove("active");
        this.btnSolPlay.innerHTML = `<span class="tool-btn-icon">▶</span><span>Crecimiento</span>`;
      }
    }

    if (this.estado.fase === "celebrar" && this.estado.eloteCosechado) {
      this.modalTrofeo.classList.add("visible");
    } else {
      this.modalTrofeo.classList.remove("visible");
    }
  }

  /**
   * Muestra un mensaje flotante compacto sobre la barra inferior sin tapar el centro 3D
   */
  /**
   * Muestra un mensaje flotante compacto en cola con duración adaptativa según longitud
   */
  public mostrarToast(texto: string): void {
    let container = document.getElementById("milpa-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "milpa-toast-container";
      container.style.cssText = `
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column-reverse;
        align-items: center;
        gap: 6px;
        pointer-events: none;
        z-index: 2000;
        max-width: min(680px, 92vw);
      `;
      document.body.appendChild(container);
    }

    // Limitar a máximo 3 toasts simultáneos para no saturar
    while (container.children.length >= 3) {
      container.firstElementChild?.remove();
    }

    const toast = document.createElement("div");
    toast.className = "mc-toast-msg";
    toast.style.cssText = `
      background: rgba(15, 23, 18, 0.94);
      border: 3px solid #25330f;
      outline: 2px solid #fbbf24;
      padding: 6px 14px;
      font-family: 'Pixelify Sans', 'VT323', monospace;
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
      text-shadow: 2px 2px 0 #1e293b;
      text-align: center;
      image-rendering: pixelated;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      transition: opacity 0.3s ease, transform 0.3s ease;
      transform: translateY(0);
      opacity: 1;
    `;
    toast.textContent = texto;
    container.appendChild(toast);

    // Duración adaptativa: mínimo 2.2s, más 30ms por carácter adicional
    const duracionMs = Math.max(2200, Math.min(5000, 2000 + texto.length * 30));

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 320);
    }, duracionMs);
  }

  public actualizarBannerClimatico(visible: boolean, texto: string): void {
    if (!this.bannerEventoClimatico) return;
    this.bannerEventoClimatico.style.display = visible ? "block" : "none";
    this.bannerEventoClimatico.textContent = texto;
  }

  public actualizarProgresoV4(hitoCalendario: string, misionTexto: string): void {
    if (this.txtCalendarioRitual) this.txtCalendarioRitual.textContent = hitoCalendario;
    if (this.txtMisionActivaV4) this.txtMisionActivaV4.textContent = `🎯 ${misionTexto}`;
  }

  public actualizarInventarioMazorcas(enMano: number, enTroje: number): void {
    if (this.txtInventarioMazorcas) {
      this.txtInventarioMazorcas.textContent = `🎒 Mano: ${enMano} 🌽 | 🏛️ Troje: ${enTroje} 🌽`;
    }
  }
}
