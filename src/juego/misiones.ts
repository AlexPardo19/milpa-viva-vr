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

/**
 * M10: Sistema de Misiones, Retos de Maestría y Calendario Ritual Agrícola
 * Escucha eventos de BusEventos sin acoplamiento directo y desbloquea páginas del Códice.
 */
export class MisionesSistema {
    private bus: BusEventos;
    private codice: CodiceMaiz;
    private audio: AudioSintetizador;

    public misiones: MisionMilpa[] = [
        {
            id: 'mis_primer_surco',
            categoria: 'Guiada',
            titulo: 'Labranza y Siembra del Surco',
            descripcion: 'Ara con la azada y siembra tu primera semilla nativa en la hilera.',
            progreso: 0,
            meta: 1,
            completada: false,
            codicePremio: 'feno_vegetativo'
        },
        {
            id: 'mis_tres_hermanas',
            categoria: 'Guiada',
            titulo: 'Alianza de las Tres Hermanas',
            descripcion: 'Siembra Frijol [B] o Calabaza [N] junto a tu maíz para activar la simbiosis.',
            progreso: 0,
            meta: 2,
            completada: false,
            codicePremio: 'eco_tres_hermanas'
        },
        {
            id: 'mis_quelites',
            categoria: 'Estacional',
            titulo: 'Cosecha de Quelites y Control Biológico',
            descripcion: 'Arranca maleza/quelites de raíz [X] o retira una plaga de la milpa.',
            progreso: 0,
            meta: 2,
            completada: false,
            codicePremio: 'eco_quelites'
        },
        {
            id: 'mis_polinizacion',
            categoria: 'Estacional',
            titulo: 'Lluvia Dorada de Polen',
            descripcion: 'Sacude la espiga en floración [P] para asegurar el llenado completo de granos.',
            progreso: 0,
            meta: 1,
            completada: false,
            codicePremio: 'feno_floracion'
        },
        {
            id: 'mis_comal',
            categoria: 'Maestría',
            titulo: 'Del Surco al Comal: Nixtamalización',
            descripcion: 'Prepara tu primer platillo tradicional en el Fogón de Cocina [F].',
            progreso: 0,
            meta: 1,
            completada: false,
            codicePremio: 'gastro_nixtamal'
        },
        {
            id: 'mis_seleccion_semilla',
            categoria: 'Maestría',
            titulo: 'Guardián de Semillas Criollas',
            descripcion: 'Cosecha una mazorca madura o selecciona una nueva generación en el Banco de Semillas [M].',
            progreso: 0,
            meta: 1,
            completada: false,
            codicePremio: 'cal_feria_semilla'
        }
    ];

    public hitoCalendarioActual: string = '🕯️ 2 de Febrero: Bendición de Semillas';
    public onActualizarUI?: () => void;
    public onMensajeToast?: (msg: string) => void;

    constructor(bus: BusEventos, codice: CodiceMaiz, audio: AudioSintetizador) {
        this.bus = bus;
        this.codice = codice;
        this.audio = audio;

        this.suscribirEventos();
    }

    private suscribirEventos(): void {
        this.bus.suscribir((ev: EventoJuego) => {
            switch (ev.t) {
                case 'siembra':
                    this.avanzarMision('mis_primer_surco', 1);
                    if (ev.variedad.toLowerCase().includes('azul')) this.codice.desbloquear('raza_azul');
                    if (ev.variedad.toLowerCase().includes('rojo')) this.codice.desbloquear('raza_rojo');
                    if (ev.variedad.toLowerCase().includes('palomero')) this.codice.desbloquear('raza_palomero');
                    if (ev.variedad.toLowerCase().includes('tuxpe')) this.codice.desbloquear('raza_tuxpeno');
                    break;

                case 'triada':
                    this.avanzarMision('mis_tres_hermanas', 1);
                    break;

                case 'deshierbe':
                    this.avanzarMision('mis_quelites', 1);
                    break;

                case 'plaga':
                    this.avanzarMision('mis_quelites', 1);
                    this.codice.desbloquear('eco_aliados');
                    break;

                case 'polinizacion':
                    this.avanzarMision('mis_polinizacion', 1);
                    break;

                case 'cocinado':
                    this.avanzarMision('mis_comal', 1);
                    this.codice.desbloquear('gastro_banquete');
                    break;

                case 'cosecha':
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
     * Actualiza el hito del calendario agrícola mesoamericano según el día del ciclo (0..165)
     */
    public actualizarCalendarioRitual(dia: number): void {
        if (dia < 15) {
            this.hitoCalendarioActual = '🕯️ 2 Feb: Bendición de Semillas (Preparación)';
        } else if (dia < 80) {
            this.hitoCalendarioActual = '🌧️ 3 May: Petición de Lluvias (Crecimiento)';
            this.codice.desbloquear('cal_santa_cruz');
        } else if (dia < 140) {
            this.hitoCalendarioActual = '🎉 29 Sep: Fiesta de Xilocruz (Primeros Elotes)';
            this.codice.desbloquear('cal_xilocruz');
        } else {
            this.hitoCalendarioActual = '🧺 Noviembre: Cosecha y Feria de la Semilla';
            this.codice.desbloquear('cal_feria_semilla');
        }
        if (this.onActualizarUI) this.onActualizarUI();
    }

    public obtenerMisionActiva(): MisionMilpa {
        return this.misiones.find((m) => !m.completada) || this.misiones[this.misiones.length - 1];
    }
}
