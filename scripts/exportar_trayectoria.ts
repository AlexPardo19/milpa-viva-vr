/**
 * Generador de trayectorias diarias para renderizado offline en Blender Cycles / Metal.
 *
 * Lee la configuración de un escenario climático (JSON) y ejecuta el paso diario puro de
 * Zea mays L. Chalqueño (src/nucleo.ts), exportando un archivo CSV con una fila por día.
 *
 * Uso:
 *   npx tsx scripts/exportar_trayectoria.ts escenarios/optimo.json render/trayectoria_optimo.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  crearPlanta,
  pasoDia,
  filaRender,
  normalizarClimaDia,
  ClimaDia
} from '../src/nucleo';

interface EscenarioDef {
  nombre?: string;
  descripcion?: string;
  base?: Partial<ClimaDia>;
  valores?: Partial<ClimaDia>;
  diasEspecificos?: Record<number, Partial<ClimaDia>>;
  rangos?: { desdeDia: number; hastaDia: number; clima: Partial<ClimaDia> }[];
}

function obtenerClimaDelDia(def: EscenarioDef, diaNum: number): ClimaDia {
  const baseValores = def.valores ?? def.base ?? {};
  let climaDia = { ...baseValores };

  // Overrides por rangos de días
  if (def.rangos) {
    for (const r of def.rangos) {
      if (diaNum >= r.desdeDia && diaNum <= r.hastaDia) {
        climaDia = { ...climaDia, ...r.clima };
      }
    }
  }

  // Overrides por día específico
  if (def.diasEspecificos && def.diasEspecificos[diaNum]) {
    climaDia = { ...climaDia, ...def.diasEspecificos[diaNum] };
  }

  return normalizarClimaDia(climaDia);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Uso: npx tsx scripts/exportar_trayectoria.ts <escenario.json> <salida.csv>");
    process.exit(1);
  }

  const [rutaEscenario, rutaSalida] = args;
  const rawData = readFileSync(rutaEscenario, 'utf8');
  const def: EscenarioDef = JSON.parse(rawData);

  console.log(`[Exportador Trayectoria] Cargando escenario: ${def.nombre ?? rutaEscenario}`);

  let planta = crearPlanta();
  const filas: Record<string, number | string>[] = [];
  let diasFinal = 0;
  const maxDias = 240;

  for (let dia = 1; dia <= maxDias; dia++) {
    const climaDia = obtenerClimaDelDia(def, dia);
    planta = pasoDia(planta, climaDia);
    filas.push(filaRender(planta, dia));

    if (planta.estado === 'MUERTA' || planta.estado === 'MADURA') {
      diasFinal++;
      // Permitir observar la planta durante 16 días tras morir (para degradación completa) o madurar
      if (diasFinal >= 16) break;
    }
  }

  if (filas.length === 0) {
    console.error("[Exportador Trayectoria] Error: no se generaron filas de simulación.");
    process.exit(1);
  }

  mkdirSync(dirname(rutaSalida), { recursive: true });
  const columnas = Object.keys(filas[0]);
  const lineasCsv = [
    columnas.join(','),
    ...filas.map((f) => columnas.map((c) => f[c]).join(','))
  ];

  writeFileSync(rutaSalida, lineasCsv.join('\n'), 'utf8');
  console.log(`[Exportador Trayectoria] Exportadas ${filas.length} filas diarias exitosamente a: ${rutaSalida}`);
  console.log(`  - Estado final: ${planta.estado}`);
  console.log(`  - GDD acumulado: ${planta.gdd.toFixed(1)} °C·día`);
  console.log(`  - Elote visible: ${planta.eloteVis} | Grano llenado: ${planta.granoLlenado.toFixed(3)} | Cuajado: ${planta.cuajado.toFixed(3)}`);
}

main();
