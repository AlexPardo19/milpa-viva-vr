import { VARIEDADES_MAIZ, TipoSemilla } from '../nucleo';

export type ModoControlDetectado = 'teclado' | 'oculus';

/**
 * Modal de Bienvenida, Detección Automática de Dispositivo (Teclado/PC vs. Oculus/Meta Quest VR)
 * y Guía Agronómica de las 4 Especies de Maíz.
 */
export class ModalControlesBienvenida {
    private modalEl: HTMLDivElement | null = null;
    private modoDetectado: ModoControlDetectado = 'teclado';
    private pestanaActiva: 'teclado' | 'oculus' | 'especies' = 'teclado';
    private vrSoportado: boolean = false;
    private nombreDispositivoVR: string = 'No detectado (Modo PC Teclado y Ratón)';
    public onCerrar?: () => void;

    constructor() {
        this.detectarDispositivoInicial();
    }

    /**
     * Detecta automáticamente si el usuario navega desde un visor Oculus / Meta Quest
     * o si tiene un casco WebXR (immersive-vr) conectado al equipo.
     */
    public async detectarDispositivoInicial(): Promise<void> {
        if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

        const ua = navigator.userAgent || '';
        const esQuestUA = /OculusBrowser|Quest|MetaQuest|Pacific|Santa Cruz/i.test(ua);

        let xrDisponible = false;
        try {
            const navAny = navigator as any;
            if (navAny.xr && typeof navAny.xr.isSessionSupported === 'function') {
                xrDisponible = await navAny.xr.isSessionSupported('immersive-vr');
            }
        } catch {
            xrDisponible = false;
        }

        this.vrSoportado = esQuestUA || xrDisponible;
        if (esQuestUA) {
            this.modoDetectado = 'oculus';
            this.pestanaActiva = 'oculus';
            this.nombreDispositivoVR = 'Visor Meta Quest / Oculus Browser detectado';
        } else if (xrDisponible) {
            this.modoDetectado = 'oculus';
            this.pestanaActiva = 'oculus';
            this.nombreDispositivoVR = 'Dispositivo WebXR / Oculus VR listo';
        } else {
            this.modoDetectado = 'teclado';
            this.pestanaActiva = 'teclado';
            this.nombreDispositivoVR = 'PC de Escritorio (Teclado y Ratón)';
        }

        this.construirDOM();
    }

    /**
     * Permite actualizar el estado cuando el usuario entra o sale de una sesión WebXR en vivo
     */
    public notificarEstadoXR(enXR: boolean): void {
        if (enXR) {
            this.vrSoportado = true;
            this.modoDetectado = 'oculus';
            this.pestanaActiva = 'oculus';
            this.nombreDispositivoVR = 'Sesión Inmersiva Oculus / WebXR Activa';
            this.renderizarContenido();
        }
    }

