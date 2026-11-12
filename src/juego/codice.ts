import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';

export interface EntradaCodice {
    id: string;
    categoria: 'Razas Nativas' | 'Fenología' | 'Ecología Milpa' | 'Gastronomía' | 'Calendario Agrícola';
    titulo: string;
    icono: string;
    resumen: string;
    desbloqueada: boolean;
}

export const CATALOGO_CODICE_BASE: EntradaCodice[] = [
    // 1. Razas Nativas
    {
        id: 'raza_chalqueno',
        categoria: 'Razas Nativas',
        titulo: 'Maíz Chalqueño (Valles Altos)',
        icono: '🌽',
        resumen: 'Raza de porte alto (>3 m) y raíces de anclaje profundas adaptada a suelos volcánicos a más de 2,200 msnm.',
        desbloqueada: true
    },
    {
        id: 'raza_azul',
        categoria: 'Razas Nativas',
        titulo: 'Maíz Azul Mixteco (Antocianinas)',
        icono: '🫐',
        resumen: 'Sus granos contienen cianidina-3-glucósido, un antioxidante natural que protege del frío y la radiación UV.',
        desbloqueada: false
    },
    {
        id: 'raza_rojo',
        categoria: 'Razas Nativas',
        titulo: 'Maíz Rojo Sangre de Cristo',
        icono: '❤️',
        resumen: 'Pigmentación intensa en pericarpio y aleurona; muy apreciado en ceremonias de bendición de semillas.',
        desbloqueada: false
    },
    {
        id: 'raza_palomero',
        categoria: 'Razas Nativas',
        titulo: 'Palomero Toluqueño (Ancestral)',
        icono: '🍿',
        resumen: 'Raza milenaria de endospermo córneo cristalino capaz de reventar en flor (momochtli) al contacto con el comal.',
        desbloqueada: false
    },
    {
        id: 'raza_tuxpeno',
        categoria: 'Razas Nativas',
        titulo: 'Blanco Dentado Tuxpeño',
        icono: '🦷',
        resumen: 'Progenitor de gran productividad mundial; presenta una hendidura característica en la corona al secarse.',
        desbloqueada: false
    },
    // 2. Fenología
    {
        id: 'feno_emergencia',
        categoria: 'Fenología',
        titulo: 'VE — Emergencia del Coleóptilo',
        icono: '🌱',
        resumen: 'Tras acumular ~65 GDD, el coleóptilo perfora la superficie húmeda del montículo y despliega la primera hoja.',
        desbloqueada: true
    },
    {
        id: 'feno_vegetativo',
        categoria: 'Fenología',
        titulo: 'V2 a V14 — Crecimiento y Raíces Fulcreas',
        icono: '🌿',
        resumen: 'La planta forma entrenudos vigorosos y raíces de anclaje aéreas mientras compite con la maleza por luz y nitrógeno.',
        desbloqueada: false
    },
    {
        id: 'feno_floracion',
        categoria: 'Fenología',
        titulo: 'VT y R1 — Espigamiento y Jiloteo',
        icono: '🌼',
        resumen: 'La espiga masculina libera millones de granos de polen que caen sobre los cabellitos (estigmas) del jilote.',
        desbloqueada: false
    },
    {
        id: 'feno_madurez',
        categoria: 'Fenología',
        titulo: 'R6 — Madurez Fisiológica y Capa Negra',
        icono: '🌾',
        resumen: 'A los 145–163 días se forma la capa negra en la base del grano, indicando que la mazorca está lista para cosechar.',
        desbloqueada: false
    },
    // 3. Ecología Milpa
    {
        id: 'eco_tres_hermanas',
        categoria: 'Ecología Milpa',
        titulo: 'La Tríada Mesoamericana (Tres Hermanas)',
        icono: '🤝',
        resumen: 'El maíz da soporte al frijol, el frijol fija nitrógeno simbiótico con Rhizobium y la calabaza conserva la humedad.',
        desbloqueada: false
    },
    {
        id: 'eco_quelites',
        categoria: 'Ecología Milpa',
        titulo: 'Quelites (Quilitl): Hierbas Comestibles',
        icono: '🥬',
        resumen: 'No toda hierba espontánea es enemiga: el quintonil, epazote y verdolaga enriquecen la dieta campesina.',
        desbloqueada: false
    },
    {
        id: 'eco_aliados',
        categoria: 'Ecología Milpa',
        titulo: 'Control Biológico: Catarinas y Abejas',
        icono: '🐞',
        resumen: 'Las catarinas depredan al gusano cogollero y las abejas nativas aseguran el cuajado de calabaza y maíz.',
        desbloqueada: false
    },
    // 4. Gastronomía
    {
        id: 'gastro_nixtamal',
        categoria: 'Gastronomía',
        titulo: 'Química de la Nixtamalización',
        icono: '🏺',
        resumen: 'El cocimiento alcalino con cal viva libera la vitamina B3 (niacina), aporta calcio y permite formar masa elástica.',
        desbloqueada: false
    },
    {
        id: 'gastro_banquete',
        categoria: 'Gastronomía',
        titulo: 'Banquete de la Milpa en Comal',
        icono: '🫓',
        resumen: 'De las tortillas azules y esquites hasta el momochtli, la cocina tradicional transforma la biodiversidad en salud.',
        desbloqueada: false
    },
    // 5. Calendario Agrícola
    {
        id: 'cal_candelaria',
        categoria: 'Calendario Agrícola',
        titulo: '2 de Febrero: Bendición de las Semillas',
        icono: '🕯️',
        resumen: 'Inicio del ciclo ritual agrícola donde se seleccionan y bendicen las mejores mazorcas para la nueva siembra.',
        desbloqueada: true
    },
    {
        id: 'cal_santa_cruz',
        categoria: 'Calendario Agrícola',
        titulo: '3 de Mayo: Petición de Lluvias',
        icono: '🌧️',
        resumen: 'Con la llegada de las primeras lluvias de temporal se siembra la milpa y sus cultivos asociados.',
        desbloqueada: false
    },
    {
        id: 'cal_xilocruz',
        categoria: 'Calendario Agrícola',
        titulo: '29 de Septiembre: Xilocruz y Primeros Elotes',
        icono: '🎉',
        resumen: 'Fiesta de agradecimiento por los primeros elotes tiernos (R3) en la milpa.',
        desbloqueada: false
    },
    {
        id: 'cal_feria_semilla',
        categoria: 'Calendario Agrícola',
        titulo: 'Noviembre: Cosecha y Feria de la Semilla',
        icono: '🧺',
        resumen: 'Almacenamiento en troje, selección masal campesina e intercambio de semillas entre comunidades.',
        desbloqueada: false
    }
];

