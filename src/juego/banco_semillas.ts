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

/**
 * M9: Banco de Semillas, Selección Masal Campesina y Feria de Trueque
 * Mesa 3D en el cobertizo (x = -2.2, z = -3.6) con persistencia en localStorage ('milpaviva.banco.v1').
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
        this.aplicarLoteActivoASurco();
    }

    private cargarLotes(): void {
        try {
            const raw = localStorage.getItem(BancoSemillas.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.lotes = parsed;
                    return;
                }
            }
        } catch {
            // Fallback a lotes fundadores
        }

        this.lotes = [
            {
                id: 'Chalqueno-G1-Base',
                raza: 'Chalqueño Criollo',
                generacion: 1,
                semillaRng: 104729,
                rasgos: { rVigor: 1.02, rSequia: 1.0, rFrio: 1.05, rCiclo: 1.0, rTamano: 1.03 }
            },
            {
                id: 'Azul-G1-Mixteco',
                raza: 'Azul Mixteco',
                generacion: 1,
                semillaRng: 221943,
                rasgos: { rVigor: 1.0, rSequia: 1.08, rFrio: 1.04, rCiclo: 0.96, rTamano: 1.0 }
            }
        ];
        this.guardarLotes();
    }

    public guardarLotes(): void {
        try {
            localStorage.setItem(BancoSemillas.STORAGE_KEY, JSON.stringify(this.lotes.slice(0, 12)));
        } catch {
            // Ignorar si storage restringido
        }
    }

    public obtenerLoteActivo(): LoteSemilla {
        return this.lotes[this.loteActivoIndex] || this.lotes[0];
    }

    /**
     * Inyecta los rasgos heredables del lote activo en las plantas de la hilera
     */
    public aplicarLoteActivoASurco(): void {
        const lote = this.obtenerLoteActivo();
        if (!lote) return;
        for (const nodo of this.surco.nodos) {
            nodo.plantaInterna.rasgosHeredados = { ...lote.rasgos };
        }
    }

    /**
     * Selecciona una mazorca cosechada para generar una nueva generación (G+1) con mejora genética
     */
    public seleccionarSemillaNuevaGeneracion(enfoque: keyof RasgosHeredables): { exito: boolean; lote?: LoteSemilla; mensaje: string } {
        const padre = this.obtenerLoteActivo();
        const rng = crearRng(padre.semillaRng + this.lotes.length * 7919 + Date.now() % 10000);
        const nuevoLote = heredar(padre, enfoque, rng);

        this.lotes.unshift(nuevoLote);
        if (this.lotes.length > 10) this.lotes.pop();
        this.loteActivoIndex = 0;
        this.guardarLotes();
        this.aplicarLoteActivoASurco();

        this.audio.campanita(this.raiz.position);
        this.bus.emitir({
            t: 'semillaGuardada',
            lote: nuevoLote.id,
            raza: nuevoLote.raza,
            generacion: nuevoLote.generacion
        });

        const msg = `🧬 ¡Selección Masal Campesina exitosa! Creado lote ${nuevoLote.id} (Gen ${nuevoLote.generacion}) enfocado en ${enfoque}.`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.actualizarModalUI();
        return { exito: true, lote: nuevoLote, mensaje: msg };
    }

    /**
     * Trueque en la Feria de la Semilla: intercambia cosecha por un lote élite de resistencia
     */
    public realizarTruequeFeria(): { exito: boolean; mensaje: string } {
        const rng = crearRng(Date.now());
        const razasFeria = ['Serrano Alteño', 'Cacahuazintle', 'Olotillo Tardío', 'Zapalote Chico'];
        const razaElegida = razasFeria[Math.floor(rng() * razasFeria.length)];

        const nuevo: LoteSemilla = {
            id: `${razaElegida.split(' ')[0]}-G2-${Math.floor(rng() * 900 + 100)}`,
            raza: razaElegida,
            generacion: 2,
            semillaRng: Math.floor(rng() * 1e8),
            rasgos: {
                rVigor: Number((1.05 + rng() * 0.12).toFixed(2)),
                rSequia: Number((1.05 + rng() * 0.12).toFixed(2)),
                rFrio: Number((1.04 + rng() * 0.12).toFixed(2)),
                rCiclo: Number((0.92 + rng() * 0.12).toFixed(2)),
                rTamano: Number((1.05 + rng() * 0.12).toFixed(2))
            }
        };

        this.lotes.unshift(nuevo);
        this.loteActivoIndex = 0;
        this.guardarLotes();
        this.aplicarLoteActivoASurco();
        this.audio.cosecharExito(this.raiz.position);
        this.bus.emitir({ t: 'semillaGuardada', lote: nuevo.id, raza: nuevo.raza, generacion: nuevo.generacion });

        const msg = `🤝 ¡Trueque en la Feria de la Semilla! Obtuviste «${nuevo.raza}» (${nuevo.id}).`;
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

        // 4 Frascos de semillas criollas con mazorcas colgadas (mancuernas)
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
            padding: 18px 22px; width: min(640px, 94vw); max-height: 86vh; overflow-y: auto; z-index: 2500;
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
                    <div style="background:rgba(0,0,0,0.28);border:2px solid #14532d;border-left:5px solid ${v.colorHex};padding:8px 10px;border-radius:0;margin-bottom:6px;font-size:0.78rem;line-height:1.35;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <strong style="color:#fcd34d;font-size:0.84rem;">🌽 ${v.nombre} — <em>${v.especieBotanica}</em></strong>
                            <span style="color:#94a3b8;font-size:0.72rem;">Techo: ${v.alturaMetrosMax.toFixed(1)} m</span>
                        </div>
                        <div style="color:#a7f3d0;margin-top:2px;">✅ <b>Favorable:</b> ${v.condicionesFavorables}</div>
                        <div style="color:#fca5a5;margin-top:2px;">⚠️ <b>Perjudica:</b> ${v.queLePerjudica}</div>
                    </div>
                `;
            })
            .join('');

        this.modalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #064e3b;padding-bottom:6px;">
                <h3 style="margin:0;color:#34d399;font-size:1.1rem;">🧬 Banco Campesino de Semillas y Ficha de Especies</h3>
                <button id="btnCerrarBanco" style="background:#dc2626;border:2px solid;border-color:#fca5a5 #7f1d1d #7f1d1d #fca5a5;border-radius:0;color:#fff;font-size:1rem;cursor:pointer;padding:2px 8px;font-weight:700;">✕</button>
            </div>
            <div style="margin-bottom:10px;">
                <div style="font-size:0.82rem;color:#6ee7b7;font-weight:700;margin-bottom:5px;">🌿 Especies Botánicas y Condiciones Agroclimáticas:</div>
                ${fichasEspecies}
            </div>
            <label style="display:block;font-size:0.82rem;color:#6ee7b7;margin-bottom:4px;">Lote Genético Activo para Siembra:</label>
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
            <div style="font-size:0.80rem;color:#a7f3d0;margin-bottom:6px;">
                Selecciona el rasgo a mejorar para la siguiente generación (Selección Masal):
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                <button data-foco="rVigor" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#6ee7b7 #064e3b #064e3b #6ee7b7;background:#059669;color:#fff;cursor:pointer;font-size:0.78rem;font-family:var(--fuente-px);">+Vigor</button>
                <button data-foco="rSequia" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#7dd3fc #075985 #075985 #7dd3fc;background:#0284c7;color:#fff;cursor:pointer;font-size:0.78rem;font-family:var(--fuente-px);">+Sequía</button>
                <button data-foco="rFrio" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#a5b4fc #312e81 #312e81 #a5b4fc;background:#4f46e5;color:#fff;cursor:pointer;font-size:0.78rem;font-family:var(--fuente-px);">+Frío</button>
                <button data-foco="rTamano" class="btnFocoGen" style="flex:1;padding:6px;border-radius:0;border:2px solid;border-color:#fcd34d #78350f #78350f #fcd34d;background:#d97706;color:#fff;cursor:pointer;font-size:0.78rem;font-family:var(--fuente-px);">+Mazorca</button>
            </div>
            <button id="btnTruequeFeria" style="width:100%;padding:8px;border-radius:0;border:2px solid #34d399;background:rgba(16,185,129,0.22);color:#ecfdf5;font-weight:700;cursor:pointer;font-size:0.82rem;font-family:var(--fuente-px);">
                🤝 Feria de la Semilla: Realizar Trueque Campesino
            </button>
        `;

        this.modalEl.querySelector('#btnCerrarBanco')?.addEventListener('click', () => {
            if (this.modalEl) this.modalEl.style.display = 'none';
        });

        this.modalEl.querySelector('#selLoteSemilla')?.addEventListener('change', (e) => {
            this.loteActivoIndex = parseInt((e.target as HTMLSelectElement).value, 10) || 0;
            this.aplicarLoteActivoASurco();
            this.actualizarModalUI();
        });

        this.modalEl.querySelectorAll('.btnFocoGen').forEach((btn) => {
            btn.addEventListener('click', () => {
                const foco = (btn as HTMLElement).getAttribute('data-foco') as keyof RasgosHeredables;
                if (foco) this.seleccionarSemillaNuevaGeneracion(foco);
            });
        });

        this.modalEl.querySelector('#btnTruequeFeria')?.addEventListener('click', () => {
            this.realizarTruequeFeria();
        });
    }
}
