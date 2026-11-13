/**
 * Estado y Lógica Educativa Infantil para el Ciclo de Cultivo del Maíz
 *
 * Diseñado con pedagogía lúdica paso a paso:
 *  1. Arar la tierra con la azada
 *  2. Sembrar las semillas doradas
 *  3. Regar con la regadera (control de humedad)
 *  4. Abonar con nutrientes orgánicos
 *  5. Crecer con el sol y el tiempo (ontogenia interactiva)
 *  6. Cosechar la mazorca madura
 */

import { REGLAS_JUEGO, TipoSemilla } from "../nucleo";

export type HerramientaTipo =
  | "mano"
  | "azada"
  | "semilla"
  | "semilla_chalqueno"
  | "semilla_azul"
  | "semilla_rojo"
  | "semilla_palomero"
  | "regadera"
  | "abono"
  | "sol"
  | "cosecha"
  | "frijol"
  | "calabaza";

export function esHerramientaSemillaMaiz(h: HerramientaTipo): boolean {
  return (
    h === "semilla" ||
    h === "semilla_chalqueno" ||
    h === "semilla_azul" ||
    h === "semilla_rojo" ||
    h === "semilla_palomero"
  );
}

export function variedadDeHerramienta(h: HerramientaTipo): TipoSemilla | null {
  switch (h) {
    case "semilla_chalqueno":
      return "chalqueno";
    case "semilla_azul":
      return "azul";
    case "semilla_rojo":
      return "rojo";
    case "semilla_palomero":
      return "palomero";
    default:
      return null;
  }
}

export type FaseEducativa =
  | "arar"       // Paso 1: Preparar la tierra
  | "sembrar"    // Paso 2: Poner la semilla
  | "regar"      // Paso 3: Hidratar el suelo
  | "abonar"     // Paso 4: Nutrir con abono
  | "crecer"     // Paso 5: Avanzar el tiempo y ver crecer
  | "cosechar"   // Paso 6: Cosechar el elote
  | "celebrar";  // Fin: Gran cosecha y medalla

export interface MensajePaso {
  titulo: string;
  subtitulo: string;
  icono: string;
  consejo: string;
}

export const MENSAJES_FASES: Record<FaseEducativa, MensajePaso> = {
  arar: {
    titulo: "¡Paso 1: Arar la Tierra!",
    subtitulo: "Usa la azada para aflojar la tierra y que las raíces puedan respirar.",
    icono: "⛏️",
    consejo: "Haz clic o toca el montículo de tierra con la azada para hacer surcos suaves."
  },
  sembrar: {
    titulo: "¡Paso 2: Sembrar las Semillas!",
    subtitulo: "Coloca las semillas de maíz doradas en la tierra suave.",
    icono: "🌰",
    consejo: "Toca el centro del montículo con las semillas para plantarlas con cuidado."
  },
  regar: {
    titulo: "¡Paso 3: Regar con Amor!",
    subtitulo: "Dale de beber a la semilla con la regadera de jardín.",
    icono: "💧",
    consejo: "Mantén el agua entre el 50% y 75%. ¡Ni muy seca ni encharcada!"
  },
  abonar: {
    titulo: "¡Paso 4: Abonar con Nutrientes!",
    subtitulo: "Ponle abono rico en minerales para que crezca verde y fuerte.",
    icono: "🌿",
    consejo: "El abono le da súper fuerza a las hojas y hace mazorcas grandes y dulces."
  },
  crecer: {
    titulo: "¡Paso 5: La Magia del Sol y el Tiempo!",
    subtitulo: "Observa cómo la plantita crece, saca hojas, espiga y elotes.",
    icono: "☀️",
    consejo: "Usa el botón de Sol para avanzar los días. ¡Vigila que no le falte agua!"
  },
  cosechar: {
    titulo: "¡Paso 6: La Gran Cosecha!",
    subtitulo: "¡Tu elote está grande, tierno y con granos dorados!",
    icono: "🌽",
    consejo: "¡Toca la mazorca para cosecharla y ganar tu Trofeo de Agricultor Estrella!"
  },
  celebrar: {
    titulo: "¡Felicidades, Agricultor Estrella!",
    subtitulo: "Completaste el ciclo de la vida del maíz con éxito.",
    icono: "🏆",
    consejo: "¡Puedes volver a sembrar para descubrir más secretos del huerto!"
  }
};

