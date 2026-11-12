/**
 * Paneles de Inventario y Hotbar Estilo Minecraft (v4.0 — Milpa Viva VR)
 *
 * Proporciona:
 *  - HotbarPixel: Barra inferior fija de 9 ranuras con números 1–9, aviso flotante del ítem activo y selección visual.
 *  - ModalCofreTroje: Vista clásica de cofre (27 ranuras de Troje arriba, 27 mochila + 9 hotbar abajo),
 *    con botones de depósito rápido, ordenamiento, y cursor flotante con semántica de apilado.
 */

import { Inventario, ItemStack, DEFS, tierCalidad } from "../inventario/inventario";
import { CursorInventario, herramientaDeSlot } from "../inventario/cursor";
import { generarDataUrlIcono } from "./iconos_pixel";
import { HerramientaTipo } from "../educativo/estado_educativo";

export class PanelCuadricula {
  public readonly el: HTMLDivElement;
  public onShift?: (indice: number) => void;
  public onSlotClick?: (indice: number) => void;

  constructor(
    public readonly inv: Inventario,
    public readonly cursor: CursorInventario,
    public readonly cols = 9,
    public readonly startIndex = 0,
    public readonly count = inv.tamano
  ) {
    this.el = document.createElement("div");
    this.el.className = "mc-grid-container";
    this.el.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${cols}, 48px);
      gap: 4px;
      justify-content: center;
      padding: 4px;
      user-select: none;
    `;

    inv.suscribir(() => this.render());
    this.render();
  }

  public render(slotSeleccionado?: number): void {
    this.el.replaceChildren();

    for (let i = 0; i < this.count; i++) {
      const slotIndex = this.startIndex + i;
      const stack = this.inv.slots[slotIndex];

      const slotEl = document.createElement("div");
      slotEl.className = "mc-slot";
      slotEl.dataset.slot = String(slotIndex);

      if (slotSeleccionado !== undefined && slotIndex === slotSeleccionado) {
        slotEl.classList.add("seleccionado");
      }

      // Indicador de número de tecla de acceso rápido estilo Minecraft (1-9)
      if (this.startIndex === 0 && this.count === 9) {
        const numBadge = document.createElement("span");
        numBadge.className = "slot-tecla";
        numBadge.textContent = String(slotIndex + 1);
        numBadge.style.cssText = `
          position: absolute;
          top: 1px;
          left: 3px;
          font-size: 11px;
          font-weight: 700;
          color: #cbd5e1;
          text-shadow: 1px 1px 0 #000;
          pointer-events: none;
        `;
        slotEl.appendChild(numBadge);
      }

      if (stack && stack.cantidad > 0) {
        const def = DEFS[stack.id] || {
          nombre: stack.id,
          icono: "mazorca",
          descripcion: ""
        };

        const img = document.createElement("img");
        img.src = generarDataUrlIcono(def.icono, 2);
        img.style.cssText = "width:32px;height:32px;image-rendering:pixelated;pointer-events:none;";
        slotEl.appendChild(img);

        if (stack.cantidad > 1) {
          const qty = document.createElement("span");
          qty.className = "cantidad";
          qty.textContent = String(stack.cantidad);
          slotEl.appendChild(qty);
        }

        // Tooltip nativo estilo Minecraft
        let titulo = def.nombre;
        if (stack.meta?.variedad) {
          const t = tierCalidad(stack.meta.calidad);
          const tLabel = t === 2 ? "⭐⭐ Calidad Extra" : t === 1 ? "⭐ Buena Calidad" : "Común";
          titulo += ` (${stack.meta.variedad} · ${tLabel})`;
        }
        if (def.descripcion) {
          titulo += `\n${def.descripcion}`;
        }
        slotEl.title = titulo;
      }

      // Eventos de ratón
      slotEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (e.button === 0) {
          // Clic izquierdo
          if (e.shiftKey && this.onShift) {
            this.onShift(slotIndex);
          } else {
            this.cursor.clicIzq(this.inv, slotIndex);
          }
        } else if (e.button === 2) {
          // Clic derecho
          this.cursor.clicDer(this.inv, slotIndex);
        }
        this.onSlotClick?.(slotIndex);
      });

      slotEl.addEventListener("contextmenu", (e) => e.preventDefault());

      this.el.appendChild(slotEl);
    }
  }
}

export interface HotbarPixelCallbacks {
  onCambioSlot?: (slot: number, herramienta: HerramientaTipo) => void;
  onQuitarPlanta?: () => void;
  onToggleTimeLapse?: () => void;
  onDeshierbar?: () => void;
  onPolinizar?: () => void;
  onSembrarFrijol?: () => void;
  onSembrarCalabaza?: () => void;
  onColocarTutor?: () => void;
  onColocarPetate?: () => void;
}

/**
 * Hotbar Unificada Estilo Minecraft (9 ranuras de ítems + Acciones agronómicas y Labores)
 */
export class HotbarPixel {
  public readonly el: HTMLDivElement;
  private rotuloItem: HTMLDivElement;
  private grid: PanelCuadricula;
  public slotActivo = 0;
  private timerRotulo: any = null;

  private btnQuitar: HTMLButtonElement;
  private btnTimeLapse: HTMLButtonElement;
  private btnLabores: HTMLButtonElement;
  private laboresDrawer: HTMLDivElement;
  private laboresAbierto = false;

  public callbacks?: HotbarPixelCallbacks;

  constructor(
    public readonly invJugador: Inventario,
    public readonly cursor: CursorInventario,
    callbacks?: HotbarPixelCallbacks
  ) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.id = "mc-hotbar-container";
    this.el.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 950;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      pointer-events: auto;
      max-width: 98vw;
    `;

