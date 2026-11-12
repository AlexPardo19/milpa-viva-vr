import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PORT = 4589;
const ARTIFACTS_DIR = '/Users/alexisraymundohernandezpardo/.gemini/antigravity/brain/66a5954d-c2ca-4c18-a3a3-abf11c1b0685/renders';

osEnsureDirs(['render/galeria', 'render/galeria_raices', ARTIFACTS_DIR]);

function osEnsureDirs(dirs) {
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// -----------------------------------------------------------------------------
// LISTA DE ESCENARIOS A RENDERIZAR
// -----------------------------------------------------------------------------
const SCENARIOS = [
  // --- PARTE 1: CRONOSECUENCIA VEGETATIVA & REPRODUCTIVA DETALLADA (34 CUADROS) ---
  {
    folder: 'render/galeria',
    name: '00_germinacion_SEMILLA_radicula',
    title: 'Etapa Siembra / Germinación (Día 4): Imbibición y brote de radícula primaria',
    camera: 'plantula',
    altura: 0.25,
    numHojas: 0,
    leafScale: 0.1,
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0,
    mostrarSemilla: true
  },
  {
    folder: 'render/galeria',
    name: '01_emergencia_VE_dia10',
    title: 'Plántula emergida (VE, Día 10): Coleóptilo rompiendo el suelo con 2 hojitas',
    camera: 'plantula',
    altura: 0.7,
    numHojas: 2,
    leafScale: 0.35,
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0,
    mostrarSemilla: true
  },
  {
    folder: 'render/galeria',
    name: '01b_plantula_V2_dia20',
    title: 'Plántula V2 (Día 20): Dos hojas con cuello visible (collar), fotosíntesis autotrófica',
    camera: 'plantula',
    altura: 1.2,
    numHojas: 2,
    leafScale: 0.5,
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0
  },
  {
    folder: 'render/galeria',
    name: '02_plantula_V4_dia32',
    title: 'Plántula establecida (V4, Día 32): 4 hojas desplegadas, sistema seminal activo',
    camera: 'plantula_v4',
    altura: 1.8,
    numHojas: 4,
    leafScale: 0.65,
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0
  },
  {
    folder: 'render/galeria',
    name: '02b_vegetativo_V6_dia50',
    title: 'Crecimiento V6 (Día 50): 6 hojas, punto de crecimiento sobre el suelo, inicio elongación',
    camera: 'general_media',
    altura: 2.8,
    numHojas: 6,
    leafScale: 0.78,
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0
  },
  {
    folder: 'render/galeria',
    name: '03_vegetativo_V8_dia69',
    title: 'Crecimiento vegetativo rápido (V8, Día 69): Elongación de caña y hojas expandidas',
    camera: 'general_media',
    altura: 4.2,
    numHojas: 8,
    leafScale: 0.9,
    mostrarElotes: false,
    mostrarEspiga: true,
    espigaAbierta: false,
    numRaicesSoporte: 4
  },
  {
    folder: 'render/galeria',
    name: '03b_vegetativo_V10_dia85',
    title: 'Elongación activa (V10, Día 85): 10 hojas, rápida acumulación de biomasa y nudos',
    camera: 'general',
    altura: 5.2,
    numHojas: 8,
    leafScale: 0.95,
    mostrarElotes: false,
    mostrarEspiga: true,
    espigaAbierta: false,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '03c_prefloracion_V12_dia102',
    title: 'Pre-floración (V12, Día 102): Panoja asomando en el cogollo y jilotes axilares',
    camera: 'general',
    altura: 5.9,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.2,
    elotePeel: 0,
    mostrarEspiga: true,
    espigaAbierta: false,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '04_floracion_masculina_VT_dia122',
    title: 'Floración masculina (VT, Día 122): Panoja apical abierta con anteras doradas',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.28,
    elotePeel: 0,
    mostrarEspiga: true,
    espigaAbierta: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '04b_detalle_espiga_anthesis_closeup',
    title: 'Macro Espiga Apical (VT Antesis): Raquis, ramas curvas y racimos de anteras derramando polen',
    camera: 'espiga_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.3,
    elotePeel: 0,
    mostrarEspiga: true,
    espigaAbierta: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '05_inicio_fruto_jilote_R1_dia129',
    title: 'Inicio del fruto: Jilote femenino (R1, Día 129) con estigmas receptivos',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.45,
    elotePeel: 0,
    estigmaColor: '#e8c46a',
    mostrarEspiga: true,
    espigaAbierta: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '06_detalle_jilote_estigmas_R1_closeup',
    title: 'Macro Jilote inicial (R1, Día 129): Estigmas frescos sedosos receptivos a polen',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.50,
    elotePeel: 1,
    estigmaColor: '#e8c46a',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '06b_detalle_ampolla_R2_closeup',
    title: 'Macro Ampolla (R2, Día 153): Elongación de olote, granos acuosos blancos y brácteas',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.75,
    elotePeel: 2,
    granoColor: '#fff09a',
    estigmaColor: '#c8873a',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '06c_grano_lechoso_R3_dia158',
    title: 'Etapa R3 Temprano (Día 158): Llenado con fluido blanco lechoso de almidón y azúcares',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.90,
    elotePeel: 2,
    granoColor: '#fff5aa',
    estigmaColor: '#c8873a',
    mostrarEspiga: true,
    espigaAbierta: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '07_elote_cosecha_R3_dia163',
    title: 'Etapa R3 Pleno (Leche / Elote, Día 163): Mazorca desarrollada lista para cosecha',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 3,
    granoColor: '#ffd21f',
    estigmaColor: '#c8873a',
    mostrarEspiga: true,
    espigaAbierta: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '08_detalle_elote_cosecha_R3_closeup',
    title: 'Macro Elote tierno (R3, Día 163): 16 hileras de granos dorados con totomoxtle desplegado',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    granoColor: '#ffd21f',
    estigmaColor: '#c8873a',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '08a_detalle_raices_zanco_closeup',
    title: 'Macro Raíces de Anclaje (Brace Roots): Doble corona de raíces fúlcreas adventicias en montículo',
    camera: 'raices_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '08b_detalle_grano_masoso_R4_closeup',
    title: 'Macro Grano Masoso (R4, Día 180): Transición de fluido lechoso a pasta consistente',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    huskColor: '#8ec44a',
    granoColor: '#ffd020',
    estigmaColor: '#b06520',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '08c_detalle_dentado_R5_closeup',
    title: 'Macro Grano Dentado (R5, Día 195): Hendidura apical (dent) y totomoxtle apergaminado',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    huskColor: '#d6cb96',
    granoColor: '#f0b000',
    estigmaColor: '#9a5d28',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '09_madurez_fisiologica_R6_dia218',
    title: 'Madurez fisiológica (R6, Día 218): Formación de capa negra y senescencia dorada completa',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    plantaColor: '#c2b060',
    leafColor: '#beaa52',
    huskColor: '#cfbe7a',
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    granoColor: '#e09800',
    estigmaColor: '#6a3d18',
    mostrarEspiga: true,
    espigaColor: '#c2b060',
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '10_detalle_mazorca_madura_R6_closeup',
    title: 'Macro Mazorca madura (R6, Día 218): Granos secos vitrificados y brácteas pajizas',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    huskColor: '#cfbe7a',
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    granoColor: '#e09800',
    estigmaColor: '#6a3d18',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '10b_campo_cosecha_secado_dia230',
    title: 'Secado en campo para cosecha comercial (Día 230): Planta dorada deshidratada a 15% humedad',
    camera: 'general',
    altura: 6.6,
    numHojas: 8,
    plantaColor: '#ba9f4a',
    leafColor: '#a88d3a',
    huskColor: '#c2aa58',
    mostrarElotes: true,
    eloteTamano: 1.0,
    elotePeel: 4,
    granoColor: '#d68800',
    estigmaColor: '#50280a',
    mostrarEspiga: true,
    espigaColor: '#ba9f4a',
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '11_marchitez_decaimiento_sequia',
    title: 'Estrés hídrico reversible: Acartuchamiento longitudinal en V y pérdida de turgencia',
    camera: 'hojas_closeup',
    altura: 6.3,
    numHojas: 8,
    leafColor: '#9fa848',
    hojasMarchitas: 0.8,
    mostrarElotes: true,
    eloteTamano: 0.6,
    elotePeel: 1,
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '11b_estres_nutricional_clorosis_nitrogeno',
    title: 'Deficiencia de Nitrógeno (N): Clorosis en V invertida desde ápice hacia la base foliar',
    camera: 'general',
    altura: 5.8,
    numHojas: 8,
    clorosisNitrogeno: true,
    leafColor: '#a6bd3e',
    mostrarElotes: true,
    eloteTamano: 0.7,
    elotePeel: 2,
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '11c_estres_frio_antocianinas_purpura',
    title: 'Estrés por frío y helada leve en V4: Coloración violácea por acumulación de antocianinas',
    camera: 'plantula_v4',
    altura: 2.2,
    numHojas: 4,
    purpuraAntocianina: true,
    leafColor: '#703858',
    plantaColor: '#6a3650',
    mostrarElotes: false,
    mostrarEspiga: false,
    numRaicesSoporte: 0
  },
  {
    folder: 'render/galeria',
    name: '12_muerte_sequia_terminal',
    title: 'Muerte irreversible por sequía en V8: Desecación total y colapso vegetativo pajizo',
    camera: 'general',
    altura: 3.8,
    numHojas: 8,
    plantaColor: '#8a7d48',
    leafColor: '#786d38',
    hojasMarchitas: 1.0,
    colapsoMuerte: 0.4,
    mostrarElotes: false,
    mostrarEspiga: true,
    espigaColor: '#8a7d48',
    numRaicesSoporte: 4
  },
  {
    folder: 'render/galeria',
    name: '13_muerte_helada_severa_V8',
    title: 'Muerte por helada negra severa en V8: Necrosis vítrea celular ennegrecida',
    camera: 'general',
    altura: 4.0,
    numHojas: 8,
    plantaColor: '#2d3b2b',
    leafColor: '#233022',
    colapsoMuerte: 0.5,
    mostrarElotes: false,
    mostrarEspiga: true,
    espigaColor: '#2d3b2b',
    numRaicesSoporte: 4
  },
  {
    folder: 'render/galeria',
    name: '14_aborto_fruto_estres_floracion',
    title: 'Falla de polinización y aborto apical: Mazorca deforme con punta vana chata',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    mostrarElotes: true,
    eloteTamano: 0.9,
    elotePeel: 4,
    eloteAborto: true,
    granoColor: '#ffd21f',
    estigmaColor: '#5a3515',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '15_acame_raiz_tormenta_viento',
    title: 'Acame mecánico de raíz: Flexión a 55° por vendaval húmedo con suelo saturado',
    camera: 'general_acame',
    altura: 6.6,
    numHojas: 8,
    inclinacionAcame: 0.96, // ~55 grados
    mostrarElotes: true,
    eloteTamano: 0.85,
    elotePeel: 2,
    mostrarEspiga: true,
    numRaicesSoporte: 6,
    encharcado: true
  },
  {
    folder: 'render/galeria',
    name: '15b_rotura_tallo_greensnap',
    title: 'Rotura frágil de tallo (Greensnap): Quiebre limpio en entrenudo medio por ráfagas violentas',
    camera: 'general_media',
    altura: 3.5,
    numHojas: 5,
    greensnap: true,
    mostrarElotes: true,
    eloteTamano: 0.5,
    elotePeel: 1,
    mostrarEspiga: false,
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '16_encharcamiento_anoxia_suelo',
    title: 'Encharcamiento prolongado (Hipoxia): Puddle superficial, marchitez por anoxia y clorosis',
    camera: 'general',
    altura: 6.2,
    numHojas: 8,
    leafColor: '#8a9b3a',
    mostrarElotes: true,
    eloteTamano: 0.85,
    elotePeel: 2,
    mostrarEspiga: true,
    numRaicesSoporte: 6,
    encharcado: true
  },
  {
    folder: 'render/galeria',
    name: '17_degradacion_postmortem_dia6_desecacion',
    title: 'Degradación Post-Mortem (Día 6): Desecación foliar y pérdida progresiva de turgencia (58%)',
    camera: 'general',
    altura: 6.0,
    numHojas: 8,
    plantaColor: '#544422',
    leafColor: '#453518',
    huskColor: '#503f1e',
    inclinacionAcame: 0.65,
    mostrarElotes: true,
    eloteTamano: 0.95,
    elotePeel: 3,
    granoColor: '#8a5c10',
    estigmaColor: '#351c08',
    mostrarEspiga: true,
    espigaColor: '#544422',
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '18_degradacion_postmortem_dia12_necrosis_total',
    title: 'Degradación Post-Mortem (Día 12): Necrosis celular generalizada marrón oscura (100%)',
    camera: 'general',
    altura: 5.5,
    numHojas: 8,
    plantaColor: '#322514',
    leafColor: '#281c0e',
    huskColor: '#302212',
    inclinacionAcame: 0.88,
    mostrarElotes: true,
    eloteTamano: 0.88,
    elotePeel: 3,
    granoColor: '#422c0c',
    estigmaColor: '#221205',
    mostrarEspiga: true,
    espigaColor: '#322514',
    numRaicesSoporte: 6
  },
  {
    folder: 'render/galeria',
    name: '19_detalle_elote_degradado_postmortem_closeup',
    title: 'Macro Elote post-mortem: Granos oscurecidos encogidos y deshidratación fúngica',
    camera: 'elote_closeup',
    altura: 6.6,
    numHojas: 8,
    huskColor: '#302212',
    mostrarElotes: true,
    eloteTamano: 0.88,
    elotePeel: 4,
    granoColor: '#38250b',
    estigmaColor: '#201005',
    mostrarEspiga: true,
    numRaicesSoporte: 6
  },

  // --- PARTE 2: CATÁLOGO RADICULAR EN CORTE RIZOTRÓN (12 CUADROS) ---
  {
    folder: 'render/galeria_raices',
    name: 'raiz_01_germinacion_SEMILLA_radicula',
    title: 'Etapa SEMILLA (Día 4): Emergencia de Radícula Primaria y Seminales',
    camera: 'raiz_subterranea',
    tipoRaiz: 'semilla_radicula',
    mostrarParteAerea: false,
    mostrarSemilla: true
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_02_emergencia_VE_V2_sistema_seminal',
    title: 'Etapa VE–V2 (Día 16): Dominio del Sistema Seminal y 1.er Verticilo Nodal',
    camera: 'raiz_subterranea',
    tipoRaiz: 'seminal_nodal_v2',
    mostrarParteAerea: true,
    alturaAerea: 0.8,
    mostrarSemilla: true
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_03_establecimiento_V4_V6_raices_nodales',
    title: 'Etapa V4–V6 (Día 48): Transición al Sistema Radicular Nodal (3 Verticilos)',
    camera: 'raiz_subterranea',
    tipoRaiz: 'nodal_v4_v6',
    mostrarParteAerea: true,
    alturaAerea: 1.8
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_04_elongacion_V8_V12_raices_zanco',
    title: 'Etapa V8–V12 (Día 88): Expansión Profunda y Raíces Zanco (Brace Roots)',
    camera: 'raiz_subterranea',
    tipoRaiz: 'elongacion_v8_v12',
    mostrarParteAerea: true,
    alturaAerea: 3.8
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_05_floracion_VT_R1_plenitud_radicular',
    title: 'Etapa VT–R1 (Día 129): Plenitud de Arquitectura Radicular (5 Verticilos + 2 Zanco)',
    camera: 'raiz_subterranea',
    tipoRaiz: 'plenitud_vt_r1',
    mostrarParteAerea: true,
    alturaAerea: 5.5
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_06_madurez_R3_R6_suberizacion_senescencia',
    title: 'Etapa R3–R6 (Día 218): Madurez Fisiológica, Suberización y Senescencia',
    camera: 'raiz_subterranea',
    tipoRaiz: 'madurez_r3_r6',
    mostrarParteAerea: true,
    alturaAerea: 5.5
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_07_reaccion_sequia_hidrotropismo',
    title: 'Reacción a Sequía: Fenotipo Steep, Cheap & Deep en Profundidad',
    camera: 'raiz_subterranea',
    tipoRaiz: 'sequia_steep_deep',
    mostrarParteAerea: true,
    alturaAerea: 5.2
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_08_reaccion_encharcamiento_hipoxia',
    title: 'Reacción a Encharcamiento: Hipoxia Radicular y Necrosis Apical Anóxica',
    camera: 'raiz_subterranea',
    tipoRaiz: 'encharcamiento_hipoxia',
    mostrarParteAerea: true,
    alturaAerea: 4.8,
    encharcado: true
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_09_reaccion_acidez_aluminio_pH45',
    title: 'Reacción a Suelo Ácido (pH 4.5, Toxicidad Al³⁺): Raíces Cortas Stubby',
    camera: 'raiz_subterranea',
    tipoRaiz: 'acidez_aluminio',
    mostrarParteAerea: true,
    alturaAerea: 3.2
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_10_reaccion_frio_pudricion_semilla',
    title: 'Reacción a Suelo Frío (5 °C): Radícula Abortada y Pudrición de Semilla',
    camera: 'raiz_subterranea',
    tipoRaiz: 'frio_pudricion',
    mostrarParteAerea: false,
    mostrarSemilla: true
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_11_reaccion_acame_viento_desgarro',
    title: 'Reacción a Acame: Tensión y Desgarro en Barlovento con Inclinación a 55°',
    camera: 'raiz_subterranea',
    tipoRaiz: 'acame_desgarro',
    mostrarParteAerea: true,
    alturaAerea: 5.5,
    inclinacionAcame: 0.96
  },
  {
    folder: 'render/galeria_raices',
    name: 'raiz_12_reaccion_muerte_necrosis_postmortem',
    title: 'Degradación Post-Mortem: Colapso Cortical y Necrosis Oscura Total',
    camera: 'raiz_subterranea',
    tipoRaiz: 'necrosis_postmortem',
    mostrarParteAerea: true,
    alturaAerea: 4.5,
    inclinacionAcame: 0.85
  }
];

// -----------------------------------------------------------------------------
// SERVIDOR HTTP LOCAL PARA BABYLON.JS + CHROME AUTOMATIZADO
// -----------------------------------------------------------------------------
let scenarioIdx = 0;
let chromeProcess = null;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/render.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateRenderHtml(SCENARIOS));
  } else if (req.url === '/babylon.js') {
    const p = path.resolve('public/babylon.js');
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    fs.createReadStream(p).pipe(res);
  } else if (req.url === '/log' && req.method === 'POST') {
    let logBody = '';
    req.on('data', c => logBody += c);
    req.on('end', () => {
      console.log('>>> [BROWSER]:', logBody);
      res.writeHead(200);
      res.end('ok');
    });
  } else if (req.url === '/save-frame' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const base64Data = item.data.replace(/^data:image\/png;base64,/, '');
        const targetPath = path.join(item.folder, item.name + '.png');
        const artifactPath = path.join(ARTIFACTS_DIR, item.name + '.png');

        fs.writeFileSync(targetPath, base64Data, 'base64');
        fs.writeFileSync(artifactPath, base64Data, 'base64');

        const mb = (base64Data.length * 0.75) / (1024 * 1024);
        console.log(`[${++scenarioIdx}/${SCENARIOS.length}] Guardado: ${targetPath} (${mb.toFixed(2)} MB)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', next: scenarioIdx < SCENARIOS.length ? scenarioIdx : null }));

        if (scenarioIdx >= SCENARIOS.length) {
          console.log('\n=================================================================');
          console.log('¡TODOS LOS RENDERS ESTILIZADOS BABYLON COMPLETADOS EXITOSAMENTE!');
          console.log('=================================================================\n');
          setTimeout(() => {
            if (chromeProcess) chromeProcess.kill('SIGTERM');
            server.close();
            process.exit(0);
          }, 800);
        }
      } catch (err) {
        console.error('Error guardando imagen:', err);
        res.writeHead(500);
        res.end('Error');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('=================================================================');
  console.log(`Iniciando Renderizador Animado Cel-Shaded Babylon.js en puerto ${PORT}`);
  console.log(`Total escenarios: ${SCENARIOS.length} (21 Galería + 12 Raíces)`);
  console.log('Motor: WebGL Rasterizado Nativo (CERO TRAZADO DE RAYOS)');
  console.log('=================================================================\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const args = [
    '--headless=new',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1280,720',
    `http://localhost:${PORT}/render.html`
  ];
  chromeProcess = spawn(chromePath, args);
  chromeProcess.on('error', err => {
    console.error('Error al iniciar Chrome:', err);
  });
});

