#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script generador del documento Markdown integral:
DOCUMENTACION_COMPLETA_Y_CODIGO.md

Contiene:
1. Explicación profunda y detallada de la arquitectura, funcionamiento, modelos agrofisiológicos y jugabilidad.
2. Árbol de archivos del repositorio.
3. El código fuente 100% íntegro de cada archivo, con su ruta exacta y explicación detallada de su funcionamiento interno.
"""

import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_FILE = os.path.join(BASE_DIR, "DOCUMENTACION_COMPLETA_Y_CODIGO.md")

def leer_archivo(ruta_rel):
    ruta_abs = os.path.join(BASE_DIR, ruta_rel)
    if not os.path.exists(ruta_abs):
        return f"// Archivo no encontrado: {ruta_rel}"
    with open(ruta_abs, "r", encoding="utf-8") as f:
        return f.read()

# Definición de archivos con metadatos y explicaciones técnicas detalladas
ARCHIVOS_CONFIG = [
    {
        "ruta": "package.json",
        "lenguaje": "json",
        "titulo": "Configuración del Paquete y Dependencias del Proyecto (`package.json`)",
        "descripcion": """Define los metadatos del proyecto, scripts de compilación, ejecución y dependencias clave:
- **`@babylonjs/core`**: Motor 3D WebGL2/WebXR de alto rendimiento para renderizado de escenas, mallas, materiales y cámaras.
- **`@babylonjs/gui`**: Módulo de interfaces gráficas 2D y 3D en el espacio espacial (usado en las consolas científicas y texturas dinámicas).
- **`@babylonjs/inspector`**: Herramienta de depuración y análisis de nodos de escena en tiempo de desarrollo.
- **`vite` & `@vitejs/plugin-basic-ssl`**: Servidor de desarrollo ultra-rápido con Hot Module Replacement (HMR) y generación automática de certificados SSL para pruebas WebXR en dispositivos móviles y visores autónomos como Meta Quest 2/3.
- **`typescript`**: Compilador estricto para garantizar seguridad de tipos en la simulación matemática y lógica de juego."""
    },
    {
        "ruta": "tsconfig.json",
        "lenguaje": "json",
        "titulo": "Configuración del Compilador TypeScript (`tsconfig.json`)",
        "descripcion": """Configura las directivas de transpilación y verificación estricta de tipos:
- **Target `ES2022`**: Soporta características modernas de JavaScript (campos de clase privados, top-level await, métodos estáticos avanzados).
- **`moduleResolution: bundler`**: Integración nativa con empaquetadores modernos (Vite) para resolver importaciones ESM fluidamente.
- **`strict: true`**: Habilita comprobaciones estrictas de nulabilidad (`strictNullChecks`), enlace de `this` y tipos no implícitos `any`, vital para garantizar estabilidad matemática en el pipeline de simulación."""
    },
    {
        "ruta": "vite.config.ts",
        "lenguaje": "typescript",
        "titulo": "Configuración de Vite (`vite.config.ts`)",
        "descripcion": """Configura el empaquetador Vite con directivas optimizadas:
- Soporte para variables de entorno (como `NO_HTTPS=true` para ejecutar sobre HTTP puro en local si se requiere depuración rápida).
- Inclusión condicional de `@vitejs/plugin-basic-ssl` para levantar un servidor HTTPS local firmado al vuelo, requisito indispensable de la API WebXR Device en navegadores modernos (Chrome, Safari, Meta Quest Browser)."""
    },
    {
        "ruta": "index.html",
        "lenguaje": "html",
        "titulo": "Punto de Entrada HTML (`index.html`)",
        "descripcion": """Estructura HTML5 base que aloja el canvas de renderizado 3D y elementos diegéticos de interfaz:
- **`#renderCanvas`**: Lienzo principal WebGL2 que ocupa el 100% de la ventana sin barras de desplazamiento.
- **`#crosshair`**: Retícula minimalista central en pantalla para apuntar con precisión en modo primera persona (FPS).
- **`#crosshair-tooltip`**: Etiqueta flotante reactiva al raycasting del jugador que muestra el nombre del objeto y la interacción disponible cuando el usuario apunta a un montículo, herramienta, control o a Don Elote.
- Estilos CSS incrustados con aceleración por hardware, tipografía de sistema clara y desactivación de selección de texto accidental durante el juego."""
    }
]

ARCHIVOS_SRC_NUCLEO = [
    {
        "ruta": "src/nucleo.ts",
        "lenguaje": "typescript",
        "titulo": "Motor Agrofisiológico, Ontogenia C4 y Razas Nativas (`src/nucleo.ts`)",
        "descripcion": """Es el corazón agronómico y biofísico de la aplicación. Implementa con rigor científico las leyes de desarrollo de *Zea mays* L.:
1. **Ontogenia Estricta por Grados Día de Desarrollo (Ritchie & Hanway, 1982):**
   - 13 etapas fenológicas modeladas: `SEMILLA` (0 GDD), `VE` (75 GDD, emergencia del coleóptilo), `V2` (180 GDD, dos hojas con collar visible), `V4` (320 GDD, diferenciación meristemática), `V6` (480 GDD, punto de crecimiento sobre el suelo), `V8` (660 GDD, primer verticilo de raíces zanco), `V12` (1050 GDD, definición de número potencial de óvulos), `VT` (1200 GDD, espiga masculina desplegada emitiendo polen), `R1` (1350 GDD, emisión de jilote y estigmas), `R2` (1500 GDD, grano en estado de ampolla acuosa), `R3` (1700 GDD, grano lechoso óptimo para elote), `R4` (1900 GDD, grano masoso), `R5` (2050 GDD, grano dentado) y `R6` (2200 GDD, madurez fisiológica con formación de capa negra).
2. **Ecuación de Acumulación Térmica (GDD):**
   $$\\text{GDD} = \\max\\left(0, \\; \\frac{\\min(T_{\\max}, 34) + \\max(T_{\\min}, 10)}{2} - 10\\right)$$
3. **Fotosíntesis C4 y Balance de Carbono:**
   - Modela la tasa de asimilación neta de $\\text{CO}_2$ ($A_n$) acoplando la cinética de la PEP carboxilasa y RuBisCO, la saturación por radiación PAR (Michaelis-Menten) y la curva óptima de temperatura ($30-33^\\circ\\text{C}$).
4. **Física del Suelo y Balance Hídrico Continuo (Modelo Campbell):**
   - Monitorea el contenido volumétrico de agua edáfica ($\\theta_{\\text{VWC}}$), punto de marchitez permanente (PMP $\\approx 0.12$), capacidad de campo (CC $\\approx 0.32$) y saturación ($\\approx 0.45$).
5. **Estrés Abiótico Multifactorial:**
   - **Hídrico:** Marchitez foliar progresiva y cierre estomático si $\\theta \\to \\text{PMP}$.
   - **Térmico:** Inhibición enzimática por calor ($T > 38^\\circ\\text{C}$) o necrosis celular irreversible por helada ($T < 0^\\circ\\text{C}$).
   - **Encharcamiento / Hipoxia:** Asfixia radicular por anoxia si el suelo permanece saturado más de 48 horas continuas.
   - **Acidez / Toxicidad por Aluminio:** Retardo en crecimiento y clorosis cuando $\\text{pH} < 5.0$.
   - **Acame Biomecánico:** Riesgo de vuelco por interacción entre ráfagas de viento y ablandamiento del suelo por lluvia intensa.
6. **Las 4 Razas Nativas de Maíz Mexicano:**
   - **Chalqueño (`chalqueno`):** Porte monumental (hasta 3.5 m), ciclo tardío (2050 GDD), mazorcas doradas gigantes ideales para pozole.
   - **Azul Cónico (`azul`):** Porte medio (2.4 m), ciclo de 1950 GDD, rico en antocianinas protectoras de la radiación UV y heladas de gran altitud.
   - **Rojo (`rojo`):** Porte medio-alto (2.6 m), alta resistencia a sequía estival (0.80), granos carmesí profundos.
   - **Palomero Toluqueño (`palomero`):** Raza ancestral milenaria (>5,000 años), porte compacto (1.8 m), endospermo hiperdenso que revienta en palomitas (*momochtli*).
7. **Simbiosis de la Milpa Tradicional:**
   - Asociación con frijol: fijación biológica de nitrógeno (+1.5% de vigor diario acumulativo).
   - Asociación con calabaza: cobertura vegetal que actúa como mulch vivo reduciendo la evaporación del suelo en un 35%."""
    },
    {
        "ruta": "src/clima.ts",
        "lenguaje": "typescript",
        "titulo": "Micrometeorología, Física de la Atmósfera y FAO-56 Penman-Monteith (`src/clima.ts`)",
        "descripcion": """Gestiona la física atmosférica y las variables microclimáticas del entorno de cultivo:
1. **Evapotranspiración de Referencia FAO-56 Penman-Monteith:**
   $$ET_0 = \\frac{0.408 \\Delta (R_n - G) + \\gamma \\frac{900}{T + 273} u_2 (e_s - e_a)}{\\Delta + \\gamma (1 + 0.34 u_2)}$$
   Donde $\\Delta$ es la pendiente de la curva de presión de saturación, $R_n$ la radiación neta, $G$ el flujo de calor del suelo, $\\gamma$ la constante psicrométrica, $u_2$ la velocidad del viento a 2 metros, $e_s$ la presión de vapor de saturación y $e_a$ la presión real.
