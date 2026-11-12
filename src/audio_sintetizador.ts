/**
 * M12: Sintetizador de Audio Procedural WebAudio + Audio Espacial 3D (v4.0)
 *
 * Genera todos los efectos de sonido diegéticos y paisaje sonoro en tiempo real
 * sin requerir archivos externos (0 descargas):
 * - Golpes de azada modulados por potencia física (120->32 Hz + crunch).
 * - Chorro continuo y salpicaduras de la regadera.
 * - Sonajero de semillas, abono, cosecha, pasos y voz con ducking de Don Elote.
 * - Fauna y clima espacializados con PannerNode: abeja, pájaro, grillo, trueno, sonaja.
 * - Sonidos de cocina tradicional (M8): chisporroteo de fogón, metate, palmada de tortilla y palomitas.
 * - Buffers de ruido reutilizables (Zero-GC en tiempo de juego).
 */

import { Vector3 } from "@babylonjs/core";

export class AudioSintetizador {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienteGain: GainNode | null = null;

  private nodoAguaGain: GainNode | null = null;
  private oscAgua: OscillatorNode | null = null;
  private noiseAgua: AudioNode | null = null;
  private habilitado = true;

  // Buffers de ruido pre-generados y reutilizados (Zero-GC)
  private bufRuidoCorto: AudioBuffer | null = null;
  private bufRuidoMedio: AudioBuffer | null = null;
  private bufRuidoLargo: AudioBuffer | null = null;

  // Temporizador de paisaje sonoro vivo
  private timerAmbiente = 0;

  // Hook opcional para subtítulos accesibles (M14)
  public onSubtituloSonido?: (etiqueta: string) => void;

  constructor() {
    const activar = () => {
      this.asegurarContexto();
      window.removeEventListener("pointerdown", activar);
      window.removeEventListener("keydown", activar);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", activar);
      window.addEventListener("keydown", activar);
    }
  }

