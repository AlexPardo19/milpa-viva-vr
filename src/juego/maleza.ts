import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Matrix,
    Vector3,
    Quaternion,
    Mesh,
    ActionManager,
    ExecuteCodeAction
} from '@babylonjs/core';
import { SurcoMilpa } from '../surco_milpa';
import { CanastaRecoleccion3D } from '../vr/canasta_cosecha';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp01 } from './util';

/**
 * M3: Sistema de Maleza y Quelites Comestibles (Thin Instances Zero-GC)
 * - 48 instancias (8 por cada una de las 6 estaciones: 6 hierbas competidoras + 2 quelites comestibles).
 * - Competencia real en V2..V8 (implementada en surco_milpa.ts) y supresión por cobertura de calabaza/frijol.
 * - Arrancar con jalón suave extrae de raíz y recolecta quelites para el Fogón; jalón brusco troza el tallo.
 */
export class MalezaSistema {
    private scene: Scene;
    private surco: SurcoMilpa;
    private canasta: CanastaRecoleccion3D | null;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    private mallaMaleza!: Mesh;
    private mallaQuelite!: Mesh;
    private bufferMaleza: Float32Array;
    private bufferQuelite: Float32Array;

    // 6 nodos * 6 malezas = 36; 6 nodos * 2 quelites = 12
    private readonly MALEZAS_POR_NODO = 6;
    private readonly QUELITES_POR_NODO = 2;
    private offsetsLocalesMaleza: Vector3[] = [];
    private offsetsLocalesQuelite: Vector3[] = [];

    private tmpMat: Matrix = Matrix.Identity();
    private tmpScale: Vector3 = new Vector3();
    private tmpPos: Vector3 = new Vector3();
    private tmpRot: Quaternion = Quaternion.Identity();

    public onMensajeToast?: (msg: string) => void;

    constructor(
        scene: Scene,
        surco: SurcoMilpa,
        canasta: CanastaRecoleccion3D | null,
        audio: AudioSintetizador,
        bus: BusEventos
    ) {
        this.scene = scene;
        this.surco = surco;
        this.canasta = canasta;
        this.audio = audio;
        this.bus = bus;

        this.bufferMaleza = new Float32Array(this.surco.nodos.length * this.MALEZAS_POR_NODO * 16);
        this.bufferQuelite = new Float32Array(this.surco.nodos.length * this.QUELITES_POR_NODO * 16);

        this.inicializarGeometria();
        this.actualizarThinInstances();
    }

