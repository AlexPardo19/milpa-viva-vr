/**
 * Bus de Eventos Tipado (Desacople de Sistemas v4.0 — Milpa Viva VR)
 *
 * Permite que las mecánicas (arado, deshierbe, plagas, polinización, eventos,
 * cosecha, fogón y banco de semillas) notifiquen a Misiones, Códice y Don Elote
 * sin acoplamiento directo.
 */

export type TipoEventoClimatico = "helada" | "tormenta" | "vendaval" | "sequia";

export type EventoJuego =
  | { t: "arado"; nodo: number; potencia: number }
  | { t: "siembra"; nodo: number; variedad: string; granosAcertados: number }
  | { t: "riego"; nodo: number; caudal: number }
  | { t: "abono"; nodo: number; dosis: number }
  | { t: "deshierbe"; nodo: number; cantidad: number; quelites: number; limpio: boolean }
  | { t: "plaga"; nodo: number; tipo: "cogollero" | "ave"; resuelta: boolean }
  | { t: "polinizacion"; nodo: number; manual: boolean; valor: number }
  | { t: "triada"; nodo: number; cultivo: "frijol" | "calabaza" }
  | { t: "proteccion"; nodo: number; tipo: "petate" | "humo" | "tutor" }
  | { t: "evento"; tipo: string; resultado: "superado" | "fallado" | "aviso" | "inicio" }
  | { t: "cosecha"; nodo: number; variedad: string; calidad: number }
  | { t: "cocinado"; receta: string; calidad: number }
  | { t: "semillaGuardada"; lote: string; raza: string; generacion: number }
  | { t: "codice"; entradaId: string }
  | { t: "mision"; misionId: string }
  | { t: "dia"; dia: number };

export type EscuchaEvento = (e: EventoJuego) => void;

export class BusEventos {
  private escuchas: EscuchaEvento[] = [];

  public suscribir(fn: EscuchaEvento): () => void {
    this.escuchas.push(fn);
    return () => {
      this.escuchas = this.escuchas.filter((x) => x !== fn);
    };
  }

  public emitir(e: EventoJuego): void {
    for (let i = 0; i < this.escuchas.length; i++) {
      this.escuchas[i](e);
    }
  }
}
