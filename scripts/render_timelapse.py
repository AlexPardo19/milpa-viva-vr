#!/usr/bin/env python3
"""
Renderizador offline de Time-Lapse y Galería Científica en Blender Cycles sobre Apple Silicon Metal (Mac M5 Pro).

Lee la trayectoria agrofisiológica diaria exportada en CSV y genera la animación o fotogramas clave
del crecimiento del Maíz Chalqueño, desarrollo morfométrico de elotes/mazorcas (R1 a R6) y
degradación progresiva post-mortem.
"""

import bpy
import sys
import csv
import math
import argparse
import os
from pathlib import Path
from mathutils import Vector, Matrix

def lerp(a, b, t):
    t = max(0.0, min(1.0, float(t)))
    return a + (b - a) * t

def lerp_color(c1, c2, t):
    t = max(0.0, min(1.0, float(t)))
    return (
        c1[0] + (c2[0] - c1[0]) * t,
        c1[1] + (c2[1] - c1[1]) * t,
        c1[2] + (c2[2] - c1[2]) * t,
        1.0
    )

def apuntar_camara(cam, loc, target, lens=45.0):
    cam.location = Vector(loc)
    direction = Vector(target) - cam.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot_quat.to_euler()
    cam.data.lens = lens

def preparar_escena_si_esta_vacia():
    """Configura la escena base estilizada: cielo celeste, sol con halo, nubes, podio de pasto/tierra y planta."""
    tiene_planta = any(
        o.type == 'MESH' and o.data.shape_keys and 'Brote' in o.data.shape_keys.key_blocks
    for o in bpy.data.objects)
    if tiene_planta:
        return

    print("[Render Timelapse] Configurando escena estilizada e importando public/models/planta.glb...")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 0. Cielo estilizado celeste brillante (#bde7f4)
    world = bpy.data.worlds.new("CieloEstilizado")
    bpy.context.scene.world = world
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    w_nodes = world.node_tree.nodes
    w_links = world.node_tree.links
    bg_node = w_nodes.get("Background")
    if bg_node:
        tex_coord = w_nodes.new(type="ShaderNodeTexCoord")
        sep_xyz = w_nodes.new(type="ShaderNodeSeparateXYZ")
        ramp_sky = w_nodes.new(type="ShaderNodeValToRGB")
        # Gradiente suave: horizonte celeste claro #bde7f4 -> cenit cian suave
        ramp_sky.color_ramp.elements[0].position = 0.0
        ramp_sky.color_ramp.elements[0].color = (0.74, 0.90, 0.97, 1.0)
        ramp_sky.color_ramp.elements[-1].position = 1.0
        ramp_sky.color_ramp.elements[-1].color = (0.64, 0.84, 0.95, 1.0)
        w_links.new(tex_coord.outputs["Generated"], sep_xyz.inputs["Vector"])
        w_links.new(sep_xyz.outputs["Z"], ramp_sky.inputs["Fac"])
        w_links.new(ramp_sky.outputs["Color"], bg_node.inputs["Color"])
        bg_node.inputs["Strength"].default_value = 1.05

    # 1. Sol estilizado con halo brillante (#ffd53a / #ffe680)
    loc_sol = (-2.6, 3.4, 2.5)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.38, location=loc_sol, segments=24, ring_count=16)
    sol_mesh = bpy.context.active_object
    sol_mesh.name = "SolEstilizado"
    mat_sol = bpy.data.materials.new("SolMat")
    if hasattr(mat_sol, "use_nodes"):
        mat_sol.use_nodes = True
    bsdf_sol = mat_sol.node_tree.nodes.get("Principled BSDF")
    if bsdf_sol:
        bsdf_sol.inputs["Base Color"].default_value = (1.0, 0.835, 0.228, 1.0)
        bsdf_sol.inputs["Emission Color"].default_value = (1.0, 0.835, 0.228, 1.0)
        if "Emission Strength" in bsdf_sol.inputs:
            bsdf_sol.inputs["Emission Strength"].default_value = 2.5
    sol_mesh.data.materials.append(mat_sol)

    # Halo semitransparente del sol
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.58, location=loc_sol, segments=24, ring_count=16)
    halo_mesh = bpy.context.active_object
    halo_mesh.name = "HaloSolEstilizado"
    mat_halo = bpy.data.materials.new("HaloSolMat")
    if hasattr(mat_halo, "use_nodes"):
        mat_halo.use_nodes = True
    bsdf_halo = mat_halo.node_tree.nodes.get("Principled BSDF")
    if bsdf_halo:
        bsdf_halo.inputs["Base Color"].default_value = (1.0, 0.90, 0.50, 1.0)
        bsdf_halo.inputs["Emission Color"].default_value = (1.0, 0.90, 0.50, 1.0)
        if "Emission Strength" in bsdf_halo.inputs:
            bsdf_halo.inputs["Emission Strength"].default_value = 1.2
        if "Transmission Weight" in bsdf_halo.inputs:
            bsdf_halo.inputs["Transmission Weight"].default_value = 0.72
        bsdf_halo.inputs["Alpha"].default_value = 0.28
    halo_mesh.data.materials.append(mat_halo)

    # 2. Nubes cartoon estilizadas (racimos de esferas blancas #ffffff)
    mat_nube = bpy.data.materials.new("NubeMat")
    if hasattr(mat_nube, "use_nodes"):
        mat_nube.use_nodes = True
    bsdf_nube = mat_nube.node_tree.nodes.get("Principled BSDF")
    if bsdf_nube:
        bsdf_nube.inputs["Base Color"].default_value = (0.98, 0.98, 0.99, 1.0)
        bsdf_nube.inputs["Emission Color"].default_value = (0.98, 0.98, 0.99, 1.0)
        if "Emission Strength" in bsdf_nube.inputs:
            bsdf_nube.inputs["Emission Strength"].default_value = 0.25
        bsdf_nube.inputs["Roughness"].default_value = 0.65

    racimos_nubes = [
        {"loc": (-2.0, 2.6, 1.8), "scale": 0.45},
        {"loc": (1.6, 2.8, 1.9), "scale": 0.52},
        {"loc": (2.3, 1.9, 1.2), "scale": 0.38},
        {"loc": (-1.4, 3.2, 2.3), "scale": 0.42},
    ]
    for ic, nc in enumerate(racimos_nubes):
        cx, cy, cz = nc["loc"]
        s = nc["scale"]
        offsets = [
            (0.0, 0.0, 0.0, 1.1),
            (0.55 * s, -0.05 * s, 0.08 * s, 0.85),
            (-0.55 * s, -0.05 * s, 0.0, 0.82),
            (0.20 * s, 0.15 * s, 0.18 * s, 0.78)
        ]
        for ip, (ox, oy, oz, r_sub) in enumerate(offsets):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=s * r_sub, location=(cx + ox, cy + oy, cz + oz), segments=16, ring_count=12)
            part_nube = bpy.context.active_object
            part_nube.name = f"Nube_{ic}_{ip}"
            part_nube.data.materials.append(mat_nube)
            for p in part_nube.data.polygons:
                p.use_smooth = True

    # 3. Podio estilizado en capas: Capa de pasto verde (#8fd44a), estrato de tierra (#8a5a2b) y montículo (#7a4c22)
    # 3A. Disco superior de pasto verde
    bpy.ops.mesh.primitive_cylinder_add(radius=1.35, depth=0.06, location=(0, 0, -0.03), vertices=56)
    pasto_mesh = bpy.context.active_object
    pasto_mesh.name = "PodioPasto"
    mat_pasto = bpy.data.materials.new("PastoEstilizadoMat")
    if hasattr(mat_pasto, "use_nodes"):
        mat_pasto.use_nodes = True
    bsdf_pasto = mat_pasto.node_tree.nodes.get("Principled BSDF")
    if bsdf_pasto:
        bsdf_pasto.inputs["Base Color"].default_value = (0.56, 0.83, 0.29, 1.0)  # #8fd44a
        bsdf_pasto.inputs["Roughness"].default_value = 0.52
    pasto_mesh.data.materials.append(mat_pasto)
    for p in pasto_mesh.data.polygons:
        p.use_smooth = True

    # 3B. Cilindro inferior de tierra estratificada
    bpy.ops.mesh.primitive_cylinder_add(radius=1.32, depth=0.28, location=(0, 0, -0.20), vertices=56)
    suelo_mesh = bpy.context.active_object
    suelo_mesh.name = "PodioTierra"
    mat_suelo_p = bpy.data.materials.new("TierraEstilizadaMat")
    if hasattr(mat_suelo_p, "use_nodes"):
        mat_suelo_p.use_nodes = True
    bsdf_suelo_p = mat_suelo_p.node_tree.nodes.get("Principled BSDF")
    if bsdf_suelo_p:
        bsdf_suelo_p.inputs["Base Color"].default_value = (0.54, 0.35, 0.17, 1.0)  # #8a5a2b
        bsdf_suelo_p.inputs["Roughness"].default_value = 0.78
    suelo_mesh.data.materials.append(mat_suelo_p)
    for p in suelo_mesh.data.polygons:
        p.use_smooth = True

    # 3C. Montículo de tierra central alrededor de la caña (#7a4c22)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(0, 0, 0.012), segments=32, ring_count=20)
    mound_mesh = bpy.context.active_object
    mound_mesh.name = "MonticuloTierra"
    mound_mesh.scale = (1.0, 1.0, 0.24)
    mat_mound = bpy.data.materials.new("MonticuloMat")
    if hasattr(mat_mound, "use_nodes"):
        mat_mound.use_nodes = True
    bsdf_mound = mat_mound.node_tree.nodes.get("Principled BSDF")
    if bsdf_mound:
        bsdf_mound.inputs["Base Color"].default_value = (0.48, 0.30, 0.13, 1.0)  # #7a4c22
        bsdf_mound.inputs["Roughness"].default_value = 0.72
    mound_mesh.data.materials.append(mat_mound)
    for p in mound_mesh.data.polygons:
        p.use_smooth = True

    # 3D. Mechones estilizados de briznas de hierba (#5fbf2e)
    mat_hierba = bpy.data.materials.new("HierbaBriznasMat")
    if hasattr(mat_hierba, "use_nodes"):
        mat_hierba.use_nodes = True
    bsdf_h = mat_hierba.node_tree.nodes.get("Principled BSDF")
    if bsdf_h:
        bsdf_h.inputs["Base Color"].default_value = (0.37, 0.75, 0.18, 1.0)  # #5fbf2e
        bsdf_h.inputs["Roughness"].default_value = 0.42

    for ib in range(32):
        ang_b = (ib / 32.0) * math.pi * 2.0 + (ib * 0.45) % 0.3
        rad_b = 0.32 + 0.78 * ((ib * 0.618034) % 1.0)
        bx = math.cos(ang_b) * rad_b
        by = math.sin(ang_b) * rad_b
        bpy.ops.mesh.primitive_cone_add(radius1=0.018, radius2=0.0, depth=0.075, location=(bx, by, 0.035))
        blade_obj = bpy.context.active_object
        blade_obj.name = f"Hierba_{ib}"
        blade_obj.rotation_euler = (
            math.radians(math.sin(ib * 2.3) * 18.0),
            math.radians(math.cos(ib * 1.7) * 18.0),
            ang_b
        )
        blade_obj.data.materials.append(mat_hierba)

    # 4. Iluminación limpia, cálida y estilizada
    bpy.ops.object.light_add(type='SUN', location=(-2.6, 3.4, 3.5))
    sol = bpy.context.active_object
    sol.name = "SolEstilizadoLuz"
    sol.data.energy = 2.4
    sol.data.color = (1.0, 0.98, 0.92)
    if hasattr(sol.data, "angle"):
        sol.data.angle = math.radians(2.0)
    sol.rotation_euler = (math.radians(48.0), math.radians(16.0), math.radians(-32.0))

    # Luz de relleno frontal para realzar el relieve y las brácteas del maíz
    bpy.ops.object.light_add(type='SUN', location=(0.0, -2.5, 1.8))
    relleno = bpy.context.active_object
    relleno.name = "LuzRellenoFrontal"
    relleno.data.energy = 0.95
    relleno.data.color = (0.85, 0.93, 1.0)
    relleno.rotation_euler = (math.radians(35.0), 0.0, 0.0)

    # Luz de rebote cálida desde el pasto hacia arriba
    bpy.ops.object.light_add(type='SUN', location=(0.0, 0.0, -1.0))
    rebote = bpy.context.active_object
    rebote.name = "LuzRebotePasto"
    rebote.data.energy = 0.45
    rebote.data.color = (0.75, 0.92, 0.65)
    rebote.rotation_euler = (math.radians(-80.0), 0.0, 0.0)

    # 5. Cámara
    bpy.ops.object.camera_add(location=(0.35, -2.25, 0.72))
    cam = bpy.context.active_object
    cam.name = "CamaraRender"
    bpy.context.scene.camera = cam
    apuntar_camara(cam, (0.35, -2.25, 0.72), (0.0, 0.0, 0.52), lens=45.0)

    # 6. Importar GLB
    raiz_proyecto = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ruta_glb = os.path.join(raiz_proyecto, "public", "models", "planta.glb")
    if os.path.exists(ruta_glb):
        bpy.ops.import_scene.gltf(filepath=ruta_glb)
        print(f"[Render Timelapse] GLB importado exitosamente desde: {ruta_glb}")
    else:
        print(f"[Render Timelapse] ADVERTENCIA: no se encontró {ruta_glb}")

    preparar_nodos_materiales()

