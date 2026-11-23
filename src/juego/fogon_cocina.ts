import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    Mesh,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { CanastaRecoleccion3D } from '../vr/canasta_cosecha';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp01 } from './util';
import { crearTexPiedraPixel } from '../ui/texturas_pixel_3d';
import { VARIEDADES_MAIZ, TipoSemilla } from '../nucleo';

export type EtapaCocina = 'ESPERA' | 'NIXTAMAL' | 'MOLIENDA' | 'FORMADO' | 'COMAL' | 'LISTO';

export interface RecetaTradicional {
    id: string;
    nombre: string;
    icono: string;
    razaPreferida?: TipoSemilla;
    madurezPreferida?: 'elote' | 'grano_seco';
    requiereQuelite?: boolean;
    requiereFrijol?: boolean;
    requiereCalabaza?: boolean;
    requiereHuitlacoche?: boolean;
    explicacionCientifica: string;
}

export const RECETAS_MILPA: RecetaTradicional[] = [
    {
        id: 'tortilla_azul',
        nombre: 'Tortillas de Maíz Azul Nixtamalizado',
        icono: '🫓',
        razaPreferida: 'azul',
        madurezPreferida: 'grano_seco',
        explicacionCientifica:
            'La nixtamalización con cal viva Ca(OH)₂ gelatiniza el almidón, libera Niacina (Vitamina B3) y conserva las antocianinas antioxidantes del Maíz Azul Cónico.'
    },
    {
        id: 'elote_asado',
        nombre: 'Elote Asado al Carbón con Chile y Limón',
        icono: '🌽',
        razaPreferida: 'chalqueno',
        madurezPreferida: 'elote',
        explicacionCientifica:
            'Cosechado en etapa R3 (grano lechoso ~73% humedad), los azúcares solubles aún no se polimerizan en almidón rígido, dando su dulzor jugoso característico.'
    },
    {
        id: 'esquites_epazote',
        nombre: 'Esquites Tradicionales con Quelites y Epazote',
        icono: '🥣',
        madurezPreferida: 'elote',
        requiereQuelite: true,
        explicacionCientifica:
            'Los granos tiernos hervidos con quelites y epazote aportan hierro, betacarotenos, omega-3 y aminoácidos esenciales.'
    },
    {
        id: 'palomitas_momochtli',
        nombre: 'Momochtli (Palomitas Prehispánicas)',
        icono: '🍿',
        razaPreferida: 'palomero',
        madurezPreferida: 'grano_seco',
        explicacionCientifica:
            'El pericarpio vítreo ultraduro del Palomero Toluqueño seco (~14% humedad) actúa como olla de presión microscópica: a 180 °C el vapor expande el endospermo.'
    },
    {
        id: 'tamal_hoja',
        nombre: 'Tamal de Maíz Rojo en Totomoxtle',
        icono: '🫔',
        razaPreferida: 'rojo',
        madurezPreferida: 'grano_seco',
        explicacionCientifica:
            'Las brácteas secas (totomoxtle) conservan el vapor durante la cocción y perfuman la masa nixtamalizada rica en flavonoides del Maíz Rojo.'
    },
    {
        id: 'quesadilla_flor',
        nombre: 'Quesadilla de Flor de Calabaza y Quelites',
        icono: '🥟',
        requiereCalabaza: true,
        explicacionCientifica:
            'Combina la masa nixtamalizada con flores de Cucurbita pepo ricas en ácido fólico, vitamina A y antioxidantes.'
    },
    {
        id: 'quesadilla_huitlacoche',
        nombre: 'Quesadilla Gourmet de Huitlacoche y Epazote',
        icono: '🍄',
        requiereHuitlacoche: true,
        explicacionCientifica:
            'El huitlacoche (Ustilago maydis) enriquece el maíz con lisina, betaglucanos y sabor umami terroso: ejemplo único de micología gastronómica mexicana.'
    },
    {
        id: 'plato_tres_hermanas',
        nombre: 'Banquete «Las Tres Hermanas» (Maíz, Frijol y Calabaza)',
        icono: '🍲',
        requiereFrijol: true,
        requiereCalabaza: true,
        explicacionCientifica:
            'Sinergia nutricional completa: el maíz aporta metionina y el frijol ayocote aporta lisina y triptófano, formando una proteína vegetal completa.'
    }
];

