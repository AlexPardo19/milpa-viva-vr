/**
 * Efectos de Partículas y Animaciones Visuales Educativas para Niños
 *
 * Incluye:
 *  - Salpicaduras de tierra y nubes de polvo al arar con la azada
 *  - Chorro de gotas celestes con ondas concéntricas de agua al regar
 *  - Estrellas doradas, chispas esmeraldas y anillos mágicos de nutrientes al abonar
 *  - Halo expansivo y destellos dorados al sembrar
 *  - Fuga festiva de confeti y estrellas giratorias al cosechar
 */

import {
  Scene,
  Vector3,
  Color4,
  ParticleSystem,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3
} from "@babylonjs/core";

export class ParticulasEducativas {
  readonly scene: Scene;

  private texGota: DynamicTexture;
  private texChispaTierra: DynamicTexture;
  private texPolvoTierra: DynamicTexture;
  private texEstrellaAbono: DynamicTexture;
  private texChispaVerde: DynamicTexture;
  private texOndaAgua: DynamicTexture;
  private texConfeti: DynamicTexture;

  constructor(scene: Scene) {
    this.scene = scene;
    this.texGota = this.crearTexturaGota();
    this.texChispaTierra = this.crearTexturaTierra();
    this.texPolvoTierra = this.crearTexturaPolvo();
    this.texEstrellaAbono = this.crearTexturaEstrella();
    this.texChispaVerde = this.crearTexturaChispaVerde();
    this.texOndaAgua = this.crearTexturaOnda();
    this.texConfeti = this.crearTexturaConfeti();
  }

