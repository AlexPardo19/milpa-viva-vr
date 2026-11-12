/**
 * Atlas y Generador de Iconos Pixelados 16x16 (v4.0)
 *
 * Genera sprites procedimentales estilo Minecraft sin dependencias de imágenes externas.
 */

const PALETA: Record<string, string> = {
  K: "#1e293b", // Contorno oscuro
  Y: "#fbbf24", // Amarillo maíz
  y: "#fef08a", // Amarillo claro / brillo
  O: "#d97706", // Naranja / dorado
  G: "#16a34a", // Verde follaje
  g: "#14532d", // Verde sombra
  B: "#0284c7", // Azul agua
  b: "#38bdf8", // Azul claro
  W: "#ffffff", // Blanco
  R: "#dc2626", // Rojo
  M: "#78350f", // Madera / marrón
  m: "#b45309", // Madera clara
  P: "#fed7aa", // Piel campesina
  S: "#64748b", // Metal / piedra
  s: "#cbd5e1", // Metal brillo
  V: "#7c3aed", // Frijol negro/morado
};

export const ICONOS_PIXEL: Record<string, string[]> = {
  mazorca: [
    "....KKKK....",
    "...KYYOKK...",
    "..KYYyYOKK..",
    "..KYyYYOOK..",
    "..KYYyYYOK..",
    "..KYOYYyOK..",
    "..KYYyYYOK..",
    "..KGYYYOGK..",
    "..KgGGGGgK..",
    "...KgGGgK...",
    "....KGGK....",
    ".....KK....."
  ],
  grano: [
    "....KKKK....",
    "...KYYyOK...",
    "..KYYyYYOK..",
    "..KYyYYYYK..",
    "..KYOYYyOK..",
    "..KYYyYYOK..",
    "...KYYYOK...",
    "....KOOK....",
    ".....KK.....",
    "............",
    "............",
    "............"
  ],
  azada: [
    "......KKSSsK",
    ".....KSSSSsK",
    "....KSSKKKKK",
    "...KMK......",
    "..KMK.......",
    ".KMK........",
    "KMK.........",
    "KK..........",
    "............",
    "............",
    "............",
    "............"
  ],
  regadera: [
    "....KKKKK...",
    "...KBBBBBK..",
    ".KKBbBBBBBK.",
    "KBbBBBBBBBK.",
    ".KKBbBBBBBK.",
    "...KBBBBBK..",
    "....KBbBK...",
    "....KBbBK...",
    "...KbBBbK...",
    "....KKKK....",
    "............",
    "............"
  ],
  abono: [
    "....KKKK....",
    "...KGgGGK...",
    "..KGggGGGK..",
    "..KGgMMGGK..",
    "..KGMmMGGK..",
    "..KGMMMMgK..",
    "..KGgggggK..",
    "...KGGGGK...",
    "....KKKK....",
    "............",
    "............",
    "............"
  ],
  sol: [
    "....K..K....",
    ".K...KK...K.",
    "..K.KYYK.K..",
    "...KYYYYK...",
    "KK.KYYYYK.KK",
    "KK.KYYYYK.KK",
    "...KYYYYK...",
    "..K.KYYK.K..",
    ".K...KK...K.",
    "....K..K....",
    "............",
    "............"
  ],
  mano: [
    "....KKKK....",
    "...KPyyPK...",
    "..KPPPPPPK..",
    "..KPPPPPPK..",
    "..KPPKKPPK..",
    "..KGgGGggK..",
    "..KGgGGggK..",
    "..KGGggGGK..",
    "...KGGGGK...",
    "....KKKK....",
    "............",
    "............"
  ],
  frijol: [
    "....KKKK....",
    "...KVVvVK...",
    "..KVVvvVVK..",
    "..KVvvVVVK..",
    "..KVVvvVVK..",
    "...KVVVVK...",
    "....KKKK....",
    "............",
    "............",
    "............",
    "............",
    "............"
  ],
  calabaza: [
    "....KGGK....",
    "...KOOOOK...",
    "..KOOyOOOK..",
    ".KOOyOOyOOK.",
    ".KOOOOOOOOK.",
    "..KOOOOOOK..",
    "...KOOOOK...",
    "....KKKK....",
    "............",
    "............",
    "............",
    "............"
  ]
};

export function dibujarIcono(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  x: number,
  y: number,
  escala = 2
): void {
  const m = ICONOS_PIXEL[nombre] || ICONOS_PIXEL["mazorca"];
  if (!m) return;

  for (let j = 0; j < m.length; j++) {
    const fila = m[j];
    for (let i = 0; i < fila.length; i++) {
      const c = fila[i];
      if (c === ".") continue;
      ctx.fillStyle = PALETA[c] || "#ff00ff";
      ctx.fillRect(x + i * escala, y + j * escala, escala, escala);
    }
  }
}

const cacheDataUrls: Record<string, string> = {};

export function generarDataUrlIcono(nombre: string, escala = 2): string {
  const key = `${nombre}_${escala}`;
  if (cacheDataUrls[key]) return cacheDataUrls[key];

  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 16 * escala;
  canvas.height = 16 * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = false;
  dibujarIcono(ctx, nombre, 2 * escala, 2 * escala, escala);

  const url = canvas.toDataURL("image/png");
  cacheDataUrls[key] = url;
  return url;
}
