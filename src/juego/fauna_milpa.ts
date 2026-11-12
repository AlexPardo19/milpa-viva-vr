import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    Vector3,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { SurcoMilpa } from '../surco_milpa';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { ManoVR } from '../vr/mano_vr';
import { clamp01 } from './util';

export type TipoFauna = 'larva' | 'ave' | 'abeja' | 'catarina';
export type EstadoFauna = 'INACTIVO' | 'LLEGANDO' | 'ACTUANDO' | 'HUYENDO';

export interface AgenteFauna {
    id: number;
    tipo: TipoFauna;
    estado: EstadoFauna;
    nodoObjetivo: number;
    raiz: TransformNode;
    posicion: Vector3;
    origen: Vector3;
    destino: Vector3;
    progreso: number;
    tiempoEstado: number;
}

/**
 * M4: Plagas y Aliados Biológicos (Fauna de la Milpa)
 * Pool fijo pre-alojado de 10 agentes (máx. 4 activos simultáneamente, 0 GC por frame):
 * - Plagas: Gusano cogollero ('larva') y Tordo maicero ('ave').
 * - Aliados: Abeja nativa ('abeja', poliniza) y Catarina ('catarina', depreda larvas).
 * - Don Elote (x = -4.2) protege un radio de 2.5 m contra las aves.
 */
export class FaunaMilpa {
    private scene: Scene;
    private surco: SurcoMilpa;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    public pool: AgenteFauna[] = [];
    public readonly MAX_ACTIVOS = 4;
    public readonly POS_DON_ELOTE = new Vector3(-4.2, 0, -0.8);
    public readonly RADIO_ESPANTAPAJAROS = 2.6;

    private timerSpawn = 0;
    private timerSonido = 0;

    public onMensajeToast?: (msg: string) => void;

    constructor(scene: Scene, surco: SurcoMilpa, audio: AudioSintetizador, bus: BusEventos) {
        this.scene = scene;
        this.surco = surco;
        this.audio = audio;
        this.bus = bus;

        this.inicializarPool();
    }

    private inicializarPool(): void {
        const tipos: TipoFauna[] = [
            'larva', 'larva', 'larva',
            'ave', 'ave',
            'abeja', 'abeja', 'abeja',
            'catarina', 'catarina'
        ];

        for (let i = 0; i < tipos.length; i++) {
            const tipo = tipos[i];
            const raiz = this.crearModeloFauna(i, tipo);
            raiz.setEnabled(false);

            this.pool.push({
                id: i,
                tipo,
                estado: 'INACTIVO',
                nodoObjetivo: 0,
                raiz,
                posicion: new Vector3(0, -10, 0),
                origen: new Vector3(0, 3, -5),
                destino: new Vector3(0, 0.8, 0),
                progreso: 0,
                tiempoEstado: 0
            });
        }
    }

