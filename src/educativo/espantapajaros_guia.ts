/**
 * Personaje Guía 3D Diegético: "Don Elote / El Espantapájaros Sabio de la Milpa" (v3.0)
 *
 * Ubicado en el huerto para orientar al usuario con sabiduría ancestral mesoamericana,
 * datos agronómicos reales y leyendas culturales de las razas de maíz.
 *
 * Cuenta con rostro expresivo (ojos de botón, sonrisa, bigote de pelos de elote y paliacate),
 * rotación cefálica que sigue al jugador, y sintetizador de voz caricaturesca.
 */

import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ShadowGenerator,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { TipoSemilla, VARIEDADES_MAIZ } from "../nucleo";
import { AudioSintetizador } from "../audio_sintetizador";
import { AjustesSistema } from "../juego/ajustes";

export interface PistaContextual {
  prioridad: 0 | 1 | 2 | 3 | 4; // 0 = crítica (evento climático), 1 = estrés alto, 2 = misión, 3 = consejo, 4 = folclore
  topico: string;
  titulo: string;
  texto: string;
  posObjetivo?: Vector3;
}

export interface DatoMaiz {
  titulo: string;
  texto: string;
  categoria: "general" | "palomero" | "azul" | "rojo" | "chalqueno" | "milpa";
}

export const DATOS_MAIZ: DatoMaiz[] = [
  {
    categoria: "palomero",
    titulo: "🍿 Maíz Palomero Toluqueño (El Abuelo de 5,000 Años)",
    texto: "¡Es la raza más antigua! Su endospermo durísimo encierra humedad; al calentarse explota de adentro hacia afuera creando 'momochtli' (palomitas), que los mexicas ofrecían a Xiuhtecuhtli, dios del fuego."
  },
  {
    categoria: "azul",
    titulo: "💜 Maíz Azul Cónico (El Tesoro de Antocianinas)",
    texto: "¡Mira ese color púrpura! Proviene de las antocianinas, potentes antioxidantes que protegen a la planta contra el frío de los volcanes y cuidan tu corazón. ¡Es la base de las mejores tortillas y tlacoyos!"
  },
  {
    categoria: "rojo",
    titulo: "❤️ Maíz Rojo (Tlatlauhquicintli, Sangre de la Tierra)",
    texto: "Sus flavonoides rojizos le dan un escudo contra sequías intensas y plagas. En las ceremonias tradicionales, este grano sagrado se usaba para preparar atoles energéticos y pinole medicinal."
  },
  {
    categoria: "chalqueno",
    titulo: "🌽 Maíz Chalqueño (El Coloso de los Valles)",
    texto: "¡El gigante de Chalco y Amecameca! Sus cañas pueden superar los 3.5 metros con mazorcas pesadas de hasta 20 hileras de granos. Por su textura cremosa y dulce, es el rey absoluto del elote callejero y el pozole."
  },
  {
    categoria: "milpa",
    titulo: "🌿 La Tríada Sagrada: Milpa Mesoamericana",
    texto: "¡La unión hace la fuerza! El maíz sirve de poste; el frijol trepa por su tallo y fija nitrógeno con bacterias en la raíz; y la calabaza extiende sus hojas como un tapete vivo que impide la maleza y retiene el agua."
  },
  {
    categoria: "general",
    titulo: "🌾 ¿Sabías que el maíz no puede vivir sin nosotros?",
    texto: "A diferencia de las plantas silvestres, el elote está envuelto herméticamente en hojas (totomoxtle). Si cae al suelo, los granos se pudren juntos. ¡Necesita de manos campesinas para desgranarse y renacer!"
  },
  {
    categoria: "general",
    titulo: "✨ De Teocintle a Mazorca",
    texto: "Hace más de 9,000 años, nuestros antepasados domesticaron un pastito silvestre llamado Teocintle, que solo daba 6 a 12 granos durísimos. ¡Miles de años de selección campesina crearon la maravillosa mazorca actual!"
  },
  {
    categoria: "azul",
    titulo: "🔥 El Secreto de la Nixtamalización",
    texto: "Hervir el maíz con cal de piedra (nixtamal) fue el mayor descubrimiento químico mesoamericano: libera la vitamina B3 (niacina), ablanda el grano y transforma el almidón para formar la masa perfecta."
  }
];