2. **Psicrometría y Radiación Solar:**
   - Ecuaciones de Tetens para presiones de vapor de saturación y cálculo preciso del punto de rocío y déficit de presión de vapor (VPD).
   - Cálculo de la radiación solar extraterrestre y global basada en la latitud de los Valles Altos de México ($19.43^\\circ\\text{N}$) y el día del año.
3. **10 Escenarios Bioclimáticos Preconfigurados:**
   - `Temporal Óptimo`: Condiciones ideales de lluvia y calor estival.
   - `Canícula / Sequía`: Alta temperatura, viento seco y radiación intensa sin lluvia.
   - `Helada Otoño`: Vientos polares y temperaturas bajo cero provocando congelación.
   - `Tormenta / Acame`: Lluvia torrencial y ráfagas huracanadas para probar resistencia mecánica.
   - `Suelo Ácido`: pH edáfico en 4.5 para simular suelos volcánicos desbalanceados.
   - `Ola de Calor`: Temperaturas continuas superiores a 40°C.
   - `Atardecer`: Iluminación dorada cálida para disfrute visual.
   - `Suelo Alcalino`: pH en 8.5 con bloqueo de hierro y zinc.
   - `Invernadero CO2`: 800 ppm de dióxido de carbono para comprobar el límite fotosintético C4.
   - `Noche Fresca`: Inversión térmica nocturna típica del altiplano."""
    },
    {
        "ruta": "src/crecimiento.ts",
        "lenguaje": "typescript",
        "titulo": "Historial Temporal y Snapshots de Cultivo (`src/crecimiento.ts`)",
        "descripcion": """Administra la línea de tiempo fenológica y la persistencia de estados diarios:
- **`SnapshotDia`**: Captura fotográfica completa de todas las variables anatómicas y fisiológicas de la planta en cada día del ciclo (biomasa foliar, biomasa de caña, biomasa radicular, peso de mazorca, LAI, índice de estrés, reservas de carbohidratos).
- **`avanzarDesarrollo()`**: Función pura que toma el estado actual, el clima del día y ejecuta la integración temporal agrofisiológica actualizando la ontogenia.
- **`irADia()`**: Permite el viaje en el tiempo instantáneo (hacia adelante o atrás en el calendario de cultivo), recomputando o restaurando con total consistencia matemática el fenotipo de la planta."""
    },
    {
        "ruta": "src/buffer_60_renders.ts",
        "lenguaje": "typescript",
        "titulo": "Pipeline Matemático de 60 Renders para WebXR Zero-GC (`src/buffer_60_renders.ts`)",
        "descripcion": """Resuelve de raíz el mayor desafío de rendimiento en cascos de Realidad Virtual autónomos (como Meta Quest 2/3): las pausas por recolección de basura (*Garbage Collector judder*).
Discretiza el ciclo vital en 60 estados continuos y precalcula 7 Tablas de Consulta (LUT):
1. **`LUT_ALTURA_NORMA[60]`**: Curva sigmoidea logística de elongación de caña:
   $$\\text{altura}(f) = \\frac{1.0}{1.0 + e^{-10.0 \\cdot (f - 0.40)}}$$
2. **`LUT_HOJAS_COUNT[60]`**: Número entero de hojas acintadas desplegadas (de 1 a 12).
3. **`LUT_HOJA_CURL[60]`**: Factor de curvatura hidrostática foliar.
4. **`LUT_ESPIGA_APERTURA[60]`**: Ángulo de apertura de la panoja masculina.
5. **`LUT_ELOTE_ESCALA[60]`**: Factor de escala volumétrica del jilote y mazorca.
6. **`LUT_TOTOMOX_ABRE[60]`**: Despliegue de las brácteas de totomoxtle exponiendo los granos.
7. **`LUT_RAICES_ZANCO[60]`**: Crecimiento y anclaje de raíces adventicias al suelo.
8. **`obtenerEstadoMorph60(frameFloat)`**: Interpola linealmente a 60 FPS garantizando transiciones suaves sin creación de nuevos objetos en memoria.
9. **`obtenerEstadoSuelo60()`**: Modula el albedo del montículo (tierra clara compacta vs. tierra oscura húmeda baada) y el nivel de brillo especular por agua libre."""
    },
    {
        "ruta": "src/maiz_estilizado.ts",
        "lenguaje": "typescript",
        "titulo": "Generador Procedural Cel-Shaded de Maíz (*Zea mays*) (`src/maiz_estilizado.ts`)",
        "descripcion": """Construye y anima la planta tridimensional en Babylon.js con estilo de ilustración tradicional:
- **Tallo con Entrenudos:** Segmentación cilíndrica con nudos anulares abultados que se elongan siguiendo la LUT sigmoidea.
- **Hojas Acintadas (Ribbons):** Geometría generada por extrusión suave a lo largo de splines cúbicos que se curvan en el espacio 3D según su turgencia hidrostática, complementadas por una nervadura central cilíndrica.
- **Mazorca Procedural con Textura Dinámica:** Cilindro ovoide texturizado mediante un lienzo `DynamicTexture` que dibuja las hileras de granos individuales (14 a 16 hileras) pintadas con el pigmento específico de la raza elegida (amarillo, azul, rojo o perla), cubiertas por brácteas de totomoxtle modeladas y cabellos de elote (*estigmas*).
- **Espiga Apical (Panoja):** Raquis central ramificado con anteras amarillas que liberan polen.
- **Raíces de Anclaje (*Brace Roots*):** Verticilos de raíces aéreas curvadas que descienden de los primeros nudos hacia el montículo de tierra.
- **Renderizado Cel-Shading:** Aplicación de contornos de tinta oscura (`renderOutline = true`, `outlineColor = #25330f`) y sombreado toon de dos tonos.
- **Cinemática de Viento Dinámico:** Deformación angular continua dependiente de la altura de cada nudo y de la velocidad de las ráfagas meteorológicas."""
    },
    {
        "ruta": "src/surco_milpa.ts",
        "lenguaje": "typescript",
        "titulo": "Camellón Agronómico Continuo y Labranza 3D (`src/surco_milpa.ts`)",
        "descripcion": """Reemplaza el antiguo montículo aislado por un auténtico surco lineal de milpa mexicana de 5.2 metros con 6 estaciones de cultivo:
- **`NodoSurco`**: Estructura de datos individual por cada planta que gestiona montículo, mallas de surcos labrados, semillas 3D visibles, charco reflectante, planta de maíz, letrero rústico y teletransporte.
- **Labranza Física con Azada (`arar()`):** Esculpe dinámicamente 3 ranuras longitudinales sobre el montículo (`surcosMesh`), aumentando progresivamente el nivel de arado del suelo (34% por golpe).
- **Siembra Tridimensional (`sembrar()`):** Revela 3 granos 3D descansando en el fondo del surco labrado con el color de la raza nativa seleccionada.
- **Riego y Formación de Charcos (`regar()`):** Incrementa la humedad volumétrica; al superar el 38% activa una lámina líquida reflectante con transparencia procedural.
- **Fertilización Biológica (`abonar()`):** Incrementa los niveles de NPK y el vigor celular de la planta.
- **Cosecha Inmersiva (`cosechar()`):** Detecta madurez fisiológica (R3+), oculta la mazorca madura de la caña con un sonido crujiente y la transfiere a la canasta de recolección."""
    },
    {
        "ruta": "src/ambiente_estilizado.ts",
        "lenguaje": "typescript",
        "titulo": "Entorno 3D, Anillo Volcánico de 360° y Cobertizo Rústico (`src/ambiente_estilizado.ts`)",
        "descripcion": """Construye el mundo rural estilizado donde transcurre la experiencia:
- **Cúpula Celeste y Ciclo Solar/Lunar:** Domo celeste con gradientes de color cel-shaded que transitan de azul brillante diurno a tonos cálidos crepusculares y azul noche estrellado, con el sol y la luna orbitando con iluminación direccional acoplada.
- **Anillo Volcánico de 360° de la Cuenca de México:**
  - Siluetas tridimensionales del Popocatépetl, Iztaccíhuatl, Nevado de Toluca y Cerro del Ajusco rodeando el horizonte.
  - **Manto Nival Reactivo a la Temperatura:** Cuando la temperatura desciende a $T \\le 5^\\circ\\text{C}$, los picos volcánicos se cubren proceduralmente de capas de nieve blanca reluciente.
- **Cobertizo Campesino de Madera:** Estructura con postes de pino, techumbre a dos aguas con láminas rústicas y piso de tierra compacta donde se ubica la mesa meteorológica.
- **Valla Campesina:** Cercado perimetral con postes de madera viva y alambre de púas protegiendo la parcela de milpa."""
    },
    {
        "ruta": "src/audio_sintetizador.ts",
        "lenguaje": "typescript",
        "titulo": "Sintetizador de Audio Procedural WebAudio (`src/audio_sintetizador.ts`)",
        "descripcion": """Motor de síntesis acústica en tiempo real 100% nativo mediante la API WebAudio del navegador (`AudioContext`):