/**
 * M10: Códice Ilustrado del Maíz y Saberes de la Milpa
 * Atril 3D en el cobertizo (x = -1.1, z = -3.7) + visor interactivo [K] con persistencia en localStorage.
 */
export class CodiceMaiz {
    private static readonly STORAGE_KEY = 'milpaviva.codice.v1';

    private scene: Scene;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public raiz: TransformNode;
    public entradas: EntradaCodice[] = [];
    private modalEl: HTMLDivElement | null = null;
    public onMensajeToast?: (msg: string) => void;

    constructor(scene: Scene, audio: AudioSintetizador, bus: BusEventos) {
        this.scene = scene;
        this.audio = audio;
        this.bus = bus;

        this.raiz = new TransformNode('codiceMaizRoot', this.scene);
        this.raiz.position.set(-1.75, 0, -3.4);
        this.raiz.computeWorldMatrix(true);

        this.cargarProgreso();
        this.construirAtril3D();
        this.construirModalUI();
    }

    private cargarProgreso(): void {
        this.entradas = CATALOGO_CODICE_BASE.map((e) => ({ ...e }));
        try {
            const raw = localStorage.getItem(CodiceMaiz.STORAGE_KEY);
            if (raw) {
                const ids: string[] = JSON.parse(raw);
                for (const ent of this.entradas) {
                    if (ids.includes(ent.id)) ent.desbloqueada = true;
                }
            }
        } catch {
            // Ignorar si localStorage no disponible
        }
    }

    private guardarProgreso(): void {
        try {
            const ids = this.entradas.filter((e) => e.desbloqueada).map((e) => e.id);
            localStorage.setItem(CodiceMaiz.STORAGE_KEY, JSON.stringify(ids));
        } catch {
            // Ignorar
        }
    }

    public desbloquear(id: string): boolean {
        const ent = this.entradas.find((e) => e.id === id);
        if (!ent || ent.desbloqueada) return false;

        ent.desbloqueada = true;
        this.guardarProgreso();
        this.audio.campanita(this.raiz.position);
        this.bus.emitir({ t: 'codice', entradaId: id });
        if (this.onMensajeToast) {
            this.onMensajeToast(`📖 ¡Nueva página del Códice desbloqueada!: «${ent.titulo}»`);
        }
        this.actualizarModalUI();
        return true;
    }