    private construirDOM(): void {
        if (typeof document === 'undefined' || this.modalEl) return;

        const overlay = document.createElement('div');
        overlay.id = 'modalControlesBienvenida';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(8, 14, 10, 0.72);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 3200;
            font-family: var(--fuente-px);
            padding: 16px;
        `;

        document.body.appendChild(overlay);
        this.modalEl = overlay;
        this.renderizarContenido();
    }

    public mostrar(pestana?: 'teclado' | 'oculus' | 'especies'): void {
        if (!this.modalEl) this.construirDOM();
        if (pestana) this.pestanaActiva = pestana;
        if (this.modalEl) {
            this.modalEl.style.display = 'flex';
            this.renderizarContenido();
        }
    }

    public ocultar(): void {
        if (this.modalEl) {
            this.modalEl.style.display = 'none';
        }
        if (this.onCerrar) this.onCerrar();
    }

    public alternar(): void {
        if (!this.modalEl || this.modalEl.style.display === 'none') {
            this.mostrar();
        } else {
            this.ocultar();
        }
    }

    public estaAbierto(): boolean {
        return !!this.modalEl && this.modalEl.style.display !== 'none';
    }

    private renderizarContenido(): void {
        if (!this.modalEl) return;

        const badgeVR = this.vrSoportado
            ? `<span style="background:rgba(16,185,129,0.22);border:2px solid #34d399;color:#6ee7b7;padding:3px 9px;border-radius:0;font-size:0.76rem;font-weight:700;">🥽 ${this.nombreDispositivoVR}</span>`
            : `<span style="background:rgba(59,130,246,0.22);border:2px solid #60a5fa;color:#bfdbfe;padding:3px 9px;border-radius:0;font-size:0.76rem;font-weight:700;">🖥️ ${this.nombreDispositivoVR}</span>`;

        const btnTabEstilo = (activo: boolean) => `
            flex: 1;
            padding: 8px 12px;
            border-radius: 0;
            border: 2px solid;
            border-color: ${activo ? '#fef08a #854d0e #854d0e #fef08a' : '#475569 #0f172a #0f172a #475569'};
            background: ${activo ? '#b45309' : 'rgba(255,255,255,0.08)'};
            color: ${activo ? '#ffffff' : '#cbd5e1'};
            font-weight: 700;
            font-size: 0.84rem;
            cursor: pointer;
            font-family: var(--fuente-px);
        `;

        let cuerpoHTML = '';

        if (this.pestanaActiva === 'teclado') {
            cuerpoHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:10px;margin-bottom:12px;">
                    <div style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.16);border-radius:0;padding:12px;">
                        <div style="color:#fcd34d;font-weight:800;font-size:0.88rem;margin-bottom:6px;">🚶 Movimiento y Cámara (Estilo Minecraft)</div>
                        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:0.8rem;line-height:1.55;">
                            <li><kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">W</kbd> <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">A</kbd> <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">S</kbd> <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">D</kbd> o Flechas: Caminar por la milpa.</li>
                            <li><kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">Espacio</kbd>: Saltar · <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">Shift</kbd>: Correr.</li>
                            <li><b>Clic en la escena 3D</b>: Capturar ratón para mirar en 1ª persona.</li>
                            <li><kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">ESC</kbd>: Liberar el cursor o cerrar ventanas.</li>
                        </ul>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.16);border-radius:0;padding:12px;">
                        <div style="color:#34d399;font-weight:800;font-size:0.88rem;margin-bottom:6px;">🛠️ Herramientas y Acciones en Parcela</div>
                        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:0.8rem;line-height:1.55;">
                            <li><kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">1</kbd>–<kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">9</kbd> o <b>Rueda del Ratón</b>: [1] Manos, [2] Azada, [3-6] 4 Semillas de Maíz, [7] Agua, [8] Abono, [9] Cosecha.</li>
                            <li><b>Clic Izquierdo / Derecho</b> o <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">E</kbd>: Usar ítem sobre la estación apuntada.</li>
                            <li><kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">Q</kbd> o botón <b>🗑️ Quitar</b>: Arrancar/limpiar planta.</li>
                            <li><b>Semillas y Troje</b>: Repón semillas con <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">U</kbd> (Dispensador) y abre Mochila/Troje con <kbd style="background:#1e293b;padding:1px 6px;border-radius:0;border:1px solid #475569;">I</kbd>.</li>
                        </ul>
                    </div>
                </div>
                <div style="background:rgba(16,185,129,0.12);border:2px solid rgba(52,211,153,0.4);border-radius:0;padding:10px 12px;font-size:0.79rem;color:#d1fae5;line-height:1.5;">
                    <b>⌨️ Atajos Rápidos de Menús y Labores:</b>
                    <span style="display:inline-block;margin-left:6px;">✋ Manos <kbd>[1]</kbd></span> ·
                    <span>🌰 Dispensador <kbd>[U]</kbd></span> ·
                    <span>☀️ Sol +15d <kbd>[Y]</kbd></span> ·
                    <span>⏸️ Pausa/Guardar <kbd>[Esc]</kbd></span> ·
                    <span>🧬 Banco <kbd>[M]</kbd></span> ·
                    <span>🏛️ Troje <kbd>[I]</kbd></span> ·
                    <span>🔥 Fogón <kbd>[F]</kbd></span> ·
                    <span>📖 Códice <kbd>[K]</kbd></span> ·
                    <span>⛅ Clima <kbd>[C]</kbd></span> ·
                    <span>🔬 Lab 3D <kbd>[H]</kbd></span> ·
                    <span>🗑️ Quitar Planta <kbd>[Q]</kbd></span> ·
                    <span>🌿 Deshierbar <kbd>[X]</kbd></span> ·
                    <span>🌬️ Polinizar <kbd>[P]</kbd></span> ·
                    <span>🫘 +Frijol <kbd>[B]</kbd></span> ·
                    <span>🎃 +Calabaza <kbd>[N]</kbd></span> ·
                    <span>🪵 Tutor <kbd>[T]</kbd></span> ·
                    <span>🛡️ Petate <kbd>[G]</kbd></span>
                </div>
            `;
        } else if (this.pestanaActiva === 'oculus') {
            cuerpoHTML = `
                <div style="background:${this.vrSoportado ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)'};border:2px solid ${this.vrSoportado ? '#34d399' : '#fbbf24'};border-radius:0;padding:10px 12px;margin-bottom:10px;font-size:0.82rem;color:#f8fafc;">
                    ${
                        this.vrSoportado
                            ? '✅ <b>¡Visor Oculus / Meta Quest compatible detectado!</b> Pulsa el botón de las gafas WebXR en la esquina inferior derecha para entrar en Realidad Virtual inmersiva.'
                            : 'ℹ️ <b>No se detectó un visor Oculus activo en este momento.</b> Si conectas tus gafas Meta Quest (Link / AirLink o navegador Oculus Browser), estos controles 6DoF se activarán automáticamente.'
                    }
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:10px;margin-bottom:10px;">
                    <div style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.16);border-radius:0;padding:12px;">
                        <div style="color:#fcd34d;font-weight:800;font-size:0.88rem;margin-bottom:6px;">🥽 Locomoción y Mandos Oculus Touch</div>
                        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:0.8rem;line-height:1.55;">
                            <li><b>Thumbstick Izquierdo</b>: Caminar suavemente o apuntar arco de teletransporte sobre la milpa.</li>
                            <li><b>Thumbstick Derecho</b>: Giro por grados (Snap Turn 30°) o giro continuo sin mareo (viñeta de confort activa).</li>
                            <li><b>Gatillo (Trigger) / Agarre (Grip)</b>: Sujetar herramientas físicas 3D del cobertizo o seleccionar botones.</li>
                        </ul>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.16);border-radius:0;padding:12px;">
                        <div style="color:#34d399;font-weight:800;font-size:0.88rem;margin-bottom:6px;">🤲 Gestos Físicos Realistas en VR (6DoF)</div>
                        <ul style="margin:0;padding-left:18px;color:#e2e8f0;font-size:0.8rem;line-height:1.55;">
                            <li><b>Manos Libres</b>: Ranura dorada en el Cinturón VR. Palpa la humedad del suelo con las puntas de los dedos, sacude espigas para polinizar, o acaricia a Don Elote.</li>
                            <li><b>Azada</b>: Golpea el montículo hacia abajo (&gt; 1.2 m/s) para aflojar la tierra o limpiar plantas secas.</li>
                            <li><b>Regadera y Abono</b>: Inclina la regadera (&gt; 35°) sobre la planta para verter agua; sacude el costal para abonar.</li>
                            <li><b>Deshierbe y Cosecha</b>: Arranca malezas con jalón suave; gira y tira de la mazorca madura para guardarla en la Canasta / Troje.</li>
                        </ul>
                    </div>
                </div>
            `;
        } else {
            const tarjetas = (Object.keys(VARIEDADES_MAIZ) as TipoSemilla[])
                .map((k) => {
                    const v = VARIEDADES_MAIZ[k];
                    return `
                        <div style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.14);border-left:5px solid ${v.colorHex};border-radius:0;padding:9px 11px;font-size:0.78rem;line-height:1.38;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                                <strong style="color:#fcd34d;font-size:0.85rem;">🌽 ${v.nombre}</strong>
                                <span style="background:rgba(255,255,255,0.12);padding:1px 7px;border-radius:0;font-size:0.71rem;color:#cbd5e1;">Límite: ${v.alturaMetrosMax.toFixed(1)} m</span>
                            </div>
                            <div style="color:#93c5fd;font-size:0.74rem;margin-bottom:4px;"><em>${v.especieBotanica}</em> · ${v.origenBiogeografico}</div>
                            <div style="color:#a7f3d0;margin-bottom:2px;">✅ <b>Crece favorablemente en:</b> ${v.condicionesFavorables}</div>
                            <div style="color:#fca5a5;">⚠️ <b>Le perjudica:</b> ${v.queLePerjudica}</div>
                        </div>
                    `;
                })
                .join('');

            cuerpoHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:8px;max-height:48vh;overflow-y:auto;padding-right:4px;">
                    ${tarjetas}
                </div>
            `;
        }

        this.modalEl.innerHTML = `
            <div style="background:#141e18;border:4px solid;border-color:#4ade80 #14532d #14532d #4ade80;border-radius:0;padding:18px 22px;width:min(760px, 95vw);max-height:90vh;overflow-y:auto;box-shadow:0 0 0 4px #000000;color:#f8fafc;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <h2 style="margin:0;font-size:1.25rem;color:#fcd34d;text-shadow:2px 2px 0 #000;">🌽 Milpa Viva VR — Guía de Controles y Especies</h2>
                            ${badgeVR}
                        </div>
                        <p style="margin:4px 0 0 0;font-size:0.82rem;color:#94a3b8;">
                            Simulador agroecológico pixel art en primera persona. Cada especie de maíz crece hasta su límite biológico y reacciona al clima.
                        </p>
                    </div>
                    <button id="btnCerrarModalControlesX" style="background:#dc2626;border:2px solid;border-color:#fca5a5 #7f1d1d #7f1d1d #fca5a5;color:#ffffff;width:32px;height:32px;border-radius:0;cursor:pointer;font-size:1rem;font-weight:700;">✕</button>
                </div>

                <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
                    <button id="tabCtrlTeclado" style="${btnTabEstilo(this.pestanaActiva === 'teclado')}">
                        🖥️ Controles Teclado y Ratón ${this.modoDetectado === 'teclado' ? '(Activo)' : ''}
                    </button>
                    <button id="tabCtrlOculus" style="${btnTabEstilo(this.pestanaActiva === 'oculus')}">
                        🥽 Controles Oculus / Quest VR ${this.modoDetectado === 'oculus' ? '(Detectado)' : ''}
                    </button>
                    <button id="tabCtrlEspecies" style="${btnTabEstilo(this.pestanaActiva === 'especies')}">
                        🌱 4 Especies de Maíz y Clima
                    </button>
                </div>

                ${cuerpoHTML}

                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:2px solid rgba(255,255,255,0.16);gap:10px;flex-wrap:wrap;">
                    <span style="font-size:0.76rem;color:#94a3b8;">
                        💡 Puedes volver a abrir esta guía en cualquier momento desde el botón superior <b>🎮 Controles [?]</b>.
                    </span>
                    <button id="btnEntrarSimulador" style="padding:10px 22px;border-radius:0;border:3px solid;border-color:#86efac #14532d #14532d #86efac;background:#16a34a;color:#ffffff;font-weight:800;font-size:0.9rem;cursor:pointer;box-shadow:0 0 0 2px #000;font-family:var(--fuente-px);">
                        🌾 ¡Comenzar en la Milpa!
                    </button>
                </div>
            </div>
        `;

        this.modalEl.querySelector('#tabCtrlTeclado')?.addEventListener('click', () => {
            this.pestanaActiva = 'teclado';
            this.renderizarContenido();
        });
        this.modalEl.querySelector('#tabCtrlOculus')?.addEventListener('click', () => {
            this.pestanaActiva = 'oculus';
            this.renderizarContenido();
        });
        this.modalEl.querySelector('#tabCtrlEspecies')?.addEventListener('click', () => {
            this.pestanaActiva = 'especies';
            this.renderizarContenido();
        });
        this.modalEl.querySelector('#btnCerrarModalControlesX')?.addEventListener('click', () => {
            this.ocultar();
        });
        this.modalEl.querySelector('#btnEntrarSimulador')?.addEventListener('click', () => {
            this.ocultar();
        });
    }
}
