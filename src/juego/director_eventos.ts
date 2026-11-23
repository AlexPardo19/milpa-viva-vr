import { SurcoMilpa } from '../surco_milpa';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos, TipoEventoClimatico } from './bus_eventos';
import { Vector3 } from '@babylonjs/core';
import { crearRng } from './util';

export type FaseEvento = 'REPOSO' | 'AVISO' | 'ACTIVO' | 'RESOLUCION';

export interface DirectorEventosSnapshot {
    ultimoDiaEvento: number;
    eventosEnCiclo: number;
    ultimoDiaEvaluado: number;
}

/**
 * M6: Director de Eventos Meteorológicos Dramáticos (v4.1)
 * Máquina de estados (REPOSO -> AVISO -> ACTIVO -> RESOLUCION) con dificultad real,
 * respaldo/restauración de clima previo, cuenta regresiva viva y resolución justa.
 */
export class DirectorEventos {
    private surco: SurcoMilpa;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public fase: FaseEvento = 'REPOSO';
    public eventoActual: TipoEventoClimatico | null = null;
    public tiempoRestanteSeg: number = 0;
    public dificultad: 'tranquilo' | 'normal' | 'extremo' = 'normal';

    private ultimoDiaEvento: number = -30;
    private eventosEnCiclo: number = 0;
    private ultimoDiaEvaluado: number = -1;
    private ultimoSegNotificado: number = -1;
    private drenajesEnTormenta: number = 0;
    private rng: () => number = () => Math.random();

    public onCambioEstadoUI?: (fase: FaseEvento, evento: TipoEventoClimatico | null, segundos: number, instruccion: string) => void;
    public onMensajeToast?: (msg: string) => void;
    public onForzarClima?: (tempOffset: number, lluviaNivel: number, vientoObjetivo?: number, restaurar?: boolean) => void;

    constructor(surco: SurcoMilpa, audio: AudioSintetizador, bus: BusEventos) {
        this.surco = surco;
        this.audio = audio;
        this.bus = bus;
    }