// -----------------------------------------------------------------------------
// PLANTILLA HTML CON BABYLON.JS PROCEDURAL (IDÉNTICO AL MAÍZ DE REFERENCIA)
// -----------------------------------------------------------------------------
function generateRenderHtml(scenarios) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/babylon.js"></script>
  <style>
    body { margin: 0; overflow: hidden; background: #bde7f4; }
    canvas { width: 1280px; height: 720px; display: block; }
  </style>
</head>
<body>
<canvas id="c" width="1280" height="720"></canvas>
<script>
  function remoteLog(msg) {
    try {
      fetch('/log', { method: 'POST', body: String(msg) }).catch(() => {});
    } catch(e) {}
  }
  window.onerror = function(msg, url, line, col, err) {
    remoteLog('JS ERROR: ' + msg + ' at ' + url + ':' + line + ':' + col + ' ' + (err ? err.stack : ''));
  };
  remoteLog('PAGE LOADED AND SCRIPT STARTED');

  const B = BABYLON, V = (x, y, z) => new B.Vector3(x, y, z);
  const canvas = document.getElementById('c');
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.74, 0.90, 0.97, 1);

  // Cámara
  const cam = new B.ArcRotateCamera('cam', -Math.PI / 2.3, Math.PI / 2.25, 15, V(0, 3.9, 0), scene);

  // Luces
  const hemi = new B.HemisphericLight('h', V(0, 1, 0), scene);
  hemi.intensity = 0.82;
  hemi.groundColor = new B.Color3(0.75, 0.65, 0.45);
  const sun = new B.DirectionalLight('s', V(-0.5, -1, -0.4), scene);
  sun.position = V(6, 12, 5);
  sun.intensity = 0.65;
  const sg = new B.ShadowGenerator(1024, sun);
  sg.useBlurExponentialShadowMap = true;
  sg.blurKernel = 24;
  sg.setDarkness(0.5);

  // Helpers de estilo caricatura
  const mat = (hex, em = 0.4, spec = 0) => {
    const m = new B.StandardMaterial('m_' + hex + '_' + Math.random().toString(36).substr(2,4), scene);
    const c = B.Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(em);
    m.specularColor = new B.Color3(spec, spec, spec);
    m.backFaceCulling = false;
    return m;
  };
  const ink = (m, w = 0.02, col = '#25330f') => {
    m.renderOutline = true;
    m.outlineWidth = w;
    m.outlineColor = B.Color3.FromHexString(col);
    return m;
  };
  const cast = m => { sg.addShadowCaster(m); return m; };

  // Suelo base cilíndrico caricatura
  const grass = B.MeshBuilder.CreateCylinder('g', { diameter: 14, height: 0.3, tessellation: 56 }, scene);
  grass.position.y = -0.15;
  grass.material = mat('#8fd44a', 0.5);
  grass.receiveShadows = true;
  ink(grass, 0.03);

  const soil = B.MeshBuilder.CreateCylinder('so', { diameter: 13.7, height: 1.2, tessellation: 56 }, scene);
  soil.position.y = -0.9;
  soil.material = mat('#8a5a2b', 0.4);

  const mound = B.MeshBuilder.CreateSphere('mo', { diameter: 1.9 }, scene);
  mound.scaling.y = 0.22;
  mound.material = mat('#7a4c22', 0.4);
  ink(mound, 0.03);

  const blade = B.MeshBuilder.CreateCylinder('bl', { diameterTop: 0, diameterBottom: 0.12, height: 0.5, tessellation: 5 }, scene);
  blade.material = mat('#5fbf2e');
  blade.isVisible = false;
  const bladeInstances = [];
  for (let i = 0; i < 80; i++) {
    const a = (i * 7.13) % (Math.PI * 2);
    const r = 1.2 + ((i * 13.7) % 5.2);
    const b = blade.createInstance('b' + i);
    b.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    b.scaling.y = 0.6 + ((i * 3.3) % 1.0);
    b.rotation.set((((i % 7) - 3.5) / 7) * 0.5, 0, (((i % 5) - 2.5) / 5) * 0.5);
    bladeInstances.push(b);
  }

  // Textura procedural de granos de elote
  function kernelTex(granoHex) {
    const W = 256, Ht = 512, t = new B.DynamicTexture('k_' + granoHex, { width: W, height: Ht }, scene, true), c = t.getContext();
    c.fillStyle = granoHex === '#ffd21f' ? '#d99a00' : granoHex;
    c.fillRect(0, 0, W, Ht);
    const cols = 16, rows = 22, cw = W / cols, rh = Ht / rows;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cw + cw / 2, y = r * rh + rh / 2;
        const g = c.createRadialGradient(x - cw * 0.12, y - rh * 0.15, 1, x, y, cw * 0.6);
        if (granoHex === '#fff09a') {
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fff09a'); g.addColorStop(1, '#e6d87e');
        } else if (granoHex.includes('38250b') || granoHex.includes('422c0c')) {
          g.addColorStop(0, '#5a3d1c'); g.addColorStop(0.55, '#3d250d'); g.addColorStop(1, '#201205');
        } else {
          g.addColorStop(0, '#fff09a'); g.addColorStop(0.55, '#ffd21f'); g.addColorStop(1, '#f0a800');
        }
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, cw * 0.46, rh * 0.46, 0, 0, 7);
        c.fill();
      }
    }
    t.update();
    return t;
  }

  // Nodo raíz dinámico de la planta
  let plantRoot = null;
  let subterraneanRoot = null;

  function clearPlant() {
    if (plantRoot) plantRoot.dispose();
    if (subterraneanRoot) subterraneanRoot.dispose();
    plantRoot = new B.TransformNode('plant', scene);
    subterraneanRoot = new B.TransformNode('subterranean', scene);
  }

  // Constructor dinámico del maíz según la configuración del escenario
  function buildPlant(cfg) {
    clearPlant();

    const isRootMode = !!cfg.tipoRaiz;
    grass.setEnabled(!isRootMode);
    soil.setEnabled(!isRootMode);
    mound.setEnabled(!isRootMode);
    bladeInstances.forEach(b => b.setEnabled(!isRootMode));

    const H = cfg.altura || 6.6;
    const plant = plantRoot;
    const plantCol = cfg.plantaColor || '#7ccc3c';
    const leafCol = cfg.leafColor || '#5cb82e';
    const stalkM = mat(plantCol, 0.45);
    const nodeM = mat('#3f9a22', 0.45);
    const huskM = mat(cfg.huskColor || '#6fc23a', 0.45);
    const ribM = mat('#a6e063', 0.45);

    // Inclinación por acame o degradación
    if (cfg.inclinacionAcame) {
      plant.rotation.z = -cfg.inclinacionAcame;
    } else if (cfg.colapsoMuerte) {
      plant.rotation.z = -cfg.colapsoMuerte;
      plant.rotation.x = 0.15 * cfg.colapsoMuerte;
    } else if (cfg.greensnap) {
      plant.rotation.z = -1.18; // Quiebre violento en caña media
      plant.rotation.x = 0.28;
    }

    const P = t => V(0.22 * Math.sin(t * 2.6), t * H, 0.1 * Math.sin(t * 3.4 + 1));
    const rad = t => (0.2 * (1 - 0.45 * t)) * Math.min(1.0, (H / 5.5));

    if (cfg.mostrarParteAerea !== false) {
      // Tallo
      const stalkSteps = 25;
      const stalkPath = Array.from({ length: stalkSteps }, (_, i) => P(i / (stalkSteps - 1)));
      const stalk = B.MeshBuilder.CreateTube('stalk', { path: stalkPath, radiusFunction: i => rad(i / (stalkSteps - 1)), tessellation: 18, cap: B.Mesh.CAP_ALL }, scene);
      stalk.material = stalkM;
      stalk.parent = plant;
      ink(stalk, 0.025);
      cast(stalk);

      // Anillos de nudos
      const numNodes = Math.min(8, Math.max(1, Math.round(H * 1.3)));
      for (let k = 1; k <= numNodes; k++) {
        const t = k / (numNodes + 1.2);
        const n = B.MeshBuilder.CreateTorus('n_' + k, { diameter: 2 * rad(t) + 0.02, thickness: 0.07 * (H / 6.6), tessellation: 20 }, scene);
        n.position = P(t);
        n.material = nodeM;
        n.parent = plant;
        ink(n, 0.016, '#25330f');
      }

      // Raíces zanco (brace roots de doble nivel)
      const numBrace = cfg.numRaicesSoporte !== undefined ? cfg.numRaicesSoporte : 6;
      if (numBrace > 0) {
        // Nivel 1 (inferior): 6 raíces fúlcreas gruesas
        for (let i = 0; i < numBrace; i++) {
          const a = i * (Math.PI * 2 / Math.max(1, numBrace)) + 0.25;
          const pts = [
            V(Math.cos(a) * 0.18, 0.42 * (H / 6.6), Math.sin(a) * 0.18),
            V(Math.cos(a) * 0.40, 0.22 * (H / 6.6), Math.sin(a) * 0.40),
            V(Math.cos(a) * 0.65, -0.08, Math.sin(a) * 0.65)
          ];
          const r = B.MeshBuilder.CreateTube('r1_' + i, { path: pts, radius: 0.045, tessellation: 7 }, scene);
          r.material = mat('#c9a95c', 0.48);
          r.parent = plant;
          ink(r, 0.014, '#25330f');
        }
        // Nivel 2 (superior): 8 raíces fúlcreas en plantas adultas
        if (numBrace >= 6 && H >= 5.0) {
          for (let i = 0; i < 8; i++) {
            const a = i * (Math.PI * 2 / 8) + 0.25 + Math.PI / 8;
            const pts = [
              V(Math.cos(a) * 0.19, 0.68 * (H / 6.6), Math.sin(a) * 0.19),
              V(Math.cos(a) * 0.48, 0.35 * (H / 6.6), Math.sin(a) * 0.48),
              V(Math.cos(a) * 0.78, -0.08, Math.sin(a) * 0.78)
            ];
            const r = B.MeshBuilder.CreateTube('r2_' + i, { path: pts, radius: 0.038, tessellation: 7 }, scene);
            r.material = mat('#bfa052', 0.46);
            r.parent = plant;
            ink(r, 0.013, '#25330f');
          }
        }
      }

      // Hojas
      const numLeaves = cfg.numHojas || 8;
      const leafScale = cfg.leafScale || 1.0;
      for (let k = 0; k < numLeaves; k++) {
        const t = 0.07 + k * (0.85 / Math.max(1, numLeaves));
        const az = k * Math.PI + Math.sin(k * 1.7) * 0.5;
        const L = (3.1 - k * 0.14) * (H / 6.6) * leafScale;
        const droop = cfg.hojasMarchitas ? 1.4 : (0.85 - k * 0.07);
        const w = (cfg.hojasMarchitas ? 0.18 : 0.4) * leafScale;

        const node = new B.TransformNode('az_' + k, scene);
        node.parent = plant;
        node.position = P(t);
        node.rotation.y = -az;

        const r0 = rad(t);
        const greens = ['#5cb82e', '#4aa326', '#7bd13f'];
        let colH = greens[k % 3];
        if (cfg.clorosisNitrogeno && k < 3) colH = '#c2bd3a';
        else if (cfg.purpuraAntocianina) colH = '#703858';
        else if (cfg.leafColor) colH = cfg.leafColor;
        const leafM = mat(colH, 0.45);

        // Vaina / collar de inserción foliar en el nudo
        const collar = B.MeshBuilder.CreateCylinder('col_' + k, {
          height: 0.14 * (H / 6.6),
          diameter: 2 * r0 + 0.024,
          tessellation: 16
        }, scene);
        collar.position = P(t);
        collar.material = leafM;
        collar.parent = plant;
        ink(collar, 0.012, '#25330f');

        const Lf = [], M = [], R = [];
        for (let sIdx = 0; sIdx <= 16; sIdx++) {
          const s = sIdx / 16;
          const out = r0 + L * 0.9 * Math.pow(s, 0.9);
          const up = L * (0.5 * s - droop * s * s);
          const ww = w * Math.sin(Math.PI * Math.pow(s, 0.6));
          const curl = cfg.hojasMarchitas ? 0.25 * (1 - s) : 0;
          Lf.push(V(out, up - 0.4 * ww + curl, ww));
          M.push(V(out, up, 0));
          R.push(V(out, up - 0.4 * ww + curl, -ww));
        }

        const m = B.MeshBuilder.CreateRibbon('leaf_' + k, { pathArray: [Lf, M, R], sideOrientation: B.Mesh.DOUBLESIDE }, scene);
        m.material = leafM;
        m.parent = node;
        ink(m, 0.014, '#25330f');
        cast(m);

        const rib = B.MeshBuilder.CreateTube('rib_' + k, { path: M.map(p => p.add(V(0, 0.012, 0))), radius: 0.016, tessellation: 5 }, scene);
        rib.material = ribM;
        rib.parent = node;
        ink(rib, 0.008, '#25330f');
      }

      // Elotes (1 o 2 mazorcas)
      if (cfg.mostrarElotes) {
        const earSize = cfg.eloteTamano || 1.0;
        const peel = cfg.elotePeel !== undefined ? cfg.elotePeel : 3;
        const granoCol = cfg.granoColor || '#ffd21f';
        const silkCol = cfg.estigmaColor || '#c8873a';

        const cobM = new B.StandardMaterial('cobM', scene);
        cobM.diffuseTexture = kernelTex(granoCol);
        cobM.emissiveColor = new B.Color3(0.35, 0.28, 0.04);
        cobM.specularColor = new B.Color3(0, 0, 0);

        function makeEar(tEar, az, tilt, peelCount, silk) {
          const node = new B.TransformNode('ea', scene);
          node.parent = plant;
          node.position = P(tEar);
          node.rotation.y = -az;

          const tl = new B.TransformNode('et', scene);
          tl.parent = node;
          tl.position.x = rad(tEar) + 0.02;
          tl.rotation.z = -tilt;
          tl.scaling.setAll(earSize);

          const E = 1.5;
          const cob = B.MeshBuilder.CreateSphere('cob', { diameter: 1, segments: 24 }, scene);
          cob.scaling.set(0.5, 1.5, 0.5);
          cob.position.y = E / 2 + 0.05;
          cob.material = cobM;
          cob.parent = tl;
          ink(cob, 0.02, '#6b4a00');
          cast(cob);

          const shank = B.MeshBuilder.CreateCylinder('sh', { diameter: 0.24, height: 0.25, tessellation: 10 }, scene);
          shank.position.y = 0.1;
          shank.material = huskM;
          shank.parent = tl;

          const N = 6;
          for (let i = 0; i < N; i++) {
            const phi = i * 2 * Math.PI / N + 0.3;
            const pe = i < peelCount;
            const Lf = [], M = [], R = [];
            for (let k = 0; k <= 14; k++) {
              const s = k / 14;
              let y = 0.04 + s * E * 0.95;
              let rho = Math.max(0.12, 0.25 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.8) / 0.75, 2))) + 0.045);
              const f = pe ? Math.max(0, (s - 0.3) / 0.7) : Math.max(0, (s - 0.8) / 0.2);
              rho += (pe ? 1.15 : 0.25) * Math.pow(f, 1.55);
              y -= (pe ? 0.65 : 0.05) * f * f;
              const al = (Math.PI / N) * 1.35 * (1 - 0.9 * Math.pow(s, 2.2));
              const pt = (a, rr) => V(rr * Math.cos(a), y, rr * Math.sin(a));
              Lf.push(pt(phi - al, rho));
              M.push(pt(phi, rho + 0.03));
              R.push(pt(phi + al, rho));
            }
            const h = B.MeshBuilder.CreateRibbon('hk', { pathArray: [Lf, M, R], sideOrientation: B.Mesh.DOUBLESIDE }, scene);
            h.material = huskM;
            h.parent = tl;
            ink(h, 0.014, '#25330f');
            cast(h);
          }

          // Cabellos / estigmas (24 filamentos finos con gradiente ámbar-dorado)
          const silkPaleta = [silk, '#e8c46a', '#9a5d28', '#ffd573'];
          for (let i = 0; i < 24; i++) {
            const a = i * 2.399, c = Math.cos(a), s = Math.sin(a), y0 = E * 0.98;
            const rSpill = 0.05 + 0.18 * ((i % 5) / 4);
            const droopY = 0.45 + 0.15 * Math.sin(i * 1.3);
            const pts = [
              V(0, y0, 0),
              V(0.05 * c, y0 + 0.18, 0.05 * s),
              V(rSpill * 0.7 * c, y0 + droopY * 0.75, rSpill * 0.7 * s),
              V(rSpill * 1.15 * c, y0 + droopY, rSpill * 1.15 * s)
            ];
            const sk = B.MeshBuilder.CreateTube('sk_' + i, { path: pts, radius: 0.008, tessellation: 4 }, scene);
            sk.material = mat(silkPaleta[i % silkPaleta.length], 0.48);
            sk.parent = tl;
          }

          // Aborto de punta vana (cubierta vacía)
          if (cfg.eloteAborto) {
            const vana = B.MeshBuilder.CreateSphere('vana', { diameter: 0.38 }, scene);
            vana.position.y = E + 0.05;
            vana.material = mat('#b5a882', 0.4);
            vana.parent = tl;
          }
        }

        makeEar(0.46, Math.PI * 0.5, 0.5, Math.max(1, peel), silkCol);
        if (H > 5.0) {
          makeEar(0.62, -Math.PI * 0.5, 0.45, peel, silkCol);
        }
      }

      // Espiga / Panícula
      if (cfg.mostrarEspiga) {
        const tassel = new B.TransformNode('tassel', scene);
        tassel.parent = plant;
        tassel.position = P(1);

        const espCol = cfg.espigaColor || '#b9c46a';
        const spike = B.MeshBuilder.CreateTube('sp', { path: [V(0, 0, 0), V(0.03, 0.6, 0), V(0, 1.25, 0.04)], radius: 0.04, tessellation: 8, cap: B.Mesh.CAP_ALL }, scene);
        spike.material = mat(espCol);
        spike.parent = tassel;
        ink(spike, 0.016, '#25330f');
        cast(spike);

        const anther = B.MeshBuilder.CreateSphere('an', { diameter: 1, segments: 6 }, scene);
        anther.scaling.set(0.05, 0.1, 0.05);
        anther.material = mat('#f2d95a', 0.6);
        anther.isVisible = false;

        // Anteras en la espiga vertical central
        if (cfg.espigaAbierta !== false) {
          for (let k = 1; k <= 9; k++) {
            const inst = anther.createInstance('a_sp_' + k);
            inst.parent = tassel;
            const yS = 0.20 + k * 0.11;
            const aS = k * 1.95;
            inst.position = V(Math.cos(aS) * 0.048, yS, Math.sin(aS) * 0.048);
            inst.rotation.set(Math.random() * 0.6, Math.random() * 6.0, Math.random() * 0.6);
          }
        }

        const numBranches = cfg.espigaAbierta !== false ? 11 : 4;
        for (let b = 0; b < numBranches; b++) {
          const sp = 0.2 + b * 0.085, a = b * 2.4, l = (cfg.espigaAbierta !== false ? 1.05 : 0.45) - sp * 0.5, pts = [];
          for (let k = 0; k <= 8; k++) {
            const s = k / 8, o = l * s;
            pts.push(V(Math.cos(a) * o, sp * 1.2 + o * 0.45 - 0.55 * o * o / l, Math.sin(a) * o));
          }
          const br = B.MeshBuilder.CreateTube('br_' + b, { path: pts, radius: 0.02, tessellation: 5 }, scene);
          br.material = mat(espCol);
          br.parent = tassel;
          ink(br, 0.012, '#25330f');

          if (cfg.espigaAbierta !== false) {
            for (let k = 2; k <= 8; k++) {
              const i = anther.createInstance('a_' + b + '_' + k);
              i.parent = tassel;
              i.position = pts[k].add(V(0, -0.05, 0));
              i.rotation.set(Math.random() * 0.8, Math.random() * 6, Math.random() * 0.8);
            }
          }
        }
      }
    }

    // --- ARQUITECTURA SUBTERRÁNEA PARA LOS ESCENARIOS DE RAÍCES ---
    if (cfg.tipoRaiz) {
      buildRootSystem(cfg.tipoRaiz, cfg);
    }
  }

  // Generador botánico del sistema radicular en corte estratigráfico rizotrón
  function buildRootSystem(tipo, cfg) {
    const rootParent = subterraneanRoot;

    // Corte de suelo visible (plano de perfil del estrato edáfico completo)
    const cliff = B.MeshBuilder.CreatePlane('cliff', { width: 8.5, height: 4.8 }, scene);
    cliff.position.set(0, -1.9, 0.4);
    cliff.material = mat(cfg.encharcado ? '#3d2f1f' : '#7a5229', 0.42);
    cliff.parent = rootParent;
    ink(cliff, 0.02, '#25330f');

    // Estrato orgánico superficial fértil
    const topBand = B.MeshBuilder.CreatePlane('topBand', { width: 8.5, height: 0.45 }, scene);
    topBand.position.set(0, -0.22, 0.3);
    topBand.material = mat(cfg.encharcado ? '#261a0f' : '#5a3818', 0.38);
    topBand.parent = rootParent;

    // Franja de césped superficial
    const grassTop = B.MeshBuilder.CreatePlane('grassTop', { width: 8.5, height: 0.12 }, scene);
    grassTop.position.set(0, 0.06, 0.25);
    grassTop.material = mat('#8fd44a', 0.5);
    grassTop.parent = rootParent;

    // Semilla cariópside
    const seed = B.MeshBuilder.CreateSphere('seed', { diameter: 0.34 }, scene);
    seed.scaling.set(1.0, 1.4, 0.8);
    seed.position.set(0, -0.42, 0.0);
    seed.material = mat(tipo === 'frio_pudricion' ? '#332015' : '#e0a824', 0.55);
    seed.parent = rootParent;
    ink(seed, 0.015, '#25330f');

    const rootMat = mat(
      tipo === 'acidez_aluminio' ? '#e25555' :
      tipo === 'necrosis_postmortem' ? '#362110' :
      tipo === 'madurez_r3_r6' ? '#d6c085' : '#fff9e6',
      0.65
    );

    // Función auxiliar para trazar raíces nítidas estilo cartoon
    function addRoot(pts, radius = 0.045, col = rootMat) {
      // Forzar que todos los puntos estén en Z = 0 para estar frente al plano
      const adjustedPts = pts.map(p => V(p.x, p.y, 0.0));
      const tube = B.MeshBuilder.CreateTube('rt', { path: adjustedPts, radius, tessellation: 8, cap: B.Mesh.CAP_ALL }, scene);
      tube.material = col;
      tube.parent = rootParent;
      ink(tube, 0.012, '#25330f');
      return tube;
    }

    if (tipo === 'semilla_radicula') {
      // Radícula primaria geotrópica vertical
      addRoot([V(0, -0.55, 0.06), V(0.02, -0.95, 0.06), V(0.01, -1.45, 0.06)], 0.03);
      // Raíces seminales laterales
      addRoot([V(-0.06, -0.5, 0.06), V(-0.25, -0.75, 0.06), V(-0.45, -1.05, 0.06)], 0.02);
      addRoot([V(0.06, -0.5, 0.06), V(0.25, -0.72, 0.06), V(0.42, -0.98, 0.06)], 0.02);
      // Coleóptilo emergiendo hacia la superficie
      addRoot([V(0, -0.32, 0.06), V(0, 0.0, 0.06)], 0.035, mat('#9ad44a'));
    }
    else if (tipo === 'seminal_nodal_v2') {
      // Radícula larga + 1er verticilo nodal
      addRoot([V(0, -0.55, 0.06), V(0.02, -1.2, 0.06), V(-0.02, -2.1, 0.06)], 0.035);
      addRoot([V(-0.05, -0.5, 0.06), V(-0.4, -0.9, 0.06), V(-0.7, -1.4, 0.06)], 0.022);
      addRoot([V(0.05, -0.5, 0.06), V(0.38, -0.88, 0.06), V(0.68, -1.35, 0.06)], 0.022);
      // Primer verticilo nodal coronario
      addRoot([V(-0.02, -0.12, 0.06), V(-0.28, -0.4, 0.06), V(-0.55, -0.85, 0.06)], 0.03);
      addRoot([V(0.02, -0.12, 0.06), V(0.28, -0.4, 0.06), V(0.55, -0.85, 0.06)], 0.03);
    }
    else if (tipo === 'nodal_v4_v6') {
      // 3 verticilos nodales coronarios
      for (let w = 1; w <= 3; w++) {
        const y0 = -0.06 * w;
        for (let sign of [-1, 1]) {
          addRoot([V(sign * 0.02, y0, 0.06), V(sign * (0.2 + w * 0.15), y0 - 0.45, 0.06), V(sign * (0.45 + w * 0.25), y0 - 1.2 - w * 0.3, 0.06)], 0.032 - w * 0.003);
        }
      }
      addRoot([V(0, -0.5, 0.06), V(0.05, -1.6, 0.06), V(0.02, -2.6, 0.06)], 0.035);
    }
    else if (tipo === 'elongacion_v8_v12' || tipo === 'plenitud_vt_r1' || tipo === 'madurez_r3_r6') {
      // Malla radicular plena con múltiples verticilos
      const deepMax = tipo === 'elongacion_v8_v12' ? 2.4 : 3.2;
      for (let sign of [-1, 1]) {
        addRoot([V(sign * 0.03, -0.05, 0.06), V(sign * 0.45, -0.7, 0.06), V(sign * 0.85, -1.8, 0.06), V(sign * 1.1, -deepMax, 0.06)], 0.04);
        addRoot([V(sign * 0.03, -0.15, 0.06), V(sign * 0.35, -0.6, 0.06), V(sign * 0.65, -1.5, 0.06), V(sign * 0.8, -deepMax * 0.85, 0.06)], 0.035);
        addRoot([V(sign * 0.02, -0.25, 0.06), V(sign * 0.2, -0.8, 0.06), V(sign * 0.3, -2.1, 0.06)], 0.032);
      }
      addRoot([V(0, -0.1, 0.06), V(0.04, -1.4, 0.06), V(-0.03, -deepMax * 0.95, 0.06)], 0.042);
    }
    else if (tipo === 'sequia_steep_deep') {
      // Ángulo empinado vertical buscando humedad profunda
      for (let sign of [-1, 1]) {
        addRoot([V(sign * 0.03, -0.05, 0.06), V(sign * 0.18, -0.8, 0.06), V(sign * 0.25, -2.2, 0.06), V(sign * 0.32, -3.3, 0.06)], 0.038);
      }
      addRoot([V(0, -0.1, 0.06), V(0.02, -1.8, 0.06), V(0.01, -3.4, 0.06)], 0.045);
    }
    else if (tipo === 'encharcamiento_hipoxia') {
      // Raíces superficiales y necrosis apical anóxica (puntas negras)
      const blackTip = mat('#201408');
      for (let sign of [-1, 1]) {
        addRoot([V(sign * 0.02, -0.05, 0.06), V(sign * 0.65, -0.22, 0.06), V(sign * 1.25, -0.38, 0.06)], 0.032);
        addRoot([V(sign * 0.03, -0.15, 0.06), V(sign * 0.45, -0.55, 0.06)], 0.035);
        addRoot([V(sign * 0.45, -0.55, 0.06), V(sign * 0.58, -0.78, 0.06)], 0.038, blackTip); // punta necrótica
      }
    }
    else if (tipo === 'acidez_aluminio') {
      // Raíces cortas, engrosadas y curvadas (stubby roots) con ápices engrosados
      for (let sign of [-1, 1]) {
        addRoot([V(sign * 0.02, -0.05, 0.06), V(sign * 0.28, -0.25, 0.06), V(sign * 0.42, -0.48, 0.06)], 0.055, rootMat);
        addRoot([V(sign * 0.03, -0.15, 0.06), V(sign * 0.22, -0.38, 0.06), V(sign * 0.35, -0.58, 0.06)], 0.052, rootMat);
      }
      addRoot([V(0, -0.1, 0.06), V(0.04, -0.45, 0.06), V(-0.02, -0.75, 0.06)], 0.06, rootMat);
    }
    else if (tipo === 'frio_pudricion') {
      // Semilla podrida oscura y radícula abortada atrofiada
      addRoot([V(0, -0.55, 0.06), V(0.02, -0.72, 0.06)], 0.028, mat('#3b2210'));
    }
    else if (tipo === 'acame_desgarro') {
      // Tensión y desgarro asimétrico en barlovento (lado izquierdo)
      addRoot([V(-0.05, -0.05, 0.06), V(-0.55, 0.12, 0.06), V(-0.85, 0.22, 0.06)], 0.035, mat('#b8523b')); // desgarrada / expuesta
      addRoot([V(0.05, -0.05, 0.06), V(0.55, -0.85, 0.06), V(0.85, -1.8, 0.06)], 0.035);
    }
    else if (tipo === 'necrosis_postmortem') {
      // Colapso cortical oscuro y fragmentación
      for (let sign of [-1, 1]) {
        addRoot([V(sign * 0.03, -0.05, 0.06), V(sign * 0.35, -0.65, 0.06), V(sign * 0.65, -1.35, 0.06)], 0.022, rootMat);
      }
      addRoot([V(0, -0.1, 0.06), V(0.02, -1.1, 0.06)], 0.025, rootMat);
    }
  }

  // Controlador de cámaras
  function setCamera(mode) {
    if (mode === 'elote_closeup') {
      cam.target = V(0.15, 3.9, 0);
      cam.alpha = -Math.PI / 2.15;
      cam.beta = Math.PI / 2.3;
      cam.radius = 4.8;
    } else if (mode === 'espiga_closeup') {
      cam.target = V(0.0, 6.7, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = 1.35;
      cam.radius = 4.6;
    } else if (mode === 'raices_closeup') {
      cam.target = V(0.0, 0.45, 0);
      cam.alpha = -1.35;
      cam.beta = 1.28;
      cam.radius = 3.2;
    } else if (mode === 'hojas_closeup') {
      cam.target = V(-0.2, 3.2, 0);
      cam.alpha = -Math.PI / 1.7;
      cam.beta = Math.PI / 2.3;
      cam.radius = 4.8;
    } else if (mode === 'plantula') {
      cam.target = V(0, 0.45, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = Math.PI / 2.25;
      cam.radius = 3.2;
    } else if (mode === 'plantula_v4') {
      cam.target = V(0, 1.0, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = Math.PI / 2.25;
      cam.radius = 5.2;
    } else if (mode === 'general_media') {
      cam.target = V(0, 2.4, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = Math.PI / 2.25;
      cam.radius = 8.5;
    } else if (mode === 'general_acame') {
      cam.target = V(0.8, 2.0, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = Math.PI / 2.25;
      cam.radius = 11.5;
    } else if (mode === 'raiz_subterranea') {
      cam.target = V(0.0, -1.6, 0);
      cam.alpha = -Math.PI / 2.0;
      cam.beta = Math.PI / 2.0;
      cam.radius = 4.3;
    } else {
      // General (Exacto al ángulo de referencia Babylon)
      cam.target = V(0, 3.9, 0);
      cam.alpha = -Math.PI / 2.3;
      cam.beta = Math.PI / 2.25;
      cam.radius = 11.5;
    }
  }

  // Bucle de renderizado automatizado
  const scenarios = ${JSON.stringify(scenarios)};
  let currentIdx = 0;

  function renderNext() {
    if (currentIdx >= scenarios.length) return;
    const item = scenarios[currentIdx];

    remoteLog('Rendering scenario ' + currentIdx + ': ' + item.name);
    // Configurar escena
    try {
      buildPlant(item);
      setCamera(item.camera);
    } catch(err) {
      remoteLog('ERROR IN buildPlant: ' + err.message + ' ' + err.stack);
    }

    // Forzar 2 pases de renderizado para estabilizar sombras y contornos
    scene.render();
    scene.render();

    setTimeout(() => {
      scene.render();
      const dataUrl = canvas.toDataURL('image/png');
      fetch('/save-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: item.folder,
          name: item.name,
          data: dataUrl
        })
      })
      .then(res => res.json())
      .then(res => {
        if (res.next !== null) {
          currentIdx = res.next;
          renderNext();
        }
      })
      .catch(err => console.error('Error enviando fotograma:', err));
    }, 120);
  }

  // Iniciar renders tras arranque de Babylon
  setTimeout(() => {
    renderNext();
  }, 400);
</script>
</body>
</html>`;
}