    // 1. Rótulo flotante que muestra el nombre del ítem seleccionado durante 2s
    this.rotuloItem = document.createElement("div");
    this.rotuloItem.className = "mc-texto";
    this.rotuloItem.style.cssText = `
      font-size: 15px;
      font-weight: 700;
      color: #ffd74a;
      opacity: 0;
      transition: opacity 0.25s ease;
      background: rgba(0, 0, 0, 0.72);
      padding: 3px 12px;
      border: 2px solid #000;
      border-radius: 0;
      pointer-events: none;
    `;
    this.el.appendChild(this.rotuloItem);

    // 2. Cajón Desplegable de Labores Agronómicas Secundarias (arriba de la barra)
    this.laboresDrawer = document.createElement("div");
    this.laboresDrawer.className = "mc-panel-oscuro";
    this.laboresDrawer.style.cssText = `
      display: none;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
      padding: 6px 10px;
      max-width: 680px;
      margin-bottom: 2px;
      pointer-events: auto;
    `;
    const labores: { icon: string; label: string; fn?: () => void }[] = [
      { icon: "🗑️", label: "Quitar Planta [Q]", fn: () => this.callbacks?.onQuitarPlanta?.() },
      { icon: "🌿", label: "Deshierbar [X]", fn: () => this.callbacks?.onDeshierbar?.() },
      { icon: "🌼", label: "Polinizar [P]", fn: () => this.callbacks?.onPolinizar?.() },
      { icon: "🫘", label: "+Frijol [B]", fn: () => this.callbacks?.onSembrarFrijol?.() },
      { icon: "🎃", label: "+Calabaza [N]", fn: () => this.callbacks?.onSembrarCalabaza?.() },
      { icon: "🪵", label: "Tutor Viento [T]", fn: () => this.callbacks?.onColocarTutor?.() },
      { icon: "🛡️", label: "Petate Helada [G]", fn: () => this.callbacks?.onColocarPetate?.() }
    ];
    labores.forEach((item) => {
      const b = document.createElement("button");
      b.className = "mc-boton";
      b.style.cssText = `
        background: #2b2b2b;
        color: #fff;
        border: 2px solid;
        border-color: #666 #000 #000 #666;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        border-radius: 0;
      `;
      b.textContent = `${item.icon} ${item.label}`;
      b.addEventListener("click", () => item.fn?.());
      this.laboresDrawer.appendChild(b);
    });
    this.el.appendChild(this.laboresDrawer);

    // 3. Contenedor principal de la Hotbar y botones de acción unificados
    const panelWrap = document.createElement("div");
    panelWrap.className = "mc-panel";
    panelWrap.style.cssText = `
      padding: 4px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 0 0 3px #000;
      flex-wrap: wrap;
      justify-content: center;
    `;

    // Las 9 primeras ranuras del inventario del jugador corresponden a la hotbar
    this.grid = new PanelCuadricula(invJugador, cursor, 9, 0, 9);
    panelWrap.appendChild(this.grid.el);

    // Separador visual discreto
    const sep = document.createElement("div");
    sep.style.cssText = "width: 2px; height: 40px; background: #555; margin: 0 4px;";
    panelWrap.appendChild(sep);

    // Acciones integradas
    const actionsBox = document.createElement("div");
    actionsBox.style.cssText = "display: flex; gap: 4px; align-items: center;";

