import { SurcoMilpa } from '../surco_milpa';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos, TipoEventoClimatico } from './bus_eventos';
import { Vector3 } from '@babylonjs/core';

export type FaseEvento = 'REPOSO' | 'AVISO' | 'ACTIVO' | 'RESOLUCION';

/**
 * M6: Director de Eventos Meteorológicos Dramáticos
 * Máquina de estados (REPOSO -> AVISO -> ACTIVO -> RESOLUCION) con dificultad adaptativa:
 * - 'helada': requiere colocar petate protector ([G] o botón Petate).
 * - 'tormenta': encharca el suelo y requiere abrir zanja de drenaje con la azada.
 * - 'vendaval': inclina tallos altos y requiere colocar estaca tutora ([T] o botón Tutor).
 * - 'sequia': evapora humedad rápidamente y requiere riego o cobertura de calabaza.
 */
export class DirectorEventos {
    private surco: SurcoMilpa;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public fase: FaseEvento = 'REPOSO';
    public eventoActual: TipoEventoClimatico | null = null;
    public tiempoRestanteSeg: number = 0;

    private ultimoDiaEvento: number = -30;
    private eventosEnCiclo: number = 0;

    public onCambioEstadoUI?: (fase: FaseEvento, evento: TipoEventoClimatico | null, segundos: number, instruccion: string) => void;
    public onMensajeToast?: (msg: string) => void;
    public onForzarClima?: (tempOffset: number, lluviaNivel: number) => void;

    constructor(surco: SurcoMilpa, audio: AudioSintetizador, bus: BusEventos) {
        this.surco = surco;
        this.audio = audio;
        this.bus = bus;
    }

