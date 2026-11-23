/**
 * Compatibilidad nativa con Mandos de Xbox Series S|X (Wireless Bluetooth / USB-C)
 * mediante HTML5 Gamepad API (W3C Standard Mapping) + Vibración Háptica Dual-Rumble.
 *
 * Mapeo estilo Minecraft Xbox Series S:
 * - Stick Izquierdo (LS): Caminar analógico 360° · L3 (clic): Correr / Sprint
 * - Stick Derecho (RS): Mirar alrededor (1ª persona) o rotar cámara orbital · R3 (clic): 1ª Persona <-> Orbital
 * - RT (Gatillo Derecho): Usar herramienta equipada (arar, sembrar, regar, abonar, cosechar, interactuar)
 * - LT (Gatillo Izquierdo): Acción contextual rápida (cosechar mazorca, recoger drop, abrir estación)
 * - LB / RB (Bompers): Cambiar herramienta anterior / siguiente en la Hotbar (1–9)
 * - Botón A (Verde): Saltar en campo / Confirmar elemento seleccionado en menús
 * - Botón B (Rojo): Cerrar ventana abierta / Quitar o limpiar planta en parcela [Q]
 * - Botón X (Azul): Interactuar con estación apuntada [E] o Deshierbar y retirar plagas [X]
 * - Botón Y (Amarillo): Abrir / Cerrar Inventario (Mochila y Troje [I])
 * - Cruceta (D-Pad): [▲] +15d Sol · [▼] Panel Clima · [◀] +Frijol · [▶] +Calabaza (y navegación en menús)
 * - View (⧉): Siguiente estación del surco (1–6) · Menu (☰): Menú de Pausa / Cerrar ventana
 */

import { ControladorJugador } from "./controlador_jugador";

export interface CallbacksControladorXbox {
  onCambiarSlotHotbar: (dir: -1 | 1) => void;
  onQuitarPlanta: () => void;
  onAbrirInventario: () => void;
  onAccionX: () => void;
  onAvanzarSol: () => void;
  onAbrirClima: () => void;
  onAsociarFrijol: () => void;
  onAsociarCalabaza: () => void;
  onCambiarEstacion: () => void;
  onEscape: () => void;
  onAbrirGuiaXbox?: () => void;
  onEstadoConexion?: (conectado: boolean, nombre: string) => void;
  onToast?: (msg: string) => void;
}

const DEADZONE_STICK = 0.16;
const UMBRAL_GATILLO = 0.38;

function aplicarDeadzoneRadial(x: number, y: number, deadzone = DEADZONE_STICK): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return [0, 0];
  const norm = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const curva = Math.pow(norm, 1.35);
  return [(x / mag) * curva, (y / mag) * curva];
}

export class ControladorXbox {
  private readonly jugador: ControladorJugador;
  private readonly cb: CallbacksControladorXbox;

  public conectado = false;
  public indiceGamepad: number | null = null;
  public nombreGamepad = "Xbox Series S|X Controller";
  public factorHaptico = 1.0;

  private prevButtons: boolean[] = new Array(18).fill(false);
  private timerAutoRepeatRT = 0;
  private timerNavMenu = 0;
  private timerSliderRepeat = 0;

  private badgeEl: HTMLDivElement | null = null;
  private modalFocusIdx = 0;
  private ultimoElementoEnfocado: HTMLElement | null = null;