export class EspantapajarosGuia {
  readonly scene: Scene;
  readonly root: TransformNode;
  public audio: AudioSintetizador | null = null;

  private headMesh!: Mesh;
  private hatMesh!: Mesh;
  private neckMesh!: Mesh;
  private leftArm!: TransformNode;
  private rightArm!: TransformNode;
  private globoMesh!: Mesh;
  private globoTex!: DynamicTexture;

  private indiceDatoActual = 0;
  private timerMensaje: any = null;

  // M11: Don Elote 2.0 — Cola de prioridad, cooldown por tópico y brazo apuntador
  public ajustes: AjustesSistema | null = null;
  private colaPistas: PistaContextual[] = [];
  private cooldownTopicos: Map<string, number> = new Map();
  private readonly COOLDOWN_TOPICO_MS = 90000;
  private posApuntada: Vector3 | null = null;
  private finApuntadoMs = 0;

  constructor(
    scene: Scene,
    shadowGen: ShadowGenerator | null = null,
    audio: AudioSintetizador | null = null,
    ajustes: AjustesSistema | null = null
  ) {
    this.scene = scene;
    this.audio = audio;
    this.ajustes = ajustes;
    this.root = new TransformNode("espantapajarosRoot", scene);
    this.root.position.set(-4.2, 0, -0.8); // Extremo izquierdo de la hilera (protege radio 2.6m)

    this.construirCuerpo(shadowGen);
    this.construirRostro();
    this.construirGloboDialogo();

    this.decir(
      "¡Hola, agricultor estrella! 🌽 Camina con [W,A,S,D], usa la azada para arar y pulsa [E] para aprender secretos milenarios del maíz.",
      8.0
    );
  }

