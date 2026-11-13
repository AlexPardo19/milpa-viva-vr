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

const ICONOS_VARIABLE: Record<string, string> = {
  temperatura: "🌡️",
  humedad: "💧",
  presion: "🧭",
  hora: "🕒",
  nubosidad: "☁️",
  viento: "💨",
  lluvia: "🌧️",
  co2: "🫧",
  humedadSuelo: "🌱",
  phSuelo: "🧪",
  pm25: "🌫️",
};

const AYUDA_VARIABLE: Record<string, string> = {
  temperatura: "Frío ← → Calor",
  humedad: "Aire seco ← → Aire húmedo",
  presion: "Baja (altura) ← → Alta",
  hora: "Noche · Amanecer · Mediodía · Tarde",
  nubosidad: "Despejado ← → Cubierto",
  viento: "Calma ← → Ventarrón",
  lluvia: "Sin lluvia ← → Tormenta",
  co2: "Poco ← → Mucho CO₂",
  humedadSuelo: "Tierra seca ← → Empapada",
  phSuelo: "Ácido ← → Alcalino",
  pm25: "Aire limpio ← → Contaminado",
};

const GRUPOS_VARIABLE: Array<{ titulo: string; icono: string; claves: string[] }> = [
  { titulo: "Cielo y Sol", icono: "☀️", claves: ["hora", "nubosidad", "temperatura"] },
  { titulo: "Agua y Viento", icono: "🌦️", claves: ["lluvia", "viento", "humedad", "presion"] },
  { titulo: "Suelo", icono: "🌱", claves: ["humedadSuelo", "phSuelo"] },
  { titulo: "Aire", icono: "🫧", claves: ["co2", "pm25"] },
];

