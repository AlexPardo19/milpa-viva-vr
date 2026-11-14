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
  Nullable,
  PBRMaterial,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
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
  ip.exposure = 1.18;
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

      // Exposición y contraste calibrados para día luminoso, atardecer cálido y noche estrellada legible
      const expBase = lerp(lerp(1.10, 1.05, wDia), 1.24, wNoche) + wCrepusculo * 0.06;
      ip.exposure = Math.max(0.92, expBase - factorNub * 0.06);
      ip.contrast = lerp(1.15, 1.10, wNoche) + wCrepusculo * 0.05 - factorNub * 0.06;

      // Curvas cromáticas dinámicas (luces doradas/rosadas en ocaso, azul plata en noche)
      const hiHueDia = 40;
      const hiHueCrep = esAtardecer ? 22 : 338;
      const hiHueNoche = 216;
      const hiHueBase = lerp(hiHueDia, hiHueCrep, clamp01(wCrepusculo * 1.15));
      curves.highlightsHue = lerp(hiHueBase, hiHueNoche, wNoche);
      curves.highlightsSaturation = lerp(14, 34, wCrepusculo) + wNoche * 8 - factorNub * 10;
      curves.highlightsDensity = lerp(16, 26, wCrepusculo);

      const shHueBase = lerp(212, 246, wCrepusculo);
      curves.shadowsHue = lerp(shHueBase, 224, wNoche);
      curves.shadowsSaturation = lerp(14, 24, wCrepusculo) + wNoche * 14 - factorNub * 8;
      curves.shadowsDensity = lerp(10, 16, Math.max(wCrepusculo, wNoche));

      curves.globalSaturation = lerp(12, 6, wNoche) + wCrepusculo * 8 - factorNub * 14;

      if (probeCielo) {
        scene.environmentIntensity = lerp(lerp(0.74, 0.94, wDia), 0.42, wNoche) * (1 - factorNub * 0.18);
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
