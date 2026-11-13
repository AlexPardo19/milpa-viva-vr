import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    Vector3,
    Mesh,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { CanastaRecoleccion3D } from '../vr/canasta_cosecha';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp01 } from './util';
import { crearTexPiedraPixel } from '../ui/texturas_pixel_3d';

export type EtapaCocina = 'ESPERA' | 'NIXTAMAL' | 'MOLIENDA' | 'FORMADO' | 'COMAL' | 'LISTO';

export interface RecetaTradicional {
    id: string;
    nombre: string;
    icono: string;
    razaPreferida?: string; // Nombre parcial o color de raza ideal
    requiereQuelite?: boolean;
    requiereFrijol?: boolean;
    requiereCalabaza?: boolean;
    explicacionCientifica: string;
}

export const RECETAS_MILPA: RecetaTradicional[] = [
    {
        id: 'tortilla_azul',
        nombre: 'Tortillas de Maíz Azul Nixtamalizado',
        icono: '🫓',
        razaPreferida: 'Azul',
        explicacionCientifica:
            'La nixtamalización con hidróxido de calcio (cal) gelatiniza el almidón, libera la Niacina (Vitamina B3) previniendo la pelagra y multiplica el calcio biodisponible.'
    },
    {
        id: 'elote_asado',
        nombre: 'Elote Asado al Carbón con Chile y Limón',
        icono: '🌽',
        razaPreferida: 'Chalqueño',
        explicacionCientifica:
            'Cosechado en etapa R3 (grano lechoso), los azúcares solubles aún no se han polimerizado del todo en almidón rígido, dándole su dulzor jugoso.'
    },
    {
        id: 'esquites_epazote',
        nombre: 'Esquites Tradicionales con Quelites',
        icono: '🥣',
        requiereQuelite: true,
        explicacionCientifica:
            'Los granos tiernos hervidos con quelites de la milpa aportan hierro, betacarotenos y aminoácidos esenciales.'
    },
    {
        id: 'palomitas_momochtli',
        nombre: 'Momochtli (Palomitas Prehispánicas)',
        icono: '🍿',
        razaPreferida: 'Palomero',
        explicacionCientifica:
            'El pericarpio vítreo ultraduro del Maíz Palomero Toluqueño actúa como olla de presión microscópica: a 180 °C la humedad interna (14%) vaporiza y expande el endospermo.'
    },
    {
        id: 'tamal_hoja',
        nombre: 'Tamal de Masa Colada en Totomoxtle',
        icono: '🫔',
        razaPreferida: 'Tuxpeño',
        explicacionCientifica:
            'Las brácteas secas de la mazorca (totomoxtle) conservan el vapor durante la cocción y perfuman la masa nixtamalizada.'
    },
    {
        id: 'quesadilla_flor',
        nombre: 'Quesadilla de Flor de Calabaza y Quelites',
        icono: '🥟',
        requiereCalabaza: true,
        explicacionCientifica:
            'Combina la masa nixtamalizada con las flores de Cucurbita pepo ricas en ácido fólico y antioxidantes.'
    },
    {
        id: 'plato_tres_hermanas',
        nombre: 'Banquete «Las Tres Hermanas» (Maíz, Frijol y Calabaza)',
        icono: '🍲',
        requiereFrijol: true,
        requiereCalabaza: true,
        explicacionCientifica:
            'Sinergia nutricional completa: el maíz aporta metionina y el frijol aporta lisina y triptófano, formando una proteína vegetal de alto valor biológico.'
    }
];

/**
 * M8: Del Surco al Comal — Fogón de Cocina Tradicional 3D
 * Estación culinaria interactiva junto al cobertizo (x = 2.8, z = -3.4) con:
 * - Olla de barro para Nixtamalización
 * - Metate de piedra volcánica para molienda
 * - Comal de barro sobre brasas para cocción
 */
export class FogonCocina {
    private scene: Scene;
    private canasta: CanastaRecoleccion3D | null;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public raiz: TransformNode;
    public etapa: EtapaCocina = 'ESPERA';
    public recetaSeleccionada: RecetaTradicional = RECETAS_MILPA[0];
    public calidadMazorcaActual: number = 0.85;
    public variedadMazorcaActual: string = 'Maíz Criollo';
    public platosPreparados: string[] = [];

    private masaMesh!: Mesh;
    private tortillaComalMesh!: Mesh;
    private modalEl: HTMLDivElement | null = null;

    public onMensajeToast?: (msg: string) => void;
    public onConsumirMazorcaAlmacen?: () => { exito: boolean; calidad: number };

