import { Vector3 } from '@babylonjs/core';
import { SurcoMilpa } from '../surco_milpa';
import { ParticulasEducativas } from '../educativo/particulas_educativas';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp01 } from './util';

/**
 * M5: Sistema de Polinización Manual y por Viento
 * Permite sacudir la espiga (tassel) en etapas reproductivas (o hacer clic / presionar [P])
 * para liberar una nube de polen dorado y asegurar el cuajado completo de los granos del elote.
 */
export class PolinizacionSistema {
    private surco: SurcoMilpa;
    private particulas: ParticulasEducativas | null;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public onMensajeToast?: (msg: string) => void;

    constructor(
        surco: SurcoMilpa,
        particulas: ParticulasEducativas | null,
        audio: AudioSintetizador,
        bus: BusEventos
    ) {
        this.surco = surco;
        this.particulas = particulas;
        this.audio = audio;
        this.bus = bus;
    }

    /**
     * Ejecuta una sacudida manual de polen sobre el nodo indicado
     */
    public polinizarManual(nodoId: number): { exito: boolean; mensaje: string } {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo || !nodo.sembrada) {
            const msg = `⚠️ Estación #${nodoId + 1}: Siembra primero para poder polinizar.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }
        if (nodo.plantaInterna.estado === 'MUERTA' || nodo.estadoCrec.estaMuerta) {
            const msg = `⚠️ Estación #${nodoId + 1}: La planta está muerta. Usa [Q] o el botón Quitar Planta para despejar el montículo.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }
        if (nodo.cosechada) {
            const msg = `🌽 Estación #${nodoId + 1}: Esta planta ya fue cosechada.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }

        const dia = Math.floor(nodo.diasCultivo);
        if (dia < 45) {
            const msg = `🌼 Estación #${nodoId + 1}: La planta aún es joven (Día ${dia}). La espiga suelta polen a partir de VT/R1.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: false, mensaje: msg };
        }

        nodo.polinizacion = clamp01(nodo.polinizacion + 0.28);
        nodo.plantaInterna.cuajado = Math.max(
            nodo.plantaInterna.cuajado,
            clamp01(0.45 + 0.55 * nodo.polinizacion)
        );

        // Emitir nube de polen dorado desde la altura real de la espiga hacia los jilotes
        const altEspiga = Math.max(0.85, Math.min(1.65, nodo.plantaInterna.alturaMetros * 0.72));
        const posEspiga = nodo.posicionMundo.add(new Vector3(0, altEspiga, 0));
        if (this.particulas) {
            this.particulas.emitirPolenDorado(posEspiga);
        }
        this.audio.campanita(posEspiga);

        const pct = Math.round(nodo.polinizacion * 100);
        this.bus.emitir({ t: 'polinizacion', nodo: nodoId, manual: true, valor: nodo.polinizacion });

        const msg = `✨ ¡Lluvia de polen en Estación #${nodoId + 1}! Polinización y cuajado al ${pct}%.`;
        if (this.onMensajeToast) this.onMensajeToast(msg);
        return { exito: true, mensaje: msg };
    }
}
