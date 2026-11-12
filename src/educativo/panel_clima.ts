/**
 * Panel de Condiciones Climatológicas y Ambientales Interactivo
 *
 * Estilo visual Cel-Shaded / Caricatura (#2a3417 contornos, #fffdf0 fondo cálido, #e8a317 acentos):
 *  - 10 Escenarios predefinidos para Maíz Chalqueño (Temporal Óptimo, Canícula, Helada, Tormenta...).
 *  - 11 Sliders con etiquetas claras, unidades, valores en tiempo real y respuesta inmediata.
 *  - Botón de Ciclo Solar Automático (Amanecer -> Mediodía -> Atardecer -> Noche).
 *  - Sincronización bidireccional con el cielo, sol, viento, nubes, lluvia, suelo y ontogenia.
 */

import { ClimateState, ClimateKey, VARIABLES, ESCENARIOS, CLIMA_INICIAL } from "../clima";

export interface PanelClimaCallbacks {
  onCambioClima: (clima: ClimateState) => void;
  onToggleCicloSolar: () => boolean;
}

export class PanelClima {
  private clima: ClimateState;
  private callbacks: PanelClimaCallbacks;
  private contenedor: HTMLDivElement;
  private btnToggle!: HTMLButtonElement;
  private panelCard!: HTMLDivElement;

  private sliderElements: Map<ClimateKey, { slider: HTMLInputElement; valueLabel: HTMLSpanElement }> = new Map();
  private btnCicloSolar!: HTMLButtonElement;
  private btnEscenarios: Map<string, HTMLButtonElement> = new Map();

  private abierto = false;

  constructor(clima: ClimateState, callbacks: PanelClimaCallbacks) {
    this.clima = clima;
    this.callbacks = callbacks;

    this.contenedor = document.createElement("div");
    this.contenedor.id = "panel-clima-wrapper";
    document.body.appendChild(this.contenedor);

    this.inyectarEstilos();
    this.crearBotonToggle();
    this.crearPanelCard();
    this.actualizarValoresUI();
  }

