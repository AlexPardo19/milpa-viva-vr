import "./estilos/pixel.css";
/**
 * Entrada principal de la aplicación: Maíz Animado Estilizado WebXR — «Milpa Viva VR v4.0»
 *
 * Incluye:
 *  - Fase 0 (H1–H10): Inicialización temprana de WebXRDefaultExperience antes de Locomoción/Manos 6DoF,
 *    regla única de cosecha (REGLAS_JUEGO.DIAS_COSECHA_MIN = 145), LOD de contornos (< 6 m) y Zero-GC.
 *  - Mecánicas v4.0 (M1–M14):
 *      * M1: Gestos físicos 6DoF (golpe de azada por velocidad, riego por ángulo de inclinación, sacudida de polen).
 *      * M2: Cinturón Diegético de Herramientas + Reloj de Muñeca con caché de hash.
 *      * M3: Maleza y Quelites comestibles con Thin Instances (48 instancias).
 *      * M4: Fauna de la Milpa (Gusano cogollero, Tordo, Abeja nativa, Catarina) con pool fijo de 10 agentes.
 *      * M5: Polinización manual y por viento con máscara de cuajado de granos en la mazorca 3D.
 *      * M6: Director de Eventos Meteorológicos (Helada, Tormenta, Vendaval, Sequía) con dificultad adaptativa.
 *      * M7: Asociación Milpa «Las Tres Hermanas» 3D (Maíz + Frijol trepador + Calabaza rastrera).
 *      * M8: Estación de Cocina Tradicional «Del Surco al Comal» (Nixtamalización, Metate y 7 recetas).
 *      * M9: Banco Campesino de Semillas, Selección Masal y Herencia Genética (localStorage).
 *      * M10: Misiones, Calendario Agrícola Ritual y Códice Ilustrado del Maíz.
 *      * M11: Don Elote 2.0 con cola de prioridad, cooldown por tópico y brazo apuntador.
 *      * M12: Audio Espacial 3D WebAudio con PannerNode, buffers pre-alojados y ducking de voz.
 *      * M13: Interacción de UI 3D por Poke táctil.
 *      * M14: Sistema de Confort VR y Accesibilidad (viñeta, modo sentado, subtítulos CC, daltonismo).
 */

import {
  Engine,
  Scene,
  Vector3,
  ArcRotateCamera,
  PointerEventTypes,
  WebXRDefaultExperience,
  WebXRState
} from "@babylonjs/core";
import {
  ClimateState,
  CLIMA_INICIAL,
  Metricas,
  calcularMetricas
} from "./clima";
import {
  EstadoCrecimiento,
  ESTADO_CRECIMIENTO_INICIAL,
  irADia
} from "./crecimiento";
import { AmbienteEstilizado } from "./ambiente_estilizado";
import { MaizEstilizado } from "./maiz_estilizado";
import { PanelesVR } from "./paneles_vr";
import { SurcoMilpa } from "./surco_milpa";
import { CarritoAgricola3D } from "./vr/canasta_cosecha";
import { actualizarCaja, registrarSolidoDesdeNodo } from "./colisiones";
import { MesaClimaPrejuego } from "./vr/mesa_clima_prejuego";
import { LocomocionVR } from "./vr/locomocion_vr";
import { InteraccionManos6DoF } from "./vr/interaccion_manos_6dof";
import { CinturonHerramientas } from "./vr/cinturon_herramientas";
import { RelojMuneca } from "./vr/reloj_muneca";
import { UiPoke } from "./vr/ui_poke";
import { EspantapajarosGuia } from "./educativo/espantapajaros_guia";
import {
  Etapa,
  TipoSemilla,
  VARIEDADES_MAIZ,
  REGLAS_JUEGO,
  nombreEtapa
} from "./nucleo";
import { AudioSintetizador } from "./audio_sintetizador";
import { ControladorJugador } from "./controlador_jugador";
import { ControladorXbox } from "./controlador_xbox";

// Módulos educativos interactivos
import {
  EstadoEducativo,
  HerramientaTipo,
  esHerramientaSemillaMaiz,
  variedadDeHerramienta
} from "./educativo/estado_educativo";
import { ParticulasEducativas } from "./educativo/particulas_educativas";
import { Herramientas3D } from "./educativo/herramientas_3d";
import { UIEducativa } from "./educativo/ui_infantil";
import { PanelClima } from "./educativo/panel_clima";
import { FichaCultivoModal } from "./educativo/ficha_cultivo";

// Módulos de juego v4.0 «Milpa Viva VR»
import { BusEventos } from "./juego/bus_eventos";
import { AjustesSistema } from "./juego/ajustes";
import { MalezaSistema } from "./juego/maleza";
import { FaunaMilpa } from "./juego/fauna_milpa";
import { PolinizacionSistema } from "./juego/polinizacion";
import { DirectorEventos } from "./juego/director_eventos";
import { TriadaViva } from "./juego/triada_viva";
import { FogonCocina } from "./juego/fogon_cocina";
import { BancoSemillas } from "./juego/banco_semillas";
import { DispensadorSemillas } from "./juego/dispensador_semillas";
import { CodiceMaiz } from "./juego/codice";
import { MisionesSistema } from "./juego/misiones";
import { AlmacenMazorcas } from "./juego/almacen_mazorcas";
import { ModalControlesBienvenida } from "./juego/modal_controles";
import {
  DificultadMundo,
  PartidaGuardada,
  PresetClimaMundo,
  climaDesdePreset,
  guardarPartida
} from "./juego/persistencia_mundo";

// Sistema de Inventario y Drops Estilo Minecraft
import { cargarFuentePixel } from "./ui/texto_pixel";
import { Inventario, DEFS, variedadDeItemId } from "./inventario/inventario";
import { CursorInventario } from "./inventario/cursor";
import { SistemaDrops } from "./inventario/drops";
import { HotbarPixel, ModalCofreTroje } from "./ui/panel_inventario";
import { MenuPausaMinecraft, MenuPrincipalMinecraft } from "./ui/menu_minecraft";

// ---------------------------------------------------------------------------
// 1. Estado global de la simulación
// ---------------------------------------------------------------------------
const clima: ClimateState = { ...CLIMA_INICIAL };
let metricas: Metricas = calcularMetricas(clima);
const estadoCrecimiento: EstadoCrecimiento = { ...ESTADO_CRECIMIENTO_INICIAL };
const VELOCIDAD_CICLO_MINECRAFT = 24.0 / 1200.0; // 0.02 h/s -> 20 min reales por día completo
let cicloSolarAuto = true;
let acumuladorUISolar = 0;

// Estado y componentes educativos
const estadoEdu = new EstadoEducativo();
let particulasEdu: ParticulasEducativas | null = null;
let herramientas3D: Herramientas3D | null = null;
let uiEdu: UIEducativa | null = null;
let panelClima: PanelClima | null = null;
let fichaCultivo: FichaCultivoModal | null = null;
let climaAntesEvento: { temperatura: number; lluvia: number; viento: number } | null = null;

// Referencias a los componentes de la escena
let camaraPrincipal: ArcRotateCamera | null = null;
let ambiente: AmbienteEstilizado | null = null;
let maiz: MaizEstilizado | null = null;
let paneles: PanelesVR | null = null;

// Componentes del Simulador VR Inmersivo (v3.0 + v4.0)
let surcoMilpa: SurcoMilpa | null = null;
let carritoAgricola: CarritoAgricola3D | null = null;
let mesaClimaPrejuego: MesaClimaPrejuego | null = null;
let espantapajaros: EspantapajarosGuia | null = null;
let locomocionVR: LocomocionVR | null = null;
let interaccion6DoF: InteraccionManos6DoF | null = null;
let cinturonVR: CinturonHerramientas | null = null;
let relojMuneca: RelojMuneca | null = null;
let uiPoke: UiPoke | null = null;
let audioSintetizador: AudioSintetizador | null = null;
let controladorJugador: ControladorJugador | null = null;
let controladorXbox: ControladorXbox | null = null;

// Sistemas v4.0 «Milpa Viva»
const busEventos = new BusEventos();
let ajustesSistema: AjustesSistema | null = null;
let malezaSistema: MalezaSistema | null = null;
let faunaMilpa: FaunaMilpa | null = null;
let polinizacionSistema: PolinizacionSistema | null = null;
let directorEventos: DirectorEventos | null = null;
let triadaViva: TriadaViva | null = null;
let fogonCocina: FogonCocina | null = null;
let bancoSemillas: BancoSemillas | null = null;
let dispensadorSemillas: DispensadorSemillas | null = null;
let codiceMaiz: CodiceMaiz | null = null;
let misionesSistema: MisionesSistema | null = null;
let almacenMazorcas: AlmacenMazorcas | null = null;
let modalControles: ModalControlesBienvenida | null = null;
let menuPrincipal: MenuPrincipalMinecraft | null = null;
let menuPausa: MenuPausaMinecraft | null = null;

// Estado de la partida actual (para Guardar / Cargar estilo Minecraft)
let idMundoActivo = "milpa-mundo-1";
let nombreMundoActivo = "Mi Milpa Criolla";
let dificultadMundo: DificultadMundo = "normal";
let presetClimaMundo: PresetClimaMundo = "templado";
let semillaMundoStr = "CHALCO-2026";

// Referencias a los componentes de inventario y drops
let inventarioJugador: Inventario | null = null;
let inventarioTroje: Inventario | null = null;
let cursorInventario: CursorInventario | null = null;
let hotbarPixel: HotbarPixel | null = null;
let modalCofreTroje: ModalCofreTroje | null = null;
let sistemaDrops: SistemaDrops | null = null;

// Transición suave de cámara para inspección anatómica
interface ObjetivoCamara {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}
let objetivoCamara: ObjetivoCamara | null = null;

function enfocarCamara(alpha: number, beta: number, radius: number, target: Vector3): void {
  objetivoCamara = { alpha, beta, radius, target: target.clone() };
}

function enfocarPorTipo(tipo: "planta" | "consola" | "elote" | "espiga" | "raices"): void {
  switch (tipo) {
    case "planta":
      enfocarCamara(-Math.PI / 2.0, Math.PI / 2.28, 12.0, new Vector3(0, 3.0, -0.3));
      break;
    case "consola":
      enfocarCamara(-Math.PI / 2.0, Math.PI / 2.35, 4.4, new Vector3(0, 1.25, -2.2));
      break;
    case "elote":
      enfocarCamara(-1.15, 1.40, 4.2, new Vector3(0.15, 3.2, 0));
      break;
    case "espiga":
      enfocarCamara(-Math.PI / 2.0, 1.35, 4.5, new Vector3(0, 6.4, 0));
      break;
    case "raices":
      enfocarCamara(-1.35, 1.30, 3.5, new Vector3(0, 0.45, 0));
      break;
  }
}

// ---------------------------------------------------------------------------
// 2. Inicialización del motor y la escena Babylon.js
// ---------------------------------------------------------------------------
const canvas = document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  antialias: true,
  powerPreference: "high-performance",
  adaptToDeviceRatio: true
});
engine.setHardwareScalingLevel(1.0 / Math.min(window.devicePixelRatio || 1, 2.0));

