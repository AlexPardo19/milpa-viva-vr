/**
 * §8.1: Suite de Pruebas Automatizadas de Reglas y Fisiología v4.0 — «Milpa Viva VR»
 *
 * Verifica sin depender de WebGL:
 * 1. Consistencia de REGLAS_JUEGO (DIAS_COSECHA_MIN = 145, DIAS_MADUREZ = 163).
 * 2. Estabilidad genética de heredar() a lo largo de 100 generaciones en [0.80, 1.20].
 * 3. Integración de rasgosHeredados y estresBiotico en pasoDia() sin NaN.
 * 4. Determinismo del generador pseudoaleatorio Mulberry32 (crearRng).
 */

import { FreeCamera, NullEngine, Scene, Vector3 } from "@babylonjs/core";

// Polyfill ligero de OffscreenCanvas para ejecutar DynamicTexture de Babylon.js en Node.js con NullEngine
if (typeof (globalThis as any).OffscreenCanvas === "undefined") {
  (globalThis as any).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        ellipse: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
      };
    }
  };
}
import {
  REGLAS_JUEGO,
  crearPlanta,
  pasoDia,
  CFG,
  ClimaDia
} from "../src/nucleo";
import { calcularMetricas, ClimateState } from "../src/clima";
import { SurcoMilpa } from "../src/surco_milpa";
import { FaunaMilpa } from "../src/juego/fauna_milpa";
import { TriadaViva } from "../src/juego/triada_viva";
import { MalezaSistema } from "../src/juego/maleza";
import { PolinizacionSistema } from "../src/juego/polinizacion";
import { heredar, LoteSemilla } from "../src/juego/banco_semillas";
import { crearRng, smoothstep } from "../src/juego/util";
import { BusEventos } from "../src/juego/bus_eventos";

function assert(condicion: boolean, mensaje: string): void {
  if (!condicion) {
    console.error(`❌ FALLÓ: ${mensaje}`);
    process.exit(1);
  }
}