export class EstadoEducativo {
  fase: FaseEducativa = "arar";
  herramientaSeleccionada: HerramientaTipo = "azada";

  // Variables de estado del suelo y cultivo
  tierraArada: number = 0;       // 0% a 100%
  semillaSembrada: boolean = false;
  humedadSuelo: number = 18;     // 0% a 100% (rango óptimo: 45% - 75%)
  nutrientesSuelo: number = 20;  // 0% a 100% (rango óptimo: > 60%)
  
  // Progreso fenológico
  diaActual: number = 0;         // 0 a 163 (Cosecha R3)
  eloteCosechado: boolean = false;
  reproduciendoCrecimiento: boolean = false;

  // Logros infantiles desbloqueados
  medallas: {
    tierraSuave: boolean;
    semillaPlantada: boolean;
    primerBrote: boolean;
    plantaAlta: boolean;
    espigaDorada: boolean;
    cosechaExitosa: boolean;
  } = {
    tierraSuave: false,
    semillaPlantada: false,
    primerBrote: false,
    plantaAlta: false,
    espigaDorada: false,
    cosechaExitosa: false
  };

  // Oyentes de cambio de estado
  private listeners: (() => void)[] = [];

  public suscribir(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notificar(): void {
    this.listeners.forEach((cb) => cb());
  }

  /**
   * Acción de arar la tierra con la azada
   */
  public accionarAzada(): { exito: boolean; progreso: number; mensaje: string } {
    if (this.semillaSembrada) {
      return { exito: false, progreso: this.tierraArada, mensaje: "¡Cuidado! Ya sembraste, no caves sobre la semillita." };
    }

    this.tierraArada = Math.min(100, this.tierraArada + 34);
    if (this.tierraArada >= 100) {
      this.tierraArada = 100;
      this.medallas.tierraSuave = true;
      if (this.fase === "arar") {
        this.fase = "sembrar";
        this.herramientaSeleccionada = "semilla";
      }
      this.notificar();
      return { exito: true, progreso: 100, mensaje: "¡Tierra perfecta! Esponjosa, suave y lista para sembrar." };
    }

    this.notificar();
    return { exito: true, progreso: this.tierraArada, mensaje: "¡Excelente! La tierra se está aflojando." };
  }

  /**
   * Acción de sembrar las semillas
   */
  public accionarSemilla(): { exito: boolean; mensaje: string } {
    if (this.tierraArada < 70) {
      return { exito: false, mensaje: "¡La tierra aún está muy dura! Primero usa la azada para ararla." };
    }
    if (this.semillaSembrada) {
      return { exito: false, mensaje: "¡Ya hay semillas en la tierra! Ahora necesitan agua." };
    }

    this.semillaSembrada = true;
    this.diaActual = 4; // Fase imbibición de semilla
    this.medallas.semillaPlantada = true;

    if (this.fase === "sembrar") {
      this.fase = "regar";
      this.herramientaSeleccionada = "regadera";
    }

    this.notificar();
    return { exito: true, mensaje: "¡Semillita plantada en su cunita de tierra! Dale de beber con la regadera." };
  }

  /**
   * Acción de regar con la regadera
   */
  public accionarRegadera(): { exito: boolean; humedad: number; mensaje: string } {
    this.humedadSuelo = Math.min(100, this.humedadSuelo + 22);

    if (this.fase === "regar" && this.humedadSuelo >= 45) {
      if (this.nutrientesSuelo < 50) {
        this.fase = "abonar";
        this.herramientaSeleccionada = "abono";
      } else {
        this.fase = "crecer";
        this.herramientaSeleccionada = "sol";
      }
    }

    let msg = "¡Qué rica agua fresca! La tierra está contenta.";
    if (this.humedadSuelo > 85) {
      msg = "¡Muchísima agua! Se está formando un charquito. Deja que el sol la absorba.";
    }

    this.notificar();
    return { exito: true, humedad: this.humedadSuelo, mensaje: msg };
  }

  /**
   * Acción de abonar con nutrientes
   */
  public accionarAbono(): { exito: boolean; nutrientes: number; mensaje: string } {
    this.nutrientesSuelo = Math.min(100, this.nutrientesSuelo + 30);

    if (this.fase === "abonar" && this.nutrientesSuelo >= 60) {
      this.fase = "crecer";
      this.herramientaSeleccionada = "sol";
    }

    this.notificar();
    return {
      exito: true,
      nutrientes: this.nutrientesSuelo,
      mensaje: "¡Abono colocado! Las raíces tendrán comida de sobra para crecer fuertes."
    };
  }

  /**
   * Avanza el tiempo / día con el sol
   */
  public avanzarTiempo(diasAdicionales: number = 15): { dia: number; etapa: string; mensaje: string } {
    if (!this.semillaSembrada) {
      return { dia: 0, etapa: "Tierra vacía", mensaje: "¡Primero siembra la semilla antes de que pase el tiempo!" };
    }

    // El agua se evapora lentamente con el sol (enseña el ciclo del agua)
    this.humedadSuelo = Math.max(15, this.humedadSuelo - diasAdicionales * 0.4);
    // Los nutrientes se consumen al crecer
    this.nutrientesSuelo = Math.max(20, this.nutrientesSuelo - diasAdicionales * 0.25);

    this.diaActual = Math.min(163, this.diaActual + diasAdicionales);

    // Desbloquear medallas según el día
    if (this.diaActual >= 10) this.medallas.primerBrote = true;
    if (this.diaActual >= 69) this.medallas.plantaAlta = true;
    if (this.diaActual >= 122) this.medallas.espigaDorada = true;

    // Si llega al día mínimo de cosecha, ¡etapa de cosecha!
    if (this.diaActual >= REGLAS_JUEGO.DIAS_COSECHA_MIN) {
      this.fase = "cosechar";
      this.herramientaSeleccionada = "cosecha";
    }

    this.notificar();
    return {
      dia: this.diaActual,
      etapa: this.obtenerNombreEtapa(),
      mensaje: this.obtenerConsejoCrecimiento()
    };
  }

  /**
   * Acción de cosechar el elote
   */
  public cosechar(): { exito: boolean; mensaje: string } {
    if (this.diaActual < REGLAS_JUEGO.DIAS_COSECHA_MIN) {
      return { exito: false, mensaje: `¡El elote todavía está creciendo! Espera a que esté doradito y maduro (Día ${REGLAS_JUEGO.DIAS_COSECHA_MIN}).` };
    }

    this.eloteCosechado = true;
    this.medallas.cosechaExitosa = true;
    this.fase = "celebrar";

    this.notificar();
    return {
      exito: true,
      mensaje: "🌽 ¡Yumm! ¡Cosechaste un elote delicioso, dulce y tierno! ¡Eres el mejor agricultor!"
    };
  }

  /**
   * Reinicia la aventura educativa para volver a sembrar
   */
  public reiniciar(): void {
    this.fase = "arar";
    this.herramientaSeleccionada = "azada";
    this.tierraArada = 0;
    this.semillaSembrada = false;
    this.humedadSuelo = 18;
    this.nutrientesSuelo = 20;
    this.diaActual = 0;
    this.eloteCosechado = false;
    this.reproduciendoCrecimiento = false;
    this.notificar();
  }

  public obtenerNombreEtapa(): string {
    if (!this.semillaSembrada) return "Suelo en Preparación";
    if (this.diaActual <= 4) return "Semillita Durmiendo";
    if (this.diaActual <= 15) return "Brotando (Coleóptilo)";
    if (this.diaActual <= 35) return "Plántula Pequeña (V4)";
    if (this.diaActual <= 60) return "Creciendo Tallo (V6)";
    if (this.diaActual <= 85) return "Planta Alta y Raíces Zanco (V8-V10)";
    if (this.diaActual <= 110) return "Naciendo la Espiga (V12)";
    if (this.diaActual <= 125) return "Floración Masculina (VT)";
    if (this.diaActual <= 145) return "Jilote y Cabellos de Elote (R1)";
    if (this.diaActual < 163) return "Llenando Granos de Leche (R2-R3)";
    return "¡Elote Listo para Comer! (R3 Cosecha)";
  }

  public obtenerConsejoCrecimiento(): string {
    if (this.humedadSuelo < 30) {
      return "⚠️ ¡A tu plantita le da sed! Usa la regadera 💧 para que siga creciendo feliz.";
    }
    if (this.nutrientesSuelo < 35) {
      return "💡 ¡Las hojas quieren más fuerza! Añade abono 🌿 para que brillen de verde.";
    }
    if (this.diaActual < 163) {
      return "🌱 ¡Va creciendo muy bonita! Avanza el Sol ☀️ para ver cómo saca sus elotes.";
    }
    return "🌽 ¡La mazorca está gigante y dorada! Toca el elote para cosecharlo.";
  }
}