/**
 * M8: Del Surco al Comal — Fogón de Cocina Tradicional 3D (v4.1)
 * - Consume mazorcas cosechadas reales conservando su variedad y madurez (afinidad real).
 * - Consume ingredientes asociados (quelite, frijol, calabaza, huitlacoche) y persiste recetas descubiertas.
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
    public variedadMazorcaActual: TipoSemilla = 'chalqueno';
    public madurezMazorcaActual: 'elote' | 'grano_seco' = 'elote';
    public platosPreparados: string[] = [];

    private masaMesh!: Mesh;
    private tortillaComalMesh!: Mesh;
    private modalEl: HTMLDivElement | null = null;

    public onMensajeToast?: (msg: string) => void;
    public onConsumirMazorcaAlmacen?: (variedadPreferida?: string) => {
        exito: boolean;
        variedad?: string;
        calidad: number;
        madurez?: 'elote' | 'grano_seco';
    };
    public onContarDespensa?: () => {
        mazorcas: number;
        quelites: number;
        frijol: number;
        calabaza: number;
        huitlacoche: number;
    };
    public onConsumirIngrediente?: (tipo: 'quelite' | 'frijol' | 'calabaza' | 'huitlacoche') => boolean;

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
        this.raiz.position.set(3.05, 0, -3.4); // Desplazado +0.25m al este para paso limpio junto al cobertizo
        this.raiz.computeWorldMatrix(true);

        this.construirEstacion3D();
        this.construirModalUI();
    }

    public reiniciar(): void {
        this.etapa = 'ESPERA';
        this.platosPreparados = [];
        this.masaMesh.setEnabled(false);
        this.tortillaComalMesh.setEnabled(false);
        this.actualizarModalUI();
    }

    public exportarPlatos(): string[] {
        return [...this.platosPreparados];
    }

    public restaurarPlatos(platos?: string[] | null): void {
        this.etapa = 'ESPERA';
        this.platosPreparados = Array.isArray(platos) ? [...platos] : [];
        this.masaMesh.setEnabled(false);
        this.tortillaComalMesh.setEnabled(false);
        this.actualizarModalUI();
    }

    private construirEstacion3D(): void {
        const colorContorno = Color3.FromHexString('#25330f');

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

        // 3. Brasas encendidas + Comal de barro (derecha)
        const matBrasas = new StandardMaterial('matBrasasFogon', this.scene);
        matBrasas.diffuseColor = Color3.FromHexString('#ea580c');
        matBrasas.emissiveColor = Color3.FromHexString('#f97316').scale(0.95);
        matBrasas.specularColor = Color3.Black();
        matBrasas.metadata = { esEmisivoReal: true };
        const brasas = MeshBuilder.CreateCylinder(
            'fogonBrasas',
            { height: 0.03, diameter: 0.34, tessellation: 10 },
            this.scene
        );
        brasas.position.set(0.46, 0.795, 0);
        brasas.material = matBrasas;
        brasas.parent = this.raiz;

        const comal = MeshBuilder.CreateCylinder(
            'fogonComal',
            { height: 0.025, diameter: 0.44, tessellation: 14 },
            this.scene
        );
        comal.position.set(0.46, 0.825, 0);
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
        this.tortillaComalMesh.position.set(0.46, 0.845, 0);
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

    private normalizarVariedad(raw?: string): TipoSemilla {
        const s = (raw || '').toLowerCase();
        if (s.includes('azul')) return 'azul';
        if (s.includes('rojo') || s.includes('sangre')) return 'rojo';
        if (s.includes('palomero')) return 'palomero';
        return 'chalqueno';
    }

    private obtenerDespensa() {
        if (this.onContarDespensa) return this.onContarDespensa();
        return {
            mazorcas: this.canasta?.totalCosechados ?? 0,
            quelites: this.canasta?.quelites ?? 0,
            frijol: this.canasta?.frijol ?? 0,
            calabaza: this.canasta?.calabaza ?? 0,
            huitlacoche: 0
        };
    }

    /**
     * Avanza un paso en la máquina de estados culinaria:
     * ESPERA -> NIXTAMAL -> MOLIENDA -> FORMADO -> COMAL -> ESPERA (platillo servido)
     */
    public avanzarPasoInteractivo(): { exito: boolean; mensaje: string } {
        const posAudio = this.raiz.position;

        if (this.etapa === 'ESPERA') {
            const desp = this.obtenerDespensa();
            const rec = this.recetaSeleccionada;

            // Validar ingredientes especiales requeridos antes de consumir la mazorca
            if (rec.requiereHuitlacoche && desp.huitlacoche <= 0) {
                const msg = '🍄 Necesitas Huitlacoche cosechado (surge en floración con alta humedad relativa) para esta quesadilla.';
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: false, mensaje: msg };
            }

            // Consumir mazorca cosechada real (priorizando la raza preferida de la receta)
            let obtenida = false;
            if (this.onConsumirMazorcaAlmacen) {
                const res = this.onConsumirMazorcaAlmacen(rec.razaPreferida);
                if (res.exito) {
                    obtenida = true;
                    this.variedadMazorcaActual = this.normalizarVariedad(res.variedad);
                    this.calidadMazorcaActual = res.calidad;
                    this.madurezMazorcaActual = res.madurez ?? 'elote';
                }
            } else if (this.canasta && this.canasta.retirarMazorca()) {
                obtenida = true;
                this.variedadMazorcaActual = 'chalqueno';
                this.calidadMazorcaActual = this.canasta.calidadPromedio;
                this.madurezMazorcaActual = 'elote';
            }

            if (!obtenida) {
                const msg = '🌽 Necesitas cosechar al menos 1 mazorca real en la milpa antes de encender el Fogón.';
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: false, mensaje: msg };
            }

            // Consumir ingredientes complementarios si están disponibles
            if (rec.requiereQuelite) this.onConsumirIngrediente?.('quelite');
            if (rec.requiereFrijol) this.onConsumirIngrediente?.('frijol');
            if (rec.requiereCalabaza) this.onConsumirIngrediente?.('calabaza');
            if (rec.requiereHuitlacoche) this.onConsumirIngrediente?.('huitlacoche');

            this.etapa = 'NIXTAMAL';
            this.audio.regarAgua(posAudio);
            this.actualizarModalUI();
            const nomVar = VARIEDADES_MAIZ[this.variedadMazorcaActual].nombre;
            const msg = `🏺 Paso 1 (Nixtamalización): Cociendo ${nomVar} (${this.madurezMazorcaActual === 'grano_seco' ? 'grano seco R6' : 'elote tierno R3'}) con agua y cal Ca(OH)₂.`;
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
            this.tortillaComalMesh.setEnabled(false);
            const calidadPlato = this.calcularCalidadPlato();
            const esNueva = !this.platosPreparados.includes(this.recetaSeleccionada.id);
            if (esNueva) {
                this.platosPreparados.push(this.recetaSeleccionada.id);
            }
            this.audio.cosecharExito(posAudio);
            this.bus.emitir({
                t: 'cocinado',
                receta: this.recetaSeleccionada.id,
                calidad: calidadPlato
            });
            const estrellas = '⭐'.repeat(Math.max(1, Math.round(calidadPlato * 5)));
            const msg = `${this.recetaSeleccionada.icono} ¡Platillo servido! «${this.recetaSeleccionada.nombre}» (${estrellas}) — ${this.recetaSeleccionada.explicacionCientifica}`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            this.etapa = 'ESPERA';
            this.actualizarModalUI();
            return { exito: true, mensaje: msg };
        }

        this.etapa = 'ESPERA';
        return { exito: true, mensaje: 'Fogón listo para una nueva receta.' };
    }

    private calcularCalidadPlato(): number {
        const rec = this.recetaSeleccionada;
        const afinidadRaza = !rec.razaPreferida || this.variedadMazorcaActual === rec.razaPreferida ? 1.0 : 0.78;
        const afinidadMadurez = !rec.madurezPreferida || this.madurezMazorcaActual === rec.madurezPreferida ? 1.0 : 0.85;
        return clamp01(0.5 * this.calidadMazorcaActual + 0.3 * afinidadRaza + 0.2 * afinidadMadurez);
    }

    private construirModalUI(): void {
        if (typeof document === 'undefined') return;
        const modal = document.createElement('div');
        modal.id = 'fogonCocinaModal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(28, 17, 10, 0.96); color: #fef3c7;
            border: 4px solid; border-color: #fbbf24 #78350f #78350f #fbbf24;
            border-radius: 0; padding: 20px 24px; width: min(540px, 95vw); max-height: 88vh; overflow-y: auto; z-index: 2800;
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

        const d = this.obtenerDespensa();
        const rec = this.recetaSeleccionada;

        const etiquetasPasos: Record<EtapaCocina, string> = {
            ESPERA: '🏺 1. Nixtamalizar Grano en Olla de Barro',
            NIXTAMAL: '🪨 2. Moler Nixtamal en Metate Volcánico',
            MOLIENDA: '👏 3. Tortear Masa e Integrar Milpa',
            FORMADO: '🔥 4. Cocer en el Comal de Barro',
            COMAL: '🍽️ 5. Servir Platillo Tradicional',
            LISTO: '✨ ¡Platillo Servido! Iniciar Otro'
        };

        const opcionesRecetas = RECETAS_MILPA.map((r) => {
            const hecha = this.platosPreparados.includes(r.id) ? ' ✓' : '';
            return `<option value="${r.id}" ${r.id === rec.id ? 'selected' : ''}>${r.icono} ${r.nombre}${hecha}</option>`;
        }).join('');

        const reqs: string[] = [];
        if (rec.razaPreferida) reqs.push(`Raza ideal: <b>${VARIEDADES_MAIZ[rec.razaPreferida].nombre}</b>`);
        if (rec.madurezPreferida) reqs.push(`Punto ideal: <b>${rec.madurezPreferida === 'grano_seco' ? 'Grano Seco (R6)' : 'Elote Tierno (R3)'}</b>`);
        if (rec.requiereQuelite) reqs.push('🌿 Quelites');
        if (rec.requiereFrijol) reqs.push('🫘 Frijol Ayocote');
        if (rec.requiereCalabaza) reqs.push('🎃 Calabaza / Flor');
        if (rec.requiereHuitlacoche) reqs.push('🍄 Huitlacoche (obligatorio)');

        this.modalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #78350f;padding-bottom:6px;">
                <h3 style="margin:0;color:#fbbf24;font-size:1.12rem;">🔥 Fogón Tradicional: Del Surco al Comal</h3>
                <button id="btnCerrarFogon" style="background:#dc2626;border:2px solid;border-color:#fca5a5 #7f1d1d #7f1d1d #fca5a5;border-radius:0;color:#fff;font-size:1rem;cursor:pointer;padding:2px 8px;font-weight:700;">✕</button>
            </div>
            <div style="font-size:0.82rem;background:rgba(255,255,255,0.07);border:2px solid #78350f;padding:8px 12px;border-radius:0;margin-bottom:10px;">
                🧺 <b>Despensa Disponible:</b> 🌽 ${d.mazorcas} Mazorcas · 🌿 ${d.quelites} Quelites · 🫘 ${d.frijol} Frijol · 🎃 ${d.calabaza} Calabaza · 🍄 ${d.huitlacoche} Huitlacoche
            </div>
            <label style="display:block;font-size:0.85rem;margin-bottom:5px;color:#fcd34d;">Selecciona Receta Tradicional:</label>
            <select id="selRecetaFogon" style="width:100%;padding:8px;border-radius:0;background:#291d12;color:#fef3c7;border:2px solid #d97706;margin-bottom:8px;font-size:0.9rem;font-family:var(--fuente-px);">
                ${opcionesRecetas}
            </select>
            ${reqs.length > 0 ? `<div style="font-size:0.78rem;color:#fed7aa;margin-bottom:8px;">📋 ${reqs.join(' · ')}</div>` : ''}
            <div style="font-size:0.83rem;line-height:1.4;color:#fde68a;background:rgba(245,158,11,0.14);border:2px solid rgba(245,158,11,0.45);padding:10px;border-radius:0;margin-bottom:14px;">
                🔬 <b>Ciencia Culinaria:</b> ${rec.explicacionCientifica}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:0.82rem;color:#d97706;">Paso: <b>${this.etapa}</b> (${this.platosPreparados.length}/${RECETAS_MILPA.length} platillos)</span>
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
            const nuevaRec = RECETAS_MILPA.find((r) => r.id === val);
            if (nuevaRec) {
                this.recetaSeleccionada = nuevaRec;
                this.actualizarModalUI();
            }
        });

        this.modalEl.querySelector('#btnPasoFogon')?.addEventListener('click', () => {
            this.avanzarPasoInteractivo();
        });
    }
}