function ejecutarPruebas(): void {
  console.log("🌽 Iniciando pruebas automatizadas de Milpa Viva VR v4.0...");

  // 1. Verificar REGLAS_JUEGO (H5)
  assert(
    REGLAS_JUEGO.DIAS_COSECHA_MIN === 145,
    `DIAS_COSECHA_MIN debe ser 145, actual: ${REGLAS_JUEGO.DIAS_COSECHA_MIN}`
  );
  assert(
    REGLAS_JUEGO.DIAS_MADUREZ === 163,
    `DIAS_MADUREZ debe ser 163, actual: ${REGLAS_JUEGO.DIAS_MADUREZ}`
  );
  console.log("✅ [H5] REGLAS_JUEGO verificadas (145 / 163 días).");

  // 2. Verificar Mulberry32 y utilidades matemáticas
  const rng1 = crearRng(42);
  const rng2 = crearRng(42);
  for (let i = 0; i < 20; i++) {
    assert(rng1() === rng2(), "crearRng debe ser 100% determinista para la misma semilla");
  }
  assert(smoothstep(35, 110, 35) === 0, "smoothstep en borde inferior debe ser 0");
  assert(smoothstep(35, 110, 110) === 1, "smoothstep en borde superior debe ser 1");
  console.log("✅ [Util] PRNG determinista Mulberry32 y smoothstep verificados.");

  // 3. Verificar estabilidad genética de heredar() durante 100 generaciones (M9)
  let lote: LoteSemilla = {
    id: "Test-G1",
    raza: "Chalqueño",
    generacion: 1,
    semillaRng: 12345,
    rasgos: { rVigor: 1.0, rSequia: 1.0, rFrio: 1.0, rCiclo: 1.0, rTamano: 1.0 }
  };
  const rngGen = crearRng(987654);
  for (let g = 0; g < 100; g++) {
    lote = heredar(lote, "rSequia", rngGen);
    for (const [k, val] of Object.entries(lote.rasgos)) {
      assert(
        !Number.isNaN(val) && val >= 0.80 && val <= 1.20,
        `Rasgo ${k} fuera de rango [0.80, 1.20]: ${val}`
      );
    }
  }
  assert(lote.generacion === 101, "La generación tras 100 ciclos debe ser 101");
  assert(lote.rasgos.rSequia >= 1.05, "El enfoque direccional en rSequia debe elevar el rasgo");
  console.log(`✅ [M9] Herencia campesina estable tras 100 generaciones (rSequia=${lote.rasgos.rSequia}).`);

  // 4. Verificar fisiología pasoDia() con rasgosHeredados y estresBiotico (M4, M9)
  const planta = crearPlanta("azul", "frijol");
  planta.estado = "VIVA";
  planta.rasgosHeredados = { rVigor: 1.15, rSequia: 1.15, rFrio: 1.10, rCiclo: 1.05, rTamano: 1.12 };

  const climaOptimo: ClimaDia = {
    tMax: 27,
    tMin: 15,
    tMed: 21,
    tSuelo: 19,
    hr: 65,
    vwc: 30,
    ph: 6.6,
    viento: 2.5,
    lluvia: 4,
    co2: 415,
    presion: 780,
    horasBajoMenos2_5: 0,
    estresBiotico: 0.1
  };

  for (let d = 0; d < 150; d++) {
    pasoDia(planta, climaOptimo, CFG);
  }
  assert(!Number.isNaN(planta.gdd) && planta.gdd > 1200, `GDD inválido tras 150 días: ${planta.gdd}`);
  assert(planta.vigor > 0.5 && planta.vigor <= 1.0, `Vigor fuera de rango: ${planta.vigor}`);
  assert(planta.limiteAlcanzado === true, "La planta debe haber alcanzado su límite vegetativo de altura");
  console.log(`✅ [Núcleo] Simulación de 150 días completada (GDD=${Math.round(planta.gdd)}, Vigor=${planta.vigor.toFixed(2)}, Techo=${planta.alturaTecho.toFixed(2)}m).`);

  // 5. Verificar límite real de crecimiento, secado y muerte diferencial por clima de cada variedad
  const pRojoSeq = crearPlanta("rojo", "ninguno");
  const pChalqSeq = crearPlanta("chalqueno", "ninguno");
  pRojoSeq.estado = "VIVA";
  pChalqSeq.estado = "VIVA";
  const climaSequia: ClimaDia = {
    ...climaOptimo,
    vwc: 10.5, // Bajo el PMP de Chalqueño (12%), pero sobre el PMP de Maíz Rojo (8.5%)
    hr: 28,
    lluvia: 0
  };
  for (let d = 0; d < 10; d++) {
    pasoDia(pRojoSeq, climaSequia, CFG);
    pasoDia(pChalqSeq, climaSequia, CFG);
  }
  assert(pChalqSeq.estado === "MUERTA" && pChalqSeq.causaMuerte === "sequia", "Chalqueño debe morir por sequía severa a 10.5% VWC");
  assert(pRojoSeq.estado === "VIVA", "Maíz Rojo debe resistir la misma ventana de sequía gracias a su adaptación de secano");

  // Helada: Azul (res=0.95) vs Rojo (res=0.45)
  const pAzulHel = crearPlanta("azul", "ninguno");
  const pRojoHel = crearPlanta("rojo", "ninguno");
  pAzulHel.estado = "VIVA";
  pRojoHel.estado = "VIVA";
  pAzulHel.gdd = 600;
  pRojoHel.gdd = 600;
  const climaHelada: ClimaDia = {
    ...climaOptimo,
    tMax: 12,
    tMin: -3.2,
    tMed: 4.4,
    horasBajoMenos2_5: 3.5
  };
  pasoDia(pAzulHel, climaHelada, CFG);
  pasoDia(pRojoHel, climaHelada, CFG);
  assert(pRojoHel.estado === "MUERTA" && pRojoHel.causaMuerte === "helada", "Maíz Rojo debe morir ante helada de -3.2 °C");
  assert(pAzulHel.estado === "VIVA", "Maíz Azul de alta montaña debe sobrevivir helada de -3.2 °C");

  // Agotamiento post-madurez (zacate seco al superar límite del ciclo)
  for (let d = 0; d < 85; d++) {
    pasoDia(planta, climaOptimo, CFG);
  }
  assert(
    planta.estado === "MUERTA" && planta.causaMuerte === "agotamiento" && planta.secado === 1.0,
    "La planta no cosechada tras exceder su ciclo completo debe secarse y morir por agotamiento"
  );
  console.log("✅ [Clima/Variedades] Límite de altura, secado progresivo y muerte diferencial por raza verificados.");

  // 6. Verificar BusEventos tipado
  const bus = new BusEventos();
  let recibidos = 0;
  bus.suscribir((ev) => {
    if (ev.t === "cocinado" && ev.receta === "tortilla_azul") {
      recibidos++;
    }
  });
  bus.emitir({ t: "cocinado", receta: "tortilla_azul", calidad: 0.95 });
  assert(recibidos === 1, "BusEventos debe entregar el evento suscrito exactamente una vez");
  console.log("✅ [BusEventos] Pub/Sub tipado verificado.");

  // 7. Pruebas integrales de escena 3D (NullEngine): Todas las acciones, conflictos, muerte sin objetos flotantes y Quitar Planta
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("camTest", new Vector3(0, 2, -5), scene);
  const audioMock: any = {
    clickUI: () => {},
    palmada: () => {},
    abeja: () => {},
    pajaro: () => {},
    cosecharExito: () => {},
    ararTierra: () => {},
    campanita: () => {}
  };

  const surco = new SurcoMilpa(scene, null, null);
  const fauna = new FaunaMilpa(scene, surco, audioMock, bus);
  const triada = new TriadaViva(scene, surco, null, audioMock, bus);
  const maleza = new MalezaSistema(scene, surco, null, audioMock, bus);
  const polinizacion = new PolinizacionSistema(surco, null, audioMock, bus);

  // 7a. Verificar bloqueos de acciones en estación sin sembrar (Conflictos)
  assert(surco.sembrar(0).exito === false, "No debe permitir sembrar antes de arar al 100%");
  assert(surco.sembrarAsociado(0, "frijol").exito === false, "No debe permitir asociar frijol sin maíz sembrado");
  assert(surco.colocarTutor(0).exito === false, "No debe permitir colocar tutor sin planta sembrada");
  assert(surco.colocarProteccion(0).exito === false, "No debe permitir colocar petate sin planta sembrada");
  assert(polinizacion.polinizarManual(0).exito === false, "No debe permitir polinizar sin planta sembrada");
  assert(surco.quitarPlanta(0).exito === false, "No debe permitir quitar planta en estación vacía");

  // 7b. Flujo completo de acciones: Arar -> Sembrar -> Asociar -> Tutor/Petate -> Regar -> Abonar -> Crecer -> Polinizar -> Cosechar
  surco.arar(0, 1.0);
  surco.arar(0, 1.0);
  const resArar = surco.arar(0, 1.0);
  assert(resArar.exito && surco.nodos[0].tierraArada === 100, "Tierra debe llegar a 100% tras 3 golpes de azada");

  const resSembrar = surco.sembrar(0, "palomero");
  assert(resSembrar.exito && surco.nodos[0].sembrada, "Debe sembrar Maíz Palomero exitosamente");
  assert(surco.sembrarAsociado(0, "frijol").exito, "Debe permitir asociar frijol con maíz vivo");
  assert(surco.sembrarAsociado(0, "calabaza").exito, "Debe permitir asociar calabaza con maíz vivo");
  assert(surco.colocarTutor(0).exito && surco.nodos[0].tutorado === true, "Debe activar rodrigón tutor");
  assert(surco.colocarProteccion(0, 1).exito && surco.nodos[0].proteccion === 1, "Debe activar petate térmico");
  assert(surco.regar(0).exito, "Debe regar correctamente");
  assert(surco.abonar(0).exito, "Debe abonar correctamente");

  triada.actualizarVisuales();
  maleza.actualizarThinInstances();

  const climaSim: ClimateState = {
    temperatura: 23,
    humedad: 65,
    presion: 780,
    hora: 12,
    nubosidad: 20,
    lluvia: 2,
    viento: 2.5,
    humedadSuelo: 28,
    phSuelo: 6.6,
    co2: 415,
    pm25: 12
  };
  for (let paso = 0; paso < 5; paso++) {
    surco.avanzarSimulacion(15, climaSim, calcularMetricas(climaSim));
    if (surco.nodos[0].humedadVWC < 24) surco.regar(0, 8);
    if (surco.nodos[0].nutrientesNPK < 45) surco.abonar(0, 15);
    if (surco.nodos[0].maleza > 20) maleza.deshierbarNodo(0, 0.6);
  }
  assert(polinizacion.polinizarManual(0).exito, "Debe permitir polinizar en etapa reproductiva (VT/R1)");

  for (let paso = 0; paso < 5; paso++) {
    surco.avanzarSimulacion(15, climaSim, calcularMetricas(climaSim));
    if (surco.nodos[0].humedadVWC < 24) surco.regar(0, 8);
    if (surco.nodos[0].maleza > 20) maleza.deshierbarNodo(0, 0.6);
  }
  assert(surco.nodos[0].maiz.ears.length >= 2, "Maíz Palomero maduro debe renderizar múltiples mazorcas puntiagudas");
  const resCosecha0 = surco.cosechar(0);
  assert(resCosecha0.exito, "Debe permitir cosechar la planta madura en estación 1");

  // Verificar que reconstruir MaizEstilizado no fuga nodos huérfanos en plantNode
  surco.nodos[0].maiz.construir(5.5, 8, true, true, 1.0, 3, 0.1, "#fff3b0", "#c8873a", true, 1.0, 0.2);
  const hijosAntes = surco.nodos[0].maiz.plantNode.getChildren().length;
  surco.nodos[0].maiz.construir(5.5, 8, true, true, 1.0, 3, 0.1, "#fff3b0", "#c8873a", true, 1.0, 0.2);
  const hijosDespues = surco.nodos[0].maiz.plantNode.getChildren().length;
  assert(
    hijosAntes === hijosDespues,
    `MaizEstilizado.construir() no debe fugar nodos huérfanos (${hijosAntes} vs ${hijosDespues})`
  );
  // Verificar que las raíces de anclaje (braceRoots) están emparentadas a root y no a plantNode
  for (const r of surco.nodos[0].maiz.braceRoots) {
    assert(r.parent === surco.nodos[0].maiz.root, "Las raíces zanco deben estar ancladas a maiz.root para no flotar al inclinarse");
  }

  // 7c. Verificar que al morir una planta NO quedan partículas/esferas de fauna ni enredaderas flotando
  surco.arar(1, 1.4);
  surco.arar(1, 1.4);
  surco.arar(1, 1.4);
  surco.sembrar(1, "chalqueno");
  surco.sembrarAsociado(1, "frijol");
  // Crecer hasta etapa V4+ para que el meristemo apical esté expuesto a la helada
  surco.avanzarSimulacion(25, climaSim, calcularMetricas(climaSim));
  triada.actualizarVisuales();

  // Forzar un agente de fauna activo sobre el nodo 1
  fauna.pool[0].estado = "ACTUANDO";
  fauna.pool[0].nodoObjetivo = 1;
  fauna.pool[0].raiz.setEnabled(true);
  assert(fauna.contarActivos() === 1, "Debe haber 1 agente de fauna activo antes de la muerte");

  // Provocar muerte por helada severa en nodo 1
  const climaHeladaSevera: ClimateState = {
    ...climaSim,
    temperatura: -4,
    lluvia: 0
  };
  surco.avanzarSimulacion(5, climaHeladaSevera, calcularMetricas(climaHeladaSevera), 2);
  assert(surco.nodos[1].plantaInterna.estado === "MUERTA", "La planta en estación 2 debe morir por helada severa");

  fauna.actualizar(0.1);
  triada.actualizarVisuales();
  maleza.actualizarThinInstances();

  assert(
    fauna.contarActivos() === 0 && !fauna.pool[0].raiz.isEnabled(),
    "Al morir la planta, FaunaMilpa debe desactivar y ocultar de inmediato cualquier agente para no dejar esferas flotando"
  );
  assert(
    surco.nodos[1].maleza === 0 && surco.nodos[1].plaga === 0,
    "Al morir la planta, maleza y plaga deben limpiarse a 0"
  );
  assert(
    surco.sembrarAsociado(1, "calabaza").exito === false &&
      polinizacion.polinizarManual(1).exito === false,
    "No debe permitir asociar cultivos ni polinizar sobre una planta muerta"
  );

  // 7d. Verificar acción Quitar Planta (quitarPlanta) y su animación 3D sin conflictos
  const resQuitar = surco.quitarPlanta(1);
  assert(resQuitar.exito, "quitarPlanta(1) debe retirar la planta muerta exitosamente");
  assert(
    surco.nodos[1].sembrada === false && surco.nodos[1].tierraArada === 100 && surco.nodos[1].frijolVid === 0,
    "Tras quitarPlanta(1), la estación debe quedar desocupada, limpia y con tierra 100% arada"
  );

  // Avanzar frames de la escena para completar la animación 3D de extracción
  for (let f = 0; f < 40; f++) {
    scene.render();
  }
  assert(
    surco.nodos[1].maiz.root.isEnabled() === false,
    "Al finalizar la animación 3D de quitarPlanta, maiz.root debe quedar deshabilitado y con su escala restaurada"
  );

  // Probar conflicto de concurrencia: quitarPlanta(0) e inmediatamente volver a sembrar(0) durante la animación
  const resQuitarViva = surco.quitarPlanta(0);
  assert(resQuitarViva.exito, "quitarPlanta(0) debe permitir retirar también una planta viva");
  scene.render(); // 1 frame a mitad de animación
  const resResembrarInmediato = surco.sembrar(0, "azul");
  assert(resResembrarInmediato.exito, "Debe permitir volver a sembrar inmediatamente después de quitarPlanta");
  scene.render();
  assert(
    surco.nodos[0].sembrada === true &&
      surco.nodos[0].maiz.root.isEnabled() === true &&
      Math.abs(surco.nodos[0].maiz.root.scaling.x - 0.28) < 0.001,
    "Si se siembra durante la animación de extracción, la animación anterior debe cancelarse limpiamente sin afectar la nueva planta"
  );

  scene.dispose();
  engine.dispose();
  console.log("✅ [3D/Acciones/Sin Flotantes] Todas las acciones, bloqueos de conflicto, limpieza al morir y animación de Quitar Planta verificados.");

  console.log("🎉 Todas las pruebas de Milpa Viva VR v4.0 pasaron exitosamente.");
}

ejecutarPruebas();