    private construirAtril3D(): void {
        const colorContorno = Color3.FromHexString('#25330f');

        const matAtril = new StandardMaterial('matAtrilCodice', this.scene);
        matAtril.diffuseColor = Color3.FromHexString('#5d4037');
        matAtril.emissiveColor = Color3.FromHexString('#5d4037').scale(0.32);
        matAtril.specularColor = Color3.Black();

        const pedestal = MeshBuilder.CreateCylinder(
            'codicePedestal',
            { height: 0.95, diameterTop: 0.16, diameterBottom: 0.28, tessellation: 8 },
            this.scene
        );
        pedestal.position.y = 0.475;
        pedestal.material = matAtril;
        pedestal.parent = this.raiz;
        pedestal.computeWorldMatrix(true);
        pedestal.freezeWorldMatrix();

        const matPergamino = new StandardMaterial('matPergaminoCodice', this.scene);
        matPergamino.diffuseColor = Color3.FromHexString('#fef08a');
        matPergamino.emissiveColor = Color3.FromHexString('#facc15').scale(0.4);
        matPergamino.specularColor = Color3.Black();

        const libro = MeshBuilder.CreateBox(
            'codiceLibro3D',
            { width: 0.44, height: 0.05, depth: 0.32 },
            this.scene
        );
        libro.position.set(0, 0.98, 0);
        libro.rotation.x = -0.35;
        libro.material = matPergamino;
        libro.renderOutline = true;
        libro.outlineColor = colorContorno;
        libro.outlineWidth = 0.018;
        libro.parent = this.raiz;

        libro.isPickable = true;
        libro.actionManager = new ActionManager(this.scene);
        libro.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                this.alternarModal();
            })
        );
    }

    private construirModalUI(): void {
        if (typeof document === 'undefined') return;
        const modal = document.createElement('div');
        modal.id = 'codiceMaizModal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(28, 22, 14, 0.97); color: #fef3c7;
            border: 2px solid #eab308; border-radius: 16px;
            padding: 20px 24px; width: min(580px, 95vw); max-height: 82vh; overflow-y: auto;
            z-index: 2500; font-family: system-ui, sans-serif; display: none;
            box-shadow: 0 20px 55px rgba(0,0,0,0.88);
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
        const desbloqueadas = this.entradas.filter((e) => e.desbloqueada).length;

        const tarjetas = this.entradas
            .map((e) => {
                if (!e.desbloqueada) {
                    return `
                        <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:10px;border:1px dashed rgba(255,255,255,0.15);opacity:0.65;">
                            <div style="font-size:0.8rem;color:#a8a29e;">${e.categoria}</div>
                            <div style="font-weight:700;margin:3px 0;">🔒 Entrada por descubrir</div>
                            <div style="font-size:0.78rem;color:#78716c;">Explora la milpa, poliniza, cocina o avanza el calendario para desbloquear.</div>
                        </div>
                    `;
                }
                return `
                    <div style="background:rgba(234,179,8,0.12);padding:10px 12px;border-radius:10px;border:1px solid rgba(234,179,8,0.4);">
                        <div style="font-size:0.76rem;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;">${e.categoria}</div>
                        <div style="font-weight:700;font-size:0.95rem;margin:3px 0;color:#fef08a;">${e.icono} ${e.titulo}</div>
                        <div style="font-size:0.82rem;line-height:1.38;color:#fde68a;">${e.resumen}</div>
                    </div>
                `;
            })
            .join('');

        this.modalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div>
                    <h3 style="margin:0;color:#facc15;font-size:1.2rem;">📖 Códice Ilustrado del Maíz y la Milpa</h3>
                    <span style="font-size:0.82rem;color:#fcd34d;">Saberes desbloqueados: <b>${desbloqueadas} / ${this.entradas.length}</b></span>
                </div>
                <button id="btnCerrarCodice" style="background:none;border:none;color:#fde68a;font-size:1.3rem;cursor:pointer;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:10px;">
                ${tarjetas}
            </div>
        `;

        this.modalEl.querySelector('#btnCerrarCodice')?.addEventListener('click', () => {
            if (this.modalEl) this.modalEl.style.display = 'none';
        });
    }
}