    public configurarMundo(dificultad: 'tranquilo' | 'normal' | 'extremo', semillaStr?: string): void {
        this.dificultad = dificultad;
        if (semillaStr) {
            let h = 2166136261;
            for (let i = 0; i < semillaStr.length; i++) {
                h ^= semillaStr.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            this.rng = crearRng((h >>> 0) + 911);
        }
    }

    public reiniciar(): void {
        if (this.fase !== 'REPOSO' && this.onForzarClima) {
            this.onForzarClima(0, 0, undefined, true);
        }
        this.fase = 'REPOSO';
        this.eventoActual = null;
        this.tiempoRestanteSeg = 0;
        this.ultimoDiaEvento = -30;
        this.eventosEnCiclo = 0;
        this.ultimoDiaEvaluado = -1;
        this.ultimoSegNotificado = -1;
        this.drenajesEnTormenta = 0;
        this.notificarUI();
    }

    public registrarDrenaje(): void {
        if (this.fase === 'ACTIVO' && this.eventoActual === 'tormenta') {
            this.drenajesEnTormenta++;
        }
    }

    public obtenerSeveridadActiva(): number {
        if (this.fase !== 'ACTIVO') return 0;
        return this.dificultad === 'extremo' ? 1.5 : this.dificultad === 'tranquilo' ? 0.5 : 1.0;
    }

    /**
     * Evalúa una vez por día entero simulado si corresponde disparar un evento meteorológico
     */
    public evaluarDiaSimulado(diaPromedio: number): void {
        const diaEntero = Math.floor(diaPromedio);
        if (diaEntero === this.ultimoDiaEvaluado) return;
        // Si el jugador replantó un ciclo nuevo y el día promedio retrocedió, reiniciar el contador de ciclo
        if (diaEntero < this.ultimoDiaEvaluado - 20) {
            this.ultimoDiaEvento = -30;
            this.eventosEnCiclo = 0;
        }
        this.ultimoDiaEvaluado = diaEntero;

        if (this.fase !== 'REPOSO') return;
        const maxEventos = this.dificultad === 'tranquilo' ? 1 : this.dificultad === 'extremo' ? 5 : 3;
        const intervaloMin = this.dificultad === 'extremo' ? 16 : this.dificultad === 'tranquilo' ? 40 : 25;
        if (this.eventosEnCiclo >= maxEventos) return;
        if (diaPromedio - this.ultimoDiaEvento < intervaloMin) return;

        const sembrados = this.surco.nodos.filter(
            (n) => n.sembrada && !n.cosechada && n.plantaInterna.estado !== 'MUERTA' && n.plantaInterna.estado !== 'SEMILLA'
        );
        if (sembrados.length === 0) return;

        // Vigor promedio para dificultad adaptativa
        const saludProm =
            sembrados.reduce((acc, n) => acc + n.plantaInterna.vigor, 0) /
            sembrados.length;
        const factorAdaptativo = saludProm < 0.45 ? 0.5 : 1.0;
        const baseProb = this.dificultad === 'tranquilo' ? 0.08 : this.dificultad === 'extremo' ? 0.28 : 0.16;

        const prob = baseProb * factorAdaptativo;
        if (this.rng() > prob) return;

        // Seleccionar evento acorde a la etapa del cultivo
        const candidatos: TipoEventoClimatico[] = ['sequia', 'tormenta'];
        if (diaPromedio >= 20 && diaPromedio <= 95) {
            candidatos.push('helada');
        }
        if (diaPromedio >= 45) {
            candidatos.push('vendaval');
        }

        const elegido = candidatos[Math.floor(this.rng() * candidatos.length)];
        this.ultimoDiaEvento = diaPromedio;
        this.eventosEnCiclo++;
        this.iniciarEvento(elegido);
    }

    /**
     * Permite iniciar un evento meteorológico (automático o desde el panel educativo)
     */
    public iniciarEvento(tipo: TipoEventoClimatico): void {
        this.eventoActual = tipo;
        this.fase = 'AVISO';
        this.tiempoRestanteSeg = 18;
        this.ultimoSegNotificado = 18;
        this.drenajesEnTormenta = 0;

        if (tipo === 'tormenta' || tipo === 'vendaval') {
            this.audio.trueno(new Vector3(0, 8, 6));
        } else {
            this.audio.campanita();
        }

        this.bus.emitir({ t: 'evento', tipo, resultado: 'aviso' });
        const msg = this.obtenerInstruccion(tipo, 'AVISO');
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.notificarUI();
    }

    public actualizar(dt: number): void {
        if (this.fase === 'REPOSO' || !this.eventoActual) return;

        this.tiempoRestanteSeg -= dt;
        const segActual = Math.max(0, Math.ceil(this.tiempoRestanteSeg));
        if (segActual !== this.ultimoSegNotificado) {
            this.ultimoSegNotificado = segActual;
            this.notificarUI();
        }

        if (this.fase === 'AVISO' && this.tiempoRestanteSeg <= 0) {
            this.activarImpactoClimatico();
        } else if (this.fase === 'ACTIVO') {
            this.aplicarEfectoContinuo(dt);
            if (this.tiempoRestanteSeg <= 0) {
                this.resolverEvento();
            }
        } else if (this.fase === 'RESOLUCION' && this.tiempoRestanteSeg <= 0) {
            this.fase = 'REPOSO';
            this.eventoActual = null;
            this.ultimoSegNotificado = -1;
            if (this.onForzarClima) this.onForzarClima(0, 0, undefined, true);
            this.notificarUI();
        }
    }

    private activarImpactoClimatico(): void {
        if (!this.eventoActual) return;
        this.fase = 'ACTIVO';
        this.tiempoRestanteSeg = 22;
        this.ultimoSegNotificado = 22;

        if (this.eventoActual === 'helada' && this.onForzarClima) {
            // Helada real bajo cero (-3 °C)
            this.onForzarClima(-27, 0, 1.5, false);
        } else if (this.eventoActual === 'tormenta' && this.onForzarClima) {
            this.onForzarClima(-4, 2, 12.0, false);
            this.audio.trueno(new Vector3(2, 10, 2));
        } else if (this.eventoActual === 'sequia' && this.onForzarClima) {
            this.onForzarClima(11, 0, 5.0, false);
        } else if (this.eventoActual === 'vendaval' && this.onForzarClima) {
            // Vendaval real que mueve hojas, molino y pone a prueba el acame (18 m/s)
            this.onForzarClima(-3, 1, 18.5, false);
        }

        this.bus.emitir({ t: 'evento', tipo: this.eventoActual, resultado: 'inicio' });
        const msg = this.obtenerInstruccion(this.eventoActual, 'ACTIVO');
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.notificarUI();
    }

    private aplicarEfectoContinuo(dt: number): void {
        if (!this.eventoActual) return;
        const sev = this.obtenerSeveridadActiva();

        for (const nodo of this.surco.nodos) {
            if (!nodo.sembrada || nodo.cosechada || nodo.plantaInterna.estado === 'MUERTA') continue;

            if (this.eventoActual === 'helada') {
                if (nodo.proteccion === 0) {
                    nodo.plantaInterna.vigor = Math.max(0.15, nodo.plantaInterna.vigor - 0.012 * sev * dt);
                }
            } else if (this.eventoActual === 'tormenta') {
                nodo.humedadVWC = Math.min(60, nodo.humedadVWC + 1.35 * sev * dt);
                if (nodo.humedadVWC > 38) {
                    nodo.charcoMat.alpha = Math.min(0.85, (nodo.humedadVWC - 38) / 14);
                }
            } else if (this.eventoActual === 'vendaval') {
                if (!nodo.tutorado && nodo.frijolVid < 0.35) {
                    nodo.plantaInterna.acameGrados = Math.min(48, nodo.plantaInterna.acameGrados + 1.4 * sev * dt);
                    nodo.estadoCrec.acameGrados = nodo.plantaInterna.acameGrados;
                    nodo.plantaInterna.vigor = Math.max(0.2, nodo.plantaInterna.vigor - 0.008 * sev * dt);
                }
            } else if (this.eventoActual === 'sequia') {
                const factorCob = 1 - 0.5 * nodo.calabazaCobertura;
                nodo.humedadVWC = Math.max(10, nodo.humedadVWC - 1.05 * sev * factorCob * dt);
            }
        }
    }

    private resolverEvento(): void {
        if (!this.eventoActual) return;
        const ev = this.eventoActual;
        this.fase = 'RESOLUCION';
        this.tiempoRestanteSeg = 5;
        this.ultimoSegNotificado = 5;

        const vivos = this.surco.nodos.filter(
            (n) => n.sembrada && !n.cosechada && n.plantaInterna.estado !== 'MUERTA'
        );
        let protegidos = 0;
        for (const n of vivos) {
            if (ev === 'helada' && n.proteccion > 0) protegidos++;
            if (ev === 'vendaval' && (n.tutorado || n.frijolVid > 0.3)) protegidos++;
            if (ev === 'tormenta' && (n.humedadVWC <= 40 || this.drenajesEnTormenta > 0)) protegidos++;
            if (ev === 'sequia' && (n.humedadVWC >= 20 || n.calabazaCobertura > 0.3)) protegidos++;
        }

        const exito = vivos.length > 0 && protegidos >= Math.ceil(vivos.length * 0.5);

        this.bus.emitir({ t: 'evento', tipo: ev, resultado: exito ? 'superado' : 'fallado' });
        const msg = exito
            ? `🌈 ¡Superaste el evento de ${ev.toUpperCase()} protegiendo ${protegidos}/${vivos.length} plantas!`
            : `🌤️ El evento de ${ev.toUpperCase()} ha terminado (${protegidos}/${vivos.length} protegidas). Revisa humedad y vigor.`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.notificarUI();
    }

    public obtenerInstruccion(tipo: TipoEventoClimatico, fase: FaseEvento): string {
        const prefijo = fase === 'AVISO' ? '⚠️ AVISO METEOROLÓGICO' : '🚨 EVENTO ACTIVO';
        switch (tipo) {
            case 'helada':
                return `${prefijo}: ¡Helada nocturna (-3 °C)! Coloca Petate protector [G] sobre tus plantas.`;
            case 'tormenta':
                return `${prefijo}: ¡Tormenta torrencial! Usa la Azada [2] en estaciones encharcadas para abrir zanja de drenaje.`;
            case 'vendaval':
                return `${prefijo}: ¡Vendaval (18 m/s)! Coloca Estaca Tutora [T] o siembra Frijol [B] para sostener la caña.`;
            case 'sequia':
                return `${prefijo}: ¡Onda cálida de sequía! Riega con Regadera [7] y aprovecha el mulch de Calabaza [N].`;
        }
    }

    public exportarSnapshot(): DirectorEventosSnapshot {
        return {
            ultimoDiaEvento: this.ultimoDiaEvento,
            eventosEnCiclo: this.eventosEnCiclo,
            ultimoDiaEvaluado: this.ultimoDiaEvaluado
        };
    }

    public restaurarSnapshot(snap?: DirectorEventosSnapshot | null): void {
        this.reiniciar();
        if (!snap) return;
        this.ultimoDiaEvento = snap.ultimoDiaEvento ?? -30;
        this.eventosEnCiclo = snap.eventosEnCiclo ?? 0;
        this.ultimoDiaEvaluado = snap.ultimoDiaEvaluado ?? -1;
    }

    private notificarUI(): void {
        if (this.onCambioEstadoUI) {
            const inst = this.eventoActual ? this.obtenerInstruccion(this.eventoActual, this.fase) : '';
            this.onCambioEstadoUI(this.fase, this.eventoActual, Math.max(0, Math.ceil(this.tiempoRestanteSeg)), inst);
        }
    }
}
