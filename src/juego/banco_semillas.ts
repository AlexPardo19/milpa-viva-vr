import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { RasgosHeredables, VARIEDADES_MAIZ, TipoSemilla } from '../nucleo';
import { SurcoMilpa } from '../surco_milpa';
import { CanastaRecoleccion3D } from '../vr/canasta_cosecha';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp, crearRng } from './util';
import { crearTexMaderaPixel } from '../ui/texturas_pixel_3d';

export interface LoteSemilla {
    id: string;
    raza: string;
    variedadBase?: TipoSemilla;
    generacion: number;
    semillaRng: number;
    rasgos: RasgosHeredables;
}

/**
 * Función pura de herencia campesina (M9):
 * Aplica deriva controlada (±0.05) + sesgo direccional (+0.03) hacia el enfoque seleccionado,
 * acotando todos los rasgos al intervalo biológicamente estable [0.80, 1.20].
 */
export function heredar(
    padre: LoteSemilla,
    enfoque: keyof RasgosHeredables,
    rng: () => number
): LoteSemilla {
    const mutar = (v: number, esFoco: boolean) => {
        const sesgo = esFoco ? 0.03 : 0;
        const ruido = (rng() - 0.5) * 0.10; // ±0.05
        return Number(clamp(v + sesgo + ruido, 0.80, 1.20).toFixed(3));
    };

    return {
        id: `${padre.raza}-G${padre.generacion + 1}-${Math.floor(rng() * 1e6)}`,
        raza: padre.raza,
        variedadBase: padre.variedadBase || 'chalqueno',
        generacion: padre.generacion + 1,
        semillaRng: Math.floor(rng() * 1e9),
        rasgos: {
            rVigor: mutar(padre.rasgos.rVigor, enfoque === 'rVigor'),
            rSequia: mutar(padre.rasgos.rSequia, enfoque === 'rSequia'),
            rFrio: mutar(padre.rasgos.rFrio, enfoque === 'rFrio'),
            rCiclo: mutar(padre.rasgos.rCiclo, enfoque === 'rCiclo'),
            rTamano: mutar(padre.rasgos.rTamano, enfoque === 'rTamano')
        }
    };
}

const LOTES_FUNDADORES = (): LoteSemilla[] => [
    {
        id: 'Chalqueno-G1-Base',
        raza: 'Maíz Chalqueño',
        variedadBase: 'chalqueno',
        generacion: 1,
        semillaRng: 104729,
        rasgos: { rVigor: 1.02, rSequia: 1.0, rFrio: 1.04, rCiclo: 1.0, rTamano: 1.03 }
    },
    {
        id: 'AzulConico-G1-Base',
        raza: 'Maíz Azul Cónico',
        variedadBase: 'azul',
        generacion: 1,
        semillaRng: 221943,
        rasgos: { rVigor: 1.0, rSequia: 1.02, rFrio: 1.08, rCiclo: 1.04, rTamano: 1.0 }
    },
    {
        id: 'RojoSangre-G1-Base',
        raza: 'Maíz Rojo (Cónico Norteño)',
        variedadBase: 'rojo',
        generacion: 1,
        semillaRng: 318207,
        rasgos: { rVigor: 1.01, rSequia: 1.08, rFrio: 0.96, rCiclo: 1.02, rTamano: 1.0 }
    },
    {
        id: 'PalomeroTol-G1-Base',
        raza: 'Palomero Toluqueño',
        variedadBase: 'palomero',
        generacion: 1,
        semillaRng: 451981,
        rasgos: { rVigor: 1.0, rSequia: 1.0, rFrio: 1.05, rCiclo: 1.06, rTamano: 0.98 }
    }
];

/**
 * M9: Banco de Semillas, Selección Masal Campesina, Desgranado y Feria de Trueque (v4.1)
 * - Requiere mazorcas cosechadas reales para selección masal, trueque y desgranado (+6 semillas).
 * - Los rasgos genéticos se aplican únicamente a nuevas siembras (sin mutar plantas ya vivas).
 */
export class BancoSemillas {
    private static readonly STORAGE_KEY = 'milpaviva.banco.v1';

    private scene: Scene;
    private surco: SurcoMilpa;
    private canasta: CanastaRecoleccion3D | null;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public raiz: TransformNode;
    public lotes: LoteSemilla[] = [];
    public loteActivoIndex: number = 0;