  constructor(jugador: ControladorJugador, callbacks: CallbacksControladorXbox) {
    this.jugador = jugador;
    this.cb = callbacks;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      this.crearBadgeHUD();
      this.configurarEventosConexion();
    }
  }

  private crearBadgeHUD(): void {
    const el = document.createElement("div");
    el.id = "xboxGamepadBadge";
    el.title = "Haz clic para ver el mapa de botones del Mando Xbox Series S";
    el.style.cssText = `
      position: fixed;
      bottom: 14px;
      left: 14px;
      z-index: 1200;
      display: none;
      align-items: center;
      gap: 8px;
      background: rgba(15, 23, 18, 0.88);
      border: 2px solid #4ade80;
      box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.75);
      color: #ecfdf5;
      padding: 5px 10px;
      font-family: "Pixelify Sans", "VT323", monospace;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    `;
    el.innerHTML = `
      <span style="color:#4ade80;font-size:14px;">🎮</span>
      <span>Xbox Series S</span>
      <span style="color:#86efac;font-size:11px;opacity:0.9;">[RT] Usar · [LB/RB] Hotbar · [Y] Troje</span>
    `;
    el.addEventListener("click", () => {
      this.cb.onAbrirGuiaXbox?.();
    });
    document.body.appendChild(el);
    this.badgeEl = el;
  }

  private configurarEventosConexion(): void {
    window.addEventListener("gamepadconnected", (ev: GamepadEvent) => {
      const gp = ev.gamepad;
      if (!gp) return;
      this.activarConexion(gp);
    });

    window.addEventListener("gamepaddisconnected", (ev: GamepadEvent) => {
      if (this.indiceGamepad === ev.gamepad?.index) {
        this.conectado = false;
        this.indiceGamepad = null;
        this.jugador.usandoGamepad = false;
        this.jugador.moveAnalogicoForward = 0;
        this.jugador.moveAnalogicoRight = 0;
        this.jugador.lookAnalogicoYaw = 0;
        this.jugador.lookAnalogicoPitch = 0;
        this.jugador.corriendoGamepad = false;
        this.limpiarFocoModal();
        if (this.badgeEl) this.badgeEl.style.display = "none";
        this.cb.onEstadoConexion?.(false, this.nombreGamepad);
        this.cb.onToast?.("🎮 Mando Xbox desconectado (controles de teclado y ratón activos).");
      }
    });

    // Si el usuario presiona teclado o ratón, alternar tooltips a teclado
    window.addEventListener("keydown", () => {
      this.jugador.usandoGamepad = false;
    });
    window.addEventListener("mousedown", () => {
      this.jugador.usandoGamepad = false;
    });
  }

  private activarConexion(gp: Gamepad): void {
    const yaEstaba = this.conectado;
    this.conectado = true;
    this.indiceGamepad = gp.index;
    this.nombreGamepad = this.formatearNombreMando(gp.id);
    if (this.badgeEl) {
      this.badgeEl.style.display = "flex";
    }
    this.cb.onEstadoConexion?.(true, this.nombreGamepad);
    if (!yaEstaba) {
      this.vibrar(0.45, 0.75, 160);
      this.cb.onToast?.(
        `🎮 ${this.nombreGamepad} conectado · [LS] Mover · [RS] Mirar · [RT] Usar · [LB/RB] Hotbar · [Y] Troje`
      );
    }
  }

  private formatearNombreMando(rawId: string): string {
    if (!rawId) return "Mando Xbox Series S";
    if (/xbox|xinput|045e/i.test(rawId)) {
      return "Mando Xbox Series S|X";
    }
    return rawId.split("(")[0].trim().slice(0, 32) || "Mando Xbox Series S";
  }

  private obtenerGamepadActivo(): Gamepad | null {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return null;
    }
    const lista = navigator.getGamepads();
    if (!lista) return null;

    if (this.indiceGamepad !== null && lista[this.indiceGamepad]?.connected) {
      return lista[this.indiceGamepad];
    }

    // Priorizar mando Xbox / mapping estándar si hay varios dispositivos conectados
    let candidato: Gamepad | null = null;
    for (let i = 0; i < lista.length; i++) {
      const gp = lista[i];
      if (!gp || !gp.connected) continue;
      if (/xbox|xinput|045e/i.test(gp.id) || gp.mapping === "standard") {
        candidato = gp;
        break;
      }
      if (!candidato) candidato = gp;
    }

    if (candidato) {
      this.activarConexion(candidato);
    }
    return candidato;
  }

  /** Dispara vibración háptica Dual-Rumble en los motores del mando Xbox Series S. */
  public vibrar(fuerte = 0.35, suave = 0.5, duracionMs = 90): void {
    const escala = Math.max(0, Math.min(1.5, this.factorHaptico));
    if (escala <= 0.01) return;
    try {
      const gp = this.obtenerGamepadActivo() as any;
      const actuator = gp?.vibrationActuator || gp?.hapticActuators?.[0];
      if (actuator && typeof actuator.playEffect === "function") {
        actuator
          .playEffect("dual-rumble", {
            startDelay: 0,
            duration: duracionMs,
            weakMagnitude: Math.max(0, Math.min(1, suave * escala)),
            strongMagnitude: Math.max(0, Math.min(1, fuerte * escala)),
          })
          .catch?.(() => {});
      } else if (actuator && typeof actuator.pulse === "function") {
        actuator.pulse(Math.min(1, Math.max(fuerte, suave) * escala), duracionMs);
      }
    } catch {
      // Silencioso en navegadores sin soporte de vibración
    }
  }

  private botonPresionado(gp: Gamepad, idx: number): boolean {
    const b = gp.buttons[idx];
    if (!b) return false;
    if (idx === 6 || idx === 7) {
      return b.pressed || b.value >= UMBRAL_GATILLO;
    }
    return b.pressed || b.value > 0.5;
  }

  /** Sondeo por frame del mando Xbox Series S (funciona en juego activo y en menús/modales). */
  public actualizar(dt: number): void {
    const gp = this.obtenerGamepadActivo();
    if (!gp) return;

    const curr: boolean[] = new Array(18).fill(false);
    let huboActividadBoton = false;
    for (let i = 0; i < 18; i++) {
      curr[i] = this.botonPresionado(gp, i);
      if (curr[i]) huboActividadBoton = true;
    }

    const justPressed = (idx: number): boolean => curr[idx] && !this.prevButtons[idx];

    const rawLX = gp.axes[0] ?? 0;
    const rawLY = gp.axes[1] ?? 0;
    const rawRX = gp.axes[2] ?? 0;
    const rawRY = gp.axes[3] ?? 0;

    const [lx, ly] = aplicarDeadzoneRadial(rawLX, rawLY, DEADZONE_STICK);
    const [rx, ry] = aplicarDeadzoneRadial(rawRX, rawRY, DEADZONE_STICK);

    if (
      huboActividadBoton ||
      Math.abs(lx) > 0.01 ||
      Math.abs(ly) > 0.01 ||
      Math.abs(rx) > 0.01 ||
      Math.abs(ry) > 0.01
    ) {
      this.jugador.usandoGamepad = true;
    }

    const modalAbierto = this.jugador.hayModalAbierto();

    // 1. Si hay un modal o menú abierto, manejar navegación de UI con el mando Xbox
    if (modalAbierto) {
      this.jugador.moveAnalogicoForward = 0;
      this.jugador.moveAnalogicoRight = 0;
      this.jugador.lookAnalogicoYaw = 0;
      this.jugador.lookAnalogicoPitch = 0;
      this.actualizarNavegacionModal(dt, curr, justPressed, lx, ly, rx);
      this.prevButtons = curr;
      return;
    }

    this.limpiarFocoModal();

    // 2. Movimiento y cámara analógica en campo (Stick Izquierdo y Stick Derecho)
    this.jugador.moveAnalogicoRight = lx;
    this.jugador.moveAnalogicoForward = -ly; // En Gamepad API, arriba es -1
    this.jugador.lookAnalogicoYaw = rx;
    this.jugador.lookAnalogicoPitch = ry;

    // L3 (10): Sprint / Correr (toggle limpio sin forzar true cada frame)
    if (justPressed(10)) {
      this.jugador.corriendoGamepad = !this.jugador.corriendoGamepad;
      this.vibrar(0.15, 0.25, 55);
    }

    // R3 (11): Alternar vista 1ª Persona <-> Modo Orbital
    if (justPressed(11)) {
      this.jugador.alternarModo();
      this.vibrar(0.2, 0.35, 70);
    }

    // 3. Bompers LB (4) y RB (5): Cambiar herramienta en la Hotbar 1-9
    if (justPressed(4)) {
      this.cb.onCambiarSlotHotbar(-1);
      this.vibrar(0.08, 0.2, 35);
    }
    if (justPressed(5)) {
      this.cb.onCambiarSlotHotbar(1);
      this.vibrar(0.08, 0.2, 35);
    }

    // 4. Gatillo Derecho RT (7): Usar herramienta equipada (con auto-repetición mientras se mantiene)
    if (justPressed(7)) {
      this.timerAutoRepeatRT = 0;
      this.jugador.usarHerramientaActiva();
      this.vibrar(0.32, 0.48, 80);
    } else if (curr[7]) {
      this.timerAutoRepeatRT += dt;
      if (this.timerAutoRepeatRT >= 0.38) {
        this.timerAutoRepeatRT = 0;
        this.jugador.usarHerramientaActiva();
        this.vibrar(0.22, 0.35, 55);
      }
    } else {
      this.timerAutoRepeatRT = 0;
    }

    // 5. Gatillo Izquierdo LT (6): Acción contextual rápida (cosechar, recoger mazorca, abrir estación)
    if (justPressed(6)) {
      this.jugador.ejecutarInteraccionContextualDerecho();
      this.vibrar(0.25, 0.4, 70);
    }

    // 6. Botones frontales A (0), B (1), X (2), Y (3)
    if (justPressed(0)) {
      // Botón A: Saltar en modo FPS; en modo Orbital usar herramienta
      if (this.jugador.modo === "fps") {
        if (this.jugador.saltar()) {
          this.vibrar(0.18, 0.28, 50);
        }
      } else {
        this.jugador.usarHerramientaActiva();
        this.vibrar(0.25, 0.4, 70);
      }
    }

    if (justPressed(1)) {
      // Botón B: Quitar planta / limpiar montículo [Q]
      this.cb.onQuitarPlanta();
      this.vibrar(0.3, 0.35, 75);
    }

    if (justPressed(2)) {
      // Botón X: Interactuar con estación apuntada [E] o Deshierbar/limpiar plagas [X]
      this.cb.onAccionX();
      this.vibrar(0.25, 0.4, 70);
    }

    if (justPressed(3)) {
      // Botón Y: Abrir Inventario (Mochila y Troje [I])
      this.cb.onAbrirInventario();
      this.vibrar(0.15, 0.3, 55);
    }

    // 7. Cruceta / D-Pad: ▲ (12) +15d Sol, ▼ (13) Panel Clima, ◀ (14) +Frijol, ▶ (15) +Calabaza
    if (justPressed(12)) {
      this.cb.onAvanzarSol();
      this.vibrar(0.25, 0.45, 80);
    }
    if (justPressed(13)) {
      this.cb.onAbrirClima();
      this.vibrar(0.15, 0.3, 55);
    }
    if (justPressed(14)) {
      this.cb.onAsociarFrijol();
      this.vibrar(0.2, 0.35, 65);
    }
    if (justPressed(15)) {
      this.cb.onAsociarCalabaza();
      this.vibrar(0.2, 0.35, 65);
    }

    // 8. View (8): Cambiar estación del surco (1..6) · Menu (9): Abrir Pausa
    if (justPressed(8)) {
      this.cb.onCambiarEstacion();
      this.vibrar(0.18, 0.3, 60);
    }
    if (justPressed(9)) {
      this.cb.onEscape();
      this.vibrar(0.15, 0.25, 50);
    }

    this.prevButtons = curr;
  }

  /** Permite navegar botones y sliders dentro de cualquier modal abierto con el mando Xbox. */
  private actualizarNavegacionModal(
    dt: number,
    curr: boolean[],
    justPressed: (idx: number) => boolean,
    lx: number,
    ly: number,
    rx: number
  ): void {
    // Botón B (1) o Menu (9) -> Cerrar modal / Salir de pausa
    if (justPressed(1) || justPressed(9)) {
      this.limpiarFocoModal();
      this.cb.onEscape();
      this.vibrar(0.15, 0.25, 50);
      return;
    }

    // Botón Y (3) -> Si la Troje está abierta, cerrarla directamente
    if (justPressed(3)) {
      const troje = document.getElementById("mc-cofre-overlay");
      if (troje && getComputedStyle(troje).display !== "none") {
        this.limpiarFocoModal();
        this.cb.onAbrirInventario();
        return;
      }
    }

    // D-Pad Abajo (13) cuando el Panel de Clima está abierto y no estamos navegando -> o navegar
    const interactivos = this.obtenerElementosModalActivo();
    if (interactivos.length === 0) return;

    if (this.modalFocusIdx >= interactivos.length || this.modalFocusIdx < 0) {
      this.modalFocusIdx = 0;
    }

    this.timerNavMenu = Math.max(0, this.timerNavMenu - dt);
    this.timerSliderRepeat = Math.max(0, this.timerSliderRepeat - dt);

    const enfocadoActual = interactivos[this.modalFocusIdx];
    const esSlider =
      enfocadoActual instanceof HTMLInputElement && enfocadoActual.type === "range";
    const esSelect = enfocadoActual instanceof HTMLSelectElement;

    let pasoNav = 0;
    if (justPressed(13) || (this.timerNavMenu <= 0 && ly > 0.55)) {
      pasoNav = 1;
    } else if (justPressed(12) || (this.timerNavMenu <= 0 && ly < -0.55)) {
      pasoNav = -1;
    } else if (!esSlider && !esSelect) {
      if (justPressed(15) || (this.timerNavMenu <= 0 && lx > 0.55)) pasoNav = 1;
      else if (justPressed(14) || (this.timerNavMenu <= 0 && lx < -0.55)) pasoNav = -1;
    }

    // Si el elemento enfocado es un slider, D-Pad Izq/Der (14/15), LB/RB (4/5), Stick Izq X o Stick Der X ajustan su valor
    if (esSlider) {
      let dirSlider = 0;
      if (justPressed(14) || justPressed(4)) dirSlider = -1;
      else if (justPressed(15) || justPressed(5)) dirSlider = 1;
      else if (this.timerSliderRepeat <= 0 && (curr[14] || curr[4] || rx < -0.45 || lx < -0.55)) dirSlider = -1;
      else if (this.timerSliderRepeat <= 0 && (curr[15] || curr[5] || rx > 0.45 || lx > 0.55)) dirSlider = 1;

      if (dirSlider !== 0) {
        const min = parseFloat(enfocadoActual.min || "0");
        const max = parseFloat(enfocadoActual.max || "100");
        const step = parseFloat(enfocadoActual.step || "1") || 1;
        const salto = (max - min) / 25 > step * 3 ? step * 4 : step;
        const nuevo = Math.max(
          min,
          Math.min(max, parseFloat(enfocadoActual.value || "0") + dirSlider * salto)
        );
        enfocadoActual.value = String(nuevo);
        enfocadoActual.dispatchEvent(new Event("input", { bubbles: true }));
        enfocadoActual.dispatchEvent(new Event("change", { bubbles: true }));
        this.timerSliderRepeat = 0.09;
        pasoNav = 0;
      }
    } else if (esSelect) {
      let dirSelect = 0;
      if (justPressed(14) || justPressed(4) || (this.timerNavMenu <= 0 && lx < -0.55)) dirSelect = -1;
      else if (justPressed(15) || justPressed(5) || (this.timerNavMenu <= 0 && lx > 0.55)) dirSelect = 1;
      if (dirSelect !== 0 && enfocadoActual.options.length > 0) {
        enfocadoActual.selectedIndex =
          (enfocadoActual.selectedIndex + dirSelect + enfocadoActual.options.length) %
          enfocadoActual.options.length;
        enfocadoActual.dispatchEvent(new Event("change", { bubbles: true }));
        this.timerNavMenu = 0.22;
        this.vibrar(0.08, 0.16, 30);
      }
    }

    if (pasoNav !== 0) {
      this.modalFocusIdx =
        (this.modalFocusIdx + pasoNav + interactivos.length) % interactivos.length;
      this.timerNavMenu = 0.21;
      this.vibrar(0.05, 0.12, 25);
    }

    const elem = interactivos[this.modalFocusIdx];
    this.resaltarElementoModal(elem);

    // Botón A (0) o RT (7): Activar elemento enfocado (soporta [data-slot] con mousedown, <select>, checkbox y botones)
    if (justPressed(0) || justPressed(7)) {
      if (elem.hasAttribute("data-slot")) {
        elem.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
        elem.click();
      } else if (elem instanceof HTMLSelectElement && elem.options.length > 0) {
        elem.selectedIndex = (elem.selectedIndex + 1) % elem.options.length;
        elem.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        elem.click();
      }
      this.vibrar(0.2, 0.35, 60);
    }
  }

  private obtenerElementosModalActivo(): HTMLElement[] {
    const contenedores = [
      document.getElementById("modalAjustesVR"),
      document.getElementById("modalControlesBienvenida"),
      document.getElementById("fichaCultivoModal"),
      document.getElementById("menuPausaMinecraft"),
      document.getElementById("menuPrincipalMinecraft"),
      document.getElementById("mc-cofre-overlay"),
      document.getElementById("almacenMazorcasModal"),
      document.getElementById("dispensadorSemillasModal"),
      document.getElementById("fogonCocinaModal"),
      document.getElementById("bancoSemillasModal"),
      document.getElementById("codiceMaizModal"),
      document.querySelector(".panel-clima-card.visible") as HTMLElement | null,
      document.querySelector(".modal-celebracion.visible") as HTMLElement | null,
    ];

    for (const c of contenedores) {
      if (!c) continue;
      const st = getComputedStyle(c);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const nodos = Array.from(
        c.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input[type="range"]:not([disabled]), input[type="checkbox"]:not([disabled]), select:not([disabled]), [data-slot]'
        )
      ).filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
      });
      if (nodos.length > 0) return nodos;
    }
    return [];
  }

  private resaltarElementoModal(el: HTMLElement): void {
    if (this.ultimoElementoEnfocado && this.ultimoElementoEnfocado !== el) {
      this.ultimoElementoEnfocado.style.outline = "";
      this.ultimoElementoEnfocado.style.outlineOffset = "";
    }
    el.style.outline = "3px solid #fbbf24";
    el.style.outlineOffset = "2px";
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    this.ultimoElementoEnfocado = el;
  }

  private limpiarFocoModal(): void {
    if (this.ultimoElementoEnfocado) {
      this.ultimoElementoEnfocado.style.outline = "";
      this.ultimoElementoEnfocado.style.outlineOffset = "";
      this.ultimoElementoEnfocado = null;
    }
    this.modalFocusIdx = 0;
  }
}
