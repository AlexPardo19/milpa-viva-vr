#!/usr/bin/env python3
"""
Generador y Renderizador Científico del Sistema Radicular de Zea mays L. (Raza Chalqueño)
en Vista de Rizotrón / Corte Estratigráfico del Suelo (Blender Cycles + Apple Silicon Metal).

Integra la planta aérea real (`public/models/planta.glb`) sobre la superficie del surco (z >= 0)
con un bloque estratigráfico de suelo agrícola en corte frontal (z <= 0) y la arquitectura
tridimensional completa de las raíces en cada etapa ontogenética y condición de estrés.
"""

import bpy
import bmesh
import math
import sys
import os
import shutil
import argparse
from pathlib import Path
from mathutils import Vector, Matrix


def limpiar_escena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


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


def configurar_cycles_metal(samples=64):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = (d.type in {'METAL', 'GPU'})
    if hasattr(prefs, 'use_metalrt'):
        prefs.use_metalrt = True
    scn.cycles.device = 'GPU'
    scn.cycles.samples = samples
    if hasattr(scn.cycles, 'use_adaptive_sampling'):
        scn.cycles.use_adaptive_sampling = True
        scn.cycles.adaptive_threshold = 0.015
    if hasattr(scn.cycles, 'use_denoising'):
        scn.cycles.use_denoising = True
    if hasattr(scn.cycles, 'denoiser'):
        scn.cycles.denoiser = 'OPENIMAGEDENOISE'
    if hasattr(scn.cycles, 'denoising_use_gpu'):
        scn.cycles.denoising_use_gpu = True

    if hasattr(scn.view_settings, 'view_transform'):
        try:
            scn.view_settings.view_transform = 'Standard'
        except Exception:
            for vt in ('AgX', 'Filmic'):
                try:
                    scn.view_settings.view_transform = vt
                    break
                except Exception:
                    continue
    if hasattr(scn.view_settings, 'look'):
        try:
            scn.view_settings.look = 'None'
        except Exception:
            pass
    if hasattr(scn.view_settings, 'exposure'):
        scn.view_settings.exposure = -0.20
    scn.view_settings.exposure = -0.15


def apuntar_camara(cam, loc, target, lens=50.0):
    cam.location = Vector(loc)
    direction = Vector(target) - cam.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot_quat.to_euler()
    if hasattr(cam.data, 'lens'):
        cam.data.lens = lens