    private modalEl: HTMLDivElement | null = null;
    public onMensajeToast?: (msg: string) => void;
    public onConsumirMazorca?: (variedadPreferida?: string) => { exito: boolean; variedad?: string; calidad: number; madurez?: string };
    public onEntregarSemillas?: (variedad: TipoSemilla, cantidad: number) => number;
    public onContarMazorcas?: () => number;

    constructor(
        scene: Scene,
        surco: SurcoMilpa,
        canasta: CanastaRecoleccion3D | null,
        audio: AudioSintetizador,
        bus: BusEventos
    ) {
        this.scene = scene;
        this.surco = surco;
        this.canasta = canasta;
        this.audio = audio;
        this.bus = bus;

        this.raiz = new TransformNode('bancoSemillasRoot', this.scene);
        this.raiz.position.set(-3.1, 0, -3.4);
        this.raiz.computeWorldMatrix(true);

        this.cargarLotes();
        this.construirMesa3D();
        this.construirModalUI();
    }

    private cargarLotes(): void {
        try {
            const raw = localStorage.getItem(BancoSemillas.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.lotes = parsed.map((l: any) => ({
                        ...l,
                        variedadBase: this.inferirVariedad(l.variedadBase || l.raza)
                    }));
                    return;
                }
            }
        } catch {
            // Fallback a lotes fundadores
        }
        this.lotes = LOTES_FUNDADORES();
        this.guardarLotes();
    }

    private inferirVariedad(nombre?: string): TipoSemilla {
        const s = (nombre || '').toLowerCase();
        if (s.includes('azul')) return 'azul';
        if (s.includes('rojo') || s.includes('sangre')) return 'rojo';
        if (s.includes('palomero')) return 'palomero';
        return 'chalqueno';
    }

    public guardarLotes(): void {
        try {
            localStorage.setItem(BancoSemillas.STORAGE_KEY, JSON.stringify(this.lotes.slice(0, 12)));
        } catch {
            // Ignorar si storage restringido
        }
    }

    public reiniciar(): void {
        this.lotes = LOTES_FUNDADORES();
        this.loteActivoIndex = 0;
        this.guardarLotes();
        this.actualizarModalUI();
    }

    public exportarSnapshot(): { lotes: LoteSemilla[]; loteActivoIndex: number } {
        return {
            lotes: this.lotes.map((l) => ({ ...l, rasgos: { ...l.rasgos } })),
            loteActivoIndex: this.loteActivoIndex
        };
    }

    public restaurarSnapshot(lotes?: LoteSemilla[] | null, activoIdx = 0): void {
        if (Array.isArray(lotes) && lotes.length > 0) {
            this.lotes = lotes.map((l) => ({
                ...l,
                variedadBase: this.inferirVariedad(l.variedadBase || l.raza),
                rasgos: { ...l.rasgos }
            }));
            this.loteActivoIndex = clamp(activoIdx, 0, this.lotes.length - 1);
        } else {
            this.lotes = LOTES_FUNDADORES();
            this.loteActivoIndex = 0;
        }
        this.guardarLotes();
        this.actualizarModalUI();
    }

    public obtenerLoteActivo(): LoteSemilla {
        return this.lotes[this.loteActivoIndex] || this.lotes[0];
    }

    public obtenerRasgosParaVariedad(variedad: TipoSemilla): RasgosHeredables {
        const activo = this.obtenerLoteActivo();
        if (activo && activo.variedadBase === variedad) {
            return { ...activo.rasgos };
        }
        const match = this.lotes.find((l) => l.variedadBase === variedad);
        return match ? { ...match.rasgos } : { ...activo.rasgos };
    }

    /** Mantenido por compatibilidad: ya NO muta retroactivamente plantas vivas en el surco */
    public aplicarLoteActivoASurco(): void {
        // Los rasgos heredados se aplican exclusivamente al sembrar nuevas semillas en SurcoMilpa.sembrar().
    }

    private consumirMazorcaRequerida(variedadPreferida?: string): { exito: boolean; variedad?: string; calidad: number; madurez?: string } {
        if (this.onConsumirMazorca) {
            return this.onConsumirMazorca(variedadPreferida);
        }
        if (this.canasta && this.canasta.retirarMazorca()) {
            return { exito: true, variedad: variedadPreferida || 'chalqueno', calidad: this.canasta.calidadPromedio };
        }
        return { exito: false, calidad: 0 };
    }

    /**
     * Desgrana 1 mazorca cosechada para obtener +6 semillas criollas de esa variedad
     */
    public desgranarMazorcaASemillas(): { exito: boolean; mensaje: string } {
        const padre = this.obtenerLoteActivo();
        const cob = this.consumirMazorcaRequerida(padre.variedadBase);
        if (!cob.exito) {
            const msg = '🌽 Necesitas al menos 1 mazorca cosechada (en mochila o troje) para desgranar semillas.';
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }
        const varDest = this.inferirVariedad(cob.variedad);
        const cantSemillas = cob.madurez === 'grano_seco' ? 8 : 5;
        const entregadas = this.onEntregarSemillas ? this.onEntregarSemillas(varDest, cantSemillas) : cantSemillas;
        this.audio.semillas(this.raiz.position);
        const msg =
            cob.madurez === 'grano_seco'
                ? `🌰 ¡Mazorca seca (R6) desgranada! Obtuviste +${entregadas} semillas viables de ${VARIEDADES_MAIZ[varDest].nombre}.`
                : `🌰 ¡Mazorca desgranada! Obtuviste +${entregadas} semillas de ${VARIEDADES_MAIZ[varDest].nombre} (dejar secar a R6 rinde +8).`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.actualizarModalUI();
        return { exito: true, mensaje: msg };
    }

    /**
     * Selecciona una mazorca cosechada real para generar una nueva generación (G+1) con mejora genética
     */
    public seleccionarSemillaNuevaGeneracion(enfoque: keyof RasgosHeredables): { exito: boolean; lote?: LoteSemilla; mensaje: string } {
        const padre = this.obtenerLoteActivo();
        const cob = this.consumirMazorcaRequerida(padre.variedadBase);
        if (!cob.exito) {
            const msg = '🌽 Necesitas al menos 1 mazorca cosechada (en mochila o troje) para hacer Selección Masal.';
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }

        const rng = crearRng(padre.semillaRng + this.lotes.length * 7919 + (Date.now() % 10000));
        const nuevoLote = heredar(padre, enfoque, rng);
        // Bono leve si se usó mazorca seca R6 de alta calidad
        if (cob.calidad >= 0.85) {
            nuevoLote.rasgos[enfoque] = Number(clamp(nuevoLote.rasgos[enfoque] + 0.02, 0.80, 1.20).toFixed(3));
        }

        this.lotes.unshift(nuevoLote);
        if (this.lotes.length > 10) this.lotes.pop();
        this.loteActivoIndex = 0;
        this.guardarLotes();

        // Entregar +4 semillas seleccionadas de la nueva generación
        const varBase = this.inferirVariedad(nuevoLote.variedadBase || nuevoLote.raza);
        this.onEntregarSemillas?.(varBase, 4);

        this.audio.campanita(this.raiz.position);
        this.bus.emitir({
            t: 'semillaGuardada',
            lote: nuevoLote.id,
            raza: nuevoLote.raza,
            generacion: nuevoLote.generacion
        });

        const msg = `🧬 ¡Selección Masal exitosa! Nuevo lote ${nuevoLote.id} (Gen ${nuevoLote.generacion}, +4 semillas) enfocado en ${enfoque}.`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.actualizarModalUI();
        return { exito: true, lote: nuevoLote, mensaje: msg };
    }

    /**
     * Trueque en la Feria de la Semilla: intercambia 1 mazorca cosechada por un lote élite de resistencia
     */
    public realizarTruequeFeria(): { exito: boolean; mensaje: string } {
        const cob = this.consumirMazorcaRequerida();
        if (!cob.exito) {
            const msg = '🤝 Para hacer trueque en la Feria de la Semilla debes aportar al menos 1 mazorca cosechada.';
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }

        const rng = crearRng(Date.now());
        const razasFeria: { nombre: string; base: TipoSemilla }[] = [
            { nombre: 'Chalqueño Alteño (Feria)', base: 'chalqueno' },
            { nombre: 'Azul Cónico de Volcán (Feria)', base: 'azul' },
            { nombre: 'Rojo Secano Élite (Feria)', base: 'rojo' },
            { nombre: 'Palomero Ancestral (Feria)', base: 'palomero' }
        ];
        const elegida = razasFeria[Math.floor(rng() * razasFeria.length)];

        const nuevo: LoteSemilla = {
            id: `${elegida.base.toUpperCase()}-G2-${Math.floor(rng() * 900 + 100)}`,
            raza: elegida.nombre,
            variedadBase: elegida.base,
            generacion: 2,
            semillaRng: Math.floor(rng() * 1e8),
            rasgos: {
                rVigor: Number((1.05 + rng() * 0.12).toFixed(2)),
                rSequia: Number((1.05 + rng() * 0.12).toFixed(2)),
                rFrio: Number((1.04 + rng() * 0.12).toFixed(2)),
                rCiclo: Number((1.02 + rng() * 0.12).toFixed(2)),
                rTamano: Number((1.04 + rng() * 0.12).toFixed(2))
            }
        };

        this.lotes.unshift(nuevo);
        if (this.lotes.length > 10) this.lotes.pop();
        this.loteActivoIndex = 0;
        this.guardarLotes();
        const varBase = this.inferirVariedad(nuevo.variedadBase || nuevo.raza);
        this.onEntregarSemillas?.(varBase, 6);
        this.audio.cosecharExito(this.raiz.position);
        this.bus.emitir({ t: 'semillaGuardada', lote: nuevo.id, raza: nuevo.raza, generacion: nuevo.generacion });

        const msg = `🤝 ¡Trueque en la Feria de la Semilla! Recibiste «${nuevo.raza}» (+6 semillas).`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.actualizarModalUI();
        return { exito: true, mensaje: msg };
    }

    private construirMesa3D(): void {
        const colorContorno = Color3.FromHexString('#25330f');

        const matMadera = new StandardMaterial('matMesaSemillas', this.scene);
        matMadera.diffuseTexture = crearTexMaderaPixel(this.scene, false, 2, 1);
        matMadera.diffuseColor = Color3.FromHexString('#d7b998');
        matMadera.emissiveColor = Color3.FromHexString('#4a3222').scale(0.32);
        matMadera.specularColor = Color3.Black();

        const mesa = MeshBuilder.CreateBox(
            'bancoMesaMadera',
            { width: 1.35, height: 0.78, depth: 0.75 },
            this.scene
        );
        mesa.position.y = 0.39;
        mesa.material = matMadera;
        mesa.parent = this.raiz;
        mesa.computeWorldMatrix(true);
        mesa.freezeWorldMatrix();

        const coloresFrascos = ['#facc15', '#3b82f6', '#ef4444', '#f8fafc'];
        for (let i = 0; i < 4; i++) {
            const matF = new StandardMaterial(`matFrascoSem_${i}`, this.scene);
            matF.diffuseColor = Color3.FromHexString(coloresFrascos[i]);
            matF.emissiveColor = Color3.FromHexString(coloresFrascos[i]).scale(0.38);
            matF.specularColor = Color3.Black();

            const frasco = MeshBuilder.CreateCylinder(
                `bancoFrasco_${i}`,
                { height: 0.22, diameter: 0.16, tessellation: 10 },
                this.scene
            );
            frasco.position.set(-0.42 + i * 0.28, 0.89, 0);
            frasco.material = matF;
            frasco.renderOutline = true;
            frasco.outlineColor = colorContorno;
            frasco.outlineWidth = 0.015;
            frasco.parent = this.raiz;

            frasco.isPickable = true;
            frasco.actionManager = new ActionManager(this.scene);
            frasco.actionManager.registerAction(
                new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                    this.alternarModal();
                })
            );
        }
    }

    private construirModalUI(): void {
        if (typeof document === 'undefined') return;
        const modal = document.createElement('div');
        modal.id = 'bancoSemillasModal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(16, 26, 16, 0.96); color: #ecfdf5;
            border: 4px solid; border-color: #34d399 #064e3b #064e3b #34d399; border-radius: 0;
            padding: 18px 22px; width: min(680px, 95vw); max-height: 88vh; overflow-y: auto; z-index: 2800;
            font-family: var(--fuente-px); display: none;
            box-shadow: 0 0 0 4px #000000;
        `;
        document.body.appendChild(modal);
        this.modalEl = modal;
        this.actualizarModalUI();
    }

    public alternarModal(): void {
        if (!this.modalEl) return;
        const visible = this.modalEl.style.display === 'block';
        this.modalEl.style.display = visible ? 'none' : 'block';
        if (!visible) this.actualizarModalUI();
    }

    public actualizarModalUI(): void {
        if (!this.modalEl) return;
        const lote = this.obtenerLoteActivo();
        const r = lote.rasgos;
        const mazorcasDisp = this.onContarMazorcas ? this.onContarMazorcas() : (this.canasta?.totalCosechados ?? 0);

        const opcionesLotes = this.lotes
            .map(
                (l, idx) =>
                    `<option value="${idx}" ${idx === this.loteActivoIndex ? 'selected' : ''}>🌽 ${l.raza} — Gen ${l.generacion} (${l.id})</option>`
            )
            .join('');

        const barra = (etiqueta: string, valor: number) => {
            const pct = Math.round(((valor - 0.8) / 0.4) * 100);
            return `
                <div style="margin-bottom:5px;font-size:0.80rem;">
                    <div style="display:flex;justify-content:space-between;">
                        <span>${etiqueta}</span><b>×${valor.toFixed(2)}</b>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.12);border-radius:0;overflow:hidden;">
                        <div style="width:${clamp(pct, 5, 100)}%;height:100%;background:#10b981;"></div>
                    </div>
                </div>
            `;
        };

        const fichasEspecies = (Object.keys(VARIEDADES_MAIZ) as TipoSemilla[])
            .map((k) => {
                const v = VARIEDADES_MAIZ[k];
                return `
                    <div style="background:rgba(0,0,0,0.28);border:2px solid #14532d;border-left:5px solid ${v.colorHex};padding:8px 10px;border-radius:0;margin-bottom:6px;font-size:0.77rem;line-height:1.35;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                            <strong style="color:#fcd34d;font-size:0.84rem;">🌽 ${v.nombre} — <em>${v.especieBotanica}</em></strong>
                            <span style="color:#94a3b8;font-size:0.72rem;">Techo: ${v.alturaMetrosMax.toFixed(1)} m · ${v.rendimientoPotencialTonHa}</span>
                        </div>
                        <div style="color:#cbd5e1;margin-top:2px;">🧬 <b>Grano:</b> ${v.tipoEndospermo} · ${v.hilerasMazorca} · 1000g: ${v.pesoMilGranosG} g</div>
                        <div style="color:#bae6fd;margin-top:2px;">⏱️ <b>Ciclo:</b> Flor ${v.diasFloracionEst} · Elote R3 ${v.diasEloteR3Est} (~${v.humedadCosechaElotePct}%H) · Seco R6 ${v.diasMadurezR6Est} (≤${v.humedadCosechaGranoPct}%H)</div>
                        <div style="color:#a7f3d0;margin-top:2px;">✅ <b>Favorable:</b> ${v.condicionesFavorables}</div>
                        <div style="color:#fca5a5;margin-top:2px;">⚠️ <b>Perjudica:</b> ${v.queLePerjudica}</div>
                    </div>
                `;
            })
            .join('');

        this.modalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #064e3b;padding-bottom:6px;">
                <div>
                    <h3 style="margin:0;color:#34d399;font-size:1.1rem;">🧬 Banco Campesino de Semillas y Ficha de Razas</h3>
                    <span style="font-size:0.78rem;color:#fde68a;">🌽 Mazorcas disponibles para selección/desgranado: <b>${mazorcasDisp}</b></span>
                </div>
                <button id="btnCerrarBanco" style="background:#dc2626;border:2px solid;border-color:#fca5a5 #7f1d1d #7f1d1d #fca5a5;border-radius:0;color:#fff;font-size:1rem;cursor:pointer;padding:2px 8px;font-weight:700;">✕</button>
            </div>
            <div style="margin-bottom:10px;">
                <div style="font-size:0.82rem;color:#6ee7b7;font-weight:700;margin-bottom:5px;">🌿 Razas Nativas, Morfología y Ventanas de Cosecha:</div>
                ${fichasEspecies}
            </div>
            <label style="display:block;font-size:0.82rem;color:#6ee7b7;margin-bottom:4px;">Lote Genético Activo para Nuevas Siembras:</label>
            <select id="selLoteSemilla" style="width:100%;padding:7px;border-radius:0;background:#112214;color:#ecfdf5;border:2px solid #059669;margin-bottom:10px;font-family:var(--fuente-px);">
                ${opcionesLotes}
            </select>
            <div style="background:rgba(255,255,255,0.06);border:2px solid #064e3b;padding:8px 12px;border-radius:0;margin-bottom:10px;">
                ${barra('🌱 Vigor Vegetativo (rVigor)', r.rVigor)}
                ${barra('💧 Tolerancia a Sequía (rSequia)', r.rSequia)}
                ${barra('❄️ Tolerancia a Helada (rFrio)', r.rFrio)}
                ${barra('⏱️ Velocidad de Ciclo (rCiclo)', r.rCiclo)}
                ${barra('🌽 Tamaño de Mazorca (rTamano)', r.rTamano)}
            </div>
            <div style="font-size:0.78rem;color:#a7f3d0;margin-bottom:6px;">
                Selección Masal (cuesta 1 mazorca cosechada → crea Gen+1 y entrega +4 semillas):
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                <button data-foco="rVigor" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#6ee7b7 #064e3b #064e3b #6ee7b7;background:#059669;color:#fff;cursor:pointer;font-size:0.76rem;font-family:var(--fuente-px);">+Vigor</button>
                <button data-foco="rSequia" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#7dd3fc #075985 #075985 #7dd3fc;background:#0284c7;color:#fff;cursor:pointer;font-size:0.76rem;font-family:var(--fuente-px);">+Sequía</button>
                <button data-foco="rFrio" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#a5b4fc #312e81 #312e81 #a5b4fc;background:#4f46e5;color:#fff;cursor:pointer;font-size:0.76rem;font-family:var(--fuente-px);">+Frío</button>
                <button data-foco="rCiclo" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#f9a8d4 #831843 #831843 #f9a8d4;background:#be185d;color:#fff;cursor:pointer;font-size:0.76rem;font-family:var(--fuente-px);">+Ciclo</button>
                <button data-foco="rTamano" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#fcd34d #78350f #78350f #fcd34d;background:#d97706;color:#fff;cursor:pointer;font-size:0.76rem;font-family:var(--fuente-px);">+Mazorca</button>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="btnDesgranarMazorca" style="flex:1;padding:8px;border-radius:0;border:2px solid #facc15;background:rgba(202,138,4,0.25);color:#fef9c3;font-weight:700;cursor:pointer;font-size:0.80rem;font-family:var(--fuente-px);">
                    🌰 Desgranar 1 Mazorca (+5 a +8 Semillas)
                </button>
                <button id="btnTruequeFeria" style="flex:1;padding:8px;border-radius:0;border:2px solid #34d399;background:rgba(16,185,129,0.22);color:#ecfdf5;font-weight:700;cursor:pointer;font-size:0.80rem;font-family:var(--fuente-px);">
                    🤝 Trueque Feria (1 Mazorca → Lote Élite)
                </button>
            </div>
        `;

        this.modalEl.querySelector('#btnCerrarBanco')?.addEventListener('click', () => {
            if (this.modalEl) this.modalEl.style.display = 'none';
        });

        this.modalEl.querySelector('#selLoteSemilla')?.addEventListener('change', (e) => {
            this.loteActivoIndex = parseInt((e.target as HTMLSelectElement).value, 10) || 0;
            this.actualizarModalUI();
        });

        this.modalEl.querySelectorAll('.btnFocoGen').forEach((btn) => {
            btn.addEventListener('click', () => {
                const foco = (btn as HTMLElement).getAttribute('data-foco') as keyof RasgosHeredables;
                if (foco) this.seleccionarSemillaNuevaGeneracion(foco);
            });
        });

        this.modalEl.querySelector('#btnDesgranarMazorca')?.addEventListener('click', () => {
            this.desgranarMazorcaASemillas();
        });

        this.modalEl.querySelector('#btnTruequeFeria')?.addEventListener('click', () => {
            this.realizarTruequeFeria();
        });
    }
}