    // Botón [Q] Quitar
    this.btnQuitar = document.createElement("button");
    this.btnQuitar.className = "mc-boton";
    this.btnQuitar.style.cssText = `
      background: var(--mc-gris);
      border: 2px solid;
      border-color: #fff #555 #555 #fff;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #b91c1c;
      cursor: pointer;
      height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      border-radius: 0;
    `;
    this.btnQuitar.innerHTML = `<span style="font-size:14px;">🗑️</span><span>[Q] Quitar</span>`;
    this.btnQuitar.title = "Arrancar planta o limpiar rastrojo de la estación activa [Q]";
    this.btnQuitar.addEventListener("click", () => this.callbacks?.onQuitarPlanta?.());
    actionsBox.appendChild(this.btnQuitar);

    // Botón Play / Pausa Crecimiento
    this.btnTimeLapse = document.createElement("button");
    this.btnTimeLapse.className = "mc-boton";
    this.btnTimeLapse.style.cssText = `
      background: var(--mc-gris);
      border: 2px solid;
      border-color: #fff #555 #555 #fff;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #16a34a;
      cursor: pointer;
      height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      border-radius: 0;
    `;
    this.btnTimeLapse.innerHTML = `<span style="font-size:14px;">▶</span><span>Crecimiento</span>`;
    this.btnTimeLapse.title = "Avanzar el crecimiento del cultivo continuamente [Espacio]";
    this.btnTimeLapse.addEventListener("click", () => this.callbacks?.onToggleTimeLapse?.());
    actionsBox.appendChild(this.btnTimeLapse);

    // Botón Desplegable de Labores
    this.btnLabores = document.createElement("button");
    this.btnLabores.className = "mc-boton";
    this.btnLabores.style.cssText = `
      background: var(--mc-gris);
      border: 2px solid;
      border-color: #fff #555 #555 #fff;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #0284c7;
      cursor: pointer;
      height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      border-radius: 0;
    `;
    this.btnLabores.innerHTML = `<span style="font-size:14px;">🌿</span><span>Labores ▴</span>`;
    this.btnLabores.title = "Desplegar menú de labores agrícolas (deshierbe, polinización, asociadas)";
    this.btnLabores.addEventListener("click", () => {
      this.laboresAbierto = !this.laboresAbierto;
      this.laboresDrawer.style.display = this.laboresAbierto ? "flex" : "none";
      this.btnLabores.innerHTML = `<span style="font-size:14px;">🌿</span><span>Labores ${this.laboresAbierto ? "▾" : "▴"}</span>`;
    });
    actionsBox.appendChild(this.btnLabores);

    panelWrap.appendChild(actionsBox);
    this.el.appendChild(panelWrap);

    // Clic en ranura de hotbar
    this.grid.onSlotClick = (idx) => {
      this.seleccionarSlot(idx);
    };

    invJugador.suscribir(() => {
      this.actualizarVisual();
    });

    document.body.appendChild(this.el);
    this.actualizarVisual();
  }

  public actualizarEstadoCrecimiento(reproduciendo: boolean): void {
    if (reproduciendo) {
      this.btnTimeLapse.innerHTML = `<span style="font-size:14px;">⏸</span><span>Pausa</span>`;
      this.btnTimeLapse.style.color = "#ea580c";
    } else {
      this.btnTimeLapse.innerHTML = `<span style="font-size:14px;">▶</span><span>Crecimiento</span>`;
      this.btnTimeLapse.style.color = "#16a34a";
    }
  }

  public seleccionarSlot(index: number): void {
    if (index < 0 || index >= 9) return;
    this.slotActivo = index;
    this.actualizarVisual();

    const stack = this.invJugador.slots[index];
    const def = stack ? DEFS[stack.id] : null;
    const nombre = def ? def.nombre : "Manos Libres";
    const detalle = stack?.meta?.variedad ? ` (${stack.meta.variedad})` : "";

    this.mostrarAvisoItem(`${nombre}${detalle}`);

    const h = herramientaDeSlot(stack);
    this.callbacks?.onCambioSlot?.(this.slotActivo, h);
  }

  public avanzarSlot(delta: number): void {
    let sig = (this.slotActivo + delta) % 9;
    if (sig < 0) sig += 9;
    this.seleccionarSlot(sig);
  }

  public mostrarAvisoItem(texto: string): void {
    this.rotuloItem.textContent = texto;
    this.rotuloItem.style.opacity = "1";
    if (this.timerRotulo) clearTimeout(this.timerRotulo);
    this.timerRotulo = setTimeout(() => {
      this.rotuloItem.style.opacity = "0";
    }, 2200);
  }

  public actualizarVisual(): void {
    this.grid.render(this.slotActivo);
  }
}