def preparar_nodos_materiales():
    """
    Prepara los materiales importados (PlantaPBR, EspigaPBR, TotomoxtlePBR, GranoPBR, EstigmaPBR)
    insertando un nodo de multiplicación de color (TintBiologico) cuando tienen textura
    conectada a Base Color, y activando dispersión subsuperficial (SSS) para realismo orgánico.
    """
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue

        # Activar translucidez subsuperficial orgánica en Cycles (Principled BSDF v2)
        sub_w = bsdf.inputs.get("Subsurface Weight")
        if sub_w:
            if "PlantaPBR" in mat.name or "TotomoxtlePBR" in mat.name:
                sub_w.default_value = 0.16
            elif "GranoPBR" in mat.name:
                sub_w.default_value = 0.28

        if any(k in mat.name for k in ("PlantaPBR", "TotomoxtlePBR", "GranoPBR")):
            base_in = bsdf.inputs.get("Base Color")
            if base_in and base_in.links:
                tex_out = base_in.links[0].from_socket
                mix_node = nodes.get("TintBiologico")
                if not mix_node:
                    mix_node = nodes.new(type="ShaderNodeMixRGB")
                    mix_node.name = "TintBiologico"
                    mix_node.blend_type = 'MULTIPLY'
                    mix_node.inputs["Fac"].default_value = 1.0
                    mix_node.inputs["Color2"].default_value = (0.5, 0.5, 0.5, 1.0)
                    links.new(tex_out, mix_node.inputs["Color1"])
                    links.new(mix_node.outputs["Color"], base_in)