    private crearModeloFauna(id: number, tipo: TipoFauna): TransformNode {
        const raiz = new TransformNode(`fauna_${tipo}_${id}`, this.scene);

        const mat = new StandardMaterial(`matFauna_${id}`, this.scene);
        mat.specularColor = Color3.Black();

        if (tipo === 'larva') {
            mat.diffuseColor = Color3.FromHexString('#7cb342');
            mat.emissiveColor = Color3.FromHexString('#558b2f').scale(0.22);
            for (let s = 0; s < 4; s++) {
                const seg = MeshBuilder.CreateSphere(
                    `larvaSeg_${id}_${s}`,
                    { diameter: 0.048 - s * 0.005, segments: 8 },
                    this.scene
                );
                seg.position.set(s * 0.032 - 0.048, Math.sin(s * 1.1) * 0.008, 0);
                seg.material = mat;
                seg.parent = raiz;
                this.registrarClickAgente(seg, id);
            }
            const matCab = new StandardMaterial(`matLarvaCab_${id}`, this.scene);
            matCab.diffuseColor = Color3.FromHexString('#3e2723');
            matCab.emissiveColor = Color3.FromHexString('#3e2723').scale(0.18);
            const cab = MeshBuilder.CreateSphere(
                `larvaCab_${id}`,
                { diameter: 0.042, segments: 8 },
                this.scene
            );
            cab.position.set(-0.075, 0, 0);
            cab.material = matCab;
            cab.parent = raiz;
            this.registrarClickAgente(cab, id);
        } else if (tipo === 'ave') {
            mat.diffuseColor = Color3.FromHexString('#263238');
            mat.emissiveColor = Color3.FromHexString('#263238').scale(0.22);
            const cuerpo = MeshBuilder.CreateSphere(
                `aveCuerpo_${id}`,
                { diameter: 0.16, segments: 8 },
                this.scene
            );
            cuerpo.scaling.set(0.85, 0.72, 1.45);
            cuerpo.material = mat;
            cuerpo.parent = raiz;

            // Alas extendidas
            for (const lado of [-1, 1]) {
                const ala = MeshBuilder.CreateBox(
                    `aveAla_${id}_${lado}`,
                    { width: 0.18, height: 0.015, depth: 0.11 },
                    this.scene
                );
                ala.position.set(lado * 0.11, 0.02, 0);
                ala.rotation.z = lado * 0.18;
                ala.material = mat;
                ala.parent = raiz;
            }

            const matPico = new StandardMaterial(`matPico_${id}`, this.scene);
            matPico.diffuseColor = Color3.FromHexString('#ffb300');
            matPico.emissiveColor = Color3.FromHexString('#ffb300').scale(0.25);
            const pico = MeshBuilder.CreateCylinder(
                `avePico_${id}`,
                { height: 0.075, diameterTop: 0, diameterBottom: 0.042, tessellation: 6 },
                this.scene
            );
            pico.rotation.x = Math.PI / 2;
            pico.position.set(0, 0.01, 0.14);
            pico.material = matPico;
            pico.parent = raiz;
            this.registrarClickAgente(cuerpo, id);
        } else if (tipo === 'abeja') {
            mat.diffuseColor = Color3.FromHexString('#f59e0b');
            mat.emissiveColor = Color3.FromHexString('#d97706').scale(0.25);
            const cuerpo = MeshBuilder.CreateSphere(
                `abejaCuerpo_${id}`,
                { diameter: 0.062, segments: 8 },
                this.scene
            );
            cuerpo.scaling.set(0.82, 0.82, 1.32);
            cuerpo.material = mat;
            cuerpo.parent = raiz;

            // Franja oscura dorsal y alas translúcidas
            const matFranja = new StandardMaterial(`matAbejaFranja_${id}`, this.scene);
            matFranja.diffuseColor = Color3.FromHexString('#271c19');
            const franja = MeshBuilder.CreateCylinder(
                `abejaFranja_${id}`,
                { height: 0.025, diameter: 0.054, tessellation: 8 },
                this.scene
            );
            franja.rotation.x = Math.PI / 2;
            franja.material = matFranja;
            franja.parent = raiz;

            const matAla = new StandardMaterial(`matAbejaAla_${id}`, this.scene);
            matAla.diffuseColor = Color3.FromHexString('#e0f2fe');
            matAla.emissiveColor = Color3.FromHexString('#bae6fd').scale(0.3);
            matAla.alpha = 0.65;
            for (const lado of [-1, 1]) {
                const ala = MeshBuilder.CreateDisc(
                    `abejaAla_${id}_${lado}`,
                    { radius: 0.032, tessellation: 8 },
                    this.scene
                );
                ala.position.set(lado * 0.028, 0.026, 0);
                ala.rotation.x = Math.PI / 2.4;
                ala.rotation.y = lado * 0.35;
                ala.material = matAla;
                ala.parent = raiz;
            }
            this.registrarClickAgente(cuerpo, id);
        } else {
            // Catarina roja con cabeza negra y puntos dorsales
            mat.diffuseColor = Color3.FromHexString('#dc2626');
            mat.emissiveColor = Color3.FromHexString('#b91c1c').scale(0.22);
            const caparazon = MeshBuilder.CreateSphere(
                `catarina_${id}`,
                { diameter: 0.058, segments: 8 },
                this.scene
            );
            caparazon.scaling.set(1, 0.62, 1.12);
            caparazon.material = mat;
            caparazon.parent = raiz;

            const matNegro = new StandardMaterial(`matCatNegro_${id}`, this.scene);
            matNegro.diffuseColor = Color3.FromHexString('#171717');
            const cab = MeshBuilder.CreateSphere(
                `catCab_${id}`,
                { diameter: 0.028, segments: 6 },
                this.scene
            );
            cab.position.set(0, -0.002, 0.03);
            cab.material = matNegro;
            cab.parent = raiz;
            this.registrarClickAgente(caparazon, id);
        }

        return raiz;
    }