async function crearEscena(): Promise<Scene> {
  await cargarFuentePixel();
  const scene = new Scene(engine);

  // A. Cámara orbital inicial enfocada panorámicamente en la granja (milpa + molino + animales) para el Menú Principal
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI * 0.68,
    1.18,
    22.5,
    new Vector3(3.0, 1.8, 1.5),
    scene
  );
  camaraPrincipal = camera;
  camera.lowerRadiusLimit = 2.0;
  camera.upperRadiusLimit = 36.0;
  camera.upperBetaLimit = Math.PI / 2.05;
  camera.maxZ = 1200.0;
  camera.wheelPrecision = 28;
  camera.attachControl(canvas, true);
  camera.useAutoRotationBehavior = false;

  canvas.addEventListener("pointerdown", () => {
    objetivoCamara = null;
  });
  canvas.addEventListener("wheel", () => {
    objetivoCamara = null;
  });

  // B. Ambiente estilizado (cielo, nubes, sol, podio con hierba, volcanes y cobertizo)
  ambiente = new AmbienteEstilizado(scene);

  // C. Maíz estilizado procedural (referencia)
  maiz = new MaizEstilizado(scene, ambiente.shadowGen);
  maiz.root.setEnabled(false);
  ambiente.moundMesh.setEnabled(false);
  ambiente.puddleMesh.setEnabled(false);

  // D. Ajustes de Accesibilidad y Confort VR (M14) + Audio Espacial 3D (M12)
  ajustesSistema = new AjustesSistema();
  audioSintetizador = new AudioSintetizador();
  audioSintetizador.onSubtituloSonido = (etiqueta) => {
    ajustesSistema?.mostrarSubtitulo(`🔊 ${etiqueta}`, 2.6);
  };
  particulasEdu = new ParticulasEducativas(scene);
  herramientas3D = new Herramientas3D(scene, particulasEdu);

  // D.1. Surco Milpa Lineal (6 Estaciones con 5 Razas Nativas y Dinámica v4.0)
  surcoMilpa = new SurcoMilpa(scene, ambiente.shadowGen, particulasEdu);

  // D.2. Carretilla Agrícola Portátil con Canasta de Cosecha Multi-Ingrediente
  carritoAgricola = new CarritoAgricola3D(scene, ambiente.shadowGen);

  // D.3. Espantapájaros Guía 3D ("Don Elote 2.0") con cola de prioridad y brazo apuntador (M11)
  espantapajaros = new EspantapajarosGuia(
    scene,
    ambiente.shadowGen,
    audioSintetizador,
    ajustesSistema
  );

  // D.4. Mesa de Control Climatológico 3D (Lobby Pre-Juego en Cobertizo)
  mesaClimaPrejuego = new MesaClimaPrejuego(
    scene,
    clima,
    {
      onIniciarCampo: (climaCfg) => {
        Object.assign(clima, climaCfg);
        metricas = calcularMetricas(clima);
        ambiente?.aplicarClima(clima, metricas);
        panelClima?.actualizarValoresUI();
        locomocionVR?.teletransportarANodo(0);
        controladorJugador?.activarModo("fps");
        espantapajaros?.decir(
          "¡Bienvenido al surco! 🌽 Ara con la azada [2], siembra maíz [3] junto con frijol [8]/[B] y calabaza [9]/[N]."
        );
        uiEdu?.mostrarToast("🌱 ¡Llegaste al surco de milpa! Usa la azada [2] para arar.");
      },
      onCambioClimaPreview: (climaCfg) => {
        Object.assign(clima, climaCfg);
        metricas = calcularMetricas(clima);
        ambiente?.aplicarClima(clima, metricas);
        panelClima?.actualizarValoresUI();
      }
    },
    ambiente.shadowGen
  );

  // ---------------------------------------------------------------------------
  // E. FASE 0 (H1 & H2): Inicializar WebXRDefaultExperience ANTES de Locomoción y Manos 6DoF
  // ---------------------------------------------------------------------------
  (window as any).scene = scene;
  (window as any).camera = camera;
  let xrExperience: WebXRDefaultExperience | null = null;
  try {
    xrExperience = await scene.createDefaultXRExperienceAsync({
      floorMeshes: [ambiente.grassMesh, ...surcoMilpa.nodos.map((n) => n.marcadorTeleport)]
    });
    scene.activeCamera = camera;
    xrExperience.baseExperience.onStateChangedObservable.add((state) => {
      const estaEnXR = state === WebXRState.IN_XR;
      ambiente?.estiloPatrix.ajustarPostProcesoXR(estaEnXR);
      if (estaEnXR) {
        scene.skipPointerDownPicking = false;
        modalControles?.notificarEstadoXR(true);
      } else if (controladorJugador?.modo === "fps") {
        scene.skipPointerDownPicking = true;
      }
    });
    console.log("WebXR inicializado e inyectado en sistemas 6DoF.", xrExperience);
  } catch (err) {
    console.warn("WebXR no disponible en este dispositivo (modo escritorio estándar activo):", err);
  }

  // E.1. Locomoción VR e Interacción 6DoF con referencia real a xrExperience
  locomocionVR = new LocomocionVR(
    scene,
    surcoMilpa,
    carritoAgricola,
    camera,
    xrExperience,
    ajustesSistema
  );
  locomocionVR.onTeletransportar = (pos, mirarA) => {
    controladorJugador?.teletransportarA(pos, mirarA);
  };
  interaccion6DoF = new InteraccionManos6DoF(
    scene,
    surcoMilpa,
    carritoAgricola.canasta,
    herramientas3D,
    particulasEdu,
    xrExperience,
    ajustesSistema
  );
  interaccion6DoF.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  interaccion6DoF.onEjecutarAccionUnificada = (herramienta, nodoId) => {
    if (surcoMilpa) surcoMilpa.nodoSeleccionadoId = nodoId;
    ejecutarAccion(herramienta);
  };

  // E.2. Cinturón Diegético de Herramientas (M2), Reloj de Muñeca (M2) y UI Poke (M13)
  cinturonVR = new CinturonHerramientas(scene);
  cinturonVR.onEquipar = (herramienta) => {
    estadoEdu.herramientaSeleccionada = herramienta;
    if (interaccion6DoF) interaccion6DoF.herramientaActiva = herramienta;
    controladorJugador?.equipar(herramienta);
    uiEdu?.actualizarUI();
  };
  relojMuneca = new RelojMuneca(scene);
  uiPoke = new UiPoke(scene, audioSintetizador);

  // ---------------------------------------------------------------------------
  // F. Sistemas Reactivos v4.0 «Milpa Viva» (M3–M10)
  // ---------------------------------------------------------------------------
  malezaSistema = new MalezaSistema(
    scene,
    surcoMilpa,
    carritoAgricola.canasta,
    audioSintetizador,
    busEventos
  );
  malezaSistema.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  faunaMilpa = new FaunaMilpa(scene, surcoMilpa, audioSintetizador, busEventos);
  faunaMilpa.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  polinizacionSistema = new PolinizacionSistema(
    surcoMilpa,
    particulasEdu,
    audioSintetizador,
    busEventos
  );
  polinizacionSistema.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  // Conectar gestos 6DoF de sacudida de polen y jalón de maleza
  interaccion6DoF.onSacudidaPolen = (nodoId) => {
    polinizacionSistema?.polinizarManual(nodoId);
  };
  interaccion6DoF.onJalonMaleza = (nodoId, velY) => {
    malezaSistema?.deshierbarNodo(nodoId, velY);
  };

  directorEventos = new DirectorEventos(surcoMilpa, audioSintetizador, busEventos);
  directorEventos.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  directorEventos.onCambioEstadoUI = (fase, evento, seg, inst) => {
    const activo = fase === "AVISO" || fase === "ACTIVO";
    uiEdu?.actualizarBannerClimatico(activo, `${inst} (${seg}s)`);
    if (fase === "AVISO" && evento) {
      espantapajaros?.encolarPista({
        prioridad: 0,
        topico: `evento_${evento}`,
        titulo: "🚨 ¡Alerta de Don Elote!",
        texto: inst
      });
    }
  };
  directorEventos.onForzarClima = (tempOffset, lluviaNivel, vientoObjetivo, restaurar) => {
    if (restaurar) {
      if (climaAntesEvento) {
        clima.temperatura = climaAntesEvento.temperatura;
        clima.lluvia = climaAntesEvento.lluvia;
        clima.viento = climaAntesEvento.viento;
        climaAntesEvento = null;
      }
    } else {
      if (!climaAntesEvento) {
        climaAntesEvento = {
          temperatura: clima.temperatura,
          lluvia: clima.lluvia,
          viento: clima.viento
        };
      }
      clima.temperatura = Math.max(-6, climaAntesEvento.temperatura + tempOffset);
      clima.lluvia = lluviaNivel === 2 ? 32 : lluviaNivel === 1 ? 12 : 0;
      if (vientoObjetivo !== undefined) {
        clima.viento = vientoObjetivo;
      }
    }
    metricas = calcularMetricas(clima);
    ambiente?.aplicarClima(clima, metricas);
    panelClima?.actualizarValoresUI();
  };

  triadaViva = new TriadaViva(
    scene,
    surcoMilpa,
    carritoAgricola.canasta,
    audioSintetizador,
    busEventos
  );
  triadaViva.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  fogonCocina = new FogonCocina(
    scene,
    carritoAgricola.canasta,
    audioSintetizador,
    busEventos
  );
  fogonCocina.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  almacenMazorcas = new AlmacenMazorcas(
    scene,
    carritoAgricola.canasta,
    audioSintetizador,
    busEventos
  );
  almacenMazorcas.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  almacenMazorcas.onAbrirCofre = () => {
    controladorJugador?.liberarPuntero();
    modalCofreTroje?.alternar();
  };

  // Inicializar Sistema de Inventario y Hotbar Estilo Minecraft (fuente única de verdad)
  inventarioJugador = new Inventario(36);
  inventarioTroje = new Inventario(27);

  function tipoPorNombreVariedad(nombre?: string): TipoSemilla {
    const l = (nombre || "").toLowerCase();
    if (l.includes("azul")) return "azul";
    if (l.includes("rojo")) return "rojo";
    if (l.includes("palomero")) return "palomero";
    return "chalqueno";
  }

  function contarMazorcasTotales(variedad?: TipoSemilla): number {
    if (!inventarioJugador || !inventarioTroje) return 0;
    if (!variedad) {
      return inventarioJugador.cuenta("mazorca") + inventarioTroje.cuenta("mazorca");
    }
    const nombreVar = VARIEDADES_MAIZ[variedad].nombre;
    return (
      inventarioJugador.cuentaPorVariedad("mazorca", nombreVar) +
      inventarioTroje.cuentaPorVariedad("mazorca", nombreVar)
    );
  }

  function consumirMazorcaReal(variedadPreferida?: TipoSemilla): {
    exito: boolean;
    variedad?: TipoSemilla;
    calidad: number;
    madurez?: "elote" | "grano_seco";
  } {
    const prefNombre = variedadPreferida ? VARIEDADES_MAIZ[variedadPreferida].nombre : undefined;
    // Priorizar mochila/mano del jugador, luego Troje
    const resJug = inventarioJugador?.consumirMazorca(prefNombre);
    const res = resJug?.exito ? resJug : inventarioTroje?.consumirMazorca(prefNombre);
    if (!res || !res.exito) {
      return { exito: false, calidad: 0.85 };
    }
    const tipoVar = tipoPorNombreVariedad(res.variedad);
    carritoAgricola?.canasta?.retirarMazorca(tipoVar, 1);
    almacenMazorcas?.onCambioInventario?.();
    return {
      exito: true,
      variedad: tipoVar,
      calidad: res.calidad,
      madurez: res.madurez
    };
  }

  function actualizarContadoresHUDMazorcas(): void {
    if (!uiEdu || !inventarioJugador || !inventarioTroje) return;
    uiEdu.actualizarInventarioMazorcas(
      inventarioJugador.cuenta("mazorca"),
      inventarioTroje.cuenta("mazorca")
    );
  }

  almacenMazorcas.onCambioInventario = actualizarContadoresHUDMazorcas;

  fogonCocina.onConsumirMazorcaAlmacen = (variedadPreferida) => {
    return consumirMazorcaReal(
      variedadPreferida ? tipoPorNombreVariedad(variedadPreferida) : undefined
    );
  };
  fogonCocina.onContarDespensa = () => ({
    mazorcas: contarMazorcasTotales(),
    frijol: carritoAgricola?.canasta.frijol ?? 0,
    calabaza: carritoAgricola?.canasta.calabaza ?? 0,
    quelites:
      (carritoAgricola?.canasta.quelites ?? 0) +
      (inventarioJugador?.cuenta("quelite") ?? 0) +
      (inventarioTroje?.cuenta("quelite") ?? 0),
    huitlacoche:
      (carritoAgricola?.canasta.huitlacoche ?? 0) +
      (inventarioJugador?.cuenta("huitlacoche") ?? 0) +
      (inventarioTroje?.cuenta("huitlacoche") ?? 0)
  });
  fogonCocina.onConsumirIngrediente = (tipo) => {
    if (carritoAgricola?.canasta?.consumirIngrediente(tipo, 1)) {
      return true;
    }
    if (tipo === "quelite" || tipo === "huitlacoche") {
      if ((inventarioJugador?.cuenta(tipo) ?? 0) > 0) {
        inventarioJugador?.consumirPorId(tipo, 1);
        return true;
      }
      if ((inventarioTroje?.cuenta(tipo) ?? 0) > 0) {
        inventarioTroje?.consumirPorId(tipo, 1);
        return true;
      }
    }
    return false;
  };

  function restablecerInventarioInicial(): void {
    if (!inventarioJugador) return;
    for (let i = 0; i < inventarioJugador.tamano; i++) {
      inventarioJugador.slots[i] = null;
    }
    // Hotbar (0-8): Manos, Azada, 4 Razas de Semillas separadas, Agua, Abono, Cosecha
    inventarioJugador.slots[0] = { id: "mano", cantidad: 1 };
    inventarioJugador.slots[1] = { id: "azada", cantidad: 1 };
    inventarioJugador.slots[2] = { id: "semilla_chalqueno", cantidad: 12 };
    inventarioJugador.slots[3] = { id: "semilla_azul", cantidad: 12 };
    inventarioJugador.slots[4] = { id: "semilla_rojo", cantidad: 12 };
    inventarioJugador.slots[5] = { id: "semilla_palomero", cantidad: 12 };
    inventarioJugador.slots[6] = { id: "regadera", cantidad: 1 };
    inventarioJugador.slots[7] = { id: "abono", cantidad: 32 };
    inventarioJugador.slots[8] = { id: "cosecha", cantidad: 1 };
    // Mochila (9-11): Cultivos asociados (Frijol/Calabaza) y Amuleto Sol +15d
    inventarioJugador.slots[9] = { id: "frijol", cantidad: 12 };
    inventarioJugador.slots[10] = { id: "calabaza", cantidad: 12 };
    inventarioJugador.slots[11] = { id: "sol", cantidad: 1 };
    inventarioJugador.notificar();
  }
  restablecerInventarioInicial();

  dispensadorSemillas = new DispensadorSemillas(
    scene,
    inventarioJugador,
    audioSintetizador,
    ambiente.shadowGen
  );
  dispensadorSemillas.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  dispensadorSemillas.onActualizarUI = () => hotbarPixel?.actualizarVisual();

  // Mantener sincronizado el inventario de la Troje y del Jugador con los visuales 3D y el HUD
  inventarioJugador.suscribir(() => {
    actualizarContadoresHUDMazorcas();
  });
  inventarioTroje.suscribir(() => {
    if (!almacenMazorcas || !inventarioTroje) return;
    almacenMazorcas.almacenadoPorVariedad.chalqueno = inventarioTroje.cuentaPorVariedad(
      "mazorca",
      VARIEDADES_MAIZ.chalqueno.nombre
    );
    almacenMazorcas.almacenadoPorVariedad.azul = inventarioTroje.cuentaPorVariedad(
      "mazorca",
      VARIEDADES_MAIZ.azul.nombre
    );
    almacenMazorcas.almacenadoPorVariedad.rojo = inventarioTroje.cuentaPorVariedad(
      "mazorca",
      VARIEDADES_MAIZ.rojo.nombre
    );
    almacenMazorcas.almacenadoPorVariedad.palomero = inventarioTroje.cuentaPorVariedad(
      "mazorca",
      VARIEDADES_MAIZ.palomero.nombre
    );
    almacenMazorcas.actualizarVisualesTroje();
    almacenMazorcas.guardarAlmacen();
    actualizarContadoresHUDMazorcas();
  });

  cursorInventario = new CursorInventario();
  hotbarPixel = new HotbarPixel(inventarioJugador, cursorInventario, {
    onCambioSlot: (_slot, h) => {
      const def = DEFS[h] || { nombre: h };
      seleccionarHerramientaHotbar(h, def.nombre);
    },
    onQuitarPlanta: () => {
      ejecutarQuitarPlanta();
    },
    onToggleTimeLapse: () => {
      const algunSembrado = surcoMilpa?.nodos.some((n) => n.sembrada) ?? false;
      if (!algunSembrado && !estadoEdu.semillaSembrada) {
        uiEdu?.mostrarToast("¡Primero siembra una semilla para iniciar el crecimiento!");
        return;
      }
      estadoEdu.reproduciendoCrecimiento = !estadoEdu.reproduciendoCrecimiento;
      hotbarPixel?.actualizarEstadoCrecimiento(estadoEdu.reproduciendoCrecimiento);
      uiEdu?.actualizarUI();
    },
    onDeshierbar: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      malezaSistema?.deshierbarNodo(id, 0.6);
      faunaMilpa?.limpiarPlagasEnNodo(id);
    },
    onPolinizar: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      polinizacionSistema?.polinizarManual(id);
    },
    onSembrarFrijol: () => {
      ejecutarAccion("frijol");
    },
    onSembrarCalabaza: () => {
      ejecutarAccion("calabaza");
    },
    onColocarTutor: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarTutor(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    },
    onColocarPetate: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarProteccion(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    },
    onSol: () => {
      avanzarDiasConAutopausa(15);
    },
    onAvanzarDias: (dias) => {
      avanzarDiasConAutopausa(dias);
    },
    onAbrirMochila: () => {
      controladorJugador?.liberarPuntero();
      modalCofreTroje?.alternar();
    },
    onAbrirDispensador: () => {
      controladorJugador?.liberarPuntero();
      dispensadorSemillas?.abrir();
    }
  });

  modalCofreTroje = new ModalCofreTroje(inventarioTroje, inventarioJugador, cursorInventario);

  const obtenerPosJugadorActiva = (): Vector3 => {
    if (
      xrExperience &&
      xrExperience.baseExperience &&
      xrExperience.baseExperience.state === WebXRState.IN_XR
    ) {
      return xrExperience.baseExperience.camera.position;
    }
    return controladorJugador ? controladorJugador.posicionMundo : Vector3.Zero();
  };

  sistemaDrops = new SistemaDrops(
    scene,
    inventarioJugador,
    obtenerPosJugadorActiva,
    (stack) => {
      audioSintetizador?.campanita(obtenerPosJugadorActiva());
      if (stack.id === "huitlacoche") {
        carritoAgricola?.canasta?.depositarIngrediente("huitlacoche", stack.cantidad);
        uiEdu?.mostrarToast(`🍄 +${stack.cantidad} Huitlacoche gourmet recogido (cocínalo en el Fogón [F])`);
      } else {
        const nom = stack.meta?.variedad ? `Mazorca de ${stack.meta.variedad}` : DEFS[stack.id]?.nombre || stack.id;
        uiEdu?.mostrarToast(`🌽 +${stack.cantidad} ${nom}`);
        if (stack.id === "mazorca" && carritoAgricola?.canasta) {
          const tipoVar = tipoPorNombreVariedad(stack.meta?.variedad);
          for (let i = 0; i < stack.cantidad; i++) {
            carritoAgricola.canasta.depositarMazorca(
              VARIEDADES_MAIZ[tipoVar],
              undefined,
              stack.meta?.calidad ?? 0.9
            );
          }
        }
      }
      actualizarContadoresHUDMazorcas();
    },
    () => {
      uiEdu?.mostrarToast("⚠️ ¡Inventario lleno! Guarda mazorcas en la Troje [I]");
    }
  );

  interaccion6DoF.onCosecharMazorca = (nodoId, variedad, calidad) => {
    const n = surcoMilpa?.nodos[nodoId];
    if (n && sistemaDrops) {
      const cantDrops = n.frijolVid > 0.25 && n.calabazaCobertura > 0.25 ? 3 : 2;
      for (let k = 0; k < cantDrops; k++) {
        sistemaDrops.soltar(
          {
            id: "mazorca",
            cantidad: 1,
            meta: { variedad: variedad.nombre, calidad }
          },
          n.posicionMundo
        );
      }
    }
  };

  bancoSemillas = new BancoSemillas(
    scene,
    surcoMilpa,
    carritoAgricola.canasta,
    audioSintetizador,
    busEventos
  );
  bancoSemillas.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  bancoSemillas.onConsumirMazorca = (variedadPreferida) =>
    consumirMazorcaReal(variedadPreferida ? tipoPorNombreVariedad(variedadPreferida) : undefined);
  bancoSemillas.onContarMazorcas = () => contarMazorcasTotales();
  bancoSemillas.onEntregarSemillas = (variedad, cantidad) => {
    const res = inventarioJugador?.agregar({ id: `semilla_${variedad}`, cantidad });
    hotbarPixel?.actualizarVisual();
    guardarPartidaActual();
    return cantidad - (res?.sobrante ?? 0);
  };

  codiceMaiz = new CodiceMaiz(scene, audioSintetizador, busEventos);
  codiceMaiz.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);

  fichaCultivo = new FichaCultivoModal();
  (window as any).fichaCultivo = fichaCultivo;

  // Colisiones físicas: registradas DESPUÉS de instanciar todas las estaciones 3D (incluye Banco y Códice)
  if (almacenMazorcas) registrarSolidoDesdeNodo(almacenMazorcas.raiz, "almacen", 0.05);
  if (fogonCocina) registrarSolidoDesdeNodo(fogonCocina.raiz, "fogon", 0.05);
  if (bancoSemillas) registrarSolidoDesdeNodo(bancoSemillas.raiz, "banco", 0.05);
  if (codiceMaiz) registrarSolidoDesdeNodo(codiceMaiz.raiz, "codice", 0.05);
  if (espantapajaros) registrarSolidoDesdeNodo(espantapajaros.root, "espantapajaros", 0.02);

  ajustesSistema.onBorrarProgreso = () => {
    bancoSemillas?.reiniciar();
    codiceMaiz?.reiniciar();
  };
  ajustesSistema.suscribir((cfg) => {
    if (controladorXbox) controladorXbox.factorHaptico = cfg.intensidadHaptica;
  });

  misionesSistema = new MisionesSistema(busEventos, codiceMaiz, audioSintetizador);
  misionesSistema.onMensajeToast = (msg) => uiEdu?.mostrarToast(msg);
  misionesSistema.onActualizarUI = () => {
    if (!uiEdu || !misionesSistema) return;
    const mActiva = misionesSistema.obtenerMisionActiva();
    uiEdu.actualizarProgresoV4(
      misionesSistema.hitoCalendarioActual,
      `${mActiva.titulo} (${mActiva.progreso}/${mActiva.meta})`
    );
  };

  // G. Controlador de Jugador en Primera Persona (FPS) con Manos y Herramientas
  controladorJugador = new ControladorJugador(
    scene,
    canvas,
    camera,
    surcoMilpa,
    espantapajaros,
    audioSintetizador,
    carritoAgricola.canasta,
    particulasEdu
  );
  controladorJugador.onAccionAgronomica = (tipo, nodoId) => {
    if (surcoMilpa) surcoMilpa.nodoSeleccionadoId = nodoId;
    ejecutarAccion(tipo);
  };
  controladorJugador.onCambioHerramientaRueda = (h) => {
    estadoEdu.herramientaSeleccionada = h;
    if (interaccion6DoF) interaccion6DoF.herramientaActiva = h;
    cinturonVR?.seleccionar(h);
    uiEdu?.actualizarUI();
  };
  controladorJugador.onWheelHotbar = (dir) => {
    hotbarPixel?.avanzarSlot(dir);
  };
  controladorJugador.onInteractuarObjeto3D = (tipo, meshName, nodoId) => {
    const id = nodoId ?? (surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0);
    switch (tipo) {
      case "drop_mazorca":
        if (sistemaDrops && !sistemaDrops.recogerPorMeshName(meshName)) {
          almacenMazorcas?.recogerDropPorMeshName(meshName);
        }
        break;
      case "almacen":
        if (inventarioJugador && inventarioJugador.cuenta("mazorca") > 0) {
          const cantMov = inventarioJugador.cuenta("mazorca");
          inventarioJugador.moverTodoDe(inventarioTroje!, "mazorca");
          carritoAgricola?.canasta?.retirarMazorca(undefined, cantMov);
          audioSintetizador?.cosecharExito(almacenMazorcas?.raiz.position ?? Vector3.Zero());
          uiEdu?.mostrarToast(`🏛️ +${cantMov} mazorcas guardadas en la Troje`);
        } else {
          controladorJugador?.liberarPuntero();
          modalCofreTroje?.alternar();
        }
        break;
      case "canasta":
        controladorJugador?.liberarPuntero();
        modalCofreTroje?.alternar();
        break;
      case "mesa_clima":
        if (mesaClimaPrejuego) {
          const resClima = mesaClimaPrejuego.interactuarConMalla(meshName);
          if (resClima && resClima.mensaje) {
            uiEdu?.mostrarToast(resClima.mensaje);
          }
        }
        break;
      case "fogon":
        fogonCocina?.avanzarPasoInteractivo();
        break;
      case "banco":
        controladorJugador?.liberarPuntero();
        bancoSemillas?.alternarModal();
        break;
      case "dispensador":
        if (meshName.startsWith("dispensadorBoton_")) {
          dispensadorSemillas?.interactuar(meshName);
        } else {
          controladorJugador?.liberarPuntero();
          dispensadorSemillas?.abrir();
        }
        break;
      case "codice":
        controladorJugador?.liberarPuntero();
        codiceMaiz?.alternarModal();
        break;
      case "maleza":
        malezaSistema?.deshierbarNodo(id, 0.65);
        break;
      case "fauna":
        if (!faunaMilpa?.interactuarPorMeshName(meshName)) {
          faunaMilpa?.limpiarPlagasEnNodo(id);
        }
        break;
      case "triada_cosecha":
        triadaViva?.cosecharAsociado(
          id,
          meshName.includes("vaina") ? "frijol" : "calabaza"
        );
        break;
    }
  };
  controladorJugador.onAccionContextualDerecho = (nodoId) => {
    if (!surcoMilpa) return;
    surcoMilpa.nodoSeleccionadoId = nodoId;
    const n = surcoMilpa.nodos[nodoId];
    if (!n) return;

    // Prioridad contextual estilo Minecraft con Clic Derecho (dirigida por fenología real):
    if (surcoMilpa.estaListoParaCosecha(nodoId)) {
      ejecutarAccion("cosecha");
    } else if (n.cosechada || (n.sembrada && n.plantaInterna.estado === "MUERTA")) {
      ejecutarQuitarPlanta(nodoId);
    } else if (n.maleza > 10 || n.plaga > 10) {
      malezaSistema?.deshierbarNodo(nodoId, 0.6);
      faunaMilpa?.limpiarPlagasEnNodo(nodoId);
    } else if (
      n.sembrada &&
      surcoMilpa.obtenerEtapaNodo(nodoId) >= Etapa.VT &&
      surcoMilpa.obtenerEtapaNodo(nodoId) <= Etapa.R2 &&
      n.polinizacion < 0.95
    ) {
      polinizacionSistema?.polinizarManual(nodoId);
    } else {
      ejecutarAccion(estadoEdu.herramientaSeleccionada);
    }
  };
  controladorJugador.onToast = (msg) => {
    if (menuPrincipal?.estaAbierto()) return;
    uiEdu?.mostrarToast(msg);
  };

  // G2. Compatibilidad nativa con Mando de Xbox Series S|X (Gamepad API + Dual-Rumble)
  controladorXbox = new ControladorXbox(controladorJugador, {
    onCambiarSlotHotbar: (dir) => {
      hotbarPixel?.avanzarSlot(dir);
    },
    onQuitarPlanta: () => {
      ejecutarQuitarPlanta();
    },
    onAbrirInventario: () => {
      controladorJugador?.liberarPuntero();
      modalCofreTroje?.alternar();
    },
    onAccionX: () => {
      const obj = controladorJugador?.tipoObjetivoEnfocado;
      if (
        obj === "almacen" ||
        obj === "canasta" ||
        obj === "dispensador" ||
        obj === "fogon" ||
        obj === "banco" ||
        obj === "codice" ||
        obj === "mesa_clima" ||
        obj === "don_elote"
      ) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE" }));
      } else {
        const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
        malezaSistema?.deshierbarNodo(id, 0.6);
        faunaMilpa?.limpiarPlagasEnNodo(id);
        controladorJugador?.usarHerramientaActiva();
      }
    },
    onAvanzarSol: () => {
      avanzarDiasConAutopausa(15);
    },
    onAbrirClima: () => {
      controladorJugador?.liberarPuntero();
      panelClima?.toggle();
    },
    onAsociarFrijol: () => {
      ejecutarAccion("frijol");
    },
    onAsociarCalabaza: () => {
      ejecutarAccion("calabaza");
    },
    onCambiarEstacion: () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab" }));
    },
    onEscape: () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    },
    onAbrirGuiaXbox: () => {
      controladorJugador?.liberarPuntero();
      modalControles?.mostrar("xbox");
    },
    onEstadoConexion: (conectado, nombre) => {
      modalControles?.notificarEstadoXbox(conectado, nombre);
    },
    onToast: (msg) => {
      if (menuPrincipal?.estaAbierto()) return;
      uiEdu?.mostrarToast(msg);
    },
  });
  controladorXbox.factorHaptico = ajustesSistema.valores.intensidadHaptica;

  // Exponer referencias globales para depuración y pruebas automatizadas
  (window as any).camaraPrincipal = camera;
  (window as any).controladorJugador = controladorJugador;
  (window as any).controladorXbox = controladorXbox;
  (window as any).espantapajaros = espantapajaros;
  (window as any).audioSintetizador = audioSintetizador;
  (window as any).surcoMilpa = surcoMilpa;
  (window as any).fogonCocina = fogonCocina;
  (window as any).bancoSemillas = bancoSemillas;
  (window as any).codiceMaiz = codiceMaiz;
  (window as any).directorEventos = directorEventos;
  (window as any).almacenMazorcas = almacenMazorcas;
  (window as any).dispensadorSemillas = dispensadorSemillas;
  (window as any).faunaMilpa = faunaMilpa;
  (window as any).hotbarPixel = hotbarPixel;
  (window as any).inventarioJugador = inventarioJugador;

  // H. Paneles espaciales 3D (disponibles en Modo Científico y WebXR)
  paneles = new PanelesVR(scene, estadoCrecimiento, clima, metricas, {
    onClimaChange: () => {
      metricas = calcularMetricas(clima);
      ambiente?.aplicarClima(clima, metricas);
      paneles?.actualizarTelemetria(metricas, estadoCrecimiento);
      paneles?.actualizarConsola(estadoCrecimiento, clima);
    },
    onTimeLapseChange: () => {
      paneles?.actualizarConsola(estadoCrecimiento, clima);
      paneles?.actualizarTelemetria(metricas, estadoCrecimiento);
    },
    onEnfocarCamara: (tipo) => {
      enfocarPorTipo(tipo);
    },
    onToggleCicloSolar: () => {
      cicloSolarAuto = !cicloSolarAuto;
      panelClima?.actualizarEstadoCicloSolar(cicloSolarAuto);
      paneles?.actualizarEstadoCicloSolar(cicloSolarAuto);
      return cicloSolarAuto;
    },
    onToggleRotacionAuto: () => {
      if (!camaraPrincipal) return false;
      camaraPrincipal.useAutoRotationBehavior = !camaraPrincipal.useAutoRotationBehavior;
      if (camaraPrincipal.useAutoRotationBehavior && camaraPrincipal.autoRotationBehavior) {
        camaraPrincipal.autoRotationBehavior.idleRotationSpeed = 0.25;
      }
      return camaraPrincipal.useAutoRotationBehavior;
    },
    getRotacionAuto: () => {
      return camaraPrincipal?.useAutoRotationBehavior ?? false;
    }
  });
  paneles.setVisible(false);

  panelClima = new PanelClima(clima, {
    onCambioClima: () => {
      metricas = calcularMetricas(clima);
      ambiente?.aplicarClima(clima, metricas);
      paneles?.actualizarTelemetria(metricas, estadoCrecimiento);
      paneles?.actualizarConsola(estadoCrecimiento, clima);
      ambiente?.actualizarHumedadVisual(Math.min(100, Math.max(0, (clima.humedadSuelo / 55) * 100)));
      sincronizarNodoConUI();
    },
    onToggleCicloSolar: () => {
      cicloSolarAuto = !cicloSolarAuto;
      panelClima?.actualizarEstadoCicloSolar(cicloSolarAuto);
      paneles?.actualizarEstadoCicloSolar(cicloSolarAuto);
      return cicloSolarAuto;
    }
  });

  function obtenerFactorDificultadMaleza(): number {
    if (dificultadMundo === "tranquilo") return 0.5;
    if (dificultadMundo === "extremo") return 1.5;
    return 1.0;
  }

  // I. Sincronización de estado de nodo seleccionado con HUD Educativo y Ficha Clínica
  function sincronizarNodoConUI(): void {
    if (!surcoMilpa) return;
    const nodo = surcoMilpa.nodos[surcoMilpa.nodoSeleccionadoId];
    if (!nodo) return;
    const dia = nodo.diasCultivo;
    const varCfg = VARIEDADES_MAIZ[nodo.variedad];
    const p = nodo.plantaInterna;

    estadoEdu.tierraArada = Math.round(nodo.tierraArada);
    estadoEdu.humedadSuelo = Math.round(nodo.humedadVWC);
    estadoEdu.nutrientesSuelo = Math.round(nodo.nutrientesNPK);
    estadoEdu.semillaSembrada = nodo.sembrada;
    estadoEdu.eloteCosechado = nodo.cosechada;
    estadoEdu.diaActual = Math.floor(dia);

    let etapaTexto = "Suelo sin arar";
    if (!nodo.sembrada) {
      etapaTexto = nodo.tierraArada >= 100 ? "Tierra Lista" : "Suelo sin arar";
    } else if (nodo.cosechada) {
      etapaTexto = "Rastrojo (Cosechada)";
    } else if (p.estado === "MUERTA") {
      etapaTexto = `💀 Muerta (${p.causaMuerte || "estrés"})`;
    } else if (p.estado === "SEMILLA") {
      etapaTexto = "🌰 Germinando";
    } else {
      etapaTexto = nombreEtapa(surcoMilpa.obtenerEtapaNodo(nodo.id));
    }
    uiEdu?.actualizarTelemetriaParcela(etapaTexto, varCfg.vwcOptimoMin, varCfg.vwcOptimoMax);

    // Actualizar dinámicamente la fase educativa según el estado real de la estación seleccionada
    if (estadoEdu.fase !== "celebrar") {
      if (nodo.tierraArada < 100 && !nodo.sembrada) {
        estadoEdu.fase = "arar";
      } else if (!nodo.sembrada) {
        estadoEdu.fase = "sembrar";
      } else if (nodo.cosechada || (p.estado === "MUERTA" && !surcoMilpa.estaListoParaCosecha(nodo.id))) {
        estadoEdu.fase = "arar";
      } else if (surcoMilpa.estaListoParaCosecha(nodo.id)) {
        estadoEdu.fase = "cosechar";
      } else if (nodo.humedadVWC < varCfg.vwcOptimoMin) {
        estadoEdu.fase = "regar";
      } else if (nodo.nutrientesNPK < 38) {
        estadoEdu.fase = "abonar";
      } else {
        estadoEdu.fase = "crecer";
      }
    }

    uiEdu?.actualizarUI();
    fichaCultivo?.actualizarSiAbierto(nodo, clima);
  }

  /**
   * Avance granular de días (pasos de 1 día) con autopausa inteligente ante eventos críticos
   * (muerte, sequía severa, encharcamiento, floración VT o madurez de cosecha R3/R6).
   */
  function avanzarDiasConAutopausa(diasTotales: number): void {
    if (!surcoMilpa) return;
    const pasos = Math.max(1, Math.round(diasTotales));
    const etapasPrevias = surcoMilpa.nodos.map((n) => surcoMilpa!.obtenerEtapaNodo(n.id));
    const estadosPrevios = surcoMilpa.nodos.map((n) => n.plantaInterna.estado);
    let diasAvanzados = 0;
    let motivoPausa: string | null = null;

    for (let i = 0; i < pasos; i++) {
      surcoMilpa.avanzarSimulacion(
        1,
        clima,
        metricas,
        directorEventos?.obtenerSeveridadActiva(),
        obtenerFactorDificultadMaleza()
      );
      diasAvanzados++;

      // Detectar hitos críticos para detener saltos largos antes de arruinar la cosecha
      if (pasos > 1) {
        for (let idx = 0; idx < surcoMilpa.nodos.length; idx++) {
          const n = surcoMilpa.nodos[idx];
          if (!n.sembrada || n.cosechada) continue;
          const varCfg = VARIEDADES_MAIZ[n.variedad];
          const p = n.plantaInterna;
          const etapaAct = surcoMilpa.obtenerEtapaNodo(n.id);

          if (p.estado === "MUERTA" && estadosPrevios[idx] !== "MUERTA") {
            motivoPausa = `💀 Autopausa (+${diasAvanzados}d): Estación #${n.id + 1} (${varCfg.nombre}) murió por ${p.causaMuerte || "estrés"}.`;
            break;
          }
          if (n.humedadVWC <= varCfg.pmp + 2.5 && p.estado !== "MUERTA") {
            motivoPausa = `🏜️ Autopausa (+${diasAvanzados}d): Estación #${n.id + 1} en sequía crítica (${Math.round(n.humedadVWC)}% VWC). ¡Riega [7]!`;
            break;
          }
          if (etapaAct >= Etapa.VT && etapasPrevias[idx] < Etapa.VT && n.polinizacion < 0.85) {
            motivoPausa = `🌼 Autopausa (+${diasAvanzados}d): Estación #${n.id + 1} entró en Floración (VT). ¡Poliniza con [P]!`;
            break;
          }
          if (etapaAct >= Etapa.R3 && etapasPrevias[idx] < Etapa.R3) {
            motivoPausa = `🌽 Autopausa (+${diasAvanzados}d): Estación #${n.id + 1} alcanzó Elote Tierno (R3). Cosecha [9] o sigue hasta R6 Grano Seco.`;
            break;
          }
          if (etapaAct >= Etapa.R6 && etapasPrevias[idx] < Etapa.R6) {
            motivoPausa = `🌾 Autopausa (+${diasAvanzados}d): Estación #${n.id + 1} llegó a Madurez Fisiológica (R6 Grano Seco). ¡Cosecha [9]!`;
            break;
          }
        }
        if (motivoPausa) break;
      }
    }

    malezaSistema?.actualizarThinInstances();
    triadaViva?.actualizarVisuales();
    audioSintetizador?.abono();

    const nodoSel = surcoMilpa.nodos[surcoMilpa.nodoSeleccionadoId];
    const diaMax = Math.max(...surcoMilpa.nodos.map((n) => n.diasCultivo || 0), 0);
    busEventos.emitir({ t: "dia", dia: Math.floor(diaMax) });
    misionesSistema?.actualizarCalendarioRitual(Math.floor(diaMax));
    directorEventos?.evaluarDiaSimulado(Math.floor(diaMax));
    evaluarPistasContextualesDonElote();

    if (motivoPausa) {
      uiEdu?.mostrarToast(motivoPausa);
    } else if (nodoSel && nodoSel.sembrada) {
      const p = nodoSel.plantaInterna;
      const varCfg = VARIEDADES_MAIZ[nodoSel.variedad];
      if (p.estado === "MUERTA") {
        uiEdu?.mostrarToast(
          `💀 Estación #${nodoSel.id + 1} (${varCfg.nombre}): Muerta por ${p.causaMuerte || "clima"}. Límpiala con [Q] o Azada [2].`
        );
      } else {
        uiEdu?.mostrarToast(
          `☀️ +${diasAvanzados}d · Estación #${nodoSel.id + 1}: Día ${Math.floor(nodoSel.diasCultivo)} (${nombreEtapa(surcoMilpa.obtenerEtapaNodo(nodoSel.id))})`
        );
      }
    } else {
      uiEdu?.mostrarToast(`☀️ ¡Avanzaron +${diasAvanzados} días en todo el surco de la milpa!`);
    }
    sincronizarNodoConUI();
  }

  /**
   * Acción dedicada para quitar/arrancar cualquier planta (viva, muerta o cosechada) con animación 3D
   */
  function ejecutarQuitarPlanta(idOverride?: number): void {
    if (!surcoMilpa) return;
    const nodoId =
      idOverride !== undefined
        ? idOverride
        : controladorJugador?.nodoEnfocado
        ? controladorJugador.nodoEnfocado.id
        : surcoMilpa.nodoSeleccionadoId;
    surcoMilpa.nodoSeleccionadoId = nodoId;
    const nodo = surcoMilpa.nodos[nodoId];
    if (!nodo) return;

    const resQ = surcoMilpa.quitarPlanta(nodoId);
    if (resQ.exito) {
      if (controladorJugador?.modo === "fps") {
        controladorJugador.viewmodel.accionar();
      }
      herramientas3D?.animarAzada();
      audioSintetizador?.ararTierra(nodo.posicionMundo);
      faunaMilpa?.desactivarAgentesEnNodo(nodoId);
      malezaSistema?.actualizarThinInstances();
      triadaViva?.actualizarVisuales();
      espantapajaros?.decir(
        `🗑️ ¡Planta retirada de la Estación #${nodoId + 1}! El montículo quedó limpio y arado para sembrar de nuevo.`
      );
    }
    uiEdu?.mostrarToast(resQ.mensaje);
    sincronizarNodoConUI();
  }

  let mazorcasCosechadasEstaSesion = 0;
  let logroPrimeraCosechaMostrado = false;

  // J. Ejecución de Acciones Agronómicas y Educativas
  function ejecutarAccion(herramienta: HerramientaTipo): void {
    const nodoId = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
    const nodo = surcoMilpa?.nodos[nodoId];

    switch (herramienta) {
      case "azada":
        if (surcoMilpa && nodo) {
          const estabaEncharcada = nodo.humedadVWC > 45;
          const resA = surcoMilpa.arar(nodoId, 1.0);
          if (estabaEncharcada) {
            directorEventos?.registrarDrenaje();
          }
          herramientas3D?.animarAzada();
          audioSintetizador?.golpeAzada(1.0, nodo.posicionMundo);
          faunaMilpa?.desactivarAgentesEnNodo(nodoId);
          malezaSistema?.actualizarThinInstances();
          triadaViva?.actualizarVisuales();
          busEventos.emitir({ t: "arado", nodo: nodoId, potencia: 1.0 });
          uiEdu?.mostrarToast(resA.mensaje);
          if (nodo.tierraArada >= 100 && !nodo.sembrada) {
            espantapajaros?.decir(`¡Estación ${nodoId + 1} lista! Ahora toma las semillas [3-6] y siembra.`);
          }
        }
        break;

      case "semilla":
      case "semilla_chalqueno":
      case "semilla_azul":
      case "semilla_rojo":
      case "semilla_palomero":
        if (surcoMilpa && nodo && inventarioJugador) {
          const varHerr = variedadDeHerramienta(herramienta);
          const slotActivo = hotbarPixel ? hotbarPixel.slotActivo : 0;
          const stackActivo = inventarioJugador.slots[slotActivo];
          let slotSemillaIdx = -1;
          let variedadElegida = varHerr ?? nodo.variedad;

          if (varHerr) {
            const idEsperado = `semilla_${varHerr}`;
            if (stackActivo && stackActivo.id === idEsperado && stackActivo.cantidad > 0) {
              slotSemillaIdx = slotActivo;
            } else {
              slotSemillaIdx = inventarioJugador.slots.findIndex(
                (s) => s && s.id === idEsperado && s.cantidad > 0
              );
            }
          } else if (stackActivo && variedadDeItemId(stackActivo.id) && stackActivo.cantidad > 0) {
            variedadElegida = variedadDeItemId(stackActivo.id)!;
            slotSemillaIdx = slotActivo;
          } else if (
            stackActivo &&
            (stackActivo.id === "semilla" || stackActivo.id === "grano") &&
            stackActivo.cantidad > 0
          ) {
            variedadElegida = stackActivo.meta?.variedad
              ? tipoPorNombreVariedad(stackActivo.meta.variedad)
              : nodo.variedad;
            slotSemillaIdx = slotActivo;
          } else {
            slotSemillaIdx = inventarioJugador.slots.findIndex(
              (s) => s && (!!variedadDeItemId(s.id) || s.id === "semilla" || s.id === "grano") && s.cantidad > 0
            );
            if (slotSemillaIdx >= 0) {
              const sFound = inventarioJugador.slots[slotSemillaIdx]!;
              variedadElegida =
                variedadDeItemId(sFound.id) ??
                (sFound.meta?.variedad ? tipoPorNombreVariedad(sFound.meta.variedad) : nodo.variedad);
            }
          }

          if (slotSemillaIdx < 0) {
            uiEdu?.mostrarToast(
              `⚠️ ¡Te quedaste sin semillas de esa raza! Desgrana mazorcas en el Banco [M] o acude al Dispensador [U].`
            );
            espantapajaros?.decir(
              `🌰 Se agotaron esas semillas. Desgrana una mazorca en el Banco [M] o repón respaldo en el Dispensador [U].`
            );
            break;
          }

          // Herencia genética por raza desde el Banco de Semillas (sin mutar cultivos ya sembrados)
          const rasgosCompat = bancoSemillas?.obtenerRasgosParaVariedad(variedadElegida);

          const resS = surcoMilpa.sembrar(nodoId, variedadElegida, rasgosCompat);
          if (resS.exito) {
            const idConsumido = inventarioJugador.slots[slotSemillaIdx]!.id;
            inventarioJugador.consumirUno(slotSemillaIdx);
            hotbarPixel?.actualizarVisual();
            herramientas3D?.animarSemilla();
            audioSintetizador?.semillas(nodo.posicionMundo);
            const varCfg = VARIEDADES_MAIZ[nodo.variedad];
            busEventos.emitir({ t: "siembra", nodo: nodoId, variedad: varCfg.nombre, granosAcertados: 3 });
            const restantes = inventarioJugador.cuenta(idConsumido);
            if (restantes === 0) {
              uiEdu?.mostrarToast(
                `${resS.mensaje} ⚠️ (Se agotó tu pila; desgrana en Banco [M] o repón en Dispensador [U])`
              );
            } else {
              uiEdu?.mostrarToast(resS.mensaje);
            }
            espantapajaros?.decir(
              `¡Sembraste ${varCfg.nombre}! Riega con [7] para germinar, y asocia Frijol [B] y Calabaza [N].`
            );
          } else {
            uiEdu?.mostrarToast(resS.mensaje);
          }
        }
        break;

      case "frijol":
        if (surcoMilpa && nodo) {
          if (inventarioJugador && inventarioJugador.cuenta("frijol") <= 0) {
            uiEdu?.mostrarToast("⚠️ ¡Sin semillas de Frijol Ayocote! Repónlas en el Dispensador [U].");
            break;
          }
          const resF = triadaViva?.sembrarAsociadoEnNodo(nodoId, "frijol");
          if (resF?.exito) {
            inventarioJugador?.consumirPorId("frijol", 1);
            hotbarPixel?.actualizarVisual();
            herramientas3D?.animarSemilla();
            audioSintetizador?.semillas(nodo.posicionMundo);
          } else if (resF?.mensaje) {
            uiEdu?.mostrarToast(resF.mensaje);
          }
        }
        break;

      case "calabaza":
        if (surcoMilpa && nodo) {
          if (inventarioJugador && inventarioJugador.cuenta("calabaza") <= 0) {
            uiEdu?.mostrarToast("⚠️ ¡Sin semillas de Calabaza Criolla! Repónlas en el Dispensador [U].");
            break;
          }
          const resCal = triadaViva?.sembrarAsociadoEnNodo(nodoId, "calabaza");
          if (resCal?.exito) {
            inventarioJugador?.consumirPorId("calabaza", 1);
            hotbarPixel?.actualizarVisual();
            herramientas3D?.animarSemilla();
            audioSintetizador?.semillas(nodo.posicionMundo);
          } else if (resCal?.mensaje) {
            uiEdu?.mostrarToast(resCal.mensaje);
          }
        }
        break;

      case "regadera":
        if (surcoMilpa && nodo) {
          const resR = surcoMilpa.regar(nodoId);
          herramientas3D?.animarRegadera();
          audioSintetizador?.chorroAgua();
          busEventos.emitir({ t: "riego", nodo: nodoId, caudal: 1.0 });
          panelClima?.actualizarValoresUI();
          uiEdu?.mostrarToast(resR.mensaje);
        }
        break;

      case "abono":
        if (surcoMilpa && nodo) {
          if (inventarioJugador && inventarioJugador.cuenta("abono") <= 0) {
            uiEdu?.mostrarToast(
              "⚠️ ¡Sin abono en mochila! Siembra Frijol Ayocote [B] para fijar Nitrógeno natural con Rhizobium."
            );
            break;
          }
          const resAb = surcoMilpa.abonar(nodoId);
          if (resAb.exito) {
            inventarioJugador?.consumirPorId("abono", 1);
            hotbarPixel?.actualizarVisual();
          }
          herramientas3D?.animarAbono();
          audioSintetizador?.abono(nodo.posicionMundo);
          busEventos.emitir({ t: "abono", nodo: nodoId, dosis: 25 });
          uiEdu?.mostrarToast(resAb.mensaje);
        }
        break;

      case "sol":
        avanzarDiasConAutopausa(15);
        break;

      case "cosecha":
        if (surcoMilpa && nodo) {
          const resC = surcoMilpa.cosechar(nodoId);
          if (resC.exito && resC.variedad) {
            audioSintetizador?.cosecha(nodo.posicionMundo);
            const cantDrops = nodo.frijolVid > 0.25 && nodo.calabazaCobertura > 0.25 ? 3 : 2;
            const madurez = resC.tipoCosecha === "grano_seco" ? "grano_seco" : "elote";
            if (sistemaDrops) {
              for (let k = 0; k < cantDrops; k++) {
                sistemaDrops.soltar(
                  {
                    id: "mazorca",
                    cantidad: 1,
                    meta: { variedad: resC.variedad.nombre, calidad: resC.calidad || 0.9, madurez }
                  },
                  nodo.posicionMundo
                );
              }
              if (resC.tieneHuitlacoche) {
                sistemaDrops.soltar(
                  { id: "huitlacoche", cantidad: 1 },
                  nodo.posicionMundo.add(new Vector3(0.18, 0.1, 0.12))
                );
              }
            }
            busEventos.emitir({
              t: "cosecha",
              nodo: nodoId,
              variedad: resC.variedad.nombre,
              calidad: nodo.calidad
            });
            const extraHuit = resC.tieneHuitlacoche
              ? " ¡También cayó Huitlacoche gourmet 🍄 para el Fogón [F]!"
              : "";
            espantapajaros?.decir(
              `🌽 ¡Cayeron ${cantDrops} mazorcas de ${resC.variedad.nombre}! Acércate para recogerlas y llévalas a la Troje [I] o al Fogón [F].${extraHuit}`
            );
            uiEdu?.mostrarToast(
              `${resC.mensaje} ¡Recoge las ${cantDrops} mazorcas y guárdalas en la Troje [I]!`
            );
            mazorcasCosechadasEstaSesion += cantDrops;
            if (!logroPrimeraCosechaMostrado && mazorcasCosechadasEstaSesion >= 3) {
              logroPrimeraCosechaMostrado = true;
              estadoEdu.fase = "celebrar";
              estadoEdu.eloteCosechado = true;
            }
            guardarPartidaActual();
          } else {
            uiEdu?.mostrarToast(resC.mensaje);
          }
        }
        break;

      case "mano":
        if (surcoMilpa && nodo) {
          const dia = nodo.diasCultivo;
          const estaMuerta = nodo.sembrada && (nodo.plantaInterna.estado === "MUERTA" || nodo.estadoCrec.estaMuerta);
          const varCfg = VARIEDADES_MAIZ[nodo.variedad];

          // 1. Cosechar a mano si la mazorca alcanzó R3–R6
          if (surcoMilpa.estaListoParaCosecha(nodoId)) {
            ejecutarAccion("cosecha");
            espantapajaros?.decir(`🌽 ¡Cosechaste a mano el elote de ${varCfg.nombre} desprendiéndolo con cuidado!`);
            break;
          }

          // 2. Retirar planta si ya fue cosechada o si murió sin mazorca aprovechable
          if (nodo.cosechada || estaMuerta) {
            ejecutarQuitarPlanta(nodoId);
            break;
          }

          // 3. Deshierbar o ahuyentar plagas a mano
          if (nodo.maleza > 5 || nodo.plaga > 5) {
            malezaSistema?.deshierbarNodo(nodoId, 0.75);
            faunaMilpa?.limpiarPlagasEnNodo(nodoId);
            audioSintetizador?.golpeAzada(0.3, nodo.posicionMundo);
            uiEdu?.mostrarToast(`🌿 ¡Deshierbaste malezas y ahuyentaste plagas a mano en Estación #${nodoId + 1}!`);
            espantapajaros?.decir(`🤲 ¡Muy bien! Limpiaste hierbas y plagas con tus manos sin dañar las raíces.`);
            break;
          }

          // 4. Polinización manual sacudiendo la espiga con las manos en VT–R2
          const etapaMano = surcoMilpa.obtenerEtapaNodo(nodoId);
          if (
            nodo.sembrada &&
            etapaMano >= Etapa.VT &&
            etapaMano <= Etapa.R2 &&
            nodo.polinizacion < 0.95
          ) {
            polinizacionSistema?.polinizarManual(nodoId);
            espantapajaros?.decir(`🌼 ¡Sacudiste la espiga con tus manos! El polen fertiliza los estigmas.`);
            break;
          }

          // 5. Sembrar grano con la mano si la tierra ya está lista y desocupada
          if (!nodo.sembrada && nodo.tierraArada >= 100) {
            ejecutarAccion("semilla");
            break;
          }

          // 6. Aflojar / acondicionar el montículo de tierra con las manos
          if (!nodo.sembrada && nodo.tierraArada < 100) {
            surcoMilpa.arar(nodoId, 0.5);
            audioSintetizador?.ararTierra(nodo.posicionMundo);
            uiEdu?.mostrarToast(`🤲 Araste y moldeaste el montículo con tus manos (${Math.round(nodo.tierraArada)}%)`);
            if (nodo.tierraArada >= 100) {
              espantapajaros?.decir(`¡Tierra bien mullida con tus manos! Ahora equipa semillas [3-6] o vuelve a hacer clic.`);
            }
            break;
          }

          // 7. Inspección táctil del suelo y estado de la planta con las manos
          audioSintetizador?.semillas(nodo.posicionMundo);
          const estadoAgua =
            nodo.humedadVWC < varCfg.vwcOptimoMin
              ? "Seco 🏜️ (riega con [7])"
              : nodo.humedadVWC > varCfg.vwcOptimoMax
              ? "Muy húmedo 💧 (drena con [2])"
              : "Humedad óptima 🌿";
          const descTactil = `✋ Estación #${nodoId + 1} (${varCfg.nombre}): ${estadoAgua} (${Math.round(nodo.humedadVWC)}% VWC), N:${Math.round(nodo.nSuelo)} P:${Math.round(nodo.pSuelo)} K:${Math.round(nodo.kSuelo)} · [L] Ficha Clínica.`;
          uiEdu?.mostrarToast(descTactil);
          espantapajaros?.decir(
            `Palpas la tierra: ${Math.round(nodo.humedadVWC)}% VWC. ${
              nodo.humedadVWC < varCfg.vwcOptimoMin ? "¡Necesita riego [7]!" : "¡La planta avanza bien! Abre [L] para ver sus raíces."
            }`
          );
        }
        break;
    }

    sincronizarNodoConUI();
  }

  /**
   * Evalúa el estado agronómico del surco para que Don Elote apunte y aconseje (M11)
   */
  function evaluarPistasContextualesDonElote(): void {
    if (!surcoMilpa || !espantapajaros) return;
    for (const n of surcoMilpa.nodos) {
      if (!n.sembrada || n.cosechada) continue;
      const dia = n.diasCultivo;

      const p = n.plantaInterna;
      const varCfg = VARIEDADES_MAIZ[n.variedad];

      if (p.estado === "MUERTA") {
        espantapajaros.encolarPista({
          prioridad: 3,
          topico: `muerta_nodo_${n.id}_${p.causaMuerte}`,
          titulo: "💀 Don Elote advierte planta seca/muerta:",
          texto: `El ${varCfg.nombre} en Estación #${n.id + 1} murió por ${p.causaMuerte || "estrés climático"}. Usa [Q] o Azada [2] para limpiar.`,
          posObjetivo: n.posicionMundo
        });
        break;
      }
      if ((p.secado ?? 0) > 0.35 && !surcoMilpa.estaListoParaCosecha(n.id)) {
        espantapajaros.encolarPista({
          prioridad: 2,
          topico: `secando_nodo_${n.id}`,
          titulo: "🌾 ¡Cuidado, se está secando!",
          texto: `La Estación #${n.id + 1} (${varCfg.nombre}) se está secando (${Math.round(n.humedadVWC)}% VWC). ¡Riégala con [7] o ajusta el clima!`,
          posObjetivo: n.posicionMundo
        });
        break;
      }
      if (n.maleza > 45) {
        espantapajaros.encolarPista({
          prioridad: 1,
          topico: `maleza_nodo_${n.id}`,
          titulo: "🌿 Don Elote señala maleza:",
          texto: `¡Mira la Estación #${n.id + 1}! Crecieron quelites y maleza. Arráncalos con [X] o siembra calabaza [N].`,
          posObjetivo: n.posicionMundo
        });
        break;
      }
      const etapaPista = surcoMilpa.obtenerEtapaNodo(n.id);
      if (
        etapaPista >= Etapa.VT &&
        etapaPista <= Etapa.R2 &&
        n.polinizacion < 0.65
      ) {
        espantapajaros.encolarPista({
          prioridad: 2,
          topico: `polen_nodo_${n.id}`,
          titulo: "🌼 Don Elote aconseja polinizar:",
          texto: `La Estación #${n.id + 1} está en floración (VT–R2). Sacude la espiga con [P] para llenar todos los granos del elote.`,
          posObjetivo: n.posicionMundo
        });
        break;
      }
      if (surcoMilpa.estaListoParaCosecha(n.id)) {
        const tipo = surcoMilpa.obtenerTipoCosecha(n.id);
        espantapajaros.encolarPista({
          prioridad: 2,
          topico: `cosecha_nodo_${n.id}_${tipo}`,
          titulo: tipo === "grano_seco" ? "🌾 ¡Grano Seco R6 listo!" : "🌽 ¡Elote Tierno R3 listo!",
          texto: `La Estación #${n.id + 1} llegó a ${nombreEtapa(etapaPista)} (Día ${Math.floor(dia)}). ¡Coséchala con [9]!`,
          posObjetivo: n.posicionMundo
        });
        break;
      }
    }
  }

  // K. Interfaz Infantil y Barra de Ecosistema Milpa Viva v4.0
  uiEdu = new UIEducativa(estadoEdu, {
    onSeleccionarHerramienta: (h) => {
      estadoEdu.herramientaSeleccionada = h;
      if (interaccion6DoF) interaccion6DoF.herramientaActiva = h;
      controladorJugador?.equipar(h);
    },
    onEjecutarAccion: (h) => {
      ejecutarAccion(h);
    },
    onToggleTimeLapse: () => {
      const algunSembrado = surcoMilpa?.nodos.some((n) => n.sembrada) ?? false;
      if (!algunSembrado && !estadoEdu.semillaSembrada) {
        uiEdu?.mostrarToast("¡Primero siembra una semilla para iniciar el crecimiento!");
        return;
      }
      estadoEdu.reproduciendoCrecimiento = !estadoEdu.reproduciendoCrecimiento;
      hotbarPixel?.actualizarEstadoCrecimiento(estadoEdu.reproduciendoCrecimiento);
      uiEdu?.actualizarUI();
    },
    onAvanzarSemana: () => {
      avanzarDiasConAutopausa(5);
    },
    onReiniciar: () => {
      limpiarEstadoMundo(false);
      uiEdu?.mostrarToast("🌱 ¡Parcela reiniciada! Semillas e instrumentos restaurados.");
    },
    onContinuarTrasLogro: () => {
      sincronizarNodoConUI();
    },
    onToggleModoCientifico: () => {
      const vis = !paneles?.refs.panelConsolaMesh.isEnabled();
      paneles?.setVisible(vis);
      return vis;
    },
    // Callbacks v4.0
    onQuitarPlanta: () => {
      ejecutarQuitarPlanta();
    },
    onDeshierbar: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      malezaSistema?.deshierbarNodo(id, 0.6);
      faunaMilpa?.limpiarPlagasEnNodo(id);
    },
    onPolinizar: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      polinizacionSistema?.polinizarManual(id);
    },
    onSembrarFrijol: () => {
      ejecutarAccion("frijol");
    },
    onSembrarCalabaza: () => {
      ejecutarAccion("calabaza");
    },
    onColocarTutor: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarTutor(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    },
    onColocarPetate: () => {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarProteccion(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    },
    onAbrirFogon: () => {
      controladorJugador?.liberarPuntero();
      fogonCocina?.alternarModal();
    },
    onAbrirBancoSemillas: () => {
      controladorJugador?.liberarPuntero();
      bancoSemillas?.alternarModal();
    },
    onAbrirCodice: () => {
      controladorJugador?.liberarPuntero();
      codiceMaiz?.alternarModal();
    },
    onAbrirAjustes: () => {
      controladorJugador?.liberarPuntero();
      ajustesSistema?.toggleModal();
    },
    onAbrirAlmacen: () => {
      controladorJugador?.liberarPuntero();
      modalCofreTroje?.alternar();
    },
    onAbrirFichaCultivo: () => {
      controladorJugador?.liberarPuntero();
      const nodoActivo = surcoMilpa?.nodos[surcoMilpa.nodoSeleccionadoId];
      if (nodoActivo) fichaCultivo?.alternar(nodoActivo, clima);
    },
    onToggleClima: () => {
      controladorJugador?.liberarPuntero();
      panelClima?.toggle();
    },
    onAbrirControles: () => {
      controladorJugador?.liberarPuntero();
      modalControles?.alternar();
    },
    onAbrirDispensador: () => {
      controladorJugador?.liberarPuntero();
      if (dispensadorSemillas?.estaAbierto()) dispensadorSemillas.cerrar();
      else dispensadorSemillas?.abrir();
    },
    onAbrirPausa: () => {
      if (menuPrincipal?.estaAbierto()) return;
      controladorJugador?.liberarPuntero();
      if (menuPausa?.estaAbierto()) menuPausa.ocultar(true);
      else menuPausa?.abrir(nombreMundoActivo);
    }
  });

  // Inicializar Modal de Controles y Menús estilo Minecraft (Inicio + Pausa + Persistencia)
  modalControles = new ModalControlesBienvenida();
  modalControles.onCerrar = () => {
    hotbarPixel?.mostrarNombreActual();
  };
  (window as any).modalControles = modalControles;

  function aplicarConfigMundo(): void {
    faunaMilpa?.configurarMundo(dificultadMundo, semillaMundoStr);
    directorEventos?.configurarMundo(dificultadMundo, semillaMundoStr);
  }

  function limpiarEstadoMundo(reiniciarProgresoGlobal = false): void {
    mazorcasCosechadasEstaSesion = 0;
    logroPrimeraCosechaMostrado = false;
    climaAntesEvento = null;
    estadoEdu.reiniciar();
    hotbarPixel?.actualizarEstadoCrecimiento(false);
    surcoMilpa?.reiniciarSurco();
    faunaMilpa?.reiniciar();
    directorEventos?.reiniciar();
    misionesSistema?.reiniciar();
    fogonCocina?.reiniciar();
    carritoAgricola?.canasta?.reiniciar();
    inventarioTroje?.limpiar();
    almacenMazorcas?.reiniciarAlmacen();
    sistemaDrops?.limpiar();
    restablecerInventarioInicial();
    if (reiniciarProgresoGlobal) {
      bancoSemillas?.reiniciar();
      codiceMaiz?.reiniciar();
    }
    malezaSistema?.actualizarThinInstances();
    triadaViva?.actualizarVisuales();
    hotbarPixel?.actualizarVisual();
    actualizarContadoresHUDMazorcas();
    sincronizarNodoConUI();
    aplicarConfigMundo();
  }

  function serializarPartidaActual(): PartidaGuardada {
    const diaMaximo = surcoMilpa
      ? Math.max(...surcoMilpa.nodos.map((n) => n.diasCultivo || 0), 0)
      : 0;
    return {
      id: idMundoActivo,
      nombre: nombreMundoActivo,
      dificultad: dificultadMundo,
      presetClima: presetClimaMundo,
      semillaMundo: semillaMundoStr,
      actualizadoEn: Date.now(),
      diaMaximo,
      clima: { ...clima },
      cicloSolarAuto,
      nodos: surcoMilpa ? surcoMilpa.exportarSnapshot() : [],
      slotsJugador: inventarioJugador ? inventarioJugador.serializar() : [],
      slotsTroje: inventarioTroje ? inventarioTroje.serializar() : [],
      almacenPorVariedad: almacenMazorcas
        ? { ...almacenMazorcas.almacenadoPorVariedad }
        : { chalqueno: 0, azul: 0, rojo: 0, palomero: 0 },
      misiones: misionesSistema ? misionesSistema.exportarSnapshot() : undefined,
      fogonPlatos: fogonCocina ? fogonCocina.exportarPlatos() : [],
      canastaIngredientes: carritoAgricola?.canasta
        ? {
            quelites: carritoAgricola.canasta.quelites,
            frijol: carritoAgricola.canasta.frijol,
            calabaza: carritoAgricola.canasta.calabaza,
            huitlacoche: carritoAgricola.canasta.huitlacoche
          }
        : undefined,
      directorEventos: directorEventos ? directorEventos.exportarSnapshot() : undefined,
      codiceIds: codiceMaiz ? codiceMaiz.exportarDesbloqueadas() : [],
      bancoLotes: bancoSemillas ? bancoSemillas.exportarSnapshot().lotes : undefined,
      bancoLoteActivo: bancoSemillas ? bancoSemillas.exportarSnapshot().loteActivoIndex : undefined,
      logroPrimeraCosecha: logroPrimeraCosechaMostrado
    };
  }

  function guardarPartidaActual(): boolean {
    try {
      return guardarPartida(serializarPartidaActual());
    } catch {
      return false;
    }
  }

  function setHudJuegoVisible(visible: boolean): void {
    const uiEl = document.getElementById("ui-educativa-container");
    const hotbarEl = document.getElementById("mc-hotbar-container");
    const toastEl = document.getElementById("milpa-toast-container");
    const vis = visible ? "flex" : "none";
    if (uiEl) uiEl.style.display = vis;
    if (hotbarEl) hotbarEl.style.display = vis;
    if (toastEl) toastEl.style.display = visible ? "flex" : "none";
  }

  function prepararEntradaAlSurco(): void {
    objetivoCamara = null;
    if (camaraPrincipal) camaraPrincipal.useAutoRotationBehavior = false;
    setHudJuegoVisible(true);
    if (controladorJugador && controladorJugador.modo !== "fps") {
      controladorJugador.alternarModo();
    }
    hotbarPixel?.seleccionarSlot(hotbarPixel.slotActivo);
    hotbarPixel?.mostrarNombreActual();
  }

  function aplicarPartidaGuardada(p: PartidaGuardada): void {
    idMundoActivo = p.id;
    nombreMundoActivo = p.nombre || "Milpa Guardada";
    dificultadMundo = p.dificultad || "normal";
    presetClimaMundo = p.presetClima || "templado";
    semillaMundoStr = p.semillaMundo || "CHALCO-2026";
    climaAntesEvento = null;

    Object.assign(clima, p.clima || climaDesdePreset(presetClimaMundo));
    cicloSolarAuto = p.cicloSolarAuto !== undefined ? p.cicloSolarAuto : true;
    panelClima?.actualizarEstadoCicloSolar(cicloSolarAuto);
    paneles?.actualizarEstadoCicloSolar(cicloSolarAuto);
    metricas = calcularMetricas(clima);
    ambiente?.aplicarClima(clima, metricas);
    panelClima?.actualizarValoresUI();

    faunaMilpa?.reiniciar();
    sistemaDrops?.limpiar();
    carritoAgricola?.canasta?.reiniciar();
    if (p.canastaIngredientes && carritoAgricola?.canasta) {
      carritoAgricola.canasta.quelites = p.canastaIngredientes.quelites || 0;
      carritoAgricola.canasta.frijol = p.canastaIngredientes.frijol || 0;
      carritoAgricola.canasta.calabaza = p.canastaIngredientes.calabaza || 0;
      carritoAgricola.canasta.huitlacoche = p.canastaIngredientes.huitlacoche || 0;
      carritoAgricola.canasta.actualizarBadge();
    }

    if (Array.isArray(p.nodos) && p.nodos.length > 0) {
      surcoMilpa?.restaurarSnapshot(p.nodos, clima, metricas);
    } else {
      surcoMilpa?.reiniciarSurco();
    }
    if (Array.isArray(p.slotsJugador)) {
      inventarioJugador?.deserializar(p.slotsJugador);
    } else {
      restablecerInventarioInicial();
    }
    if (Array.isArray(p.slotsTroje)) {
      inventarioTroje?.deserializar(p.slotsTroje);
    } else {
      inventarioTroje?.limpiar();
    }

    // Reconstruir mazorcas visuales en canasta desde el inventario del jugador (fuente única)
    if (inventarioJugador && carritoAgricola?.canasta) {
      for (const s of inventarioJugador.slots) {
        if (s && s.id === "mazorca" && s.cantidad > 0) {
          const tipoVar = tipoPorNombreVariedad(s.meta?.variedad);
          for (let i = 0; i < s.cantidad; i++) {
            carritoAgricola.canasta.depositarMazorca(
              VARIEDADES_MAIZ[tipoVar],
              undefined,
              s.meta?.calidad ?? 0.9
            );
          }
        }
      }
    }

    if (p.misiones) misionesSistema?.restaurarSnapshot(p.misiones);
    else misionesSistema?.reiniciar();

    if (Array.isArray(p.fogonPlatos)) fogonCocina?.restaurarPlatos(p.fogonPlatos);
    else fogonCocina?.reiniciar();

    if (p.directorEventos) directorEventos?.restaurarSnapshot(p.directorEventos);
    else directorEventos?.reiniciar();

    if (Array.isArray(p.codiceIds)) codiceMaiz?.restaurarDesbloqueadas(p.codiceIds);
    if (Array.isArray(p.bancoLotes) && p.bancoLotes.length > 0) {
      bancoSemillas?.restaurarSnapshot(p.bancoLotes, p.bancoLoteActivo ?? 0);
    }
    logroPrimeraCosechaMostrado = !!p.logroPrimeraCosecha;

    aplicarConfigMundo();
    malezaSistema?.actualizarThinInstances();
    triadaViva?.actualizarVisuales();
    hotbarPixel?.actualizarVisual();
    actualizarContadoresHUDMazorcas();
    sincronizarNodoConUI();
    prepararEntradaAlSurco();
    uiEdu?.mostrarToast(`🌍 Mundo cargado: ${nombreMundoActivo} (Día ${Math.floor(p.diaMaximo || 0)})`);
  }

  menuPrincipal = new MenuPrincipalMinecraft({
    onCrearPartida: (opts) => {
      idMundoActivo = `mundo-${Date.now().toString(36)}`;
      nombreMundoActivo = opts.nombre;
      dificultadMundo = opts.dificultad;
      presetClimaMundo = opts.presetClima;
      semillaMundoStr = opts.semillaMundo;

      Object.assign(clima, climaDesdePreset(opts.presetClima));
      cicloSolarAuto = true;
      panelClima?.actualizarEstadoCicloSolar(true);
      paneles?.actualizarEstadoCicloSolar(true);
      metricas = calcularMetricas(clima);
      ambiente?.aplicarClima(clima, metricas);
      panelClima?.actualizarValoresUI();

      limpiarEstadoMundo(false);
      hotbarPixel?.seleccionarSlot(1);
      guardarPartidaActual();
      prepararEntradaAlSurco();
      uiEdu?.mostrarToast(`🌱 ¡Nueva partida creada: "${nombreMundoActivo}" (${opts.dificultad})!`);
    },
    onCargarPartida: (partida) => {
      aplicarPartidaGuardada(partida);
    },
    onAbrirControles: () => {
      controladorJugador?.liberarPuntero();
      modalControles?.mostrar();
    },
    onAbrirAjustes: () => {
      controladorJugador?.liberarPuntero();
      ajustesSistema?.toggleModal();
    }
  });
  (window as any).menuPrincipal = menuPrincipal;

  menuPausa = new MenuPausaMinecraft({
    onReanudar: () => {
      hotbarPixel?.mostrarNombreActual();
    },
    onGuardar: () => {
      const ok = guardarPartidaActual();
      if (ok) uiEdu?.mostrarToast(`💾 Partida "${nombreMundoActivo}" guardada.`);
      return ok;
    },
    onAbrirDispensador: () => {
      controladorJugador?.liberarPuntero();
      dispensadorSemillas?.abrir();
    },
    onAbrirControles: () => {
      controladorJugador?.liberarPuntero();
      modalControles?.mostrar();
    },
    onAbrirAjustes: () => {
      controladorJugador?.liberarPuntero();
      ajustesSistema?.toggleModal();
    },
    onReiniciar: () => {
      limpiarEstadoMundo(false);
      uiEdu?.mostrarToast("🌱 ¡Parcela reiniciada!");
    },
    onGuardarYSalir: () => {
      guardarPartidaActual();
      estadoEdu.reproduciendoCrecimiento = false;
      estadoCrecimiento.timeLapseActivo = false;
      hotbarPixel?.actualizarEstadoCrecimiento(false);
      setHudJuegoVisible(false);
      if (controladorJugador?.modo === "fps") {
        controladorJugador.alternarModo();
      }
      enfocarCamara(-Math.PI * 0.68, 1.18, 22.5, new Vector3(3.0, 1.8, 1.5));
      menuPrincipal?.mostrar();
    }
  });
  (window as any).menuPausa = menuPausa;

  // En el arranque con Menú Principal visible, iniciar en cámara orbital panorámica sin HUD ni arma en mano
  setHudJuegoVisible(false);
  if (controladorJugador?.modo === "fps") {
    controladorJugador.alternarModo();
  }

  // Inicializar texto de misión activa, dificultad/semilla e inventario en UI
  aplicarConfigMundo();
  if (misionesSistema.onActualizarUI) misionesSistema.onActualizarUI();
  actualizarContadoresHUDMazorcas();

  // L. Bucle de renderizado y simulación en tiempo real (Zero-GC en el bucle crítico)
  let tiempoAcumulado = 0;
  let fpsTimer = 0;
  let frameCount = 0;
  let timerThinSync = 0;

  scene.registerBeforeRender(() => {
    const dt = Math.min(0.1, engine.getDeltaTime() * 0.001);
    tiempoAcumulado += dt;
    timerThinSync += dt;

    const menuActivo = !!menuPrincipal?.estaAbierto();
    const juegoPausado = menuActivo || !!menuPausa?.estaAbierto();
    if (ajustesSistema) ajustesSistema.pausado = juegoPausado;

    fpsTimer += dt;
    frameCount++;
    if (fpsTimer >= 0.5) {
      const fps = Math.round(frameCount / fpsTimer);
      paneles?.actualizarFps(fps);
      fpsTimer = 0;
      frameCount = 0;
    }

    if (menuActivo && camaraPrincipal && !objetivoCamara) {
      camaraPrincipal.alpha += dt * 0.06;
    }

    // 1. Crecimiento dinámico continuo si está activo
    if (!juegoPausado && estadoEdu.reproduciendoCrecimiento && surcoMilpa) {
      const dtDias = dt * 3.5;
      surcoMilpa.avanzarSimulacion(
        dtDias,
        clima,
        metricas,
        directorEventos?.obtenerSeveridadActiva(),
        obtenerFactorDificultadMaleza()
      );
      if (timerThinSync > 0.35) {
        timerThinSync = 0;
        malezaSistema?.actualizarThinInstances();
        triadaViva?.actualizarVisuales();
        sincronizarNodoConUI();
        const diaMax = Math.max(...surcoMilpa.nodos.map((n) => n.diasCultivo || 0), 0);
        const dia = Math.floor(diaMax);
        misionesSistema?.actualizarCalendarioRitual(dia);
        directorEventos?.evaluarDiaSimulado(dia);
      }
    }

    // 2. Simulación Time-Lapse científica tradicional (si las consolas 3D están activas)
    if (!juegoPausado && estadoCrecimiento.timeLapseActivo) {
      const dtDias = dt * estadoCrecimiento.velocidadDiasPorSeg;
      clima.hora = (clima.hora + dtDias * 24.0) % 24.0;
      paneles?.actualizarControlClima("hora", clima);
      panelClima?.actualizarValoresUI();

      irADia(estadoCrecimiento, estadoCrecimiento.dia + dtDias, clima);
      metricas = calcularMetricas(clima);

      ambiente?.aplicarClima(clima, metricas);
      surcoMilpa?.avanzarSimulacion(
        dtDias,
        clima,
        metricas,
        directorEventos?.obtenerSeveridadActiva(),
        obtenerFactorDificultadMaleza()
      );
      malezaSistema?.actualizarThinInstances();
      triadaViva?.actualizarVisuales();
      paneles?.actualizarConsola(estadoCrecimiento, clima);
      paneles?.actualizarTelemetria(metricas, estadoCrecimiento);
    } else if (!juegoPausado && cicloSolarAuto) {
      clima.hora = (clima.hora + dt * VELOCIDAD_CICLO_MINECRAFT) % 24.0;
      metricas = calcularMetricas(clima);
      ambiente?.aplicarClima(clima, metricas);
      acumuladorUISolar += dt;
      if (acumuladorUISolar >= 0.25) {
        acumuladorUISolar = 0;
        paneles?.actualizarControlClima("hora", clima);
        panelClima?.actualizarValoresUI();
        paneles?.actualizarTelemetria(metricas, estadoCrecimiento);
      }
    }

    // 3. Animación de nubes, molino, animales de granja y oscilación biomecánica por viento
    ambiente?.animar(dt, clima.viento);
    surcoMilpa?.animarViento(tiempoAcumulado, clima.viento);
    if (carritoAgricola) {
      carritoAgricola.actualizar(dt);
      actualizarCaja(
        "carritoAgricola",
        carritoAgricola.root.position.x,
        carritoAgricola.root.position.z,
        1.24,
        0.62
      );
    }

    // 4. Posición de la cámara activa (XR o FPS/Orbital)
    const enXR =
      xrExperience &&
      xrExperience.baseExperience &&
      xrExperience.baseExperience.state === WebXRState.IN_XR;
    const camActiva = enXR
      ? xrExperience!.baseExperience.camera
      : controladorJugador?.modo === "fps"
      ? controladorJugador.camaraFPS
      : camaraPrincipal;
    const posJugador = camActiva ? camActiva.position : Vector3.Zero();

    // 5. Actualización de sistemas VR 6DoF, Cinturón, Reloj de Muñeca y UI Poke (M1, M2, M13)
    if (!juegoPausado) {
      interaccion6DoF?.actualizar(dt);
      if (camActiva && interaccion6DoF) {
        const yaw = controladorJugador ? controladorJugador.camaraFPS.rotation.y : 0;
        cinturonVR?.actualizar(dt, posJugador, yaw, interaccion6DoF.obtenerManoDominante());
        uiPoke?.actualizar(interaccion6DoF.manoIzq, interaccion6DoF.manoDer);
        if (surcoMilpa) {
          const nodoSel = surcoMilpa.nodos[surcoMilpa.nodoSeleccionadoId];
          const alerta = directorEventos?.eventoActual
            ? `Evento: ${directorEventos.eventoActual.toUpperCase()}`
            : "";
          relojMuneca?.actualizar(
            interaccion6DoF.obtenerManoNoDominante(),
            posJugador,
            nodoSel,
            alerta,
            ajustesSistema ? ajustesSistema.valores.daltonico : false
          );
        }
      }
    }

    // 6. Actualización de Fauna, Drops de Mazorcas, Eventos Climáticos, Contornos LOD (H10) y Paisaje Sonoro (M12)
    if (controladorJugador) {
      const esFPS = controladorJugador.modo === "fps";
      if (interaccion6DoF) interaccion6DoF.modoFPSActivo = esFPS;
      if (locomocionVR) locomocionVR.modoFPSActivo = esFPS;
    }
    if (!juegoPausado) {
      sistemaDrops?.actualizar(dt);
      faunaMilpa?.actualizar(dt, interaccion6DoF?.manoIzq, interaccion6DoF?.manoDer);
      directorEventos?.actualizar(dt);
      surcoMilpa?.actualizarContornos(dt, posJugador);
      audioSintetizador?.actualizarListener(posJugador);
      audioSintetizador?.actualizarPaisajeSonoro(dt, clima.hora, clima.lluvia);
    }
    if (enXR) {
      ajustesSistema?.verificarAlturaCabezaXR(posJugador.y);
    }
    ajustesSistema?.actualizar(dt);

    // 7. Espantapájaros guía, mesa de clima y jugador en primera persona
    espantapajaros?.animar(tiempoAcumulado, clima.viento, posJugador);
    mesaClimaPrejuego?.animar(tiempoAcumulado, dt);
    dispensadorSemillas?.animar(tiempoAcumulado);
    if (!enXR) {
      controladorXbox?.actualizar(dt);
      if (!juegoPausado) {
        controladorJugador?.actualizar(dt);
      }
    }
    herramientas3D?.animarIdle(tiempoAcumulado);

    // 8. Interpolación suave de cámara orbital
    if (objetivoCamara && camaraPrincipal) {
      const k = Math.min(1.0, dt * 6.0);
      camaraPrincipal.alpha += (objetivoCamara.alpha - camaraPrincipal.alpha) * k;
      camaraPrincipal.beta += (objetivoCamara.beta - camaraPrincipal.beta) * k;
      camaraPrincipal.radius += (objetivoCamara.radius - camaraPrincipal.radius) * k;
      camaraPrincipal.target = Vector3.Lerp(camaraPrincipal.target, objetivoCamara.target, k);

      if (
        Math.abs(camaraPrincipal.radius - objetivoCamara.radius) < 0.05 &&
        Vector3.Distance(camaraPrincipal.target, objetivoCamara.target) < 0.05
      ) {
        objetivoCamara = null;
      }
    }
  });

  // M. Estado inicial (sincronizar Hotbar -> Viewmodel -> EstadoEducativo en Azada [2])
  ambiente.aplicarClima(clima, metricas);
  ambiente.actualizarHumedadVisual(Math.min(100, Math.max(0, (clima.humedadSuelo / 55) * 100)));
  ambiente.estiloPatrix.unificarMaterialesRestantes();
  ambiente.estiloPatrix.vincularCamara(camera);
  ambiente.estiloPatrix.vincularCamara(controladorJugador.camaraFPS);
  ambiente.estiloPatrix.refrescarIBL();
  irADia(estadoCrecimiento, 0, clima);
  maiz.root.setEnabled(false);

  function seleccionarHerramientaHotbar(h: HerramientaTipo, _nombre: string): void {
    estadoEdu.herramientaSeleccionada = h;
    if (interaccion6DoF) interaccion6DoF.herramientaActiva = h;
    controladorJugador?.equipar(h);
    cinturonVR?.seleccionar(h);
    uiEdu?.actualizarUI();

    // Únicamente el amuleto Sol (+15d) dispara al seleccionarse desde la barra; las demás herramientas se equipan sin auto-dispararse
    if (h === "sol") {
      avanzarDiasConAutopausa(15);
    }
  }

  hotbarPixel?.seleccionarSlot(1);

  // N. Atajos de teclado completos estilo Minecraft (Hotbar 1-9 + Almacén [I] + Ficha [L] + Ecosistema v4.0)
  window.addEventListener("keydown", async (ev) => {
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if (ev.code === "Escape") {
      if (uiEdu?.estaTrofeoAbierto()) {
        uiEdu.cerrarTrofeo();
        return;
      }
      if (fichaCultivo?.estaAbierto()) {
        fichaCultivo.cerrar();
        return;
      }
      if (modalControles?.estaAbierto()) {
        modalControles.ocultar();
        return;
      }
      if (modalCofreTroje?.estaAbierto) {
        modalCofreTroje.cerrar();
        return;
      }
      const modalsPorId = [
        "dispensadorSemillasModal",
        "fogonCocinaModal",
        "bancoSemillasModal",
        "codiceMaizModal",
        "almacenMazorcasModal",
        "modalAjustesVR"
      ];
      for (const id of modalsPorId) {
        const mEl = document.getElementById(id);
        if (mEl && getComputedStyle(mEl).display !== "none") {
          mEl.style.display = "none";
          return;
        }
      }
      const climaCard = document.querySelector(".panel-clima-card.visible");
      if (climaCard) {
        panelClima?.toggle();
        return;
      }
      if (menuPrincipal?.estaAbierto()) {
        return;
      }
      if (menuPausa?.estaAbierto()) {
        menuPausa.ocultar(true);
      } else {
        controladorJugador?.liberarPuntero();
        menuPausa?.abrir(nombreMundoActivo);
      }
      return;
    }

    if (menuPrincipal?.estaAbierto() || menuPausa?.estaAbierto()) {
      return;
    }

    const kLow = ev.key.toLowerCase();

    // Si hay un modal abierto, solo permitir cerrarlo con su propio atajo (o [Esc] arriba); bloquear atajos de parcela
    if (controladorJugador?.hayModalAbierto()) {
      if (kLow === "i" && modalCofreTroje?.estaAbierto) modalCofreTroje.cerrar();
      else if (kLow === "l" && fichaCultivo?.estaAbierto()) fichaCultivo.cerrar();
      else if (kLow === "u" && dispensadorSemillas?.estaAbierto()) dispensadorSemillas.cerrar();
      else if (kLow === "c" && document.querySelector(".panel-clima-card.visible")) panelClima?.toggle(false);
      else if (kLow === "f" && document.getElementById("fogonCocinaModal")?.style.display !== "none") fogonCocina?.alternarModal();
      else if (kLow === "m" && document.getElementById("bancoSemillasModal")?.style.display !== "none") bancoSemillas?.alternarModal();
      else if (kLow === "k" && document.getElementById("codiceMaizModal")?.style.display !== "none") codiceMaiz?.alternarModal();
      else if (kLow === "o" && document.getElementById("modalAjustesVR")?.style.display !== "none") ajustesSistema?.toggleModal();
      else if ((ev.key === "?" || ev.key === "/" || ev.code === "F1") && modalControles?.estaAbierto()) {
        ev.preventDefault();
        modalControles.ocultar();
      }
      return;
    }

    if (ev.code === "Space") {
      ev.preventDefault();
      if (controladorJugador?.modo !== "fps") {
        estadoEdu.reproduciendoCrecimiento = !estadoEdu.reproduciendoCrecimiento;
        hotbarPixel?.actualizarEstadoCrecimiento(estadoEdu.reproduciendoCrecimiento);
        uiEdu?.actualizarUI();
      }
    } else if (kLow === "j") {
      const algunSembrado = surcoMilpa?.nodos.some((n) => n.sembrada) ?? false;
      if (!algunSembrado && !estadoEdu.semillaSembrada) {
        uiEdu?.mostrarToast("¡Primero siembra una semilla para iniciar el crecimiento continuo!");
        return;
      }
      estadoEdu.reproduciendoCrecimiento = !estadoEdu.reproduciendoCrecimiento;
      hotbarPixel?.actualizarEstadoCrecimiento(estadoEdu.reproduciendoCrecimiento);
      uiEdu?.actualizarUI();
      uiEdu?.mostrarToast(
        estadoEdu.reproduciendoCrecimiento
          ? "▶ Crecimiento continuo activado ([J] para pausar)"
          : "⏸ Crecimiento continuo en pausa"
      );
    } else if (kLow === "q" || ev.code === "Delete" || ev.code === "Backspace") {
      ev.preventDefault();
      ejecutarQuitarPlanta();
    } else if (ev.key >= "1" && ev.key <= "9") {
      const idx = parseInt(ev.key, 10) - 1;
      hotbarPixel?.seleccionarSlot(idx);
    } else if (ev.key === "0" || ev.key === "`") {
      hotbarPixel?.seleccionarSlot(0);
    } else if (kLow === "i") {
      controladorJugador?.liberarPuntero();
      modalCofreTroje?.alternar();
    } else if (kLow === "l") {
      controladorJugador?.liberarPuntero();
      const nodoSel = surcoMilpa?.nodos[surcoMilpa.nodoSeleccionadoId];
      if (nodoSel) fichaCultivo?.alternar(nodoSel, clima);
    } else if (kLow === "u") {
      controladorJugador?.liberarPuntero();
      if (dispensadorSemillas?.estaAbierto()) dispensadorSemillas.cerrar();
      else dispensadorSemillas?.abrir();
    } else if (kLow === "y") {
      avanzarDiasConAutopausa(15);
    } else if (kLow === "x") {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      malezaSistema?.deshierbarNodo(id, 0.6);
      faunaMilpa?.limpiarPlagasEnNodo(id);
    } else if (kLow === "p") {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      polinizacionSistema?.polinizarManual(id);
    } else if (kLow === "b") {
      ejecutarAccion("frijol");
    } else if (kLow === "n") {
      ejecutarAccion("calabaza");
    } else if (kLow === "t") {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarTutor(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    } else if (kLow === "g") {
      const id = surcoMilpa ? surcoMilpa.nodoSeleccionadoId : 0;
      const res = surcoMilpa?.colocarProteccion(id);
      if (res) uiEdu?.mostrarToast(res.mensaje);
    } else if (kLow === "f") {
      controladorJugador?.liberarPuntero();
      fogonCocina?.alternarModal();
    } else if (kLow === "m") {
      controladorJugador?.liberarPuntero();
      bancoSemillas?.alternarModal();
    } else if (kLow === "k") {
      controladorJugador?.liberarPuntero();
      codiceMaiz?.alternarModal();
    } else if (kLow === "o") {
      controladorJugador?.liberarPuntero();
      ajustesSistema?.toggleModal();
    } else if (kLow === "e") {
      if (controladorJugador?.tipoObjetivoEnfocado === "almacen" || controladorJugador?.tipoObjetivoEnfocado === "canasta") {
        controladorJugador.liberarPuntero();
        modalCofreTroje?.alternar();
      } else if (controladorJugador?.tipoObjetivoEnfocado === "dispensador") {
        controladorJugador.liberarPuntero();
        dispensadorSemillas?.abrir();
      } else if (controladorJugador?.tipoObjetivoEnfocado === "fogon") {
        fogonCocina?.avanzarPasoInteractivo();
      } else if (controladorJugador?.tipoObjetivoEnfocado === "banco") {
        controladorJugador.liberarPuntero();
        bancoSemillas?.alternarModal();
      } else if (controladorJugador?.tipoObjetivoEnfocado === "codice") {
        controladorJugador.liberarPuntero();
        codiceMaiz?.alternarModal();
      } else if (controladorJugador?.tipoObjetivoEnfocado === "mesa_clima") {
        const resClima = mesaClimaPrejuego?.interactuarConMalla(controladorJugador.meshEnfocadoNombre);
        if (resClima?.mensaje) uiEdu?.mostrarToast(resClima.mensaje);
      } else if (
        controladorJugador?.tipoObjetivoEnfocado === "nodo" ||
        controladorJugador?.tipoObjetivoEnfocado === "drop_mazorca" ||
        controladorJugador?.tipoObjetivoEnfocado === "maleza" ||
        controladorJugador?.tipoObjetivoEnfocado === "fauna" ||
        controladorJugador?.tipoObjetivoEnfocado === "triada_cosecha"
      ) {
        controladorJugador.usarHerramientaActiva();
      } else {
        espantapajaros?.compartirSiguienteDato();
      }
    } else if (kLow === "v") {
      controladorJugador?.alternarModo();
    } else if (ev.key === "Tab") {
      ev.preventDefault();
      if (surcoMilpa && locomocionVR) {
        const nextId = (surcoMilpa.nodoSeleccionadoId + 1) % surcoMilpa.nodos.length;
        locomocionVR.teletransportarANodo(nextId);
        const nodo = surcoMilpa.nodos[nextId];
        const varCfg = VARIEDADES_MAIZ[nodo.variedad];
        sincronizarNodoConUI();
        uiEdu?.mostrarToast(`👉 Estación ${nextId + 1}: ${varCfg.nombre}`);
        espantapajaros?.decir(`Cambiamos a la estación ${nextId + 1}: ${varCfg.nombre}.`);
      }
    } else if (kLow === "z") {
      if (locomocionVR) {
        if (locomocionVR.enLobby) {
          locomocionVR.teletransportarANodo(0);
        } else {
          locomocionVR.teletransportarALobby();
          espantapajaros?.decir(
            "Regresaste al cobertizo. Visita la Mesa de Clima, el Fogón [F], el Banco de Semillas [M] o el Códice [K]."
          );
        }
      }
    } else if (ev.code === "Enter") {
      if (locomocionVR?.enLobby) {
        locomocionVR.teletransportarANodo(0);
        uiEdu?.mostrarToast("🌱 ¡Entraste al surco de siembra!");
      }
    } else if (kLow === "c") {
      controladorJugador?.liberarPuntero();
      panelClima?.toggle();
    } else if (kLow === "h") {
      const vis = !paneles?.refs.panelConsolaMesh.isEnabled();
      paneles?.setVisible(vis);
    } else if (ev.key === "?" || ev.key === "/" || ev.code === "F1") {
      ev.preventDefault();
      controladorJugador?.liberarPuntero();
      modalControles?.alternar();
    } else if (kLow === "r") {
      if (camaraPrincipal) {
        camaraPrincipal.useAutoRotationBehavior = !camaraPrincipal.useAutoRotationBehavior;
      }
    }
  });

  return scene;
}