function iconoEscenario(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes("noche")) return "🌙";
  if (n.includes("helada")) return "❄️";
  if (n.includes("tormenta") || n.includes("acame")) return "⛈️";
  if (n.includes("sequ") || n.includes("can") || n.includes("calor")) return "☀️";
  if (n.includes("granizo")) return "🧊";
  if (n.includes("ácid") || n.includes("acid")) return "🧪";
  if (n.includes("nubl") || n.includes("nub")) return "☁️";
  if (n.includes("encharc") || n.includes("inund")) return "🌊";
  if (n.includes("viento")) return "💨";
  if (n.includes("atardecer")) return "🌅";
  if (n.includes("noche")) return "🌙";
  if (n.includes("alcalin")) return "🧂";
  if (n.includes("invernadero")) return "🏡";
  if (n.includes("temporal")) return "🌦️";
  return "🌽";
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
        font-family: var(--fuente-px);
        color: #2a3417;
        user-select: none;
        pointer-events: none;
      }

      /* Botón Toggle oculto porque ahora vive integrado en la barra superior de menús */
      .btn-toggle-clima {
        display: none;
      }

      /* Tarjeta Flotante del Panel de Clima (Pixel-Art) */
      .panel-clima-card {
        position: relative;
        width: min(340px, 92vw);
        max-height: calc(100vh - 140px);
        overflow-y: auto;
        overflow-x: hidden;
        background: rgba(246, 244, 232, 0.94);
        border: 4px solid;
        border-color: #ffffff #555555 #555555 #ffffff;
        box-shadow: 0 0 0 3px #000000;
        border-radius: 0;
        padding: 14px;
        pointer-events: auto;
        display: none;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: #ca8a04 #fef08a;
      }
      .panel-clima-card.visible {
        display: block;
        animation: slideDownClima 0.16s steps(4);
      }
      @keyframes slideDownClima {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Cabecera del Panel */
      .clima-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        border-bottom: 2px solid #854d0e;
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
        background: #dc2626;
        border: 2px solid;
        border-color: #fca5a5 #7f1d1d #7f1d1d #fca5a5;
        border-radius: 0;
        width: 28px;
        height: 28px;
        font-size: 13px;
        font-weight: 800;
        color: #ffffff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.1s ease;
      }
      .btn-cerrar-clima:hover {
        filter: brightness(1.1);
        background: #ef4444;
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
        border-radius: 0;
        padding: 6px 8px;
        font-size: 11.5px;
        font-weight: 800;
        color: #1e293b;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: all 0.12s ease;
      }
      .btn-escenario:hover {
        background: #fef08a;
      }
      .btn-escenario.activo {
        background: #e8a317;
        color: #0f172a;
        border-color: #000000;
        font-weight: 900;
      }

      /* Lista de Sliders Ambientales */
      .slider-clima-row {
        margin-bottom: 10px;
        background: rgba(255, 255, 255, 0.72);
        border: 2px solid #555555;
        border-radius: 0;
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

      .grupo-clima-titulo {
        margin: 12px 0 6px;
        padding: 4px 8px;
        font-size: 13px;
        font-weight: 900;
        color: #ffffff;
        background: #3b82a0;
        border: 2px solid #1e3a4a;
        text-shadow: 1px 1px 0 #1e3a4a;
      }
      .slider-clima-ayuda {
        font-size: 10px;
        color: #64748b;
        margin-top: 2px;
        text-align: center;
      }

      /* Botón Ciclo Solar Auto */
      .btn-ciclo-solar {
        width: 100%;
        margin-top: 12px;
        background: #fef08a;
        border: 3px solid;
        border-color: #ffffff #555555 #555555 #ffffff;
        box-shadow: 0 0 0 2px #000;
        border-radius: 0;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 800;
        color: #1e293b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
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
    lblEsc.textContent = "Elige un clima rápido";
    this.panelCard.appendChild(lblEsc);

    const gridEsc = document.createElement("div");
    gridEsc.className = "escenarios-grid";

    ESCENARIOS.forEach((esc) => {
      const btn = document.createElement("button");
      btn.className = "btn-escenario";
      btn.textContent = `${iconoEscenario(esc.nombre)} ${esc.nombre}`;
      btn.title = esc.nombre;
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
    lblVar.textContent = "Ajusta el clima (mueve las barras)";
    this.panelCard.appendChild(lblVar);

    const porClave = new Map(VARIABLES.map((v) => [v.key as string, v]));
    const mostradas = new Set<string>();
    const construirFila = (def: (typeof VARIABLES)[number]) => {
      mostradas.add(def.key);
      const row = document.createElement("div");
      row.className = "slider-clima-row";
      row.style.borderLeft = `6px solid ${def.color}`;

      const top = document.createElement("div");
      top.className = "slider-clima-top";
      top.innerHTML = `
        <span class="slider-clima-nombre">${ICONOS_VARIABLE[def.key] ?? "•"} ${def.etiqueta}</span>
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
      slider.style.accentColor = def.color;

      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        this.clima[def.key] = val;
        const valLbl = top.querySelector(`#val_${def.key}`) as HTMLSpanElement;
        valLbl.textContent = `${val} ${def.unidad}`;
        this.desmarcarEscenarios();
        this.callbacks.onCambioClima(this.clima);
      });

      row.appendChild(slider);
      const ayuda = document.createElement("div");
      ayuda.className = "slider-clima-ayuda";
      ayuda.textContent = AYUDA_VARIABLE[def.key] ?? "";
      row.appendChild(ayuda);
      this.panelCard.appendChild(row);

      this.sliderElements.set(def.key, {
        slider,
        valueLabel: top.querySelector(`#val_${def.key}`) as HTMLSpanElement
      });
    };

    for (const g of GRUPOS_VARIABLE) {
      const cab = document.createElement("div");
      cab.className = "grupo-clima-titulo";
      cab.textContent = `${g.icono} ${g.titulo}`;
      this.panelCard.appendChild(cab);
      for (const k of g.claves) {
        const def = porClave.get(k);
        if (def) construirFila(def);
      }
    }
    VARIABLES.forEach((def) => {
      if (!mostradas.has(def.key)) construirFila(def);
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
