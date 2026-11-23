import { BusEventos, EventoJuego } from './bus_eventos';
import { CodiceMaiz } from './codice';
import { AudioSintetizador } from '../audio_sintetizador';

export interface MisionMilpa {
    id: string;
    categoria: 'Guiada' | 'Estacional' | 'Maestría';
    titulo: string;
    descripcion: string;
    progreso: number;
    meta: number;
    completada: boolean;
    codicePremio?: string;
}

export interface MisionesSnapshot {
    progresoPorId: Record<string, { progreso: number; completada: boolean }>;
    triadaCultivos: string[];
    hitoCalendarioActual: string;
}

const MISIONES_BASE: Omit<MisionMilpa, 'progreso' | 'completada'>[] = [
    {
        id: 'mis_primer_surco',
        categoria: 'Guiada',
        titulo: 'Labranza y Siembra del Surco',
        descripcion: 'Ara con la azada [2] y siembra tu primera semilla nativa en la hilera.',
        meta: 1,
        codicePremio: 'feno_vegetativo'
    },
    {
        id: 'mis_tres_hermanas',
        categoria: 'Guiada',
        titulo: 'Alianza de las Tres Hermanas',
        descripcion: 'Asocia tanto Frijol Ayocote [B] como Calabaza Criolla [N] junto a tu maíz.',
        meta: 2,
        codicePremio: 'eco_tres_hermanas'
    },
    {
        id: 'mis_quelites',
        categoria: 'Estacional',
        titulo: 'Cosecha de Quelites y Control Biológico',
        descripcion: 'Arranca maleza/quelites de raíz [X] o retira una plaga activa de la milpa.',
        meta: 2,
        codicePremio: 'eco_quelites'
    },
    {
        id: 'mis_polinizacion',
        categoria: 'Estacional',
        titulo: 'Lluvia Dorada de Polen',
        descripcion: 'Sacude la espiga en floración [P] (VT–R2) para asegurar el llenado completo de granos.',
        meta: 1,
        codicePremio: 'feno_floracion'
    },
    {
        id: 'mis_clima',
        categoria: 'Estacional',
        titulo: 'Guardián del Clima de la Milpa',
        descripcion: 'Supera un evento meteorológico protegiendo tus cultivos (Petate [G], Tutor [T], drenaje [2] o riego [7]).',
        meta: 1,
        codicePremio: 'cal_santa_cruz'
    },
    {
        id: 'mis_comal',
        categoria: 'Maestría',
        titulo: 'Del Surco al Comal: Nixtamalización',
        descripcion: 'Cosecha una mazorca y prepara un platillo tradicional en el Fogón de Cocina [F].',
        meta: 1,
        codicePremio: 'gastro_nixtamal'
    },
    {
        id: 'mis_seleccion_semilla',
        categoria: 'Maestría',
        titulo: 'Guardián de Semillas Criollas',
        descripcion: 'Realiza selección masal o trueque con una mazorca cosechada en el Banco de Semillas [M].',
        meta: 1,
        codicePremio: 'cal_feria_semilla'
    }
];

/**
 * M10: Sistema de Misiones, Retos de Maestría y Calendario Ritual Agrícola (v4.1)
 */
export class MisionesSistema {
    private bus: BusEventos;
    private codice: CodiceMaiz;
    private audio: AudioSintetizador;

    public misiones: MisionMilpa[] = [];
    private triadaCultivos = new Set<string>();

    public hitoCalendarioActual: string = '🕯️ 2 de Febrero: Bendición de Semillas';
    public onActualizarUI?: () => void;
    public onMensajeToast?: (msg: string) => void;

    constructor(bus: BusEventos, codice: CodiceMaiz, audio: AudioSintetizador) {
        this.bus = bus;
        this.codice = codice;
        this.audio = audio;

        this.reiniciar(false);
        this.suscribirEventos();
    }

    public reiniciar(notificar = true): void {
        this.misiones = MISIONES_BASE.map((m) => ({
            ...m,
            progreso: 0,
            completada: false
        }));
        this.triadaCultivos.clear();
        this.hitoCalendarioActual = '🕯️ 2 Feb: Bendición de Semillas (Preparación)';
        if (notificar && this.onActualizarUI) this.onActualizarUI();
    }

