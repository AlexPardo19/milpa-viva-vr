#!/usr/bin/env python3
"""
Generador automatizado de la Galería Fisiológica, Progresión Morfométrica del Elote (R1-R6)
y Secuencia de Degradación Post-Mortem en Blender Cycles sobre Metal (Mac M5 Pro).
"""

import subprocess
import os
import sys

RENDERS = [
    # 1. Crecimiento vegetativo
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 55,  # Día 10
        "name": "01_emergencia_VE_dia10",
        "camera": "general",
        "desc": "Plántula emergida (VE) a los 10 días desde la siembra"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 187,  # Día 32
        "name": "02_plantula_V4_dia32",
        "camera": "general",
        "desc": "Plántula establecida (V4) con 4 hojas desplegadas"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 409,  # Día 69
        "name": "03_vegetativo_V8_dia69",
        "camera": "general",
        "desc": "Crecimiento vegetativo rápido (V8), elongación de caña"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 727,  # Día 122
        "name": "04_floracion_masculina_VT_dia122",
        "camera": "general",
        "desc": "Floración masculina (VT): Panoja apical abierta emitiendo polen"
    },
    # 2. Progresión morfométrica del tamaño del fruto (R1 a R6)
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 769,  # Día 129
        "name": "05_inicio_fruto_jilote_R1_dia129",
        "camera": "general",
        "desc": "Inicio del fruto: Jilote femenino (R1) emergiendo en el nudo medio"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 769,  # Día 129 (elote_crec = 0.18, ~4 cm)
        "name": "06_detalle_jilote_estigmas_R1_closeup",
        "camera": "elote",
        "desc": "Macro Jilote inicial (R1, Día 129): ~4.0 cm (18%), estigmas frescos receptivos"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 913,  # Día 153 (R2 Ampolla, elote_crec = 0.68, ~13.6 cm)
        "name": "06b_detalle_ampolla_R2_closeup",
        "camera": "elote",
        "desc": "Macro Ampolla (R2, Día 153): ~13.6 cm (68%), elongación activa de olote y brácteas"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 973,  # Día 163 (R3 Leche / Elote)
        "name": "07_elote_cosecha_R3_dia163",
        "camera": "general",
        "desc": "Etapa R3 (Leche): Elote tierno desarrollado listo para cosecha en fresco"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 973,  # Día 163 (elote_crec = 0.93, ~18.6 cm)
        "name": "08_detalle_elote_cosecha_R3_closeup",
        "camera": "elote",
        "desc": "Macro Elote tierno (R3, Día 163): ~18.6 cm (93%), brácteas abiertas mostrando 16 hileras lechosas"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 1165,  # Día 195 (R5 Dentado, elote_crec = 1.00, 20 cm)
        "name": "08b_detalle_dentado_R5_closeup",
        "camera": "elote",
        "desc": "Macro Grano Dentado (R5, Día 195): 20.0 cm (100%), secado parcial de totomoxtle y llenado pleno"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 1303,  # Día 218 (R6 Madurez fisiológica)
        "name": "09_madurez_fisiologica_R6_dia218",
        "camera": "general",
        "desc": "Madurez fisiológica (R6): Senescencia dorada y formación de capa negra"
    },
    {
        "csv": "render/trayectoria_optimo.csv",
        "frame": 1303,  # Día 218 (R6)
        "name": "10_detalle_mazorca_madura_R6_closeup",
        "camera": "elote",
        "desc": "Macro Mazorca madura (R6, Día 218): Totomoxtle pajizo abierto, grano ámbar y estigmas secos"
    },
    # 3. Condiciones adversas: marchitez reversible, aborto, acame y muerte
    {
        "csv": "render/trayectoria_marchitez_sequia_v8.csv",
        "frame": 379,  # Día 64 (antes de muerte)
        "name": "11_marchitez_decaimiento_sequia",
        "camera": "hojas",
        "desc": "Marchitez foliar reversible por sequía: Células buliformes enrolladas en cartucho"
    },
    {
        "csv": "render/trayectoria_marchitez_sequia_v8.csv",
        "frame": 409,  # Día 69 (tras muerte letal)
        "name": "12_muerte_sequia_terminal",
        "camera": "general",
        "desc": "Muerte irreversible por sequía en V8: Colapso vegetativo sin llegar a producir elote"
    },
    {
        "csv": "render/trayectoria_helada_v8.csv",
        "frame": 367,  # Día 62
        "name": "13_muerte_helada_severa_V8",
        "camera": "general",
        "desc": "Muerte por helada severa en V8 (T <= -2.5 °C): Destrucción celular del meristemo apical"
    },
    {
        "csv": "render/trayectoria_sequia_floracion.csv",
        "frame": 955,  # Día 160
        "name": "14_aborto_fruto_estres_floracion",
        "camera": "elote",
        "desc": "Mal cuajado y aborto apical: Mazorca con punta vana por sequía en floración (VT-R1)"
    },
    {
        "csv": "render/trayectoria_acame_tormenta.csv",
        "frame": 583,  # Día 98
        "name": "15_acame_tormenta_viento",
        "camera": "general",
        "desc": "Acame mecánico por tormenta: Flexión de la caña a 55° en suelo saturado (>52% VWC)"
    },
    # 4. Degradación post-mortem progresiva (planta y fruto)
    {
        "csv": "render/trayectoria_muerte_con_elote_r3.csv",
        "frame": 979,  # Día 164 (Día 1 post-mortem, degradacion = 0.15)
        "name": "16_degradacion_postmortem_dia1_colapso",
        "camera": "general",
        "desc": "Degradación Post-Mortem (Día 1 tras muerte en R3): Quiebre inicial de caña (degradación 15%)"
    },
    {
        "csv": "render/trayectoria_muerte_con_elote_r3.csv",
        "frame": 1009,  # Día 169 (Día 6 post-mortem, degradacion = 0.58)
        "name": "17_degradacion_postmortem_dia6_desecacion",
        "camera": "general",
        "desc": "Degradación Post-Mortem (Día 6): Desecación avanzada, contracción tisular y pardeamiento (58%)"
    },
    {
        "csv": "render/trayectoria_muerte_con_elote_r3.csv",
        "frame": 1045,  # Día 175 (Día 12 post-mortem, degradacion = 1.00)
        "name": "18_degradacion_postmortem_dia12_necrosis_total",
        "camera": "general",
        "desc": "Degradación Post-Mortem (Día 12): Necrosis oscura terminal y colapso estructural completo (100%)"
    },
    {
        "csv": "render/trayectoria_muerte_con_elote_r3.csv",
        "frame": 1045,  # Día 175 (Closeup del elote degradado)
        "name": "19_detalle_elote_degradado_postmortem_closeup",
        "camera": "elote_muerte",
        "desc": "Macro Elote degradado post-mortem: Grano encogido/necrótico, brácteas secas y punta colapsada"
    }
]