    private inicializarGeometria(): void {
        // Offsets radiales anclados directamente sobre la superficie del montículo de tierra (r = 0.13..0.19)
        for (let i = 0; i < this.MALEZAS_POR_NODO; i++) {
            const ang = (i / this.MALEZAS_POR_NODO) * Math.PI * 2 + 0.3;
            const r = 0.13 + (i % 2) * 0.05;
            this.offsetsLocalesMaleza.push(new Vector3(Math.cos(ang) * r, 0.015, Math.sin(ang) * r));
        }
        for (let j = 0; j < this.QUELITES_POR_NODO; j++) {
            const ang = j * Math.PI + 0.85;
            const r = 0.16;
            this.offsetsLocalesQuelite.push(new Vector3(Math.cos(ang) * r, 0.02, Math.sin(ang) * r));
        }

        // 1. Malla base de maleza común (macollo de zacate silvestre con 5 briznas divergentes desde la raíz en y=0)
        const briznasMaleza: Mesh[] = [];
        for (let b = 0; b < 5; b++) {
            const angB = (b / 5) * Math.PI * 2;
            const brizna = MeshBuilder.CreateCylinder(
                `briznaM_${b}`,
                { height: 0.19, diameterTop: 0.006, diameterBottom: 0.024, tessellation: 5 },
                this.scene
            );
            brizna.position.set(Math.cos(angB) * 0.022, 0.085, Math.sin(angB) * 0.022);
            brizna.rotation.z = -Math.cos(angB) * 0.38;
            brizna.rotation.x = Math.sin(angB) * 0.38;
            briznasMaleza.push(brizna);
        }
        this.mallaMaleza = Mesh.MergeMeshes(briznasMaleza, true, true, undefined, false, false) as Mesh;
        this.mallaMaleza.name = 'malezaThinBase';

        const matMaleza = new StandardMaterial('matMalezaThin', this.scene);
        matMaleza.diffuseColor = Color3.FromHexString('#558b2f');
        matMaleza.emissiveColor = Color3.FromHexString('#33691e').scale(0.18);
        matMaleza.specularColor = new Color3(0.05, 0.06, 0.04);
        this.mallaMaleza.material = matMaleza;

        // 2. Malla base de Quelite comestible (tallo central + 5 hojas anchas romboidales desde la base en y=0)
        const partesQuelite: Mesh[] = [];
        const talloQ = MeshBuilder.CreateCylinder(
            'talloQ',
            { height: 0.21, diameterTop: 0.014, diameterBottom: 0.026, tessellation: 6 },
            this.scene
        );
        talloQ.position.y = 0.105;
        partesQuelite.push(talloQ);

        for (let h = 0; h < 5; h++) {
            const angH = h * 2.399;
            const altH = 0.06 + h * 0.032;
            const hojaQ = MeshBuilder.CreateCylinder(
                `hojaQ_${h}`,
                { height: 0.012, diameterTop: 0.075, diameterBottom: 0.055, tessellation: 6 },
                this.scene
            );
            hojaQ.scaling.set(1.3, 1, 0.85);
            hojaQ.position.set(Math.cos(angH) * 0.038, altH, Math.sin(angH) * 0.038);
            hojaQ.rotation.z = -Math.cos(angH) * 0.28;
            hojaQ.rotation.x = Math.sin(angH) * 0.28;
            partesQuelite.push(hojaQ);
        }
        this.mallaQuelite = Mesh.MergeMeshes(partesQuelite, true, true, undefined, false, false) as Mesh;
        this.mallaQuelite.name = 'queliteThinBase';

        const matQuelite = new StandardMaterial('matQueliteThin', this.scene);
        matQuelite.diffuseColor = Color3.FromHexString('#2e6b34');
        matQuelite.emissiveColor = Color3.FromHexString('#1b4320').scale(0.18);
        matQuelite.specularColor = new Color3(0.06, 0.08, 0.05);
        this.mallaQuelite.material = matQuelite;

        // Interacción por clic en Desktop / Puntero VR
        const registrarClick = (malla: Mesh) => {
            malla.isPickable = true;
            malla.actionManager = new ActionManager(this.scene);
            malla.actionManager.registerAction(
                new ExecuteCodeAction(ActionManager.OnPickTrigger, (evt) => {
                    const posPick = evt.additionalData?.pickedPoint || malla.getAbsolutePosition();
                    const nodo = this.surco.obtenerNodoCercano(posPick);
                    this.deshierbarNodo(nodo.id, 0.65);
                })
            );
        };
        registrarClick(this.mallaMaleza);
        registrarClick(this.mallaQuelite);

        this.mallaMaleza.thinInstanceSetBuffer('matrix', this.bufferMaleza, 16, false);
        this.mallaQuelite.thinInstanceSetBuffer('matrix', this.bufferQuelite, 16, false);
    }

