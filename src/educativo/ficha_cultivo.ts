/**
 * Ficha Clínica del Cultivo + Perfil Radicular Subterráneo 2D (v4.1)
 *
 * Permite inspeccionar en cualquier momento ([O] o botón HUD) la estación actual:
 * - Diagnóstico en vivo: Actual vs. Rango Óptimo de la raza (T°, VWC, pH, N, P, K, PAR/C4, Cuajado, Hongos, Humedad de grano R3 vs R6).
 * - Perfil Radicular en tiempo real (Canvas 2D): radícula, seminales, nodales, raíces zanco, hidrotropismo, hipoxia, Al³⁺ y nódulos de Rhizobium.
 * - Atlas de Razas Nativas, Tríada (Frijol Ayocote & Calabaza), 4 Quelites de la Milpa y Fitopatología.
 */

import { NodoSurco } from "../surco_milpa";
import { ClimateState, calcularMetricas } from "../clima";
import {
  CFG,
  CULTIVOS_ASOCIADOS,
  ENFERMEDADES_MAIZ,
  Etapa,
  QUELITES_MILPA,
  TipoSemilla,
  VARIEDADES_MAIZ,
  etapaDe,
  nombreEtapa
} from "../nucleo";

type TabFicha = "diagnostico" | "razas" | "milpa";

export class FichaCultivoModal {
  private modalEl: HTMLDivElement | null = null;
  private tabActiva: TabFicha = "diagnostico";
  private ultimoNodo: NodoSurco | null = null;
  private ultimoClima: ClimateState | null = null;

  constructor() {
    this.construirDOM();
  }