    constructor(
        scene: Scene,
        canasta: CanastaRecoleccion3D | null,
        audio: AudioSintetizador,
        bus: BusEventos
    ) {
        this.scene = scene;
        this.canasta = canasta;
        this.audio = audio;
        this.bus = bus;

        this.raiz = new TransformNode('fogonCocinaRoot', this.scene);
        this.raiz.position.set(2.8, 0, -3.4);
        this.raiz.computeWorldMatrix(true);

        this.construirEstacion3D();
        this.construirModalUI();
    }

    private construirEstacion3D(): void {
        const colorContorno = Color3.FromHexString('#25330f');

        // Mesa rústica de piedra/adobe pixel-art para el fogón
        const matAdobe = new StandardMaterial('matAdobeFogon', this.scene);
        matAdobe.diffuseTexture = crearTexPiedraPixel(this.scene, 2, 1);
        matAdobe.diffuseColor = Color3.FromHexString('#d6bfa9');
        matAdobe.emissiveColor = Color3.FromHexString('#4a3931').scale(0.35);
        matAdobe.specularColor = Color3.Black();

        const baseMesa = MeshBuilder.CreateBox(
            'fogonBaseMesa',
            { width: 1.5, height: 0.78, depth: 0.85 },
            this.scene
        );
        baseMesa.position.y = 0.39;
        baseMesa.material = matAdobe;
        baseMesa.parent = this.raiz;
        baseMesa.computeWorldMatrix(true);
        baseMesa.freezeWorldMatrix();

        // 1. Olla de barro de Nixtamal (izquierda)
        const matBarro = new StandardMaterial('matBarroOlla', this.scene);
        matBarro.diffuseColor = Color3.FromHexString('#bf360c');
        matBarro.emissiveColor = Color3.FromHexString('#bf360c').scale(0.35);
        matBarro.specularColor = Color3.Black();

        const olla = MeshBuilder.CreateSphere(
            'fogonOllaNixtamal',
            { diameter: 0.36, segments: 10 },
            this.scene
        );
        olla.position.set(-0.46, 0.92, 0);
        olla.material = matBarro;
        olla.renderOutline = true;
        olla.outlineColor = colorContorno;
        olla.outlineWidth = 0.018;
        olla.parent = this.raiz;
        this.registrarClick(olla, () => this.avanzarPasoInteractivo());

        // 2. Metate de piedra volcánica (centro)
        const matPiedra = new StandardMaterial('matPiedraMetate', this.scene);
        matPiedra.diffuseColor = Color3.FromHexString('#424242');
        matPiedra.emissiveColor = Color3.FromHexString('#424242').scale(0.32);
        matPiedra.specularColor = Color3.Black();

        const metate = MeshBuilder.CreateBox(
            'fogonMetate',
            { width: 0.38, height: 0.08, depth: 0.28 },
            this.scene
        );
        metate.position.set(0, 0.83, 0);
        metate.rotation.x = 0.12;
        metate.material = matPiedra;
        metate.renderOutline = true;
        metate.outlineColor = colorContorno;
        metate.outlineWidth = 0.016;
        metate.parent = this.raiz;
        this.registrarClick(metate, () => this.avanzarPasoInteractivo());

        // Bola de masa nixtamalizada sobre el metate
        const matMasa = new StandardMaterial('matMasaMaiz', this.scene);
        matMasa.diffuseColor = Color3.FromHexString('#fff59d');
        matMasa.emissiveColor = Color3.FromHexString('#fff59d').scale(0.4);
        matMasa.specularColor = Color3.Black();

        this.masaMesh = MeshBuilder.CreateSphere(
            'fogonMasaMesh',
            { diameter: 0.14, segments: 8 },
            this.scene
        );
        this.masaMesh.position.set(0, 0.9, 0);
        this.masaMesh.material = matMasa;
        this.masaMesh.parent = this.raiz;
        this.masaMesh.setEnabled(false);

        // 3. Comal de barro sobre brasas (derecha)
        const comal = MeshBuilder.CreateCylinder(
            'fogonComal',
            { height: 0.025, diameter: 0.44, tessellation: 14 },
            this.scene
        );
        comal.position.set(0.46, 0.82, 0);
        comal.material = matPiedra;
        comal.renderOutline = true;
        comal.outlineColor = colorContorno;
        comal.outlineWidth = 0.016;
        comal.parent = this.raiz;
        this.registrarClick(comal, () => this.avanzarPasoInteractivo());

        this.tortillaComalMesh = MeshBuilder.CreateCylinder(
            'fogonTortillaMesh',
            { height: 0.015, diameter: 0.22, tessellation: 12 },
            this.scene
        );
        this.tortillaComalMesh.position.set(0.46, 0.84, 0);
        this.tortillaComalMesh.material = matMasa;
        this.tortillaComalMesh.parent = this.raiz;
        this.tortillaComalMesh.setEnabled(false);
    }