/**
 * Modal Completo de Cofre / Troje Estilo Minecraft
 */
export class ModalCofreTroje {
  public readonly overlay: HTMLDivElement;
  public readonly ventana: HTMLDivElement;
  private gridTroje: PanelCuadricula;
  private gridMochila: PanelCuadricula;
  private gridHotbar: PanelCuadricula;
  private cursorElemento: HTMLDivElement;
  public estaAbierto = false;

  public onCerrar?: () => void;
  public onDepositoRapido?: () => void;

  constructor(
    public readonly troje: Inventario,
    public readonly invJugador: Inventario,
    public readonly cursor: CursorInventario
  ) {
    // Fondo oscuro detrás del cofre
    this.overlay = document.createElement("div");
    this.overlay.id = "mc-cofre-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 2200;
      display: none;
      align-items: center;
      justify-content: center;
      user-select: none;
    `;

    // Ventana biselada Minecraft
    this.ventana = document.createElement("div");
    this.ventana.className = "mc-panel";
    this.ventana.style.cssText = `
      padding: 16px;
      max-width: 95vw;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
    `;
    this.overlay.appendChild(this.ventana);

    // Encabezado
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #555;
      padding-bottom: 8px;
    `;
    header.innerHTML = `
      <div style="font-weight:700;font-size:18px;color:#1e1e1e;">🏛️ Troje Campesina (Cofre Comunitario)</div>
    `;

    const btnCerrar = document.createElement("button");
    btnCerrar.className = "mc-boton";
    btnCerrar.textContent = "✖";
    btnCerrar.style.cssText = "font-size:16px;cursor:pointer;padding:2px 8px;";
    btnCerrar.addEventListener("click", () => this.cerrar());
    header.appendChild(btnCerrar);
    this.ventana.appendChild(header);

    // Barra de acciones del troje
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;";

    const btnDepositarMazorcas = this.crearBoton("📦 Guardar Mazorcas", () => {
      this.invJugador.moverTodoDe(this.troje, "mazorca");
    });
    toolbar.appendChild(btnDepositarMazorcas);

    const btnDepositarTodo = this.crearBoton("📥 Depositar Todo", () => {
      // Mover todo de la mochila (ranuras 9-35) al cofre
      for (let i = 9; i < this.invJugador.tamano; i++) {
        this.invJugador.moverA(this.troje, i);
      }
    });
    toolbar.appendChild(btnDepositarTodo);

    const btnOrdenarTroje = this.crearBoton("⚡ Ordenar Troje", () => {
      this.troje.ordenar();
    });
    toolbar.appendChild(btnOrdenarTroje);

    const btnOrdenarJugador = this.crearBoton("⚡ Ordenar Mochila", () => {
      // Ordenar solo la mochila para no desordenar la hotbar
      this.ordenarRango(this.invJugador, 9, this.invJugador.tamano - 9);
    });
    toolbar.appendChild(btnOrdenarJugador);

    this.ventana.appendChild(toolbar);

    // 1) Sección Troje (27 ranuras: 3 filas x 9 cols)
    const seccionTroje = document.createElement("div");
    seccionTroje.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:4px;color:#373737;">Contenido de la Troje (27 ranuras):</div>`;
    this.gridTroje = new PanelCuadricula(troje, cursor, 9, 0, 27);
    this.gridTroje.onShift = (i) => cursor.shiftClic(troje, i, invJugador);
    seccionTroje.appendChild(this.gridTroje.el);
    this.ventana.appendChild(seccionTroje);

    // Separador
    const sep = document.createElement("div");
    sep.style.cssText = "border-top: 2px solid #555; margin: 2px 0;";
    this.ventana.appendChild(sep);

    // 2) Sección Jugador (Mochila 27 ranuras + Hotbar 9 ranuras)
    const seccionJugador = document.createElement("div");
    seccionJugador.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:4px;color:#373737;">Inventario del Campesino (Mochila y Hotbar):</div>`;

    // Mochila: slots 9 a 35 (27 ranuras)
    this.gridMochila = new PanelCuadricula(invJugador, cursor, 9, 9, 27);
    this.gridMochila.onShift = (i) => cursor.shiftClic(invJugador, i, troje);
    seccionJugador.appendChild(this.gridMochila.el);

    // Espacio antes de hotbar
    const hotbarLabel = document.createElement("div");
    hotbarLabel.style.cssText = "font-size:11px;font-weight:700;color:#555;margin:6px 0 2px 0;";
    hotbarLabel.textContent = "Ranuras de Acceso Rápido (Hotbar 1–9):";
    seccionJugador.appendChild(hotbarLabel);

    // Hotbar: slots 0 a 8
    this.gridHotbar = new PanelCuadricula(invJugador, cursor, 9, 0, 9);
    this.gridHotbar.onShift = (i) => cursor.shiftClic(invJugador, i, troje);
    seccionJugador.appendChild(this.gridHotbar.el);

    this.ventana.appendChild(seccionJugador);

    // Elemento visual flotante del cursor
    this.cursorElemento = document.createElement("div");
    this.cursorElemento.id = "mc-cursor-item";
    this.cursorElemento.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 3000;
      display: none;
      width: 48px;
      height: 48px;
      align-items: center;
      justify-content: center;
    `;
    document.body.appendChild(this.cursorElemento);

    // Seguimiento del ratón para el ítem en mano
    window.addEventListener("mousemove", (e) => {
      if (this.cursor.enMano && this.estaAbierto) {
        this.cursorElemento.style.left = `${e.clientX - 24}px`;
        this.cursorElemento.style.top = `${e.clientY - 24}px`;
      }
    });

    cursor.suscribir(() => this.actualizarCursorVisual());

    // Clic en el fondo cierra
    this.overlay.addEventListener("mousedown", (e) => {
      if (e.target === this.overlay) {
        this.cerrar();
      }
    });

    document.body.appendChild(this.overlay);
  }

  private crearBoton(texto: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "mc-boton";
    btn.textContent = texto;
    btn.style.cssText = `
      background: var(--mc-gris);
      border: 3px solid;
      border-color: #fff #555 #555 #fff;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 4px 10px;
      cursor: pointer;
    `;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private ordenarRango(inv: Inventario, inicio: number, cantidad: number): void {
    const stacks: ItemStack[] = [];
    for (let i = inicio; i < inicio + cantidad; i++) {
      const s = inv.slots[i];
      if (s && s.cantidad > 0) {
        stacks.push(s);
        inv.slots[i] = null;
      }
    }

    // Compactar
    for (let i = 0; i < stacks.length; i++) {
      const a = stacks[i];
      if (a.cantidad <= 0) continue;
      const max = (DEFS[a.id]?.maxStack ?? 64);
      for (let j = i + 1; j < stacks.length; j++) {
        const b = stacks[j];
        if (b.cantidad > 0 && a.id === b.id && a.meta?.variedad === b.meta?.variedad) {
          const espacio = max - a.cantidad;
          if (espacio > 0) {
            const mov = Math.min(espacio, b.cantidad);
            a.cantidad += mov;
            b.cantidad -= mov;
          }
        }
      }
    }

    const validos = stacks.filter((s) => s.cantidad > 0);
    validos.sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < validos.length && i < cantidad; i++) {
      inv.slots[inicio + i] = validos[i];
    }
    inv.notificar();
  }

  private actualizarCursorVisual(): void {
    const s = this.cursor.enMano;
    if (!s || !this.estaAbierto) {
      this.cursorElemento.style.display = "none";
      return;
    }

    this.cursorElemento.style.display = "flex";
    this.cursorElemento.replaceChildren();

    const def = DEFS[s.id] || { icono: "mazorca" };
    const img = document.createElement("img");
    img.src = generarDataUrlIcono(def.icono, 2);
    img.style.cssText = "width:36px;height:36px;image-rendering:pixelated;";
    this.cursorElemento.appendChild(img);

    if (s.cantidad > 1) {
      const span = document.createElement("span");
      span.className = "cantidad";
      span.style.cssText = `
        position: absolute; right: 2px; bottom: 2px;
        font-size: 16px; font-weight: 700; color: #fff;
        text-shadow: 2px 2px 0 #000;
      `;
      span.textContent = String(s.cantidad);
      this.cursorElemento.appendChild(span);
    }
  }

  public abrir(): void {
    this.estaAbierto = true;
    this.overlay.style.display = "flex";
    this.gridTroje.render();
    this.gridMochila.render();
    this.gridHotbar.render();
    this.actualizarCursorVisual();
  }

  public cerrar(): void {
    // Si tiene ítem en mano, devolverlo al inventario del jugador
    if (this.cursor.enMano) {
      this.invJugador.anadir(this.cursor.enMano);
      this.cursor.enMano = null;
    }
    this.estaAbierto = false;
    this.overlay.style.display = "none";
    this.cursorElemento.style.display = "none";
    this.onCerrar?.();
  }

  public alternar(): void {
    if (this.estaAbierto) {
      this.cerrar();
    } else {
      this.abrir();
    }
  }
}
