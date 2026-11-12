import { Scene, Mesh, Vector3 } from '@babylonjs/core';
import { ManoVR } from './mano_vr';
import { AudioSintetizador } from '../audio_sintetizador';

export interface BotonPoke3D {
    id: string;
    malla: Mesh;
    alPresionar: () => void;
    radioActivacion?: number;
    cooldownMs?: number;
    ultimoDisparo?: number;
    posOriginalY?: number;
}

/**
 * M13: Interacción de UI 3D por «Poke» (toque directo con dedo índice / control 6DoF)
 * Permite presionar botones 3D físicos en consolas o mesas diegéticas con hundimiento de 3 mm,
 * sonido táctil y pulso háptico de 20 ms.
 */
export class UiPoke {
    private scene: Scene;
    private audio: AudioSintetizador;
    private botones: BotonPoke3D[] = [];

    constructor(scene: Scene, audio: AudioSintetizador) {
        this.scene = scene;
        this.audio = audio;
    }

    public registrarBoton(
        id: string,
        malla: Mesh,
        alPresionar: () => void,
        radioActivacion: number = 0.08
    ): void {
        this.botones.push({
            id,
            malla,
            alPresionar,
            radioActivacion,
            cooldownMs: 450,
            ultimoDisparo: 0,
            posOriginalY: malla.position.y
        });
    }

    public actualizar(manoIzq: ManoVR | null, manoDer: ManoVR | null): void {
        const ahora = performance.now();
        for (let i = 0; i < this.botones.length; i++) {
            const b = this.botones[i];
            if (!b.malla.isEnabled()) continue;

            const posBoton = b.malla.getAbsolutePosition();
            const radio = b.radioActivacion || 0.08;
            let tocadoPor: ManoVR | null = null;

            if (manoDer && manoDer.conectada && Vector3.Distance(manoDer.pos, posBoton) <= radio) {
                tocadoPor = manoDer;
            } else if (manoIzq && manoIzq.conectada && Vector3.Distance(manoIzq.pos, posBoton) <= radio) {
                tocadoPor = manoIzq;
            }

            if (tocadoPor) {
                if (b.posOriginalY !== undefined) {
                    b.malla.position.y = b.posOriginalY - 0.003;
                }
                if (ahora - (b.ultimoDisparo || 0) > (b.cooldownMs || 450)) {
                    b.ultimoDisparo = ahora;
                    tocadoPor.pulso(0.45, 20);
                    this.audio.clickUI();
                    b.alPresionar();
                }
            } else if (b.posOriginalY !== undefined) {
                b.malla.position.y = b.posOriginalY;
            }
        }
    }
}
