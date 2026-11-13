import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Mesh,
  MeshBuilder,
  TransformNode,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";
import { TipoSemilla, VARIEDADES_MAIZ, VariedadMaizConfig } from "../nucleo";
import { CanastaRecoleccion3D } from "../vr/canasta_cosecha";
import { AudioSintetizador } from "../audio_sintetizador";
import { BusEventos } from "./bus_eventos";
import { dibujarIcono } from "../ui/iconos_pixel";
import {
  crearTexMaderaPixel,
  crearTexTejaPixel,
  crearMaterialPixelTex,
  dibujarMarcoLetreroPixel
} from "../ui/texturas_pixel_3d";

export interface MazorcaDrop {
  id: number;
  variedad: VariedadMaizConfig;
  calidad: number;
  root: TransformNode;
  mesh: Mesh;
  posicion: Vector3;
  velocidad: Vector3;
  enSuelo: boolean;
  tiempoVida: number;
  recogida: boolean;
}

export interface EstadoAlmacen {
  porVariedad: Record<TipoSemilla, number>;
  calidades: number[];
}

/**
 * Sistema Estilo Minecraft de Drops Físicos 3D de Mazorcas y Almacenamiento en Troje/Cofre
 *
 * 1. Al cosechar una planta madura, saltan de 2 a 3 mazorcas 3D físicas al suelo (con rebote
 *    y rotación flotante estilo Minecraft).
 * 2. El jugador las recolecta acercándose (< 1.65 m, imán automático) o haciendo clic sobre ellas,
 *    pasando a su inventario de mano (CanastaRecoleccion3D).
 * 3. El jugador puede llevar sus mazorcas a la Troje / Cofre de Almacenamiento 3D (x = 2.6, z = -1.35)
 *    para almacenarlas de forma permanente (persistido en localStorage), viendo cómo se apilan
 *    físicamente dentro de la troje.
 */
export class AlmacenMazorcas {
  private static readonly STORAGE_KEY = "milpaviva.almacen.v1";

  private readonly scene: Scene;
  private readonly canasta: CanastaRecoleccion3D;
  private readonly audio: AudioSintetizador;
  private readonly bus: BusEventos;

  public readonly raiz: TransformNode;
  private letreroTex!: DynamicTexture;
  private mazorcasVisualesTroje: Mesh[] = [];
  private modalEl: HTMLDivElement | null = null;

  public dropsActivos: MazorcaDrop[] = [];
  private contadorDrops = 0;

  public almacenadoPorVariedad: Record<TipoSemilla, number> = {
    chalqueno: 0,
    azul: 0,
    rojo: 0,
    palomero: 0
  };
  public calidadesAlmacenadas: number[] = [];
  private matTrojePool = new Map<string, StandardMaterial>();

  public onMensajeToast?: (msg: string) => void;
  public onCambioInventario?: () => void;

  constructor(
    scene: Scene,
    canasta: CanastaRecoleccion3D,
    audio: AudioSintetizador,
    bus: BusEventos
  ) {
    this.scene = scene;
    this.canasta = canasta;
    this.audio = audio;
    this.bus = bus;

    this.raiz = new TransformNode("almacenTrojeRoot", this.scene);
    // Ubicado al extremo derecho del surco de milpa, accesible caminando
    this.raiz.position.set(2.65, 0, -1.35);
    this.raiz.computeWorldMatrix(true);

    this.cargarAlmacen();
    this.construirTroje3D();
    this.construirModalUI();
    this.actualizarVisualesTroje();
  }

  public get totalAlmacenado(): number {
    return (
      this.almacenadoPorVariedad.chalqueno +
      this.almacenadoPorVariedad.azul +
      this.almacenadoPorVariedad.rojo +
      this.almacenadoPorVariedad.palomero
    );
  }

  public get totalEnMano(): number {
    return this.canasta.totalCosechados;
  }

  private cargarAlmacen(): void {
    try {
      const raw = localStorage.getItem(AlmacenMazorcas.STORAGE_KEY);
      if (raw) {
        const parsed: EstadoAlmacen = JSON.parse(raw);
        if (parsed && parsed.porVariedad) {
          this.almacenadoPorVariedad = {
            chalqueno: parsed.porVariedad.chalqueno || 0,
            azul: parsed.porVariedad.azul || 0,
            rojo: parsed.porVariedad.rojo || 0,
            palomero: parsed.porVariedad.palomero || 0
          };
          this.calidadesAlmacenadas = Array.isArray(parsed.calidades) ? parsed.calidades : [];
        }
      }
    } catch {
      // Ignorar errores de storage
    }
  }