  private construirDOM(): void {
    if (typeof document === "undefined") return;
    const modal = document.createElement("div");
    modal.id = "fichaCultivoModal";
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(780px, 95vw);
      max-height: 88vh;
      overflow-y: auto;
      background: rgba(15, 23, 18, 0.97);
      color: #f1f5f9;
      border: 4px solid;
      border-color: #86efac #14532d #14532d #86efac;
      box-shadow: 0 0 0 4px #000000;
      padding: 18px 22px;
      z-index: 2850;
      display: none;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  public estaAbierto(): boolean {
    return !!this.modalEl && this.modalEl.style.display === "block";
  }

  public cerrar(): void {
    if (this.modalEl) this.modalEl.style.display = "none";
  }

  public alternar(nodo: NodoSurco, clima: ClimateState): void {
    if (!this.modalEl) return;
    if (this.estaAbierto()) {
      this.cerrar();
    } else {
      this.abrir(nodo, clima);
    }
  }

  public abrir(nodo: NodoSurco, clima: ClimateState): void {
    if (!this.modalEl) return;
    this.ultimoNodo = nodo;
    this.ultimoClima = clima;
    this.modalEl.style.display = "block";
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.render();
  }

  public actualizarSiAbierto(nodo: NodoSurco, clima: ClimateState): void {
    if (!this.estaAbierto()) return;
    this.ultimoNodo = nodo;
    this.ultimoClima = clima;
    this.render();
  }

  private estadoRango(val: number, min: number, max: number): { color: string; etiqueta: string } {
    if (val >= min && val <= max) return { color: "#4ade80", etiqueta: "Óptimo" };
    const margen = Math.max(2, (max - min) * 0.35);
    if (val < min - margen || val > max + margen) return { color: "#f87171", etiqueta: val < min ? "Crítico (Bajo)" : "Crítico (Alto)" };
    return { color: "#facc15", etiqueta: val < min ? "Bajo" : "Alto" };
  }

  private render(): void {
    if (!this.modalEl || !this.ultimoNodo || !this.ultimoClima) return;
    const nodo = this.ultimoNodo;
    const clima = this.ultimoClima;
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const p = nodo.plantaInterna;
    const m = calcularMetricas(clima, nodo.variedad);

    const tabBtn = (id: TabFicha, label: string) => {
      const act = this.tabActiva === id;
      return `<button data-tab="${id}" style="padding:7px 14px;border:2px solid ${act ? "#86efac" : "#334155"};background:${act ? "#166534" : "#1e293b"};color:${act ? "#fff" : "#cbd5e1"};font-weight:700;cursor:pointer;font-size:0.84rem;">${label}</button>`;
    };

    let cuerpo = "";
    if (this.tabActiva === "diagnostico") {
      const etapaEnum = p.estado === "SEMILLA" ? Etapa.SEMILLA : etapaDe(p.gdd, CFG, varCfg);
      const etapaTxt = nombreEtapa(etapaEnum);
      const gddEmergMeta = CFG.gddEmergencia * (varCfg.gddCicloCompleto / CFG.gddR6);
      const pctGerm = p.estado === "SEMILLA" ? Math.min(99, Math.round((p.gddSiembra / Math.max(1, gddEmergMeta)) * 100)) : 100;

      const rTemp = this.estadoRango(clima.temperatura, varCfg.tempOptimaMin, varCfg.tempOptimaMax);
      const rVwc = this.estadoRango(nodo.humedadVWC, varCfg.vwcOptimoMin, varCfg.vwcOptimoMax);
      const rPh = this.estadoRango(clima.phSuelo, varCfg.phOptimoMin, varCfg.phOptimoMax);
      const rN = this.estadoRango(nodo.nSuelo, 45, 92);
      const rP = this.estadoRango(nodo.pSuelo, 40, 92);
      const rK = this.estadoRango(nodo.kSuelo, 40, 92);

      // Diagnóstico accionable
      const consejos: string[] = [];
      if (!nodo.sembrada) {
        consejos.push(nodo.tierraArada < 100 ? "⛏️ Ara la tierra al 100% con la Azada [2] antes de sembrar." : "🌱 Suelo arado listo: selecciona una semilla [3–6] y siembra.");
      } else if (p.estado === "MUERTA") {
        consejos.push(`💀 Planta muerta por ${(p.causaMuerte || "estrés").toUpperCase()}. Retírala con [Q] o Azada [2] para iniciar un nuevo ciclo.`);
      } else {
        if (p.estado === "SEMILLA") consejos.push(`🌰 Semilla germinando (${pctGerm}%). Mantén suelo entre ${varCfg.vwcOptimoMin}–${varCfg.vwcOptimoMax}% VWC y T° > ${varCfg.tBase + 1.5} °C.`);
        if (nodo.humedadVWC < varCfg.vwcOptimoMin) consejos.push(`💧 Déficit hídrico: riega con Regadera [7] (PMP de esta raza: ${varCfg.pmp}% VWC).`);
        if (nodo.humedadVWC > varCfg.vwcOptimoMax + 4) consejos.push("🌊 Exceso de agua / riesgo de hipoxia radicular: abre zanja de drenaje con Azada [2].");
        if (nodo.nSuelo < 40) consejos.push("🌿 Déficit de Nitrógeno: aplica Abono [8] o siembra Frijol Ayocote [B] (fija N con Rhizobium).");
        if (nodo.pSuelo < 35 || nodo.kSuelo < 35) consejos.push("🧪 Déficit de Fósforo/Potasio: abona con [8] para fortalecer raíces, caña y llenado de grano.");
        if (clima.phSuelo < varCfg.phOptimoMin || clima.phSuelo > varCfg.phOptimoMax) consejos.push(`⚗️ pH fuera de rango (${varCfg.phOptimoMin}–${varCfg.phOptimoMax}): bloquea absorción de nutrientes y en pH < 5.2 produce toxicidad de Al³⁺.`);
        if (nodo.proteccion > 0 && clima.temperatura > 12) consejos.push("☀️ El Petate [G] puesto en día soleado sombrea ~42% de la luz PAR; retíralo cuando no haya helada.");
        if (etapaEnum >= Etapa.VT && etapaEnum <= Etapa.R2 && nodo.polinizacion < 0.75) consejos.push("🌼 En ventana de floración (VT–R2): sacude la espiga con [P] para mejorar el cuajado.");
        if ((p.huitlacoche ?? 0) >= 0.45) consejos.push("🍄 ¡Se desarrolló Huitlacoche (Ustilago maydis)! Cosecha con [9] para preparar Quesadilla Gourmet en el Fogón [F].");
        if (etapaEnum === Etapa.R3 || etapaEnum === Etapa.R4) consejos.push(`🌽 Ventana de Elote Tierno (humedad grano ~${Math.round(p.humedadGranoPct ?? 72)}%): cosecha ya para elotes/esquites, o espera a R6 (~14%) para semilla/nixtamal/palomitas.`);
        if (etapaEnum >= Etapa.R5) consejos.push(`🌾 Ventana de Grano Seco (humedad ~${Math.round(p.humedadGranoPct ?? 20)}%): ideal para nixtamalización, palomitas momochtli y desgranar +8 semillas en el Banco [M].`);
        if (consejos.length === 0) consejos.push("✅ Cultivo en homeostasis óptima: fotosíntesis C4 y balance hídrico/nutricional balanceados.");
      }

      const filaMetrica = (nombre: string, actual: string, optimo: string, est: { color: string; etiqueta: string }) => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
          <td style="padding:5px 6px;font-weight:600;">${nombre}</td>
          <td style="padding:5px 6px;color:#fff;font-weight:700;">${actual}</td>
          <td style="padding:5px 6px;color:#94a3b8;">${optimo}</td>
          <td style="padding:5px 6px;color:${est.color};font-weight:700;">${est.etiqueta}</td>
        </tr>
      `;

      cuerpo = `
        <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start;">
          <div>
            <div style="background:rgba(255,255,255,0.05);border-left:5px solid ${varCfg.colorHex};padding:10px 12px;margin-bottom:10px;">
              <div style="font-size:1rem;font-weight:800;color:#fde047;">Estación #${nodo.id + 1} · ${varCfg.nombre}</div>
              <div style="font-size:0.78rem;color:#cbd5e1;"><em>${varCfg.especieBotanica}</em> · ${varCfg.origenBiogeografico}</div>
              <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;font-size:0.78rem;">
                <span>📅 Día <b>${Math.floor(nodo.diasCultivo)}</b></span>
                <span>🌱 Etapa: <b>${nodo.sembrada ? etapaTxt : "Sin sembrar"}</b></span>
                <span>📏 Altura: <b>${p.alturaMetros.toFixed(2)} / ${varCfg.alturaMetrosMax.toFixed(1)} m</b></span>
                <span>💚 Vigor: <b>${Math.round(p.vigor * 100)}%</b></span>
                <span>✨ Cuajado: <b>${Math.round(p.cuajado * 100)}%</b></span>
                <span>💧 Grano: <b>${Math.round(p.humedadGranoPct ?? 85)}% H</b></span>
              </div>
            </div>

            <table style="width:100%;border-collapse:collapse;font-size:0.78rem;background:rgba(0,0,0,0.28);margin-bottom:10px;">
              <thead>
                <tr style="background:rgba(22,101,52,0.45);text-align:left;color:#bbf7d0;">
                  <th style="padding:6px;">Variable</th>
                  <th style="padding:6px;">Actual</th>
                  <th style="padding:6px;">Óptimo Raza</th>
                  <th style="padding:6px;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${filaMetrica("Temperatura Aire", `${clima.temperatura.toFixed(1)} °C`, `${varCfg.tempOptimaMin}–${varCfg.tempOptimaMax} °C`, rTemp)}
                ${filaMetrica("Humedad Suelo (VWC)", `${Math.round(nodo.humedadVWC)}%`, `${varCfg.vwcOptimoMin}–${varCfg.vwcOptimoMax}% (PMP ${varCfg.pmp}%)`, rVwc)}
                ${filaMetrica("pH Edáfico", clima.phSuelo.toFixed(1), `${varCfg.phOptimoMin}–${varCfg.phOptimoMax}`, rPh)}
                ${filaMetrica("Nitrógeno (N)", `${Math.round(nodo.nSuelo)}%`, `≥ 45% (Demanda ${varCfg.demandaN})`, rN)}
                ${filaMetrica("Fósforo (P)", `${Math.round(nodo.pSuelo)}%`, `≥ 40% (Demanda ${varCfg.demandaP})`, rP)}
                ${filaMetrica("Potasio (K)", `${Math.round(nodo.kSuelo)}%`, `≥ 40% (Demanda ${varCfg.demandaK})`, rK)}
                ${filaMetrica("Fotosíntesis C4", `${(p.fotosintesisUltima ?? m.fotosintesis).toFixed(1)} µmol/m²s`, `PAR ${Math.round(m.par)} · CO₂ ${Math.round(clima.co2)} ppm`, { color: "#38bdf8", etiqueta: m.par > 400 ? "Activa" : "Baja luz" })}
                ${filaMetrica("Riesgo Fúngico", `${Math.round(m.riesgoFungico * 100)}%`, `< 60% (>72% Huitlacoche)`, { color: m.riesgoFungico > 0.65 ? "#c084fc" : "#4ade80", etiqueta: (p.huitlacoche ?? 0) >= 0.45 ? "Huitlacoche 🍄" : m.riesgoFungico > 0.65 ? "Alto" : "Bajo" })}
              </tbody>
            </table>

            <div style="background:rgba(20,83,45,0.3);border:1px solid #22c55e;padding:9px 11px;font-size:0.80rem;line-height:1.45;">
              <div style="font-weight:700;color:#86efac;margin-bottom:4px;">🩺 Diagnóstico Agronómico y Acciones Recomendadas:</div>
              ${consejos.map((c) => `<div style="margin-bottom:3px;">${c}</div>`).join("")}
            </div>
          </div>

          <div style="background:rgba(0,0,0,0.35);border:2px solid #334155;padding:10px;">
            <div style="font-size:0.84rem;font-weight:700;color:#fde68a;margin-bottom:6px;">🪵 Perfil Radicular en Vivo (Corte de Suelo)</div>
            <canvas id="canvasPerfilRaiz" width="280" height="270" style="width:100%;height:auto;display:block;border:1px solid #475569;background:#1c1917;"></canvas>
            <div style="font-size:0.73rem;color:#cbd5e1;margin-top:6px;line-height:1.38;">
              <div>• <b>Frijol Ayocote:</b> ${nodo.frijolVid > 0 ? (nodo.humedadVWC <= 38 && clima.phSuelo >= 5.6 && clima.phSuelo <= 7.4 ? "🟢 Nódulos Rhizobium fijando N₂" : "🟡 Simbiosis inhibida (revisa pH/drenaje)") : "No asociado"}</div>
              <div>• <b>Calabaza (Mulch):</b> ${nodo.calabazaCobertura > 0 ? `🟢 Cobertura ${Math.round(nodo.calabazaCobertura * 100)}% (-35% evap.)` : "No asociada"}</div>
              <div>• <b>Riesgo Edáfico:</b> ${nodo.humedadVWC > 38 ? "🌊 Hipoxia radicular" : clima.phSuelo < 5.2 ? "⚗️ Toxicidad por Al³⁺ (raíces cortas)" : nodo.humedadVWC < varCfg.pmp + 4 ? "☀️ Hidrotropismo profundo por sequía" : "🟢 Suelo franco aireado"}</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.tabActiva === "razas") {
      cuerpo = (Object.keys(VARIEDADES_MAIZ) as TipoSemilla[])
        .map((k) => {
          const v = VARIEDADES_MAIZ[k];
          return `
            <div style="background:rgba(255,255,255,0.04);border:1px solid #334155;border-left:5px solid ${v.colorHex};padding:10px 12px;margin-bottom:10px;font-size:0.79rem;line-height:1.42;">
              <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <strong style="font-size:0.92rem;color:#fde047;">🌽 ${v.nombre} — <em>${v.especieBotanica}</em></strong>
                <span style="color:#94a3b8;">${v.origenBiogeografico}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:6px;color:#e2e8f0;">
                <div><b>Endospermo:</b> ${v.tipoEndospermo}</div>
                <div><b>Mazorca:</b> ${v.hilerasMazorca}</div>
                <div><b>Peso 1,000 granos:</b> ${v.pesoMilGranosG} g</div>
                <div><b>Rendimiento potencial:</b> ${v.rendimientoPotencialTonHa}</div>
                <div><b>Densidad / Profundidad:</b> ${v.densidadSiembraPlHa} · ${v.profundidadSiembraCm}</div>
                <div><b>Demanda N-P-K:</b> N ${v.demandaN} · P ${v.demandaP} · K ${v.demandaK}</div>
                <div><b>Ventana Elote (R3):</b> ${v.diasEloteR3Est} (~${v.humedadCosechaElotePct}% hum.)</div>
                <div><b>Grano Seco (R6):</b> ${v.diasMadurezR6Est} (≤${v.humedadCosechaGranoPct}% hum.)</div>
              </div>
              <div style="margin-top:6px;color:#bbf7d0;">🥗 <b>Nutrición:</b> ${v.perfilNutricional}</div>
              <div style="margin-top:3px;color:#fde68a;">🔥 <b>Usos Culinarios:</b> ${v.usosCulinarios}</div>
            </div>
          `;
        })
        .join("");
    } else {
      const asociadosHtml = (["frijol", "calabaza"] as const)
        .map((k) => {
          const a = CULTIVOS_ASOCIADOS[k];
          return `
            <div style="background:rgba(255,255,255,0.04);border:1px solid #334155;border-left:5px solid ${k === "frijol" ? "#a855f7" : "#f97316"};padding:9px 12px;margin-bottom:8px;font-size:0.79rem;line-height:1.4;">
              <strong style="color:#fde047;font-size:0.88rem;">${a.icono} ${a.nombre} — <em>${a.especieBotanica}</em></strong>
              <div style="margin-top:4px;color:#e2e8f0;">🌡️ Óptimo ${a.tempOptimaMin}–${a.tempOptimaMax} °C (helada letal ${a.tempHeladaLetal} °C) · 💧 ${a.vwcOptimoMin}–${a.vwcOptimoMax}% VWC · ⚗️ pH ${a.phOptimoMin}–${a.phOptimoMax}</div>
              <div style="margin-top:2px;color:#bae6fd;">📅 <b>Siembra:</b> ${a.momentoSiembra} · <b>Cosecha:</b> ${a.diasCosecha}</div>
              <div style="margin-top:2px;color:#bbf7d0;">🤝 <b>Simbiosis:</b> ${a.simbiosisInfo}</div>
              <div style="margin-top:2px;color:#fde68a;">🍽️ <b>Gastronomía:</b> ${a.usosCulinarios}</div>
            </div>
          `;
        })
        .join("");

      const quelitesHtml = QUELITES_MILPA.map(
        (q) => `
          <div style="background:rgba(22,101,52,0.2);border:1px solid #166534;padding:8px 10px;font-size:0.77rem;line-height:1.38;">
            <strong style="color:#86efac;">🌿 ${q.nombre}</strong> <em style="color:#94a3b8;">(${q.especie})</em>
            <div>👁️ ${q.reconocimiento}</div>
            <div style="color:#fde68a;">🥗 ${q.nutricion} · ${q.usoCulinario}</div>
          </div>
        `
      ).join("");

      const enfHtml = ENFERMEDADES_MAIZ.map(
        (e) => `
          <div style="background:rgba(88,28,135,0.18);border:1px solid ${e.esComestible ? "#a855f7" : "#7f1d1d"};padding:8px 10px;font-size:0.77rem;line-height:1.38;">
            <strong style="color:${e.esComestible ? "#d8b4fe" : "#fca5a5"};">${e.esComestible ? "🍄" : "🦠"} ${e.nombre}</strong> <em style="color:#94a3b8;">(${e.patogeno})</em>
            <div><b>Condiciones:</b> ${e.condiciones}</div>
            <div><b>Síntomas:</b> ${e.sintomas}</div>
            <div style="color:#bbf7d0;"><b>Manejo:</b> ${e.manejo}</div>
          </div>
        `
      ).join("");

      cuerpo = `
        <h4 style="margin:0 0 6px;color:#86efac;">🔺 Cultivos Asociados de la Tríada Mesoamericana</h4>
        ${asociadosHtml}
        <h4 style="margin:12px 0 6px;color:#86efac;">🥬 Quelites Comestibles de la Milpa (Quilitl)</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">${quelitesHtml}</div>
        <h4 style="margin:10px 0 6px;color:#fca5a5;">🔬 Fitopatología, Huitlacoche y Sanidad en Troje</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${enfHtml}</div>
      `;
    }

    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #166534;padding-bottom:8px;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;color:#86efac;font-size:1.12rem;">🔍 Ficha Clínica, Razas y Perfil Radicular</h3>
          <span style="font-size:0.78rem;color:#94a3b8;">Pulsa [O] o [Esc] para cerrar · Inspección agronómica de la estación activa</span>
        </div>
        <button id="btnCerrarFichaCultivo" style="background:#dc2626;border:2px solid #fca5a5;color:#fff;font-weight:700;cursor:pointer;padding:3px 10px;">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        ${tabBtn("diagnostico", "🩺 Diagnóstico y Raíces")}
        ${tabBtn("razas", "🌽 Atlas de las 4 Razas")}
        ${tabBtn("milpa", "🔺 Tríada, Quelites y Hongos")}
      </div>
      ${cuerpo}
    `;

    this.modalEl.querySelector("#btnCerrarFichaCultivo")?.addEventListener("click", () => this.cerrar());
    this.modalEl.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.tabActiva = (btn as HTMLElement).getAttribute("data-tab") as TabFicha;
        this.render();
      });
    });

    if (this.tabActiva === "diagnostico") {
      this.dibujarPerfilRadicular(nodo, clima);
    }
  }

  private dibujarPerfilRadicular(nodo: NodoSurco, clima: ClimateState): void {
    const canvas = this.modalEl?.querySelector("#canvasPerfilRaiz") as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const p = nodo.plantaInterna;
    const etapaEnum = p.estado === "SEMILLA" ? Etapa.SEMILLA : etapaDe(p.gdd, CFG, varCfg);

    // 1. Cielo superior + horizontes de suelo (O/A/B) coloreados por humedad
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(0, 0, W, 46);
    const hum01 = Math.max(0, Math.min(1, (nodo.humedadVWC - 8) / 40));
    const sueloA = hum01 > 0.72 ? "#2d2015" : hum01 < 0.25 ? "#8b633c" : "#5c3d22";
    const sueloB = hum01 > 0.72 ? "#1e1610" : "#442c17";
    ctx.fillStyle = sueloA;
    ctx.fillRect(0, 46, W, 110);
    ctx.fillStyle = sueloB;
    ctx.fillRect(0, 156, W, H - 156);

    // Lámina de agua si hay encharcamiento (>38% VWC)
    if (nodo.humedadVWC > 38) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
      ctx.fillRect(0, 42, W, 18);
    }

    // Etiquetas de profundidad
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px monospace";
    ctx.fillText("0 cm", 6, 58);
    ctx.fillText("-30 cm", 6, 152);
    ctx.fillText("-60 cm", 6, 258);

    if (!nodo.sembrada) {
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("Estación sin semilla sembrada", 48, 138);
      return;
    }

    const cx = W / 2;
    const esMuerta = p.estado === "MUERTA";
    const esHipoxia = nodo.humedadVWC > 38;
    const esAluminio = clima.phSuelo < 5.2;
    const esSequia = nodo.humedadVWC < varCfg.pmp + 5;

    // Color radicular según estado fisiológico
    const colRaiz = esMuerta
      ? "#44403c"
      : esHipoxia
      ? "#57534e"
      : esAluminio
      ? "#d97706"
      : "#fef3c7";

    // Tallo basal saliendo del suelo
    if (p.estado !== "SEMILLA") {
      ctx.strokeStyle = esMuerta ? "#78716c" : "#65a30d";
      ctx.lineWidth = Math.max(4, Math.min(11, 4 + etapaEnum * 0.6));
      ctx.beginPath();
      ctx.moveTo(cx, 54);
      ctx.lineTo(cx, 6);
      ctx.stroke();
    }

    // Semilla enterrada (profundidad 5 cm)
    ctx.fillStyle = varCfg.colorHex;
    ctx.beginPath();
    ctx.ellipse(cx, 66, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Profundidad máxima escalada por etapa, hidrotropismo (sequía) y toxicidad Al³⁺ (atrofia)
    const progresoRaiz = p.estado === "SEMILLA" ? 0.18 : Math.min(1, 0.25 + etapaEnum * 0.09);
    const factorAl = esAluminio ? 0.52 : 1.0;
    const factorHidro = esSequia ? 1.22 : 1.0;
    const profMax = Math.min(195, 165 * progresoRaiz * factorAl * factorHidro);

    // Radícula / raíz primaria + seminales
    ctx.strokeStyle = colRaiz;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, 68);
    ctx.quadraticCurveTo(cx + 6, 68 + profMax * 0.5, cx - 4, 68 + profMax);
    ctx.stroke();

    // Raíces nodales / coronales en abanico (a partir de V2+)
    const numNodales = p.estado === "SEMILLA" ? 2 : Math.min(12, 3 + etapaEnum);
    for (let i = 0; i < numNodales; i++) {
      const lado = i % 2 === 0 ? -1 : 1;
      const nivel = Math.floor(i / 2);
      const apertura = (22 + nivel * 18) * (esAluminio ? 0.55 : 1.0);
      const prof = profMax * (0.48 + (nivel % 3) * 0.22);
      ctx.lineWidth = Math.max(1.2, 2.5 - nivel * 0.25);
      ctx.beginPath();
      ctx.moveTo(cx, 58 + nivel * 3);
      ctx.quadraticCurveTo(cx + lado * apertura * 0.7, 68 + prof * 0.45, cx + lado * apertura, 68 + prof);
      ctx.stroke();
    }

    // Raíces zanco aéreas (brace roots a partir de V8)
    if (etapaEnum >= Etapa.V8) {
      ctx.strokeStyle = esHipoxia ? "#292524" : "#ca8a04";
      ctx.lineWidth = 3;
      const pares = nodo.variedad === "palomero" ? 4 : 3;
      for (let i = 0; i < pares; i++) {
        const yTop = 36 - i * 4;
        const dx = 18 + i * 7;
        ctx.beginPath();
        ctx.moveTo(cx, yTop);
        ctx.lineTo(cx - dx, 56);
        ctx.moveTo(cx, yTop);
        ctx.lineTo(cx + dx, 56);
        ctx.stroke();
      }
    }

    // Nódulos rosados de Rhizobium si hay Frijol Ayocote asociado
    if (nodo.frijolVid > 0) {
      const activos = !esHipoxia && clima.phSuelo >= 5.6 && clima.phSuelo <= 7.4;
      ctx.strokeStyle = "#86efac";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + 38, 48);
      ctx.quadraticCurveTo(cx + 56, 95, cx + 48, 150);
      ctx.stroke();

      ctx.fillStyle = activos ? "#f472b6" : "#a8a29e";
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(cx + 42 + (k % 2) * 14, 72 + k * 13, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