    private registrarClick(malla: Mesh, accion: () => void): void {
        malla.isPickable = true;
        malla.actionManager = new ActionManager(this.scene);
        malla.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => accion())
        );
    }

    /**
     * Avanza un paso en la máquina de estados culinaria:
     * ESPERA -> NIXTAMAL -> MOLIENDA -> FORMADO -> COMAL -> LISTO
     */
    public avanzarPasoInteractivo(): { exito: boolean; mensaje: string } {
        const posAudio = this.raiz.position;

        if (this.etapa === 'ESPERA') {
            // Intentar tomar mazorca de la canasta, luego del Almacén/Troje, o usar grano de reserva educativa
            const tieneMazorca = this.canasta ? this.canasta.retirarMazorca() : false;
            if (tieneMazorca && this.canasta) {
                this.variedadMazorcaActual = 'Maíz Cosechado en Mano';
                this.calidadMazorcaActual = this.canasta.calidadPromedio;
            } else if (this.onConsumirMazorcaAlmacen) {
                const delAlmacen = this.onConsumirMazorcaAlmacen();
                if (delAlmacen.exito) {
                    this.variedadMazorcaActual = 'Maíz de tu Troje / Almacén';
                    this.calidadMazorcaActual = delAlmacen.calidad;
                } else {
                    this.variedadMazorcaActual = 'Maíz Criollo de Reserva';
                    this.calidadMazorcaActual = 0.82;
                }
            } else {
                this.variedadMazorcaActual = 'Maíz Criollo de Reserva';
                this.calidadMazorcaActual = 0.82;
            }

            this.etapa = 'NIXTAMAL';
            this.audio.regarAgua(posAudio);
            this.actualizarModalUI();
            const msg = `🏺 Paso 1 (Nixtamalización): Cociendo granos de ${this.variedadMazorcaActual} en agua con cal viva (Ca(OH)₂).`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }

        if (this.etapa === 'NIXTAMAL') {
            this.etapa = 'MOLIENDA';
            this.masaMesh.setEnabled(true);
            this.masaMesh.scaling.setAll(1.0);
            this.audio.raspadoMetate(posAudio);
            this.actualizarModalUI();
            const msg = `🪨 Paso 2 (Molienda en Metate): Moliendo el nixtamal sobre piedra volcánica para obtener masa fresca.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }

        if (this.etapa === 'MOLIENDA') {
            this.etapa = 'FORMADO';
            this.masaMesh.scaling.set(1.3, 0.45, 1.3);
            this.audio.palmada(posAudio);
            this.actualizarModalUI();
            const msg = `👏 Paso 3 (Formado): Torteando la masa a mano e integrando ingredientes de la milpa.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }

        if (this.etapa === 'FORMADO') {
            this.etapa = 'COMAL';
            this.masaMesh.setEnabled(false);
            this.tortillaComalMesh.setEnabled(true);
            if (this.recetaSeleccionada.id === 'palomitas_momochtli') {
                this.audio.reventarPalomita(posAudio);
            } else {
                this.audio.chisporroteo(posAudio);
            }
            this.actualizarModalUI();
            const msg = `🔥 Paso 4 (Cocción en Comal): Cociendo «${this.recetaSeleccionada.nombre}» sobre el comal de barro.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }

        if (this.etapa === 'COMAL') {
            this.etapa = 'LISTO';
            this.tortillaComalMesh.setEnabled(false);
            const calidadPlato = this.calcularCalidadPlato();
            if (!this.platosPreparados.includes(this.recetaSeleccionada.id)) {
                this.platosPreparados.push(this.recetaSeleccionada.id);
            }
            this.audio.cosecharExito(posAudio);
            this.bus.emitir({
                t: 'cocinado',
                receta: this.recetaSeleccionada.id,
                calidad: calidadPlato
            });
            this.actualizarModalUI();
            const estrellas = '⭐'.repeat(Math.max(1, Math.round(calidadPlato * 5)));
            const msg = `${this.recetaSeleccionada.icono} ¡Platillo listo! «${this.recetaSeleccionada.nombre}» (${estrellas}) — ${this.recetaSeleccionada.explicacionCientifica}`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            this.etapa = 'ESPERA';
            this.actualizarModalUI();
            return { exito: true, mensaje: msg };
        }

        this.etapa = 'ESPERA';
        return { exito: true, mensaje: 'Fogón listo para una nueva receta.' };
    }

    private calcularCalidadPlato(): number {
        let afinidadRaza = 0.85;
        if (
            this.recetaSeleccionada.razaPreferida &&
            this.variedadMazorcaActual.toLowerCase().includes(this.recetaSeleccionada.razaPreferida.toLowerCase())
        ) {
            afinidadRaza = 1.0;
        }
        let bonoIngredientes = 0.85;
        if (this.canasta) {
            if (this.recetaSeleccionada.requiereQuelite && this.canasta.quelites > 0) bonoIngredientes = 1.0;
            if (this.recetaSeleccionada.requiereFrijol && this.canasta.frijol > 0) bonoIngredientes = 1.0;
            if (this.recetaSeleccionada.requiereCalabaza && this.canasta.calabaza > 0) bonoIngredientes = 1.0;
        }
        return clamp01(
            0.5 * this.calidadMazorcaActual + 0.3 * afinidadRaza + 0.2 * bonoIngredientes
        );
    }

    private construirModalUI(): void {
        if (typeof document === 'undefined') return;
        const modal = document.createElement('div');
        modal.id = 'fogonCocinaModal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(28, 17, 10, 0.96); color: #fef3c7;
            border: 4px solid; border-color: #fbbf24 #78350f #78350f #fbbf24;
            border-radius: 0; padding: 20px 24px; width: min(500px, 94vw); z-index: 2500;
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

        const mazorcasCanasta = this.canasta ? this.canasta.totalCosechados : 0;
        const quelites = this.canasta ? this.canasta.quelites : 0;
        const frijol = this.canasta ? this.canasta.frijol : 0;
        const calabaza = this.canasta ? this.canasta.calabaza : 0;

        const etiquetasPasos: Record<EtapaCocina, string> = {
            ESPERA: '🏺 1. Nixtamalizar Grano en Olla de Barro',
            NIXTAMAL: '🪨 2. Moler Nixtamal en Metate Volcánico',
            MOLIENDA: '👏 3. Tortear Masa e Integrar Milpa',
            FORMADO: '🔥 4. Cocer en el Comal de Barro',
            COMAL: '🍽️ 5. Servir Platillo Tradicional',
            LISTO: '✨ ¡Platillo Servido! Iniciar Otro'
        };

        const opcionesRecetas = RECETAS_MILPA.map(
            (r) =>
                `<option value="${r.id}" ${r.id === this.recetaSeleccionada.id ? 'selected' : ''}>${r.icono} ${r.nombre}</option>`
        ).join('');

        this.modalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #78350f;padding-bottom:6px;">
                <h3 style="margin:0;color:#fbbf24;font-size:1.15rem;">🔥 Fogón Tradicional: Del Surco al Comal</h3>
                <button id="btnCerrarFogon" style="background:#dc2626;border:2px solid;border-color:#fca5a5 #7f1d1d #7f1d1d #fca5a5;border-radius:0;color:#fff;font-size:1rem;cursor:pointer;padding:2px 8px;font-weight:700;">✕</button>
            </div>
            <div style="font-size:0.85rem;background:rgba(255,255,255,0.07);border:2px solid #78350f;padding:8px 12px;border-radius:0;margin-bottom:12px;">
                🧺 <b>Despensa de tu Canasta:</b> 🌽 ${mazorcasCanasta} Mazorcas | 🌿 ${quelites} Quelites | 🫘 ${frijol} Frijol | 🎃 ${calabaza} Calabaza
            </div>
            <label style="display:block;font-size:0.88rem;margin-bottom:6px;color:#fcd34d;">Selecciona Receta Tradicional:</label>
            <select id="selRecetaFogon" style="width:100%;padding:8px;border-radius:0;background:#291d12;color:#fef3c7;border:2px solid #d97706;margin-bottom:12px;font-size:0.92rem;font-family:var(--fuente-px);">
                ${opcionesRecetas}
            </select>
            <div style="font-size:0.85rem;line-height:1.4;color:#fde68a;background:rgba(245,158,11,0.14);border:2px solid rgba(245,158,11,0.45);padding:10px;border-radius:0;margin-bottom:14px;">
                🔬 <b>Ciencia Culinaria:</b> ${this.recetaSeleccionada.explicacionCientifica}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                <span style="font-size:0.82rem;color:#d97706;">Estado: <b>${this.etapa}</b> (${this.platosPreparados.length}/7 recetas descubiertas)</span>
                <button id="btnPasoFogon" style="padding:10px 16px;border-radius:0;border:2px solid;border-color:#fef08a #92400e #92400e #fef08a;background:#f59e0b;color:#1c1917;font-weight:700;cursor:pointer;font-family:var(--fuente-px);">
                    ${etiquetasPasos[this.etapa]}
                </button>
            </div>
        `;

        this.modalEl.querySelector('#btnCerrarFogon')?.addEventListener('click', () => {
            if (this.modalEl) this.modalEl.style.display = 'none';
        });

        this.modalEl.querySelector('#selRecetaFogon')?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            const rec = RECETAS_MILPA.find((r) => r.id === val);
            if (rec) {
                this.recetaSeleccionada = rec;
                this.actualizarModalUI();
            }
        });

        this.modalEl.querySelector('#btnPasoFogon')?.addEventListener('click', () => {
            this.avanzarPasoInteractivo();
        });
    }
}
