/**
 * M14: Sistema de Accesibilidad, Confort VR y Ajustes Persistentes (v4.0)
 *
 * Incluye:
 * - Persistencia segura en localStorage ("milpaviva.ajustes.v1").
 * - Modo sentado automático o manual (eleva el origen y acerca herramientas).
 * - Fuerza de gesto asistida (umbrales ×0.6 para azada, deshierbe y cosecha).
 * - Viñeta de confort anti-mareo durante teletransporte y giro.
 * - Subtítulos accesibles para voz de Don Elote y sonidos clave ("abeja", "trueno").
 * - Modo daltónico, mano dominante (izq/der), intensidad háptica e idioma (es/en).
 * - Aviso saludable de descanso cada 30 minutos de sesión.
 */

export interface AjustesConfig {
  giro: "snap" | "suave";
  movimiento: "teletransporte" | "deslizamiento";
  modoSentado: boolean;
  manoDominante: "right" | "left";
  fuerzaAsistida: boolean;
  subtitulos: boolean;
  daltonico: boolean;
  intensidadHaptica: 0 | 0.5 | 1.0;
  idioma: "es" | "en";
}

const STORAGE_KEY = "milpaviva.ajustes.v1";

export const AJUSTES_DEFECTO: AjustesConfig = {
  giro: "snap",
  movimiento: "teletransporte",
  modoSentado: false,
  manoDominante: "right",
  fuerzaAsistida: false,
  subtitulos: true,
  daltonico: false,
  intensidadHaptica: 1.0,
  idioma: "es"
};

export class AjustesSistema {
  public valores: AjustesConfig = { ...AJUSTES_DEFECTO };
  public pausado = false;

  private vinetaElem: HTMLDivElement | null = null;
  private subtituloElem: HTMLDivElement | null = null;
  private modalElem: HTMLDivElement | null = null;
  private subtituloTimer: any = null;
  private vinetaTimer: any = null;
  private tiempoSesionSeg = 0;
  private aviso30MinMostrado = false;

  private listeners: ((cfg: AjustesConfig) => void)[] = [];

  constructor() {
    this.cargar();
    if (typeof document !== "undefined") {
      this.crearElementosDOM();
    }
  }