  // Textura circular de gota celeste
  private crearTexturaGota(): DynamicTexture {
    const tex = new DynamicTexture("texGota", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(24, 24, 9, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    return tex;
  }

  // Textura de terrón de tierra
  private crearTexturaTierra(): DynamicTexture {
    const tex = new DynamicTexture("texTierra", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#451a03";
    ctx.beginPath();
    ctx.arc(30, 30, 16, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    return tex;
  }

  // Textura de nube suave de polvo de tierra
  private crearTexturaPolvo(): DynamicTexture {
    const tex = new DynamicTexture("texPolvo", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    grad.addColorStop(0, "rgba(217, 180, 140, 0.85)");
    grad.addColorStop(0.6, "rgba(180, 140, 100, 0.45)");
    grad.addColorStop(1, "rgba(180, 140, 100, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    return tex;
  }

  // Textura de estrella mágica de nutrientes dorada
  private crearTexturaEstrella(): DynamicTexture {
    const tex = new DynamicTexture("texEstrella", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.lineTo(40, 24);
    ctx.lineTo(60, 32);
    ctx.lineTo(40, 40);
    ctx.lineTo(32, 60);
    ctx.lineTo(24, 40);
    ctx.lineTo(4, 32);
    ctx.lineTo(24, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(32, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    return tex;
  }

  // Textura de chispa verde esmeralda
  private crearTexturaChispaVerde(): DynamicTexture {
    const tex = new DynamicTexture("texChispaVerde", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(28, 28, 9, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    return tex;
  }

  // Textura de onda concéntrica de agua
  private crearTexturaOnda(): DynamicTexture {
    const tex = new DynamicTexture("texOnda", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.stroke();
    tex.update();
    return tex;
  }

  // Textura de confeti festivo
  private crearTexturaConfeti(): DynamicTexture {
    const tex = new DynamicTexture("texConfeti", { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as any;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(8, 16, 48, 32);
    tex.update();
    return tex;
  }

  /**
   * Detiene y libera un ParticleSystem SIN destruir la textura compartida (disposeTexture = false).
   * Evita el bug de Babylon.js donde disposeOnStop=true destruye particleTexture y pinta partículas rosas (#FF00FF).
   */
  private programarLimpieza(ps: ParticleSystem, stopMs: number, disposeMs: number): void {
    ps.disposeOnStop = false;
    setTimeout(() => {
      try {
        ps.stop();
      } catch {
        // Ignorar si ya se detuvo
      }
    }, stopMs);
    setTimeout(() => {
      try {
        ps.dispose(false);
      } catch {
        // Ignorar si la escena ya se limpió
      }
    }, disposeMs);
  }

  /**
   * Efecto dinámico al arar: terrones de tierra saliendo + nube de polvo suave
   */
  public efectoArarTierra(posicion: Vector3): void {
    // 1. Terrones de tierra sólidos
    const ps = new ParticleSystem("psArar", 45, this.scene);
    ps.particleTexture = this.texChispaTierra;
    ps.emitter = posicion.clone().add(new Vector3(0, 0.12, 0));
    ps.minEmitBox = new Vector3(-0.35, 0, -0.35);
    ps.maxEmitBox = new Vector3(0.35, 0.2, 0.35);

    ps.color1 = new Color4(0.54, 0.35, 0.17, 1.0);
    ps.color2 = new Color4(0.36, 0.22, 0.09, 1.0);
    ps.colorDead = new Color4(0.36, 0.22, 0.09, 0.0);

    ps.minSize = 0.09;
    ps.maxSize = 0.24;
    ps.minLifeTime = 0.35;
    ps.maxLifeTime = 0.65;
    ps.manualEmitCount = 35;
    ps.gravity = new Vector3(0, -9.8, 0);
    ps.direction1 = new Vector3(-1.2, 3.2, -1.2);
    ps.direction2 = new Vector3(1.2, 4.2, 1.2);
    ps.minEmitPower = 1.4;
    ps.maxEmitPower = 2.6;
    ps.start();
    this.programarLimpieza(ps, 500, 1300);

    // 2. Nube de polvo suave expansiva
    const psPolvo = new ParticleSystem("psPolvo", 20, this.scene);
    psPolvo.particleTexture = this.texPolvoTierra;
    psPolvo.emitter = posicion.clone().add(new Vector3(0, 0.08, 0));
    psPolvo.minEmitBox = new Vector3(-0.25, 0, -0.25);
    psPolvo.maxEmitBox = new Vector3(0.25, 0.1, 0.25);
    psPolvo.color1 = new Color4(0.85, 0.70, 0.55, 0.7);
    psPolvo.color2 = new Color4(0.70, 0.55, 0.40, 0.5);
    psPolvo.colorDead = new Color4(0.70, 0.55, 0.40, 0.0);
    psPolvo.minSize = 0.25;
    psPolvo.maxSize = 0.65;
    psPolvo.minLifeTime = 0.5;
    psPolvo.maxLifeTime = 0.9;
    psPolvo.manualEmitCount = 18;
    psPolvo.gravity = new Vector3(0, 0.8, 0);
    psPolvo.direction1 = new Vector3(-0.8, 1.0, -0.8);
    psPolvo.direction2 = new Vector3(0.8, 1.5, 0.8);
    psPolvo.minEmitPower = 0.5;
    psPolvo.maxEmitPower = 1.2;
    psPolvo.start();
    this.programarLimpieza(psPolvo, 600, 1600);
  }

  /**
   * Chorro de agua con gotas brillantes y ondas de salpicadura
   */
  public efectoRegar(origen: Vector3, destino: Vector3): { psAgua: ParticleSystem; psOndas: ParticleSystem } {
    // Chorro de gotas
    const ps = new ParticleSystem("psAgua", 150, this.scene);
    ps.particleTexture = this.texGota;
    ps.emitter = origen.clone();
    ps.minEmitBox = new Vector3(-0.09, -0.05, -0.09);
    ps.maxEmitBox = new Vector3(0.09, 0.05, 0.09);

    ps.color1 = new Color4(0.4, 0.85, 1.0, 0.95);
    ps.color2 = new Color4(0.15, 0.65, 0.95, 0.85);
    ps.colorDead = new Color4(0.1, 0.4, 0.9, 0.0);

    ps.minSize = 0.08;
    ps.maxSize = 0.16;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.7;
    ps.emitRate = 110;
    ps.gravity = new Vector3(0, -9.2, 0);

    const dir = destino.subtract(origen).normalize();
    ps.direction1 = dir.add(new Vector3(-0.25, -0.2, -0.25));
    ps.direction2 = dir.add(new Vector3(0.25, -0.4, 0.25));
    ps.minEmitPower = 2.0;
    ps.maxEmitPower = 3.0;
    ps.start();
    this.programarLimpieza(ps, 650, 1500);

    // Ondas concéntricas en el suelo
    const psOndas = new ParticleSystem("psOndasAgua", 35, this.scene);
    psOndas.particleTexture = this.texOndaAgua;
    psOndas.emitter = destino.clone().add(new Vector3(0, 0.04, 0));
    psOndas.minEmitBox = new Vector3(-0.4, 0, -0.4);
    psOndas.maxEmitBox = new Vector3(0.4, 0.02, 0.4);
    psOndas.color1 = new Color4(0.5, 0.85, 1.0, 0.8);
    psOndas.color2 = new Color4(0.2, 0.7, 0.95, 0.5);
    psOndas.colorDead = new Color4(0.2, 0.7, 0.95, 0.0);
    psOndas.minSize = 0.15;
    psOndas.maxSize = 0.45;
    psOndas.minLifeTime = 0.35;
    psOndas.maxLifeTime = 0.65;
    psOndas.emitRate = 22;
    psOndas.gravity = Vector3.Zero();
    psOndas.direction1 = new Vector3(-0.1, 0.05, -0.1);
    psOndas.direction2 = new Vector3(0.1, 0.05, 0.1);
    psOndas.minEmitPower = 0.1;
    psOndas.maxEmitPower = 0.3;
    psOndas.start();
    this.programarLimpieza(psOndas, 650, 1500);

    return { psAgua: ps, psOndas };
  }

  /**
   * Efecto de abono con estrellas mágicas doradas y chispas de vitalidad verde
   */
  public efectoAbonar(posicion: Vector3): void {
    // 1. Estrellas doradas flotantes
    const psEstrellas = new ParticleSystem("psAbonoEstrellas", 60, this.scene);
    psEstrellas.particleTexture = this.texEstrellaAbono;
    psEstrellas.emitter = posicion.clone().add(new Vector3(0, 0.35, 0));
    psEstrellas.minEmitBox = new Vector3(-0.5, 0, -0.5);
    psEstrellas.maxEmitBox = new Vector3(0.5, 0.4, 0.5);

    psEstrellas.color1 = new Color4(1.0, 0.9, 0.2, 1.0);
    psEstrellas.color2 = new Color4(0.95, 0.7, 0.1, 0.9);
    psEstrellas.colorDead = new Color4(0.9, 0.6, 0.0, 0.0);

    psEstrellas.minSize = 0.14;
    psEstrellas.maxSize = 0.32;
    psEstrellas.minLifeTime = 0.7;
    psEstrellas.maxLifeTime = 1.3;
    psEstrellas.manualEmitCount = 45;
    psEstrellas.gravity = new Vector3(0, 0.6, 0);
    psEstrellas.direction1 = new Vector3(-1, 1.8, -1);
    psEstrellas.direction2 = new Vector3(1, 2.8, 1);
    psEstrellas.minEmitPower = 0.8;
    psEstrellas.maxEmitPower = 1.8;
    psEstrellas.start();
    this.programarLimpieza(psEstrellas, 900, 2300);

    // 2. Chispas verdes esmeralda de vitalidad celular
    const psVerde = new ParticleSystem("psAbonoVerde", 50, this.scene);
    psVerde.particleTexture = this.texChispaVerde;
    psVerde.emitter = posicion.clone().add(new Vector3(0, 0.2, 0));
    psVerde.minEmitBox = new Vector3(-0.4, 0, -0.4);
    psVerde.maxEmitBox = new Vector3(0.4, 0.3, 0.4);

    psVerde.color1 = new Color4(0.2, 0.9, 0.35, 1.0);
    psVerde.color2 = new Color4(0.4, 0.95, 0.5, 0.85);
    psVerde.colorDead = new Color4(0.1, 0.7, 0.2, 0.0);

    psVerde.minSize = 0.1;
    psVerde.maxSize = 0.24;
    psVerde.minLifeTime = 0.6;
    psVerde.maxLifeTime = 1.1;
    psVerde.manualEmitCount = 40;
    psVerde.gravity = new Vector3(0, -0.4, 0);
    psVerde.direction1 = new Vector3(-1, 1.2, -1);
    psVerde.direction2 = new Vector3(1, 2.0, 1);
    psVerde.minEmitPower = 0.6;
    psVerde.maxEmitPower = 1.4;
    psVerde.start();
    this.programarLimpieza(psVerde, 800, 2000);
  }

  /**
   * Destello dorado y halo estelar al sembrar la semilla
   */
  public efectoSiembra(posicion: Vector3): void {
    const ps = new ParticleSystem("psSembrar", 40, this.scene);
    ps.particleTexture = this.texEstrellaAbono;
    ps.emitter = posicion.clone().add(new Vector3(0, 0.12, 0));
    ps.color1 = new Color4(1.0, 0.92, 0.3, 1.0);
    ps.color2 = new Color4(0.98, 0.65, 0.1, 0.9);
    ps.colorDead = new Color4(0.9, 0.5, 0.0, 0.0);
    ps.minSize = 0.12;
    ps.maxSize = 0.28;
    ps.manualEmitCount = 35;
    ps.gravity = new Vector3(0, 0.2, 0);
    ps.minEmitPower = 0.8;
    ps.maxEmitPower = 1.8;
    ps.start();
    this.programarLimpieza(ps, 700, 1800);
  }

  /**
   * Explosión de confeti multicolor festivo y estrellas al cosechar
   */
  public efectoCosechaFestiva(posicion: Vector3): void {
    const colores = [
      new Color4(0.92, 0.28, 0.20, 1), // Rojo cálido
      new Color4(1, 0.85, 0.1, 1),     // Amarillo maíz
      new Color4(0.2, 0.85, 0.3, 1),   // Verde hoja
      new Color4(0.25, 0.65, 1.0, 1),  // Celeste
      new Color4(0.96, 0.62, 0.04, 1)  // Ámbar dorado (sin rosa/magenta)
    ];

    colores.forEach((col, idx) => {
      const ps = new ParticleSystem(`psConfeti_${idx}`, 35, this.scene);
      ps.particleTexture = this.texConfeti;
      ps.emitter = posicion.clone().add(new Vector3(0, 0.5, 0));
      ps.minEmitBox = new Vector3(-0.3, -0.3, -0.3);
      ps.maxEmitBox = new Vector3(0.3, 0.3, 0.3);
      ps.color1 = col;
      ps.color2 = col;
      ps.colorDead = new Color4(col.r, col.g, col.b, 0.0);
      ps.minSize = 0.14;
      ps.maxSize = 0.28;
      ps.minLifeTime = 1.2;
      ps.maxLifeTime = 2.2;
      ps.manualEmitCount = 30;
      ps.gravity = new Vector3(0, -3.2, 0);
      ps.direction1 = new Vector3(-2.2, 4.5, -2.2);
      ps.direction2 = new Vector3(2.2, 6.5, 2.2);
      ps.minEmitPower = 2.2;
      ps.maxEmitPower = 4.5;
      ps.minAngularSpeed = -4.5;
      ps.maxAngularSpeed = 4.5;
      ps.start();
      this.programarLimpieza(ps, 1400, 3600);
    });

    // Estrellas doradas ascendentes de trofeo
    const psEstrellas = new ParticleSystem("psCosechaEstrellas", 40, this.scene);
    psEstrellas.particleTexture = this.texEstrellaAbono;
    psEstrellas.emitter = posicion.clone().add(new Vector3(0, 0.6, 0));
    psEstrellas.color1 = new Color4(1.0, 0.95, 0.4, 1.0);
    psEstrellas.color2 = new Color4(0.98, 0.75, 0.1, 0.9);
    psEstrellas.colorDead = new Color4(0.9, 0.6, 0.0, 0.0);
    psEstrellas.minSize = 0.18;
    psEstrellas.maxSize = 0.38;
    psEstrellas.minLifeTime = 1.0;
    psEstrellas.maxLifeTime = 1.8;
    psEstrellas.manualEmitCount = 35;
    psEstrellas.gravity = new Vector3(0, 1.2, 0);
    psEstrellas.direction1 = new Vector3(-1.5, 2.5, -1.5);
    psEstrellas.direction2 = new Vector3(1.5, 4.0, 1.5);
    psEstrellas.minEmitPower = 1.5;
    psEstrellas.maxEmitPower = 3.0;
    psEstrellas.start();
    this.programarLimpieza(psEstrellas, 1200, 3000);
  }

  // Métodos simplificados / alias para el Surco de Milpa (v3.0)
  public emitirPolvo(pos: Vector3): void {
    this.efectoArarTierra(pos);
  }

  public emitirGotas(pos: Vector3): void {
    this.efectoRegar(pos.add(new Vector3(0, 0.5, 0)), pos);
  }

  public emitirOndas(_pos: Vector3): void {
    // Las ondas ya se emiten coordinadamente en efectoRegar
  }

  public emitirChispasAbono(pos: Vector3): void {
    this.efectoAbonar(pos);
  }

  public emitirHaloSemilla(pos: Vector3): void {
    this.efectoSiembra(pos);
  }

  public emitirConfeti(pos: Vector3): void {
    this.efectoCosechaFestiva(pos);
  }

  /**
   * M5: Nube descendente de polen dorado al sacudir la espiga hacia los jilotes
   */
  public emitirPolenDorado(pos: Vector3): void {
    const ps = new ParticleSystem("psPolenDorado", 55, this.scene);
    ps.particleTexture = this.texEstrellaAbono;
    ps.emitter = pos.clone();
    ps.minEmitBox = new Vector3(-0.22, -0.05, -0.22);
    ps.maxEmitBox = new Vector3(0.22, 0.08, 0.22);
    ps.color1 = new Color4(1.0, 0.92, 0.25, 0.95);
    ps.color2 = new Color4(0.98, 0.78, 0.1, 0.85);
    ps.colorDead = new Color4(0.95, 0.65, 0.0, 0.0);
    ps.minSize = 0.06;
    ps.maxSize = 0.15;
    ps.minLifeTime = 0.7;
    ps.maxLifeTime = 1.4;
    ps.manualEmitCount = 45;
    ps.gravity = new Vector3(0, -1.35, 0);
    ps.direction1 = new Vector3(-0.6, -0.3, -0.6);
    ps.direction2 = new Vector3(0.6, 0.4, 0.6);
    ps.minEmitPower = 0.4;
    ps.maxEmitPower = 1.1;
    ps.start();
    this.programarLimpieza(ps, 1000, 2400);
  }
}