  private inyectarEstilos(): void {
    const style = document.createElement("style");
    style.textContent = `
      #panel-clima-wrapper {
        position: fixed;
        top: 56px;
        right: 12px;
        z-index: 1800;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: #2a3417;
        user-select: none;
        pointer-events: none;
      }

      /* Botón Toggle oculto porque ahora vive integrado en la barra superior de menús */
      .btn-toggle-clima {
        display: none;
      }

      /* Tarjeta Flotante del Panel de Clima */
      .panel-clima-card {
        position: relative;
        width: min(340px, 92vw);
        max-height: calc(100vh - 140px);
        overflow-y: auto;
        overflow-x: hidden;
        background: rgba(255, 253, 240, 0.96);
        backdrop-filter: blur(8px);
        border: 2.5px solid #2a3417;
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
        pointer-events: auto;
        display: none;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: #ca8a04 #fef08a;
      }
      .panel-clima-card.visible {
        display: block;
        animation: slideDownClima 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes slideDownClima {
        from { opacity: 0; transform: translateY(-10px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* Cabecera del Panel */
      .clima-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        border-bottom: 2px dashed #ca8a04;
        padding-bottom: 8px;
      }
      .clima-titulo {
        font-size: 17px;
        font-weight: 900;
        color: #1e293b;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .btn-cerrar-clima {
        background: #fee2e2;
        border: 2px solid #ef4444;
        border-radius: 12px;
        width: 28px;
        height: 28px;
        font-size: 13px;
        font-weight: 800;
        color: #b91c1c;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s ease;
      }
      .btn-cerrar-clima:hover {
        transform: scale(1.1);
        background: #fca5a5;
      }

      /* Sección de Escenarios Rápidos */
      .seccion-label {
        font-size: 12px;
        font-weight: 800;
        color: #854d0e;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 8px;
      }
      .escenarios-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        margin-bottom: 16px;
      }
      .btn-escenario {
        background: #ffffff;
        border: 2px solid #2a3417;
        border-radius: 12px;
        padding: 6px 8px;
        font-size: 11.5px;
        font-weight: 800;
        color: #1e293b;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: all 0.15s ease;
      }
      .btn-escenario:hover {
        background: #fef08a;
        transform: translateY(-1.5px);
        box-shadow: 0 3px 6px rgba(0,0,0,0.1);
      }
      .btn-escenario.activo {
        background: #e8a317;
        color: #0f172a;
        border-color: #2a3417;
        font-weight: 900;
      }

      /* Lista de Sliders Ambientales */
      .slider-clima-row {
        margin-bottom: 10px;
        background: rgba(255, 255, 255, 0.7);
        border: 1.5px solid #2a3417;
        border-radius: 14px;
        padding: 6px 10px;
      }
      .slider-clima-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .slider-clima-nombre {
        color: #334155;
      }
      .slider-clima-valor {
        color: #ca8a04;
        font-weight: 900;
      }
      .input-clima-slider {
        width: 100%;
        accent-color: #e8a317;
        cursor: pointer;
        margin: 0;
      }

      /* Botón Ciclo Solar Auto */
      .btn-ciclo-solar {
        width: 100%;
        margin-top: 12px;
        background: #fef08a;
        border: 2.5px solid #2a3417;
        border-radius: 16px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 800;
        color: #1e293b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s ease;
      }
      .btn-ciclo-solar:hover {
        background: #fde047;
        transform: translateY(-1.5px);
      }
      .btn-ciclo-solar.activo {
        background: #22c55e;
        color: #ffffff;
        border-color: #14532d;
      }

      @media (max-width: 768px) {
        #panel-clima-wrapper {
          right: 12px;
          top: 72px;
        }
        .panel-clima-card {
          width: 320px;
          right: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private crearBotonToggle(): void {
    this.btnToggle = document.createElement("button");
    this.btnToggle.className = "btn-toggle-clima";
    this.btnToggle.innerHTML = `<span>⛅</span><span>Condiciones Clima</span>`;
    this.btnToggle.addEventListener("click", () => {
      this.abierto = !this.abierto;
      this.panelCard.classList.toggle("visible", this.abierto);
      this.btnToggle.classList.toggle("activo", this.abierto);
    });
    this.contenedor.appendChild(this.btnToggle);
  }

  private crearPanelCard(): void {
    this.panelCard = document.createElement("div");
    this.panelCard.className = "panel-clima-card";

    // A. Encabezado
    const header = document.createElement("div");
    header.className = "clima-header";
    header.innerHTML = `
      <h3 class="clima-titulo">⛅ Control Ambiental</h3>
      <button class="btn-cerrar-clima" title="Cerrar panel">✖</button>
    `;
    header.querySelector(".btn-cerrar-clima")!.addEventListener("click", () => {
      this.abierto = false;
      this.panelCard.classList.remove("visible");
      this.btnToggle.classList.remove("activo");
    });
    this.panelCard.appendChild(header);

    // B. Sección Escenarios Predefinidos
    const lblEsc = document.createElement("div");
    lblEsc.className = "seccion-label";
    lblEsc.textContent = "Escenarios Predefinidos";
    this.panelCard.appendChild(lblEsc);

    const gridEsc = document.createElement("div");
    gridEsc.className = "escenarios-grid";

    ESCENARIOS.forEach((esc) => {
      const btn = document.createElement("button");
      btn.className = "btn-escenario";
      btn.textContent = esc.nombre;
      btn.addEventListener("click", () => {
        Object.assign(this.clima, esc.valores);
        this.actualizarValoresUI();
        this.resaltarEscenario(esc.nombre);
        this.callbacks.onCambioClima(this.clima);
      });
      this.btnEscenarios.set(esc.nombre, btn);
      gridEsc.appendChild(btn);
    });
    this.panelCard.appendChild(gridEsc);

    // C. Sección Sliders de Variables
    const lblVar = document.createElement("div");
    lblVar.className = "seccion-label";
    lblVar.textContent = "Ajuste de Variables Climáticas";
    this.panelCard.appendChild(lblVar);

    VARIABLES.forEach((def) => {
      const row = document.createElement("div");
      row.className = "slider-clima-row";

      const top = document.createElement("div");
      top.className = "slider-clima-top";
      top.innerHTML = `
        <span class="slider-clima-nombre">${def.etiqueta}</span>
        <span class="slider-clima-valor" id="val_${def.key}">${this.clima[def.key]} ${def.unidad}</span>
      `;
      row.appendChild(top);

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "input-clima-slider";
      slider.min = def.min.toString();
      slider.max = def.max.toString();
      slider.step = def.paso.toString();
      slider.value = this.clima[def.key].toString();

      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        this.clima[def.key] = val;
        const valLbl = top.querySelector(`#val_${def.key}`) as HTMLSpanElement;
        valLbl.textContent = `${val} ${def.unidad}`;
        this.desmarcarEscenarios();
        this.callbacks.onCambioClima(this.clima);
      });

      row.appendChild(slider);
      this.panelCard.appendChild(row);

      this.sliderElements.set(def.key, {
        slider,
        valueLabel: top.querySelector(`#val_${def.key}`) as HTMLSpanElement
      });
    });

    // D. Botón Ciclo Solar Automático
    this.btnCicloSolar = document.createElement("button");
    this.btnCicloSolar.className = "btn-ciclo-solar";
    this.btnCicloSolar.innerHTML = `<span>🔄</span><span>Ciclo Solar Automático: OFF</span>`;
    this.btnCicloSolar.addEventListener("click", () => {
      const activo = this.callbacks.onToggleCicloSolar();
      this.btnCicloSolar.classList.toggle("activo", activo);
      this.btnCicloSolar.innerHTML = activo
        ? `<span>☀️</span><span>Ciclo Solar Automático: ON</span>`
        : `<span>🔄</span><span>Ciclo Solar Automático: OFF</span>`;
    });
    this.panelCard.appendChild(this.btnCicloSolar);

    this.contenedor.appendChild(this.panelCard);
  }

  public actualizarValoresUI(): void {
    VARIABLES.forEach((def) => {
      const item = this.sliderElements.get(def.key);
      if (item) {
        const val = this.clima[def.key];
        item.slider.value = val.toString();
        item.valueLabel.textContent = `${typeof val === "number" ? val.toFixed(def.paso < 1 ? 1 : 0) : val} ${def.unidad}`;
      }
    });
  }

  public resaltarEscenario(nombre: string): void {
    this.btnEscenarios.forEach((btn, n) => {
      btn.classList.toggle("activo", n === nombre);
    });
  }

  public desmarcarEscenarios(): void {
    this.btnEscenarios.forEach((btn) => btn.classList.remove("activo"));
  }

  public toggle(abrir?: boolean): void {
    this.abierto = abrir !== undefined ? abrir : !this.abierto;
    this.panelCard.classList.toggle("visible", this.abierto);
    this.btnToggle.classList.toggle("activo", this.abierto);
  }
}