  public cargar(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.valores = { ...AJUSTES_DEFECTO, ...parsed };
      }
    } catch {
      // localStorage bloqueado o no disponible
      this.valores = { ...AJUSTES_DEFECTO };
    }
  }

  public guardar(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.valores));
    } catch {
      // Ignorar silenciosamente si el almacenamiento está lleno o bloqueado
    }
    for (let i = 0; i < this.listeners.length; i++) {
      this.listeners[i](this.valores);
    }
  }

  public suscribir(fn: (cfg: AjustesConfig) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }

  /**
   * Factor multiplicador de umbrales físicos (0.6 si fuerzaAsistida está activa)
   */
  public get factorUmbralGesto(): number {
    return this.valores.fuerzaAsistida ? 0.6 : 1.0;
  }

  /**
   * Detecta automáticamente postura sentada si la altura del visor en XR es < 1.30m
   */
  public verificarAlturaCabezaXR(alturaY: number): void {
    if (alturaY > 0.3 && alturaY < 1.30 && !this.valores.modoSentado) {
      this.valores.modoSentado = true;
      this.guardar();
      this.mostrarSubtitulo(
        this.valores.idioma === "es"
          ? "🪑 Modo sentado detectado automáticamente (altura adaptada)"
          : "🪑 Seated mode automatically enabled"
      );
    }
  }

  /**
   * Activa brevemente la viñeta periférica para reducir el mareo en VR
   */
  public activarVinetaConfort(duracionMs = 280): void {
    if (!this.vinetaElem) return;
    this.vinetaElem.style.opacity = "1";
    if (this.vinetaTimer) clearTimeout(this.vinetaTimer);
    this.vinetaTimer = setTimeout(() => {
      if (this.vinetaElem) this.vinetaElem.style.opacity = "0";
    }, duracionMs);
  }

  /**
   * Muestra subtítulos accesibles de voz o efectos acústicos ambientales
   */
  public mostrarSubtitulo(texto: string, duracionSeg = 5.0): void {
    if (!this.valores.subtitulos || !this.subtituloElem) return;
    this.subtituloElem.textContent = texto;
    this.subtituloElem.style.opacity = "1";
    this.subtituloElem.style.transform = "translateX(-50%) translateY(0)";

    if (this.subtituloTimer) clearTimeout(this.subtituloTimer);
    this.subtituloTimer = setTimeout(() => {
      if (this.subtituloElem) {
        this.subtituloElem.style.opacity = "0";
        this.subtituloElem.style.transform = "translateX(-50%) translateY(8px)";
      }
    }, duracionSeg * 1000);
  }

  /**
   * Actualiza el temporizador de sesión saludable (aviso cada 30 min)
   */
  public actualizar(dt: number): void {
    if (this.pausado) return;
    this.tiempoSesionSeg += dt;
    if (this.tiempoSesionSeg >= 1800 && !this.aviso30MinMostrado) {
      this.aviso30MinMostrado = true;
      this.mostrarSubtitulo(
        this.valores.idioma === "es"
          ? "⏰ Llevas 30 minutos en la milpa. ¡Recuerda descansar la vista 5 minutos!"
          : "⏰ You've been playing for 30 minutes. Consider taking a 5-minute break!",
        8.0
      );
    }
  }

  public toggleModal(): void {
    if (!this.modalElem) return;
    const vis = this.modalElem.style.display === "block";
    this.modalElem.style.display = vis ? "none" : "block";
    if (!vis) this.renderizarControlesModal();
  }

  private crearElementosDOM(): void {
    // 1. Viñeta periférica de confort VR
    this.vinetaElem = document.createElement("div");
    this.vinetaElem.id = "vrComfortVignette";
    Object.assign(this.vinetaElem.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "990",
      background:
        "radial-gradient(circle, rgba(0,0,0,0) 42%, rgba(15,23,42,0.88) 78%, rgba(15,23,42,0.98) 100%)",
      opacity: "0",
      transition: "opacity 0.16s ease-out"
    });
    document.body.appendChild(this.vinetaElem);

    // 2. Barra de subtítulos cerrados (CC)
    this.subtituloElem = document.createElement("div");
    this.subtituloElem.id = "ccSubtitlesBar";
    Object.assign(this.subtituloElem.style, {
      position: "fixed",
      bottom: "98px",
      left: "50%",
      transform: "translateX(-50%) translateY(8px)",
      maxWidth: "680px",
      backgroundColor: "rgba(15, 23, 42, 0.90)",
      color: "#fef08a",
      padding: "8px 18px",
      borderRadius: "14px",
      border: "2px solid #ca8a04",
      fontFamily: "Trebuchet MS, sans-serif",
      fontSize: "15px",
      fontWeight: "bold",
      textAlign: "center",
      pointerEvents: "none",
      zIndex: "1001",
      opacity: "0",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      boxShadow: "0 6px 18px rgba(0,0,0,0.45)"
    });
    document.body.appendChild(this.subtituloElem);

    // 3. Modal de Accesibilidad y Confort (Tecla [O])
    this.modalElem = document.createElement("div");
    this.modalElem.id = "modalAjustesVR";
    Object.assign(this.modalElem.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "380px",
      maxWidth: "92vw",
      backgroundColor: "#fffbeb",
      border: "4px solid #78350f",
      borderRadius: "18px",
      padding: "18px 20px",
      fontFamily: "Trebuchet MS, sans-serif",
      color: "#1e293b",
      zIndex: "1100",
      display: "none",
      boxShadow: "0 16px 40px rgba(0,0,0,0.55)"
    });
    document.body.appendChild(this.modalElem);
  }

  private renderizarControlesModal(): void {
    if (!this.modalElem) return;
    const v = this.valores;
    this.modalElem.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #d97706;padding-bottom:6px;">
        <h3 style="margin:0;color:#92400e;font-size:19px;">⚙️ Confort VR y Accesibilidad</h3>
        <button id="btnCerrarAjustes" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-weight:bold;">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:14px;">
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>🧭 Modo de Giro:</span>
          <select id="selGiro" style="padding:4px 8px;border-radius:6px;border:1px solid #92400e;">
            <option value="snap" ${v.giro === "snap" ? "selected" : ""}>Snap 30° (Anti-mareo)</option>
            <option value="suave" ${v.giro === "suave" ? "selected" : ""}>Suave continuo</option>
          </select>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>🪑 Modo Sentado (Altura accesible):</span>
          <input type="checkbox" id="chkSentado" ${v.modoSentado ? "checked" : ""} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>✋ Mano Dominante:</span>
          <select id="selMano" style="padding:4px 8px;border-radius:6px;border:1px solid #92400e;">
            <option value="right" ${v.manoDominante === "right" ? "selected" : ""}>Derecha</option>
            <option value="left" ${v.manoDominante === "left" ? "selected" : ""}>Izquierda (Zurdo)</option>
          </select>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>💪 Fuerza de Gesto Asistida (×0.6):</span>
          <input type="checkbox" id="chkFuerza" ${v.fuerzaAsistida ? "checked" : ""} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>🔊 Subtítulos (Voz y Ambiente):</span>
          <input type="checkbox" id="chkSubtitulos" ${v.subtitulos ? "checked" : ""} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>🎨 Modo Daltónico (Símbolos extra):</span>
          <input type="checkbox" id="chkDaltonico" ${v.daltonico ? "checked" : ""} />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>📳 Intensidad Háptica:</span>
          <select id="selHaptica" style="padding:4px 8px;border-radius:6px;border:1px solid #92400e;">
            <option value="1" ${v.intensidadHaptica === 1 ? "selected" : ""}>100%</option>
            <option value="0.5" ${v.intensidadHaptica === 0.5 ? "selected" : ""}>50%</option>
            <option value="0" ${v.intensidadHaptica === 0 ? "selected" : ""}>0% (Desactivada)</option>
          </select>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>🌐 Idioma / Language:</span>
          <select id="selIdioma" style="padding:4px 8px;border-radius:6px;border:1px solid #92400e;">
            <option value="es" ${v.idioma === "es" ? "selected" : ""}>Español</option>
            <option value="en" ${v.idioma === "en" ? "selected" : ""}>English</option>
          </select>
        </label>
        <hr style="border:none;border-top:1px solid #fde68a;margin:4px 0;" />
        <button id="btnBorrarProgreso" style="background:#f97316;color:#fff;border:none;border-radius:8px;padding:7px;cursor:pointer;font-weight:bold;">
          🗑️ Reiniciar Banco de Semillas y Códice
        </button>
      </div>
    `;

    this.modalElem.querySelector("#btnCerrarAjustes")?.addEventListener("click", () => {
      this.toggleModal();
    });
    this.modalElem.querySelector("#selGiro")?.addEventListener("change", (e) => {
      this.valores.giro = (e.target as HTMLSelectElement).value as "snap" | "suave";
      this.guardar();
    });
    this.modalElem.querySelector("#chkSentado")?.addEventListener("change", (e) => {
      this.valores.modoSentado = (e.target as HTMLInputElement).checked;
      this.guardar();
    });
    this.modalElem.querySelector("#selMano")?.addEventListener("change", (e) => {
      this.valores.manoDominante = (e.target as HTMLSelectElement).value as "right" | "left";
      this.guardar();
    });
    this.modalElem.querySelector("#chkFuerza")?.addEventListener("change", (e) => {
      this.valores.fuerzaAsistida = (e.target as HTMLInputElement).checked;
      this.guardar();
    });
    this.modalElem.querySelector("#chkSubtitulos")?.addEventListener("change", (e) => {
      this.valores.subtitulos = (e.target as HTMLInputElement).checked;
      this.guardar();
    });
    this.modalElem.querySelector("#chkDaltonico")?.addEventListener("change", (e) => {
      this.valores.daltonico = (e.target as HTMLInputElement).checked;
      this.guardar();
    });
    this.modalElem.querySelector("#selHaptica")?.addEventListener("change", (e) => {
      this.valores.intensidadHaptica = parseFloat(
        (e.target as HTMLSelectElement).value
      ) as 0 | 0.5 | 1.0;
      this.guardar();
    });
    this.modalElem.querySelector("#selIdioma")?.addEventListener("change", (e) => {
      this.valores.idioma = (e.target as HTMLSelectElement).value as "es" | "en";
      this.guardar();
    });
    this.modalElem.querySelector("#btnBorrarProgreso")?.addEventListener("click", () => {
      try {
        localStorage.removeItem("milpaviva.banco.v1");
        localStorage.removeItem("milpaviva.codice.v1");
      } catch {}
      this.mostrarSubtitulo("♻️ Progreso de semillas y códice reiniciado.");
    });
  }
}
