/**
 * Estilo visual unificado (referencia: pack de texturas "Mako" de Minecraft).
 *
 * - Sin contornos oscuros tipo caricatura: todo se renderiza como bloques con textura.
 * - Luz cálida de sol, sombras suaves azuladas, color vivo con contraste ligero y viñeta sutil.
 */
import "@babylonjs/core/Rendering/outlineRenderer";
import { Mesh, Scene, Color3, StandardMaterial } from "@babylonjs/core";
import { crearTexRuidoSueloPixel } from "./ui/texturas_pixel_3d";
import type { DirectionalLight, HemisphericLight } from "@babylonjs/core";

// Los contornos negros rompen la coherencia visual: se desactivan globalmente.
Object.defineProperty(Mesh.prototype, "renderOutline", {
  get() { return false; },
  set(_v: boolean) { /* ignorado a propósito */ },
  configurable: true,
});

export function aplicarEstiloMako(scene: Scene, sol: DirectionalLight, hemi: HemisphericLight): void {
  const ip = scene.imageProcessingConfiguration;
  ip.isEnabled = true;
  ip.contrast = 1.18;
  ip.exposure = 1.05;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.4;
  ip.vignetteStretch = 0.4;
  ip.vignetteColor.set(0.05, 0.08, 0.15, 0);

  sol.diffuse = new Color3(1.0, 0.94, 0.80);   // luz de sol cálida
  hemi.diffuse = new Color3(0.86, 0.93, 1.0);  // cielo frío para sombras suaves
  hemi.groundColor = new Color3(0.60, 0.52, 0.40);
  unificarMateriales(scene);
}

const EXCLUIR = /sky|cielo|cupula|sun|halo|nube|cloud|rain|lluvia|particula|hud|outline|puddle|agua|vidrio|cristal|orbe|farol|luz/i;

/**
 * Da a TODA superficie de color plano el mismo grano pixelado (ruido neutro 32 px),
 * conservando diffuseColor para que los cambios dinámicos de color sigan funcionando.
 */
export function unificarMateriales(scene: Scene): void {
  const grano = crearTexRuidoSueloPixel(scene);
  const vistos = new WeakSet<object>();
  let frame = 0;
  scene.onBeforeRenderObservable.add(() => {
    frame++;
    if (frame % 90 !== 1) return;
    for (const m of scene.materials) {
      if (vistos.has(m)) continue;
      vistos.add(m);
      if (!(m instanceof StandardMaterial)) continue;
      if (m.diffuseTexture || m.emissiveTexture || m.disableLighting) continue;
      if (m.alpha < 1 || EXCLUIR.test(m.name)) continue;
      m.diffuseTexture = grano;
    }
  });
}