  private asegurarContexto(): AudioContext | null {
    if (!this.habilitado || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.9;
        this.masterGain.connect(this.ctx.destination);

        this.ambienteGain = this.ctx.createGain();
        this.ambienteGain.gain.value = 0.65;
        this.ambienteGain.connect(this.masterGain);

        this.bufRuidoCorto = this.generarBufferRuido(this.ctx, 0.12);
        this.bufRuidoMedio = this.generarBufferRuido(this.ctx, 0.35);
        this.bufRuidoLargo = this.generarBufferRuido(this.ctx, 2.0);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private generarBufferRuido(ctx: AudioContext, segundos: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const totalSamples = Math.floor(sampleRate * segundos);
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < totalSamples; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Actualiza la posición y orientación del oyente 3D (sin asignar objetos)
   */
  public actualizarListener(pos: Vector3, forward?: Vector3): void {
    if (!this.ctx) return;
    const l = this.ctx.listener as any;
    try {
      if (l.positionX) {
        l.positionX.value = pos.x;
        l.positionY.value = pos.y;
        l.positionZ.value = pos.z;
        if (forward && l.forwardX) {
          l.forwardX.value = forward.x;
          l.forwardY.value = forward.y;
          l.forwardZ.value = forward.z;
        }
      } else if (l.setPosition) {
        l.setPosition(pos.x, pos.y, pos.z);
      }
    } catch {}
  }

  private conectarDestino(ctx: AudioContext, nodo: AudioNode, pos?: Vector3, esAmbiente = false): void {
    const salidaBase = (esAmbiente ? this.ambienteGain : this.masterGain) ?? ctx.destination;
    if (!pos) {
      nodo.connect(salidaBase);
      return;
    }
    try {
      const panner = ctx.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.5;
      panner.maxDistance = 18.0;
      panner.rolloffFactor = 1.2;
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
      nodo.connect(panner);
      panner.connect(salidaBase);
    } catch {
      nodo.connect(salidaBase);
    }
  }

  /**
   * Golpe potente de la azada modulado por la potencia física del gesto (0.5..1.4)
   */
  public golpeAzada(potencia = 1.0, pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    const p = Math.max(0.5, Math.min(1.4, potencia));
    const t = ctx.currentTime;

    // 1. Sub-bass thud
    const osc = ctx.createOscillator();
    const gainOsc = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(105 + 20 * p, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.18);

    gainOsc.gain.setValueAtTime(0.55 * p, t);
    gainOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gainOsc);
    this.conectarDestino(ctx, gainOsc, pos);
    osc.start(t);
    osc.stop(t + 0.25);

    // 2. Crunch de tierra
    if (this.bufRuidoMedio) {
      const ruido = ctx.createBufferSource();
      ruido.buffer = this.bufRuidoMedio;

      const filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.setValueAtTime(420 * p, t);
      filtro.Q.setValueAtTime(1.8, t);

      const gainRuido = ctx.createGain();
      gainRuido.gain.setValueAtTime(0.45 * p, t);
      gainRuido.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

      ruido.connect(filtro);
      filtro.connect(gainRuido);
      this.conectarDestino(ctx, gainRuido, pos);
      ruido.start(t);
      ruido.stop(t + 0.22);
    }
  }

  /**
   * Sonajero de semillas de maíz al sembrarse en el surco
   */
  public semillas(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    const t = ctx.currentTime;
    const tiempos = [0, 0.06, 0.13];
    for (let i = 0; i < tiempos.length; i++) {
      const ti = t + tiempos[i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(650 + i * 180, ti);
      osc.frequency.exponentialRampToValueAtTime(220, ti + 0.05);

      gain.gain.setValueAtTime(0.35 - i * 0.08, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.06);

      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      osc.start(ti);
      osc.stop(ti + 0.07);
    }
  }

  /**
   * Inicia el flujo continuo de agua de la regadera
   */
  public iniciarAgua(caudal = 1.0): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    if (this.nodoAguaGain) {
      this.nodoAguaGain.gain.setTargetAtTime(0.38 * Math.max(0.1, caudal), ctx.currentTime, 0.05);
      return;
    }

    const t = ctx.currentTime;
    if (!this.bufRuidoLargo) return;

    const ruido = ctx.createBufferSource();
    ruido.buffer = this.bufRuidoLargo;
    ruido.loop = true;

    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.setValueAtTime(1100, t);
    filtro.Q.setValueAtTime(1.2, t);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(8.5, t);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(350, t);
    lfo.connect(lfoGain);
    lfoGain.connect(filtro.frequency);
    lfo.start(t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.38 * Math.max(0.15, caudal), t + 0.15);

    ruido.connect(filtro);
    filtro.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);

    ruido.start(t);

    this.nodoAguaGain = gain;
    this.noiseAgua = ruido;
    this.oscAgua = lfo;
  }

  /**
   * Detiene el flujo de agua suavemente
   */
  public detenerAgua(): void {
    if (!this.ctx || !this.nodoAguaGain) return;
    const t = this.ctx.currentTime;
    this.nodoAguaGain.gain.linearRampToValueAtTime(0.001, t + 0.12);
    setTimeout(() => {
      try {
        (this.noiseAgua as any)?.stop();
        this.oscAgua?.stop();
        this.noiseAgua?.disconnect();
        this.nodoAguaGain?.disconnect();
      } catch (_) {}
      this.nodoAguaGain = null;
      this.noiseAgua = null;
      this.oscAgua = null;
    }, 150);
  }

  public chorroAgua(): void {
    this.iniciarAgua(1.0);
    setTimeout(() => this.detenerAgua(), 900);
  }

  /**
   * Campanilleo mágico del abono orgánico al liberar nutrientes
   */
  public abono(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notas = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notas.length; i++) {
      const ti = t + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(notas[i], ti);

      gain.gain.setValueAtTime(0.24, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.28);

      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      osc.start(ti);
      osc.stop(ti + 0.30);
    }
  }

  /**
   * Sonido nítido de desprendimiento de la mazorca (snap/pop crujiente)
   */
  public cosecha(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.12);

    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    this.conectarDestino(ctx, gain, pos);
    osc.start(t);
    osc.stop(t + 0.16);

