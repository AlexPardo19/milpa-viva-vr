import {
  AbstractMesh,
  Camera,
  Color3,
  ColorCurves,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Nullable,
  PBRMaterial,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
  Constants,
  Tools,
} from "@babylonjs/core";
import { crearMaterialPatrixPBR, PatrixMaterialId } from "./ui/texturas_patrix_pbr";

// Desactivar permanentemente cualquier renderOutline heredado para conservar limpieza fotorrealista
Object.defineProperty(Mesh.prototype, "renderOutline", {
  get() {
    return false;
  },
  set(_v: boolean) {
    /* ignorado: estilo Patrix sin contornos caricatura */
  },
  configurable: true,
});

export function esEngineHeadless(scene: Scene): boolean {
  const eng = scene.getEngine();
  const nombre = eng?.constructor?.name ?? "";
  return nombre === "NullEngine" || eng?.name === "Null";
}

export interface ControladorEstiloPatrix {
  probeCielo: Nullable<ReflectionProbe>;
  defaultPipeline: Nullable<DefaultRenderingPipeline>;
  ssaoPipeline: Nullable<SSAO2RenderingPipeline>;
  agregarMeshAIBL(mesh: AbstractMesh): void;
  refrescarIBL(): void;
  vincularCamara(cam: Camera): void;
  ajustarPostProcesoXR(enXR: boolean): void;
  aplicarGradoHorario(
    wDia: number,
    wNoche: number,
    wCrepusculo: number,
    factorNub: number,
    esAtardecer: boolean
  ): void;
  actualizarRayosSolares(intensidad: number, solVisible: boolean): void;
  unificarMaterialesRestantes(): void;
  dispose(): void;
}

const NOMBRES_EMISIVOS_PRESERVAR = [
  "sunMat",
  "haloMat",
  "sunRaysMat",
  "moonMat",
  "moonHaloMat",
  "starMat",
  "fogonLl",
  "fuego",
  "llama",
  "brasa",
  "farolLuz",
  "hud",
  "reticula",
  "rayo",
  "teleport",
  "puntero",
  "ventana",
];

const NOMBRES_TEXTO_DIEGETICO = [
  "letrero",
  "cartel",
  "etiq",
  "bandeja",
  "badge",
  "reloj",
  "pantalla",
  "texto",
  "pergamino",
  "ranura",
  "menu",
];

/**
 * Configura iluminación, tone-mapping ACES, IBL de cielo, SSAO2 y Bloom
 * para recrear el aspecto Patrix + Shader realista.
 */