  public guardarAlmacen(): void {
    try {
      const data: EstadoAlmacen = {
        porVariedad: this.almacenadoPorVariedad,
        calidades: this.calidadesAlmacenadas.slice(-60)
      };
      localStorage.setItem(AlmacenMazorcas.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignorar
    }
  }

  /**
   * Construye la Troje Campesina / Cofre de Almacenamiento de Mazorcas 3D
   */
  private construirTroje3D(): void {
    const colorContorno = Color3.FromHexString("#25330f");

    const matMadera = crearMaterialPixelTex(
      this.scene,
      "matTrojeMaderaPx",
      crearTexMaderaPixel(this.scene, false, 2, 1),
      "#451a03",
      0.18
    );

    const matTecho = crearMaterialPixelTex(
      this.scene,
      "matTrojeTechoPx",
      crearTexTejaPixel(this.scene, 3, 2),
      "#78350f",
      0.18
    );

    const matHerraje = new StandardMaterial("matTrojeHerraje", this.scene);
    matHerraje.diffuseColor = Color3.FromHexString("#eab308");
    matHerraje.emissiveColor = Color3.FromHexString("#ca8a04").scale(0.45);

    // Base tipo cofre/troje abierta donde se ven las mazorcas apiladas
    const cajaBase = MeshBuilder.CreateBox(
      "almacenCofreBase",
      { width: 0.95, height: 0.52, depth: 0.68 },
      this.scene
    );
    cajaBase.position.set(0, 0.26, 0);
    cajaBase.material = matMadera;
    cajaBase.renderOutline = true;
    cajaBase.outlineColor = colorContorno;
    cajaBase.outlineWidth = 0.018;
    cajaBase.parent = this.raiz;

    // Banda dorada frontal estilo cofre Minecraft
    const cerrojo = MeshBuilder.CreateBox(
      "almacenCerrojo",
      { width: 0.14, height: 0.16, depth: 0.72 },
      this.scene
    );
    cerrojo.position.set(0, 0.42, 0);
    cerrojo.material = matHerraje;
    cerrojo.renderOutline = true;
    cerrojo.outlineColor = colorContorno;
    cerrojo.outlineWidth = 0.012;
    cerrojo.parent = this.raiz;

    // 4 Postes esquineros que sostienen el tejadillo de la troje
    const esquinas = [
      [-0.44, -0.30],
      [0.44, -0.30],
      [-0.44, 0.30],
      [0.44, 0.30]
    ];
    for (let i = 0; i < esquinas.length; i++) {
      const [ex, ez] = esquinas[i];
      const poste = MeshBuilder.CreateCylinder(
        `almacenPoste_${i}`,
        { diameter: 0.06, height: 1.15, tessellation: 8 },
        this.scene
      );
      poste.position.set(ex, 0.58, ez);
      poste.material = matMadera;
      poste.parent = this.raiz;
    }

    // Tejadillo protector de dos aguas
    const techo = MeshBuilder.CreateCylinder(
      "almacenTecho",
      { diameterTop: 0.1, diameterBottom: 0.95, height: 1.12, tessellation: 3 },
      this.scene
    );
    techo.rotation.z = Math.PI / 2;
    techo.position.set(0, 1.22, 0);
    techo.material = matTecho;
    techo.renderOutline = true;
    techo.outlineColor = colorContorno;
    techo.outlineWidth = 0.016;
    techo.parent = this.raiz;

    // Letrero 3D frontal pixel-art con el conteo de mazorcas almacenadas
    this.letreroTex = new DynamicTexture(
      "texLetreroAlmacen",
      { width: 320, height: 160 },
      this.scene,
      false,
      Texture.NEAREST_SAMPLINGMODE
    );
    const matLetrero = new StandardMaterial("matLetreroAlmacen", this.scene);
    matLetrero.diffuseTexture = this.letreroTex;
    matLetrero.emissiveColor = new Color3(0.65, 0.65, 0.65);

    const letrero = MeshBuilder.CreatePlane(
      "almacenLetrero",
      { width: 0.72, height: 0.36 },
      this.scene
    );
    letrero.position.set(0, 0.92, -0.36);
    letrero.material = matLetrero;
    letrero.renderOutline = true;
    letrero.outlineColor = colorContorno;
    letrero.outlineWidth = 0.014;
    letrero.parent = this.raiz;

    // Pool de 24 mazorcas visuales dentro de la troje que se activan según el inventario guardado
    for (let i = 0; i < 24; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4) % 2;
      const capa = Math.floor(i / 8);

      const cob = MeshBuilder.CreateCylinder(
        `almacenCobVis_${i}`,
        { height: 0.20, diameterTop: 0.05, diameterBottom: 0.068, tessellation: 10 },
        this.scene
      );
      cob.rotation.z = Math.PI / 2 + (i % 2 === 0 ? 0.08 : -0.08);
      cob.rotation.y = ((i * 1.3) % 0.5) - 0.25;
      cob.position.set(
        -0.27 + col * 0.18,
        0.54 + capa * 0.065,
        -0.12 + row * 0.22
      );
      cob.parent = this.raiz;
      cob.setEnabled(false);
      this.mazorcasVisualesTroje.push(cob);
    }

    // Registrar clic directo en el cofre o letrero
    const mallasClick = [cajaBase, cerrojo, techo, letrero];
    for (const m of mallasClick) {
      m.isPickable = true;
      m.actionManager = new ActionManager(this.scene);
      m.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.interactuarConTroje();
        })
      );
    }
  }

  /**
   * Acción principal al interactuar con la Troje en 3D:
   * Si el jugador trae mazorcas en la mano, las almacena automáticamente y muestra el estado;
   * si no trae mazorcas en la mano, abre el modal de gestión del Almacén.
   */
  public interactuarConTroje(): void {
    if (this.canasta.totalCosechados > 0) {
      this.almacenarTodasDeMano();
    } else {
      this.alternarModal();
    }
  }

  /**
   * Genera de 2 a 3 mazorcas físicas 3D que saltan al suelo al cosechar una planta (estilo Minecraft)
   */
  public spawnearDropsCosecha(
    variedad: VariedadMaizConfig,
    posicionPlanta: Vector3,
    calidad = 0.9,
    cantidad = 2
  ): void {
    for (let i = 0; i < cantidad; i++) {
      const id = ++this.contadorDrops;
      const root = new TransformNode(`mazorcaDropRoot_${id}`, this.scene);
      const posInicial = posicionPlanta.add(new Vector3(0, 0.95, -0.15));
      root.position.copyFrom(posInicial);

      const matCob = new StandardMaterial(`matDropCob_${id}`, this.scene);
      matCob.diffuseColor = Color3.FromHexString(variedad.colorHex);
      matCob.emissiveColor = Color3.FromHexString(variedad.colorHex).scale(0.5);

      const mesh = MeshBuilder.CreateCylinder(
        `mazorcaDrop_${id}`,
        { height: 0.26, diameterTop: 0.06, diameterBottom: 0.085, tessellation: 12 },
        this.scene
      );
      mesh.rotation.z = Math.PI / 3;
      mesh.material = matCob;
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.015;
      mesh.outlineColor = Color3.FromHexString("#fef08a");
      mesh.parent = root;

      // Brácteas abiertas de totomoxtle en la base del drop
      const matHusk = new StandardMaterial(`matDropHusk_${id}`, this.scene);
      matHusk.diffuseColor = Color3.FromHexString("#fde68a");
      matHusk.emissiveColor = Color3.FromHexString("#ca8a04").scale(0.35);
      const husk = MeshBuilder.CreateCylinder(
        `mazorcaDropHusk_${id}`,
        { height: 0.12, diameterTop: 0.095, diameterBottom: 0.05, tessellation: 8 },
        this.scene
      );
      husk.position.y = -0.08;
      husk.material = matHusk;
      husk.parent = mesh;

      // Velocidad parabólica hacia el frente del surco para que el jugador las vea caer
      const ang = -Math.PI / 2 + (i - (cantidad - 1) / 2) * 0.65 + (Math.random() - 0.5) * 0.25;
      const velHoriz = 1.05 + Math.random() * 0.45;
      const velocidad = new Vector3(
        Math.cos(ang) * velHoriz,
        2.6 + Math.random() * 0.6,
        Math.sin(ang) * velHoriz
      );

      const drop: MazorcaDrop = {
        id,
        variedad,
        calidad,
        root,
        mesh,
        posicion: posInicial.clone(),
        velocidad,
        enSuelo: false,
        tiempoVida: 0,
        recogida: false
      };

      mesh.isPickable = true;
      mesh.actionManager = new ActionManager(this.scene);
      mesh.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.recogerDrop(drop);
        })
      );

      this.dropsActivos.push(drop);
    }
  }

  /**
   * Recoge un drop específico y lo añade al inventario de mano del jugador
   */
  public recogerDrop(drop: MazorcaDrop): boolean {
    if (drop.recogida) return false;
    drop.recogida = true;

    this.canasta.depositarMazorca(drop.variedad, drop.posicion.clone(), drop.calidad);
    this.audio.campanita(drop.posicion);

    drop.root.dispose();
    this.dropsActivos = this.dropsActivos.filter((d) => d.id !== drop.id);

    this.onMensajeToast?.(
      `🌽 +1 Mazorca de ${drop.variedad.nombre} recogida (En mano: ${this.canasta.totalCosechados} · Llévalas al Almacén [I])`
    );
    this.onCambioInventario?.();
    this.actualizarModalUI();
    return true;
  }

  /**
   * Permite recoger un drop haciendo clic o apuntando con el raycast en primera persona
   */
  public recogerDropPorMeshName(meshName: string): boolean {
    const match = meshName.match(/mazorcaDrop(?:Husk)?_(\d+)/);
    if (!match) return false;
    const dropId = parseInt(match[1], 10);
    const drop = this.dropsActivos.find((d) => d.id === dropId);
    if (!drop) return false;
    return this.recogerDrop(drop);
  }

  /**
   * Actualiza la física de caída/rebote, levitación estilo Minecraft y recolección magnética por cercanía
   */
  public actualizar(dt: number, posJugador: Vector3): void {
    if (this.dropsActivos.length === 0) return;

    for (let i = this.dropsActivos.length - 1; i >= 0; i--) {
      const d = this.dropsActivos[i];
      if (d.recogida) continue;

      d.tiempoVida += dt;

      if (!d.enSuelo) {
        d.velocidad.y -= 9.2 * dt;
        d.posicion.addInPlace(d.velocidad.scale(dt));

        // Rebote al tocar el suelo (y = 0.24)
        if (d.posicion.y <= 0.24) {
          d.posicion.y = 0.24;
          if (Math.abs(d.velocidad.y) > 0.9) {
            d.velocidad.y = -d.velocidad.y * 0.38;
            d.velocidad.x *= 0.55;
            d.velocidad.z *= 0.55;
          } else {
            d.enSuelo = true;
            d.velocidad.setAll(0);
          }
        }
        d.root.position.copyFrom(d.posicion);
      } else {
        // Rotación y flotación suave estilo item drop de Minecraft
        d.root.rotation.y += dt * 2.2;
        d.root.position.x = d.posicion.x;
        d.root.position.z = d.posicion.z;
        d.root.position.y = 0.24 + Math.sin(d.tiempoVida * 3.5 + d.id) * 0.045;
      }

      // Recolección magnética estilo Minecraft tras 0.55 s de haber saltado de la planta
      if (d.tiempoVida > 0.55) {
        const distXZ = Math.hypot(posJugador.x - d.posicion.x, posJugador.z - d.posicion.z);
        if (distXZ < 1.55) {
          // Atracción magnética rápida hacia el jugador
          const dir = new Vector3(
            posJugador.x - d.posicion.x,
            posJugador.y - 0.45 - d.posicion.y,
            posJugador.z - d.posicion.z
          );
          if (dir.length() < 0.42 || distXZ < 0.85) {
            this.recogerDrop(d);
            continue;
          }
          dir.normalize();
          d.posicion.addInPlace(dir.scale(dt * 6.5));
          d.root.position.copyFrom(d.posicion);
        }
      }
    }
  }

  /**
   * Transfiere todas las mazorcas de la mano (Canasta) a la Troje de Almacenamiento
   */
  public almacenarTodasDeMano(): { exito: boolean; cantidad: number; mensaje: string } {
    const total = this.canasta.totalCosechados;
    if (total <= 0) {
      const msg = "🧺 No llevas mazorcas en la mano para guardar. ¡Cosecha en el surco primero!";
      this.onMensajeToast?.(msg);
      return { exito: false, cantidad: 0, mensaje: msg };
    }

    const tipos: TipoSemilla[] = ["chalqueno", "azul", "rojo", "palomero"];
    let guardadas = 0;

    for (const t of tipos) {
      const cant = this.canasta.conteoPorVariedad[t] || 0;
      if (cant > 0) {
        this.canasta.retirarMazorca(t, cant);
        this.almacenadoPorVariedad[t] += cant;
        guardadas += cant;
      }
    }

    for (let i = 0; i < guardadas; i++) {
      this.calidadesAlmacenadas.push(this.canasta.calidadPromedio);
    }

    this.guardarAlmacen();
    this.actualizarVisualesTroje();
    this.actualizarModalUI();
    this.onCambioInventario?.();
    this.audio.cosecharExito(this.raiz.position);

    const msg = `🏛️ ¡Guardaste ${guardadas} mazorca(s) en la Troje! Total almacenado: ${this.totalAlmacenado} 🌽`;
    this.onMensajeToast?.(msg);
    return { exito: true, cantidad: guardadas, mensaje: msg };
  }

  /**
   * Almacena 1 mazorca de una variedad específica desde la mano a la Troje
   */
  public almacenarPorVariedad(tipo: TipoSemilla): boolean {
    if ((this.canasta.conteoPorVariedad[tipo] || 0) <= 0) {
      this.onMensajeToast?.(`No llevas mazorcas de ${VARIEDADES_MAIZ[tipo].nombre} en la mano.`);
      return false;
    }
    if (this.canasta.retirarMazorca(tipo, 1)) {
      this.almacenadoPorVariedad[tipo]++;
      this.calidadesAlmacenadas.push(this.canasta.calidadPromedio);
      this.guardarAlmacen();
      this.actualizarVisualesTroje();
      this.actualizarModalUI();
      this.onCambioInventario?.();
      this.audio.campanita(this.raiz.position);
      this.onMensajeToast?.(
        `📥 Guardada 1 mazorca de ${VARIEDADES_MAIZ[tipo].nombre} en la Troje (${this.almacenadoPorVariedad[tipo]}).`
      );
      return true;
    }
    return false;
  }

  /**
   * Retira 1 mazorca de la Troje de vuelta a la mano del jugador
   */
  public retirarDeAlmacenAMano(tipo: TipoSemilla): boolean {
    if ((this.almacenadoPorVariedad[tipo] || 0) <= 0) {
      this.onMensajeToast?.(`No hay mazorcas de ${VARIEDADES_MAIZ[tipo].nombre} en el almacén.`);
      return false;
    }
    this.almacenadoPorVariedad[tipo]--;
    const cal = this.calidadesAlmacenadas.pop() ?? 0.9;
    this.canasta.depositarMazorca(VARIEDADES_MAIZ[tipo], undefined, cal);
    this.guardarAlmacen();
    this.actualizarVisualesTroje();
    this.actualizarModalUI();
    this.onCambioInventario?.();
    this.audio.clickUI();
    this.onMensajeToast?.(
      `📤 Tomaste 1 mazorca de ${VARIEDADES_MAIZ[tipo].nombre} del Almacén a tu mano.`
    );
    return true;
  }

  /**
   * Permite que el Fogón o el Banco de Semillas consuman una mazorca (primero de mano, si no del almacén)
   */
  public consumirMazorcaDisponible(): { exito: boolean; origen: "mano" | "almacen" | "ninguno"; calidad: number } {
    if (this.canasta.totalCosechados > 0) {
      const cal = this.canasta.calidadPromedio;
      this.canasta.retirarMazorca();
      this.onCambioInventario?.();
      this.actualizarModalUI();
      return { exito: true, origen: "mano", calidad: cal };
    }

    const tipos: TipoSemilla[] = ["chalqueno", "azul", "rojo", "palomero"];
    for (const t of tipos) {
      if (this.almacenadoPorVariedad[t] > 0) {
        this.almacenadoPorVariedad[t]--;
        const cal = this.calidadesAlmacenadas.pop() ?? 0.9;
        this.guardarAlmacen();
        this.actualizarVisualesTroje();
        this.actualizarModalUI();
        this.onCambioInventario?.();
        return { exito: true, origen: "almacen", calidad: cal };
      }
    }

    return { exito: false, origen: "ninguno", calidad: 0.85 };
  }

  /**
   * Actualiza las mazorcas 3D apiladas dentro de la Troje y su letrero dinámico
   */
  public actualizarVisualesTroje(): void {
    const coloresOrden: string[] = [];
    const tipos: TipoSemilla[] = ["chalqueno", "azul", "rojo", "palomero"];
    for (const t of tipos) {
      const cant = this.almacenadoPorVariedad[t];
      const hex = VARIEDADES_MAIZ[t].colorHex;
      for (let k = 0; k < cant; k++) {
        coloresOrden.push(hex);
      }
    }

    for (let i = 0; i < this.mazorcasVisualesTroje.length; i++) {
      const m = this.mazorcasVisualesTroje[i];
      if (i < coloresOrden.length) {
        m.setEnabled(true);
        const hex = coloresOrden[i];
        let mat = this.matTrojePool.get(hex);
        if (!mat) {
          mat = new StandardMaterial(`matTrojeCob_${hex}`, this.scene);
          mat.diffuseColor = Color3.FromHexString(hex);
          mat.emissiveColor = Color3.FromHexString(hex).scale(0.32);
          mat.specularColor = new Color3(0.04, 0.04, 0.04);
          this.matTrojePool.set(hex, mat);
        }
        m.material = mat;
      } else {
        m.setEnabled(false);
      }
    }

    if (!this.letreroTex) return;
    const ctx = this.letreroTex.getContext() as any;
    const W = 320;
    const H = 160;

    dibujarMarcoLetreroPixel(ctx, W, H, "#c6c6c6", "#2b2b2b", "#ffffff", 4);

    ctx.fillStyle = "#1e1e1e";
    ctx.font = 'bold 18px "Pixelify Sans", monospace';
    ctx.fillText(`Troje / Almacen: ${this.totalAlmacenado}`, 14, 28);
    dibujarIcono(ctx, "mazorca", 270, 12, 1);

    ctx.font = 'bold 13px "Pixelify Sans", monospace';
    ctx.fillStyle = "#d97706";
    dibujarIcono(ctx, "mazorca", 14, 44, 1);
    ctx.fillText(`Chalqueno: ${this.almacenadoPorVariedad.chalqueno}`, 36, 57);

    ctx.fillStyle = "#4338ca";
    dibujarIcono(ctx, "mazorca", 168, 44, 1);
    ctx.fillText(`Azul: ${this.almacenadoPorVariedad.azul}`, 190, 57);

    ctx.fillStyle = "#b91c1c";
    dibujarIcono(ctx, "mazorca", 14, 76, 1);
    ctx.fillText(`Rojo: ${this.almacenadoPorVariedad.rojo}`, 36, 89);

    ctx.fillStyle = "#ea580c";
    dibujarIcono(ctx, "mazorca", 168, 76, 1);
    ctx.fillText(`Palomero: ${this.almacenadoPorVariedad.palomero}`, 190, 89);

    ctx.fillStyle = "#15803d";
    ctx.font = 'bold 12px "Pixelify Sans", monospace';
    ctx.fillText("[Clic] o [I] Abrir Cofre / Troje", 14, 134);

    this.letreroTex.update();
  }

  private construirModalUI(): void {
    if (typeof document === "undefined") return;
    const modal = document.createElement("div");
    modal.id = "almacenMazorcasModal";
    modal.className = "mc-panel";
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: var(--mc-gris, #c6c6c6); color: #1e1e1e;
      border: 4px solid; border-color: #ffffff #555555 #555555 #ffffff;
      padding: 18px 22px; width: min(520px, 94vw); z-index: 2500;
      box-shadow: 0 0 0 4px #000; display: none;
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;
    this.actualizarModalUI();
  }

  public alternarModal(): void {
    if (!this.modalEl) return;
    const visible = this.modalEl.style.display === "block";
    this.modalEl.style.display = visible ? "none" : "block";
    if (!visible) this.actualizarModalUI();
  }

  public actualizarModalUI(): void {
    if (!this.modalEl) return;

    const tipos: { id: TipoSemilla; icono: string; nombre: string; col: string }[] = [
      { id: "chalqueno", icono: "🌽", nombre: "Maíz Chalqueño", col: "#f59e0b" },
      { id: "azul", icono: "🟣", nombre: "Maíz Azul Mixteco", col: "#6366f1" },
      { id: "rojo", icono: "🔴", nombre: "Maíz Rojo Ceremonial", col: "#ef4444" },
      { id: "palomero", icono: "🍿", nombre: "Palomero Toluqueño", col: "#f97316" }
    ];

    const filas = tipos
      .map((t) => {
        const enMano = this.canasta.conteoPorVariedad[t.id] || 0;
        const enTroje = this.almacenadoPorVariedad[t.id] || 0;
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.12);padding:8px 12px;border:2px solid #555;margin-bottom:6px;border-left:6px solid ${t.col};">
            <div>
              <div style="font-weight:700;font-size:0.95rem;color:#1e1e1e;">${t.icono} ${t.nombre}</div>
              <div style="font-size:0.82rem;color:#555;">En Mano: <b>${enMano}</b> · En Troje: <b>${enTroje}</b></div>
            </div>
            <div style="display:flex;gap:6px;">
              <button data-guardar="${t.id}" style="padding:6px 12px;border:2px solid;border-color:#fff #333 #333 #fff;background:#16a34a;color:#fff;font-weight:700;cursor:pointer;font-size:0.8rem;border-radius:0;" ${enMano <= 0 ? "disabled style='opacity:0.4;padding:6px 12px;border:2px solid #555;background:#8b8b8b;color:#fff;border-radius:0;'" : ""}>
                📥 Guardar
              </button>
              <button data-sacar="${t.id}" style="padding:6px 12px;border:2px solid;border-color:#fff #333 #333 #fff;background:#d97706;color:#fff;font-weight:700;cursor:pointer;font-size:0.8rem;border-radius:0;" ${enTroje <= 0 ? "disabled style='opacity:0.4;padding:6px 12px;border:2px solid #555;background:#8b8b8b;color:#fff;border-radius:0;'" : ""}>
                📤 Sacar
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    this.modalEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid #555;padding-bottom:6px;">
        <div>
          <h3 style="margin:0;color:#1e1e1e;font-size:1.18rem;font-weight:700;">🏛️ Troje Campesina: Almacén de Mazorcas</h3>
          <span style="font-size:0.82rem;color:#444;">Guarda tus mazorcas cosechadas o sácalas para el Fogón [F] y Banco de Semillas [M].</span>
        </div>
        <button id="btnCerrarAlmacen" style="background:#8b8b8b;border:2px solid;border-color:#fff #333 #333 #fff;color:#fff;font-size:1.1rem;cursor:pointer;padding:2px 8px;border-radius:0;">✕</button>
      </div>
      <div style="display:flex;justify-content:space-between;background:rgba(0,0,0,0.08);padding:8px 12px;border:2px solid #555;margin-bottom:10px;font-size:0.9rem;color:#1e1e1e;">
        <span>🎒 <b>En Mano / Canasta:</b> ${this.totalEnMano} mazorcas</span>
        <span>🏛️ <b>En la Troje:</b> ${this.totalAlmacenado} mazorcas</span>
      </div>
      ${filas}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="btnGuardarTodasTroje" style="flex:1;padding:10px;border:3px solid;border-color:#fff #333 #333 #fff;background:#22c55e;color:#052e16;font-weight:800;cursor:pointer;border-radius:0;font-size:0.95rem;">
          📥 Guardar Todas de mi Mano (${this.totalEnMano})
        </button>
      </div>
    `;

    this.modalEl.querySelector("#btnCerrarAlmacen")?.addEventListener("click", () => {
      if (this.modalEl) this.modalEl.style.display = "none";
    });

    this.modalEl.querySelector("#btnGuardarTodasTroje")?.addEventListener("click", () => {
      this.almacenarTodasDeMano();
    });

    this.modalEl.querySelectorAll("[data-guardar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tipo = (btn as HTMLElement).getAttribute("data-guardar") as TipoSemilla;
        if (tipo) this.almacenarPorVariedad(tipo);
      });
    });

    this.modalEl.querySelectorAll("[data-sacar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tipo = (btn as HTMLElement).getAttribute("data-sacar") as TipoSemilla;
        if (tipo) this.retirarDeAlmacenAMano(tipo);
      });
    });
  }
}