  private mat(hex: string, em = 0.35): StandardMaterial {
    const m = new StandardMaterial(`matEsp_${hex}_${Math.random()}`, this.scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    return m;
  }

  private ink(mesh: Mesh, width = 0.015, colHex = "#25330f"): void {
    mesh.renderOutline = true;
    mesh.outlineWidth = width;
    mesh.outlineColor = Color3.FromHexString(colHex);
  }

  private construirCuerpo(shadowGen: ShadowGenerator | null): void {
    const woodMat = this.mat("#78350f", 0.3);

    // Poste vertical
    const poste = MeshBuilder.CreateCylinder("posteEspanta", { diameter: 0.09, height: 1.85 }, this.scene);
    poste.position.set(0, 0.925, 0);
    poste.material = woodMat;
    poste.parent = this.root;
    this.ink(poste);

    // Torso con camisa a cuadros roja
    const torso = MeshBuilder.CreateBox("torsoEspanta", { width: 0.42, height: 0.50, depth: 0.24 }, this.scene);
    torso.position.set(0, 1.25, 0);
    torso.material = this.mat("#dc2626", 0.45);
    torso.parent = this.root;
    this.ink(torso);

    // Paliacate rojo al cuello
    this.neckMesh = MeshBuilder.CreateTorus("paliacateEspanta", { diameter: 0.22, thickness: 0.06 }, this.scene);
    this.neckMesh.position.set(0, 1.50, 0);
    this.neckMesh.rotation.x = Math.PI / 2;
    this.neckMesh.material = this.mat("#b91c1c", 0.55);
    this.neckMesh.parent = this.root;
    this.ink(this.neckMesh);

    // Cabeza de costal / mazorca
    this.headMesh = MeshBuilder.CreateSphere("cabezaEspanta", { diameter: 0.32, segments: 16 }, this.scene);
    this.headMesh.position.set(0, 1.66, 0);
    this.headMesh.material = this.mat("#fef08a", 0.45);
    this.headMesh.parent = this.root;
    this.ink(this.headMesh);

    // Sombrero de paja de ala ancha
    const hatMat = this.mat("#ca8a04", 0.4);
    this.hatMesh = MeshBuilder.CreateCylinder("alaSombrero", { diameter: 0.58, height: 0.035 }, this.scene);
    this.hatMesh.position.set(0, 1.82, 0);
    this.hatMesh.material = hatMat;
    this.hatMesh.parent = this.root;
    this.ink(this.hatMesh);

    const copaSombrero = MeshBuilder.CreateCylinder("copaSombrero", { diameterTop: 0.26, diameterBottom: 0.32, height: 0.18 }, this.scene);
    copaSombrero.position.set(0, 1.92, 0);
    copaSombrero.material = hatMat;
    copaSombrero.parent = this.root;
    this.ink(copaSombrero);

    // Brazos de madera con mangas
    this.leftArm = new TransformNode("leftArmEspanta", this.scene);
    this.leftArm.position.set(-0.22, 1.40, 0);
    this.leftArm.parent = this.root;

    const brazoIzq = MeshBuilder.CreateBox("brazoIzqMesh", { width: 0.42, height: 0.07, depth: 0.07 }, this.scene);
    brazoIzq.position.set(-0.20, 0, 0);
    brazoIzq.material = woodMat;
    brazoIzq.parent = this.leftArm;
    this.ink(brazoIzq, 0.012);

    this.rightArm = new TransformNode("rightArmEspanta", this.scene);
    this.rightArm.position.set(0.22, 1.40, 0);
    this.rightArm.parent = this.root;

    const brazoDer = MeshBuilder.CreateBox("brazoDerMesh", { width: 0.42, height: 0.07, depth: 0.07 }, this.scene);
    brazoDer.position.set(0.20, 0, 0);
    brazoDer.material = woodMat;
    brazoDer.parent = this.rightArm;
    this.ink(brazoDer, 0.012);

    if (shadowGen) {
      shadowGen.addShadowCaster(poste);
      shadowGen.addShadowCaster(torso);
      shadowGen.addShadowCaster(this.headMesh);
    }

    const registrarClickDonElote = (m: Mesh) => {
      m.isPickable = true;
      m.actionManager = new ActionManager(this.scene);
      m.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.compartirSiguienteDato();
        })
      );
    };
    registrarClickDonElote(torso);
    registrarClickDonElote(this.headMesh);
    registrarClickDonElote(this.hatMesh);
    registrarClickDonElote(copaSombrero);
  }

  private construirRostro(): void {
    const matCarbon = this.mat("#0f172a", 0.1);
    const matPeloElote = this.mat("#d97706", 0.5);

    // Ojos de botón de carbón con reflejos simpáticos
    const ojoIzq = MeshBuilder.CreateSphere("ojoIzqEspanta", { diameter: 0.045 }, this.scene);
    ojoIzq.position.set(-0.065, 1.70, 0.14);
    ojoIzq.material = matCarbon;
    ojoIzq.parent = this.root;

    const ojoDer = MeshBuilder.CreateSphere("ojoDerEspanta", { diameter: 0.045 }, this.scene);
    ojoDer.position.set(0.065, 1.70, 0.14);
    ojoDer.material = matCarbon;
    ojoDer.parent = this.root;

    // Sonrisa cosida con puntos rústicos
    for (let i = -2; i <= 2; i++) {
      const puntoBoca = MeshBuilder.CreateSphere(`bocaPunto_${i}`, { diameter: 0.022 }, this.scene);
      const x = i * 0.032;
      const y = 1.58 + Math.abs(i) * 0.01;
      puntoBoca.position.set(x, y, 0.148);
      puntoBoca.material = matCarbon;
      puntoBoca.parent = this.root;
    }

    // Bigote simpático de estigmas / pelos de elote
    const bigoteIzq = MeshBuilder.CreateCylinder("bigoteIzq", { height: 0.09, diameter: 0.02 }, this.scene);
    bigoteIzq.position.set(-0.05, 1.63, 0.15);
    bigoteIzq.rotation.z = Math.PI / 3;
    bigoteIzq.material = matPeloElote;
    bigoteIzq.parent = this.root;

    const bigoteDer = MeshBuilder.CreateCylinder("bigoteDer", { height: 0.09, diameter: 0.02 }, this.scene);
    bigoteDer.position.set(0.05, 1.63, 0.15);
    bigoteDer.rotation.z = -Math.PI / 3;
    bigoteDer.material = matPeloElote;
    bigoteDer.parent = this.root;
  }

  private construirGloboDialogo(): void {
    const W = 512;
    const H = 200;
    this.globoTex = new DynamicTexture("texGloboEspanta", { width: W, height: H }, this.scene, true);

    const mat = new StandardMaterial("matGloboEspanta", this.scene);
    mat.diffuseTexture = this.globoTex;
    mat.emissiveColor = new Color3(0.95, 0.95, 0.95);
    mat.backFaceCulling = false;

    this.globoMesh = MeshBuilder.CreatePlane("globoEspanta", {
      width: 1.55,
      height: 0.62,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);
    this.globoMesh.position.set(0.85, 1.75, 0.1);
    this.globoMesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    this.globoMesh.material = mat;
    this.globoMesh.parent = this.root;

    this.ink(this.globoMesh, 0.018);
    this.globoMesh.isPickable = true;
    this.globoMesh.actionManager = new ActionManager(this.scene);
    this.globoMesh.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        this.compartirSiguienteDato();
      })
    );
  }

  /**
   * Muestra un mensaje en el globo 3D y reproduce fonemas sintetizados
   */
  public decir(texto: string, duracionSeg = 6.0, titulo = "🧑‍🌾 Don Elote:"): void {
    const ctx = this.globoTex.getContext() as any;
    const W = 512;
    const H = 200;

    ctx.fillStyle = "#fffdf0";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    // Cabecera con título
    ctx.fillStyle = "#92400e";
    ctx.font = 'bold 22px "Pixelify Sans", monospace';
    ctx.fillText(titulo, 20, 36);

    ctx.fillStyle = "#1e293b";
    ctx.font = 'bold 16px "Pixelify Sans", monospace';

    // Envolver texto en varias líneas fluidas
    const palabras = texto.split(" ");
    let linea = "";
    let y = 70;
    for (const palabra of palabras) {
      const prueba = linea + palabra + " ";
      if (ctx.measureText(prueba).width > W - 42) {
        ctx.fillText(linea, 20, y);
        linea = palabra + " ";
        y += 26;
      } else {
        linea = prueba;
      }
    }
    ctx.fillText(linea, 20, y);

    // Pie con pista de interacción
    ctx.fillStyle = "#b45309";
    ctx.font = '14px "Pixelify Sans", monospace';
    ctx.fillText("[Clic] o [E] para aprender más", 20, H - 16);

    this.globoTex.update();

    // Reproducir voz sintetizada 3D (sin duplicar subtítulo extra en pantalla)
    this.audio?.vozDonElote(this.root.position);

    if (this.timerMensaje) clearTimeout(this.timerMensaje);
    if (duracionSeg > 0) {
      this.timerMensaje = setTimeout(() => {
        // Regresa a cartel de bienvenida relajado o procesa la siguiente pista en cola
        if (this.colaPistas.length > 0) {
          this.procesarSiguientePista();
        } else {
          this.mostrarCartelReposo();
        }
      }, duracionSeg * 1000);
    }
  }

  /**
   * M11: Encola una pista contextual con prioridad (0..4) y cooldown de 90s por tópico
   */
  public encolarPista(pista: PistaContextual): void {
    const ahora = performance.now();
    const ultimo = this.cooldownTopicos.get(pista.topico) || 0;
    if (ahora - ultimo < this.COOLDOWN_TOPICO_MS && pista.prioridad > 0) {
      return;
    }

    this.cooldownTopicos.set(pista.topico, ahora);
    this.colaPistas.push(pista);
    this.colaPistas.sort((a, b) => a.prioridad - b.prioridad);

    if (pista.prioridad === 0 || !this.timerMensaje) {
      this.procesarSiguientePista();
    }
  }

  private procesarSiguientePista(): void {
    const sig = this.colaPistas.shift();
    if (!sig) return;
    if (sig.posObjetivo) {
      this.apuntarHacia(sig.posObjetivo, 7500);
    }
    this.decir(sig.texto, 7.5, sig.titulo);
  }

  /**
   * M11: Orienta el brazo derecho de Don Elote hacia una estación que necesita atención
   */
  public apuntarHacia(posMundo: Vector3, duracionMs: number = 6000): void {
    this.posApuntada = posMundo.clone();
    this.finApuntadoMs = performance.now() + duracionMs;
  }

  /**
   * Cartel de reposo invitando al jugador a interactuar
   */
  private mostrarCartelReposo(): void {
    const ctx = this.globoTex.getContext() as any;
    const W = 512;
    const H = 200;

    ctx.fillStyle = "#fffdf0";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    ctx.fillStyle = "#92400e";
    ctx.font = 'bold 22px "Pixelify Sans", monospace';
    ctx.fillText("🧑‍🌾 Don Elote:", 20, 36);

    ctx.fillStyle = "#1e293b";
    ctx.font = 'bold 18px "Pixelify Sans", monospace';
    ctx.fillText("¡Ven a platicar conmigo! 🌽", 20, 85);

    ctx.fillStyle = "#4b5563";
    ctx.font = '16px "Pixelify Sans", monospace';
    ctx.fillText("Pulsa [E] o haz clic en mí para saber", 20, 122);
    ctx.fillText("todo sobre las 4 razas nativas mexicanas.", 20, 150);

    this.globoTex.update();
  }

  /**
   * Enseña el siguiente dato fascinante sobre el maíz
   */
  public compartirSiguienteDato(): void {
    const dato = DATOS_MAIZ[this.indiceDatoActual];
    this.indiceDatoActual = (this.indiceDatoActual + 1) % DATOS_MAIZ.length;

    this.decir(dato.texto, 8.5, dato.titulo);
  }

  /**
   * Enseña un dato específico según la raza que el jugador está mirando
   */
  public compartirDatoRaza(variedad: TipoSemilla): void {
    const dato = DATOS_MAIZ.find(d => d.categoria === variedad);
    if (dato) {
      this.decir(dato.texto, 8.0, dato.titulo);
    } else {
      this.compartirSiguienteDato();
    }
  }

  /**
   * Anima al personaje y orienta su cabeza hacia la posición del jugador
   */
  public animar(tiempo: number, viento: number, posJugador?: Vector3): void {
    // 1. Balanceo suave del espantapájaros con el viento
    this.root.rotation.z = Math.sin(tiempo * 2.2) * (0.02 + viento * 0.005);
    if (this.leftArm) {
      this.leftArm.rotation.z = Math.sin(tiempo * 3.0) * 0.22 + 0.35; // Saluda animadamente
    }
    if (this.rightArm) {
      if (this.posApuntada && performance.now() < this.finApuntadoMs) {
        this.rightArm.rotation.z = 0.55 + Math.sin(tiempo * 6.0) * 0.12;
      } else {
        this.rightArm.rotation.z = -Math.sin(tiempo * 2.5) * 0.15 - 0.2;
      }
    }

    // 2. Si apunta a un nodo, o si el jugador está cerca (menos de 7m), girar la vista
    const objetivoVista =
      this.posApuntada && performance.now() < this.finApuntadoMs
        ? this.posApuntada
        : posJugador;
    if (objetivoVista) {
      const dist = Vector3.Distance(this.root.position, objetivoVista);
      if (dist < 10.0) {
        const dx = objetivoVista.x - this.root.position.x;
        const dz = objetivoVista.z - this.root.position.z;
        const anguloDeseado = Math.atan2(dx, dz);

        // Suavizado de giro
        this.root.rotation.y += (anguloDeseado - this.root.rotation.y) * 0.08;
      }
    }
  }
}