- **Cero Dependencias de Archivos Externos:** Elimina por completo las descargas de archivos mp3/wav, eliminando latencias, tiempos de carga y problemas de CORS.
- **Sonidos Diseñados Matemáticamente:**
  - `golpeAzada()`: Oscilador sinusoidal con rampa exponencial descendente ($120\\to 32\\text{ Hz}$) sumado a una ráfaga de ruido blanco con filtro pasabanda en $450\\text{ Hz}$.
  - `iniciarAgua()` / `detenerAgua()`: Ruido blanco continuo procesado por filtro pasabanda en $1100\\text{ Hz}$ modulado por un oscilador LFO de baja frecuencia a $8.5\\text{ Hz}$ emulando el gorgoteo de agua corriente.
  - `semillas()`: Tres impulsos de onda triangular ($650, 830, 1010\\text{ Hz}$) de $50\\text{ ms}$.
  - `abono()`: Arpegio ascendente brillante en acorde de Do Mayor ($C_5, E_5, G_5, C_6$).
  - `cosecha()`: Chasquido percusivo de fractura botánica ($380\\to 95\\text{ Hz}$).
  - `vozDonElote()`: Formantes sintéticos resonantes en $950\\text{ Hz}$ imitando habla cómica y expresiva de personaje de caricatura.
  - `paso()`: Ráfaga de ruido blanco atenuada por filtro pasabajas en $320\\text{ Hz}$ simulando pisadas en tierra y hojarasca."""
    },
    {
        "ruta": "src/controlador_jugador.ts",
        "lenguaje": "typescript",
        "titulo": "Controlador de Jugador FPS, Cámara y Raycasting (`src/controlador_jugador.ts`)",
        "descripcion": """Implementa la experiencia de videojuego en primera persona dentro del cultivo:
- **Cinemática de Movimiento:**
  - Lectura de teclado `WASD` / Flechas, con aceleración progresiva y carrera rápida con `Shift` ($4.6\\text{ m/s}$).
  - Rotación mediante ratón con `PointerLockControls` (haz clic para bloquear el cursor, `Esc` para liberar) y con teclado usando teclas `Q` y `E`.
- **Balanceo Cefálico (*Head Bobbing*) y Pasos:**
  - Oscilación sinusoidal vertical y horizontal de la cámara al caminar acoplada a la cadencia de emisión de pasos sonoros (`audio.paso()`).
- **Sistema de Raycasting Contextual (8 Metros):**
  - Emite un rayo continuo desde el centro de la cámara FPS. Al colisionar con montículos de cultivo, letreros, controles del cobertizo o con Don Elote, agranda la retícula central a color dorado (`#fbbf24`) y despliega un tooltip contextual flotante indicando la acción posible.
- **Alternancia Fluida de Cámara (`V`):**
  - Conmuta instantáneamente entre el modo en primera persona y la cámara orbital de inspección 360°."""
    },
    {
        "ruta": "src/paneles_vr.ts",
        "lenguaje": "typescript",
        "titulo": "Consolas Científicas Espaciales 3D (`src/paneles_vr.ts`)",
        "descripcion": """Proyecta tres consolas flotantes curvadas en el espacio tridimensional para investigación agronómica avanzada:
1. **Consola Central (Reloj Fenológico y Time-Lapse):**
   - Deslizador de días de cultivo (1 a 240 días).
   - Botones de reproducción a velocidad acelerada ($1\\times, 3\\times, 6\\times, 12\\times$ días por segundo).
   - Lecturas de biomasa acumulada en gramos (tallo, hojas, raíces, mazorca) y fase ontogénica.
2. **Consola Izquierda (Panel Meteorológico):**
   - 11 deslizadores interactivos: Temperatura, Humedad Relativa, Presión Barométrica, Hora del Día, Nubosidad, Precipitación, Velocidad del Viento, Humedad del Suelo, pH Edáfico, Concentración de $\\text{CO}_2$ y Material Particulado PM2.5.
   - Selector directo para los 10 escenarios bioclimáticos.
3. **Consola Derecha (Diagnóstico Ecofisiológico):**
   - Evapotranspiración FAO-56 ($ET_0$ en mm/día).
   - Tasa de fotosíntesis neta C4 ($A_n$ en $\\mu\\text{mol CO}_2/\\text{m}^2/\\text{s}$).
   - 6 barras de telemetría de estrés en tiempo real: Hídrico, Térmico, Helada, Encharcamiento, pH y Viento/Acame, coloreadas de verde a rojo según la severidad."""
    },
    {
        "ruta": "src/main.ts",
        "lenguaje": "typescript",
        "titulo": "Orquestador Principal y Bucle de Renderizado (`src/main.ts`)",
        "descripcion": """Punto de arranque que inicializa el motor Babylon.js y coordina todos los subsistemas:
1. Crea el canvas WebGL2 y el `Engine` gráfico con renderizado adaptativo.
2. Configura la cámara FPS y la cámara orbital, integrándolas en el `ControladorJugador`.
3. Instancia el surco de milpa con sus 6 estaciones, el ambiente 3D, el cobertizo, Don Elote, el carrito de recolección y las consolas espaciales.
4. Despacha los eventos de teclado globales:
   - `1` a `6`: Selección de herramientas del viewmodel.
   - `E`: Diálogo diegético con Don Elote.
   - `V`: Alternar modo de cámara (FPS / Orbital).
   - `C`: Abrir/cerrar panel de clima 2D.
   - `H`: Mostrar/ocultar consolas espaciales 3D.
   - `Tab`: Saltar a la siguiente estación del surco.
   - `L`: Viajar al cobertizo de clima.
   - `Enter`: Entrar al campo de cultivo.
   - `R`: Activar rotación automática de la cámara orbital.
5. Registra el bucle `scene.registerBeforeRender` sincronizando audio, partículas, física del surco, balanceo del viewmodel y avance del tiempo agronómico.
6. Habilita la sesión inmersiva WebXR si se detecta un casco de Realidad Virtual conectado."""
    }
]

ARCHIVOS_SRC_VR = [
    {
        "ruta": "src/vr/viewmodel_herramientas.ts",
        "lenguaje": "typescript",
        "titulo": "Viewmodel en Primera Persona y Brazos 3D (`src/vr/viewmodel_herramientas.ts`)",
        "descripcion": """Construye el rig de manos y herramientas que el jugador sostiene en pantalla en modo FPS:
- **Estructura Cinemática:** Anclada directamente a la cámara del jugador, con manos caricaturescas sosteniendo la herramienta activa.
- **Herramientas 3D Modeladas:**
  1. *Azada campesina:* Mango de encino pulido, cuello de unión y hoja de acero templado.
  2. *Saco de semillas:* Costal de yute rústico con granos nativos asomando por la boca.
  3. *Regadera metálica:* Depósito curvo, asa superior, pico vertedor y roseta perforada con partículas de gotas.
  4. *Trowel de abono:* Pala de mano cargada con compost orgánico oscuro y destellos esmeralda.
  5. *Guante de cosecha:* Mano campesina articulada lista para prensar la mazorca.
- **Balanceo Inercial (*Weapon Sway*):** Las herramientas oscilan suavemente ante los movimientos del ratón y el desplazamiento del usuario simulando peso físico real.
- **Animaciones de Ataque / Uso:**
  - Golpe de azada: Preparación hacia atrás, golpe vertical rápido hacia el suelo y retorno suave.
  - Inclinación de regadera: Vierte agua con sonido continuo y partículas de lluvia.
  - Vaciado de abono y siembra de semillas con cinemáticas orgánicas."""
    },
    {
        "ruta": "src/vr/mesa_clima_prejuego.ts",
        "lenguaje": "typescript",
        "titulo": "Mesa Diorama 3D y Controles de Clima en Cobertizo (`src/vr/mesa_clima_prejuego.ts`)",
        "descripcion": """Ubicada dentro del cobertizo rústico, es una estación meteorológica interactiva física:
- **Termómetro de Mercurio 3D:** Columna graduada animada con botones pulsadores físicos $[+]$ y $[-]$ para regular la temperatura.
- **Palanca Mecánica de Lluvia:** Palanca articulada de hierro que incrementa o reduce la precipitación pluvial.
- **Fuelle de Cuero de Viento:** Fuelle campesino interactivo para calibrar la velocidad del viento.
- **Cubetas de Suelo:** Tres recipientes con muestras físicas de suelo para elegir el nivel de pH y textura edáfica.
- **Orbe Holográfico:** Muestra un pronóstico estilizado del clima configurado y el nivel de dificultad esperado (1 a 3 estrellas).
- **Pulsador Gigante 'IR AL CAMPO':** Botón de madera que teletransporta suavemente al jugador a la primera estación de siembra."""
    },
    {
        "ruta": "src/vr/canasta_cosecha.ts",
        "lenguaje": "typescript",
        "titulo": "Canasta de Recolección y Carretilla Agrícola Rodante (`src/vr/canasta_cosecha.ts`)",
        "descripcion": """Maneja la logística física de la cosecha en el huerto:
1. **`CanastaRecoleccion3D`:**
   - Cesto de mimbre tejido en 3D ubicado junto a la milpa.
   - Letrero diegético que contabiliza el total de elotes recolectados.
   - Aloja físicamente los elotes recolectados, pintados con el color de su variedad genética (dorado, azul, rojo o perlado).