    /**
     * Evalúa al avanzar días simulados si corresponde disparar un evento meteorológico
     */
    public evaluarDiaSimulado(diaPromedio: number): void {
        if (this.fase !== 'REPOSO') return;
        if (this.eventosEnCiclo >= 2) return;
        if (diaPromedio - this.ultimoDiaEvento < 25) return;

        const sembrados = this.surco.nodos.filter((n) => n.sembrada);
        if (sembrados.length === 0) return;

        // Vigor promedio para dificultad adaptativa
        const saludProm =
            sembrados.reduce((acc, n) => acc + n.plantaInterna.vigor, 0) /
            sembrados.length;
        const factorAdaptativo = saludProm < 0.45 ? 0.5 : 1.0;

        const prob = 0.22 * factorAdaptativo;
        if (Math.random() > prob) return;

        // Seleccionar evento acorde a la etapa del cultivo
        const candidatos: TipoEventoClimatico[] = ['sequia', 'tormenta'];
        if (diaPromedio >= 25 && diaPromedio <= 95) {
            candidatos.push('helada');
        }
        if (diaPromedio >= 55) {
            candidatos.push('vendaval');
        }

        const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
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
            if (this.onForzarClima) this.onForzarClima(0, 0);
            this.notificarUI();
        }
    }

    private activarImpactoClimatico(): void {
        if (!this.eventoActual) return;
        this.fase = 'ACTIVO';
        this.tiempoRestanteSeg = 22;

        if (this.eventoActual === 'helada' && this.onForzarClima) {
            this.onForzarClima(-10, 0);
        } else if (this.eventoActual === 'tormenta' && this.onForzarClima) {
            this.onForzarClima(-3, 2);
            this.audio.trueno(new Vector3(2, 10, 2));
        } else if (this.eventoActual === 'sequia' && this.onForzarClima) {
            this.onForzarClima(9, 0);
        } else if (this.eventoActual === 'vendaval' && this.onForzarClima) {
            this.onForzarClima(-2, 1);
        }

        this.bus.emitir({ t: 'evento', tipo: this.eventoActual, resultado: 'inicio' });
        const msg = this.obtenerInstruccion(this.eventoActual, 'ACTIVO');
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.notificarUI();
    }

    private aplicarEfectoContinuo(dt: number): void {
        if (!this.eventoActual) return;

        for (const nodo of this.surco.nodos) {
            if (!nodo.sembrada) continue;

            if (this.eventoActual === 'helada') {
                if (nodo.proteccion === 0) {
                    nodo.plantaInterna.vigor = Math.max(0.15, nodo.plantaInterna.vigor - 0.012 * dt);
                }
            } else if (this.eventoActual === 'tormenta') {
                nodo.humedadVWC = Math.min(60, nodo.humedadVWC + 1.8 * dt);
                if (nodo.humedadVWC > 40) {
                    nodo.charcoMat.alpha = 0.65;
                }
            } else if (this.eventoActual === 'vendaval') {
                if (!nodo.tutorado && nodo.frijolVid < 0.35) {
                    nodo.maiz.root.rotation.z = Math.min(0.28, nodo.maiz.root.rotation.z + 0.015 * dt);
                    nodo.plantaInterna.vigor = Math.max(0.2, nodo.plantaInterna.vigor - 0.008 * dt);
                } else {
                    nodo.maiz.root.rotation.z = 0;
                }
            } else if (this.eventoActual === 'sequia') {
                const factorCob = 1 - 0.5 * nodo.calabazaCobertura;
                nodo.humedadVWC = Math.max(12, nodo.humedadVWC - 1.2 * factorCob * dt);
            }
        }
    }

    private resolverEvento(): void {
        if (!this.eventoActual) return;
        const ev = this.eventoActual;
        this.fase = 'RESOLUCION';
        this.tiempoRestanteSeg = 5;

        let exito = false;
        for (const n of this.surco.nodos) {
            if (!n.sembrada) continue;
            if (ev === 'helada' && n.proteccion > 0) exito = true;
            if (ev === 'vendaval' && (n.tutorado || n.frijolVid > 0.3)) exito = true;
            if (ev === 'tormenta' && n.humedadVWC <= 38) exito = true;
            if (ev === 'sequia' && n.humedadVWC >= 20) exito = true;
        }

        for (const n of this.surco.nodos) {
            n.maiz.root.rotation.z = 0;
        }

        this.bus.emitir({ t: 'evento', tipo: ev, resultado: exito ? 'superado' : 'fallado' });
        const msg = exito
            ? `🌈 ¡Superaste el evento de ${ev.toUpperCase()} protegiendo tu milpa!`
            : `🌤️ El evento de ${ev.toUpperCase()} ha terminado. Revisa la humedad y salud de tus plantas.`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        this.notificarUI();
    }

    public obtenerInstruccion(tipo: TipoEventoClimatico, fase: FaseEvento): string {
        const prefijo = fase === 'AVISO' ? '⚠️ AVISO METEOROLÓGICO' : '🚨 EVENTO ACTIVO';
        switch (tipo) {
            case 'helada':
                return `${prefijo}: ¡Helada nocturna! Coloca Petate protector [G] sobre tus plantas jóvenes.`;
            case 'tormenta':
                return `${prefijo}: ¡Tormenta torrencial! Usa la Azada [1] en estaciones encharcadas para abrir zanja de drenaje.`;
            case 'vendaval':
                return `${prefijo}: ¡Vendaval de montaña! Coloca Estaca Tutora [T] o siembra Frijol [B] para sostener el tallo.`;
            case 'sequia':
                return `${prefijo}: ¡Onda cálida de sequía! Riega tus plantas [3] y aprovecha la sombra de la Calabaza [N].`;
        }
    }

    private notificarUI(): void {
        if (this.onCambioEstadoUI) {
            const inst = this.eventoActual ? this.obtenerInstruccion(this.eventoActual, this.fase) : '';
            this.onCambioEstadoUI(this.fase, this.eventoActual, Math.ceil(this.tiempoRestanteSeg), inst);
        }
    }
}