export function aplicarEstiloPatrix(
  scene: Scene,
  sol: DirectionalLight,
  hemi: HemisphericLight,
  shadowGen?: ShadowGenerator
): ControladorEstiloPatrix {
  const headless = esEngineHeadless(scene);
  const esSafari = !headless && Tools.IsSafari();

  // 1. Color grading + ACES Filmic (shader realista tipo BSL/Complementary/SEUS)
  const ip = scene.imageProcessingConfiguration;
  ip.isEnabled = true;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.12;
  ip.contrast = 1.14;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 0.95;
  ip.vignetteStretch = 0.45;
  ip.vignetteColor.set(0.02, 0.04, 0.07, 0);
  // Por defecto aplicar en shader (indispensable en Safari donde se evita FBO HDR/PrePass)
  ip.applyByPostProcess = false;

  const curves = new ColorCurves();
  curves.globalSaturation = 12;
  curves.highlightsHue = 40;
  curves.highlightsDensity = 18;
  curves.highlightsSaturation = 16;
  curves.shadowsHue = 212;
  curves.shadowsDensity = 12;
  curves.shadowsSaturation = 16;
  ip.colorCurvesEnabled = true;
  ip.colorCurves = curves;

  // 2. Luz solar dorada oblicua + cielo hemisférico balanceado para PBR
  sol.diffuse = new Color3(1.0, 0.91, 0.74);
  sol.specular = new Color3(1.0, 0.95, 0.85);
  sol.intensity = 3.55;

  hemi.diffuse = new Color3(0.76, 0.88, 1.0);
  hemi.groundColor = new Color3(0.36, 0.31, 0.22);
  hemi.intensity = 0.62;

  if (shadowGen) {
    const esCSM = shadowGen.getClassName?.() === "CascadedShadowGenerator";
    if (!esCSM) {
      shadowGen.useBlurExponentialShadowMap = false;
    }
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.filteringQuality = esCSM ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_HIGH;
    shadowGen.bias = esCSM ? 0.0025 : 0.0005;
    shadowGen.normalBias = esCSM ? 0.02 : 0.015;
    shadowGen.setDarkness(0.16);
  }

  // 3. IBL dinámico de cielo mediante ReflectionProbe (cubemap 8-bit compatible con Safari/WebKit Metal)
  let probeCielo: Nullable<ReflectionProbe> = null;
  if (!headless) {
    try {
      probeCielo = new ReflectionProbe("patrixSkyProbe", 128, scene, true, false);
      probeCielo.position.set(0, 18, 0);
      probeCielo.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      scene.environmentTexture = probeCielo.cubeTexture;
      scene.environmentIntensity = 0.92;
    } catch {
      probeCielo = null;
    }
  }

  // 4. Pipelines GPU (SSAO2 siempre ANTES que DefaultRenderingPipeline; desactivado en Safari por PrePass/HalfFloat FBO)
  let defaultPipeline: Nullable<DefaultRenderingPipeline> = null;
  let ssaoPipeline: Nullable<SSAO2RenderingPipeline> = null;
  const camarasVinculadas = new Set<Camera>();

  const vincularCamara = (cam: Camera): void => {
    if (headless || esSafari || !cam) return;
    if (camarasVinculadas.has(cam)) return;
    // Ignorar subcámaras stereo rig de WebXR en SSAO para no romper buffers VR
    const esRig = Boolean((cam as unknown as { isRigCamera?: boolean }).isRigCamera);
    if (esRig) return;

    camarasVinculadas.add(cam);
    try {
      if (ssaoPipeline) {
        scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          "patrixSSAOPipeline",
          cam
        );
      }
      if (defaultPipeline) {
        scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          "patrixDefaultPipeline",
          cam
        );
      }
    } catch {
      /* cámara ya adjunta o incompatible */
    }
  };

  if (!headless && !esSafari) {
    try {
      const iniciales = scene.cameras.filter(
        (c) => !Boolean((c as unknown as { isRigCamera?: boolean }).isRigCamera)
      );
      iniciales.forEach((c) => camarasVinculadas.add(c));

      if (SSAO2RenderingPipeline.IsSupported) {
        ssaoPipeline = new SSAO2RenderingPipeline(
          "patrixSSAOPipeline",
          scene,
          { ssaoRatio: 0.6, blurRatio: 0.85 },
          iniciales,
          false,
          Constants.TEXTURETYPE_UNSIGNED_BYTE
        );
        ssaoPipeline.radius = 1.35;
        ssaoPipeline.totalStrength = 1.05;
        ssaoPipeline.samples = 16;
        ssaoPipeline.maxZ = 95;
        ssaoPipeline.minZAspect = 0.35;
        ssaoPipeline.base = 0.08;
        ssaoPipeline.expensiveBlur = true;
        ssaoPipeline.bilateralSamples = 12;
        ssaoPipeline.bilateralSoften = 0.25;
        ssaoPipeline.bilateralTolerance = 0.4;
      }

      // automaticBuild=false evita reconstrucciones parciales que dejan huecos null en _postProcesses
      defaultPipeline = new DefaultRenderingPipeline(
        "patrixDefaultPipeline",
        true,
        scene,
        iniciales,
        false
      );
      defaultPipeline.fxaaEnabled = true;
      defaultPipeline.samples = 1;
      defaultPipeline.imageProcessingEnabled = true;

      defaultPipeline.bloomEnabled = true;
      defaultPipeline.bloomThreshold = 0.84;
      defaultPipeline.bloomWeight = 0.22;
      defaultPipeline.bloomKernel = 48;
      defaultPipeline.bloomScale = 0.5;

      defaultPipeline.sharpenEnabled = true;
      defaultPipeline.sharpen.edgeAmount = 0.22;
      defaultPipeline.sharpen.colorAmount = 1.0;

      defaultPipeline.prepare();
    } catch {
      /* entorno WebGL limitado */
    }

    // Cualquier cámara nueva no-VR agregada después se registra automáticamente
    scene.onNewCameraAddedObservable.add((cam) => {
      vincularCamara(cam);
    });
  }

  const unificarMaterialesRestantes = (): void => {
    const mapaPxAPatrix = (texName: string, matNameLower: string): PatrixMaterialId | null => {
      if (texName.startsWith("texPxMadera_clara")) return "madera_roble";
      if (texName.startsWith("texPxMadera_")) return "madera_oscura";
      if (texName.startsWith("texPxPiedra_")) return "piedra_cobble";
      if (texName.startsWith("texPxTeja")) return "techo_paja";
      if (texName.startsWith("texPxFollaje")) return "follaje_roble";
      if (texName.startsWith("texPxPasto")) return "pasto";
      if (texName.startsWith("texPxTierraSurco") || texName.startsWith("texPxRuidoSuelo")) {
        return "tierra_surco";
      }
      if (matNameLower === "matatrilcodice") return "madera_oscura";
      if (matNameLower === "matpiedrametate") return "piedra_montana";
      if (matNameLower === "matdispmetal") return "metal_forjado";
      if (matNameLower === "matdisptecho") return "techo_paja";
      return null;
    };

    const reemplazarSet = new Map<StandardMaterial, PBRMaterial>();
    const noSombrasSet = new Set<StandardMaterial>();
    for (const mat of scene.materials) {
      if (!(mat instanceof StandardMaterial)) continue;
      if (mat.metadata?.patrixSkip || mat.metadata?.esEmisivoReal) {
        noSombrasSet.add(mat);
        continue;
      }

      const lower = mat.name.toLowerCase();
      const esEmisivoIntencional = NOMBRES_EMISIVOS_PRESERVAR.some((k) =>
        lower.includes(k.toLowerCase())
      );
      if (esEmisivoIntencional) {
        noSombrasSet.add(mat);
        continue;
      }

      // Conservar legibilidad de letreros, placas de texto y páginas diegéticas sin romper con bloom
      const esTextoUI =
        Boolean(mat.emissiveTexture) ||
        NOMBRES_TEXTO_DIEGETICO.some((k) => lower.includes(k));
      if (esTextoUI) {
        noSombrasSet.add(mat);
        if (mat.emissiveColor) {
          mat.emissiveColor = new Color3(
            Math.min(0.62, mat.emissiveColor.r),
            Math.min(0.62, mat.emissiveColor.g),
            Math.min(0.62, mat.emissiveColor.b)
          );
        }
        continue;
      }

      const tex = mat.diffuseTexture as Texture | null;
      const texName = tex?.name ?? "";
      const idPatrix = mapaPxAPatrix(texName, lower);
      if (idPatrix) {
        const pbr = crearMaterialPatrixPBR(scene, idPatrix, {
          nombre: `${mat.name}_patrixPBR`,
          uScale: tex?.uScale ?? 1,
          vScale: tex?.vScale ?? 1,
          usarPOM: idPatrix !== "follaje_roble",
          cacheable: true,
        });
        reemplazarSet.set(mat, pbr);
        continue;
      }

      // Suprimir autoiluminación artificial del estilo Mako anterior
      if (
        mat.emissiveColor &&
        (mat.emissiveColor.r > 0.03 || mat.emissiveColor.g > 0.03 || mat.emissiveColor.b > 0.03)
      ) {
        mat.emissiveColor = mat.emissiveColor.scale(0.05);
      }
      mat.specularColor = new Color3(0.09, 0.09, 0.09);
      mat.specularPower = 32;
    }

    for (const mesh of scene.meshes) {
      if (!mesh || mesh.infiniteDistance || !mesh.applyFog) continue;
      const m = mesh.material;
      if (m instanceof StandardMaterial && reemplazarSet.has(m)) {
        mesh.material = reemplazarSet.get(m)!;
      }
      if (mesh.isVisible && !(mesh instanceof InstancedMesh)) {
        mesh.receiveShadows =
          !(m instanceof StandardMaterial && noSombrasSet.has(m)) &&
          !(m && m.metadata?.esEmisivoReal);
      }
    }
  };

  unificarMaterialesRestantes();

  return {
    probeCielo,
    defaultPipeline,
    ssaoPipeline,
    agregarMeshAIBL(mesh: AbstractMesh) {
      if (probeCielo?.renderList && !probeCielo.renderList.includes(mesh)) {
        probeCielo.renderList.push(mesh);
      }
    },
    refrescarIBL() {
      if (probeCielo) {
        probeCielo.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      }
    },
    vincularCamara,
    ajustarPostProcesoXR(enXR: boolean) {
      if (ssaoPipeline) {
        ssaoPipeline.totalStrength = enXR ? 0.0 : 1.05;
      }
    },
    aplicarGradoHorario(
      wDia: number,
      wNoche: number,
      wCrepusculo: number,
      factorNub: number,
      esAtardecer: boolean
    ) {
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

      // Exposición/contraste de ImageProcessing se mantienen fijos para evitar
      // _updateParameters() -> _markAllSubMeshesAsImageProcessingDirty() cada frame al amanecer/atardecer;
      // las curvas cromáticas y el IBL sí se actualizan por uniforme sin recompilar materiales.
      const hiHueDia = 40;
      const hiHueCrep = esAtardecer ? 22 : 338;
      const hiHueNoche = 216;
      const hiHueBase = lerp(hiHueDia, hiHueCrep, clamp01(wCrepusculo * 1.15));
      curves.highlightsHue = lerp(hiHueBase, hiHueNoche, wNoche);
      curves.highlightsSaturation = lerp(14, 34, wCrepusculo) + wNoche * 8 - factorNub * 10;
      curves.highlightsDensity = lerp(16, 28, wCrepusculo) + wNoche * 4;

      const shHueBase = lerp(212, 246, wCrepusculo);
      curves.shadowsHue = lerp(shHueBase, 224, wNoche);
      curves.shadowsSaturation = lerp(14, 24, wCrepusculo) + wNoche * 14 - factorNub * 8;
      curves.shadowsDensity = lerp(10, 16, Math.max(wCrepusculo, wNoche));

      curves.globalSaturation = lerp(12, 6, wNoche) + wCrepusculo * 8 - factorNub * 14;

      if (probeCielo) {
        scene.environmentIntensity = lerp(lerp(0.76, 0.94, wDia), 0.48, wNoche) * (1 - factorNub * 0.18);
      }
      if (defaultPipeline) {
        defaultPipeline.bloomThreshold = lerp(0.84, 0.74, Math.max(wCrepusculo, wNoche));
      }
    },
    actualizarRayosSolares(intensidad: number, solVisible: boolean) {
      if (!defaultPipeline) return;
      if (solVisible) {
        defaultPipeline.bloomWeight = 0.21 + Math.max(0, Math.min(1, intensidad)) * 0.14;
      } else {
        defaultPipeline.bloomWeight = 0.24;
      }
    },
    unificarMaterialesRestantes,
    dispose() {
      probeCielo?.dispose();
      ssaoPipeline?.dispose();
      defaultPipeline?.dispose();
    },
  };
}

