/**
 * Gestor Espacial del Surco Lineal de Milpa (v4.0 — Milpa Viva VR)
 *
 * Características:
 * - Hilera agronómica de 6 estaciones (Nodos 0 a 5, x = -2.0m a +2.0m).
 * - Soporte para 4 variedades genéticas nativas mexicanas y rasgos heredables (M9).
 * - Campos tipados v4.0: maleza (M3), plaga (M4), polinización (M5), tutorado y
 *   protección térmica con petate/humo (M6), calidad de mazorca (M8/M9) y Tríada viva (M7).
 * - Regla unificada de cosecha (REGLAS_JUEGO.DIAS_COSECHA_MIN) y LOD de contornos (H5, H9, H10).
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ShadowGenerator
} from "@babylonjs/core";
import {
  configurarSamplingPixel,
  dibujarMarcoLetreroPixel,
} from "./ui/texturas_pixel_3d";
import {
  Planta,
  crearPlanta,
  pasoDia,
  etapaDe,
  nombreEtapa,
  Etapa,
  TipoSemilla,
  VARIEDADES_MAIZ,
  VariedadMaizConfig,
  CultivoAsociado,
  ClimaDia,
  CFG,
  REGLAS_JUEGO,
  RasgosHeredables,
  clamp01
} from "./nucleo";
import {
  PBRMaterial as BabylonPBRMaterial,
} from "@babylonjs/core";
import { crearMaterialPatrixPBR, obtenerBancoPatrix } from "./ui/texturas_patrix_pbr";
import { ClimateState, Metricas, calcularMetricas } from "./clima";
import { EstadoCrecimiento, ESTADO_CRECIMIENTO_INICIAL } from "./crecimiento";
import { MaizEstilizado } from "./maiz_estilizado";
import {
  gddAFrame60,
  obtenerEstadoSuelo60
} from "./buffer_60_renders";
import { ParticulasEducativas } from "./educativo/particulas_educativas";
import { clamp } from "./juego/util";

export interface NodoSurco {
  id: number;
  x: number;
  posicionMundo: Vector3;
  posicionTeleport: Vector3;
  variedad: TipoSemilla;
  cultivoAsociado: CultivoAsociado;

  // Estados agronómicos individuales
  tierraArada: number;      // 0 a 100%
  sembrada: boolean;
  humedadVWC: number;       // % VWC (PMP 12%, CC 32%, Sat 45%)
  nutrientesNPK: number;    // % 0 a 100% (promedio ponderado de N, P, K)
  nSuelo: number;           // 0..100% Nitrógeno (hojas/clorofila, fijado por frijol)
  pSuelo: number;           // 0..100% Fósforo (raíces/floración)
  kSuelo: number;           // 0..100% Potasio (llenado de grano/caña)
  gddAcumulados: number;
  frame60: number;          // 0.0 a 59.0
  cosechada: boolean;
  diasCultivo: number;
  diasAcumuladosPaso: number; // Tipado explícito (corrige H9)

  // --- Nuevos campos v4.0 / v4.1 Milpa Viva VR ---
  maleza: number;             // 0..100 (M3)
  plaga: number;              // 0..100 daño acumulado (M4)
  polinizacion: number;       // 0..1 cuajado asistido/natural (M5)
  tutorado: boolean;          // rodrigón anti-acame (M6)
  proteccion: 0 | 1 | 2;      // 0 ninguna · 1 petate · 2 humo/lona (M6)
  calidad: number;            // 0..1 calidad final de la mazorca (M8/M9)
  frijolVid: number;          // 0..1 crecimiento de la guía de frijol (M7)
  calabazaCobertura: number;  // 0..1 cobertura foliar del suelo (M7)
  frijolCosechado: boolean;   // evita cosecha infinita en el mismo ciclo
  calabazaCosechada: boolean; // evita cosecha infinita en el mismo ciclo
  ultimoHashLetrero: string;  // dirty-check para evitar repintar DynamicTexture cada frame

  // Modelos 3D y materiales dedicados
  plantaInterna: Planta;
  estadoCrec: EstadoCrecimiento;
  maiz: MaizEstilizado;
  monticuloMesh: Mesh;
  monticuloMat: BabylonPBRMaterial;
  charcoMesh: Mesh;
  charcoMat: BabylonPBRMaterial;
  marcadorTeleport: Mesh;
  letreroMadera: Mesh;
  letreroTex: DynamicTexture;
  surcosMesh: Mesh[];
  semillasMesh: Mesh[];
  tutorMesh: Mesh;
  proteccionMesh: Mesh;
}

export class SurcoMilpa {
  readonly scene: Scene;
  readonly shadowGen: ShadowGenerator | null;
  readonly root: TransformNode;
  readonly particulas: ParticulasEducativas | null;

  public nodos: NodoSurco[] = [];
  public nodoSeleccionadoId = 0;

  private camellonMesh!: Mesh;
  private camellonMat!: BabylonPBRMaterial;
  private timerContornos = 0;

  constructor(
    scene: Scene,
    shadowGen: ShadowGenerator | null = null,
    particulas: ParticulasEducativas | null = null
  ) {
    this.scene = scene;
    this.shadowGen = shadowGen;
    this.particulas = particulas;
    this.root = new TransformNode("surcoMilpaRoot", scene);

    this.construirCamellonSurco();
    this.inicializarNodos();
  }

  private construirCamellonSurco(): void {
    const W = 5.2;
    const D = 0.95;
    const H = 0.18;

    this.camellonMat = crearMaterialPatrixPBR(this.scene, "tierra_surco", {
      nombre: "matCamellonPatrix",
      uScale: 8,
      vScale: 2,
      albedoColor: new Color3(0.95, 0.90, 0.85),
    });
    this.camellonMat.roughness = 0.94;

    this.camellonMesh = MeshBuilder.CreateBox("camellonSurco", {
      width: W,
      height: H,
      depth: D
    }, this.scene);
    this.camellonMesh.position.set(0, H / 2, 0);
    this.camellonMesh.material = this.camellonMat;
    this.camellonMesh.parent = this.root;

    if (this.shadowGen) {
      this.camellonMesh.receiveShadows = true;
    }
  }

  public calcularEscalaVariedad(variedad: TipoSemilla): number {
    const varCfg = VARIEDADES_MAIZ[variedad || "chalqueno"];
    return (varCfg.alturaMetrosMax / 3.5) * 0.38;
  }

  public estaListoParaCosecha(id: number): boolean {
    const nodo = this.nodos[id];
    if (!nodo || !nodo.sembrada || nodo.cosechada) return false;
    const p = nodo.plantaInterna;
    if (p.estado === "SEMILLA") return false;
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const etapaEnum = etapaDe(p.gdd, CFG, varCfg);
    if (p.estado === "MUERTA" && p.causaMuerte !== "agotamiento") {
      return etapaEnum >= Etapa.R3;
    }
    return etapaEnum >= Etapa.R3 || p.estado === "MADURA" || p.causaMuerte === "agotamiento";
  }

  public obtenerTipoCosecha(id: number): "elote" | "grano_seco" | "no_listo" {
    if (!this.estaListoParaCosecha(id)) return "no_listo";
    const nodo = this.nodos[id];
    const p = nodo.plantaInterna;
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const etapaEnum = etapaDe(p.gdd, CFG, varCfg);
    if (etapaEnum >= Etapa.R5 || p.estado === "MADURA" || p.causaMuerte === "agotamiento" || (p.secado ?? 0) > 0.65) {
      return "grano_seco";
    }
    return "elote";
  }

  private sincronizarNPKPromedio(nodo: NodoSurco): void {
    nodo.nutrientesNPK = Math.round((nodo.nSuelo + nodo.pSuelo + nodo.kSuelo) / 3);
  }

  private aplicarEstadoSuelo(
    nodo: NodoSurco,
    suelo60: { colorTierra: Color3; laminillaAgua: number }
  ): void {
    const c = suelo60.colorTierra;
    nodo.monticuloMat.albedoColor = new Color3(
      Math.min(1.28, 0.56 + c.r * 0.95),
      Math.min(1.22, 0.52 + c.g * 0.95),
      Math.min(1.16, 0.48 + c.b * 0.95)
    );
    const humNorm = Math.max(0, Math.min(1, (nodo.humedadVWC - 15) / 42));
    nodo.monticuloMat.roughness = 0.95 - humNorm * 0.46;
  }

  private inicializarNodos(): void {
    const coordsX = [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0];
    const variedadesDefault: TipoSemilla[] = [
      "chalqueno",
      "azul",
      "rojo",
      "palomero",
      "chalqueno",
      "azul"
    ];

    const matTutor = crearMaterialPatrixPBR(this.scene, "madera_roble", {
      nombre: "matTutorPatrix",
      uScale: 1,
      vScale: 3,
    });

    const matPetate = crearMaterialPatrixPBR(this.scene, "paja_paca", {
      nombre: "matPetatePatrix",
      uScale: 1,
      vScale: 2,
      albedoColor: new Color3(1.12, 1.04, 0.82),
    });
    matPetate.alpha = 0.92;

    for (let i = 0; i < coordsX.length; i++) {
      const x = coordsX[i];
      const variedad = variedadesDefault[i];
      const posMundo = new Vector3(x, 0.19, 0);
      const posTeleport = new Vector3(x, 0.02, -1.15);

      // A. Montículo voxel pixel-art de aporque/labranza
      const montMat = crearMaterialPatrixPBR(this.scene, "tierra_surco", {
        nombre: `montMatPatrix_${i}`,
        uScale: 1.5,
        vScale: 1.5,
        albedoColor: new Color3(0.95, 0.88, 0.80),
      });
      montMat.roughness = 0.92;

      const montMesh = MeshBuilder.CreateBox(`monticuloNodo_${i}`, {
        width: 0.62,
        height: 0.13,
        depth: 0.62
      }, this.scene);
      montMesh.position.copyFrom(posMundo);
      montMesh.position.y += 0.04;
      montMesh.material = montMat;
      montMesh.parent = this.root;

      // B. Lámina pixelada de encharcamiento / charco
      const bancoPatrix = obtenerBancoPatrix(this.scene);
      const charcoMat = new BabylonPBRMaterial(`charcoMat_${i}`, this.scene);
      charcoMat.albedoColor = Color3.FromHexString("#2c586b");
      charcoMat.bumpTexture = bancoPatrix.aguaNormal;
      charcoMat.bumpTexture.level = 0.4;
      charcoMat.metallic = 0.14;
      charcoMat.roughness = 0.05;
      charcoMat.alpha = 0.0;
      charcoMat.transparencyMode = BabylonPBRMaterial.PBRMATERIAL_ALPHABLEND;
      charcoMat.metadata = { patrixSkip: true };

      const charcoMesh = MeshBuilder.CreateBox(`charcoNodo_${i}`, {
        width: 0.52,
        height: 0.012,
        depth: 0.52
      }, this.scene);
      charcoMesh.position.copyFrom(posMundo);
      charcoMesh.position.y += 0.112;
      charcoMesh.material = charcoMat;
      charcoMesh.parent = this.root;

      // C. Marcador de teletransporte con losa rústica Patrix
      const padMat = crearMaterialPatrixPBR(this.scene, "piedra_cobble", {
        nombre: `padMat_${i}`,
        uScale: 1,
        vScale: 1,
        albedoColor: new Color3(1.18, 1.04, 0.84),
      });

      const padMesh = MeshBuilder.CreateDisc(`padTeleport_${i}`, {
        radius: 0.22,
        tessellation: 20
      }, this.scene);
      padMesh.rotation.x = Math.PI / 2;
      padMesh.position.copyFrom(posTeleport);
      padMesh.material = padMat;
      padMesh.parent = this.root;

      // D. Letrero de madera con estado
      const varCfg = VARIEDADES_MAIZ[variedad];
      const letrero = this.crearLetreroMadera(i, variedad, new Vector3(x, 0.22, 0.40));

      // D.1. Surcos de labranza 3D sobre el montículo
      const surcosMesh: Mesh[] = [];
      for (let s = -1; s <= 1; s++) {
        const surcoRidge = MeshBuilder.CreateBox(`surcoRidge_${i}_${s}`, {
          width: 0.07,
          height: 0.045,
          depth: 0.36
        }, this.scene);
        surcoRidge.position.set(posMundo.x + s * 0.12, posMundo.y + 0.115, posMundo.z);
        surcoRidge.material = montMat;
        surcoRidge.parent = this.root;
        surcoRidge.scaling.y = 0.001;
        surcosMesh.push(surcoRidge);
      }

      // D.2. Granos de semilla visibles al sembrar
      const matSemilla = new StandardMaterial(`matSemilla_${i}`, this.scene);
      matSemilla.diffuseColor = Color3.FromHexString(varCfg.colorHex);
      matSemilla.emissiveColor = Color3.FromHexString(varCfg.colorHex).scale(0.5);

      const semillasMesh: Mesh[] = [];
      for (let k = -1; k <= 1; k++) {
        const grano = MeshBuilder.CreateBox(`granoNodo_${i}_${k}`, {
          width: 0.036,
          height: 0.024,
          depth: 0.032
        }, this.scene);
        grano.position.set(posMundo.x + k * 0.08, posMundo.y + 0.072, posMundo.z);
        grano.material = matSemilla;
        grano.parent = this.root;
        grano.setEnabled(false);
        semillasMesh.push(grano);
      }

      // D.3. Rodrigón / Tutor voxel de madera anti-acame (M6)
      const tutorMesh = MeshBuilder.CreateBox(`tutorNodo_${i}`, {
        width: 0.04,
        height: 1.35,
        depth: 0.04
      }, this.scene);
      tutorMesh.position.set(posMundo.x - 0.09, posMundo.y + 0.65, posMundo.z + 0.04);
      tutorMesh.rotation.z = -0.06;
      tutorMesh.material = matTutor;
      tutorMesh.parent = this.root;
      tutorMesh.setEnabled(false);

      // D.4. Petate / Cobertura térmica contra heladas (M6)
      const proteccionMesh = MeshBuilder.CreateCylinder(`petateNodo_${i}`, {
        diameterTop: 0.35,
        diameterBottom: 0.58,
        height: 0.55,
        tessellation: 6,
        arc: 0.6
      }, this.scene);
      proteccionMesh.position.set(posMundo.x, posMundo.y + 0.32, posMundo.z + 0.06);
      proteccionMesh.rotation.y = Math.PI * 0.2;
      proteccionMesh.material = matPetate;
      proteccionMesh.parent = this.root;
      proteccionMesh.setEnabled(false);

      // E. Planta de Maíz Estilizada
      const factorEscala = this.calcularEscalaVariedad(variedad);
      const maiz = new MaizEstilizado(this.scene, this.shadowGen, `maiz_${i}`, variedad);
      maiz.root.position.copyFrom(posMundo);
      maiz.root.position.y -= 0.02;
      maiz.root.scaling.setAll(factorEscala);
      maiz.root.parent = this.root;
      maiz.root.setEnabled(false);

      // F. Estado fisiológico independiente
      const plantaInterna = crearPlanta(variedad, "ninguno");
      const estadoCrec: EstadoCrecimiento = {
        ...ESTADO_CRECIMIENTO_INICIAL,
        plantaInterna
      };

      this.nodos.push({
        id: i,
        x,
        posicionMundo: posMundo,
        posicionTeleport: posTeleport,
        variedad,
        cultivoAsociado: "ninguno",
        tierraArada: 0,
        sembrada: false,
        humedadVWC: 18.0,
        nutrientesNPK: 35.0,
        nSuelo: 35.0,
        pSuelo: 35.0,
        kSuelo: 35.0,
        gddAcumulados: 0,
        frame60: 0,
        cosechada: false,
        diasCultivo: 0,
        diasAcumuladosPaso: 0,
        maleza: 0,
        plaga: 0,
        polinizacion: 0.0,
        tutorado: false,
        proteccion: 0,
        calidad: 0.9,
        frijolVid: 0,
        calabazaCobertura: 0,
        frijolCosechado: false,
        calabazaCosechada: false,
        ultimoHashLetrero: "",
        plantaInterna,
        estadoCrec,
        maiz,
        monticuloMesh: montMesh,
        monticuloMat: montMat,
        charcoMesh,
        charcoMat,
        marcadorTeleport: padMesh,
        letreroMadera: letrero.mesh,
        letreroTex: letrero.tex,
        surcosMesh,
        semillasMesh,
        tutorMesh,
        proteccionMesh
      });

      this.actualizarLetrero(i);
    }
  }

  private crearLetreroMadera(
    id: number,
    _variedad: TipoSemilla,
    posicion: Vector3
  ): { mesh: Mesh; tex: DynamicTexture } {
    const W = 0.40;
    const H = 0.22;
    const tex = new DynamicTexture(`texLetrero_${id}`, { width: 256, height: 140 }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    configurarSamplingPixel(tex);

    const mat = new StandardMaterial(`matLetrero_${id}`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.5);

    const mesh = MeshBuilder.CreatePlane(`letrero_${id}`, { width: W, height: H }, this.scene);
    mesh.position.copyFrom(posicion);
    mesh.rotation.x = -Math.PI / 7;
    mesh.material = mat;
    mesh.parent = this.root;

    return { mesh, tex };
  }

  public actualizarLetrero(id: number, forzar = false): void {
    const nodo = this.nodos[id];
    if (!nodo) return;

    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const p = nodo.plantaInterna;
    const estaMuerta = p.estado === "MUERTA";
    const esSemilla = p.estado === "SEMILLA";
    const secado = p.secado ?? 0;
    const tieneHuitlacoche = (p.huitlacoche ?? 0) >= 0.45;
    const gddEmergMeta = CFG.gddEmergencia * (varCfg.gddCicloCompleto / CFG.gddR6);
    const pctGerm = esSemilla ? Math.min(99, Math.round((p.gddSiembra / Math.max(1, gddEmergMeta)) * 100)) : 100;
    const tipoCos = this.obtenerTipoCosecha(id);

    // Dirty-check para evitar repintar DynamicTexture cada frame
    const hash = [
      nodo.variedad,
      nodo.sembrada ? 1 : 0,
      nodo.cosechada ? 1 : 0,
      nodo.tierraArada,
      Math.floor(nodo.diasCultivo),
      p.estado,
      p.causaMuerte ?? "",
      pctGerm,
      nodo.estadoCrec.etapa,
      Math.round(nodo.humedadVWC),
      Math.round(nodo.nutrientesNPK),
      Math.round(nodo.plaga),
      Math.round(nodo.maleza),
      Math.round(p.cuajado * 100),
      Math.round(secado * 20),
      nodo.frijolVid > 0.05 ? 1 : 0,
      nodo.calabazaCobertura > 0.05 ? 1 : 0,
      nodo.tutorado ? 1 : 0,
      nodo.proteccion,
      tieneHuitlacoche ? 1 : 0,
      tipoCos
    ].join("|");

    if (!forzar && nodo.ultimoHashLetrero === hash) return;
    nodo.ultimoHashLetrero = hash;

    const ctx = nodo.letreroTex.getContext() as any;
    const W = 256;
    const H = 140;

    dibujarMarcoLetreroPixel(
      ctx,
      W,
      H,
      "#fffbeb",
      nodo.plaga > 25 ? "#b91c1c" : tipoCos !== "no_listo" ? "#15803d" : "#451a03",
      "#d97706",
      4
    );

    ctx.fillStyle = "#92400e";
    ctx.font = "bold 20px 'Pixelify Sans', monospace";
    const iconoAsoc =
      nodo.frijolVid > 0.05 && nodo.calabazaCobertura > 0.05
        ? " 🔺"
        : nodo.frijolVid > 0.05
        ? " 🫘"
        : nodo.calabazaCobertura > 0.05
        ? " 🎃"
        : "";
    ctx.fillText(`P${id + 1}: ${varCfg.nombre.split(" ")[1] || "Maíz"}${iconoAsoc}`, 14, 28);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 15px 'Pixelify Sans', monospace";

    if (!nodo.sembrada) {
      const msg = nodo.tierraArada < 100 ? `Tierra: ${nodo.tierraArada}%` : "Lista p/ Sembrar 🌱";
      ctx.fillText(msg, 14, 56);
    } else if (nodo.cosechada) {
      ctx.fillStyle = "#ca8a04";
      ctx.fillText(`¡Cosechada! ★${Math.round(nodo.calidad * 100)}%`, 14, 56);
    } else if (estaMuerta) {
      ctx.fillStyle = "#b91c1c";
      const causa = p.causaMuerte || "clima";
      const etqCausa =
        causa === "agotamiento"
          ? "Ciclo Seco"
          : causa === "helada"
          ? "Helada ❄️"
          : causa === "sequia"
          ? "Sequía ☀️"
          : causa === "calor"
          ? "Calor 🔥"
          : causa === "encharcamiento"
          ? "Ahogada 🌊"
          : causa === "pudricion_semilla"
          ? "Semilla Fría"
          : causa;
      ctx.fillText(`💀 Muerta (${etqCausa})`, 14, 56);
    } else if (esSemilla) {
      ctx.fillStyle = "#047857";
      ctx.fillText(`🌰 Germinando ${pctGerm}% · D${Math.floor(nodo.diasCultivo)}`, 14, 56);
    } else if (tipoCos === "elote") {
      ctx.fillStyle = "#15803d";
      ctx.fillText(`🌽 Elote R3 (${Math.round(p.humedadGranoPct ?? 72)}%H) [9]`, 14, 56);
    } else if (tipoCos === "grano_seco") {
      ctx.fillStyle = "#b45309";
      ctx.fillText(`🌾 Grano Seco (${Math.round(p.humedadGranoPct ?? 16)}%H) [9]`, 14, 56);
    } else if (secado > 0.35) {
      ctx.fillStyle = "#b45309";
      ctx.fillText(`🌾 Secándose (${Math.round(secado * 100)}%) D${Math.floor(nodo.diasCultivo)}`, 14, 56);
    } else {
      const topeStr = p.limiteAlcanzado ? ` · ${p.alturaMetros.toFixed(1)}m` : "";
      ctx.fillText(`Día ${Math.floor(nodo.diasCultivo)} (${nodo.estadoCrec.etapa.split(" ")[0]})${topeStr}`, 14, 56);
    }

    ctx.font = "13px 'Pixelify Sans', monospace";
    ctx.fillStyle = "#0284c7";
    ctx.fillText(`💧 ${Math.round(nodo.humedadVWC)}% | 🌿 NPK ${Math.round(nodo.nutrientesNPK)}%`, 14, 84);

    if (estaMuerta && !nodo.cosechada) {
      ctx.fillStyle = "#991b1b";
      ctx.fillText(
        p.causaMuerte === "agotamiento" ? `🌽 Mazorca [9] o Quitar [Q]` : `🗑️ Quitar planta seca [Q] / [2]`,
        14,
        108
      );
    } else if (tieneHuitlacoche && !nodo.cosechada) {
      ctx.fillStyle = "#6d28d9";
      ctx.fillText(`🍄 ¡Huitlacoche listo! [9]`, 14, 108);
    } else if (nodo.plaga > 10) {
      ctx.fillStyle = "#dc2626";
      ctx.fillText(`🐛 Plaga: ${Math.round(nodo.plaga)}% ¡Limpia!`, 14, 108);
    } else if (nodo.maleza > 20) {
      ctx.fillStyle = "#b45309";
      ctx.fillText(`🌱 Maleza: ${Math.round(nodo.maleza)}% [X]`, 14, 108);
    } else {
      ctx.fillStyle = "#15803d";
      const prot = (nodo.tutorado ? "🪵" : "") + (nodo.proteccion > 0 ? "🛡️" : "");
      ctx.fillText(`✨ Cuajado: ${Math.round(p.cuajado * 100)}% ${prot}`, 14, 108);
    }

    nodo.letreroTex.update();
  }

  // ---------------------------------------------------------------------------
  // Acciones Agronómicas y Mecánicas v4.0
  // ---------------------------------------------------------------------------

  /**
   * Retira/arranca cualquier planta (viva, muerta o cosechada) de la estación con una animación 3D
   * de extracción de raíz, partículas de terrones/polvo y limpieza completa del montículo.
   */
  public quitarPlanta(id: number, onCompletado?: () => void): { exito: boolean; mensaje: string } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (!nodo.sembrada) {
      return {
        exito: false,
        mensaje: `⚠️ En la estación ${id + 1} no hay ninguna planta sembrada para quitar.`
      };
    }

    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const eraMuerta = nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta;
    const eraCosechada = nodo.cosechada;

    // 1. Limpiar inmediatamente el estado lógico para evitar cualquier conflicto con acciones subsecuentes
    nodo.sembrada = false;
    nodo.cosechada = false;
    nodo.diasCultivo = 0;
    nodo.diasAcumuladosPaso = 0;
    nodo.gddAcumulados = 0;
    nodo.frame60 = 0;
    nodo.tierraArada = 100;
    nodo.humedadVWC = Math.max(24, nodo.humedadVWC);
    nodo.maleza = 0;
    nodo.plaga = 0;
    nodo.polinizacion = 0;
    nodo.frijolVid = 0;
    nodo.calabazaCobertura = 0;
    nodo.frijolCosechado = false;
    nodo.calabazaCosechada = false;
    nodo.cultivoAsociado = "ninguno";
    nodo.tutorado = false;
    nodo.proteccion = 0;
    nodo.tutorMesh.setEnabled(false);
    nodo.proteccionMesh.setEnabled(false);
    nodo.semillasMesh.forEach((g) => g.setEnabled(false));

    nodo.plantaInterna = crearPlanta(nodo.variedad, "ninguno");
    nodo.estadoCrec.plantaInterna = nodo.plantaInterna;
    nodo.estadoCrec.dia = 0;
    nodo.estadoCrec.gddAcumulado = 0;
    nodo.estadoCrec.etapa = nombreEtapa(Etapa.SEMILLA);
    nodo.estadoCrec.estaMuerta = false;
    nodo.estadoCrec.causaMuerte = null;
    nodo.estadoCrec.degradacion = 0;
    nodo.estadoCrec.acameGrados = 0;

    // Actualizar visual del montículo (queda arado al 100% listo para nueva siembra)
    const suelo60 = obtenerEstadoSuelo60(100, nodo.humedadVWC, nodo.humedadVWC > 38);
    this.aplicarEstadoSuelo(nodo, suelo60);
    nodo.surcosMesh.forEach((s) => {
      s.scaling.y = 1.0;
      s.scaling.x = 1.35;
    });

    if (this.particulas) {
      this.particulas.efectoArarTierra(nodo.posicionMundo.add(new Vector3(0, 0.14, 0)));
    }
    this.actualizarLetrero(id, true);

    // 2. Animación 3D de extracción de la planta (sacudida de raíz + elevación + inclinación + encogimiento)
    const rootMaiz = nodo.maiz.root;
    const posBase = nodo.posicionMundo.clone();
    posBase.y -= 0.02;
    const rotYBase = rootMaiz.rotation.y;
    const escalaBase = this.calcularEscalaVariedad(nodo.variedad);
    rootMaiz.setEnabled(true);

    let tiempoAnim = 0;
    const duracionAnim = 0.52;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      // Si el usuario sembró una nueva semilla durante la animación, restaurar de inmediato la raíz 3D
      if (nodo.sembrada) {
        rootMaiz.position.copyFrom(posBase);
        rootMaiz.rotation.set(0, rotYBase, 0);
        rootMaiz.scaling.setAll(this.calcularEscalaVariedad(nodo.variedad));
        rootMaiz.setEnabled(nodo.plantaInterna.estado !== "SEMILLA");
        this.scene.onBeforeRenderObservable.remove(obs);
        return;
      }

      const rawDt = this.scene.getEngine().getDeltaTime() / 1000;
      const dt = rawDt > 0.004 ? Math.min(0.05, rawDt) : 0.016;
      tiempoAnim += dt;
      const p = clamp01(tiempoAnim / duracionAnim);

      // Vibración lateral inicial al aflojar raíces + extracción hacia arriba + inclinación y reducción
      const sacudida = Math.sin(p * Math.PI * 6) * 0.24 * (1 - p);
      const elevacion = Math.sin(p * Math.PI * 0.68) * 0.46;
      const escala = escalaBase * Math.max(0.01, 1 - Math.pow(p, 1.55));

      rootMaiz.position.set(posBase.x + sacudida * 0.12, posBase.y + elevacion, posBase.z);
      rootMaiz.rotation.set(p * 0.38, rotYBase + p * 0.45, sacudida + p * 0.65);
      rootMaiz.scaling.setAll(escala);

      if (p >= 1) {
        rootMaiz.position.copyFrom(posBase);
        rootMaiz.rotation.set(0, rotYBase, 0);
        rootMaiz.scaling.setAll(escalaBase);
        rootMaiz.setEnabled(false);
        this.scene.onBeforeRenderObservable.remove(obs);
        if (onCompletado) onCompletado();
      }
    });

    const estadoDesc = eraMuerta
      ? "seca/muerta"
      : eraCosechada
      ? "cosechada (rastrojo)"
      : "en crecimiento";

    return {
      exito: true,
      mensaje: `🗑️ ¡Planta ${estadoDesc} de ${varCfg.nombre} retirada de la Estación #${id + 1}! Tierra lista (100% arada) para sembrar.`
    };
  }

  public arar(id: number, potencia = 1.0): { exito: boolean; mensaje: string; nuevoNivel: number } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida", nuevoNivel: 0 };

    // M6: Si ya está sembrada y viva pero hay encharcamiento (> 38% VWC), la azada abre zanja de drenaje
    if (nodo.sembrada && nodo.plantaInterna.estado !== "MUERTA" && !nodo.cosechada && nodo.humedadVWC > 38) {
      nodo.humedadVWC = Math.max(28, nodo.humedadVWC - 12);
      const suelo60 = obtenerEstadoSuelo60(nodo.tierraArada, nodo.humedadVWC, nodo.humedadVWC > 38);
      this.aplicarEstadoSuelo(nodo, suelo60);
      nodo.charcoMat.alpha = suelo60.laminillaAgua;
      if (this.particulas) {
        this.particulas.emitirPolvo(nodo.posicionMundo.add(new Vector3(0, 0.1, 0)));
      }
      this.actualizarLetrero(id);
      return {
        exito: true,
        mensaje: `⛏️💧 ¡Zanja de drenaje abierta en estación ${id + 1}! El exceso de agua escurre (${Math.round(nodo.humedadVWC)}% VWC).`,
        nuevoNivel: nodo.tierraArada
      };
    }

    // Si la estación ya fue cosechada o la planta murió/se secó, la azada retira la planta con su animación 3D
    if (nodo.cosechada || (nodo.sembrada && nodo.plantaInterna.estado === "MUERTA")) {
      const resQuitar = this.quitarPlanta(id);
      return {
        exito: resQuitar.exito,
        mensaje: resQuitar.mensaje,
        nuevoNivel: 100
      };
    }

    if (nodo.sembrada) {
      return {
        exito: false,
        mensaje: `¡La planta ${id + 1} está viva! Si deseas arrancarla usa el botón 🗑️ Quitar Planta o la tecla [Q].`,
        nuevoNivel: nodo.tierraArada
      };
    }

    const potClamp = clamp(potencia, 0.5, 1.4);
    const incremento = Math.round(34 * potClamp);
    nodo.tierraArada = Math.min(100, nodo.tierraArada + incremento);
    const suelo60 = obtenerEstadoSuelo60(nodo.tierraArada, nodo.humedadVWC, false);

    this.aplicarEstadoSuelo(nodo, suelo60);
    nodo.monticuloMesh.scaling.y = 1.0 + suelo60.rugosidad * 0.35;

    const nivelArado = nodo.tierraArada / 100;
    nodo.surcosMesh.forEach((s, idx) => {
      s.scaling.y = Math.max(0.001, Math.min(1.0, nivelArado * 3 - idx));
      s.scaling.x = 1.0 + nivelArado * 0.35;
    });

    if (this.particulas) {
      this.particulas.emitirPolvo(nodo.posicionMundo.add(new Vector3(0, 0.1, 0)));
    }

    this.actualizarLetrero(id);
    const mensaje =
      nodo.tierraArada >= 100
        ? `🎉 ¡Tierra de la planta ${id + 1} perfectamente arada y esponjosa!`
        : `⛏️ Aflojando la tierra de la estación ${id + 1} (${nodo.tierraArada}% · Fuerza ${Math.round(potClamp * 100)}%).`;

    return { exito: true, mensaje, nuevoNivel: nodo.tierraArada };
  }

  public sembrar(
    id: number,
    variedad?: TipoSemilla,
    rasgosHeredados?: RasgosHeredables
  ): { exito: boolean; mensaje: string; variedad?: VariedadMaizConfig } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (nodo.tierraArada < 100) {
      return { exito: false, mensaje: `¡Primero ara la tierra de la planta ${id + 1} con la azada!` };
    }
    if (nodo.sembrada && !nodo.cosechada) {
      return { exito: false, mensaje: `¡La planta ${id + 1} ya tiene semilla sembrada!` };
    }

    if (variedad) {
      nodo.variedad = variedad;
      nodo.maiz.setVariedad(variedad);
      const varCol = Color3.FromHexString(VARIEDADES_MAIZ[variedad].colorHex);
      const matS = nodo.semillasMesh[0]?.material as StandardMaterial | null;
      if (matS) {
        matS.diffuseColor = varCol;
        matS.emissiveColor = varCol.scale(0.5);
      }
    }
    nodo.sembrada = true;
    nodo.cosechada = false;
    nodo.diasCultivo = 0;
    nodo.diasAcumuladosPaso = 0;
    nodo.polinizacion = 0;
    nodo.frijolCosechado = false;
    nodo.calabazaCosechada = false;
    nodo.humedadVWC = Math.max(nodo.humedadVWC, 26.0);
    nodo.plantaInterna = crearPlanta(nodo.variedad, nodo.cultivoAsociado);
    nodo.plantaInterna.tieneFrijol = nodo.frijolVid > 0;
    nodo.plantaInterna.tieneCalabaza = nodo.calabazaCobertura > 0;
    if (rasgosHeredados) {
      nodo.plantaInterna.rasgosHeredados = { ...rasgosHeredados };
    }
    // Fase A real de germinación (SEMILLA -> VE al acumular GDD térmicos con humedad adecuada)
    nodo.plantaInterna.estado = "SEMILLA";
    nodo.estadoCrec.plantaInterna = nodo.plantaInterna;
    nodo.estadoCrec.dia = 0;
    nodo.estadoCrec.gddAcumulado = 0;
    nodo.estadoCrec.etapa = nombreEtapa(Etapa.SEMILLA);
    nodo.estadoCrec.estaMuerta = false;
    nodo.estadoCrec.causaMuerte = null;
    nodo.estadoCrec.degradacion = 0;
    nodo.estadoCrec.pesoSequia = 0;
    nodo.estadoCrec.pesoFrio = 0;
    nodo.estadoCrec.amarillamiento = 0;
    nodo.estadoCrec.acameGrados = 0;

    nodo.maiz.root.scaling.setAll(this.calcularEscalaVariedad(nodo.variedad));
    nodo.maiz.root.setEnabled(false);
    nodo.semillasMesh.forEach((grano) => grano.setEnabled(true));

    const climaDummy: ClimateState = {
      temperatura: 24,
      humedad: 60,
      presion: 780,
      hora: 12,
      nubosidad: 20,
      lluvia: 0,
      viento: 2.5,
      humedadSuelo: nodo.humedadVWC,
      phSuelo: 6.8,
      co2: 415,
      pm25: 15
    };
    nodo.maiz.sincronizarConEstado(nodo.estadoCrec, climaDummy, calcularMetricas(climaDummy, nodo.variedad));

    if (this.particulas) {
      this.particulas.emitirHaloSemilla(nodo.posicionMundo.add(new Vector3(0, 0.08, 0)));
    }

    this.actualizarLetrero(id, true);
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    return {
      exito: true,
      mensaje: `🌱 ¡Sembrada semilla de ${varCfg.nombre} en la estación ${id + 1}! Mantén humedad (22–34% VWC) para germinar.`,
      variedad: varCfg
    };
  }

  public regar(id: number, incremento = 14): { exito: boolean; mensaje: string; nuevoVWC: number } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida", nuevoVWC: 0 };

    nodo.humedadVWC = Math.min(60, nodo.humedadVWC + incremento);
    const suelo60 = obtenerEstadoSuelo60(nodo.tierraArada, nodo.humedadVWC, nodo.humedadVWC > 38);

    this.aplicarEstadoSuelo(nodo, suelo60);
    nodo.charcoMat.alpha = suelo60.laminillaAgua;

    if (this.particulas) {
      this.particulas.emitirGotas(nodo.posicionMundo.add(new Vector3(0, 0.45, 0)));
      this.particulas.emitirOndas(nodo.posicionMundo.add(new Vector3(0, 0.12, 0)));
    }

    this.actualizarLetrero(id);
    const mensaje =
      nodo.humedadVWC > 42
        ? `💧 Planta ${id + 1}: ¡Cuidado con el exceso de agua! Hay encharcamiento (${Math.round(nodo.humedadVWC)}% VWC).`
        : `💧 Planta ${id + 1} regada con frescura (${Math.round(nodo.humedadVWC)}% VWC).`;

    return { exito: true, mensaje, nuevoVWC: nodo.humedadVWC };
  }

  /**
   * M1: Riego continuo por inclinación de la regadera en 6DoF (sin spamear toasts por frame)
   */
  public regarContinuo(id: number, caudal: number, dt: number): void {
    const nodo = this.nodos[id];
    if (!nodo || caudal <= 0.02) return;

    nodo.humedadVWC = Math.min(60, nodo.humedadVWC + caudal * 12.0 * dt);
    const suelo60 = obtenerEstadoSuelo60(nodo.tierraArada, nodo.humedadVWC, nodo.humedadVWC > 38);
    this.aplicarEstadoSuelo(nodo, suelo60);
    nodo.charcoMat.alpha = suelo60.laminillaAgua;
    this.actualizarLetrero(id);
  }

  public abonar(id: number, incremento = 25): { exito: boolean; mensaje: string; nuevoNPK: number } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida", nuevoNPK: 0 };

    nodo.nSuelo = Math.min(100, nodo.nSuelo + incremento);
    nodo.pSuelo = Math.min(100, nodo.pSuelo + incremento * 0.9);
    nodo.kSuelo = Math.min(100, nodo.kSuelo + incremento * 0.95);
    this.sincronizarNPKPromedio(nodo);
    if (nodo.nutrientesNPK > 94) {
      // M1: Exceso de sales minerales quema levemente raíces
      nodo.plantaInterna.vigor = Math.max(0.4, nodo.plantaInterna.vigor - 0.05);
    }

    if (this.particulas) {
      this.particulas.emitirChispasAbono(nodo.posicionMundo.add(new Vector3(0, 0.5, 0)));
    }

    this.actualizarLetrero(id);
    return {
      exito: true,
      mensaje:
        nodo.nutrientesNPK > 94
          ? `⚠️ Planta ${id + 1}: Exceso de abono (${Math.round(nodo.nutrientesNPK)}%). ¡No satures las raíces!`
          : `🌿 Planta ${id + 1} fertilizada (N ${Math.round(nodo.nSuelo)}% · P ${Math.round(nodo.pSuelo)}% · K ${Math.round(nodo.kSuelo)}%).`,
      nuevoNPK: nodo.nutrientesNPK
    };
  }

  /**
   * M6: Coloca o retira rodrigón de madera (tutor) para resistir vendavales
   */
  public colocarTutor(id: number): { exito: boolean; mensaje: string } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (!nodo.sembrada) {
      return {
        exito: false,
        mensaje: `⚠️ Primero siembra una planta en la Estación #${id + 1} antes de colocar un rodrigón.`
      };
    }
    if (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta) {
      return {
        exito: false,
        mensaje: `⚠️ La planta en Estación #${id + 1} está muerta. Quítala con [Q] para volver a sembrar.`
      };
    }
    nodo.tutorado = !nodo.tutorado;
    nodo.tutorMesh.setEnabled(nodo.tutorado);
    this.actualizarLetrero(id);
    return {
      exito: true,
      mensaje: nodo.tutorado
        ? `🪵 ¡Rodrigón colocado en Planta ${id + 1}! Protegida contra vendavales y acame.`
        : `🪵 Rodrigón retirado de Planta ${id + 1}.`
    };
  }

  /**
   * M6: Coloca o retira petate protector térmico contra heladas
   */
  public colocarProteccion(id: number, nivel: 0 | 1 | 2 = 1): { exito: boolean; mensaje: string } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (!nodo.sembrada) {
      return {
        exito: false,
        mensaje: `⚠️ Primero siembra una planta en la Estación #${id + 1} antes de abrigarla con petate.`
      };
    }
    if (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta) {
      return {
        exito: false,
        mensaje: `⚠️ La planta en Estación #${id + 1} está muerta. Quítala con [Q] para volver a sembrar.`
      };
    }
    nodo.proteccion = nodo.proteccion === 0 ? nivel : 0;
    nodo.proteccionMesh.setEnabled(nodo.proteccion > 0);
    this.actualizarLetrero(id);
    return {
      exito: true,
      mensaje:
        nodo.proteccion > 0
          ? `🛡️ ¡Petate térmico colocado en Planta ${id + 1}! Abriga hasta +${nodo.proteccion === 2 ? "3.5" : "1.5"} °C en helada.`
          : `🛡️ Petate retirado de Planta ${id + 1}.`
    };
  }

  /**
   * M7: Siembra frijol o calabaza asociados en esta estación (La Tríada Viva)
   */
  public sembrarAsociado(id: number, tipo: "frijol" | "calabaza"): { exito: boolean; mensaje: string } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (!nodo.sembrada) {
      return {
        exito: false,
        mensaje: `⚠️ Primero siembra el maíz en la Estación #${id + 1} antes de asociar ${tipo === "frijol" ? "Frijol" : "Calabaza"}.`
      };
    }
    if (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta) {
      return {
        exito: false,
        mensaje: `⚠️ La planta en Estación #${id + 1} está muerta. Quítala con [Q] antes de asociar cultivos.`
      };
    }
    if (nodo.cosechada) {
      return {
        exito: false,
        mensaje: `⚠️ La planta en Estación #${id + 1} ya fue cosechada. Quítala con [Q] para iniciar un nuevo ciclo.`
      };
    }
    if (tipo === "frijol" && nodo.frijolVid > 0) {
      return {
        exito: false,
        mensaje: `🫘 Ya hay Frijol Ayocote trepando en la Estación #${id + 1}.`
      };
    }
    if (tipo === "calabaza" && nodo.calabazaCobertura > 0) {
      return {
        exito: false,
        mensaje: `🎃 Ya hay Calabaza Criolla cubriendo el suelo de la Estación #${id + 1}.`
      };
    }

    nodo.cultivoAsociado = tipo;
    nodo.plantaInterna.cultivoAsociado = tipo;
    if (tipo === "frijol") {
      nodo.frijolVid = 0.25;
      nodo.frijolCosechado = false;
      nodo.plantaInterna.tieneFrijol = true;
    } else {
      nodo.calabazaCobertura = 0.25;
      nodo.calabazaCosechada = false;
      nodo.plantaInterna.tieneCalabaza = true;
    }
    this.actualizarLetrero(id, true);
    const triadaCompleta = nodo.frijolVid > 0 && nodo.calabazaCobertura > 0;
    return {
      exito: true,
      mensaje: triadaCompleta
        ? `🔺 ¡Tríada Mesoamericana completa en Planta ${id + 1}! Maíz + Frijol Ayocote + Calabaza Criolla en simbiosis.`
        : tipo === "frijol"
        ? `🫘 ¡Frijol Ayocote sembrado al pie de la Planta ${id + 1}! Fijará nitrógeno (Rhizobium) en suelo aireado.`
        : `🎃 ¡Calabaza Criolla sembrada en la Planta ${id + 1}! Sus hojas cubrirán el suelo contra maleza y sequía.`
    };
  }

  public obtenerEtapaNodo(id: number): Etapa {
    const n = this.nodos[id];
    if (!n || !n.sembrada || n.plantaInterna.estado === "SEMILLA") return Etapa.SEMILLA;
    return etapaDe(n.plantaInterna.gdd, CFG, VARIEDADES_MAIZ[n.variedad]);
  }

  public cosechar(id: number): {
    exito: boolean;
    mensaje: string;
    variedad?: VariedadMaizConfig;
    earMesh?: TransformNode | null;
    calidad?: number;
    tipoCosecha?: "elote" | "grano_seco";
    tieneHuitlacoche?: boolean;
  } {
    const nodo = this.nodos[id];
    if (!nodo) return { exito: false, mensaje: "Estación inválida" };
    if (!nodo.sembrada) {
      return { exito: false, mensaje: `¡En la estación ${id + 1} todavía no has sembrado nada!` };
    }
    if (nodo.cosechada) {
      return { exito: false, mensaje: `¡El elote de la planta ${id + 1} ya fue cosechado!` };
    }

    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const p = nodo.plantaInterna;
    const etapaEnum = p.estado === "SEMILLA" ? Etapa.SEMILLA : etapaDe(p.gdd, CFG, varCfg);

    // Si murió prematuramente por condiciones climáticas adversas antes de madurar
    if (p.estado === "MUERTA" && p.causaMuerte !== "agotamiento" && etapaEnum < Etapa.R3) {
      const descCausa =
        p.causaMuerte === "helada"
          ? "una helada severa (necesitaba Petate [G] o temperatura más cálida)"
          : p.causaMuerte === "sequia"
          ? `la sequía (suelo < ${varCfg.pmp}% VWC sin riego [7])`
          : p.causaMuerte === "calor"
          ? `el calor extremo (> ${varCfg.tCorte + 4} °C)`
          : p.causaMuerte === "encharcamiento"
          ? "asfixia radicular por exceso de agua (necesitaba drenaje con Azada [2])"
          : p.causaMuerte === "pudricion_semilla"
          ? "pudrición de semilla por suelo frío (< 10 °C)"
          : `estrés climático (${p.causaMuerte || "severo"})`;
      return {
        exito: false,
        mensaje: `💀 El ${varCfg.nombre} en estación ${id + 1} murió por ${descCausa}. Limpia la planta seca con [Q] o Azada [2] para volver a sembrar.`
      };
    }

    // Regla fenológica real: requiere alcanzar al menos R3 (Elote) — evita cosechar plántulas estancadas o bloquear razas precoces
    if (!this.estaListoParaCosecha(id)) {
      const etapaLabel = p.estado === "SEMILLA" ? "Germinando" : nombreEtapa(etapaEnum).split(" ")[0];
      return {
        exito: false,
        mensaje: `¡El elote ${id + 1} aún no está listo (${etapaLabel} · Día ${Math.floor(nodo.diasCultivo)})! Debe llegar al menos a etapa R3.`
      };
    }

    const tipoCosecha: "elote" | "grano_seco" =
      this.obtenerTipoCosecha(id) === "grano_seco" ? "grano_seco" : "elote";
    const tieneHuitlacoche = (p.huitlacoche ?? 0) >= 0.45;

    nodo.cosechada = true;
    const bonusTriada = nodo.frijolVid > 0.3 && nodo.calabazaCobertura > 0.3 ? 0.15 : 0;
    const sanidad = 1 - (nodo.plaga / 100) * 0.5;
    const vigorEfectivo = p.estado === "MUERTA" && p.causaMuerte === "agotamiento" ? 0.72 : p.vigor;
    nodo.calidad = clamp01(
      0.45 * vigorEfectivo +
        0.35 * p.cuajado +
        0.20 * sanidad +
        bonusTriada
    );

    const ear = nodo.maiz.getEarNode();
    nodo.maiz.ocultarMazorcas();

    if (this.particulas) {
      this.particulas.emitirConfeti(nodo.posicionMundo.add(new Vector3(0, 1.2, 0)));
    }

    this.actualizarLetrero(id, true);
    const tipoMazorca =
      tipoCosecha === "grano_seco"
        ? `mazorca seca de grano/semilla (${Math.round(p.humedadGranoPct ?? 16)}% hum.)`
        : `elote fresco R3 (${Math.round(p.humedadGranoPct ?? 72)}% hum.)`;
    const extraHuitla = tieneHuitlacoche ? " + 🍄 ¡Huitlacoche gourmet!" : "";
    return {
      exito: true,
      mensaje: `🌽 ¡Cosechaste ${tipoMazorca} de ${varCfg.nombre} en Planta ${id + 1} (Calidad ${Math.round(nodo.calidad * 100)}%)${extraHuitla}!`,
      variedad: varCfg,
      earMesh: ear,
      calidad: nodo.calidad,
      tipoCosecha,
      tieneHuitlacoche
    };
  }

  public obtenerNodoCercano(posicion: Vector3): NodoSurco {
    let mejorDist = Infinity;
    let mejorNodo = this.nodos[0];

    for (const nodo of this.nodos) {
      const d = Vector3.Distance(posicion, nodo.posicionMundo);
      if (d < mejorDist) {
        mejorDist = d;
        mejorNodo = nodo;
      }
    }
    return mejorNodo;
  }

  /**
   * Avanza la simulación temporal agronómica de cada nodo integrando M3, M4, M5, M6, M7 y agronomía v4.1
   */
  public avanzarSimulacion(
    dtDias: number,
    clima: ClimateState,
    metricas: Metricas,
    severidadEvento = 0,
    factorDificultadMaleza = 1.0
  ): void {
    for (const nodo of this.nodos) {
      // M3: Crecimiento de maleza si la tierra está arada y la planta está sembrada y viva (evita pop-in oculto)
      if (
        nodo.tierraArada >= 100 &&
        nodo.sembrada &&
        !nodo.cosechada &&
        nodo.plantaInterna.estado !== "MUERTA"
      ) {
        const supresion = 0.65 * nodo.calabazaCobertura + 0.15 * nodo.frijolVid;
        const dMaleza =
          dtDias *
          0.65 *
          factorDificultadMaleza *
          (nodo.humedadVWC / 32) *
          (1 + nodo.nutrientesNPK / 120) *
          Math.max(0.08, 1 - supresion);
        nodo.maleza = clamp(nodo.maleza + dMaleza, 0, 100);
      }

      if (!nodo.sembrada || nodo.cosechada) continue;

      const varCfg = VARIEDADES_MAIZ[nodo.variedad];
      const diasMaxCiclo = Math.round(215 * (varCfg.gddCicloCompleto / 1850));
      if (nodo.plantaInterna.estado !== "MUERTA") {
        nodo.diasCultivo = Math.min(diasMaxCiclo + 45, nodo.diasCultivo + dtDias);
      }

      // M6: Protecciones del jugador contra heladas y vendavales
      const abrigoGrados = [0, 1.8, 3.8][nodo.proteccion] ?? 0;
      const tMaxDia = clima.temperatura + 3.0;
      const tMinEfectiva = clima.temperatura - 8.0 + abrigoGrados - severidadEvento * 2.0;
      const tMedDia = (tMaxDia + tMinEfectiva) / 2.0;
      const vientoEfectivo = nodo.tutorado ? clima.viento * 0.45 : clima.viento;
      // Trade-off real del petate: si se deja puesto bajo sol sin frío, sombrea la radiación PAR (~42% menos luz)
      const factorLuzPetate = nodo.proteccion > 0 && clima.temperatura > 12 ? 0.58 : 1.0;

      // M7: Crecimiento climático real de Frijol Ayocote y Calabaza Criolla (sensibles a helada y sequía extrema)
      const climaAptoAsociados = tMinEfectiva > 0.5 && nodo.humedadVWC > 11 && clima.temperatura < 38;
      if (nodo.frijolVid > 0) {
        if (tMinEfectiva <= -1.0) {
          nodo.frijolVid = Math.max(0.05, nodo.frijolVid - dtDias * 0.04);
        } else if (climaAptoAsociados) {
          nodo.frijolVid = clamp01(nodo.frijolVid + dtDias * 0.012);
          // Simbiosis Rhizobium real: solo fija Nitrógeno si el suelo está aireado (<=38% VWC) y pH 5.6..7.4
          if (nodo.humedadVWC <= 38 && clima.phSuelo >= 5.6 && clima.phSuelo <= 7.4) {
            nodo.nSuelo = Math.min(100, nodo.nSuelo + dtDias * 0.65);
            this.sincronizarNPKPromedio(nodo);
          }
        }
      }
      if (nodo.calabazaCobertura > 0) {
        if (tMinEfectiva <= -0.5) {
          nodo.calabazaCobertura = Math.max(0.05, nodo.calabazaCobertura - dtDias * 0.05);
        } else if (climaAptoAsociados) {
          nodo.calabazaCobertura = clamp01(nodo.calabazaCobertura + dtDias * 0.014);
        }
      }

      // Fisiología pura de Zea mays y balance diario de suelo/agua/nutrientes acumulando días enteros
      nodo.diasAcumuladosPaso += dtDias;
      const pasosEnteros = Math.floor(nodo.diasAcumuladosPaso);
      if (pasosEnteros >= 1) {
        nodo.diasAcumuladosPaso -= pasosEnteros;
        const maxPasos = Math.min(pasosEnteros, 60);

        for (let s = 0; s < maxPasos; s++) {
          const etapaDia =
            nodo.plantaInterna.estado === "SEMILLA"
              ? Etapa.SEMILLA
              : etapaDe(nodo.plantaInterna.gdd, CFG, varCfg);
          const factorCritico = etapaDia >= Etapa.V2 && etapaDia <= Etapa.V8 ? 1.8 : 1.0;
          const factorPorteMaleza = nodo.variedad === "palomero" ? 1.65 : 1.0;
          const competencia = 1 + 0.45 * (nodo.maleza / 100) * factorCritico * factorPorteMaleza;

          // Balance hídrico diario con drenaje gravitacional natural hacia capacidad de campo (cc)
          const ahorroMulch = 1 - 0.35 * nodo.calabazaCobertura;
          const eficienciaRaza = nodo.variedad === "rojo" ? 0.78 : 1.0;
          const factorCalorEvap = 0.22 + Math.max(0, clima.temperatura - 20) * 0.028;
          const consumoAguaDia = factorCalorEvap * competencia * ahorroMulch * eficienciaRaza;
          const aporteLluviaDia = clima.lluvia > 0 ? clima.lluvia * 0.12 : 0;
          const drenajeNatural =
            nodo.humedadVWC > varCfg.cc + 2 && clima.lluvia < 10
              ? (nodo.humedadVWC - (varCfg.cc + 2)) * 0.42
              : 0;
          nodo.humedadVWC = clamp(
            nodo.humedadVWC - consumoAguaDia - drenajeNatural + aporteLluviaDia,
            4.5,
            60.0
          );

          // Consumo diario diferenciado de N, P y K según demanda de cada raza
          const dN = (varCfg.demandaN === "Alta" ? 0.28 : varCfg.demandaN === "Media" ? 0.20 : 0.14) * competencia;
          const dP = (varCfg.demandaP === "Alta" ? 0.20 : 0.14) * competencia;
          const dK = (varCfg.demandaK === "Alta" ? 0.24 : 0.16) * competencia;
          nodo.nSuelo = Math.max(8.0, nodo.nSuelo - dN);
          nodo.pSuelo = Math.max(8.0, nodo.pSuelo - dP);
          nodo.kSuelo = Math.max(8.0, nodo.kSuelo - dK);
          this.sincronizarNPKPromedio(nodo);

          // M5: Polinización natural al pasar por ventana VT -> R2
          if (etapaDia >= Etapa.VT && etapaDia <= Etapa.R2) {
            const umbralCalorPolen = nodo.variedad === "azul" ? 28.0 : varCfg.tCorte;
            const viento01 = clamp01(1 - Math.abs(clima.viento - 2.8) / 3.2);
            const calor01 = clamp01(1 - Math.max(0, clima.temperatura - umbralCalorPolen) / 7);
            const lluvia01 = 1 - clamp01(clima.lluvia / 12);
            nodo.polinizacion = Math.min(1, nodo.polinizacion + 0.11 * viento01 * calor01 * lluvia01);
          }

          // Competencia por maleza acentuada en Palomero (porte bajo)
          if (nodo.plantaInterna.estado !== "MUERTA" && nodo.plantaInterna.estado !== "MADURA") {
            if (nodo.variedad === "palomero" && nodo.maleza > 30) {
              nodo.plantaInterna.vigor = clamp01(
                nodo.plantaInterna.vigor - 0.018 * ((nodo.maleza - 30) / 70)
              );
            }
          }

          // Radiación PAR diurna estimada independiente de la hora nocturna instantánea (para pasos diarios)
          const factorNub = 1 - 0.7 * Math.pow(clima.nubosidad / 100, 2.4);
          const factorAer = Math.exp(-clima.pm25 / 900);
          const parDiarioEst = 1350 * factorNub * factorAer * (1 - 0.4 * clamp01(clima.lluvia / 30));

          const climaDia: ClimaDia = {
            tMax: tMaxDia,
            tMin: tMinEfectiva,
            tMed: tMedDia,
            tSuelo: Math.max(4, tMedDia - 0.5 + abrigoGrados * 0.4),
            hr: clima.humedad,
            vwc: nodo.humedadVWC,
            ph: clima.phSuelo,
            viento: vientoEfectivo,
            lluvia: clima.lluvia,
            co2: clima.co2,
            presion: clima.presion,
            nubosidad: clima.nubosidad,
            pm25: clima.pm25,
            horasBajoMenos2_5: tMinEfectiva <= -1.5 ? 3.5 : 0,
            estresBiotico: clamp01(nodo.plaga / 100),
            parDiario: parDiarioEst,
            factorLuz: factorLuzPetate,
            nSuelo: nodo.nSuelo,
            pSuelo: nodo.pSuelo,
            kSuelo: nodo.kSuelo,
            riesgoFungico: metricas.riesgoFungico,
            polinizacionNivel: nodo.polinizacion
          };

          nodo.plantaInterna.tieneFrijol = nodo.frijolVid > 0;
          nodo.plantaInterna.tieneCalabaza = nodo.calabazaCobertura > 0;
          pasoDia(nodo.plantaInterna, climaDia, CFG);
        }
      }

      // Copiar todos los estados fisiológicos, de secado y de muerte al EstadoCrecimiento para el render 3D
      const p = nodo.plantaInterna;
      nodo.gddAcumulados = p.gdd;
      nodo.estadoCrec.dia = nodo.diasCultivo;
      nodo.estadoCrec.gddAcumulado = p.gdd;
      nodo.estadoCrec.etapa =
        p.estado === "SEMILLA" ? nombreEtapa(Etapa.SEMILLA) : nombreEtapa(etapaDe(nodo.gddAcumulados, CFG, varCfg));
      nodo.estadoCrec.plantaInterna = p;
      nodo.estadoCrec.saludVital = p.vigor;
      nodo.estadoCrec.acameGrados = p.acameGrados;
      nodo.estadoCrec.estaMuerta = p.estado === "MUERTA";
      nodo.estadoCrec.causaMuerte = p.causaMuerte ?? null;
      nodo.estadoCrec.degradacion = p.degradacion;
      nodo.estadoCrec.pesoSequia = Math.max(p.sequia, (p.secado ?? 0) * 0.65);
      nodo.estadoCrec.pesoFrio = p.frio;
      nodo.estadoCrec.amarillamiento = p.amarillamiento;
      nodo.estadoCrec.antocianina = p.antocianina;
      nodo.estadoCrec.alturaMetros = p.alturaMetros;
      nodo.estadoCrec.escalaPlanta = p.escala;
      nodo.estadoCrec.cuajado = p.cuajado;

      nodo.frame60 = gddAFrame60(
        nodo.gddAcumulados,
        VARIEDADES_MAIZ[nodo.variedad].gddCicloCompleto
      );

      if (p.estado === "MUERTA") {
        // Al morir la planta, limpiar plaga y maleza residuales para que no queden objetos flotando alrededor
        nodo.plaga = 0;
        nodo.maleza = 0;
      }

      // Ocultar granos superficiales cuando la plántula ya emergió
      if (p.estado !== "SEMILLA") {
        nodo.semillasMesh.forEach((grano) => grano.setEnabled(false));
      }

      nodo.maiz.sincronizarConEstado(nodo.estadoCrec, clima, calcularMetricas(clima, nodo.variedad));

      const suelo60 = obtenerEstadoSuelo60(
        nodo.tierraArada,
        nodo.humedadVWC,
        nodo.humedadVWC > 38
      );
      this.aplicarEstadoSuelo(nodo, suelo60);
      nodo.charcoMat.alpha = suelo60.laminillaAgua;

      this.actualizarLetrero(nodo.id);
    }
  }

  public animarViento(tiempoAcumulado: number, viento: number): void {
    for (let i = 0; i < this.nodos.length; i++) {
      const nodo = this.nodos[i];
      if (nodo.sembrada && nodo.plantaInterna.estado !== "SEMILLA") {
        const desfase = i * 0.45;
        const vientoNodo = nodo.cosechada ? viento * 0.4 : nodo.tutorado ? viento * 0.45 : viento;
        nodo.maiz.animarViento(
          tiempoAcumulado + desfase,
          vientoNodo,
          nodo.estadoCrec.acameGrados,
          nodo.estadoCrec.estaMuerta
        );
      }
    }
  }

  /**
   * §6.2 / H10: Política de contornos por distancia (cada 0.25 s, sin GC)
   */
  public actualizarContornos(dt: number, camPos: Vector3): void {
    this.timerContornos += dt;
    if (this.timerContornos < 0.25) return;
    this.timerContornos = 0;

    for (let i = 0; i < this.nodos.length; i++) {
      const n = this.nodos[i];
      const distSq = Vector3.DistanceSquared(n.posicionMundo, camPos);
      const cerca = distSq < 36.0 || i === this.nodoSeleccionadoId; // < 6 m
      n.monticuloMesh.renderOutline = false;
      n.letreroMadera.renderOutline = false;
      n.maiz.actualizarContornoDistancia(cerca);
    }
  }

  /**
   * Reinicia todas las estaciones del surco para comenzar un nuevo ciclo agrícola
   */
  public reiniciarSurco(): void {
    for (let i = 0; i < this.nodos.length; i++) {
      const n = this.nodos[i];
      n.tierraArada = 0;
      n.sembrada = false;
      n.cosechada = false;
      n.diasCultivo = 0;
      n.diasAcumuladosPaso = 0;
      n.humedadVWC = 24;
      n.nSuelo = 45;
      n.pSuelo = 45;
      n.kSuelo = 45;
      n.nutrientesNPK = 45;
      n.gddAcumulados = 0;
      n.frame60 = 0;
      n.maleza = 0;
      n.plaga = 0;
      n.polinizacion = 0;
      n.tutorado = false;
      n.proteccion = 0;
      n.calidad = 0.85;
      n.frijolVid = 0;
      n.calabazaCobertura = 0;
      n.frijolCosechado = false;
      n.calabazaCosechada = false;
      n.cultivoAsociado = "ninguno";
      n.plantaInterna = crearPlanta(n.variedad, "ninguno");
      n.estadoCrec.plantaInterna = n.plantaInterna;
      n.estadoCrec.dia = 0;
      n.estadoCrec.gddAcumulado = 0;
      n.estadoCrec.etapa = nombreEtapa(Etapa.SEMILLA);
      n.estadoCrec.estaMuerta = false;
      n.estadoCrec.causaMuerte = null;
      n.estadoCrec.degradacion = 0;
      n.estadoCrec.acameGrados = 0;
      n.tutorMesh.setEnabled(false);
      n.proteccionMesh.setEnabled(false);
      n.maiz.root.position.set(n.posicionMundo.x, n.posicionMundo.y - 0.02, n.posicionMundo.z);
      n.maiz.root.scaling.setAll(this.calcularEscalaVariedad(n.variedad));
      n.maiz.root.setEnabled(false);
      n.semillasMesh.forEach((g) => g.setEnabled(false));
      n.surcosMesh.forEach((s) => s.scaling.set(1, 0.001, 1));
      const suelo60 = obtenerEstadoSuelo60(0, n.humedadVWC, false);
      this.aplicarEstadoSuelo(n, suelo60);
      n.monticuloMesh.scaling.y = 1.0;
      n.charcoMat.alpha = 0;
      this.actualizarLetrero(i, true);
    }
  }

  public exportarSnapshot(): import("./juego/persistencia_mundo").NodoGuardado[] {
    return this.nodos.map((n) => ({
      id: n.id,
      variedad: n.variedad,
      cultivoAsociado: n.cultivoAsociado,
      tierraArada: n.tierraArada,
      sembrada: n.sembrada,
      humedadVWC: n.humedadVWC,
      nutrientesNPK: n.nutrientesNPK,
      nSuelo: n.nSuelo,
      pSuelo: n.pSuelo,
      kSuelo: n.kSuelo,
      gddAcumulados: n.gddAcumulados,
      frame60: n.frame60,
      cosechada: n.cosechada,
      diasCultivo: n.diasCultivo,
      maleza: n.maleza,
      plaga: n.plaga,
      polinizacion: n.polinizacion,
      tutorado: n.tutorado,
      proteccion: n.proteccion,
      calidad: n.calidad,
      frijolVid: n.frijolVid,
      calabazaCobertura: n.calabazaCobertura,
      frijolCosechado: n.frijolCosechado,
      calabazaCosechada: n.calabazaCosechada,
      plantaInterna: {
        ...n.plantaInterna,
        rasgosHeredados: n.plantaInterna.rasgosHeredados
          ? { ...n.plantaInterna.rasgosHeredados }
          : undefined
      }
    }));
  }

  public restaurarSnapshot(
    snaps: import("./juego/persistencia_mundo").NodoGuardado[],
    clima: ClimateState,
    metricas: Metricas
  ): void {
    if (!Array.isArray(snaps)) return;
    for (let i = 0; i < this.nodos.length && i < snaps.length; i++) {
      const s = snaps[i];
      const n = this.nodos[i];
      n.variedad = s.variedad || n.variedad;
      n.cultivoAsociado = s.cultivoAsociado || "ninguno";
      n.tierraArada = s.tierraArada ?? 0;
      n.sembrada = !!s.sembrada;
      n.humedadVWC = s.humedadVWC ?? 24;
      n.nutrientesNPK = s.nutrientesNPK ?? 45;
      n.nSuelo = s.nSuelo ?? n.nutrientesNPK;
      n.pSuelo = s.pSuelo ?? n.nutrientesNPK;
      n.kSuelo = s.kSuelo ?? n.nutrientesNPK;
      this.sincronizarNPKPromedio(n);
      n.gddAcumulados = s.gddAcumulados ?? 0;
      n.frame60 = s.frame60 ?? 0;
      n.cosechada = !!s.cosechada;
      n.diasCultivo = s.diasCultivo ?? 0;
      n.diasAcumuladosPaso = 0;
      n.maleza = s.maleza ?? 0;
      n.plaga = s.plaga ?? 0;
      n.polinizacion = s.polinizacion ?? 0;
      n.tutorado = !!s.tutorado;
      n.proteccion = s.proteccion ?? 0;
      n.calidad = s.calidad ?? 0.85;
      n.frijolVid = s.frijolVid ?? 0;
      n.calabazaCobertura = s.calabazaCobertura ?? 0;
      n.frijolCosechado = !!s.frijolCosechado;
      n.calabazaCosechada = !!s.calabazaCosechada;

      if (s.plantaInterna) {
        n.plantaInterna = {
          ...s.plantaInterna,
          variedad: n.variedad,
          tieneFrijol: n.frijolVid > 0,
          tieneCalabaza: n.calabazaCobertura > 0,
          rasgosHeredados: s.plantaInterna.rasgosHeredados
            ? { ...s.plantaInterna.rasgosHeredados }
            : undefined
        };
      } else {
        n.plantaInterna = crearPlanta(n.variedad, n.cultivoAsociado);
      }

      const varCfg = VARIEDADES_MAIZ[n.variedad];
      const p = n.plantaInterna;
      n.maiz.setVariedad(n.variedad);
      n.estadoCrec.plantaInterna = p;
      n.estadoCrec.dia = n.diasCultivo;
      n.estadoCrec.gddAcumulado = n.gddAcumulados;
      const etapa = p.estado === "SEMILLA" ? Etapa.SEMILLA : etapaDe(n.gddAcumulados, CFG, varCfg);
      n.estadoCrec.etapa = nombreEtapa(etapa);
      n.estadoCrec.estaMuerta = p.estado === "MUERTA";
      n.estadoCrec.causaMuerte = p.causaMuerte ?? null;
      n.estadoCrec.saludVital = p.vigor;
      n.estadoCrec.degradacion = p.degradacion;
      n.estadoCrec.acameGrados = p.acameGrados;
      n.estadoCrec.pesoSequia = Math.max(p.sequia, (p.secado ?? 0) * 0.65);
      n.estadoCrec.pesoFrio = p.frio;
      n.estadoCrec.amarillamiento = p.amarillamiento;
      n.estadoCrec.antocianina = p.antocianina;
      n.estadoCrec.alturaMetros = p.alturaMetros;
      n.estadoCrec.escalaPlanta = p.escala;
      n.estadoCrec.cuajado = p.cuajado;

      n.tutorMesh.setEnabled(n.tutorado);
      n.proteccionMesh.setEnabled(n.proteccion > 0);
      const nivelArado = n.tierraArada / 100;
      n.surcosMesh.forEach((sm, idx) => {
        sm.scaling.y = Math.max(0.001, Math.min(1.0, nivelArado * 3 - idx));
        sm.scaling.x = 1.0 + nivelArado * 0.35;
      });
      n.semillasMesh.forEach((gm) => gm.setEnabled(n.sembrada && p.estado === "SEMILLA"));

      // Restaurar color, humedad, rugosidad y charco del montículo
      const suelo60 = obtenerEstadoSuelo60(n.tierraArada, n.humedadVWC, n.humedadVWC > 38);
      this.aplicarEstadoSuelo(n, suelo60);
      n.monticuloMesh.scaling.y = 1.0 + suelo60.rugosidad * 0.35;
      n.charcoMat.alpha = suelo60.laminillaAgua;

      // Escala coherente por variedad (sin distorsión)
      n.maiz.root.scaling.setAll(this.calcularEscalaVariedad(n.variedad));
      n.maiz.root.setEnabled(n.sembrada && p.estado !== "SEMILLA");
      if (n.sembrada) {
        n.maiz.sincronizarConEstado(n.estadoCrec, clima, calcularMetricas(clima, n.variedad));
        if (n.cosechada) {
          n.maiz.ocultarMazorcas();
        }
      }
      this.actualizarLetrero(i, true);
    }
  }
}
