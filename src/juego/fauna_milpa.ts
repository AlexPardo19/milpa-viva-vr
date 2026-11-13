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
    private tiempoTotal = 0;
    private tiempoUltimaLarva = -30;
    private cooldownLarvaNodo = new Map<number, number>();

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

        const aplicarContorno = (m: any) => {
            m.renderOutline = true;
            m.outlineWidth = 0.008;
            m.outlineColor = Color3.FromHexString('#1a240a');
        };

        if (tipo === 'larva') {
            // Oruga cogollera voxel estilo pixel-art con segmentos alternados, banda dorsal y mandíbulas
            mat.diffuseColor = Color3.FromHexString('#65a30d');
            mat.emissiveColor = Color3.FromHexString('#365314').scale(0.28);

            const matClaro = new StandardMaterial(`matLarvaClaro_${id}`, this.scene);
            matClaro.diffuseColor = Color3.FromHexString('#84cc16');
            matClaro.emissiveColor = Color3.FromHexString('#4d7c0f').scale(0.28);
            matClaro.specularColor = Color3.Black();

            const matBanda = new StandardMaterial(`matLarvaBanda_${id}`, this.scene);
            matBanda.diffuseColor = Color3.FromHexString('#bef264');
            matBanda.emissiveColor = Color3.FromHexString('#84cc16').scale(0.3);
            matBanda.specularColor = Color3.Black();

            for (let s = 0; s < 5; s++) {
                const sizeSeg = 0.052 - s * 0.004;
                const seg = MeshBuilder.CreateBox(
                    `larvaSeg_${id}_${s}`,
                    { width: sizeSeg * 1.12, height: sizeSeg, depth: sizeSeg },
                    this.scene
                );
                seg.position.set(s * 0.044 - 0.04, Math.sin(s * 1.1) * 0.009, 0);
                seg.material = s % 2 === 0 ? mat : matClaro;
                seg.parent = raiz;
                aplicarContorno(seg);
                this.registrarClickAgente(seg, id);

                const banda = MeshBuilder.CreateBox(
                    `larvaBanda_${id}_${s}`,
                    { width: sizeSeg * 0.72, height: 0.012, depth: sizeSeg * 0.55 },
                    this.scene
                );
                banda.position.y = sizeSeg * 0.52;
                banda.material = matBanda;
                banda.parent = seg;
            }

            const matCab = new StandardMaterial(`matLarvaCab_${id}`, this.scene);
            matCab.diffuseColor = Color3.FromHexString('#451a03');
            matCab.emissiveColor = Color3.FromHexString('#451a03').scale(0.2);
            matCab.specularColor = Color3.Black();

            const cab = MeshBuilder.CreateBox(
                `larvaCab_${id}`,
                { width: 0.054, height: 0.054, depth: 0.054 },
                this.scene
            );
            cab.position.set(-0.088, 0.006, 0);
            cab.material = matCab;
            cab.parent = raiz;
            aplicarContorno(cab);
            this.registrarClickAgente(cab, id);

            const matMand = new StandardMaterial(`matLarvaMand_${id}`, this.scene);
            matMand.diffuseColor = Color3.FromHexString('#fef08a');
            matMand.emissiveColor = Color3.FromHexString('#ca8a04').scale(0.35);
            matMand.specularColor = Color3.Black();
            const matOjo = new StandardMaterial(`matLarvaOjo_${id}`, this.scene);
            matOjo.diffuseColor = Color3.FromHexString('#ef4444');
            matOjo.emissiveColor = Color3.FromHexString('#ef4444').scale(0.5);
            matOjo.specularColor = Color3.Black();
            [-1, 1].forEach((lado, idx) => {
                const mand = MeshBuilder.CreateBox(
                    `larvaMand_${id}_${idx}`,
                    { width: 0.02, height: 0.014, depth: 0.014 },
                    this.scene
                );
                mand.position.set(-0.032, -0.014, lado * 0.015);
                mand.material = matMand;
                mand.parent = cab;

                const ojo = MeshBuilder.CreateBox(
                    `larvaOjo_${id}_${idx}`,
                    { width: 0.012, height: 0.012, depth: 0.012 },
                    this.scene
                );
                ojo.position.set(-0.024, 0.01, lado * 0.02);
                ojo.material = matOjo;
                ojo.parent = cab;
            });
        } else if (tipo === 'ave') {
            mat.diffuseColor = Color3.FromHexString('#1e293b');
            mat.emissiveColor = Color3.FromHexString('#1e293b').scale(0.24);
            const cuerpo = MeshBuilder.CreateBox(
                `aveCuerpo_${id}`,
                { width: 0.13, height: 0.11, depth: 0.21 },
                this.scene
            );
            cuerpo.material = mat;
            cuerpo.parent = raiz;
            aplicarContorno(cuerpo);

            for (const lado of [-1, 1]) {
                const ala = MeshBuilder.CreateBox(
                    `aveAla_${id}_${lado}`,
                    { width: 0.18, height: 0.02, depth: 0.12 },
                    this.scene
                );
                ala.position.set(lado * 0.12, 0.03, -0.01);
                ala.rotation.z = lado * 0.18;
                ala.material = mat;
                ala.parent = raiz;
                aplicarContorno(ala);
            }

            const matPico = new StandardMaterial(`matPico_${id}`, this.scene);
            matPico.diffuseColor = Color3.FromHexString('#f59e0b');
            matPico.emissiveColor = Color3.FromHexString('#d97706').scale(0.3);
            matPico.specularColor = Color3.Black();
            const pico = MeshBuilder.CreateBox(
                `avePico_${id}`,
                { width: 0.038, height: 0.032, depth: 0.075 },
                this.scene
            );
            pico.position.set(0, 0.015, 0.135);
            pico.material = matPico;
            pico.parent = raiz;
            aplicarContorno(pico);
            this.registrarClickAgente(cuerpo, id);
        } else if (tipo === 'abeja') {
            mat.diffuseColor = Color3.FromHexString('#fbbf24');
            mat.emissiveColor = Color3.FromHexString('#d97706').scale(0.3);
            const cuerpo = MeshBuilder.CreateBox(
                `abejaCuerpo_${id}`,
                { width: 0.052, height: 0.052, depth: 0.084 },
                this.scene
            );
            cuerpo.material = mat;
            cuerpo.parent = raiz;
            aplicarContorno(cuerpo);

            const matFranja = new StandardMaterial(`matAbejaFranja_${id}`, this.scene);
            matFranja.diffuseColor = Color3.FromHexString('#1f1612');
            matFranja.specularColor = Color3.Black();
            const franja = MeshBuilder.CreateBox(
                `abejaFranja_${id}`,
                { width: 0.056, height: 0.056, depth: 0.028 },
                this.scene
            );
            franja.material = matFranja;
            franja.parent = raiz;

            const matAla = new StandardMaterial(`matAbejaAla_${id}`, this.scene);
            matAla.diffuseColor = Color3.FromHexString('#e0f2fe');
            matAla.emissiveColor = Color3.FromHexString('#bae6fd').scale(0.35);
            matAla.alpha = 0.72;
            matAla.specularColor = Color3.Black();
            for (const lado of [-1, 1]) {
                const ala = MeshBuilder.CreateBox(
                    `abejaAla_${id}_${lado}`,
                    { width: 0.055, height: 0.008, depth: 0.036 },
                    this.scene
                );
                ala.position.set(lado * 0.036, 0.032, 0);
                ala.rotation.z = lado * 0.25;
                ala.material = matAla;
                ala.parent = raiz;
            }
            this.registrarClickAgente(cuerpo, id);
        } else {
            // Catarina voxel roja con cabeza negra y puntos dorsales
            mat.diffuseColor = Color3.FromHexString('#dc2626');
            mat.emissiveColor = Color3.FromHexString('#b91c1c').scale(0.28);
            const caparazon = MeshBuilder.CreateBox(
                `catarina_${id}`,
                { width: 0.058, height: 0.038, depth: 0.068 },
                this.scene
            );
            caparazon.material = mat;
            caparazon.parent = raiz;
            aplicarContorno(caparazon);

            const matNegro = new StandardMaterial(`matCatNegro_${id}`, this.scene);
            matNegro.diffuseColor = Color3.FromHexString('#171717');
            matNegro.specularColor = Color3.Black();
            const cab = MeshBuilder.CreateBox(
                `catCab_${id}`,
                { width: 0.032, height: 0.026, depth: 0.026 },
                this.scene
            );
            cab.position.set(0, -0.003, 0.042);
            cab.material = matNegro;
            cab.parent = raiz;

            [-0.015, 0.015].forEach((px, pIdx) => {
                const punto = MeshBuilder.CreateBox(
                    `catPunto_${id}_${pIdx}`,
                    { size: 0.014 },
                    this.scene
                );
                punto.position.set(px, 0.021, -0.01);
                punto.material = matNegro;
                punto.parent = raiz;
            });
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
        this.tiempoTotal += dt;
        this.timerSpawn += dt;
        this.timerSonido += dt;

        // Intentar activar fauna cada 12 segundos (orugas tienen cooldown mucho más largo)
        if (this.timerSpawn > 12.0) {
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
                if (ag.tipo === 'larva') {
                    // Emerge suavemente desde debajo del montículo de tierra hacia la base del tallo
                    ag.progreso = clamp01(ag.progreso + dt * 0.42);
                    Vector3.LerpToRef(ag.origen, ag.destino, ag.progreso, ag.posicion);
                    ag.raiz.position.copyFrom(ag.posicion);
                    ag.raiz.rotation.z = (1 - ag.progreso) * 0.65;
                    ag.raiz.rotation.y = Math.sin(ag.progreso * 8) * 0.18;
                    if (ag.progreso >= 1) {
                        ag.estado = 'ACTUANDO';
                        ag.tiempoEstado = 0;
                        ag.raiz.rotation.z = 0;
                    }
                } else {
                    ag.progreso = clamp01(ag.progreso + dt * 0.65);
                    Vector3.LerpToRef(ag.origen, ag.destino, ag.progreso, ag.posicion);
                    ag.posicion.y += Math.sin(ag.progreso * Math.PI) * 0.4;
                    ag.raiz.position.copyFrom(ag.posicion);
                    if (ag.progreso >= 1) {
                        ag.estado = 'ACTUANDO';
                        ag.tiempoEstado = 0;
                    }
                }
            } else if (ag.estado === 'ACTUANDO') {
                // Movimiento orbital o trepado sobre el tallo/follaje de la planta viva
                const ang = ag.tiempoEstado * (ag.tipo === 'abeja' ? 3.0 : ag.tipo === 'larva' ? 1.8 : 1.4) + ag.id;
                const radio = ag.tipo === 'larva' ? 0.055 : ag.tipo === 'catarina' ? 0.14 : 0.24;
                const altPlanta = Math.max(0.45, Math.min(1.4, nodo.plantaInterna.alturaMetros * 0.65));
                const altBase = ag.tipo === 'larva'
                    ? nodo.posicionMundo.y + 0.16 + Math.min(0.42, ag.tiempoEstado * 0.025)
                    : ag.tipo === 'catarina'
                    ? altPlanta * 0.65
                    : altPlanta * 0.85;
                ag.posicion.set(
                    nodo.posicionMundo.x + Math.cos(ang) * radio,
                    altBase + (ag.tipo === 'larva' ? Math.sin(ag.tiempoEstado * 9.0) * 0.012 : Math.sin(ang * 2) * 0.04),
                    nodo.posicionMundo.z + Math.sin(ang) * radio
                );
                ag.raiz.position.copyFrom(ag.posicion);
                ag.raiz.rotation.y = -ang;
                if (ag.tipo === 'larva') {
                    // Movimiento de masticación / ondulación al devorar el maíz
                    ag.raiz.rotation.z = Math.sin(ag.tiempoEstado * 10.0) * 0.16;
                }

                // Efecto biológico sobre el nodo
                if (nodo && nodo.sembrada) {
                    if (ag.tipo === 'larva') {
                        nodo.plaga = Math.min(100, nodo.plaga + 0.75 * dt);
                    } else if (ag.tipo === 'ave') {
                        // Verificar si Don Elote está cerca (radio 2.6 m)
                        if (Vector3.Distance(nodo.posicionMundo, this.POS_DON_ELOTE) < this.RADIO_ESPANTAPAJAROS) {
                            ag.estado = 'HUYENDO';
                            ag.progreso = 0;
                        } else {
                            nodo.plaga = Math.min(100, nodo.plaga + 1.4 * dt);
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
                ag.posicion.y += ag.tipo === 'larva' ? -ag.progreso * 0.28 : ag.progreso * 1.2;
                ag.raiz.position.copyFrom(ag.posicion);
                if (ag.progreso >= 1) {
                    ag.estado = 'INACTIVO';
                    ag.raiz.rotation.set(0, 0, 0);
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
        if (!candidato && dia >= 22) {
            const larvaeActivas = this.pool.filter((a) => a.tipo === 'larva' && a.estado !== 'INACTIVO').length;
            const ultimaEnNodo = this.cooldownLarvaNodo.get(nodo.id) ?? -999;
            const puedeLarva =
                larvaeActivas < 1 &&
                this.tiempoTotal - this.tiempoUltimaLarva >= 34.0 &&
                this.tiempoTotal - ultimaEnNodo >= 75.0 &&
                Math.random() < 0.32;

            if (puedeLarva) {
                candidato = this.pool.find((a) => a.estado === 'INACTIVO' && a.tipo === 'larva');
            }
            if (!candidato) {
                candidato = this.pool.find((a) => a.estado === 'INACTIVO' && a.tipo === 'abeja');
            }
        }

        if (!candidato) return;

        if (candidato.tipo === 'larva') {
            this.activarEmergenciaLarva(candidato, nodo.id);
            return;
        }

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

    private activarEmergenciaLarva(candidato: AgenteFauna, nodoId: number): void {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo) return;
        this.tiempoUltimaLarva = this.tiempoTotal;
        this.cooldownLarvaNodo.set(nodoId, this.tiempoTotal);

        candidato.estado = 'LLEGANDO';
        candidato.nodoObjetivo = nodoId;
        candidato.progreso = 0;
        candidato.tiempoEstado = 0;
        candidato.raiz.rotation.set(0, 0, 0);
        // Emerge desde abajo del montículo de tierra hacia la base del tallo del maíz
        candidato.origen.set(
            nodo.posicionMundo.x + 0.08,
            nodo.posicionMundo.y - 0.16,
            nodo.posicionMundo.z + 0.05
        );
        candidato.destino.set(
            nodo.posicionMundo.x + 0.06,
            nodo.posicionMundo.y + 0.22,
            nodo.posicionMundo.z + 0.03
        );
        candidato.posicion.copyFrom(candidato.origen);
        candidato.raiz.position.copyFrom(candidato.origen);
        candidato.raiz.setEnabled(true);

        this.audio.clickUI();
        this.bus.emitir({ t: 'plaga', nodo: nodoId, tipo: 'cogollero', resuelta: false });
        if (this.onMensajeToast) {
            this.onMensajeToast(
                `⚠️ 🐛 ¡Alerta! Una oruga emergió bajo la Estación #${nodoId + 1} y empezó a comer el maíz. ¡Retírala con [Clic] o [1] Mano!`
            );
        }
    }

    public forzarEmergenciaLarva(nodoId: number): boolean {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo || !nodo.sembrada || nodo.cosechada) return false;
        const candidato = this.pool.find((a) => a.estado === 'INACTIVO' && a.tipo === 'larva');
        if (!candidato) return false;
        this.activarEmergenciaLarva(candidato, nodoId);
        return true;
    }
}