    /**
     * Actualiza el buffer de matrices de las 48 thin instances sin alojar objetos en el heap
     */
    public actualizarThinInstances(): void {
        const numNodos = this.surco.nodos.length;

        for (let n = 0; n < numNodos; n++) {
            const nodo = this.surco.nodos[n];
            const plantaViva =
                nodo.sembrada &&
                nodo.plantaInterna.estado !== 'MUERTA' &&
                !nodo.estadoCrec.estaMuerta;
            const nivel = plantaViva ? clamp01(nodo.maleza / 100) : 0;
            const esc = nivel > 0.04 ? 0.30 + nivel * 0.85 : 0.0001;
            const ySuelo = nivel > 0.04 ? nodo.posicionMundo.y + 0.015 : -10;

            // Malezas comunes
            for (let i = 0; i < this.MALEZAS_POR_NODO; i++) {
                const idx = (n * this.MALEZAS_POR_NODO + i) * 16;
                const off = this.offsetsLocalesMaleza[i];
                this.tmpScale.set(esc, esc, esc);
                this.tmpPos.set(
                    nodo.posicionMundo.x + off.x,
                    ySuelo,
                    nodo.posicionMundo.z + off.z
                );
                Quaternion.RotationYawPitchRollToRef(i * 1.1 + n, 0.06, 0, this.tmpRot);
                Matrix.ComposeToRef(this.tmpScale, this.tmpRot, this.tmpPos, this.tmpMat);
                this.tmpMat.copyToArray(this.bufferMaleza, idx);
            }

            // Quelites comestibles
            for (let j = 0; j < this.QUELITES_POR_NODO; j++) {
                const idxQ = (n * this.QUELITES_POR_NODO + j) * 16;
                const offQ = this.offsetsLocalesQuelite[j];
                this.tmpScale.set(esc, esc * 1.08, esc);
                this.tmpPos.set(
                    nodo.posicionMundo.x + offQ.x,
                    ySuelo,
                    nodo.posicionMundo.z + offQ.z
                );
                Quaternion.RotationYawPitchRollToRef(j * 2.2 + n, -0.05, 0, this.tmpRot);
                Matrix.ComposeToRef(this.tmpScale, this.tmpRot, this.tmpPos, this.tmpMat);
                this.tmpMat.copyToArray(this.bufferQuelite, idxQ);
            }
        }

        this.mallaMaleza.thinInstanceBufferUpdated('matrix');
        this.mallaQuelite.thinInstanceBufferUpdated('matrix');
    }

    /**
     * Arranca la maleza de un nodo. Si el jalón es suave (0.3..1.1 m/s), arranca de raíz
     * y recolecta quelites comestibles en la canasta. Si es muy brusco (> 1.1 m/s), troza el tallo.
     */
    public deshierbarNodo(nodoId: number, velJalon: number = 0.65): { exito: boolean; mensaje: string } {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo || nodo.maleza <= 4) {
            return { exito: false, mensaje: `Estación #${nodoId + 1} está limpia de maleza.` };
        }

        const eraAlta = nodo.maleza >= 22;
        const jalonSuave = velJalon <= 1.15;

        if (jalonSuave) {
            nodo.maleza = 0;
            this.audio.ararTierra(nodo.posicionMundo);
            if (eraAlta) {
                if (this.canasta) {
                    this.canasta.depositarIngrediente('quelite');
                }
                this.bus.emitir({ t: 'deshierbe', nodo: nodoId, cantidad: 1, quelites: 1, limpio: true });
                this.actualizarThinInstances();
                const msg = `🌿 ¡Deshierbe de raíz en Estación #${nodoId + 1}! Recolectaste Quelites frescos para el Fogón.`;
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: true, mensaje: msg };
            } else {
                this.bus.emitir({ t: 'deshierbe', nodo: nodoId, cantidad: 1, quelites: 0, limpio: true });
                this.actualizarThinInstances();
                const msg = `🌱 Maleza arrancada de raíz en Estación #${nodoId + 1}.`;
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: true, mensaje: msg };
            }
        } else {
            // Jalón demasiado brusco: se troza el tallo y queda raíz viva
            nodo.maleza = Math.max(20, nodo.maleza * 0.45);
            this.audio.ararTierra(nodo.posicionMundo);
            this.actualizarThinInstances();
            const msg = `⚠️ Jalón muy brusco en Estación #${nodoId + 1}: se trozó el tallo y rebrotará pronto.`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }
    }
}