def main():
    blender_bin = "/Applications/Blender.app/Contents/MacOS/Blender"
    out_dir = "render/galeria"
    os.makedirs(out_dir, exist_ok=True)

    print("=================================================================")
    print(f"Iniciando Renderizado de Galería Botánica Detallada ({len(RENDERS)} Cuadros)")
    print("Motor: Cycles sobre Apple Silicon Metal (MetalRT + OIDN)")
    print(f"Salida: {out_dir}")
    print("=================================================================\n")

    for i, item in enumerate(RENDERS, 1):
        nombre_salida = f"{item['name']}.png"
        ruta_completa = os.path.join(out_dir, nombre_salida)

        print(f"[{i}/{len(RENDERS)}] Renderizando: {nombre_salida}")
        print(f"      Etapa/Hito: {item['desc']}")
        print(f"      Cámara: {item['camera']} | Frame: {item['frame']}")

        cmd = [
            blender_bin,
            "-b",
            "-P", "scripts/render_timelapse.py",
            "--",
            "--csv", item["csv"],
            "--out", out_dir,
            "--samples", "64",
            "--res", "1280x720",
            "--camera", item["camera"],
            "--frame", str(item["frame"]),
            "--name", item["name"]
        ]

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if res.returncode == 0 and os.path.exists(ruta_completa):
            tamano_mb = os.path.getsize(ruta_completa) / (1024 * 1024)
            print(f"      ✓ Render exitoso ({tamano_mb:.2f} MB)\n")
        else:
            print("      ✗ Error al renderizar:")
            print("\n".join(res.stdout.splitlines()[-10:]))
            print()

    print("=================================================================")
    print("Galería completa finalizada con éxito.")
    print("=================================================================")

if __name__ == "__main__":
    main()