2. **`CarritoAgricola3D`:**
   - Carretilla rústica con 4 ruedas de madera que acompaña automáticamente la estación activa del jugador desplazándose en el eje $X$.
   - Rotación cinemática real de las ruedas basada en la distancia recorrida: $\\Delta \\theta = \\Delta x / r_{\\text{rueda}}$."""
    },
    {
        "ruta": "src/vr/locomocion_vr.ts",
        "lenguaje": "typescript",
        "titulo": "Locomoción Confortable Anti-Mareo en WebXR (`src/vr/locomocion_vr.ts`)",
        "descripcion": """Implementa un sistema de navegación por teletransporte discreto para visores de Realidad Virtual:
- Genera 6 discos circulares en el suelo frente a cada estación de cultivo y un disco en el cobertizo de clima.
- Cada disco presenta huellas de botas campesinas grabadas en la superficie.
- Realiza una transición suave mediante atenuación para eliminar el mareo por movimiento (*cybersickness*)."""
    },
    {
        "ruta": "src/vr/interaccion_manos_6dof.ts",
        "lenguaje": "typescript",
        "titulo": "Interacción con Mandos VR de 6 Grados de Libertad (`src/vr/interaccion_manos_6dof.ts`)",
        "descripcion": """Gestiona la integración física de los mandos en WebXR (Meta Quest, Vision Pro, HTC Vive):
- Detección física real 6DoF de velocidad de impacto de azada, ángulo de inclinación de regadera, sacudida de espiga para polinización (>3 Hz) y jalón de maleza.
- Resolución espacial automática sobre el nodo más cercano a la mano (`RADIO_INTERACCION_M = 0.55 m`).
- Retroalimentación háptica segura modulada por las preferencias de accesibilidad."""
    },
    {
        "ruta": "src/vr/mano_vr.ts",
        "lenguaje": "typescript",
        "titulo": "Seguimiento 6DoF, Velocidad EMA, Sacudida y Háptica (`src/vr/mano_vr.ts`)",
        "descripcion": """Calcula en cada fotograma sin alojar objetos en el heap (Zero-GC):
- Velocidad tridimensional suavizada por media móvil exponencial (EMA 60/40).
- Frecuencia de oscilación vertical en Hz para polinización manual.
- Ángulo de inclinación del mando respecto a la vertical para el caudal continuo de riego.
- Pulsos hápticos protegidos mediante `try/catch`."""
    },
    {
        "ruta": "src/vr/cinturon_herramientas.ts",
        "lenguaje": "typescript",
        "titulo": "Cinturón Diegético de Herramientas 3D (`src/vr/cinturon_herramientas.ts`)",
        "descripcion": """Anillo diegético con 5 ranuras físicas a la altura de la cintura del jugador (adaptable a modo sentado) que sigue suavemente el giro horizontal de la cabeza y permite equipar herramientas con agarre 6DoF o clic."""
    },
    {
        "ruta": "src/vr/reloj_muneca.ts",
        "lenguaje": "typescript",
        "titulo": "Reloj de Muñeca Diegético con Caché de Hash (`src/vr/reloj_muneca.ts`)",
        "descripcion": """Plano de 9.5×6.4 cm anclado al antebrazo no dominante que muestra Día, Etapa, Humedad VWC, NPK, Sinergia de la Tríada y Alertas Climáticas, repintando el `DynamicTexture` únicamente cuando cambia el hash de estado (Zero-GC)."""
    },
    {
        "ruta": "src/vr/ui_poke.ts",
        "lenguaje": "typescript",
        "titulo": "Interacción Táctil de UI 3D por Poke (`src/vr/ui_poke.ts`)",
        "descripcion": """Permite presionar botones 3D físicos en mesas y consolas acercando el dedo índice o mando 6DoF, con hundimiento físico de 3 mm, sonido táctil y pulso háptico de 20 ms."""
    }
]

ARCHIVOS_SRC_JUEGO = [
    {
        "ruta": "src/juego/util.ts",
        "lenguaje": "typescript",
        "titulo": "Utilidades Matemáticas Zero-GC y PRNG Mulberry32 (`src/juego/util.ts`)",
        "descripcion": """Provee vectores temporales pre-alojados (`_tmpA.._tmpD`), funciones matemáticas (`clamp`, `clamp01`, `lerp`, `smoothstep`) y el generador pseudoaleatorio determinista Mulberry32 (`crearRng`)."""
    },
    {
        "ruta": "src/juego/bus_eventos.ts",
        "lenguaje": "typescript",
        "titulo": "Bus de Eventos Tipado Pub/Sub (`src/juego/bus_eventos.ts`)",
        "descripcion": """Desacopla las mecánicas agronómicas, climáticas y culinarias del sistema de Misiones, Códice y Don Elote 2.0 mediante eventos fuertemente tipados (`EventoJuego`)."""
    },
    {
        "ruta": "src/juego/ajustes.ts",
        "lenguaje": "typescript",
        "titulo": "Sistema de Confort VR, Accesibilidad y Persistencia (`src/juego/ajustes.ts`)",
        "descripcion": """Gestiona viñeta anti-mareo en teletransporte, autodetección de modo sentado, fuerza de gesto asistida (×0.6), subtítulos cerrados (CC), modo daltónico, intensidad háptica y recordatorio saludable de descanso."""
    },
    {
        "ruta": "src/juego/maleza.ts",
        "lenguaje": "typescript",
        "titulo": "Maleza y Quelites Comestibles con Thin Instances (`src/juego/maleza.ts`)",
        "descripcion": """Renderiza 48 instancias (36 hierbas competidoras y 12 quelites comestibles) en 2 draw calls usando Thin Instances. Soporta deshierbe de raíz por jalón suave y recolección de quelites en la canasta."""
    },
    {
        "ruta": "src/juego/fauna_milpa.ts",
        "lenguaje": "typescript",
        "titulo": "Fauna de la Milpa: Plagas y Aliados Biológicos (`src/juego/fauna_milpa.ts`)",
        "descripcion": """Pool fijo pre-alojado de 10 agentes (gusano cogollero, tordo maicero, abeja nativa y catarina) con máquina de estados (`INACTIVO -> LLEGANDO -> ACTUANDO -> HUYENDO`) y radio protector de Don Elote."""
    },
    {
        "ruta": "src/juego/polinizacion.ts",
        "lenguaje": "typescript",
        "titulo": "Polinización Manual y Cuajado de Mazorca (`src/juego/polinizacion.ts`)",
        "descripcion": """Permite sacudir la espiga en floración (VT/R1) para liberar una lluvia de polen dorado y maximizar el llenado de granos en la textura 3D del elote."""
    },
    {
        "ruta": "src/juego/director_eventos.ts",
        "lenguaje": "typescript",
        "titulo": "Director de Eventos Meteorológicos con Dificultad Adaptativa (`src/juego/director_eventos.ts`)",
        "descripcion": """Coordina avisos, impacto activo y resolución de Heladas, Tormentas, Vendavales y Sequías, recompensando la colocación de petates térmicos, tutores de madera y zanjas de drenaje."""
    },
    {
        "ruta": "src/juego/triada_viva.ts",
        "lenguaje": "typescript",
        "titulo": "Asociación Milpa «Las Tres Hermanas» 3D (`src/juego/triada_viva.ts`)",
        "descripcion": """Genera guías espirales de frijol trepador con vainas moradas y cobertura rastrera de calabaza con flores amarillas comestibles y frutos en cada estación de la hilera."""
    },
    {
        "ruta": "src/juego/fogon_cocina.ts",
        "lenguaje": "typescript",
        "titulo": "Estación de Cocina Tradicional «Del Surco al Comal» (`src/juego/fogon_cocina.ts`)",
        "descripcion": """Estación 3D junto al cobertizo con Olla de Barro para Nixtamalización, Metate volcánico y Comal para preparar 7 recetas tradicionales aprendiendo la bioquímica de la liberación de Niacina (Vitamina B3)."""
    },
    {
        "ruta": "src/juego/banco_semillas.ts",
        "lenguaje": "typescript",
        "titulo": "Banco Campesino de Semillas y Herencia Genética (`src/juego/banco_semillas.ts`)",
        "descripcion": """Mesa 3D con frascos de semillas criollas, función pura `heredar()` de selección masal campesina sobre 5 rasgos heredables (`rVigor`, `rSequia`, `rFrio`, `rCiclo`, `rTamano`), Feria de Trueque y persistencia en `localStorage`."""
    },
    {
        "ruta": "src/juego/codice.ts",
        "lenguaje": "typescript",
        "titulo": "Códice Ilustrado del Maíz y Saberes de la Milpa (`src/juego/codice.ts`)",
        "descripcion": """Atril 3D en el cobertizo y visor enciclopédico con 18 entradas desbloqueables divididas en Razas Nativas, Fenología, Ecología Milpa, Gastronomía y Calendario Agrícola."""
    },
    {
        "ruta": "src/juego/misiones.ts",
        "lenguaje": "typescript",
        "titulo": "Sistema de Misiones y Calendario Ritual Agrícola (`src/juego/misiones.ts`)",
        "descripcion": """Gestiona misiones guiadas, estacionales y de maestría, así como los 4 hitos del calendario ritual mesoamericano (2 de Febrero, 3 de Mayo, 29 de Septiembre y Feria de la Semilla en Noviembre)."""
    },
    {
        "ruta": "src/juego/almacen_mazorcas.ts",
        "lenguaje": "typescript",
        "titulo": "Drops Físicos 3D de Mazorcas Estilo Minecraft y Troje de Almacenamiento (`src/juego/almacen_mazorcas.ts`)",
        "descripcion": """Genera drops físicos 3D de mazorcas al cosechar con rebote, flotación y recolección magnética por cercanía o clic, además de la Troje Campesina 3D con apilado visual y persistencia en `localStorage`."""
    }
]

ARCHIVOS_SRC_EDUCATIVO = [
    {
        "ruta": "src/educativo/espantapajaros_guia.ts",
        "lenguaje": "typescript",
        "titulo": "Don Elote: Sabiduría Ancestral y Guía Diegético (`src/educativo/espantapajaros_guia.ts`)",
        "descripcion": """Personaje tridimensional diegético que educa al usuario sobre la historia y botánica del maíz:
- **Modelado 3D Expresivo:** Cabeza de costal de yute (`#fef08a`), ojos de botón de carbón, sonrisa cosida de hilo, bigotito curvado de cabellos de elote (*estigmas secos*), camisa roja campesina, paliacate al cuello y sombrero de paja de ala ancha.
- **Cinemática de Seguimiento Facial y Corporal:** Cuando el jugador se acerca a menos de 7 metros, Don Elote gira suavemente su cabeza y tronco orientándose hacia la posición del usuario.
- **Globo de Diálogo 3D Billboard:** Superficie flotante de texto renderizada con `DynamicTexture` que se orienta en modo `BILLBOARDMODE_Y` manteniéndose legible desde cualquier punto de la escena.
- **Corpus de Trivia y Mitología Mesoamericana:** Relata historias sobre el origen del Teocintle, el Popol Vuh maya, las palomitas ceremoniales del maíz Palomero (*momochtli*), la nixtamalización y los antioxidantes del maíz azul.
- **Fonemas Sintetizados:** Emite vocalizaciones procedurales sincronizadas con la apertura de cada diálogo."""
    },
    {
        "ruta": "src/educativo/herramientas_3d.ts",
        "lenguaje": "typescript",
        "titulo": "Modelado de Herramientas Agrícolas 3D (`src/educativo/herramientas_3d.ts`)",
        "descripcion": """Genera las mallas geométricas de las herramientas para el modo pedagógico y de escritorio:
- Azada campesina con cabo de encino y hoja metálica forjada.
- Regadera clásica con asa curva y difusor rociador.
- Saquito de semillas de tela con nudo de henequén.
- Pala para abono orgánico y compost.
- Mano articulada de recolección."""
    },
    {
        "ruta": "src/educativo/estado_educativo.ts",
        "lenguaje": "typescript",
        "titulo": "Máquina de Estados de la Experiencia Educativa (`src/educativo/estado_educativo.ts`)",
        "descripcion": """Controla el flujo pedagógico y la progresión gamificada del usuario:
- Define las 6 fases de aprendizaje: `arar`, `sembrar`, `regar`, `abonar`, `sol` y `cosechar`.
- Valida los prerrequisitos agronómicos (no se puede sembrar si la tierra no está arada al 100%, no se puede cosechar si la mazorca no ha alcanzado madurez).
- Emite mensajes motivacionales y consejos prácticos en cada paso completado con éxito."""
    },
    {
        "ruta": "src/educativo/particulas_educativas.ts",
        "lenguaje": "typescript",
        "titulo": "Sistemas de Partículas Cel-Shaded (`src/educativo/particulas_educativas.ts`)",
        "descripcion": """Efectos visuales optimizados que refuerzan la retroalimentación de cada acción:
- `emitirPolvoTierra()`: Nube de partículas de tierra marrón y terrones al golpear con la azada.
- `emitirChorroAgua()`: Cascada de gotas celestes brillantes al activar la regadera.
- `emitirBrillosAbono()`: Constelación de estrellas y destellos esmeralda al fertilizar.
- `emitirCelebracionCosecha()`: Explosión de confeti botánico al arrancar la mazorca madura."""
    },
    {
        "ruta": "src/educativo/panel_clima.ts",
        "lenguaje": "typescript",
        "titulo": "Panel de Clima 2D (`src/educativo/panel_clima.ts`)",
        "descripcion": """Interfaz modal 2D flotante para configurar rápidamente el clima desde pantallas táctiles o ratón:
- Botones de acceso rápido: Día Soleado, Lluvia Nutritiva, Ola de Calor, Helada Severa.
- Deslizadores intuitivos de temperatura y humedad con iconos animados."""
    },
    {
        "ruta": "src/educativo/ui_infantil.ts",
        "lenguaje": "typescript",
        "titulo": "HUD Interactivo 2D (`src/educativo/ui_infantil.ts`)",
        "descripcion": """Interfaz de usuario en pantalla con botones grandes, iconografía clara y colores cálidos:
- Botonera inferior para selección rápida de herramientas (1 a 6).
- Tarjeta de telemetría de la planta: días transcurridos, porcentaje de humedad, nivel de nutrientes y estado de salud.
- Botones para interactuar con Don Elote y cambiar de modo de cámara."""
    }
]

ARCHIVOS_SCRIPTS = [
    {
        "ruta": "scripts/exportar_trayectoria.ts",
        "lenguaje": "typescript",
        "titulo": "Exportador de Curvas de Trayectoria Agronómica (`scripts/exportar_trayectoria.ts`)",
        "descripcion": """Script de Node/TypeScript que simula un ciclo completo de cultivo día a día y exporta los resultados a un archivo CSV estructurado:
- Registra día, GDD acumulados, etapa fenológica, altura de caña, biomasa foliar, biomasa de mazorca y niveles de estrés abiótico.
- Permite contrastar matemáticamente la simulación frente a curvas reales de validación agronómica."""
    },
    {
        "ruta": "scripts/test_inmersivo.js",
        "lenguaje": "javascript",
        "titulo": "Prueba Automatizada E2E con Puppeteer (`scripts/test_inmersivo.js`)",
        "descripcion": """Prueba de extremo a extremo automatizada en navegador Chromium sin cabecera (*headless*):
- Carga el simulador en `http://localhost:5173/`.
- Valida la inicialización del lienzo WebGL2 y la ausencia de errores en la consola.
- Simula la selección de la azada con la tecla `1`, realiza impactos sobre el surco y valida que el nivel de labranza aumente.
- Simula la interacción con Don Elote mediante la tecla `E` y captura evidencias fotográficas en PNG."""
    },
    {
        "ruta": "scripts/test_v3_renders.js",
        "lenguaje": "javascript",
        "titulo": "Verificador Visual del Camellón de Milpa (`scripts/test_v3_renders.js`)",
        "descripcion": """Script automatizado de validación visual:
- Navega a las distintas estaciones del surco lineal de milpa.
- Comprueba la visibilidad de los 3 granos 3D sembrados, los surcos de labranza esculpidos y el carrito de cosecha rodante.
- Genera capturas de pantalla de alta resolución para auditoría gráfica."""
    },
    {
        "ruta": "scripts/test_reglas.ts",
        "lenguaje": "typescript",
        "titulo": "Suite de Pruebas Automatizadas de Reglas y Herencia v4.0 (`scripts/test_reglas.ts`)",
        "descripcion": """Verifica sin depender de WebGL la consistencia de `REGLAS_JUEGO` (145/163 días), el determinismo de Mulberry32, la estabilidad genética de `heredar()` durante 100 generaciones en `[0.80, 1.20]`, la integración de `rasgosHeredados` y `estresBiotico` en `pasoDia()`, y el despacho de `BusEventos`."""
    }
]

def generar_documento():
    lineas = []
    
    # 1. Encabezado principal
    lineas.append("# 🌽 Documentación Integral del Funcionamiento y Código Completo del Proyecto")
    lineas.append("## Simulador Botánico WebXR · Milpa Tradicional Mexicana y Fisiología del Maíz (*Zea mays* L.)")
    lineas.append("### Versión 3.0 Inmersiva — 4 Razas Nativas, Modo Videojuego FPS, Audio Procedural, Cobertizo 3D, Don Elote y Consolas Científicas")
    lineas.append("")
    lineas.append("> **Resumen:** Este documento contiene la **arquitectura matemática y funcional exhaustiva** del proyecto, así como el **100% del código fuente de cada uno de sus archivos**, identificando con precisión a qué archivo pertenece cada componente y explicando a detalle su funcionamiento interno.")
    lineas.append("")
    lineas.append("---")
    lineas.append("")
    
    # 2. Índice General
    lineas.append("## 📋 Índice General")
    lineas.append("")
    lineas.append("### Parte I: Arquitectura y Funcionamiento a Detalle")
    lineas.append("1. [Visión General y Filosofía del Sistema](#1-visión-general-y-filosofía-del-sistema)")
    lineas.append("2. [Arquitectura Global y Flujo de Datos](#2-arquitectura-global-y-flujo-de-datos)")
    lineas.append("3. [El Pipeline Matemático de 60 Renders para WebXR Zero-GC](#3-el-pipeline-matemático-de-60-renders-para-webxr-zero-gc)")
    lineas.append("4. [Motor Agrofisiológico C4 y las 4 Razas Nativas de Maíz](#4-motor-agrofisiológico-c4-y-las-4-razas-nativas-de-maíz)")
    lineas.append("5. [Surco Lineal de Milpa (5.2m) y Labranza 3D](#5-surco-lineal-de-milpa-52m-y-labranza-3d)")
    lineas.append("6. [Modo Videojuego FPS y Manipulación de Herramientas en Primera Persona](#6-modo-videojuego-fps-y-manipulación-de-herramientas-en-primera-persona)")
    lineas.append("7. [Don Elote: Inteligencia Diegética y Sabiduría Ancestral](#7-don-elote-inteligencia-diegética-y-sabiduría-ancestral)")
    lineas.append("8. [Sintetizador de Audio Procedural WebAudio (Zero Descargas)](#8-sintetizador-de-audio-procedural-webaudio-zero-descargas)")
    lineas.append("9. [Cobertizo Campesino 3D y Mesa Diorama de Clima](#9-cobertizo-campesino-3d-y-mesa-diorama-de-clima)")
    lineas.append("10. [Consolas Espaciales 3D y Modo Científico](#10-consolas-espaciales-3d-y-modo-científico)")
    lineas.append("11. [Generador Procedural Cel-Shaded de la Planta de Maíz](#11-generador-procedural-cel-shaded-de-la-planta-de-maíz)")
    lineas.append("12. [Estructura Completa de Archivos del Repositorio](#12-estructura-completa-de-archivos-del-repositorio)")
    lineas.append("")
    lineas.append("### Parte II: Código Fuente Íntegro y Explicación Archivo por Archivo")
    lineas.append("13. [Archivos de Configuración y Raíz](#13-archivos-de-configuración-y-raíz)")
    for a in ARCHIVOS_CONFIG:
        slug = a['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"    - [{a['ruta']}](#archivo-{slug})")
    lineas.append("14. [Módulos Principales del Núcleo y Simulación (`src/`)](#14-módulos-principales-del-núcleo-y-simulación-src)")
    for a in ARCHIVOS_SRC_NUCLEO:
        slug = a['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"    - [{a['ruta']}](#archivo-{slug})")
    lineas.append("15. [Módulos de Realidad Virtual y Cinemática (`src/vr/`)](#15-módulos-de-realidad-virtual-y-cinemática-srcvr)")
    for a in ARCHIVOS_SRC_VR:
        slug = a['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"    - [{a['ruta']}](#archivo-{slug})")
    lineas.append("16. [Módulos Educativos, UI y Don Elote (`src/educativo/`)](#16-módulos-educativos-ui-y-don-elote-srceducativo)")
    for a in ARCHIVOS_SRC_EDUCATIVO:
        slug = a['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"    - [{a['ruta']}](#archivo-{slug})")
    lineas.append("17. [Scripts de Automatización y Pruebas (`scripts/`)](#17-scripts-de-automatización-y-pruebas-scripts)")
    for a in ARCHIVOS_SCRIPTS:
        slug = a['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"    - [{a['ruta']}](#archivo-{slug})")
    lineas.append("")
    lineas.append("---")
    lineas.append("")
    
    # 3. Sección de Funcionamiento Teórico Exhaustivo
    lineas.append("## 1. Visión General y Filosofía del Sistema")
    lineas.append("""El proyecto **Simulador Botánico WebXR · Milpa Tradicional Mexicana (v3.0)** es una aplicación interactiva tridimensional en tiempo real desarrollada con **Babylon.js**, **TypeScript** y **Vite**. Su propósito es doble:
1. **Rigor Agronómico y Bioclimático:** Proporcionar una simulación fisiológica verídica de la ontogenia de *Zea mays* L. mediante Grados Día de Desarrollo (GDD), fotosíntesis C4, balance hídrico del suelo (modelo Campbell), evapotranspiración FAO-56 Penman-Monteith, arquitectura radicular estratificada y biomecánica de acame por viento y saturación.
2. **Pedagogía Inmersiva y Modo Videojuego (FPS / WebXR):** Permitir a estudiantes, agrónomos y público general sumergirse en una milpa mesoamericana tradicional, caminar libremente en primera persona con teclas `WASD`, empuñar herramientas físicamente modeladas en sus manos (azada, saco de semillas, regadera, abono orgánico y mano de cosecha), arar la tierra con deformación 3D en tiempo real, y aprender la ciencia e historia del maíz dialogando con "Don Elote", un espantapájaros diegético con voz procedural.