    private suscribirEventos(): void {
        this.bus.suscribir((ev: EventoJuego) => {
            switch (ev.t) {
                case 'siembra':
                    this.avanzarMision('mis_primer_surco', 1);
                    if (ev.variedad.toLowerCase().includes('azul')) this.codice.desbloquear('raza_azul');
                    if (ev.variedad.toLowerCase().includes('rojo')) this.codice.desbloquear('raza_rojo');
                    if (ev.variedad.toLowerCase().includes('palomero')) this.codice.desbloquear('raza_palomero');
                    break;

                case 'triada':
                    // Exigir tanto frijol como calabaza distintos para completar la Alianza de las Tres Hermanas
                    if (!this.triadaCultivos.has(ev.cultivo)) {
                        this.triadaCultivos.add(ev.cultivo);
                        this.avanzarMision('mis_tres_hermanas', 1);
                    }
                    break;

                case 'deshierbe':
                    this.avanzarMision('mis_quelites', 1);
                    break;

                case 'plaga':
                    // Solo contar si la plaga fue realmente resuelta/retirada (no al aparecer)
                    if (!ev.resuelta) break;
                    this.avanzarMision('mis_quelites', 1);
                    this.codice.desbloquear('eco_aliados');
                    break;

                case 'polinizacion':
                    this.avanzarMision('mis_polinizacion', 1);
                    break;

                case 'evento':
                    if (ev.resultado === 'superado') {
                        this.avanzarMision('mis_clima', 1);
                    }
                    break;

                case 'cocinado':
                    this.avanzarMision('mis_comal', 1);
                    this.codice.desbloquear('gastro_banquete');
                    if (ev.receta === 'quesadilla_huitlacoche') {
                        this.codice.desbloquear('eco_huitlacoche');
                    }
                    break;

                case 'cosecha':
                    this.codice.desbloquear('feno_madurez');
                    break;

                case 'semillaGuardada':
                    this.avanzarMision('mis_seleccion_semilla', 1);
                    this.codice.desbloquear('feno_madurez');
                    break;

                case 'dia':
                    this.actualizarCalendarioRitual(ev.dia);
                    break;
            }
        });
    }

    public avanzarMision(id: string, delta: number): void {
        const m = this.misiones.find((x) => x.id === id);
        if (!m || m.completada) return;

        m.progreso = Math.min(m.meta, m.progreso + delta);
        if (m.progreso >= m.meta) {
            m.completada = true;
            this.audio.cosecharExito();
            if (m.codicePremio) {
                this.codice.desbloquear(m.codicePremio);
            }
            this.bus.emitir({ t: 'mision', misionId: m.id });
            if (this.onMensajeToast) {
                this.onMensajeToast(`🏆 ¡Misión Completada!: «${m.titulo}»`);
            }
        }
        if (this.onActualizarUI) this.onActualizarUI();
    }

    /**
     * Actualiza el hito del calendario agrícola mesoamericano según el día máximo del ciclo
     */
    public actualizarCalendarioRitual(dia: number): void {
        if (dia < 15) {
            this.hitoCalendarioActual = '🕯️ 2 Feb: Bendición de Semillas (Preparación)';
        } else if (dia < 80) {
            this.hitoCalendarioActual = '🌧️ 3 May: Petición de Lluvias (Crecimiento)';
            this.codice.desbloquear('cal_santa_cruz');
        } else if (dia < 130) {
            this.hitoCalendarioActual = '🎉 29 Sep: Fiesta de Xilocruz (Primeros Elotes)';
            this.codice.desbloquear('cal_xilocruz');
        } else {
            this.hitoCalendarioActual = '🧺 Noviembre: Cosecha y Feria de la Semilla';
            this.codice.desbloquear('cal_feria_semilla');
        }
        if (this.onActualizarUI) this.onActualizarUI();
    }

    public todasCompletadas(): boolean {
        return this.misiones.every((m) => m.completada);
    }

    public obtenerMisionActiva(): MisionMilpa {
        const pendiente = this.misiones.find((m) => !m.completada);
        if (pendiente) return pendiente;
        return {
            id: 'mis_maestria_total',
            categoria: 'Maestría',
            titulo: '🌟 Maestro de la Milpa Viva',
            descripcion: '¡Completaste todas las misiones! Explora las 4 razas, el Códice [K] y el Fogón [F].',
            progreso: this.misiones.length,
            meta: this.misiones.length,
            completada: true
        };
    }

    public exportarSnapshot(): MisionesSnapshot {
        const progresoPorId: Record<string, { progreso: number; completada: boolean }> = {};
        for (const m of this.misiones) {
            progresoPorId[m.id] = { progreso: m.progreso, completada: m.completada };
        }
        return {
            progresoPorId,
            triadaCultivos: Array.from(this.triadaCultivos),
            hitoCalendarioActual: this.hitoCalendarioActual
        };
    }

    public restaurarSnapshot(snap?: MisionesSnapshot | null): void {
        this.reiniciar(false);
        if (!snap) {
            if (this.onActualizarUI) this.onActualizarUI();
            return;
        }
        if (snap.progresoPorId) {
            for (const m of this.misiones) {
                const saved = snap.progresoPorId[m.id];
                if (saved) {
                    m.progreso = Math.min(m.meta, saved.progreso ?? 0);
                    m.completada = Boolean(saved.completada);
                }
            }
        }
        if (Array.isArray(snap.triadaCultivos)) {
            snap.triadaCultivos.forEach((c) => this.triadaCultivos.add(c));
        }
        if (snap.hitoCalendarioActual) {
            this.hitoCalendarioActual = snap.hitoCalendarioActual;
        }
        if (this.onActualizarUI) this.onActualizarUI();
    }
}
