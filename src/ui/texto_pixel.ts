/**
 * Utilidades de Renderizado de Texto Pixelado para Babylon.js (v4.0)
 *
 * Elimina el antialiasing de DynamicTexture y binariza los canales alfa
 * para garantizar fuentes nítidas estilo Minecraft.
 */

import { DynamicTexture, Scene, Texture } from "@babylonjs/core";

export async function cargarFuentePixel(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 600));
    const carga = Promise.all([
      document.fonts.load('16px "Pixelify Sans"'),
      document.fonts.load('bold 16px "Pixelify Sans"'),
      document.fonts.load('18px "VT323"'),
    ]).then(() => {});
    await Promise.race([carga, timeout]);
  } catch (err) {
    console.warn("Milpa Viva: No se pudo precargar la fuente pixel, usando respaldo del sistema", err);
  }
}

/**
 * Binariza el canal alfa de un contexto canvas 2D para eliminar el antialiasing suave
 */
export function binarizarAlfa(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  umbral = 110
): void {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= umbral ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Crea una DynamicTexture configurada con filtrado NEAREST y sin mipmaps
 */
export function crearTexturaPixel(
  scene: Scene,
  nombre: string,
  w: number,
  h: number,
  dibujar: (ctx: CanvasRenderingContext2D) => void
): DynamicTexture {
  const tex = new DynamicTexture(
    nombre,
    { width: w, height: h },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE
  );
  tex.hasAlpha = true;

  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  (ctx as any).fontKerning = "none";
  ctx.clearRect(0, 0, w, h);

  dibujar(ctx);
  binarizarAlfa(ctx, w, h);
  tex.update();

  return tex;
}

/**
 * Ajusta y corta el texto para evitar que sobrepase el ancho del canvas
 */
export function dividirTextoEnLineas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxAncho: number
): string[] {
  const palabras = texto.split(" ");
  const lineas: string[] = [];
  let lineaActual = "";

  for (let i = 0; i < palabras.length; i++) {
    const prueba = lineaActual ? lineaActual + " " + palabras[i] : palabras[i];
    if (ctx.measureText(prueba).width > maxAncho && lineaActual) {
      lineas.push(lineaActual);
      lineaActual = palabras[i];
    } else {
      lineaActual = prueba;
    }
  }

  if (lineaActual) {
    lineas.push(lineaActual);
  }

  return lineas;
}