// ---------------------------------------------------------------------------
// 3. Arranque de la aplicación
// ---------------------------------------------------------------------------
const loadingScreen = document.getElementById("loading-screen");

let pantallaOculta = false;
function ocultarPantallaCarga(): void {
  if (pantallaOculta) return;
  pantallaOculta = true;
  if (loadingScreen) {
    loadingScreen.style.opacity = "0";
    loadingScreen.style.pointerEvents = "none";
    setTimeout(() => {
      try {
        loadingScreen.remove();
      } catch (_) {}
    }, 350);
  }
}

crearEscena()
  .then((scene) => {
    // 1. Ocultar pantalla de carga inmediatamente tras el primer fotograma 3D renderizado
    scene.onAfterRenderObservable.addOnce(() => {
      ocultarPantallaCarga();
    });

    // 2. Respaldo si executeWhenReady dispara
    scene.executeWhenReady(() => {
      ocultarPantallaCarga();
    });

    // 3. Respaldo por temporizador de seguridad (máximo 400 ms) para garantizar que nunca se quede trabado
    setTimeout(ocultarPantallaCarga, 400);

    engine.runRenderLoop(() => {
      scene.render();
    });
  })
  .catch((err) => {
    console.error("Error al iniciar escena Babylon:", err);
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div class="loading-card" style="border-color: #ef4444;">
          <div style="font-size: 42px; margin-bottom: 8px;">⚠️</div>
          <h1 class="loading-title" style="color: #ef4444;">Error al Iniciar la Simulación 3D</h1>
          <p class="loading-desc" style="color: #fca5a5;">${err?.message || err}</p>
          <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 16px;">
            Asegúrate de que tu navegador tenga habilitada la aceleración por hardware (WebGL 2.0).
          </p>
          <button onclick="location.reload()" style="background:#22c55e; color:#fff; border:2px solid #000; padding:10px 20px; font-weight:bold; cursor:pointer; font-family:inherit; font-size:14px;">
            🔄 Reintentar
          </button>
        </div>
      `;
    }
  });

window.addEventListener("resize", () => {
  engine.resize();
});
