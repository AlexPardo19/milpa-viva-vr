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
import { CanastaRecoleccion3D } from '../vr/canasta_cosecha';
import { AudioSintetizador } from '../audio_sintetizador';
import { BusEventos } from './bus_eventos';
import { clamp01 } from './util';

interface VisualTriadaNodo {
    nodoId: number;
    raizFrijol: TransformNode;
    raizCalabaza: TransformNode;
    ultimoFrijol: number;
    ultimaCalabaza: number;
}

/**
 * M7: Asociación Milpa «Las Tres Hermanas» 3D Interactiva
 * - Frijol trepador (Phaseolus vulgaris): espiral ascendente sobre la caña de maíz que fija nitrógeno (+N/día)
 *   y aporta resistencia contra el acame (viento).
 * - Calabaza rastrera (Cucurbita pepo): hojas anchas a ras de suelo que reducen evaporación (-30%) y
 *   suprimen maleza (-50%), además de flores amarillas que atraen abejas polinizadoras.
 */
export class TriadaViva {
    private scene: Scene;
    private surco: SurcoMilpa;
    private canasta: CanastaRecoleccion3D | null;
    private audio: AudioSintetizador;
    private bus: BusEventos;

    private visuales: VisualTriadaNodo[] = [];
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

        this.construirVisualesNodos();
    }

    private construirVisualesNodos(): void {
        const matGuiaFrijol = new StandardMaterial('matGuiaFrijol', this.scene);
        matGuiaFrijol.diffuseColor = Color3.FromHexString('#387a3b');
        matGuiaFrijol.emissiveColor = Color3.FromHexString('#255827').scale(0.02);
        matGuiaFrijol.specularColor = new Color3(0.06, 0.08, 0.05);

        const matHojaFrijol = new StandardMaterial('matHojaFrijol', this.scene);
        matHojaFrijol.diffuseColor = Color3.FromHexString('#439246');
        matHojaFrijol.emissiveColor = Color3.FromHexString('#295f2b').scale(0.02);
        matHojaFrijol.specularColor = new Color3(0.05, 0.07, 0.04);

        const matVaina = new StandardMaterial('matVainaFrijol', this.scene);
        matVaina.diffuseColor = Color3.FromHexString('#689f38');
        matVaina.emissiveColor = Color3.FromHexString('#4b7824').scale(0.02);
        matVaina.specularColor = new Color3(0.08, 0.1, 0.06);

        const matFlorFrijol = new StandardMaterial('matFlorFrijol', this.scene);
        matFlorFrijol.diffuseColor = Color3.FromHexString('#f5f3ff');
        matFlorFrijol.emissiveColor = Color3.FromHexString('#ddd6fe').scale(0.03);
        matFlorFrijol.specularColor = Color3.Black();

        const matGuiaCalabaza = new StandardMaterial('matGuiaCalabaza', this.scene);
        matGuiaCalabaza.diffuseColor = Color3.FromHexString('#3b7a36');
        matGuiaCalabaza.emissiveColor = Color3.FromHexString('#244f21').scale(0.02);
        matGuiaCalabaza.specularColor = new Color3(0.05, 0.07, 0.04);

        const matHojaCalabaza = new StandardMaterial('matHojaCalabaza', this.scene);
        matHojaCalabaza.diffuseColor = Color3.FromHexString('#2e6f32');
        matHojaCalabaza.emissiveColor = Color3.FromHexString('#1d4b20').scale(0.02);
        matHojaCalabaza.specularColor = new Color3(0.06, 0.08, 0.05);

        const matFlorCalabaza = new StandardMaterial('matFlorCalabaza', this.scene);
        matFlorCalabaza.diffuseColor = Color3.FromHexString('#f59e0b');
        matFlorCalabaza.emissiveColor = Color3.FromHexString('#d97706').scale(0.03);
        matFlorCalabaza.specularColor = Color3.Black();

        const matFrutoCalabaza = new StandardMaterial('matFrutoCalabaza', this.scene);
        matFrutoCalabaza.diffuseColor = Color3.FromHexString('#d97706');
        matFrutoCalabaza.emissiveColor = Color3.FromHexString('#92400e').scale(0.02);
        matFrutoCalabaza.specularColor = new Color3(0.08, 0.06, 0.04);

        const matPedunculo = new StandardMaterial('matPedunculoCalabaza', this.scene);
        matPedunculo.diffuseColor = Color3.FromHexString('#5c4d26');
        matPedunculo.emissiveColor = Color3.FromHexString('#3b3117').scale(0.02);

        for (let i = 0; i < this.surco.nodos.length; i++) {
            const nodo = this.surco.nodos[i];

            // 1. Guía espiral de Frijol (Phaseolus vulgaris) abrazada al tallo con hojas trifoliadas y vainas colgantes conectadas
            const raizFrijol = new TransformNode(`triadaFrijol_${i}`, this.scene);
            raizFrijol.position.copyFrom(nodo.posicionMundo);

            const puntosEspiral: Vector3[] = [];
            for (let p = 0; p < 20; p++) {
                const t = p / 19;
                const ang = t * Math.PI * 5.5;
                const r = 0.036 + (1 - t) * 0.018;
                puntosEspiral.push(new Vector3(Math.cos(ang) * r, 0.02 + t * 0.96, Math.sin(ang) * r));
            }
            const tuboFrijol = MeshBuilder.CreateTube(
                `tuboFrijol_${i}`,
                { path: puntosEspiral, radius: 0.009, tessellation: 7 },
                this.scene
            );
            tuboFrijol.material = matGuiaFrijol;
            tuboFrijol.parent = raizFrijol;

            // Hojas trifoliadas a lo largo de la guía
            for (let h = 2; h < 18; h += 2) {
                const pt = puntosEspiral[h];
                const angOut = Math.atan2(pt.z, pt.x);
                const nodoHoja = new TransformNode(`nodoHojaFrijol_${i}_${h}`, this.scene);
                nodoHoja.parent = raizFrijol;
                nodoHoja.position.copyFrom(pt);
                nodoHoja.rotation.y = -angOut;

                for (let fol = -1; fol <= 1; fol++) {
                    const foliolo = MeshBuilder.CreateDisc(
                        `folioloFrijol_${i}_${h}_${fol}`,
                        { radius: fol === 0 ? 0.032 : 0.025, tessellation: 8 },
                        this.scene
                    );
                    foliolo.position.set(0.026 + (fol === 0 ? 0.014 : 0), 0.005, fol * 0.022);
                    foliolo.rotation.x = Math.PI / 2.3;
                    foliolo.rotation.z = -0.25;
                    foliolo.scaling.set(1.3, 0.85, 1);
                    foliolo.material = matHojaFrijol;
                    foliolo.parent = nodoHoja;
                }
            }

            // Vainas curvas de frijol conectadas directamente a los nudos de la guía espiral
            const indicesVainas = [4, 8, 12, 16];
            for (let v = 0; v < indicesVainas.length; v++) {
                const pt = puntosEspiral[indicesVainas[v]];
                const dirX = pt.x / Math.max(0.001, Math.hypot(pt.x, pt.z));
                const dirZ = pt.z / Math.max(0.001, Math.hypot(pt.x, pt.z));
                const pathVaina = [
                    pt.clone(),
                    new Vector3(pt.x + dirX * 0.022, pt.y - 0.025, pt.z + dirZ * 0.022),
                    new Vector3(pt.x + dirX * 0.034, pt.y - 0.068, pt.z + dirZ * 0.034),
                    new Vector3(pt.x + dirX * 0.026, pt.y - 0.105, pt.z + dirZ * 0.026)
                ];
                const vaina = MeshBuilder.CreateTube(
                    `vainaFrijol_${i}_${v}`,
                    {
                        path: pathVaina,
                        radiusFunction: (idx) => (idx === 0 ? 0.005 : idx === 3 ? 0.007 : 0.013),
                        tessellation: 7
                    },
                    this.scene
                );
                vaina.material = matVaina;
                vaina.parent = raizFrijol;
                this.registrarClickCosechaAsociado(vaina, i, 'frijol');
            }

            // Pequeñas flores de frijol en la parte media-alta de la guía
            for (const idxF of [10, 14, 17]) {
                const pt = puntosEspiral[idxF];
                const florF = MeshBuilder.CreateSphere(
                    `florFrijol_${i}_${idxF}`,
                    { diameter: 0.024, segments: 6 },
                    this.scene
                );
                florF.position.set(pt.x * 1.18, pt.y + 0.01, pt.z * 1.18);
                florF.scaling.set(1.2, 0.8, 1.0);
                florF.material = matFlorFrijol;
                florF.parent = raizFrijol;
            }
            raizFrijol.setEnabled(false);

            // 2. Cobertura rastrera de Calabaza (Cucurbita pepo): guías a ras de tierra, pecíolos, hojas lobuladas, flores y fruto acostillado
            const raizCalabaza = new TransformNode(`triadaCalabaza_${i}`, this.scene);
            raizCalabaza.position.copyFrom(nodo.posicionMundo);

            const numGuias = 4;
            for (let g = 0; g < numGuias; g++) {
                const angBase = (g / numGuias) * Math.PI * 2 + 0.35;
                const pathGuia: Vector3[] = [];
                for (let step = 0; step <= 6; step++) {
                    const s = step / 6;
                    const dist = 0.06 + s * 0.32;
                    const desv = Math.sin(s * Math.PI * 1.5 + g) * 0.08;
                    const ang = angBase + desv;
                    pathGuia.push(new Vector3(Math.cos(ang) * dist, 0.018 + (1 - s) * 0.015, Math.sin(ang) * dist));
                }
                const guia = MeshBuilder.CreateTube(
                    `guiaCalabaza_${i}_${g}`,
                    { path: pathGuia, radius: 0.010, tessellation: 6 },
                    this.scene
                );
                guia.material = matGuiaCalabaza;
                guia.parent = raizCalabaza;

                // Hojas anchas con su pecíolo conectado a la guía rastrera
                for (const pasoHoja of [2, 5]) {
                    const ptBase = pathGuia[pasoHoja];
                    const lado = pasoHoja === 2 ? 1 : -1;
                    const angHoja = angBase + lado * 0.35;
                    const posLamina = new Vector3(
                        ptBase.x + Math.cos(angHoja) * 0.04,
                        0.065,
                        ptBase.z + Math.sin(angHoja) * 0.04
                    );

                    const peciolo = MeshBuilder.CreateTube(
                        `pecioloCal_${i}_${g}_${pasoHoja}`,
                        { path: [ptBase, posLamina], radius: 0.007, tessellation: 5 },
                        this.scene
                    );
                    peciolo.material = matGuiaCalabaza;
                    peciolo.parent = raizCalabaza;

                    const hoja = MeshBuilder.CreateCylinder(
                        `hojaCalabaza_${i}_${g}_${pasoHoja}`,
                        { height: 0.014, diameterTop: 0.21, diameterBottom: 0.18, tessellation: 9 },
                        this.scene
                    );
                    hoja.position.copyFrom(posLamina);
                    hoja.scaling.set(1.15, 1, 0.95);
                    hoja.rotation.z = lado * 0.12;
                    hoja.rotation.x = 0.08;
                    hoja.material = matHojaCalabaza;
                    hoja.parent = raizCalabaza;
                }
            }

            // Flores de calabaza acampanadas con cáliz verde unidas al suelo
            for (let f = 0; f < 2; f++) {
                const ang = f * Math.PI + 1.05;
                const xF = Math.cos(ang) * 0.21;
                const zF = Math.sin(ang) * 0.21;

                const talloFlor = MeshBuilder.CreateCylinder(
                    `calizFlor_${i}_${f}`,
                    { height: 0.045, diameterTop: 0.022, diameterBottom: 0.012, tessellation: 6 },
                    this.scene
                );
                talloFlor.position.set(xF, 0.035, zF);
                talloFlor.material = matGuiaCalabaza;
                talloFlor.parent = raizCalabaza;

                const flor = MeshBuilder.CreateCylinder(
                    `florCalabaza_${i}_${f}`,
                    { height: 0.068, diameterTop: 0.088, diameterBottom: 0.022, tessellation: 7 },
                    this.scene
                );
                flor.position.set(xF, 0.082, zF);
                flor.rotation.z = (f === 0 ? 1 : -1) * 0.15;
                flor.material = matFlorCalabaza;
                flor.parent = raizCalabaza;
                this.registrarClickCosechaAsociado(flor, i, 'calabaza');
            }

            // Fruto de calabaza criolla acostillada (gajos radiales + pedúnculo leñoso) apoyado en la tierra
            const nodoFruto = new TransformNode(`nodoFrutoCalabaza_${i}`, this.scene);
            nodoFruto.parent = raizCalabaza;
            nodoFruto.position.set(0.22, 0.068, -0.17);

            const centroFruto = MeshBuilder.CreateSphere(
                `frutoCalabaza_${i}`,
                { diameter: 0.16, segments: 10 },
                this.scene
            );
            centroFruto.scaling.set(1.12, 0.72, 1.12);
            centroFruto.material = matFrutoCalabaza;
            centroFruto.parent = nodoFruto;
            this.registrarClickCosechaAsociado(centroFruto, i, 'calabaza');

            for (let gajoIdx = 0; gajoIdx < 6; gajoIdx++) {
                const aG = (gajoIdx / 6) * Math.PI * 2;
                const gajo = MeshBuilder.CreateSphere(
                    `gajoCal_${i}_${gajoIdx}`,
                    { diameter: 0.115, segments: 8 },
                    this.scene
                );
                gajo.position.set(Math.cos(aG) * 0.042, 0, Math.sin(aG) * 0.042);
                gajo.scaling.set(0.95, 0.92, 0.95);
                gajo.material = matFrutoCalabaza;
                gajo.parent = nodoFruto;
                this.registrarClickCosechaAsociado(gajo, i, 'calabaza');
            }

            const pedunculo = MeshBuilder.CreateTube(
                `pedunculoCal_${i}`,
                {
                    path: [
                        new Vector3(0, 0.052, 0),
                        new Vector3(-0.015, 0.082, 0.01),
                        new Vector3(-0.035, 0.092, 0.02)
                    ],
                    radius: 0.012,
                    tessellation: 6
                },
                this.scene
            );
            pedunculo.material = matPedunculo;
            pedunculo.parent = nodoFruto;

            raizCalabaza.setEnabled(false);

            this.visuales.push({
                nodoId: i,
                raizFrijol,
                raizCalabaza,
                ultimoFrijol: 0,
                ultimaCalabaza: 0
            });
        }
    }

    private registrarClickCosechaAsociado(malla: any, nodoId: number, cultivo: 'frijol' | 'calabaza'): void {
        malla.isPickable = true;
        malla.actionManager = new ActionManager(this.scene);
        malla.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
                this.cosecharAsociado(nodoId, cultivo);
            })
        );
    }

    /**
     * Siembra Frijol o Calabaza en el nodo indicado y actualiza la geometría 3D
     */
    public sembrarAsociadoEnNodo(nodoId: number, cultivo: 'frijol' | 'calabaza'): { exito: boolean; mensaje: string } {
        const res = this.surco.sembrarAsociado(nodoId, cultivo);
        if (res.exito) {
            this.bus.emitir({ t: 'triada', nodo: nodoId, cultivo });
            this.actualizarVisuales();
            if (this.onMensajeToast) this.onMensajeToast(res.mensaje);
        }
        return res;
    }

    /**
     * Cosecha vainas de frijol o flor/fruto de calabaza cuando están desarrollados
     */
    public cosecharAsociado(nodoId: number, cultivo: 'frijol' | 'calabaza'): { exito: boolean; mensaje: string } {
        const nodo = this.surco.nodos[nodoId];
        if (!nodo) return { exito: false, mensaje: 'Estación inválida.' };

        if (cultivo === 'frijol') {
            if (nodo.frijolVid < 0.45) {
                const msg = `🫘 El frijol en Estación #${nodoId + 1} aún está creciendo (${Math.round(nodo.frijolVid * 100)}%).`;
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: false, mensaje: msg };
            }
            if (this.canasta) this.canasta.depositarIngrediente('frijol');
            this.audio.cosecharExito(nodo.posicionMundo);
            const msg = `🫘 ¡Cosechaste vainas de Frijol de milpa en Estación #${nodoId + 1}!`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        } else {
            if (nodo.calabazaCobertura < 0.45) {
                const msg = `🎃 La calabaza en Estación #${nodoId + 1} aún está creciendo (${Math.round(nodo.calabazaCobertura * 100)}%).`;
                if (this.onMensajeToast) this.onMensajeToast(msg);
                return { exito: false, mensaje: msg };
            }
            if (this.canasta) this.canasta.depositarIngrediente('calabaza');
            this.audio.cosecharExito(nodo.posicionMundo);
            const msg = `🎃 ¡Cosechaste Calabaza y Flor de Calabaza en Estación #${nodoId + 1}!`;
            if (this.onMensajeToast) this.onMensajeToast(msg);
            return { exito: true, mensaje: msg };
        }
    }

    /**
     * Sincroniza la escala de las enredaderas de frijol y guías de calabaza con el estado de cada nodo.
     * Si la planta de maíz muere o es arrancada, oculta la guía trepadora para evitar objetos flotando.
     */
    public actualizarVisuales(): void {
        for (let i = 0; i < this.visuales.length; i++) {
            const vis = this.visuales[i];
            const nodo = this.surco.nodos[vis.nodoId];
            const plantaViva =
                nodo.sembrada &&
                nodo.plantaInterna.estado !== 'MUERTA' &&
                !nodo.estadoCrec.estaMuerta;

            const f = plantaViva ? clamp01(nodo.frijolVid) : 0;
            const factorAlturaPlanta = Math.min(1.0, Math.max(0.28, nodo.plantaInterna.alturaMetros / 1.4));
            if (Math.abs(f - vis.ultimoFrijol) > 0.005 || (!plantaViva && vis.raizFrijol.isEnabled())) {
                vis.ultimoFrijol = f;
                if (f > 0.02 && plantaViva) {
                    vis.raizFrijol.setEnabled(true);
                    vis.raizFrijol.scaling.set(
                        0.45 + 0.55 * f,
                        (0.28 + 0.72 * f) * factorAlturaPlanta,
                        0.45 + 0.55 * f
                    );
                } else {
                    vis.raizFrijol.setEnabled(false);
                }
            } else if (f > 0.02 && plantaViva) {
                vis.raizFrijol.scaling.y = (0.28 + 0.72 * f) * factorAlturaPlanta;
            }

            const c = plantaViva ? clamp01(nodo.calabazaCobertura) : 0;
            if (Math.abs(c - vis.ultimaCalabaza) > 0.005 || (!plantaViva && vis.raizCalabaza.isEnabled())) {
                vis.ultimaCalabaza = c;
                if (c > 0.02 && plantaViva) {
                    vis.raizCalabaza.setEnabled(true);
                    vis.raizCalabaza.scaling.setAll(0.35 + 0.65 * c);
                } else {
                    vis.raizCalabaza.setEnabled(false);
                }
            }
        }
    }
}