def calcular_espiga_crec(r):
    """Calcula el grado de emergencia de la espiga (0 oculta en cogollo -> 1 desplegada en VT-R6)."""
    fnum = lambda k: float(r[k]) if k in r and r[k] != '' else 0.0
    etapa = str(r.get('etapa', ''))
    brote = fnum('brote')
    escala = fnum('escala')
    elote_vis = fnum('elote_vis')
    if elote_vis >= 0.5 or any(k in etapa for k in ('VT', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6')):
        return 1.0
    if brote > 0.12 or any(k in etapa for k in ('SEMILLA', 'VE', 'V2', 'V4', 'V6')):
        return 0.0
    # En etapas V8-V12 la espiga emerge progresivamente desde el cogollo apical conforme crece la planta
    return max(0.0, min(1.0, (escala - 0.50) / (0.95 - 0.50)))

def animar_materiales_fotograma(r, frame=None, insert_kf=False):
    """Calcula y aplica el color y rugosidad PBR según el estado fisiológico del día."""
    fnum = lambda k: float(r[k]) if k in r and r[k] != '' else 0.0
    estado = r.get('estado', 'VIVA')
    brote = fnum('brote')
    muerte = fnum('muerte')
    degradacion = fnum('degradacion')
    sequia = fnum('sequia')
    frio = fnum('frio')
    amar = fnum('amarillamiento')
    anto = fnum('antocianina')
    grano_llen = fnum('grano_llenado')
    estigma_seco = fnum('estigma_seco')
    bracteas_seco = fnum('bracteas_seco')
    aborto = fnum('aborto')
    espiga_crec = calcular_espiga_crec(r)

    # 1. Color de Planta (hojas y caña estilizadas como en el diseño de referencia)
    col_juvenil = (0.36, 0.72, 0.18, 1.0)   # #5cb82e
    col_adulto = (0.29, 0.64, 0.15, 1.0)    # #4aa326
    col_clorosis = (0.78, 0.68, 0.16, 1.0)
    col_maduro_r6 = (0.64, 0.54, 0.22, 1.0)
    col_antocianina = (0.48, 0.14, 0.28, 1.0)
    col_helada_viva = (0.52, 0.68, 0.68, 1.0)
    col_helada_muerte = (0.22, 0.28, 0.18, 1.0)
    col_necrosis_ini = (0.42, 0.28, 0.12, 1.0)
    col_necrosis_fin = (0.12, 0.08, 0.04, 1.0)

    if estado == 'MUERTA' or muerte >= 0.5:
        es_helada = (frio >= 0.75 and amar < 0.75)
        col_base_m = col_helada_muerte if es_helada else col_necrosis_ini
        col_planta = lerp_color(col_base_m, col_necrosis_fin, degradacion)
        rough_planta = lerp(0.72, 0.92, degradacion)
    else:
        col_planta = lerp_color(col_adulto, col_juvenil, brote)
        # Senescencia fisiológica en R5-R6
        if bracteas_seco > 0.35:
            f_sen = (bracteas_seco - 0.35) / 0.65
            col_planta = lerp_color(col_planta, col_maduro_r6, f_sen * 0.85)
        # Clorosis por estrés
        if amar > 0.05:
            col_planta = lerp_color(col_planta, col_clorosis, min(1.0, amar * 0.85))
        # Antocianinas por pH o frío
        if anto > 0.08:
            col_planta = lerp_color(col_planta, col_antocianina, min(1.0, anto * 0.75))
        # Escarcha/helada
        if frio > 0.15:
            col_planta = lerp_color(col_planta, col_helada_viva, min(1.0, frio * 0.70))
        rough_planta = lerp(0.32, 0.65, max(amar, sequia, bracteas_seco))

    # 1B. Color de la Espiga / Panoja Apical (EspigaPBR)
    # Verde-lima tierno #b9c46a -> Dorado polen intenso #f2d95a en VT-R2 -> Paja tostada en R6
    if estado == 'MUERTA' or muerte >= 0.5:
        col_espiga = lerp_color((0.36, 0.25, 0.10, 1.0), (0.12, 0.08, 0.04, 1.0), degradacion)
    else:
        col_esp_emerg = (0.72, 0.77, 0.41, 1.0)  # #b9c46a
        col_esp_polen = (0.95, 0.85, 0.35, 1.0)  # #f2d95a
        col_esp_madura = (0.68, 0.54, 0.22, 1.0)
        col_espiga = lerp_color(col_esp_emerg, col_esp_polen, min(1.0, espiga_crec * 1.15))
        if bracteas_seco > 0.15:
            col_espiga = lerp_color(col_espiga, col_esp_madura, (bracteas_seco - 0.15) / 0.85)

    # 2. Colores del Elote estilizados (Totomoxtle #6fc23a, Grano #ffd21f / #f0a800, Estigmas #c8873a)
    col_toto_verde = (0.43, 0.76, 0.23, 1.0)  # #6fc23a
    col_toto_seco = (0.64, 0.54, 0.26, 1.0)
    col_toto = lerp_color(col_toto_verde, col_toto_seco, bracteas_seco)
    if estado == 'MUERTA' or muerte >= 0.5:
        col_toto = lerp_color(col_toto, (0.28, 0.18, 0.10, 1.0), min(1.0, 0.35 + 0.65 * degradacion))

    # Grano: crema lechosa #fff09a -> amarillo elote brillante #ffd21f -> dorado maíz maduro #f0a800
    if grano_llen < 0.60:
        t_g = grano_llen / 0.60
        col_grano = lerp_color((0.98, 0.94, 0.60, 1.0), (1.0, 0.82, 0.12, 1.0), t_g)
    else:
        t_g = (grano_llen - 0.60) / 0.40
        col_grano = lerp_color((1.0, 0.82, 0.12, 1.0), (0.94, 0.66, 0.05, 1.0), t_g)

    if aborto > 0.4 and estado != 'MUERTA':
        col_grano = lerp_color(col_grano, (0.52, 0.44, 0.25, 1.0), (aborto - 0.4) * 0.8)
    if estado == 'MUERTA' or muerte >= 0.5:
        col_grano = lerp_color(col_grano, (0.24, 0.15, 0.08, 1.0), min(1.0, 0.40 + 0.60 * degradacion))

    # Estigmas (cabellos de elote): dorado ámbar tierno #c8873a / #e8c46a -> café rojizo oscuro #9a5d28
    col_estigma = lerp_color((0.78, 0.53, 0.23, 1.0), (0.28, 0.12, 0.05, 1.0), estigma_seco)

    # Aplicar en los materiales de Blender
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nodes = mat.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue

        if "PlantaPBR" in mat.name:
            mix_node = nodes.get("TintBiologico")
            if mix_node:
                mix_node.inputs["Color2"].default_value = col_planta
                if insert_kf and frame is not None:
                    mix_node.inputs["Color2"].keyframe_insert("default_value", frame=frame)
            else:
                bsdf.inputs["Base Color"].default_value = col_planta
                if insert_kf and frame is not None:
                    bsdf.inputs["Base Color"].keyframe_insert("default_value", frame=frame)
            bsdf.inputs["Roughness"].default_value = rough_planta
            if insert_kf and frame is not None:
                bsdf.inputs["Roughness"].keyframe_insert("default_value", frame=frame)

        elif "EspigaPBR" in mat.name:
            bsdf.inputs["Base Color"].default_value = col_espiga
            if insert_kf and frame is not None:
                bsdf.inputs["Base Color"].keyframe_insert("default_value", frame=frame)
            bsdf.inputs["Roughness"].default_value = lerp(0.44, 0.84, max(bracteas_seco, degradacion))
            if insert_kf and frame is not None:
                bsdf.inputs["Roughness"].keyframe_insert("default_value", frame=frame)

        elif "TotomoxtlePBR" in mat.name:
            mix_node = nodes.get("TintBiologico")
            if mix_node:
                mix_node.inputs["Color2"].default_value = col_toto
                if insert_kf and frame is not None:
                    mix_node.inputs["Color2"].keyframe_insert("default_value", frame=frame)
            else:
                bsdf.inputs["Base Color"].default_value = col_toto
                if insert_kf and frame is not None:
                    bsdf.inputs["Base Color"].keyframe_insert("default_value", frame=frame)
            bsdf.inputs["Roughness"].default_value = lerp(0.42, 0.88, max(bracteas_seco, degradacion))
            if insert_kf and frame is not None:
                bsdf.inputs["Roughness"].keyframe_insert("default_value", frame=frame)

        elif "GranoPBR" in mat.name:
            mix_node = nodes.get("TintBiologico")
            if mix_node:
                mix_node.inputs["Color2"].default_value = col_grano
                if insert_kf and frame is not None:
                    mix_node.inputs["Color2"].keyframe_insert("default_value", frame=frame)
            else:
                bsdf.inputs["Base Color"].default_value = col_grano
                if insert_kf and frame is not None:
                    bsdf.inputs["Base Color"].keyframe_insert("default_value", frame=frame)
            bsdf.inputs["Roughness"].default_value = lerp(0.22, 0.85, degradacion)
            if insert_kf and frame is not None:
                bsdf.inputs["Roughness"].keyframe_insert("default_value", frame=frame)

        elif "EstigmaPBR" in mat.name:
            bsdf.inputs["Base Color"].default_value = col_estigma
            if insert_kf and frame is not None:
                bsdf.inputs["Base Color"].keyframe_insert("default_value", frame=frame)

def configurar_camara(tipo='general'):
    cam = bpy.data.objects.get("CamaraRender")
    if not cam:
        return
    if tipo == 'elote':
        # Primer plano macro enfocado directamente al elote principal (nudo 7) y elote secundario (nudo 6)
        apuntar_camara(cam, loc=(0.44, -0.50, 0.64), target=(0.045, -0.032, 0.595), lens=48.0)
        if hasattr(cam.data, "dof"):
            cam.data.dof.use_dof = True
            cam.data.dof.focus_distance = (Vector((0.42, -0.48, 0.62)) - Vector((0.060, -0.035, 0.575))).length
            cam.data.dof.aperture_fstop = 8.0
    elif tipo == 'elote_muerte':
        # Posición frontal libre de hojas apuntando directamente al cuerpo del elote necrótico bajo la caña
        apuntar_camara(cam, loc=(0.35, -0.46, 0.22), target=(0.37, -0.05, 0.24), lens=55.0)
        bpy.ops.object.light_add(type='POINT', location=(0.38, -0.28, 0.18))
        luz_macro = bpy.context.active_object
        luz_macro.data.energy = 2.2
        luz_macro.data.color = (1.0, 0.95, 0.88)
    elif tipo == 'hojas':
        apuntar_camara(cam, loc=(-0.45, -0.72, 0.65), target=(0.0, 0.0, 0.52), lens=52.0)
    else:
        # Encuadre general estilizado: perspectiva orbital 3/4 que encuadra el podio, montículo, caña, elotes, espiga, sol y nubes
        apuntar_camara(cam, loc=(0.35, -2.25, 0.72), target=(0.0, 0.0, 0.52), lens=45.0)

def configurar_cycles_metal(samples=96):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'

    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()

        num_metal = 0
        for d in prefs.devices:
            if d.type == 'METAL':
                d.use = True
                num_metal += 1
            else:
                d.use = False

        print(f"[Render Cycles Metal] {num_metal} dispositivo(s) Metal activados para GPU.")

        if hasattr(prefs, 'metalrt'):
            prefs.metalrt = 'ON'
            print("[Render Cycles Metal] Ray tracing por hardware (MetalRT) activado.")

        scn.cycles.device = 'GPU'
    except Exception as e:
        print(f"[Render Cycles Metal] Nota: no se pudo configurar Metal preferences ({e}).")

    scn.cycles.samples = samples
    scn.cycles.use_adaptive_sampling = True
    scn.cycles.adaptive_threshold = 0.02
    scn.cycles.max_bounces = 6

    scn.cycles.use_denoising = True
    if hasattr(scn.cycles, 'denoiser'):
        scn.cycles.denoiser = 'OPENIMAGEDENOISE'
    if hasattr(scn.cycles, 'denoising_use_gpu'):
        scn.cycles.denoising_use_gpu = True

    scn.cycles.use_animated_seed = False

    # Usar 'Standard' para obtener los colores vivos, puros y saturados del estilo cartoon del simulador
    if hasattr(scn.view_settings, 'view_transform'):
        for vt in ('Standard', 'Filmic', 'AgX'):
            try:
                scn.view_settings.view_transform = vt
                break
            except Exception:
                continue
    if hasattr(scn.view_settings, 'look'):
        for lk in ('None', 'Standard'):
            try:
                scn.view_settings.look = lk
                break
            except Exception:
                continue
    scn.view_settings.exposure = -0.25

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(description="Renderizador Time-Lapse Maíz VR")
    ap.add_argument('--glb', default='public/models/planta.glb', help="Ruta al archivo GLB de la planta")
    ap.add_argument('--csv', required=True, help="Ruta al archivo CSV con la trayectoria")
    ap.add_argument('--out', required=True, help="Directorio de salida para los fotogramas")
    ap.add_argument('--fpd', type=int, default=6, help="Fotogramas por día simulado")
    ap.add_argument('--samples', type=int, default=96, help="Muestras por fotograma")
    ap.add_argument('--res', default='1920x1080', help="Resolución ANCHOxALTO")
    ap.add_argument('--frame', type=int, default=None, help="Renderizar un solo fotograma de prueba")
    ap.add_argument('--camera', default='general', choices=['general', 'elote', 'elote_muerte', 'hojas'], help="Encuadre de cámara")
    ap.add_argument('--name', default=None, help="Nombre del archivo de imagen si es un solo fotograma")
    a = ap.parse_args(argv)

    preparar_escena_si_esta_vacia()
    configurar_camara(a.camera)

    scn = bpy.context.scene
    filas = list(csv.DictReader(open(a.csv, encoding='utf-8')))
    fnum = lambda r, k: float(r[k]) if k in r and r[k] != '' else 0.0

    print(f"[Render Timelapse] CSV leído con {len(filas)} filas diarias.")

    planta = next((
        o for o in bpy.data.objects
        if o.type == 'MESH' and o.data.shape_keys and 'Brote' in o.data.shape_keys.key_blocks
    ), None)

    elote = bpy.data.objects.get('Elote')

    if not planta:
        print("[Render Timelapse] ERROR: no se encontró objeto con shape key 'Brote' en la escena.")
        sys.exit(1)

    planta.rotation_mode = 'XYZ'
    if elote:
        elote.rotation_mode = 'XYZ'

    print(f"[Render Timelapse] Objeto planta: {planta.name} | Objeto elote: {elote.name if elote else 'NO PRESENTE'}")

    if hasattr(bpy.context.preferences, 'edit'):
        bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'

    # Geometría del quiebre de tallo en Muerte y Sequía para mantener el Elote anclado al nudo 7
    pivot_acame = Vector((0.010, 0.0075, 0.2688))
    stem_nudo7 = Vector((0.014, 0.006, 0.499))

    usar_kf = (a.frame is None)
    if a.frame is not None:
        idx_unico = max(0, min(len(filas) - 1, (a.frame - 1) // a.fpd))
        filas_iter = [filas[idx_unico]]
    else:
        filas_iter = filas

    for r in filas_iter:
        f = (int(float(r['dia'])) - 1) * a.fpd + 1

        # Escala de la planta
        s = fnum(r, 'escala')
        planta.scale = (s, s, s)
        if usar_kf:
            planta.keyframe_insert('scale', frame=f)

        muerte_val = fnum(r, 'muerte')
        deg_val = fnum(r, 'degradacion')
        sequia_val = fnum(r, 'sequia')
        acame_deg = fnum(r, 'acame_grados')

        # Rotación global de la caña por acame mecánico o degradación post-mortem adicional
        if muerte_val < 0.5 and acame_deg > 0.0:
            # Acame mecánico en planta viva (viento + suelo saturado)
            planta.rotation_euler = (0.0, math.radians(acame_deg), 0.0)
        elif muerte_val >= 0.5:
            # En muerte, el shape key 'Muerte' ya quiebra el tallo superior 55°;
            # conforme avanza 'degradacion', toda la caña cede gradualmente hacia el suelo (hasta +11° extra)
            planta.rotation_euler = (math.radians(4.0 * deg_val), math.radians(11.0 * deg_val), 0.0)
        else:
            planta.rotation_euler = (0.0, 0.0, 0.0)
        if usar_kf:
            planta.keyframe_insert('rotation_euler', frame=f)

        # Shape keys vegetativas y emergencia progresiva de la Espiga (Cogollo)
        kb = planta.data.shape_keys.key_blocks
        for nombre, col in (('Brote', 'brote'), ('Muerte', 'muerte'), ('Sequia', 'sequia'), ('Frio', 'frio')):
            if nombre in kb:
                kb[nombre].value = fnum(r, col)
                if usar_kf:
                    kb[nombre].keyframe_insert('value', frame=f)
        if 'Cogollo' in kb:
            esp_c = calcular_espiga_crec(r)
            brote_v = fnum(r, 'brote')
            kb['Cogollo'].value = (1.0 - esp_c) * (1.0 - brote_v) * (1.0 - muerte_val)
            if usar_kf:
                kb['Cogollo'].keyframe_insert('value', frame=f)

        # Elote / Mazorca
        if elote:
            elote_visible = fnum(r, 'elote_vis') >= 0.5
            elote.hide_render = not elote_visible
            if usar_kf:
                elote.keyframe_insert('hide_render', frame=f)

            # Sincronizar posición y rotación del objeto Elote con la deformación del nudo 7 de la caña
            ang_m = math.radians(55.0 * muerte_val)
            rot_m = Matrix.Rotation(ang_m, 3, 'Y')
            # Posición exacta del nudo 7 cuando la caña se quiebra en pivot_acame o se arquea por sequía
            nudo_rotado = pivot_acame + (rot_m @ (stem_nudo7 - pivot_acame))
            delta_seq = Vector((0.0246 * sequia_val, 0.0115 * sequia_val, -0.0356 * sequia_val)) * (1.0 - muerte_val)
            nudo_actual = nudo_rotado + delta_seq

            # Además del giro del tallo, el elote cuelga hacia abajo desde el nudo 7 al secarse o degradarse
            caida_elote = math.radians(20.0 * deg_val + 8.0 * fnum(r, 'bracteas_seco'))
            eul_elote = (caida_elote * 0.35, ang_m + caida_elote, 0.0)
            elote.rotation_euler = eul_elote
            rot_elote_mat = elote.rotation_euler.to_matrix()
            elote.location = nudo_actual - (rot_elote_mat @ stem_nudo7)
            if usar_kf:
                elote.keyframe_insert('location', frame=f)
                elote.keyframe_insert('rotation_euler', frame=f)

            if elote.data.shape_keys:
                kbe = elote.data.shape_keys.key_blocks
                for nombre, col in (
                    ('Elote_Crec', 'elote_crec'),
                    ('Bracteas_Abre', 'bracteas_abre'),
                    ('Grano_Llenado', 'grano_llenado'),
                    ('Aborto', 'aborto')
                ):
                    if nombre in kbe:
                        kbe[nombre].value = fnum(r, col)
                        if usar_kf:
                            kbe[nombre].keyframe_insert('value', frame=f)

        # Actualizar materiales (con keyframes si es animación, directo si es fotograma único)
        animar_materiales_fotograma(r, f, insert_kf=usar_kf)

    scn.frame_start = 1
    scn.frame_end = (len(filas) - 1) * a.fpd + 1
    print(f"[Render Timelapse] Escena preparada (fotogramas totales en CSV: {scn.frame_end}).")

    configurar_cycles_metal(a.samples)

    w, h = map(int, a.res.lower().split('x'))
    scn.render.resolution_x, scn.render.resolution_y, scn.render.resolution_percentage = w, h, 100
    scn.render.image_settings.file_format = 'PNG'
    scn.render.use_overwrite = False
    scn.render.use_placeholder = True

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    if a.frame is not None:
        scn.render.use_overwrite = True
        scn.render.use_placeholder = False
        bpy.context.view_layer.update()
        nombre_foto = a.name if a.name else f'prueba_{a.frame:04d}.png'
        if not nombre_foto.endswith('.png'):
            nombre_foto += '.png'
        ruta_foto = str(out / nombre_foto)
        scn.render.filepath = ruta_foto
        print(f"[Render Timelapse] Renderizando fotograma {a.frame} ({a.camera}) en: {ruta_foto}...")
        bpy.ops.render.render(write_still=True)
        print(f"[Render Timelapse] Fotograma {nombre_foto} completado con éxito.")
    else:
        def actualizar_mat_frame(scene):
            idx_f = max(0, min(len(filas) - 1, (scene.frame_current - 1) // a.fpd))
            animar_materiales_fotograma(filas[idx_f], scene.frame_current, insert_kf=False)
        bpy.app.handlers.frame_change_pre.append(actualizar_mat_frame)
        scn.render.use_overwrite = False
        scn.render.use_placeholder = True
        scn.render.filepath = str(out / 'f_')
        print(f"[Render Timelapse] Iniciando render de animación en: {scn.render.filepath}...")
        bpy.ops.render.render(animation=True)
        print("[Render Timelapse] Render de animación completado con éxito.")

if __name__ == "__main__":
    main()