    setTimeout(() => {
      this.abono(pos);
    }, 120);
  }

  /**
   * Voz sintetizada juguetona de Don Elote con ducking automático (-6 dB al ambiente)
   */
  public vozDonElote(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Ducking de ambiente mientras habla
    if (this.ambienteGain) {
      this.ambienteGain.gain.setTargetAtTime(0.25, t, 0.05);
      this.ambienteGain.gain.setTargetAtTime(0.65, t + 0.45, 0.2);
    }

    const fonemas = 4;
    for (let i = 0; i < fonemas; i++) {
      const ti = t + i * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const frec = 220 + Math.random() * 180;
      osc.frequency.setValueAtTime(frec, ti);
      osc.frequency.linearRampToValueAtTime(frec + (Math.random() * 80 - 40), ti + 0.06);

      const filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.setValueAtTime(950, ti);
      filtro.Q.setValueAtTime(3.5, ti);

      gain.gain.setValueAtTime(0.18, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.065);

      osc.connect(filtro);
      filtro.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      osc.start(ti);
      osc.stop(ti + 0.07);
    }
  }

  /**
   * Sonido sutil de paso sobre césped o tierra
   */
  public paso(): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoCorto) return;

    const t = ctx.currentTime;
    const ruido = ctx.createBufferSource();
    ruido.buffer = this.bufRuidoCorto;

    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.setValueAtTime(320, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

    ruido.connect(filtro);
    filtro.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);
    ruido.start(t);
    ruido.stop(t + 0.08);
  }

  // ---------------------------------------------------------------------------
  // Nuevos Sonidos Procedurales v4.0 (M3, M4, M5, M6, M8, M10, M12)
  // ---------------------------------------------------------------------------

  /** Zumbido espacial de abeja polinizadora (Sawtooth ~210 Hz + vibrato 14 Hz) */
  public abeja(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(210, t);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(14, t);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(18, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.setValueAtTime(420, t);
    filtro.Q.setValueAtTime(2.0, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filtro);
    filtro.connect(gain);
    this.conectarDestino(ctx, gain, pos, true);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.46);
    osc.stop(t + 0.46);
    this.onSubtituloSonido?.("🐝 [Zumbido de abeja en flor de calabaza]");
  }

  /** Canto de ave / tordo (barrido sinusoidal 2.4 -> 3.8 kHz) */
  public pajaro(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2400 + i * 250, ti);
      osc.frequency.exponentialRampToValueAtTime(3800, ti + 0.08);

      gain.gain.setValueAtTime(0.14, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.09);

      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos, true);
      osc.start(ti);
      osc.stop(ti + 0.095);
    }
  }

  /** Canto nocturno de grillo (pulso de seno 4.2 kHz) */
  public grillo(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(4200, ti);

      gain.gain.setValueAtTime(0.08, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.04);

      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos, true);
      osc.start(ti);
      osc.stop(ti + 0.045);
    }
  }

  /** Trueno distante para evento de tormenta (M6) */
  public trueno(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoLargo) return;
    const t = ctx.currentTime;

    const ruido = ctx.createBufferSource();
    ruido.buffer = this.bufRuidoLargo;

    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.setValueAtTime(160, t);
    filtro.frequency.exponentialRampToValueAtTime(45, t + 1.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.75);

    ruido.connect(filtro);
    filtro.connect(gain);
    this.conectarDestino(ctx, gain, pos);
    ruido.start(t);
    ruido.stop(t + 1.8);
    this.onSubtituloSonido?.("⛈️ [Trueno retumbando en el valle]");
  }

  /** Campanita doble (1.2 y 1.8 kHz) para desbloqueo de Códice o Misión (M10) */
  public campanita(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;
    const frecs = [1200, 1800];
    for (let i = 0; i < frecs.length; i++) {
      const ti = t + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frecs[i], ti);
      gain.gain.setValueAtTime(0.25, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.35);
      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      osc.start(ti);
      osc.stop(ti + 0.36);
    }
  }

  /** Clic táctil corto para botones 3D y UI Poke (M13) */
  public clickUI(): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.03);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // Alias semánticos para sistemas v4.0
  public ararTierra(pos?: Vector3, potencia = 1.0): void {
    this.golpeAzada(potencia, pos);
  }
  public sembrarSemilla(pos?: Vector3): void {
    this.semillas(pos);
  }
  public regarAgua(pos?: Vector3): void {
    this.chorroAgua();
  }
  public abonarNutrientes(pos?: Vector3): void {
    this.abono(pos);
  }
  public cosecharExito(pos?: Vector3): void {
    this.cosecha(pos);
  }

  /** Sonaja / sacudida para ahuyentar aves o polinizar manualmente (M4, M5) */
  public sonaja(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoCorto) return;
    const t = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.08;
      const ruido = ctx.createBufferSource();
      ruido.buffer = this.bufRuidoCorto;

      const filtro = ctx.createBiquadFilter();
      filtro.type = "highpass";
      filtro.frequency.setValueAtTime(1800, ti);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.28, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.07);

      ruido.connect(filtro);
      filtro.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      ruido.start(ti);
      ruido.stop(ti + 0.075);
    }
  }

  /** Chisporroteo cálido del fogón de leña y comal (M8) */
  public chisporroteo(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoCorto) return;
    const t = ctx.currentTime;

    const ruido = ctx.createBufferSource();
    ruido.buffer = this.bufRuidoCorto;

    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.setValueAtTime(2200, t);
    filtro.Q.setValueAtTime(2.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    ruido.connect(filtro);
    filtro.connect(gain);
    this.conectarDestino(ctx, gain, pos);
    ruido.start(t);
    ruido.stop(t + 0.07);
  }

  /** Palmada tradicional al tortear masa de maíz (M8) */
  public palmada(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoCorto) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainOsc = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.06);
    gainOsc.gain.setValueAtTime(0.35, t);
    gainOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gainOsc);
    this.conectarDestino(ctx, gainOsc, pos);
    osc.start(t);
    osc.stop(t + 0.075);
  }

  /** Molienda rítmica de nixtamal sobre piedra de metate (M8) */
  public raspadoMetate(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.bufRuidoMedio) return;
    const t = ctx.currentTime;

    const ruido = ctx.createBufferSource();
    ruido.buffer = this.bufRuidoMedio;

    const filtro = ctx.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.setValueAtTime(620, t);
    filtro.Q.setValueAtTime(1.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    ruido.connect(filtro);
    filtro.connect(gain);
    this.conectarDestino(ctx, gain, pos);
    ruido.start(t);
    ruido.stop(t + 0.24);
  }

  /** Explosión festiva de grano de maíz palomero (momochtli a 180 °C, M8) */
  public reventarPalomita(pos?: Vector3): void {
    const ctx = this.asegurarContexto();
    if (!ctx) return;
    const t = ctx.currentTime;

    for (let i = 0; i < 4; i++) {
      const ti = t + i * 0.09 + Math.random() * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520 + i * 90, ti);
      osc.frequency.exponentialRampToValueAtTime(140, ti + 0.055);
      gain.gain.setValueAtTime(0.4, ti);
      gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.06);
      osc.connect(gain);
      this.conectarDestino(ctx, gain, pos);
      osc.start(ti);
      osc.stop(ti + 0.065);
    }
  }

  /**
   * Paisaje sonoro vivo según la hora solar y clima (M12)
   */
  public actualizarPaisajeSonoro(dt: number, hora: number, lluvia: number): void {
    this.timerAmbiente += dt;
    if (this.timerAmbiente < 6.5) return;
    this.timerAmbiente = 0;

    if (lluvia > 2.0) return; // En lluvia fuerte los insectos y aves se refugian

    if (hora >= 6.5 && hora <= 18.5) {
      if (Math.random() < 0.45) {
        this.pajaro(new Vector3((Math.random() - 0.5) * 8, 2.5, (Math.random() - 0.5) * 6));
      }
    } else {
      if (Math.random() < 0.65) {
        this.grillo(new Vector3((Math.random() - 0.5) * 6, 0.2, (Math.random() - 0.5) * 6));
      }
    }
  }
}
