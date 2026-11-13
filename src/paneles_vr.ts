/**
 * Paneles Espaciales 3D interactivos con Babylon GUI para WebXR y Escritorio
 *
 * Estilo visual Caricatura / Pergamino moderno (#2a3417 contornos, #fffce8 fondo cálido, #e8a317 acentos):
 *  - Consola Central (Ampliada a 3.4m x 2.1m):
 *      * Cabecera con Título, Botón de Rotación Automática y Contador de FPS en tiempo real.
 *      * Fila de estado: Día actual, Etapa fenológica y Regulador rápido de Viento.
 *      * Slider principal de Time-Lapse (1 a 240 días).
 *      * Controles de reproducción: Play/Pausa, Velocidades (1x, 3x, 6x, 12x) y Replantar.
 *      * 4 Tarjetas de telemetría biológica: GDD, Biomasa aérea, Altura y Vitalidad.
 *      * Alerta dinámica de daño/muerte.
 *      * 5 Botones de enfoque anatómico: 🌱 Planta, 🖥️ Consola, 🌽 Elote, 🌾 Espiga, 🪵 Raíces.
 *  - Panel Izquierdo (Ampliado a 3.2m x 3.1m):
 *      * Estación de Control Ambiental con selector de Ciclo Solar Auto.
 *      * 10 botones de Escenarios Predefinidos.
 *      * 11 Sliders grandes interactivos con etiquetas y valores numéricos en tiempo real.
 *  - Panel Derecho (Ampliado a 3.2m x 3.1m):
 *      * Barra principal de Salud Fisiológica (0-100%).
 *      * Diagnóstico agrofisiológico detallado.
 *      * Grilla de 16 Sensores Biofísicos.
 *      * 6 Barras de Progreso de Estrés Fisiológico y Biomecánico.
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  Mesh,
  MeshBuilder
} from "@babylonjs/core";
import {
  AdvancedDynamicTexture,
  StackPanel,
  Grid,
  Slider,
  TextBlock,
  Button,
  Control,
  Rectangle
} from "@babylonjs/gui";
import {
  ClimateState,
  ClimateKey,
  CLIMA_INICIAL,
  VARIABLES,
  ESCENARIOS,
  Metricas
} from "./clima";
import {
  EstadoCrecimiento,
  irADia,
  reiniciarCrecimiento,
  notificarCambioClima
} from "./crecimiento";

export interface PanelesRefs {
  panelConsolaMesh: Mesh;
  panelControlMesh: Mesh;
  panelTelemetriaMesh: Mesh;

  // Consola central
  sliderDia: Slider;
  labelDia: TextBlock;
  labelEtapa: TextBlock;
  labelFps: TextBlock;
  btnPlayPause: Button;
  btnAutoRot: Button;
  btnVelocidades: { btn: Button; vel: number }[];
  labelGdd: TextBlock;
  labelBiomasa: TextBlock;
  labelAltura: TextBlock;
  labelSaludVital: TextBlock;
  alertaMuerte: TextBlock;
  sliderVientoConsola: Slider;
  labelVientoConsola: TextBlock;

  // Panel izquierdo
  slidersClima: Map<ClimateKey, { slider: Slider; label: TextBlock; unidad: string; etiqueta: string; paso: number }>;
  btnCicloSolar: Button;

  // Panel derecho
  saludTexto: TextBlock;
  saludBarra: Rectangle;
  diagnosticoTexto: TextBlock;
  celdasSensores: Map<string, TextBlock>;
  barrasEstres: Map<string, { barra: Rectangle; valor: TextBlock }>;
}

export class PanelesVR {
  readonly scene: Scene;
  readonly refs: PanelesRefs;
  private sincronizandoSliderDia = false;
  private sincronizandoClima = false;

  private texturasGUI: AdvancedDynamicTexture[] = [];

  constructor(
    scene: Scene,
    estadoCrecimiento: EstadoCrecimiento,
    clima: ClimateState,
    metricas: Metricas,
    callbacks: {
      onClimaChange: () => void;
      onTimeLapseChange: () => void;
      onEnfocarCamara: (tipo: "planta" | "consola" | "elote" | "espiga" | "raices") => void;
      onToggleCicloSolar: () => boolean;
      onToggleRotacionAuto: () => boolean;
      getRotacionAuto: () => boolean;
    }
  ) {
    this.scene = scene;

    // 1. CONSOLA CENTRAL TIME-LAPSE (AMPLIADA)
    const { mesh: consoleMesh, consolaRefs } = this.crearConsolaCentral(
      scene,
      estadoCrecimiento,
      clima,
      callbacks
    );

    // 2. PANEL IZQUIERDO: CONTROL AMBIENTAL (AMPLIADO)
    const { mesh: leftMesh, leftRefs } = this.crearPanelControl(
      scene,
      estadoCrecimiento,
      clima,
      callbacks
    );

    // 3. PANEL DERECHO: TELEMETRÍA Y ESTRÉS (AMPLIADO)
    const { mesh: rightMesh, rightRefs } = this.crearPanelTelemetria(scene);

    this.refs = {
      panelConsolaMesh: consoleMesh,
      panelControlMesh: leftMesh,
      panelTelemetriaMesh: rightMesh,
      ...consolaRefs,
      ...leftRefs,
      ...rightRefs
    };

    // Estética pixel art: fuente pixelada y esquinas rectas en todos los controles GUI 3D
    for (const t of this.texturasGUI) {
      for (const c of t.getDescendants(false)) {
        const ctrl = c as any;
        ctrl.fontFamily = "'Pixelify Sans', monospace";
        if (typeof ctrl.cornerRadius === "number") ctrl.cornerRadius = 0;
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.refs.panelConsolaMesh.setEnabled(visible);
    this.refs.panelControlMesh.setEnabled(visible);
    this.refs.panelTelemetriaMesh.setEnabled(visible);
  }

  public actualizarFps(fps: number): void {
    if (this.refs.labelFps) {
      this.refs.labelFps.text = `${fps} FPS`;
    }
  }

  // -------------------------------------------------------------------------
  // CONSOLA CENTRAL 3D (TAMAÑO ERGONÓMICO AMPLIO: 3.4m x 2.1m)
  // -------------------------------------------------------------------------
  private crearConsolaCentral(
    scene: Scene,
    estado: EstadoCrecimiento,
    clima: ClimateState,
    cb: {
      onClimaChange: () => void;
      onTimeLapseChange: () => void;
      onEnfocarCamara: (tipo: "planta" | "consola" | "elote" | "espiga" | "raices") => void;
      onToggleRotacionAuto: () => boolean;
      getRotacionAuto: () => boolean;
    }
  ) {
    // Plano 3D ampliado y reposicionado para perfecta legibilidad
    const plane = MeshBuilder.CreatePlane("uiConsoleTimeLapse", { width: 3.8, height: 2.35 }, scene);
    plane.position = new Vector3(0, 1.25, -2.2);
    plane.rotation.x = Math.PI / 8.0;

    const tex = AdvancedDynamicTexture.CreateForMesh(plane, 1720, 1060);
    this.texturasGUI.push(tex);
    this.ajustarMaterialPlano(plane);

    const bg = new Rectangle("consoleBg");
    bg.width = "100%";
    bg.height = "100%";
    bg.cornerRadius = 24;
    bg.color = "#2a3417";
    bg.thickness = 4;
    bg.background = "rgba(255, 252, 236, 0.95)";
    tex.addControl(bg);

    const stack = new StackPanel();
    stack.width = "95%";
    stack.isVertical = true;
    bg.addControl(stack);

    // 1. FILA DE CABECERA: TÍTULO + ROTACIÓN AUTO + FPS
    const headerGrid = new Grid();
    headerGrid.height = "56px";
    headerGrid.width = "100%";
    headerGrid.addColumnDefinition(0.62); // Título
    headerGrid.addColumnDefinition(0.24); // Botón Rotación
    headerGrid.addColumnDefinition(0.14); // Badge FPS
    stack.addControl(headerGrid);

    const title = new TextBlock();
    title.text = "🌽 TIME-LAPSE & DESARROLLO FENOLÓGICO";
    title.color = "#2a3417";
    title.fontSize = 32;
    title.fontWeight = "bold";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerGrid.addControl(title, 0, 0);

    const rotActivaInicial = cb.getRotacionAuto();
    const btnAutoRot = Button.CreateSimpleButton("btnRotacion3D", rotActivaInicial ? "🔄 Rotación: ON" : "⏸ Rotación: OFF");
    btnAutoRot.width = "96%";
    btnAutoRot.height = "44px";
    btnAutoRot.cornerRadius = 10;
    btnAutoRot.fontSize = 20;
    btnAutoRot.fontWeight = "bold";
    btnAutoRot.color = rotActivaInicial ? "#0f172a" : "#2a3417";
    btnAutoRot.background = rotActivaInicial ? "#e8a317" : "rgba(42, 52, 23, 0.15)";
    btnAutoRot.onPointerUpObservable.add(() => {
      const nueva = cb.onToggleRotacionAuto();
      btnAutoRot.textBlock!.text = nueva ? "🔄 Rotación: ON" : "⏸ Rotación: OFF";
      btnAutoRot.background = nueva ? "#e8a317" : "rgba(42, 52, 23, 0.15)";
      btnAutoRot.color = nueva ? "#0f172a" : "#2a3417";
    });
    headerGrid.addControl(btnAutoRot, 0, 1);

    const lblFps = new TextBlock();
    lblFps.text = "60 FPS";
    lblFps.color = "#15803d";
    lblFps.fontSize = 22;
    lblFps.fontWeight = "bold";
    lblFps.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    headerGrid.addControl(lblFps, 0, 2);

    // 2. FILA DE INFORMACIÓN (DÍA, ETAPA Y VIENTO RÁPIDO)
    const infoGrid = new Grid();
    infoGrid.height = "52px";
    infoGrid.width = "100%";
    infoGrid.addColumnDefinition(0.32); // Día
    infoGrid.addColumnDefinition(0.36); // Etapa
    infoGrid.addColumnDefinition(0.32); // Control de Viento
    stack.addControl(infoGrid);

    const lblDia = new TextBlock();
    lblDia.text = `DÍA: ${Math.round(estado.dia)} / 240`;
    lblDia.color = "#8a5a2b";
    lblDia.fontSize = 26;
    lblDia.fontWeight = "bold";
    lblDia.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoGrid.addControl(lblDia, 0, 0);

    const lblEtapa = new TextBlock();
    lblEtapa.text = `Etapa: ${estado.etapa}`;
    lblEtapa.color = "#2a3417";
    lblEtapa.fontSize = 24;
    lblEtapa.fontWeight = "bold";
    lblEtapa.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    infoGrid.addControl(lblEtapa, 0, 1);

    // Mini control de viento integrado en la consola central
    const vientoBox = new StackPanel();
    vientoBox.isVertical = false;
    vientoBox.width = "100%";
    vientoBox.height = "48px";
    infoGrid.addControl(vientoBox, 0, 2);

    const lblViento = new TextBlock();
    lblViento.text = `🌬️ Viento: ${clima.viento.toFixed(1)} m/s`;
    lblViento.color = "#0f766e";
    lblViento.fontSize = 20;
    lblViento.fontWeight = "bold";
    lblViento.width = "190px";
    vientoBox.addControl(lblViento);

    const sViento = new Slider();
    sViento.minimum = 0.0;
    sViento.maximum = 25.0;
    sViento.value = clima.viento;
    sViento.height = "28px";
    sViento.width = "150px";
    sViento.color = "#0d9488";
    sViento.background = "rgba(42, 52, 23, 0.20)";
    sViento.thumbWidth = "24px";
    sViento.onValueChangedObservable.add((val) => {
      clima.viento = Number(val.toFixed(1));
      lblViento.text = `🌬️ Viento: ${clima.viento.toFixed(1)} m/s`;
      cb.onClimaChange();
    });
    vientoBox.addControl(sViento);

    // 3. SLIDER PRINCIPAL DEL DÍA (1 A 240)
    const sliderDia = new Slider();
    sliderDia.minimum = 1.0;
    sliderDia.maximum = 240.0;
    sliderDia.value = estado.dia;
    sliderDia.height = "42px";
    sliderDia.width = "100%";
    sliderDia.color = "#e8a317";
    sliderDia.background = "rgba(42, 52, 23, 0.22)";
    sliderDia.thumbWidth = "36px";
    sliderDia.onValueChangedObservable.add((val) => {
      if (this.sincronizandoSliderDia) return;
      irADia(estado, Number(val.toFixed(1)), clima);
      cb.onTimeLapseChange();
    });
    stack.addControl(sliderDia);

    // 4. FILA DE CONTROLES DE REPRODUCCIÓN (PLAY, VELOCIDADES 1x-12x, REPLANTAR)
    const ctrlGrid = new Grid();
    ctrlGrid.height = "60px";
    ctrlGrid.width = "100%";
    ctrlGrid.addColumnDefinition(0.35); // Play/Pausa
    ctrlGrid.addColumnDefinition(0.12); // 1x
    ctrlGrid.addColumnDefinition(0.12); // 3x
    ctrlGrid.addColumnDefinition(0.12); // 6x
    ctrlGrid.addColumnDefinition(0.12); // 12x
    ctrlGrid.addColumnDefinition(0.17); // Replantar
    stack.addControl(ctrlGrid);

    const btnPlay = Button.CreateSimpleButton("btnPlayConsola", "▶ INICIAR TIME-LAPSE");
    btnPlay.width = "96%";
    btnPlay.height = "48px";
    btnPlay.cornerRadius = 10;
    btnPlay.fontSize = 21;
    btnPlay.fontWeight = "bold";
    btnPlay.color = "#022c22";
    btnPlay.background = "#10b981";
    btnPlay.onPointerUpObservable.add(() => {
      estado.timeLapseActivo = !estado.timeLapseActivo;
      cb.onTimeLapseChange();
    });
    ctrlGrid.addControl(btnPlay, 0, 0);

    const velocidades = [1.0, 3.0, 6.0, 12.0];
    const btnsVel: { btn: Button; vel: number }[] = [];
    velocidades.forEach((vel, vIdx) => {
      const b = Button.CreateSimpleButton(`vel_${vel}`, `${vel}x`);
      b.width = "90%";
      b.height = "46px";
      b.cornerRadius = 10;
      b.fontSize = 20;
      b.fontWeight = "bold";
      b.color = estado.velocidadDiasPorSeg === vel ? "#0f172a" : "#2a3417";
      b.background = estado.velocidadDiasPorSeg === vel ? "#e8a317" : "rgba(232, 163, 23, 0.20)";
      b.onPointerUpObservable.add(() => {
        estado.velocidadDiasPorSeg = vel;
        cb.onTimeLapseChange();
      });
      btnsVel.push({ btn: b, vel });
      ctrlGrid.addControl(b, 0, 1 + vIdx);
    });

    const btnReplantar = Button.CreateSimpleButton("btnReplantarConsola", "↺ REPLANTAR");
    btnReplantar.width = "95%";
    btnReplantar.height = "48px";
    btnReplantar.cornerRadius = 10;
    btnReplantar.fontSize = 20;
    btnReplantar.fontWeight = "bold";
    btnReplantar.color = "#ffffff";
    btnReplantar.background = "#0284c7";
    btnReplantar.onPointerUpObservable.add(() => {
      reiniciarCrecimiento(estado, clima);
      cb.onClimaChange();
      cb.onTimeLapseChange();
    });
    ctrlGrid.addControl(btnReplantar, 0, 5);

    // 5. 4 TARJETAS DE TELEMETRÍA BIOLÓGICA ACUMULADA
    const bioGrid = new Grid();
    bioGrid.height = "100px";
    bioGrid.width = "100%";
    for (let c = 0; c < 4; c++) bioGrid.addColumnDefinition(0.25);
    stack.addControl(bioGrid);

    const crearCardBio = (titleStr: string, initVal: string, col: number) => {
      const card = new Rectangle();
      card.width = "95%";
      card.height = "88%";
      card.cornerRadius = 14;
      card.color = "#2a3417";
      card.thickness = 2;
      card.background = "rgba(255, 252, 236, 0.90)";
      const st = new StackPanel();
      st.isVertical = true;
      card.addControl(st);

      const t = new TextBlock();
      t.text = titleStr;
      t.color = "#2a3417";
      t.fontSize = 19;
      t.height = "32px";
      st.addControl(t);

      const v = new TextBlock();
      v.text = initVal;
      v.color = "#8a5a2b";
      v.fontSize = 28;
      v.fontWeight = "bold";
      v.height = "44px";
      st.addControl(v);

      bioGrid.addControl(card, 0, col);
      return v;
    };

    const lblGdd = crearCardBio("Grados Día (GDD)", `${Math.round(estado.gddAcumulado)} °C·d`, 0);
    const lblBio = crearCardBio("Biomasa Seca", `${estado.biomasaGramos.toFixed(1)} g`, 1);
    const lblAlt = crearCardBio("Altura Porte", `${estado.alturaMetros.toFixed(2)} m`, 2);
    const lblSal = crearCardBio("Vitalidad", "100%", 3);

    // Alerta de Muerte
    const alertaMuerte = new TextBlock();
    alertaMuerte.text = "";
    alertaMuerte.color = "#dc2626";
    alertaMuerte.fontSize = 24;
    alertaMuerte.fontWeight = "bold";
    alertaMuerte.height = "36px";
    stack.addControl(alertaMuerte);

    // 6. BOTONES DE ENFOQUE DE CÁMARA E INSPECCIÓN ANATÓMICA
    const camGrid = new Grid();
    camGrid.height = "52px";
    camGrid.width = "100%";
    for (let c = 0; c < 5; c++) camGrid.addColumnDefinition(0.20);
    stack.addControl(camGrid);

    const btnCam1 = Button.CreateSimpleButton("cam_planta", "🌱 Vista General");
    this.estilizarBtnCam(btnCam1, "#0f766e");
    btnCam1.onPointerUpObservable.add(() => cb.onEnfocarCamara("planta"));
    camGrid.addControl(btnCam1, 0, 0);

    const btnCamConsola = Button.CreateSimpleButton("cam_consola", "🖥️ Enfocar Consola");
    this.estilizarBtnCam(btnCamConsola, "#0284c7");
    btnCamConsola.onPointerUpObservable.add(() => cb.onEnfocarCamara("consola"));
    camGrid.addControl(btnCamConsola, 0, 1);

    const btnCam2 = Button.CreateSimpleButton("cam_elote", "🌽 Zoom Elote");
    this.estilizarBtnCam(btnCam2, "#b45309");
    btnCam2.onPointerUpObservable.add(() => cb.onEnfocarCamara("elote"));
    camGrid.addControl(btnCam2, 0, 2);

    const btnCam3 = Button.CreateSimpleButton("cam_espiga", "🌾 Zoom Espiga");
    this.estilizarBtnCam(btnCam3, "#a16207");
    btnCam3.onPointerUpObservable.add(() => cb.onEnfocarCamara("espiga"));
    camGrid.addControl(btnCam3, 0, 3);

    const btnCam4 = Button.CreateSimpleButton("cam_raices", "🪵 Zoom Raíces");
    this.estilizarBtnCam(btnCam4, "#4d7c0f");
    btnCam4.onPointerUpObservable.add(() => cb.onEnfocarCamara("raices"));
    camGrid.addControl(btnCam4, 0, 4);

    return {
      mesh: plane,
      consolaRefs: {
        sliderDia,
        labelDia: lblDia,
        labelEtapa: lblEtapa,
        labelFps: lblFps,
        btnPlayPause: btnPlay,
        btnAutoRot,
        btnVelocidades: btnsVel,
        labelGdd: lblGdd,
        labelBiomasa: lblBio,
        labelAltura: lblAlt,
        labelSaludVital: lblSal,
        alertaMuerte,
        sliderVientoConsola: sViento,
        labelVientoConsola: lblViento
      }
    };
  }

  private estilizarBtnCam(btn: Button, bg: string): void {
    btn.width = "95%";
    btn.height = "46px";
    btn.cornerRadius = 10;
    btn.fontSize = 20;
    btn.fontWeight = "bold";
    btn.color = "#ffffff";
    btn.background = bg;
  }

  // -------------------------------------------------------------------------
  // PANEL IZQUIERDO: CONTROL AMBIENTAL Y ESCENARIOS (3.5m x 3.4m)
  // -------------------------------------------------------------------------
  private crearPanelControl(
    scene: Scene,
    estado: EstadoCrecimiento,
    clima: ClimateState,
    cb: {
      onClimaChange: () => void;
      onTimeLapseChange: () => void;
      onToggleCicloSolar: () => boolean;
    }
  ) {
    const plane = MeshBuilder.CreatePlane("uiPanelControl", { width: 3.5, height: 3.4 }, scene);
    plane.position = new Vector3(-3.7, 2.5, -0.4);
    plane.rotation.y = Math.PI / 6.5;

    const tex = AdvancedDynamicTexture.CreateForMesh(plane, 1500, 1460);
    this.texturasGUI.push(tex);
    this.ajustarMaterialPlano(plane);

    const bg = new Rectangle("leftBg");
    bg.width = "100%";
    bg.height = "100%";
    bg.cornerRadius = 24;
    bg.color = "#2a3417";
    bg.thickness = 4;
    bg.background = "rgba(255, 252, 236, 0.95)";
    tex.addControl(bg);

    const stack = new StackPanel();
    stack.width = "94%";
    stack.isVertical = true;
    bg.addControl(stack);

    // Título
    const title = new TextBlock();
    title.text = "ESTACIÓN DE CONTROL AMBIENTAL";
    title.color = "#2a3417";
    title.fontSize = 38;
    title.fontWeight = "bold";
    title.height = "64px";
    stack.addControl(title);

    // Fila Botón Ciclo Solar + Restablecer
    const modeGrid = new Grid();
    modeGrid.height = "52px";
    modeGrid.width = "100%";
    modeGrid.addColumnDefinition(0.65);
    modeGrid.addColumnDefinition(0.35);
    stack.addControl(modeGrid);

    const btnCiclo = Button.CreateSimpleButton("btnCicloSolar", "☀️ Ciclo Solar Auto: PAUSADO");
    btnCiclo.width = "98%";
    btnCiclo.height = "46px";
    btnCiclo.color = "#2a3417";
    btnCiclo.background = "rgba(232, 163, 23, 0.25)";
    btnCiclo.cornerRadius = 10;
    btnCiclo.fontSize = 22;
    btnCiclo.fontWeight = "bold";
    btnCiclo.onPointerUpObservable.add(() => {
      const activo = cb.onToggleCicloSolar();
      btnCiclo.textBlock!.text = activo ? "☀️ Ciclo Solar Auto: EN CURSO" : "☀️ Ciclo Solar Auto: PAUSADO";
      btnCiclo.background = activo ? "#e8a317" : "rgba(232, 163, 23, 0.25)";
      btnCiclo.color = activo ? "#0f172a" : "#2a3417";
    });
    modeGrid.addControl(btnCiclo, 0, 0);

    const btnResetClima = Button.CreateSimpleButton("btnResetClima", "↺ Óptimo");
    btnResetClima.width = "95%";
    btnResetClima.height = "46px";
    btnResetClima.color = "#022c22";
    btnResetClima.background = "#10b981";
    btnResetClima.cornerRadius = 10;
    btnResetClima.fontSize = 20;
    btnResetClima.fontWeight = "bold";
    btnResetClima.onPointerUpObservable.add(() => {
      Object.assign(clima, CLIMA_INICIAL);
      cb.onClimaChange();
    });
    modeGrid.addControl(btnResetClima, 0, 1);

    // Grilla de 10 Escenarios predefinidos
    const scnTitle = new TextBlock();
    scnTitle.text = "ESCENARIOS AGROCLIMÁTICOS PREDEFINIDOS:";
    scnTitle.color = "#8a5a2b";
    scnTitle.fontSize = 22;
    scnTitle.fontWeight = "bold";
    scnTitle.height = "38px";
    scnTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(scnTitle);

    const presetsGrid = new Grid();
    presetsGrid.height = "104px";
    presetsGrid.width = "100%";
    for (let c = 0; c < 5; c++) presetsGrid.addColumnDefinition(0.2);
    presetsGrid.addRowDefinition(0.5);
    presetsGrid.addRowDefinition(0.5);
    stack.addControl(presetsGrid);

    ESCENARIOS.forEach((esc, idx) => {
      const btn = Button.CreateSimpleButton(`esc_${idx}`, esc.nombre);
      btn.width = "95%";
      btn.height = "44px";
      btn.color = "#2a3417";
      btn.background = "rgba(232, 163, 23, 0.22)";
      btn.cornerRadius = 10;
      btn.thickness = 2;
      btn.fontSize = 19;
      btn.fontWeight = "bold";
      btn.onPointerUpObservable.add(() => {
        Object.assign(clima, CLIMA_INICIAL, esc.valores);
        notificarCambioClima(estado, clima);
        cb.onClimaChange();
        cb.onTimeLapseChange();
      });
      presetsGrid.addControl(btn, Math.floor(idx / 5), idx % 5);
    });

    // Separador y título de sliders
    const varTitle = new TextBlock();
    varTitle.text = "11 VARIABLES AMBIENTALES MEDIBLES:";
    varTitle.color = "#8a5a2b";
    varTitle.fontSize = 22;
    varTitle.fontWeight = "bold";
    varTitle.height = "40px";
    varTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(varTitle);

    // Grilla de los 11 Sliders (2 columnas grandes)
    const slidersGrid = new Grid();
    slidersGrid.width = "100%";
    slidersGrid.height = "990px";
    slidersGrid.addColumnDefinition(0.5);
    slidersGrid.addColumnDefinition(0.5);
    const numFilas = Math.ceil(VARIABLES.length / 2);
    for (let r = 0; r < numFilas; r++) slidersGrid.addRowDefinition(1 / numFilas);
    stack.addControl(slidersGrid);

    const slidersClima = new Map<ClimateKey, { slider: Slider; label: TextBlock; unidad: string; etiqueta: string; paso: number }>();

    VARIABLES.forEach((v, idx) => {
      const cell = new StackPanel();
      cell.width = "94%";
      cell.isVertical = true;

      const label = new TextBlock();
      label.text = this.formatearEtiqueta(v.etiqueta, clima[v.key], v.unidad, v.paso);
      label.color = "#2a3417";
      label.fontSize = 23;
      label.fontWeight = "bold";
      label.height = "38px";
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      cell.addControl(label);

      const slider = new Slider();
      slider.minimum = v.min;
      slider.maximum = v.max;
      slider.value = clima[v.key];
      slider.height = "38px";
      slider.width = "100%";
      slider.color = v.color;
      slider.background = "rgba(42, 52, 23, 0.22)";
      slider.thumbWidth = "30px";
      slider.onValueChangedObservable.add((val) => {
        if (this.sincronizandoClima) return;
        const redondeado = Math.round(val / v.paso) * v.paso;
        clima[v.key] = Number(redondeado.toFixed(2));
        label.text = this.formatearEtiqueta(v.etiqueta, clima[v.key], v.unidad, v.paso);
        if (v.key !== "hora") {
          notificarCambioClima(estado, clima);
          cb.onTimeLapseChange();
        }
        cb.onClimaChange();
      });
      cell.addControl(slider);

      slidersClima.set(v.key, { slider, label, unidad: v.unidad, etiqueta: v.etiqueta, paso: v.paso });
      slidersGrid.addControl(cell, Math.floor(idx / 2), idx % 2);
    });

    return {
      mesh: plane,
      leftRefs: {
        slidersClima,
        btnCicloSolar: btnCiclo
      }
    };
  }

  // -------------------------------------------------------------------------
  // PANEL DERECHO: TELEMETRÍA CIENTÍFICA Y ESTRÉS (3.5m x 3.4m)
  // -------------------------------------------------------------------------
  private crearPanelTelemetria(scene: Scene) {
    const plane = MeshBuilder.CreatePlane("uiPanelTelemetria", { width: 3.5, height: 3.4 }, scene);
    plane.position = new Vector3(3.7, 2.5, -0.4);
    plane.rotation.y = -Math.PI / 6.5;

    const tex = AdvancedDynamicTexture.CreateForMesh(plane, 1500, 1460);
    this.texturasGUI.push(tex);
    this.ajustarMaterialPlano(plane);

    const bg = new Rectangle("rightBg");
    bg.width = "100%";
    bg.height = "100%";
    bg.cornerRadius = 24;
    bg.color = "#2a3417";
    bg.thickness = 4;
    bg.background = "rgba(255, 252, 236, 0.95)";
    tex.addControl(bg);

    const stack = new StackPanel();
    stack.width = "94%";
    stack.isVertical = true;
    bg.addControl(stack);

    const title = new TextBlock();
    title.text = "TELEMETRÍA BIOFÍSICA & ESTRÉS";
    title.color = "#2a3417";
    title.fontSize = 38;
    title.fontWeight = "bold";
    title.height = "64px";
    stack.addControl(title);

    // Barra Salud Fisiológica Principal
    const saludH = new TextBlock();
    saludH.text = "Índice de Salud Fisiológica: 100%";
    saludH.color = "#15803d";
    saludH.fontSize = 28;
    saludH.fontWeight = "bold";
    saludH.height = "42px";
    stack.addControl(saludH);

    const saludBg = new Rectangle();
    saludBg.width = "100%";
    saludBg.height = "28px";
    saludBg.cornerRadius = 12;
    saludBg.color = "#2a3417";
    saludBg.thickness = 2;
    saludBg.background = "rgba(42, 52, 23, 0.18)";
    stack.addControl(saludBg);

    const saludBarFill = new Rectangle();
    saludBarFill.width = "100%";
    saludBarFill.height = "100%";
    saludBarFill.cornerRadius = 10;
    saludBarFill.thickness = 0;
    saludBarFill.background = "#16a34a";
    saludBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    saludBg.addControl(saludBarFill);

    const diagTxt = new TextBlock();
    diagTxt.text = "Estado: Fisiología y Fotosíntesis C4 Óptimas";
    diagTxt.color = "#2a3417";
    diagTxt.fontSize = 24;
    diagTxt.height = "46px";
    stack.addControl(diagTxt);

    // 16 Sensores Derivados (4x4)
    const defSensores = [
      { id: "irradiancia", titulo: "Irradiancia GHI", col: "#d97706" },
      { id: "par", titulo: "Radiación PAR", col: "#ca8a04" },
      { id: "lux", titulo: "Iluminancia", col: "#b45309" },
      { id: "uv", titulo: "Índice UV / Sol", col: "#ea580c" },
      { id: "vpd", titulo: "Déficit VPD", col: "#0284c7" },
      { id: "rocio", titulo: "Punto de Rocío", col: "#0369a1" },
      { id: "humAbs", titulo: "Hum. Absoluta", col: "#2563eb" },
      { id: "densAire", titulo: "Densidad Aire", col: "#7c3aed" },
      { id: "visib", titulo: "Visibilidad", col: "#475569" },
      { id: "niebla", titulo: "Niebla / Calima", col: "#64748b" },
      { id: "et0", titulo: "Evapotransp. ET₀", col: "#0284c7" },
      { id: "transp", titulo: "Transpiración", col: "#0d9488" },
      { id: "fotosint", titulo: "Fotosíntesis Neta", col: "#16a34a" },
      { id: "conduct", titulo: "Cond. Estomática", col: "#15803d" },
      { id: "hongos", titulo: "Riesgo Fúngico", col: "#db2777" },
      { id: "encharcado", titulo: "Humedad Suelo", col: "#65a30d" }
    ];

    const sensorGrid = new Grid();
    sensorGrid.width = "100%";
    sensorGrid.height = "520px";
    for (let c = 0; c < 4; c++) sensorGrid.addColumnDefinition(0.25);
    for (let r = 0; r < 4; r++) sensorGrid.addRowDefinition(0.25);
    stack.addControl(sensorGrid);

    const celdasSensores = new Map<string, TextBlock>();

    defSensores.forEach((def, idx) => {
      const card = new Rectangle(`card_${def.id}`);
      card.width = "95%";
      card.height = "90%";
      card.cornerRadius = 14;
      card.color = "#2a3417";
      card.thickness = 2;
      card.background = "rgba(255, 252, 236, 0.90)";

      const st = new StackPanel();
      st.isVertical = true;
      card.addControl(st);

      const t = new TextBlock();
      t.text = def.titulo;
      t.color = "#2a3417";
      t.fontSize = 20;
      t.height = "36px";
      st.addControl(t);

      const val = new TextBlock();
      val.text = "--";
      val.color = def.col;
      val.fontSize = 26;
      val.fontWeight = "bold";
      val.height = "48px";
      st.addControl(val);

      celdasSensores.set(def.id, val);
      sensorGrid.addControl(card, Math.floor(idx / 4), idx % 4);
    });

    // 6 Barras de Estrés Fisiológico y Biomecánico
    const estresTitle = new TextBlock();
    estresTitle.text = "ÍNDICES DE ESTRÉS FISIOLÓGICO Y BIOMECÁNICO:";
    estresTitle.color = "#8a5a2b";
    estresTitle.fontSize = 24;
    estresTitle.fontWeight = "bold";
    estresTitle.height = "44px";
    estresTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(estresTitle);

    const barrasEstres = new Map<string, { barra: Rectangle; valor: TextBlock }>();
    const defsEstres = [
      { id: "hidrico", nombre: "Estrés Hídrico (Sequía)", col: "#ea580c" },
      { id: "calor", nombre: "Estrés Térmico (Calor)", col: "#dc2626" },
      { id: "frio", nombre: "Estrés por Helada (Frío)", col: "#0284c7" },
      { id: "nutricional", nombre: "Desbalance de pH / Nutrientes", col: "#c026d3" },
      { id: "mecanico", nombre: "Fatiga Mecánica por Viento", col: "#0d9488" },
      { id: "encharcamiento", nombre: "Hipoxia Radicular (Exceso Agua)", col: "#2563eb" }
    ];

    const estresGrid = new Grid();
    estresGrid.width = "100%";
    estresGrid.height = "420px";
    estresGrid.addColumnDefinition(0.5);
    estresGrid.addColumnDefinition(0.5);
    estresGrid.addRowDefinition(1 / 3);
    estresGrid.addRowDefinition(1 / 3);
    estresGrid.addRowDefinition(1 / 3);
    stack.addControl(estresGrid);

    defsEstres.forEach((d, idx) => {
      const st = new StackPanel();
      st.width = "94%";
      st.isVertical = true;

      const lbl = new TextBlock();
      lbl.text = `${d.nombre}: 0%`;
      lbl.color = "#2a3417";
      lbl.fontSize = 22;
      lbl.fontWeight = "bold";
      lbl.height = "38px";
      lbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      st.addControl(lbl);

      const barBg = new Rectangle();
      barBg.width = "100%";
      barBg.height = "26px";
      barBg.cornerRadius = 10;
      barBg.color = "#2a3417";
      barBg.thickness = 1.5;
      barBg.background = "rgba(42, 52, 23, 0.18)";
      st.addControl(barBg);

      const barFill = new Rectangle();
      barFill.width = "2%";
      barFill.height = "100%";
      barFill.cornerRadius = 8;
      barFill.thickness = 0;
      barFill.background = d.col;
      barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      barBg.addControl(barFill);

      barrasEstres.set(d.id, { barra: barFill, valor: lbl });
      estresGrid.addControl(st, Math.floor(idx / 2), idx % 2);
    });

    return {
      mesh: plane,
      rightRefs: {
        saludTexto: saludH,
        saludBarra: saludBarFill,
        diagnosticoTexto: diagTxt,
        celdasSensores,
        barrasEstres
      }
    };
  }

  private ajustarMaterialPlano(plane: Mesh): void {
    if (plane.material instanceof StandardMaterial) {
      plane.material.disableLighting = true;
      plane.material.emissiveColor = Color3.Black();
      plane.material.diffuseColor = Color3.White();
      plane.material.specularColor = Color3.Black();
      plane.material.useAlphaFromDiffuseTexture = true;
      plane.material.fogEnabled = false;
    }
  }

  private formatearEtiqueta(etiqueta: string, valor: number, unidad: string, paso: number): string {
    if (etiqueta === "Hora Solar") {
      const h = Math.floor(valor);
      const m = Math.round((valor - h) * 60);
      return `${etiqueta}: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} h`;
    }
    const strVal = paso < 1 ? valor.toFixed(1) : String(Math.round(valor));
    return unidad ? `${etiqueta}: ${strVal} ${unidad}` : `${etiqueta}: ${strVal}`;
  }

  // -------------------------------------------------------------------------
  // MÉTODOS DE SINCRONIZACIÓN DE INTERFAZ 3D
  // -------------------------------------------------------------------------
  public actualizarConsola(estado: EstadoCrecimiento, clima?: ClimateState): void {
    this.sincronizandoSliderDia = true;
    this.refs.sliderDia.value = estado.dia;
    this.sincronizandoSliderDia = false;

    this.refs.labelDia.text = `DÍA: ${Math.round(estado.dia)} / 240`;
    this.refs.labelEtapa.text = `Etapa: ${estado.etapa}`;

    this.refs.btnPlayPause.textBlock!.text = estado.timeLapseActivo ? "⏸ PAUSAR TIME-LAPSE" : "▶ INICIAR TIME-LAPSE";
    this.refs.btnPlayPause.background = estado.timeLapseActivo ? "#f59e0b" : "#10b981";

    for (const item of this.refs.btnVelocidades) {
      const activa = item.vel === estado.velocidadDiasPorSeg;
      item.btn.background = activa ? "#e8a317" : "rgba(232, 163, 23, 0.20)";
      item.btn.color = activa ? "#0f172a" : "#2a3417";
    }

    this.refs.labelGdd.text = `${Math.round(estado.gddAcumulado)} °C·d`;
    this.refs.labelBiomasa.text = `${estado.biomasaGramos.toFixed(1)} g`;
    this.refs.labelAltura.text = `${estado.alturaMetros.toFixed(2)} m`;

    if (clima && this.refs.labelVientoConsola) {
      this.refs.labelVientoConsola.text = `🌬️ Viento: ${clima.viento.toFixed(1)} m/s`;
      this.refs.sliderVientoConsola.value = clima.viento;
    }

    const pctVital = Math.round(estado.saludVital * 100);
    if (estado.estaMuerta) {
      const degPct = Math.round(estado.degradacion * 100);
      this.refs.labelSaludVital.text = `MUERTA (${degPct}%)`;
      this.refs.labelSaludVital.color = "#dc2626";
      this.refs.alertaMuerte.text = `⚠️ ${estado.causaMuerte} (+${Math.round(estado.diasMuerta)}d post-mortem)`;
    } else {
      this.refs.labelSaludVital.text = `${pctVital}%`;
      this.refs.labelSaludVital.color = pctVital > 70 ? "#15803d" : pctVital > 40 ? "#ca8a04" : "#dc2626";
      this.refs.alertaMuerte.text = "";
    }
  }

  public actualizarControlClima(key: ClimateKey, clima: ClimateState): void {
    const item = this.refs.slidersClima.get(key);
    if (item) {
      this.sincronizandoClima = true;
      item.slider.value = clima[key];
      this.sincronizandoClima = false;
      item.label.text = this.formatearEtiqueta(item.etiqueta, clima[key], item.unidad, item.paso);
    }
    if (key === "viento" && this.refs.labelVientoConsola) {
      this.refs.labelVientoConsola.text = `🌬️ Viento: ${clima.viento.toFixed(1)} m/s`;
      this.refs.sliderVientoConsola.value = clima.viento;
    }
  }

  public actualizarTelemetria(metricas: Metricas, estado: EstadoCrecimiento): void {
    const m = metricas;

    if (estado.estaMuerta) {
      this.refs.saludTexto.text = "Índice de Salud: 0% (PLANTA MUERTA)";
      this.refs.saludBarra.width = "2%";
      this.refs.saludTexto.color = "#dc2626";
      this.refs.saludBarra.background = "#dc2626";
      this.refs.diagnosticoTexto.text = `Causa de Muerte: ${estado.causaMuerte}`;
      this.refs.diagnosticoTexto.color = "#dc2626";
    } else {
      const pctSalud = Math.round(m.saludGeneral * estado.saludVital * 100);
      this.refs.saludTexto.text = `Índice de Salud Fisiológica: ${pctSalud}%`;
      this.refs.saludBarra.width = `${Math.max(2, pctSalud)}%`;
      const col = pctSalud > 70 ? "#16a34a" : pctSalud > 40 ? "#ca8a04" : "#dc2626";
      this.refs.saludTexto.color = col;
      this.refs.saludBarra.background = col;

      const alertas: string[] = [];
      if (m.estresHidrico > 0.2) alertas.push(`Déficit Hídrico (${Math.round(m.estresHidrico * 100)}%)`);
      if (m.estresCalor > 0.15) alertas.push("Estrés Térmico");
      if (m.estresFrio > 0.15) alertas.push("Frío / Helada");
      if (m.encharcamiento > 0.2) alertas.push("Hipoxia Radicular");
      if (m.estresNutricional > 0.2) alertas.push("Desbalance pH");
      if (m.estresMecanico > 0.25) alertas.push("Turbulencia Viento");

      this.refs.diagnosticoTexto.text =
        alertas.length > 0
          ? `[${estado.etapa}] ${alertas.slice(0, 2).join(" | ")}`
          : `[${estado.etapa}] Homeostasis y Fotosíntesis C4 Óptimas`;
      this.refs.diagnosticoTexto.color = alertas.length > 0 ? "#b45309" : "#15803d";
    }

    // Actualizar 16 tarjetas de sensores
    const setSensor = (id: string, txt: string) => {
      const c = this.refs.celdasSensores.get(id);
      if (c) c.text = txt;
    };
    setSensor("irradiancia", `${Math.round(m.irradiancia)} W/m²`);
    setSensor("par", `${Math.round(m.par)} µmol/m²s`);
    setSensor("lux", m.lux >= 1000 ? `${(m.lux / 1000).toFixed(1)} klx` : `${Math.round(m.lux)} lx`);
    setSensor("uv", `UV ${m.indiceUV.toFixed(1)}`);
    setSensor("vpd", `${m.vpd.toFixed(2)} kPa`);
    setSensor("rocio", `${m.puntoRocio.toFixed(1)} °C`);
    setSensor("humAbs", `${m.humedadAbsoluta.toFixed(1)} g/m³`);
    setSensor("densAire", `${m.densidadAire.toFixed(3)} kg/m³`);
    setSensor("visib", `${m.visibilidad.toFixed(1)} km`);
    setSensor("niebla", `${Math.round(m.niebla * 100)} %`);
    setSensor("et0", `${m.et0.toFixed(2)} mm/h`);
    setSensor("transp", `${m.transpiracion.toFixed(2)} mm/h`);
    setSensor("fotosint", `${m.fotosintesis.toFixed(1)} µmol/m²s`);
    setSensor("conduct", `${Math.round(m.conductancia * 100)} %`);
    setSensor("hongos", `${Math.round(m.riesgoFungico * 100)} %`);
    setSensor("encharcado", `${Math.round(m.encharcamiento * 100)} %`);

    // Actualizar 6 barras de estrés
    const setBar = (id: string, nombre: string, val01: number) => {
      const b = this.refs.barrasEstres.get(id);
      if (!b) return;
      const pct = Math.round(val01 * 100);
      b.valor.text = `${nombre}: ${pct}%`;
      b.barra.width = `${Math.max(2, pct)}%`;
    };
    setBar("hidrico", "Estrés Hídrico (Sequía)", m.estresHidrico);
    setBar("calor", "Estrés Térmico (Calor)", m.estresCalor);
    setBar("frio", "Estrés por Helada (Frío)", m.estresFrio);
    setBar("nutricional", "Desbalance pH / Nutrientes", m.estresNutricional);
    setBar("mecanico", "Fatiga Mecánica por Viento", m.estresMecanico);
    setBar("encharcamiento", "Hipoxia Radicular", m.encharcamiento);
  }
}