def crear_tubo_curva(bm, puntos, radios, segs_r=10, uv_layer=None, u_range=(0.0, 1.0), v_val=0.0):
    """
    Construye un tubo orgánico de alta suavidad a lo largo de `puntos` con `radios`
    variables y cierra el ápice con una cofia redondeada.
    """
    if len(puntos) < 2:
        return
    rings = []
    n_pts = len(puntos)
    for i, (pt, rad) in enumerate(zip(puntos, radios)):
        if i == 0:
            tang = (puntos[1] - puntos[0]).normalized()
        elif i == n_pts - 1:
            tang = (puntos[-1] - puntos[-2]).normalized()
        else:
            tang = (puntos[i + 1] - puntos[i - 1]).normalized()

        if tang.length < 1e-6:
            tang = Vector((0.0, 0.0, -1.0))

        up_ref = Vector((0.0, 1.0, 0.0)) if abs(tang.y) < 0.85 else Vector((1.0, 0.0, 0.0))
        side = tang.cross(up_ref).normalized()
        norm = side.cross(tang).normalized()

        s = i / max(1, n_pts - 1)
        u_coord = u_range[0] + (u_range[1] - u_range[0]) * s
        ring = []
        for ir in range(segs_r):
            phi = (ir / segs_r) * math.pi * 2.0
            flute = 1.0 + 0.04 * math.sin(phi * 3.0 + s * 10.0)
            pos = pt + (side * math.cos(phi) + norm * math.sin(phi)) * (rad * flute)
            v = bm.verts.new(pos)
            ring.append((v, u_coord, v_val))
        rings.append(ring)

    for i in range(n_pts - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        for ir in range(segs_r):
            ir_n = (ir + 1) % segs_r
            v00, u0, vv0 = r0[ir]
            v01, _, _ = r0[ir_n]
            v11, u1, vv1 = r1[ir_n]
            v10, _, _ = r1[ir]
            try:
                f = bm.faces.new((v00, v01, v11, v10))
                if uv_layer is not None:
                    for loop, uv in zip(f.loops, [(u0, vv0), (u0, vv0), (u1, vv1), (u1, vv1)]):
                        loop[uv_layer].uv = uv
            except ValueError:
                pass

    tang_end = (puntos[-1] - puntos[-2]).normalized()
    tip_pos = puntos[-1] + tang_end * (radios[-1] * 1.5)
    v_tip = bm.verts.new(tip_pos)
    r_last = rings[-1]
    for ir in range(segs_r):
        ir_n = (ir + 1) % segs_r
        try:
            f = bm.faces.new((r_last[ir][0], r_last[ir_n][0], v_tip))
            if uv_layer is not None:
                for loop in f.loops:
                    loop[uv_layer].uv = (u_range[1], v_val)
        except ValueError:
            pass


def crear_texturas_corte_estratigrafico(cfg, res=1024):
    """
    Genera en NumPy un mapa de albedo y normal map de alta definición para el corte estratigráfico:
    - Horizonte A (superficial): franco-húmico oscuro rico en materia orgánica
    - Horizonte B (medio): franco-arcilloso pardo-rojizo con agregados prismáticos
    - Horizonte C (profundo): matriz mineral volcánica / tepetate con gravillas claras
    """
    import numpy as np
    v = np.linspace(0.0, 1.0, res, dtype=np.float32)[:, None]  # 0 = fondo, 1 = superficie
    u = np.linspace(0.0, 1.0, res, dtype=np.float32)[None, :]

    # Ruido multiescala de terrones, poros y estratos
    n1 = np.sin(u * 38.0 * np.pi + np.cos(v * 22.0 * np.pi) * 1.8) * np.cos(v * 34.0 * np.pi)
    n2 = np.sin(u * 124.0 * np.pi + v * 92.0 * np.pi) * 0.5 + np.cos(u * 190.0 * np.pi - v * 150.0 * np.pi) * 0.5
    n3 = np.sin(u * 420.0 * np.pi) * np.cos(v * 390.0 * np.pi)
    pebbles = np.clip(np.sin(u * 78.0 * np.pi + 1.3) * np.cos(v * 64.0 * np.pi - 0.8) - 0.72, 0.0, 1.0) * 3.5

    # Grietas verticales de desecación si es escenario de sequía
    cracks = np.zeros_like(n1)
    if cfg.get("grietas_sequia", False):
        crack_wave = np.abs(np.sin(u * 14.0 * np.pi + 0.35 * np.sin(v * 18.0 * np.pi)))
        cracks = np.exp(-((crack_wave / 0.045) ** 2.0)) * np.clip((v - 0.25) / 0.75, 0.0, 1.0)

    # Gradiente de horizontes edáficos (v=1 arriba Horizonte A oscuro -> v=0 abajo Horizonte C más mineral)
    h_a = np.clip((v - 0.62) / 0.38, 0.0, 1.0)
    h_c = np.clip((0.35 - v) / 0.35, 0.0, 1.0)

    c_top = cfg.get("suelo_col_osc", (0.075, 0.048, 0.030))
    c_mid = cfg.get("suelo_col_cla", (0.145, 0.092, 0.056))
    c_bot = (c_mid[0] * 1.18, c_mid[1] * 1.12, c_mid[2] * 1.08)

    r = c_mid[0] * (1.0 - h_a) + c_top[0] * h_a
    g = c_mid[1] * (1.0 - h_a) + c_top[1] * h_a
    b = c_mid[2] * (1.0 - h_a) + c_top[2] * h_a

    r = r * (1.0 - 0.45 * h_c) + c_bot[0] * 0.45 * h_c
    g = g * (1.0 - 0.45 * h_c) + c_bot[1] * 0.45 * h_c
    b = b * (1.0 - 0.45 * h_c) + c_bot[2] * 0.45 * h_c

    mod = 1.0 + 0.22 * n1 + 0.14 * n2 + 0.06 * n3 + 0.38 * pebbles - 0.72 * cracks
    albedo = np.ones((res, res, 4), dtype=np.float32)
    albedo[..., 0] = np.clip(r * mod, 0.015, 0.95)
    albedo[..., 1] = np.clip(g * mod, 0.012, 0.95)
    albedo[..., 2] = np.clip(b * mod, 0.010, 0.95)

    img_alb = bpy.data.images.new("TexturaCorteSuelo", width=res, height=res, alpha=False)
    img_alb.pixels.foreach_set(albedo.ravel())
    img_alb.pack()

    height = 0.50 * n1 + 0.30 * n2 + 0.15 * n3 + 0.45 * pebbles - 1.20 * cracks
    dhdu, dhdv = np.gradient(height)
    strength = 6.5
    nx = -dhdv * strength
    ny = -dhdu * strength
    nz = np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.ones((res, res, 4), dtype=np.float32)
    normal[..., 0] = nx * inv * 0.5 + 0.5
    normal[..., 1] = ny * inv * 0.5 + 0.5
    normal[..., 2] = nz * inv * 0.5 + 0.5

    img_nrm = bpy.data.images.new("NormalCorteSuelo", width=res, height=res, alpha=False, is_data=True)
    img_nrm.colorspace_settings.name = "Non-Color"
    img_nrm.pixels.foreach_set(normal.ravel())
    img_nrm.pack()

    return img_alb, img_nrm


def crear_material_suelo_estratigrafico(cfg):
    mat = bpy.data.materials.new(name="SueloRizotronPBR")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex_alb = nodes.new("ShaderNodeTexImage")
    tex_nrm = nodes.new("ShaderNodeTexImage")
    nrm_map = nodes.new("ShaderNodeNormalMap")

    img_alb, img_nrm = crear_texturas_corte_estratigrafico(cfg, res=1024)
    tex_alb.image = img_alb
    tex_nrm.image = img_nrm
    nrm_map.inputs["Strength"].default_value = 1.45

    bsdf.inputs["Roughness"].default_value = cfg.get("suelo_roughness", 0.90)
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.15

    links.new(tex_alb.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex_nrm.outputs["Color"], nrm_map.inputs["Color"])
    links.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def crear_material_raiz(cfg):
    """
    Material PBR para el sistema radicular con gradiente longitudinal (base -> zona pilífera -> cofia apical)
    y diferenciación para raíces zanco aéreas (pigmentación antociánica rojiza-púrpura).
    """
    mat = bpy.data.materials.new(name="RaizPBR")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")

    uv_node = nodes.new("ShaderNodeTexCoord")
    sep_xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv_node.outputs["UV"], sep_xyz.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    elems = ramp.color_ramp.elements
    elems[0].position = 0.0
    elems[0].color = cfg["col_raiz_base"]
    elems[1].position = 0.62
    elems[1].color = cfg["col_raiz_media"]
    e_tip = elems.new(0.90)
    e_tip.color = cfg["col_raiz_apice"]
    links.new(sep_xyz.outputs["X"], ramp.inputs["Fac"])

    mix_zanco = nodes.new("ShaderNodeMix")
    mix_zanco.data_type = 'RGBA'
    links.new(sep_xyz.outputs["Y"], mix_zanco.inputs["Factor"])
    links.new(ramp.outputs["Color"], mix_zanco.inputs[6])
    mix_zanco.inputs[7].default_value = cfg.get("col_zanco_aereo", (0.36, 0.10, 0.16, 1.0))

    links.new(mix_zanco.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = cfg.get("roughness_raiz", 0.38)
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.18

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 110.0
    noise.inputs["Detail"].default_value = 6.0
    links.new(uv_node.outputs["Object"], noise.inputs["Vector"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.002
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def construir_bloque_suelo_rizotron(cfg):
    """
    Construye el bloque tridimensional de suelo agrícola en corte estratigráfico con coordenadas UV:
    - Pared frontal de corte en y ≈ +0.018 m con relieve de terrones y estratos (z de -0.48 a 0.0 m).
    - Superficie labrada con camellón central y surcos laterales (z ≈ 0.0 m, y de +0.018 a +0.90 m).
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    nx, ny, nz = 90, 36, 68
    x_min, x_max = -0.68, 0.68
    y_front_base = 0.020
    y_back = 0.95
    z_bot, z_top = -0.48, 0.0

    # 1. Pared frontal del corte estratigráfico
    front_grid = []
    for iz in range(nz + 1):
        fz = iz / nz
        z_base = z_bot + (z_top - z_bot) * fz
        row = []
        for ix in range(nx + 1):
            fx = ix / nx
            x = x_min + (x_max - x_min) * fx

            ridge = 0.022 * math.exp(-((x / 0.18) ** 2))
            furrow = -0.014 * (math.exp(-(((x - 0.34) / 0.12) ** 2)) + math.exp(-(((x + 0.34) / 0.12) ** 2)))
            clods_z = 0.004 * math.sin(x * 38.0) * math.cos(fz * 24.0)
            z = z_base + (ridge + furrow + clods_z) * (fz ** 2.2)

            # Relieve 3D de la pared del corte (terrones, estratos y oquedades que dan sombra natural)
            cliff_relief = (
                0.010 * math.sin(x * 24.0 + z * 18.0)
                + 0.006 * math.cos(x * 58.0 - z * 44.0)
                + 0.003 * math.sin(x * 130.0 + z * 110.0)
            )
            # Retranquear ligeramente el centro (|x| < 0.26) para alojar con holgura la corona radicular
            pocket = 0.014 * math.exp(-((x / 0.22) ** 2)) * math.sin(fz * math.pi)
            y = y_front_base + cliff_relief + pocket

            v = bm.verts.new((x, y, z))
            row.append((v, fx, fz))
        front_grid.append(row)

    for iz in range(nz):
        for ix in range(nx):
            v00, u0, v0 = front_grid[iz][ix]
            v01, u1, _ = front_grid[iz][ix + 1]
            v11, _, v1 = front_grid[iz + 1][ix + 1]
            v10, _, _ = front_grid[iz + 1][ix]
            f = bm.faces.new((v00, v01, v11, v10))
            for loop, uv in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
                loop[uv_layer].uv = uv

    # 2. Superficie superior del campo agrícola (se extiende desde el borde superior del corte hacia +Y)
    surf_grid = [ [item for item in front_grid[-1]] ]
    for iy in range(1, ny + 1):
        fy = iy / ny
        row = []
        for ix in range(nx + 1):
            fx = ix / nx
            x = x_min + (x_max - x_min) * fx
            v_front, _, _ = front_grid[-1][ix]
            y = v_front.co.y + (y_back - v_front.co.y) * (fy ** 1.15)
            ridge = 0.022 * math.exp(-((x / 0.18) ** 2))
            furrow = -0.014 * (math.exp(-(((x - 0.34) / 0.12) ** 2)) + math.exp(-(((x + 0.34) / 0.12) ** 2)))
            clods = 0.005 * math.sin(x * 34.0 + y * 12.0) * math.cos(y * 28.0)
            z = ridge + furrow + clods
            v = bm.verts.new((x, y, z))
            row.append((v, fx, 1.0 - 0.25 * fy))
        surf_grid.append(row)

    for iy in range(ny):
        for ix in range(nx):
            v00, u0, v0 = surf_grid[iy][ix]
            v01, u1, _ = surf_grid[iy][ix + 1]
            v11, _, v1 = surf_grid[iy + 1][ix + 1]
            v10, _, _ = surf_grid[iy + 1][ix]
            f = bm.faces.new((v00, v01, v11, v10))
            for loop, uv in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
                loop[uv_layer].uv = uv

    # 3. Terrones y agregados minerales 3D sobresaliendo de la pared del corte
    for ic in range(65):
        cx = -0.45 + 0.90 * ((ic * 0.381966) % 1.0)
        cz = -0.44 + 0.42 * ((ic * 0.618034) % 1.0)
        cy = y_front_base + 0.006 * math.sin(ic * 1.7)
        rad = 0.004 + 0.006 * ((ic * 0.2718) % 1.0)
        ret = bmesh.ops.create_icosphere(
            bm,
            subdivisions=2,
            radius=rad,
            matrix=Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((1.4, 0.55, 0.85, 1.0))
        )
        u_c = (cx - x_min) / (x_max - x_min)
        v_c = (cz - z_bot) / (z_top - z_bot)
        for v_ico in ret["verts"]:
            for loop in v_ico.link_loops:
                loop[uv_layer].uv = (u_c, v_c)

    mesh = bpy.data.meshes.new("SueloRizotronMesh")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new("SueloRizotron", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(crear_material_suelo_estratigrafico(cfg))

    # Nivel freático semitransparente si hay encharcamiento / hipoxia
    if cfg.get("nivel_freatico_z") is not None:
        z_wat = cfg["nivel_freatico_z"]
        bm_w = bmesh.new()
        # Banda de agua que cubre desde z_wat hasta el fondo del corte en el plano del rizotrón
        v1 = bm_w.verts.new((-0.65, -0.06, z_wat))
        v2 = bm_w.verts.new((0.65, -0.06, z_wat))
        v3 = bm_w.verts.new((0.65, 0.035, z_wat))
        v4 = bm_w.verts.new((-0.65, 0.035, z_wat))
        bm_w.faces.new((v1, v2, v3, v4))
        m_w = bpy.data.meshes.new("AguaFreaticaMesh")
        bm_w.to_mesh(m_w)
        bm_w.free()
        o_w = bpy.data.objects.new("AguaFreatica", m_w)
        bpy.context.collection.objects.link(o_w)

        mat_w = bpy.data.materials.new(name="AguaHipoxicaPBR")
        mat_w.use_nodes = True
        bsdf_w = mat_w.node_tree.nodes.get("Principled BSDF")
        if bsdf_w:
            bsdf_w.inputs["Base Color"].default_value = (0.10, 0.24, 0.20, 1.0)
            bsdf_w.inputs["Roughness"].default_value = 0.06
            if "Transmission Weight" in bsdf_w.inputs:
                bsdf_w.inputs["Transmission Weight"].default_value = 0.70
        o_w.data.materials.append(mat_w)

    return obj


def construir_parte_aerea_y_semilla(cfg):
    """
    Construye:
    1. La cariópside (semilla de maíz Chalqueño sembrada a z = -0.045 m) con su corona y embrión,
       y el mesocótilo/coleóptilo ascendiendo hacia la superficie.
    2. Si la planta ya emergió (VE a R6), importa el modelo real `public/models/planta.glb`
       y ajusta su escala, inclinación (acame), shape keys y coloración foliar para que la parte
       aérea sobre el surco sea 100% coherente con el resto del simulador.
    """
    y_center = -0.012
    tilt_rad = math.radians(cfg.get("acame_grados", 0.0))

    # 1. Semilla de maíz Chalqueño (en z = -0.045 m)
    if cfg.get("mostrar_semilla", False):
        bm_s = bmesh.new()
        esc_s = cfg.get("escala_semilla", 1.0)
        bmesh.ops.create_uvsphere(bm_s, u_segments=28, v_segments=20, radius=0.0085 * esc_s)
        for v in bm_s.verts:
            zn = v.co.z / (0.0085 * esc_s)
            xn = v.co.x / (0.0085 * esc_s)
            # Morfología cuneiforme dentada real de cariópside Chalqueño
            v.co.x *= 0.82 + 0.26 * zn
            v.co.y *= 0.56 * (1.0 - 0.15 * (zn ** 2))
            v.co.z *= 1.32
            if zn > 0.65:
                v.co.z -= 0.0014 * esc_s * math.exp(-((xn / 0.45) ** 2))
            v.co += Vector((0.0, y_center, -0.045))

        m_s = bpy.data.meshes.new("SemillaMesh")
        bm_s.to_mesh(m_s)
        bm_s.free()
        for p in m_s.polygons:
            p.use_smooth = True
        o_s = bpy.data.objects.new("SemillaMaiz", m_s)
        bpy.context.collection.objects.link(o_s)

        mat_s = bpy.data.materials.new(name="SemillaMaizPBR")
        mat_s.use_nodes = True
        bsdf_s = mat_s.node_tree.nodes.get("Principled BSDF")
        if bsdf_s:
            bsdf_s.inputs["Base Color"].default_value = cfg.get("col_semilla", (0.86, 0.62, 0.14, 1.0))
            bsdf_s.inputs["Roughness"].default_value = cfg.get("roughness_semilla", 0.32)
        o_s.data.materials.append(mat_s)

    # 2. Mesocótilo y Coleóptilo subterráneo (conecta la semilla en z=-0.045 con la corona en z=0.0)
    bm_m = bmesh.new()
    uv_m = bm_m.loops.layers.uv.new("UVMap")
    z_top_coleop = cfg.get("z_top_coleoptilo", 0.005)
    pts_c = []
    rads_c = []
    n_c = 28
    for i in range(n_c + 1):
        s = i / n_c
        z = -0.042 + (z_top_coleop - (-0.042)) * s
        wx = 0.0015 * math.sin(s * math.pi)
        pts_c.append(Vector((wx, y_center, z)))
        # Ensanchamiento en el nudo coleoptilar / corona (z ≈ -0.020 m)
        crown_swell = 1.0 + 0.35 * math.exp(-(((z - (-0.018)) / 0.008) ** 2))
        rads_c.append(0.0028 * crown_swell * (1.0 - 0.18 * (s ** 2)))
    crear_tubo_curva(bm_m, pts_c, rads_c, segs_r=14, uv_layer=uv_m, u_range=(0.2, 0.9), v_val=0.0)

    m_m = bpy.data.meshes.new("MesocotiloMesh")
    bm_m.to_mesh(m_m)
    bm_m.free()
    for p in m_m.polygons:
        p.use_smooth = True
    o_m = bpy.data.objects.new("Mesocotilo", m_m)
    bpy.context.collection.objects.link(o_m)

    mat_m = bpy.data.materials.new(name="ColeoptiloPBR")
    mat_m.use_nodes = True
    bsdf_m = mat_m.node_tree.nodes.get("Principled BSDF")
    if bsdf_m:
        bsdf_m.inputs["Base Color"].default_value = cfg.get("col_coleoptilo", (0.76, 0.84, 0.48, 1.0))
        bsdf_m.inputs["Roughness"].default_value = 0.36
    o_m.data.materials.append(mat_m)

    # 3. Si la planta ya emergió (escala_planta > 0), importar `public/models/planta.glb`
    escala_planta = cfg.get("escala_planta", 0.0)
    if escala_planta > 0.01:
        ruta_glb = Path(__file__).resolve().parent.parent / "public" / "models" / "planta.glb"
        if ruta_glb.exists():
            bpy.ops.import_scene.gltf(filepath=str(ruta_glb))
            planta = next((
                o for o in bpy.data.objects
                if o.type == 'MESH' and o.data.shape_keys and 'Brote' in o.data.shape_keys.key_blocks
            ), None)
            elote = bpy.data.objects.get("Elote")
            if elote:
                # En la vista de rizotrón ocultamos el objeto Elote alto o lo escalamos con la planta
                elote.hide_render = True

            if planta:
                planta.location = (0.0, y_center, 0.002)
                planta.scale = (escala_planta, escala_planta, escala_planta)
                planta.rotation_mode = 'XYZ'
                planta.rotation_euler = (0.0, tilt_rad, 0.0)

                kb = planta.data.shape_keys.key_blocks
                for sk_name, cfg_key in (
                    ("Brote", "sk_brote"),
                    ("Cogollo", "sk_cogollo"),
                    ("Sequia", "sk_sequia"),
                    ("Muerte", "sk_muerte"),
                    ("Frio", "sk_frio")
                ):
                    if sk_name in kb:
                        kb[sk_name].value = cfg.get(cfg_key, 0.0)

                # Ajustar tinte del material foliar si hay estrés (antocianina, clorosis o senescencia R6)
                if "tinte_planta" in cfg:
                    mat_p = bpy.data.materials.get("PlantaPBR")
                    if mat_p and mat_p.use_nodes:
                        nt = mat_p.node_tree
                        bsdf_p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                        tex_p = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and 'Normal' not in n.image.name), None)
                        if bsdf_p and tex_p:
                            mix_p = nt.nodes.new("ShaderNodeMix")
                            mix_p.data_type = 'RGBA'
                            mix_p.blend_type = 'MULTIPLY'
                            mix_p.inputs["Factor"].default_value = 1.0
                            mix_p.inputs[7].default_value = cfg["tinte_planta"]
                            nt.links.new(tex_p.outputs["Color"], mix_p.inputs[6])
                            nt.links.new(mix_p.outputs[2], bsdf_p.inputs["Base Color"])


def construir_sistema_radicular(cfg):
    """
    Construye el sistema radicular 3D con curvas de alta resolución:
    - Radícula primaria + cofia + zona pilífera (pelos absorbentes y raicillas laterales)
    - Raíces seminales escutelares (3 a 5 ejes)
    - Verticilos 1 a 5 de raíces nodales (coronarias) subterráneas con ramificación de 1.er y 2.º orden
    - Verticilos 6 y 7 de raíces zanco (brace roots) aéreas con pigmentación antociánica que penetran el suelo
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    y_center = -0.012
    tilt_rad = math.radians(cfg.get("acame_grados", 0.0))
    rot_mat = Matrix.Rotation(tilt_rad, 4, 'Y')
    pivot = Vector((0.0, y_center, 0.0))

    prof_max = cfg.get("prof_max", 0.36)
    apertura_lat = cfg.get("apertura_lat", 0.24)
    angulo_cono = cfg.get("angulo_cono_deg", 46.0)
    densidad_lat = cfg.get("densidad_laterales", 1.0)
    largo_lat_mult = cfg.get("largo_laterales_mult", 1.0)
    grosor_mult = cfg.get("grosor_raiz_mult", 1.0)
    tortuosidad = cfg.get("tortuosidad", 1.0)
    marchitez_sup = cfg.get("marchitez_superficial", 0.0)
    corte_anoxia_z = cfg.get("corte_anoxia_z", -1.0)

    # -------------------------------------------------------------------------
    # A. RADÍCULA PRIMARIA Y RAÍCES SEMINALES ESCUTELARES
    # -------------------------------------------------------------------------
    largo_radicula = cfg.get("largo_radicula", 0.14)
    if largo_radicula > 0.002:
        pts_rad = []
        rads_rad = []
        n_seg_r = 44
        seed_pos = Vector((0.0, y_center, -0.045))
        for i in range(n_seg_r + 1):
            s = i / n_seg_r
            wx = 0.005 * math.sin(s * 3.2 * math.pi) * (s ** 0.8) * tortuosidad
            wy = -0.002 * math.sin(s * 2.5 * math.pi) * s * tortuosidad
            z = max(corte_anoxia_z, -0.045 - largo_radicula * (s ** 0.96))
            pts_rad.append(Vector((seed_pos.x + wx, seed_pos.y + wy, z)))
            r = 0.0022 * grosor_mult * (1.0 - 0.52 * (s ** 1.15))
            rads_rad.append(max(0.00045, r))

        crear_tubo_curva(bm, pts_rad, rads_rad, segs_r=12, uv_layer=uv_layer, u_range=(0.15, 1.0), v_val=0.0)

        # Pelos absorbentes / raicillas laterales suaves de la radícula
        num_lat_rad = int(26 * densidad_lat * min(1.0, largo_radicula / 0.08))
        for il in range(num_lat_rad):
            f_pos = 0.12 + 0.74 * (il / max(1, num_lat_rad - 1))
            idx_p = min(len(pts_rad) - 1, int(f_pos * len(pts_rad)))
            p_orig = pts_rad[idx_p]
            lado = 1.0 if (il % 2 == 0) else -1.0
            dir_lat = Vector((lado * (0.82 + 0.18 * math.cos(il)), -0.20 * math.sin(il * 1.7), -0.32)).normalized()
            l_lat = (0.014 + 0.022 * math.sin(f_pos * math.pi)) * largo_lat_mult
            pts_l = []
            rads_l = []
            n_kl = 14
            for k in range(n_kl + 1):
                sl = k / n_kl
                curv = Vector((0.0015 * math.sin(sl * math.pi * 2.0 + il), 0.0, -0.005 * (sl ** 1.8))) * tortuosidad
                pts_l.append(p_orig + dir_lat * (l_lat * sl) + curv)
                rads_l.append(0.00065 * grosor_mult * (1.0 - 0.68 * sl))
            crear_tubo_curva(bm, pts_l, rads_l, segs_r=6, uv_layer=uv_layer, u_range=(0.50, 1.0), v_val=0.0)

    # Raíces seminales escutelares (brotan en abanico desde el nudo escutelar junto a la semilla)
    num_seminales = cfg.get("num_raices_seminales", 4)
    largo_seminal = cfg.get("largo_seminal", 0.10)
    for isem in range(num_seminales):
        if largo_seminal <= 0.002:
            break
        frac_s = isem / max(1, num_seminales - 1) if num_seminales > 1 else 0.5
        ang_s = (frac_s * 2.0 - 1.0) * math.radians(52.0) + (0.12 if isem % 2 == 0 else -0.12)
        dir_x = math.sin(ang_s)
        pts_sem = []
        rads_sem = []
        n_seg_s = 36
        for i in range(n_seg_s + 1):
            s = i / n_seg_s
            r_horiz = largo_seminal * 0.65 * (s ** 0.82)
            z_drop = largo_seminal * 0.88 * (s ** 1.18)
            wx = 0.0035 * math.sin(s * 3.5 * math.pi + isem * 1.4) * (s ** 0.8) * tortuosidad
            z = max(corte_anoxia_z, -0.042 - z_drop)
            pts_sem.append(Vector((dir_x * r_horiz + wx, y_center - 0.004 * math.sin(s * math.pi), z)))
            rads_sem.append(0.0015 * grosor_mult * (1.0 - 0.55 * s))
        crear_tubo_curva(bm, pts_sem, rads_sem, segs_r=9, uv_layer=uv_layer, u_range=(0.20, 1.0), v_val=0.0)

        # Raicillas de las raíces seminales
        num_lat_s = int(12 * densidad_lat * min(1.0, largo_seminal / 0.07))
        for ils in range(num_lat_s):
            f_p = 0.18 + 0.68 * (ils / max(1, num_lat_s - 1))
            p_o = pts_sem[min(len(pts_sem) - 1, int(f_p * len(pts_sem)))]
            lado_s = 1.0 if (ils % 2 == 0) else -1.0
            dir_ls = Vector((lado_s * 0.78, -0.15, -0.45)).normalized()
            l_ls = 0.014 * largo_lat_mult * (1.0 - 0.4 * f_p)
            pts_ls = [p_o + dir_ls * (l_ls * (k / 8.0)) + Vector((0.0, 0.0, -0.003 * ((k / 8.0) ** 2))) for k in range(9)]
            rads_ls = [0.0005 * grosor_mult * (1.0 - 0.65 * (k / 8.0)) for k in range(9)]
            crear_tubo_curva(bm, pts_ls, rads_ls, segs_r=5, uv_layer=uv_layer, u_range=(0.55, 1.0), v_val=0.0)

    # -------------------------------------------------------------------------
    # B. SISTEMA RADICULAR NODAL / CORONARIO SUBTERRÁNEO (Verticilos 1 a 5)
    # -------------------------------------------------------------------------
    num_verticilos_nodales = cfg.get("num_verticilos_nodales", 0)
    for ivert in range(num_verticilos_nodales):
        f_v = ivert / max(1, num_verticilos_nodales - 1) if num_verticilos_nodales > 1 else 0.0
        z_corona = -0.024 + 0.018 * f_v
        raices_en_vert = 6 + ivert * 2
        grosor_vert = (0.0020 + 0.0009 * f_v) * grosor_mult
        alcance_z = prof_max * (0.64 + 0.36 * f_v)
        alcance_x = apertura_lat * (0.58 + 0.42 * f_v)

        for ir in range(raices_en_vert):
            frac_r = ir / max(1, raices_en_vert - 1)
            ang_abanico = (frac_r * 2.0 - 1.0) * math.radians(angulo_cono + 14.0 * (1.0 - f_v))
            y_offset = -0.024 * math.sin(ir * 1.9 + ivert)

            p_inicio = Vector((0.006 * math.sin(ang_abanico), y_center + y_offset * 0.25, z_corona))
            if tilt_rad != 0.0:
                p_inicio = pivot + (rot_mat @ (p_inicio - pivot))

            pts_n = []
            rads_n = []
            n_pts_n = 42

            desgarro_acame = 0.0
            if tilt_rad > 0.1 and ang_abanico < -0.15:
                desgarro_acame = 0.038 * abs(math.sin(ang_abanico))

            for k in range(n_pts_n + 1):
                s = k / n_pts_n
                spread_s = alcance_x * math.sin(ang_abanico) * (s ** 0.78)
                depth_s = alcance_z * (0.26 * s + 0.74 * (s ** 1.42))

                w_x = 0.006 * math.sin(s * 4.5 * math.pi + ir * 1.7 + ivert) * (s ** 0.85) * tortuosidad
                w_z = 0.003 * math.cos(s * 4.0 * math.pi + ir * 2.3) * s * tortuosidad
                w_y = y_offset * (s ** 0.85)

                x = p_inicio.x + spread_s + w_x
                y = max(-0.09, min(0.012, p_inicio.y + w_y))
                z = max(corte_anoxia_z, p_inicio.z - depth_s + w_z + desgarro_acame * math.sin(s * math.pi))

                pts_n.append(Vector((x, y, z)))
                r_s = grosor_vert * (1.0 - 0.60 * (s ** 1.15))
                rads_n.append(max(0.00045, r_s))

            crear_tubo_curva(bm, pts_n, rads_n, segs_r=9, uv_layer=uv_layer, u_range=(0.0, 1.0), v_val=0.0)

            # Ramificaciones laterales de 1.er orden
            num_lat = int((12 + ivert * 2) * densidad_lat)
            for il in range(num_lat):
                s_parent = 0.12 + 0.76 * (il / max(1, num_lat - 1))
                idx_p = min(len(pts_n) - 1, int(s_parent * len(pts_n)))
                p_orig = pts_n[idx_p]

                factor_sup = 1.0
                if p_orig.z > -0.13 and marchitez_sup > 0.0:
                    factor_sup = max(0.22, 1.0 - 0.75 * marchitez_sup)

                lado_l = 1.0 if (il % 2 == 0) else -1.0
                dir_l = Vector((
                    lado_l * (0.78 + 0.22 * math.cos(il * 1.3)),
                    -0.18 * math.sin(il * 2.1),
                    -0.36 - 0.18 * s_parent
                )).normalized()

                largo_l = (0.020 + 0.026 * (1.0 - s_parent)) * largo_lat_mult * factor_sup
                pts_l = []
                rads_l = []
                n_kl = 12
                for kl in range(n_kl + 1):
                    sl = kl / n_kl
                    p_l = (
                        p_orig
                        + dir_l * (largo_l * sl)
                        + Vector((0.0018 * math.sin(sl * 3.5 * math.pi + il), 0.0, -0.005 * (sl ** 1.8))) * tortuosidad
                    )
                    p_l.y = max(-0.10, min(0.014, p_l.y))
                    pts_l.append(p_l)
                    rads_l.append(max(0.00030, grosor_vert * 0.32 * factor_sup * (1.0 - 0.68 * sl)))

                u_ini = 0.45 if factor_sup > 0.5 else 0.05
                crear_tubo_curva(bm, pts_l, rads_l, segs_r=5, uv_layer=uv_layer, u_range=(u_ini, 1.0), v_val=0.0)

    # -------------------------------------------------------------------------
    # C. RAÍCES ZANCO / ADVENTICIAS AÉREAS (Brace Roots en Nudos Basales Aéreos)
    # -------------------------------------------------------------------------
    num_verticilos_zanco = cfg.get("num_verticilos_zanco", 0)
    prof_zanco_sub = cfg.get("prof_zanco_sub", 0.14)

    for izw in range(num_verticilos_zanco):
        z_nudo_aereo = 0.022 + izw * 0.028
        raices_zanco = 9 + izw * 2
        spread_zanco = 0.052 + izw * 0.022
        grosor_zanco = (0.0036 - izw * 0.0004) * grosor_mult

        for irz in range(raices_zanco):
            ang_z = (irz / raices_zanco) * math.pi * 2.0 + izw * 0.35
            if math.sin(ang_z) > 0.40:
                continue

            dir_xy = Vector((math.cos(ang_z), math.sin(ang_z) * 0.45, 0.0))
            p_start = Vector((dir_xy.x * 0.011, y_center + dir_xy.y * 0.011, z_nudo_aereo))
            if tilt_rad != 0.0:
                p_start = pivot + (rot_mat @ (p_start - pivot))

            p_soil = Vector((
                p_start.x + dir_xy.x * spread_zanco,
                max(-0.08, min(0.012, y_center + dir_xy.y * spread_zanco)),
                0.002
            ))
            p_deep = Vector((
                p_soil.x + dir_xy.x * (prof_zanco_sub * 0.45),
                p_soil.y,
                max(corte_anoxia_z, -prof_zanco_sub)
            ))

            if tilt_rad > 0.1 and p_start.x < -0.005 and izw == 1:
                p_deep = Vector((p_soil.x - 0.018, p_soil.y, 0.010))

            pts_z = []
            rads_z = []
            n_seg_z = 30
            for kz in range(n_seg_z + 1):
                sz = kz / n_seg_z
                if sz <= 0.45:
                    t_a = sz / 0.45
                    p_ctrl = p_start.lerp(p_soil, 0.5) + Vector((dir_xy.x * 0.012, 0.0, 0.010))
                    pt = ((1.0 - t_a) ** 2) * p_start + 2.0 * (1.0 - t_a) * t_a * p_ctrl + (t_a ** 2) * p_soil
                else:
                    t_b = (sz - 0.45) / 0.55
                    w_sub = Vector((0.003 * math.sin(t_b * 3.5 * math.pi + irz), 0.0, 0.0)) * tortuosidad
                    pt = p_soil.lerp(p_deep, t_b) + w_sub
                pts_z.append(pt)
                rads_z.append(grosor_zanco * (1.0 - 0.45 * sz))

            # Tramo aéreo con v_val = 0.90 (color antocianina) y tramo subterráneo con ramificaciones
            crear_tubo_curva(bm, pts_z[:15], rads_z[:15], segs_r=9, uv_layer=uv_layer, u_range=(0.0, 0.45), v_val=0.92)
            crear_tubo_curva(bm, pts_z[14:], rads_z[14:], segs_r=9, uv_layer=uv_layer, u_range=(0.45, 0.95), v_val=0.10)

            if prof_zanco_sub > 0.04 and not (tilt_rad > 0.1 and p_start.x < -0.005 and izw == 1):
                num_lat_z = int(7 * densidad_lat)
                for ilz in range(num_lat_z):
                    idx_zp = int((0.52 + 0.40 * (ilz / max(1, num_lat_z - 1))) * len(pts_z))
                    p_oz = pts_z[min(len(pts_z) - 1, idx_zp)]
                    lado_lz = 1.0 if (ilz % 2 == 0) else -1.0
                    pts_lz = [
                        p_oz + Vector((lado_lz * 0.024 * (k / 8.0), -0.004 * (k / 8.0), -0.020 * ((k / 8.0) ** 1.3)))
                        for k in range(9)
                    ]
                    rads_lz = [0.00095 * grosor_mult * (1.0 - 0.65 * (k / 8.0)) for k in range(9)]
                    crear_tubo_curva(bm, pts_lz, rads_lz, segs_r=5, uv_layer=uv_layer, u_range=(0.50, 1.0), v_val=0.0)

    mesh = bpy.data.meshes.new("SistemaRadicularMesh")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new("SistemaRadicular", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(crear_material_raiz(cfg))
    return obj


def configurar_iluminacion_y_camara_rizotron(cfg):
    scn = bpy.context.scene
    world = scn.world or bpy.data.worlds.new("World")
    scn.world = world
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg.inputs["Color"].default_value = cfg.get("cielo_color", (0.74, 0.90, 0.97, 1.0))
    bg.inputs["Strength"].default_value = 0.85
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # 1. Sol principal de Valles Altos (energía calibrada para no quemar las raíces blancas)
    sun_data = bpy.data.lights.new(name="SolRizotron", type='SUN')
    sun_data.energy = 2.1
    sun_data.angle = math.radians(2.2)
    sun_data.color = (1.0, 0.96, 0.88)
    sun_obj = bpy.data.objects.new(name="SolRizotron", object_data=sun_data)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(46.0), math.radians(18.0), math.radians(-32.0))

    # 2. Luz Científica Frontal Suave del Corte Estratigráfico (calibrada a 1.6 W)
    key_sub_data = bpy.data.lights.new(name="LuzCorteRizotron", type='AREA')
    key_sub_data.energy = 1.6
    key_sub_data.shape = 'RECTANGLE'
    key_sub_data.size = 0.90
    key_sub_data.size_y = 0.70
    key_sub_data.color = (1.0, 0.97, 0.92)
    key_sub_obj = bpy.data.objects.new(name="LuzCorteRizotron", object_data=key_sub_data)
    bpy.context.collection.objects.link(key_sub_obj)
    apuntar_camara(key_sub_obj, (-0.25, -0.88, -0.14), (0.0, 0.0, -0.16))

    # 3. Luz de Contorno Lateral (calibrada a 1.1 W para relieve tridimensional)
    rim_data = bpy.data.lights.new(name="LuzRimRaices", type='AREA')
    rim_data.energy = 1.1
    rim_data.size = 0.55
    rim_data.color = (0.88, 0.94, 1.0)
    rim_obj = bpy.data.objects.new(name="LuzRimRaices", object_data=rim_data)
    bpy.context.collection.objects.link(rim_obj)
    apuntar_camara(rim_obj, (0.55, -0.55, -0.10), (0.0, 0.0, -0.16))

    cam_data = bpy.data.cameras.new(name="CamaraRizotron")
    cam_obj = bpy.data.objects.new(name="CamaraRizotron", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scn.camera = cam_obj

    cam_loc = cfg.get("cam_loc", (0.0, -0.96, -0.08))
    cam_target = cfg.get("cam_target", (0.0, 0.0, -0.14))
    cam_lens = cfg.get("cam_lens", 46.0)
    apuntar_camara(cam_obj, cam_loc, cam_target, lens=cam_lens)


# =============================================================================
# CATÁLOGO DE LOS 12 ESCENARIOS RADICULARES (ONTOGENIA + CONDICIONES DE ESTRÉS)
# =============================================================================

ESCENARIOS_RAICES = [
    # --- PARTE I: CRECIMIENTO ONTOGÉNICO (GERMINACIÓN -> ÚLTIMA ETAPA R6) ---
    {
        "id": "raiz_01_germinacion_SEMILLA_radicula",
        "titulo": "Etapa SEMILLA (Día 4, 35 GDD siembra): Emergencia de Radícula Primaria, Raíces Seminales y Coleóptilo",
        "mostrar_semilla": True,
        "escala_semilla": 1.15,
        "z_top_coleoptilo": -0.006,
        "escala_planta": 0.0,
        "largo_radicula": 0.082,
        "num_raices_seminales": 3,
        "largo_seminal": 0.048,
        "num_verticilos_nodales": 0,
        "num_verticilos_zanco": 0,
        "densidad_laterales": 0.70,
        "largo_laterales_mult": 0.75,
        "grosor_raiz_mult": 1.12,
        "col_raiz_base": (0.78, 0.64, 0.36, 1.0),
        "col_raiz_media": (0.90, 0.84, 0.66, 1.0),
        "col_raiz_apice": (0.98, 0.96, 0.90, 1.0),
        "cam_loc": (0.0, -0.42, -0.02),
        "cam_target": (0.0, 0.0, -0.055),
        "cam_lens": 54.0,
    },
    {
        "id": "raiz_02_emergencia_VE_V2_sistema_seminal",
        "titulo": "Etapa VE–V2 (Día 16, 75 GDD): Dominio del Sistema Seminal e Inicio del 1.er Verticilo Nodal",
        "mostrar_semilla": True,
        "escala_semilla": 0.95,
        "z_top_coleoptilo": 0.012,
        "escala_planta": 0.28,
        "sk_brote": 0.88,
        "sk_cogollo": 1.0,
        "largo_radicula": 0.145,
        "num_raices_seminales": 4,
        "largo_seminal": 0.105,
        "num_verticilos_nodales": 1,
        "prof_max": 0.12,
        "apertura_lat": 0.09,
        "num_verticilos_zanco": 0,
        "densidad_laterales": 0.85,
        "largo_laterales_mult": 0.85,
        "grosor_raiz_mult": 1.0,
        "col_raiz_base": (0.76, 0.60, 0.34, 1.0),
        "col_raiz_media": (0.88, 0.80, 0.60, 1.0),
        "col_raiz_apice": (0.98, 0.95, 0.88, 1.0),
        "cam_loc": (0.0, -0.58, -0.02),
        "cam_target": (0.0, 0.0, -0.055),
        "cam_lens": 50.0,
    },
    {
        "id": "raiz_03_establecimiento_V4_V6_raices_nodales",
        "titulo": "Etapa V4–V6 (Día 48, 355 GDD): Transición al Sistema Radicular Nodal (3 Verticilos Coronarios)",
        "mostrar_semilla": True,
        "escala_semilla": 0.68,
        "col_semilla": (0.48, 0.34, 0.14, 1.0),
        "z_top_coleoptilo": 0.010,
        "escala_planta": 0.46,
        "sk_brote": 0.42,
        "sk_cogollo": 1.0,
        "largo_radicula": 0.20,
        "num_raices_seminales": 4,
        "largo_seminal": 0.14,
        "num_verticilos_nodales": 3,
        "prof_max": 0.25,
        "apertura_lat": 0.17,
        "num_verticilos_zanco": 0,
        "densidad_laterales": 1.0,
        "largo_laterales_mult": 0.95,
        "grosor_raiz_mult": 1.0,
        "col_raiz_base": (0.72, 0.56, 0.32, 1.0),
        "col_raiz_media": (0.86, 0.76, 0.54, 1.0),
        "col_raiz_apice": (0.97, 0.94, 0.86, 1.0),
        "cam_loc": (0.0, -0.78, -0.04),
        "cam_target": (0.0, 0.0, -0.09),
        "cam_lens": 48.0,
    },
    {
        "id": "raiz_04_elongacion_V8_V12_raices_zanco",
        "titulo": "Etapa V8–V12 (Día 88, 720 GDD): Expansión Profunda y Emergencia de Raíces Zanco (Brace Roots)",
        "mostrar_semilla": False,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.72,
        "sk_brote": 0.0,
        "sk_cogollo": 0.85,
        "largo_radicula": 0.25,
        "num_raices_seminales": 4,
        "largo_seminal": 0.17,
        "num_verticilos_nodales": 4,
        "prof_max": 0.34,
        "apertura_lat": 0.23,
        "num_verticilos_zanco": 1,
        "prof_zanco_sub": 0.09,
        "densidad_laterales": 1.15,
        "largo_laterales_mult": 1.05,
        "grosor_raiz_mult": 1.05,
        "col_raiz_base": (0.68, 0.52, 0.28, 1.0),
        "col_raiz_media": (0.84, 0.74, 0.52, 1.0),
        "col_raiz_apice": (0.96, 0.93, 0.84, 1.0),
        "col_zanco_aereo": (0.42, 0.10, 0.18, 1.0),
        "cam_loc": (0.0, -0.94, -0.06),
        "cam_target": (0.0, 0.0, -0.12),
        "cam_lens": 46.0,
    },
    {
        "id": "raiz_05_floracion_VT_R1_plenitud_radicular",
        "titulo": "Etapa VT–R1 (Día 129, 1080 GDD): Plenitud de Arquitectura Radicular (5 Verticilos Nodales + 2 Zanco)",
        "mostrar_semilla": False,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.96,
        "sk_brote": 0.0,
        "sk_cogollo": 0.0,
        "largo_radicula": 0.29,
        "num_raices_seminales": 4,
        "largo_seminal": 0.19,
        "num_verticilos_nodales": 5,
        "prof_max": 0.42,
        "apertura_lat": 0.28,
        "num_verticilos_zanco": 2,
        "prof_zanco_sub": 0.16,
        "densidad_laterales": 1.30,
        "largo_laterales_mult": 1.12,
        "grosor_raiz_mult": 1.10,
        "col_raiz_base": (0.66, 0.48, 0.26, 1.0),
        "col_raiz_media": (0.82, 0.72, 0.48, 1.0),
        "col_raiz_apice": (0.96, 0.93, 0.82, 1.0),
        "col_zanco_aereo": (0.38, 0.09, 0.16, 1.0),
        "cam_loc": (0.0, -1.04, -0.07),
        "cam_target": (0.0, 0.0, -0.14),
        "cam_lens": 45.0,
    },
    {
        "id": "raiz_06_madurez_R3_R6_suberizacion_senescencia",
        "titulo": "Etapa R3–R6 (Día 218, 1880 GDD): Madurez Fisiológica, Suberización Cortical y Senescencia Radicular",
        "mostrar_semilla": False,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.98,
        "sk_brote": 0.0,
        "sk_cogollo": 0.0,
        "sk_sequia": 0.28,
        "tinte_planta": (0.72, 0.58, 0.26, 1.0),
        "largo_radicula": 0.28,
        "num_raices_seminales": 4,
        "largo_seminal": 0.18,
        "num_verticilos_nodales": 5,
        "prof_max": 0.42,
        "apertura_lat": 0.27,
        "num_verticilos_zanco": 2,
        "prof_zanco_sub": 0.16,
        "densidad_laterales": 0.85,
        "largo_laterales_mult": 0.82,
        "grosor_raiz_mult": 1.0,
        "col_raiz_base": (0.44, 0.28, 0.12, 1.0),
        "col_raiz_media": (0.58, 0.40, 0.18, 1.0),
        "col_raiz_apice": (0.68, 0.50, 0.26, 1.0),
        "col_zanco_aereo": (0.46, 0.30, 0.16, 1.0),
        "cam_loc": (0.0, -1.04, -0.07),
        "cam_target": (0.0, 0.0, -0.14),
        "cam_lens": 45.0,
    },

    # --- PARTE II: REACCIÓN DEL SISTEMA RADICULAR ANTE CONDICIONES Y ESTRESES ---
    {
        "id": "raiz_07_reaccion_sequia_hidrotropismo",
        "titulo": "Reacción a Sequía (VWC 11%): Fenotipo 'Steep, Cheap & Deep' (Ángulo Profundo Vertical y Desecación de Laterales Superficiales)",
        "mostrar_semilla": False,
        "grietas_sequia": True,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.78,
        "sk_brote": 0.0,
        "sk_cogollo": 0.3,
        "sk_sequia": 0.82,
        "tinte_planta": (0.68, 0.64, 0.28, 1.0),
        "largo_radicula": 0.36,
        "num_raices_seminales": 4,
        "largo_seminal": 0.25,
        "num_verticilos_nodales": 4,
        "prof_max": 0.45,
        "apertura_lat": 0.13,
        "angulo_cono_deg": 22.0,
        "marchitez_superficial": 0.92,
        "num_verticilos_zanco": 1,
        "prof_zanco_sub": 0.03,
        "densidad_laterales": 0.85,
        "largo_laterales_mult": 0.95,
        "grosor_raiz_mult": 0.82,
        "col_raiz_base": (0.48, 0.32, 0.15, 1.0),
        "col_raiz_media": (0.68, 0.52, 0.30, 1.0),
        "col_raiz_apice": (0.94, 0.88, 0.72, 1.0),
        "suelo_col_osc": (0.14, 0.095, 0.060),
        "suelo_col_cla": (0.24, 0.165, 0.105),
        "suelo_roughness": 0.96,
        "cam_loc": (0.0, -1.04, -0.07),
        "cam_target": (0.0, 0.0, -0.14),
        "cam_lens": 45.0,
    },
    {
        "id": "raiz_08_reaccion_encharcamiento_hipoxia",
        "titulo": "Reacción a Encharcamiento (VWC 55%): Hipoxia Radicular, Necrosis Apical Anóxica y Raíces Superficiales",
        "mostrar_semilla": False,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.76,
        "sk_brote": 0.0,
        "sk_cogollo": 0.4,
        "tinte_planta": (0.64, 0.70, 0.24, 1.0),
        "largo_radicula": 0.15,
        "num_raices_seminales": 4,
        "largo_seminal": 0.12,
        "num_verticilos_nodales": 4,
        "prof_max": 0.19,
        "corte_anoxia_z": -0.20,
        "apertura_lat": 0.30,
        "angulo_cono_deg": 68.0,
        "num_verticilos_zanco": 2,
        "prof_zanco_sub": 0.07,
        "densidad_laterales": 0.65,
        "largo_laterales_mult": 0.70,
        "grosor_raiz_mult": 1.18,
        "nivel_freatico_z": -0.15,
        "col_raiz_base": (0.58, 0.48, 0.28, 1.0),
        "col_raiz_media": (0.36, 0.28, 0.16, 1.0),
        "col_raiz_apice": (0.08, 0.06, 0.04, 1.0),
        "suelo_col_osc": (0.035, 0.024, 0.016),
        "suelo_col_cla": (0.075, 0.052, 0.034),
        "suelo_roughness": 0.28,
        "cam_loc": (0.0, -0.92, -0.05),
        "cam_target": (0.0, 0.0, -0.10),
        "cam_lens": 47.0,
    },
    {
        "id": "raiz_09_reaccion_acidez_aluminio_pH45",
        "titulo": "Reacción a Suelo Ácido (pH 4.5, Toxicidad por Al³⁺): Raíces Cortas, Engrosadas ('Stubby Roots') y Antocianinas",
        "mostrar_semilla": False,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.62,
        "sk_brote": 0.0,
        "sk_cogollo": 0.6,
        "tinte_planta": (0.48, 0.24, 0.44, 1.0),
        "largo_radicula": 0.11,
        "num_raices_seminales": 4,
        "largo_seminal": 0.08,
        "num_verticilos_nodales": 4,
        "prof_max": 0.15,
        "apertura_lat": 0.15,
        "angulo_cono_deg": 52.0,
        "num_verticilos_zanco": 1,
        "prof_zanco_sub": 0.05,
        "densidad_laterales": 0.35,
        "largo_laterales_mult": 0.38,
        "grosor_raiz_mult": 1.55,
        "tortuosidad": 1.65,
        "col_raiz_base": (0.44, 0.18, 0.32, 1.0),
        "col_raiz_media": (0.52, 0.32, 0.26, 1.0),
        "col_raiz_apice": (0.22, 0.11, 0.08, 1.0),
        "col_zanco_aereo": (0.44, 0.08, 0.32, 1.0),
        "cam_loc": (0.0, -0.80, -0.04),
        "cam_target": (0.0, 0.0, -0.08),
        "cam_lens": 48.0,
    },
    {
        "id": "raiz_10_reaccion_frio_pudricion_semilla",
        "titulo": "Reacción a Suelo Frío (T_suelo 5 °C × 21 d): Daño por Enfriamiento, Radícula Abortada y Pudrición de Semilla",
        "mostrar_semilla": True,
        "escala_semilla": 1.25,
        "col_semilla": (0.26, 0.16, 0.08, 1.0),
        "roughness_semilla": 0.68,
        "z_top_coleoptilo": -0.022,
        "col_coleoptilo": (0.32, 0.24, 0.14, 1.0),
        "escala_planta": 0.0,
        "largo_radicula": 0.028,
        "num_raices_seminales": 2,
        "largo_seminal": 0.015,
        "num_verticilos_nodales": 0,
        "num_verticilos_zanco": 0,
        "densidad_laterales": 0.18,
        "largo_laterales_mult": 0.25,
        "grosor_raiz_mult": 1.22,
        "tortuosidad": 1.5,
        "col_raiz_base": (0.34, 0.22, 0.12, 1.0),
        "col_raiz_media": (0.22, 0.14, 0.08, 1.0),
        "col_raiz_apice": (0.10, 0.06, 0.04, 1.0),
        "suelo_col_osc": (0.065, 0.060, 0.068),
        "suelo_col_cla": (0.135, 0.125, 0.138),
        "cam_loc": (0.0, -0.38, -0.02),
        "cam_target": (0.0, 0.0, -0.048),
        "cam_lens": 58.0,
    },
    {
        "id": "raiz_11_reaccion_acame_viento_desgarro",
        "titulo": "Reacción a Acame Radicular (Viento 20 m/s + Suelo Saturado): Inclinación a 55° y Tensión/Desgarro en Barlovento",
        "mostrar_semilla": False,
        "acame_grados": 52.0,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.92,
        "sk_brote": 0.0,
        "sk_cogollo": 0.0,
        "largo_radicula": 0.26,
        "num_raices_seminales": 4,
        "largo_seminal": 0.16,
        "num_verticilos_nodales": 5,
        "prof_max": 0.35,
        "apertura_lat": 0.26,
        "num_verticilos_zanco": 2,
        "prof_zanco_sub": 0.14,
        "densidad_laterales": 1.05,
        "largo_laterales_mult": 1.0,
        "grosor_raiz_mult": 1.08,
        "col_raiz_base": (0.64, 0.48, 0.26, 1.0),
        "col_raiz_media": (0.78, 0.68, 0.46, 1.0),
        "col_raiz_apice": (0.92, 0.86, 0.72, 1.0),
        "suelo_col_osc": (0.048, 0.032, 0.020),
        "suelo_col_cla": (0.105, 0.072, 0.046),
        "suelo_roughness": 0.45,
        "cam_loc": (0.0, -1.02, -0.06),
        "cam_target": (0.02, 0.0, -0.13),
        "cam_lens": 45.0,
    },
    {
        "id": "raiz_12_reaccion_muerte_necrosis_postmortem",
        "titulo": "Degradación Radicular Post-Mortem: Colapso Cortical, Desprendimiento de Raicillas y Necrosis Oscura",
        "mostrar_semilla": False,
        "acame_grados": 22.0,
        "z_top_coleoptilo": 0.008,
        "escala_planta": 0.82,
        "sk_brote": 0.0,
        "sk_cogollo": 0.0,
        "sk_sequia": 1.0,
        "sk_muerte": 1.0,
        "tinte_planta": (0.34, 0.24, 0.14, 1.0),
        "largo_radicula": 0.24,
        "num_raices_seminales": 4,
        "largo_seminal": 0.15,
        "num_verticilos_nodales": 5,
        "prof_max": 0.35,
        "apertura_lat": 0.22,
        "marchitez_superficial": 1.0,
        "num_verticilos_zanco": 2,
        "prof_zanco_sub": 0.13,
        "densidad_laterales": 0.30,
        "largo_laterales_mult": 0.42,
        "grosor_raiz_mult": 0.72,
        "tortuosidad": 1.45,
        "col_raiz_base": (0.24, 0.16, 0.09, 1.0),
        "col_raiz_media": (0.18, 0.12, 0.07, 1.0),
        "col_raiz_apice": (0.09, 0.06, 0.03, 1.0),
        "col_zanco_aereo": (0.22, 0.14, 0.08, 1.0),
        "roughness_raiz": 0.78,
        "cam_loc": (0.0, -1.00, -0.06),
        "cam_target": (0.0, 0.0, -0.13),
        "cam_lens": 45.0,
    },
]


def renderizar_escenario_raiz(cfg, out_dir, artifact_dir, samples=64, res=(1920, 1080)):
    limpiar_escena()
    construir_bloque_suelo_rizotron(cfg)
    construir_parte_aerea_y_semilla(cfg)
    construir_sistema_radicular(cfg)
    configurar_iluminacion_y_camara_rizotron(cfg)
    configurar_cycles_metal(samples=samples)

    scn = bpy.context.scene
    scn.render.resolution_x = res[0]
    scn.render.resolution_y = res[1]
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = 'PNG'
    scn.render.use_overwrite = True

    out_path = Path(out_dir) / f"{cfg['id']}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    scn.render.filepath = str(out_path)

    print(f"\n[Render Raíces] Renderizando: {cfg['id']} — {cfg['titulo']}...")
    bpy.ops.render.render(write_still=True)

    if artifact_dir:
        art_path = Path(artifact_dir) / f"{cfg['id']}.png"
        art_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_path, art_path)
        print(f"[Render Raíces] Copiado a artefactos: {art_path}")


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(description="Renderizador de Sistema Radicular en Rizotrón")
    ap.add_argument('--out', default='render/galeria_raices', help="Directorio de salida")
    ap.add_argument('--artifact-dir', default='/Users/alexisraymundohernandezpardo/.gemini/antigravity/brain/7d16cb6b-9851-4df1-9cb3-133c4567e293/renders', help="Directorio de artefactos")
    ap.add_argument('--samples', type=int, default=64, help="Muestras de Cycles")
    ap.add_argument('--only', default=None, help="Renderizar únicamente el escenario con este ID o índice (1..12)")
    args = ap.parse_args(argv)

    lista = ESCENARIOS_RAICES
    if args.only is not None:
        if args.only.isdigit():
            idx = int(args.only) - 1
            lista = [ESCENARIOS_RAICES[idx]]
        else:
            lista = [e for e in ESCENARIOS_RAICES if e["id"] == args.only or args.only in e["id"]]

    for cfg in lista:
        renderizar_escenario_raiz(cfg, args.out, args.artifact_dir, samples=args.samples)

    print(f"\n[Render Raíces] Completados {len(lista)} renders radiculares exitosamente.")


if __name__ == "__main__":
    main()