    private registrarClickAgente(malla: any, idAgente: number): void {
        malla.isPickable = true;
        malla.actionManager = new ActionManager(this.scene);
        malla.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                this.interactuarConAgente(idAgente);
            })
        );
    }

    public contarActivos(): number {
        let c = 0;
        for (let i = 0; i < this.pool.length; i++) {
            if (this.pool[i].estado !== 'INACTIVO') c++;
        }
        return c;
    }

    /**
     * Interactúa directamente con un agente (clic o mano 6DoF cercana)
     */
    public interactuarConAgente(idAgente: number, golpeBrusco: boolean = false): void {
        const ag = this.pool[idAgente];
        if (!ag || ag.estado === 'INACTIVO' || ag.estado === 'HUYENDO') return;

        const nodo = this.surco.nodos[ag.nodoObjetivo];

        if (ag.tipo === 'larva') {
            ag.estado = 'HUYENDO';
            ag.progreso = 0;
            if (nodo) {
                nodo.plaga = Math.max(0, nodo.plaga - 35);
            }
            this.audio.clickUI();
            this.bus.emitir({ t: 'plaga', nodo: ag.nodoObjetivo, tipo: 'cogollero', resuelta: true });
            if (this.onMensajeToast) {
                this.onMensajeToast(`🐛 ¡Retiraste al gusano cogollero de la Estación #${ag.nodoObjetivo + 1}!`);
            }
        } else if (ag.tipo === 'ave') {
            ag.estado = 'HUYENDO';
            ag.progreso = 0;
            this.audio.palmada(ag.posicion);
            this.bus.emitir({ t: 'plaga', nodo: ag.nodoObjetivo, tipo: 'ave', resuelta: true });
            if (this.onMensajeToast) {
                this.onMensajeToast(`🐦 ¡Espantaste al tordo maicero de la Estación #${ag.nodoObjetivo + 1}!`);
            }
        } else if (ag.tipo === 'abeja' || ag.tipo === 'catarina') {
            if (golpeBrusco) {
                ag.estado = 'HUYENDO';
                ag.progreso = 0;
                if (this.onMensajeToast) {
                    this.onMensajeToast(`⚠️ ¡Cuidado! Ahuyentaste a una ${ag.tipo} aliada de la milpa.`);
                }
            } else {
                if (this.onMensajeToast) {
                    const desc =
                        ag.tipo === 'abeja'
                            ? '🐝 Abeja nativa: poliniza las flores de calabaza y el maíz.'
                            : '🐞 Catarina aliada: protege la milpa comiéndose al gusano cogollero.';
                    this.onMensajeToast(desc);
                }
            }
        }
    }

    /**
     * Limpia o espanta plagas en el nodo seleccionado (atajo para botón o tecla)
     */
    public limpiarPlagasEnNodo(nodoId: number): { exito: boolean; mensaje: string } {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo) return { exito: false, mensaje: 'Estación inválida.' };

        let retirados = 0;
        for (let i = 0; i < this.pool.length; i++) {
            const ag = this.pool[i];
            if (
                ag.estado !== 'INACTIVO' &&
                ag.estado !== 'HUYENDO' &&
                ag.nodoObjetivo === nodoId &&
                (ag.tipo === 'larva' || ag.tipo === 'ave')
            ) {
                this.interactuarConAgente(ag.id);
                retirados++;
            }
        }

        if (nodo.plaga > 5) {
            nodo.plaga = Math.max(0, nodo.plaga - 45);
            retirados++;
        }

        if (retirados > 0) {
            const msg = `🛡️ Estación #${nodoId + 1} protegida contra plagas (nivel de plaga: ${Math.round(nodo.plaga)}%).`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }
        return { exito: false, mensaje: `Estación #${nodoId + 1} está libre de plagas.` };
    }

    /**
     * Desactiva de inmediato todos los agentes de fauna en una estación específica
     * (por ejemplo, cuando una planta muere, se cosecha o se arranca) para que no queden esferas flotando.
     */
    public desactivarAgentesEnNodo(nodoId: number): void {
        for (let i = 0; i < this.pool.length; i++) {
            const ag = this.pool[i];
            if (ag.nodoObjetivo === nodoId && ag.estado !== 'INACTIVO') {
                ag.estado = 'INACTIVO';
                ag.raiz.setEnabled(false);
            }
        }
    }

    public actualizar(dt: number, manoIzq?: ManoVR | null, manoDer?: ManoVR | null): void {
        this.timerSpawn += dt;
        this.timerSonido += dt;

        // Intentar activar un agente cada 6 segundos si hay espacio en el pool
        if (this.timerSpawn > 6.0) {
            this.timerSpawn = 0;
            if (this.contarActivos() < this.MAX_ACTIVOS) {
                this.intentarSpawn();
            }
        }

        for (let i = 0; i < this.pool.length; i++) {
            const ag = this.pool[i];
            if (ag.estado === 'INACTIVO') continue;

            const nodo = this.surco.nodos[ag.nodoObjetivo];
            // Si la planta murió, fue cosechada o fue retirada, ocultar de inmediato el agente para evitar objetos flotantes
            if (
                !nodo ||
                !nodo.sembrada ||
                nodo.cosechada ||
                nodo.plantaInterna.estado === 'MUERTA' ||
                nodo.estadoCrec.estaMuerta
            ) {
                ag.estado = 'INACTIVO';
                ag.raiz.setEnabled(false);
                continue;
            }

            ag.tiempoEstado += dt;

            if (ag.estado === 'LLEGANDO') {
                ag.progreso = clamp01(ag.progreso + dt * 0.65);
                Vector3.LerpToRef(ag.origen, ag.destino, ag.progreso, ag.posicion);
                ag.posicion.y += Math.sin(ag.progreso * Math.PI) * 0.4;
                ag.raiz.position.copyFrom(ag.posicion);
                if (ag.progreso >= 1) {
                    ag.estado = 'ACTUANDO';
                    ag.tiempoEstado = 0;
                }
            } else if (ag.estado === 'ACTUANDO') {
                // Movimiento orbital suave pegado al tallo/follaje de la planta viva
                const ang = ag.tiempoEstado * (ag.tipo === 'abeja' ? 3.0 : 1.4) + ag.id;
                const radio = ag.tipo === 'larva' ? 0.065 : ag.tipo === 'catarina' ? 0.14 : 0.24;
                const altPlanta = Math.max(0.45, Math.min(1.4, nodo.plantaInterna.alturaMetros * 0.65));
                const altBase = ag.tipo === 'larva' ? altPlanta * 0.55 : ag.tipo === 'catarina' ? altPlanta * 0.65 : altPlanta * 0.85;
                ag.posicion.set(
                    ag.destino.x + Math.cos(ang) * radio,
                    altBase + Math.sin(ang * 2) * 0.04,
                    ag.destino.z + Math.sin(ang) * radio
                );
                ag.raiz.position.copyFrom(ag.posicion);
                ag.raiz.rotation.y = -ang;

                // Efecto biológico sobre el nodo
                if (nodo && nodo.sembrada) {
                    if (ag.tipo === 'larva') {
                        nodo.plaga = Math.min(100, nodo.plaga + 1.2 * dt);
                    } else if (ag.tipo === 'ave') {
                        // Verificar si Don Elote está cerca (radio 2.6 m)
                        if (Vector3.Distance(nodo.posicionMundo, this.POS_DON_ELOTE) < this.RADIO_ESPANTAPAJAROS) {
                            ag.estado = 'HUYENDO';
                            ag.progreso = 0;
                        } else {
                            nodo.plaga = Math.min(100, nodo.plaga + 1.8 * dt);
                        }
                    } else if (ag.tipo === 'abeja') {
                        nodo.polinizacion = clamp01(nodo.polinizacion + 0.035 * dt);
                        nodo.plantaInterna.cuajado = Math.max(
                            nodo.plantaInterna.cuajado,
                            clamp01(0.45 + 0.55 * nodo.polinizacion)
                        );
                    } else if (ag.tipo === 'catarina') {
                        nodo.plaga = Math.max(0, nodo.plaga - 5.0 * dt);
                        // Si hay una larva en este nodo, ahuyentarla
                        for (let k = 0; k < this.pool.length; k++) {
                            const otro = this.pool[k];
                            if (otro.tipo === 'larva' && otro.estado === 'ACTUANDO' && otro.nodoObjetivo === ag.nodoObjetivo) {
                                otro.estado = 'HUYENDO';
                                otro.progreso = 0;
                            }
                        }
                    }
                }

                // Detección de manos 6DoF cercanas
                this.verificarManosCercanas(ag, manoIzq, manoDer);

                // Retirada natural tras 18 segundos
                if (ag.tiempoEstado > 18) {
                    ag.estado = 'HUYENDO';
                    ag.progreso = 0;
                }
            } else if (ag.estado === 'HUYENDO') {
                ag.progreso = clamp01(ag.progreso + dt * 1.1);
                Vector3.LerpToRef(ag.destino, ag.origen, ag.progreso, ag.posicion);
                ag.posicion.y += ag.progreso * 1.2;
                ag.raiz.position.copyFrom(ag.posicion);
                if (ag.progreso >= 1) {
                    ag.estado = 'INACTIVO';
                    ag.raiz.setEnabled(false);
                }
            }
        }

        // Sonido espacial periódico de agentes activos
        if (this.timerSonido > 4.2) {
            this.timerSonido = 0;
            for (let i = 0; i < this.pool.length; i++) {
                const ag = this.pool[i];
                if (ag.estado === 'ACTUANDO') {
                    if (ag.tipo === 'abeja') {
                        this.audio.abeja(ag.posicion);
                        break;
                    } else if (ag.tipo === 'ave') {
                        this.audio.pajaro(ag.posicion);
                        break;
                    }
                }
            }
        }
    }

    private verificarManosCercanas(ag: AgenteFauna, manoIzq?: ManoVR | null, manoDer?: ManoVR | null): void {
        const manos = [manoIzq, manoDer];
        for (let m = 0; m < manos.length; m++) {
            const mano = manos[m];
            if (!mano || !mano.conectada) continue;
            const d = Vector3.Distance(mano.pos, ag.posicion);
            if (d < 0.38) {
                if (ag.tipo === 'larva' && (mano.agarre > 0.5 || mano.gatillo > 0.5)) {
                    mano.pulso(0.35, 25);
                    this.interactuarConAgente(ag.id);
                    return;
                } else if (ag.tipo === 'ave' && mano.velEscalar > 0.9) {
                    mano.pulso(0.3, 25);
                    this.interactuarConAgente(ag.id);
                    return;
                } else if ((ag.tipo === 'abeja' || ag.tipo === 'catarina') && mano.velEscalar > 1.6) {
                    this.interactuarConAgente(ag.id, true);
                    return;
                }
            }
        }
    }

    private intentarSpawn(): void {
        // Buscar únicamente nodos con plantas vivas y no cosechadas
        const sembrados = this.surco.nodos.filter(
            (n) =>
                n.sembrada &&
                !n.cosechada &&
                n.plantaInterna.estado !== 'MUERTA' &&
                !n.estadoCrec.estaMuerta &&
                n.diasCultivo >= 15
        );
        if (sembrados.length === 0) return;

        const nodo = sembrados[Math.floor(Math.random() * sembrados.length)];
        const dia = nodo.diasCultivo;

        // Elegir qué tipo de agente activar según la fenología y asociación Milpa
        let candidato: AgenteFauna | undefined;
        if (nodo.frijolVid > 0.2 || nodo.calabazaCobertura > 0.2) {
            candidato = this.pool.find(
                (a) => a.estado === 'INACTIVO' && (a.tipo === 'abeja' || a.tipo === 'catarina')
            );
        }
        if (!candidato && dia >= 100 && Vector3.Distance(nodo.posicionMundo, this.POS_DON_ELOTE) >= this.RADIO_ESPANTAPAJAROS) {
            candidato = this.pool.find((a) => a.estado === 'INACTIVO' && a.tipo === 'ave');
        }
        if (!candidato && dia >= 20) {
            candidato = this.pool.find((a) => a.estado === 'INACTIVO' && (a.tipo === 'larva' || a.tipo === 'abeja'));
        }

        if (!candidato) return;

        candidato.estado = 'LLEGANDO';
        candidato.nodoObjetivo = nodo.id;
        candidato.progreso = 0;
        candidato.tiempoEstado = 0;
        candidato.origen.set(nodo.posicionMundo.x + (Math.random() - 0.5) * 3, 2.4, -3.2);
        candidato.destino.copyFrom(nodo.posicionMundo);
        candidato.destino.y = 0.85;
        candidato.raiz.position.copyFrom(candidato.origen);
        candidato.raiz.setEnabled(true);
    }
}