La experiencia corre tanto en navegadores de escritorio (Chrome, Edge, Firefox, Safari) como en visores de Realidad Virtual (Meta Quest 2, Quest 3, Quest Pro, Apple Vision Pro, SteamVR) sin necesidad de instalar aplicaciones nativas.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")
    
    lineas.append("## 2. Arquitectura Global y Flujo de Datos")
    lineas.append("""El siguiente diagrama ilustra el flujo de datos unidireccional y reactivo que gobierna la aplicación:

```mermaid
flowchart TD
    subgraph EntradaUsuario[Entrada del Usuario]
        TecladoWASD[Teclado WASD / Espacio]
        RatonPointer[Ratón / Pointer Lock]
        WebXRHands[Mandos VR 6DoF]
        HUD2D[Interfaz HUD 2D]
    end

    subgraph ControladorFPS[Cámara y Viewmodel]
        CJ[ControladorJugador - FPS / Orbital]
        VM[ViewmodelHerramientas - Rig 3D]
        Audio[AudioSintetizador - WebAudio]
    end

    subgraph Entorno3D[Escena 3D Babylon.js]
        Surco[SurcoMilpa - 6 Estaciones]
        DonElote[EspantapajarosGuia - Don Elote]
        Carrito[CarritoAgricola + Canasta 3D]
        Cobertizo[MesaClimaPrejuego 3D]
        Ambiente[AmbienteEstilizado + 4 Volcanes 360°]
        Consolas[PanelesVR Científicos Espaciales]
    end

    subgraph MotorFisiologico[Motor Fisiológico y Matemático]
        Nucleo[nucleo.ts - Fisiología C4]
        Clima[clima.ts - FAO-56 & Micrometeorología]
        Buffer60[buffer_60_renders.ts - LUTs a 60 FPS]
        Crecimiento[crecimiento.ts - Historial GDD]
    end

    TecladoWASD --> CJ
    RatonPointer --> CJ
    WebXRHands --> CJ
    HUD2D --> CJ

    CJ --> VM
    CJ --> Audio
    CJ --> Surco
    CJ --> DonElote

    Surco --> MotorFisiologico
    Cobertizo --> Clima
    MotorFisiologico --> Buffer60
    Buffer60 --> Surco
```

### Bucle de Simulación Frame a Frame
En cada fotograma (`scene.registerBeforeRender` en `main.ts`):
1. **Delta Time:** Se calcula $\\Delta t = \\min(0.1, \\text{tiempoTranscurrido})$ garantizando estabilidad numérica.
2. **Controlador del Jugador:** `controladorJugador.actualizar(dt)` procesa la aceleración WASD, la inercia, la oscilación de cabeza (*head bobbing*), la cadencia de pasos sonoros (`audio.paso()`) y el raycast de interacción a 8 metros.
3. **Viewmodel de Herramientas:** `viewmodel.actualizar(dt, velocidad)` calcula el balanceo inercial al caminar (*weapon sway*) y la cinemática de ataque de la herramienta en mano.
4. **Fisiología de la Hilera:** Si el reloj temporal avanza, `surcoMilpa.avanzarSimulacion(dtDias, clima, metricas)` ejecuta los pasos diarios de ontogenia sobre las 6 plantas vivas.
5. **Animación de Viento:** `surcoMilpa.animarViento(tiempo, viento)` deforma las cañas y hojas de forma desfasada según la velocidad de las ráfagas y la turgencia celular.
6. **Personaje Don Elote:** `espantapajaros.animar(tiempo, viento, posJugador)` balancea sus brazos de paja y orienta su cabeza y torso hacia el jugador si éste se encuentra a menos de 7 metros.
7. **Carretilla Agrícola:** `carritoAgricola.actualizar(dt)` traslada suavemente la carretilla rodante acompañando la estación activa del surco y haciendo girar sus ruedas físicamente.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 3. El Pipeline Matemático de 60 Renders para WebXR Zero-GC")
    lineas.append("""### El Desafío del Garbage Collector en Cascos VR
En visores autónomos como Meta Quest 2/3, la creación continua de objetos temporales o la regeneración de geometrías tridimensionales provoca pausas del recolector de basura (*Garbage Collector judder*), generando tirones visuales y mareo por movimiento (*cybersickness*).

### La Solución: 60 Estados Morfológicos Discretizados
`buffer_60_renders.ts` discretiza el ciclo ontogénico completo en **60 estados matemáticos fijos**:
- Las transiciones morfológicas se leen directamente de 7 tablas de consulta (LUTs precalculadas):
  1. `LUT_ALTURA_NORMA[60]`: Curva logística de elongación de caña:
     $$\\text{altura}(f) = \\frac{1.0}{1.0 + e^{-10.0 \\cdot (f - 0.40)}}$$
  2. `LUT_HOJAS_COUNT[60]`: Número de hojas activas (1 a 12).
  3. `LUT_HOJA_CURL[60]`: Curvatura foliar por presión de turgencia.
  4. `LUT_ESPIGA_APERTURA[60]`: Apertura de la panoja masculina.
  5. `LUT_ELOTE_ESCALA[60]`: Escala volumétrica del jilote y mazorca.
  6. `LUT_TOTOMOX_ABRE[60]`: Despliegue del totomoxtle exponiendo los granos.
  7. `LUT_RAICES_ZANCO[60]`: Despliegue de raíces de anclaje.
- **Interpolación Suave:** `obtenerEstadoMorph60(frameFloat)` interpola linealmente entre los estados enteros adyacentes $k$ y $k+1$, logrando transiciones fluidas a 60 FPS sin instanciar un solo objeto.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 4. Motor Agrofisiológico C4 y las 4 Razas Nativas de Maíz")
    lineas.append("""### Ontogenia Estricta (Ritchie & Hanway, 1982)
El simulador reproduce con exactitud las 13 etapas fenológicas del maíz:

| Etapa | Nombre Fenológico | GDD Requerido | Características Morfológicas y Fisiológicas |
| :--- | :--- | :--- | :--- |
| **SEMILLA** | Grano latente | $0$ | Grano enterrado esperando temperatura base y humedad óptima |
| **VE** | Emergencia coleóptilo | $75$ | El coleóptilo rompe la superficie del suelo |
| **V2** | 2ª Hoja Desplegada | $180$ | Cuello foliar visible; inicio de fotosíntesis autótrofa |
| **V4** | Plántula Establecida | $320$ | Diferenciación del meristemo apical bajo el suelo |
| **V6** | Elongación de Caña | $480$ | Meristemo emerge sobre la superficie; inicio de elongación rápida |
| **V8** | Vegetativo Rápido | $660$ | Formación acelerada de hojas y primer verticilo de raíces zanco |
| **V12** | Pre-Floración Densa | $1050$ | Determinación del número potencial de granos por mazorca |
| **VT** | Floración Masculina | $1200$ | Despliegue de espiga apical (panoja) y dehiscencia de anteras |
| **R1** | Floración Femenina | $1350$ | Emisión de estigmas receptivos (*pelos de elote*) |
| **R2** | Ampolla (*Blister*) | $1500$ | Granos acuosos blanquecinos con rápida acumulación de almidón |
| **R3** | Grano Lechoso / **ELOTE** | $1700$ | Estado óptimo para consumo de elote tierno |
| **R4** | Pastoso (*Dough*) | $1900$ | Endospermo con consistencia masosa densa |
| **R5** | Dentado (*Dent*) | $2050$ | Hendidura en la corona del grano por deshidratación del almidón |
| **R6** | Madurez Fisiológica | $2200$ | Formación de capa negra (*black layer*); cese de traslocación |

### Las 4 Razas Nativas Mexicanas
1. **Maíz Chalqueño (`chalqueno`):**
   - Valles Altos de México (2,250 msnm). Porte monumental (hasta 3.5 m). Ciclo largo (2050 GDD). Granos gigantes dorados (`#fbbf24`) para pozole y elotes hervidos.
2. **Maíz Azul Cónico (`azul`):**
   - Zonas de alta montaña volcánica (hasta 3,000 msnm). Porte medio (2.4 m). Ciclo de 1950 GDD. Alto en antocianinas (`#4338ca`) que protegen contra la intensa radiación UV y las bajas temperaturas. Base de tortillas azules y tlacoyos.
3. **Maíz Rojo (`rojo`):**
   - Regiones semiáridas y valles secos. Porte medio-alto (2.6 m). Ciclo de 2000 GDD. Mazorcas color carmesí (`#b91c1c`). Gran tolerancia al estrés hídrico (resistencia 0.80).
4. **Maíz Palomero Toluqueño (`palomero`):**
   - Valle de Toluca; la raza más antigua de México (>5,000 años). Porte compacto (1.8 m). Mazorcas perladas anaranjadas (`#f97316`). Endospermo hiperdenso que revienta al calentarse a $180^\\circ\\text{C}$ produciendo palomitas (*momochtli*).

### La Tríada Sagrada de la Milpa
- **Frijol (`frijol`):** Fija nitrógeno atmosférico mediante simbiosis con bacterias *Rhizobium* en los nódulos radiculares (+1.5% de vigor diario acumulado).
- **Calabaza (`calabaza`):** Sus grandes hojas rastreras cubren el suelo creando un acolchado vivo que conserva la humedad y reduce la evaporación edáfica directa en un 35%.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 5. Surco Lineal de Milpa (5.2m) y Labranza 3D")
    lineas.append("""El módulo `src/surco_milpa.ts` implementa un camellón agrícola de 5.2 metros con 6 estaciones de cultivo ($x \\in [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0]\\text{ m}$):
- **Deformación Física de Surcos al Arar:**
  - Cada golpe de azada incrementa `tierraArada` en $+34\\%$.
  - Esculpe 3 crestas longitudinales tridimensionales (`surcosMesh`):
    ```typescript
    const nivelArado = nodo.tierraArada / 100;
    nodo.surcosMesh.forEach((s, idx) => {
      s.scaling.y = Math.max(0.001, Math.min(1.0, nivelArado * 3 - idx));
      s.scaling.x = 1.0 + nivelArado * 0.35;
    });
    ```
- **Siembra Tridimensional:** Requiere `tierraArada >= 100%`. Deposita 3 semillas ovoides visibles con el color de la raza seleccionada.
- **Lámina de Charco Reflectante:** Si el riego o lluvia eleva la humedad volumétrica $\\theta > 38\\%$, se activa una lámina líquida translúcida reflectante con transparencia gradual.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 6. Modo Videojuego FPS y Manipulación de Herramientas en Primera Persona")
    lineas.append("""### Controlador en Primera Persona (`controlador_jugador.ts`)
- **Movimiento:** Teclas `WASD` / Flechas con física de inercia, carrera con `Shift` ($4.6\\text{ m/s}$) y giro con ratón o teclas `Q`/`E`.
- **Head Bobbing y Audio:** Oscilación armónica de la cámara al desplazarse acoplada a la cadencia de emisión de pasos sonoros en tierra (`audio.paso()`).
- **Retícula Inteligente con Raycast:** Emite un rayo de 8 metros desde el centro de la cámara. Al detectar un montículo, letrero, control del cobertizo o a Don Elote, agranda la retícula central a color dorado (`#fbbf24`) y despliega un tooltip contextual flotante.

### Viewmodel de Herramientas en Pantalla (`viewmodel_herramientas.ts`)
Un rig jerárquico 3D conectado directamente a la cámara del jugador representa sus brazos campesinos sosteniendo:
1. **Azada:** Mango de madera y cuchilla de acero forjado. Al hacer clic, ejecuta un arco de preparación hacia atrás y desciende velozmente impactando la tierra, emitiendo sonido y polvo.
2. **Saco de Semillas:** Saco de yute con granos que se inclina para verter semillas en la zanja.
3. **Regadera:** Vierte un chorro de agua continuo con inclinación y burbujeo acústico.
4. **Trowel de Abono:** Esparce compost con lluvia de destellos esmeralda.
5. **Guante de Cosecha:** Se extiende hacia la mazorca madura para arrancarla con un crujido seco.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 7. Don Elote: Inteligencia Diegética y Sabiduría Ancestral")
    lineas.append("""Ubicado junto al camellón de milpa, el personaje "Don Elote" actúa como guía del huerto sin romper la inmersión:
- **Seguimiento Facial y Corporal:** Cuando el usuario se aproxima a menos de 7 metros, Don Elote rota suavemente su tronco y cuello para mirarlo de frente.
- **Globo de Diálogo 3D Billboard:** Textura dinámica de $512 \\times 200\\text{ px}$ configurada en `BILLBOARDMODE_Y` que flota sobre su sombrero y permanece legible desde cualquier ángulo.
- **Fonemas Vocales Sintéticos:** Al hablar, emite ráfagas de audio procedural que simulan el habla divertida de un personaje de dibujos animados.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 8. Sintetizador de Audio Procedural WebAudio (Zero Descargas)")
    lineas.append("""Genera todos los efectos sonoros en tiempo real mediante matemáticas acústicas en el navegador:
1. `golpeAzada()`: Sub-bass sinusoidal de $120\\to 32\\text{ Hz}$ en $180\\text{ ms}$ + ráfaga de ruido blanco pasabanda a $450\\text{ Hz}$.
2. `iniciarAgua()` / `detenerAgua()`: Ruido blanco continuo filtrado en $1100\\text{ Hz}$ con oscilador LFO a $8.5\\text{ Hz}$ modulando $\\pm 350\\text{ Hz}$ para emular el flujo turbulento de agua.
3. `semillas()`: Tres impulsos triangulares ($650, 830, 1010\\text{ Hz}$) de $50\\text{ ms}$.
4. `abono()`: Campanilleo en acorde mayor de Do ($C_5, E_5, G_5, C_6$).
5. `cosecha()`: Snap percusivo triangular con caída de $380\\to 95\\text{ Hz}$.
6. `vozDonElote()`: 4 ráfagas de onda cuadrada ($220-400\\text{ Hz}$) procesadas por filtro resonante en $950\\text{ Hz}$ ($Q=3.5$).
7. `paso()`: Ruido blanco filtrado por pasabajas en $320\\text{ Hz}$ de $80\\text{ ms}$.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 9. Cobertizo Campesino 3D y Mesa Diorama de Clima")
    lineas.append("""Ubicado en la coordenada $z = -3.8\\text{ m}$, el cobertizo de madera alberga una estación meteorológica interactiva:
- **Termómetro de Mercurio:** Botones $[+]$ y $[-]$ para graduar la temperatura en saltos de $3^\\circ\\text{C}$.
- **Palanca de Lluvia:** Palanca articulada para dosificar la precipitación.
- **Fuelle de Viento:** Fuelle analógico para graduar las ráfagas eólicas.
- **Cubetas de Suelo:** Tres recipientes para ajustar acidez/pH y textura edáfica.
- **Anillo Volcánico de 360°:** El Popocatépetl, Iztaccíhuatl, Nevado de Toluca y Cerro del Ajusco rodean el horizonte. Cuando la temperatura desciende a $T \\le 5^\\circ\\text{C}$, sus cumbres se cubren dinámicamente de mantos de nieve blanca.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 10. Consolas Espaciales 3D y Modo Científico")
    lineas.append("""Al pulsar la tecla `H`, se despliegan tres consolas curvadas en el espacio 3D construidas con `AdvancedDynamicTexture`:
1. **Consola Central (Reloj GDD y Time-Lapse):**
   - Deslizador de 1 a 240 días de cultivo.
   - Modos de avance rápido a $1\\times$, $3\\times$, $6\\times$ y $12\\times$ días por segundo.
   - Telemetría de biomasa acumulada en gramos (hojas, tallo, raíces, mazorca).
2. **Consola Meteorológica Izquierda:**
   - 11 deslizadores: Temperatura, Humedad, Presión, Hora, Nubosidad, Lluvia, Viento, Humedad Suelo, pH, $\\text{CO}_2$ y PM2.5.
   - 10 escenarios climáticos preconfigurados.
3. **Consola Diagnóstica Derecha:**
   - Evapotranspiración FAO-56 ($ET_0$).
   - Fotosíntesis neta C4 ($A_n$).
   - 6 barras de estrés activo: hídrico, calórico, helada, encharcamiento, pH y viento.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 11. Generador Procedural Cel-Shaded de la Planta de Maíz")
    lineas.append("""El modelo tridimensional de la planta de maíz en `src/maiz_estilizado.ts` implementa:
- **Caña (Tallo):** Cilindros segmentados por nudos prominentes.
- **Raíces de Anclaje (*Brace Roots*):** Cilindros curvados en los verticilos basales que fijan la planta contra el viento.
- **Hojas Acintadas (*Ribbons*):** Mallas generadas por extrusión a lo largo de splines cúbicos Hermite con nervadura cilíndrica central.
- **Mazorca Procedural:** Cilindro ovoide con `DynamicTexture` que dibuja las hileras de granos individuales coloreadas según la raza nativa (amarillo, azul, rojo o blanco perla), cubiertas por hojas de totomoxtle y cabellos de elote.
- **Espiga Apical (Panoja):** Raquis central ramificado con anteras dehiscentes amarillas.
- **Estética Cel-Shaded:** Contornos de tinta oscura (`#25330f`) y sombreado toon de dos tonos.""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    lineas.append("## 12. Estructura Completa de Archivos del Repositorio")
    lineas.append("""A continuación se presenta el árbol de archivos completo del proyecto:

```
vr_v2/
├── package.json                          # Metadatos, scripts y dependencias (Babylon.js, Vite)
├── tsconfig.json                         # Configuración estricta del compilador TypeScript
├── vite.config.ts                        # Configuración del servidor de desarrollo y empaquetador
├── index.html                            # Punto de entrada HTML5, lienzo WebGL2 y retícula FPS
├── src/                                  # Código fuente principal de la aplicación
│   ├── main.ts                           # Orquestador principal, bucle de escena y eventos
│   ├── nucleo.ts                         # Fisiología C4, ontogenia Ritchie-Hanway y 4 razas nativas
│   ├── clima.ts                          # Micrometeorología, FAO-56 Penman-Monteith y 10 presets
│   ├── crecimiento.ts                    # Snapshots diarios y línea de tiempo agrofisiológica
│   ├── buffer_60_renders.ts              # Pipeline de 60 LUTs para WebXR zero-garbage collection
│   ├── maiz_estilizado.ts                # Generador procedural cel-shaded de la planta de maíz
│   ├── surco_milpa.ts                    # Camellón de 5.2m con 6 estaciones y labranza 3D
│   ├── ambiente_estilizado.ts            # Entorno 3D, cielo, volcanes 360° con nieve y cobertizo
│   ├── audio_sintetizador.ts             # Sintetizador procedural WebAudio nativo (zero descargas)
│   ├── controlador_jugador.ts            # Movimiento FPS (WASD, ratón, head bobbing, raycast)
│   ├── paneles_vr.ts                     # Consolas científicas espaciales 3D curvadas
│   ├── vr/                               # Subsistema de Realidad Virtual e interfaces 3D
│   │   ├── viewmodel_herramientas.ts     # Rig de brazos y herramientas en primera persona (FPS)
│   │   ├── mesa_clima_prejuego.ts        # Diorama meteorológico interactivo dentro del cobertizo
│   │   ├── canasta_cosecha.ts            # Canasta de recolección y carretilla agrícola rodante
│   │   ├── locomocion_vr.ts              # Teletransporte anti-mareo para visores WebXR
│   │   └── interaccion_manos_6dof.ts     # Punteros láser y hápticos para mandos VR 6DoF
│   └── educativo/                        # Subsistema pedagógico, Don Elote y UI
│       ├── espantapajaros_guia.ts        # Don Elote: seguimiento de mirada, diálogos y trivia
│       ├── herramientas_3d.ts            # Mallas 3D de herramientas para modo escritorio
│       ├── estado_educativo.ts           # Máquina de estados finita de la experiencia de cultivo
│       ├── particulas_educativas.ts      # Sistemas de partículas (tierra, agua, abono, confeti)
│       ├── panel_clima.ts                # Interfaz flotante 2D para ajuste meteorológico rápido
│       └── ui_infantil.ts                # HUD 2D para selección de herramientas y telemetría
└── scripts/                              # Scripts de pruebas y exportación
    ├── exportar_trayectoria.ts           # Exportador de trayectorias agronómicas a CSV
    ├── test_inmersivo.js                 # Prueba de extremo a extremo automatizada con Puppeteer
    └── test_v3_renders.js                # Validador gráfico de camellón y estaciones
```""")
    lineas.append("")
    lineas.append("---")
    lineas.append("")

    # 4. Sección de Código Fuente Íntegro Archivo por Archivo
    lineas.append("## 13. Archivos de Configuración y Raíz")
    lineas.append("")
    for item in ARCHIVOS_CONFIG:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    lineas.append("## 14. Módulos Principales del Núcleo y Simulación (`src/`)")
    lineas.append("")
    for item in ARCHIVOS_SRC_NUCLEO:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    lineas.append("## 15. Módulos de Realidad Virtual y Cinemática (`src/vr/`)")
    lineas.append("")
    for item in ARCHIVOS_SRC_VR:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    lineas.append("## 16. Módulos Educativos, UI y Don Elote (`src/educativo/`)")
    lineas.append("")
    for item in ARCHIVOS_SRC_EDUCATIVO:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    lineas.append("## 16B. Sistemas de Ecosistema, Cocina, Semillas y Códice v4.0 (`src/juego/`)")
    lineas.append("")
    for item in ARCHIVOS_SRC_JUEGO:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    lineas.append("## 17. Scripts de Automatización y Pruebas (`scripts/`)")
    lineas.append("")
    for item in ARCHIVOS_SCRIPTS:
        slug = "archivo-" + item['ruta'].replace('/', '').replace('.', '').replace('-', '')
        lineas.append(f"<a id=\"{slug}\"></a>")
        lineas.append(f"### {item['titulo']}")
        lineas.append(f"**Ruta del archivo:** `{item['ruta']}`")
        lineas.append("")
        lineas.append("#### Funcionamiento a Detalle")
        lineas.append(item['descripcion'])
        lineas.append("")
        lineas.append(f"#### Código Fuente Completo (`{item['ruta']}`)")
        lineas.append(f"```{item['lenguaje']}")
        codigo = leer_archivo(item['ruta'])
        lineas.append(codigo)
        lineas.append("```")
        lineas.append("")
        lineas.append("---")
        lineas.append("")

    contenido_final = "\n".join(lineas)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(contenido_final)
    
    total_lineas = len(lineas)
    total_bytes = len(contenido_final.encode("utf-8"))
    print(f"✅ Documento generado con éxito en: {OUTPUT_FILE}")
    print(f"📊 Estadísticas: {total_lineas:,} líneas de Markdown, {total_bytes / (1024*1024):.2f} MB")

if __name__ == "__main__":
    generar_documento()