export interface SubHojaAnim {
  mesh: Mesh;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
  pesoAleteo: number;
  fase: number;
}

export interface CopaArbolAnim {
  pivot: TransformNode;
  fase: number;
  escala: number;
  hojas: SubHojaAnim[];
}

export interface FactoresVientoArbol {
  w: number;
  lean: number;
  freqSway: number;
  freqLeaf: number;
}

/** Calcula intensidad normalizada, inclinación constante y frecuencias de ráfaga según viento (m/s). */
export function calcularFactoresVientoArbol(vientoMs: number): FactoresVientoArbol {
  const v = Math.max(0, vientoMs);
  if (v <= 0.02) {
    return { w: 0, lean: 0, freqSway: 1.1, freqLeaf: 3.1 };
  }
  const w = Math.min(1.65, Math.pow(v / 14.0, 0.84) * 1.15);
  return {
    w,
    lean: w * 0.088,
    freqSway: 1.1 + v * 0.16,
    freqLeaf: 3.1 + v * 0.56,
  };
}

/**
 * Añade racimos de planos cruzados con textura alfa-cutout de hojas alrededor de la copa
 * para romper la silueta cúbica y permitir aleteo individual con el viento.
 */
export function poblarPlanosFoliaresCopa(
  scene: Scene,
  parent: TransformNode,
  matHoja: PBRMaterial,
  nombreBase: string,
  centroY: number,
  radioXZ: number,
  altoCopa: number,
  seed: number,
  shadowGen: Nullable<ShadowGenerator> = null
): SubHojaAnim[] {
  const salida: SubHojaAnim[] = [];
  const totalPlanos = 6;
  for (let i = 0; i < totalPlanos; i++) {
    const esCorona = i >= 4;
    const ang = esCorona
      ? (i - 4) * (Math.PI * 0.5) + seed * 0.4
      : (i / 4) * Math.PI * 2 + seed * 0.55;
    const dist = esCorona ? radioXZ * 0.18 : radioXZ * 0.78;
    const py = esCorona
      ? centroY + altoCopa * 0.42
      : centroY + ((i % 2 === 0 ? 0.14 : -0.10) * altoCopa);
    const w = esCorona ? radioXZ * 1.18 : radioXZ * 1.05;
    const h = esCorona ? altoCopa * 0.88 : altoCopa * 0.96;

    const p = MeshBuilder.CreatePlane(
      `${nombreBase}_hojaPl_${i}`,
      { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    p.position.copyFrom(new Vector3(Math.cos(ang) * dist, py, Math.sin(ang) * dist));
    const baseRotX = esCorona ? 0.22 * (i === 4 ? 1 : -1) : 0.18 * (i % 2 === 0 ? 1 : -1);
    const baseRotY = ang + Math.PI * 0.5 + (i % 2 === 0 ? 0.28 : -0.24);
    const baseRotZ = esCorona ? 0.16 : 0.14 * (i % 3 === 0 ? -1 : 1);
    p.rotation.set(baseRotX, baseRotY, baseRotZ);
    p.material = matHoja;
    p.parent = parent;
    p.receiveShadows = true;
    p.isPickable = false;
    shadowGen?.addShadowCaster(p);

    salida.push({
      mesh: p,
      baseRotX,
      baseRotY,
      baseRotZ,
      pesoAleteo: esCorona ? 1.25 : 1.0 + (i % 3) * 0.15,
      fase: seed * 1.7 + i * 1.37,
    });
  }
  return salida;
}

/** Anima copas de árboles y aleteo desfasado de hojas en función de la velocidad del viento. */
export function animarCopasArboles(
  copas: readonly CopaArbolAnim[],
  tiempo: number,
  vientoMs: number
): void {
  const { w, lean, freqSway, freqLeaf } = calcularFactoresVientoArbol(vientoMs);
  for (let i = 0; i < copas.length; i++) {
    const copa = copas[i];
    if (w === 0) {
      copa.pivot.rotation.set(0, 0, 0);
      for (let j = 0; j < copa.hojas.length; j++) {
        const h = copa.hojas[j];
        h.mesh.rotation.set(h.baseRotX, h.baseRotY, h.baseRotZ);
      }
      continue;
    }

    const damp = 1.0 / Math.max(0.85, Math.sqrt(copa.escala));
    const gustX =
      Math.sin(tiempo * freqSway + copa.fase) * 0.72 +
      Math.sin(tiempo * (freqSway * 1.67) + copa.fase * 1.9) * 0.28;
    const gustZ =
      Math.cos(tiempo * (freqSway * 0.88) + copa.fase * 1.3) * 0.65 +
      Math.sin(tiempo * (freqSway * 1.41) + copa.fase) * 0.35;

    copa.pivot.rotation.z = -(lean + gustX * (0.015 + w * 0.075)) * damp;
    copa.pivot.rotation.x = gustZ * (0.01 + w * 0.044) * damp;
    copa.pivot.rotation.y = Math.sin(tiempo * (freqSway * 0.75) + copa.fase * 0.6) * (0.006 + w * 0.03) * damp;

    for (let j = 0; j < copa.hojas.length; j++) {
      const h = copa.hojas[j];
      const amp = (0.012 + w * 0.072) * h.pesoAleteo;
      const a1 = Math.sin(tiempo * freqLeaf + h.fase + copa.fase);
      const a2 = Math.cos(tiempo * (freqLeaf * 1.37) + h.fase * 1.7);
      h.mesh.rotation.z = h.baseRotZ - amp * 0.4 + a1 * amp;
      h.mesh.rotation.x = h.baseRotX + a2 * amp * 0.78;
      h.mesh.rotation.y = h.baseRotY + (a1 - a2) * amp * 0.45;
    }
  }
}
