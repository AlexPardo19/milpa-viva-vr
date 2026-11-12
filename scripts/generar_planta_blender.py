import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix


def limpiar_escena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _campo_nervaduras_maiz(resolucion):
    """
    Genera mapas botánicos de alta definición (2048x2048) para hoja, vaina, cuello y raíz de Maíz Chalqueño:
    - Eje vertical (u, 0..1):
        * u in [0.00, 0.05]: Zona basal de raíces zanco / adventicias con pigmentación antociánica/terrosa.
        * u in [0.05, 0.14]: Vaina foliar envolvente (estrías vasculares pronunciadas y tono ligeramente más claro).
        * u in [0.14, 0.17]: Cuello foliar / lígula / aurículas (banda blanquecino-amarillenta característica de Zea mays).
        * u in [0.17, 0.90]: Lámina foliar C4 con nervadura central (midrib) blanca prominente y venación paralela.
        * u in [0.90, 1.00]: Zona apical / glumas de la panoja con matiz ocre-dorado de anteras y espiguillas.
    - Eje horizontal (v, -1..+1):
        * v = 0.0: Nervadura central blanca acanalada (quilla).
        * |v| -> 1.0: Haces vasculares paralelos primarios, secundarios y estomas microscópicos.
    """
    import numpy as np
    u = np.linspace(0.0, 1.0, resolucion, dtype=np.float32)[:, None]
    v = np.linspace(-1.0, 1.0, resolucion, dtype=np.float32)[None, :]
    abs_v = np.abs(v)

    # 1. Nervadura central blanca (presente en la lámina foliar u >= 0.14, afinándose hacia el ápice)
    blade_mask = np.clip((u - 0.12) / 0.05, 0.0, 1.0) * np.clip((0.91 - u) / 0.08, 0.0, 1.0)
    midrib_width = np.maximum(0.012, 0.068 * (1.0 - 0.62 * np.clip((u - 0.14) / 0.78, 0.0, 1.0)))
    midrib = np.exp(-((abs_v / midrib_width) ** 2.2)) * blade_mask

    # 2. Banda del cuello foliar (collar / aurículas) en u ≈ 0.145
    collar_curve = 0.145 + 0.012 * (abs_v ** 1.6)
    collar_band = np.exp(-(((u - collar_curve) / 0.016) ** 2.0)) * np.clip((0.92 - u) * 10.0, 0.0, 1.0)

    # 3. Venación paralela multiescala típica de Poaceae (gramíneas C4)
    veins_primary = (np.abs(np.sin(abs_v * 22.0 * np.pi)) ** 3.5) * 0.45
    veins_secondary = (np.abs(np.sin(abs_v * 86.0 * np.pi)) ** 3.0) * 0.30
    veins_tertiary = (np.abs(np.sin(abs_v * 210.0 * np.pi)) ** 2.0) * 0.15

    # Mayor relieve vascular en la vaina (u < 0.14)
    sheath_boost = 1.0 + 0.65 * np.clip((0.15 - u) / 0.10, 0.0, 1.0)

    # Micro-textura epidérmica y filas estomáticas
    micro_cells = 0.5 + 0.5 * np.cos(abs_v * 320.0 * np.pi) * np.sin(u * 28.0 * np.pi)
    organic_var = 0.03 * np.sin(u * 9.0 * np.pi + abs_v * 4.0 * np.pi)

    # Luminancia base y canales RGB (para ser modulados por el color biológico de la planta)
    base_lum = (
        0.78
        + 0.07 * veins_primary * sheath_boost
        + 0.045 * veins_secondary
        + 0.02 * veins_tertiary
        - 0.025 * micro_cells
        + organic_var
        - 0.05 * (abs_v ** 2.2)
    )
    base_lum = np.clip(base_lum, 0.65, 0.98)

    # Canal RGB diferenciado:
    # - La nervadura central y el cuello tienen mayor reflectancia en R y B (aspecto blanco-crema real)
    r_chan = base_lum + 0.34 * midrib + 0.26 * collar_band
    g_chan = base_lum * 1.03 + 0.24 * midrib + 0.22 * collar_band
    b_chan = base_lum * 0.92 + 0.30 * midrib + 0.18 * collar_band

    # Zona basal (u < 0.055): raíces zanco con pigmentación antociánica rojiza-terrosa
    root_mask = np.clip((0.055 - u) / 0.035, 0.0, 1.0)
    r_chan = r_chan * (1.0 - 0.15 * root_mask) + 0.22 * root_mask
    g_chan = g_chan * (1.0 - 0.52 * root_mask)
    b_chan = b_chan * (1.0 - 0.45 * root_mask)

    # Zona apical (u > 0.91): espiguillas y anteras de la panoja con matiz dorado-ocre
    tassel_mask = np.clip((u - 0.91) / 0.04, 0.0, 1.0)
    r_chan = r_chan * (1.0 - 0.10 * tassel_mask) + 0.36 * tassel_mask
    g_chan = g_chan * (1.0 - 0.12 * tassel_mask) + 0.24 * tassel_mask
    b_chan = b_chan * (1.0 - 0.45 * tassel_mask)

    albedo_rgb = np.stack([
        np.clip(r_chan, 0.05, 1.0),
        np.clip(g_chan, 0.05, 1.0),
        np.clip(b_chan, 0.05, 1.0)
    ], axis=-1)

    # Mapa de alturas para Normal Map en espacio tangente
    height = (
        1.15 * midrib
        + 0.35 * collar_band
        + 0.42 * veins_primary * sheath_boost
        + 0.22 * veins_secondary
        + 0.08 * veins_tertiary
        + 0.04 * micro_cells
    )
    return albedo_rgb, height


def _normal_from_height(height, strength=5.5):
    import numpy as np
    dhdu, dhdv = np.gradient(height)
    nx = -dhdv * strength
    ny = -dhdu * strength
    nz = np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.ones((height.shape[0], height.shape[1], 4), dtype=np.float32)
    normal[..., 0] = nx * inv * 0.5 + 0.5
    normal[..., 1] = ny * inv * 0.5 + 0.5
    normal[..., 2] = nz * inv * 0.5 + 0.5
    return normal


def crear_texturas_maiz(resolucion=2048):
    import numpy as np
    albedo_rgb, height = _campo_nervaduras_maiz(resolucion)

    albedo = np.ones((resolucion, resolucion, 4), dtype=np.float32)
    albedo[..., :3] = albedo_rgb
    img_albedo = bpy.data.images.new("TexturaBotanica", width=resolucion, height=resolucion, alpha=False)
    img_albedo.pixels.foreach_set(albedo.ravel())
    img_albedo.pack()

    normal = _normal_from_height(height, strength=5.5)
    img_normal = bpy.data.images.new("NormalBotanica", width=resolucion, height=resolucion, alpha=False, is_data=True)
    img_normal.colorspace_settings.name = "Non-Color"
    img_normal.pixels.foreach_set(normal.ravel())
    img_normal.pack()

    return img_albedo, img_normal


def crear_texturas_elote(resolucion=1024):
    """
    Genera texturas PBR de alta resolución para:
    1. GranoPBR: corona dorada/crema, surco periférico sombreado y hendidura apical dentada más clara.
    2. TotomoxtlePBR: nervaduras paralelas fibrosas de las brácteas envolventes y mapa de normales.
    """
    import numpy as np
    u = np.linspace(-1.0, 1.0, resolucion, dtype=np.float32)[:, None]
    v = np.linspace(-1.0, 1.0, resolucion, dtype=np.float32)[None, :]

    # --- 1. Textura de Grano individual (mapeado en [-1, 1]^2 por grano) ---
    r_box = np.maximum(np.abs(u), np.abs(v))
    # Sombreado cálido suave en el borde del grano (sin oscurecer en exceso la corona)
    edge_ao = np.clip(1.0 - 0.20 * (r_box ** 3.6), 0.78, 1.0)
    # Hendidura apical central (almidón harinoso más claro en la corona del grano dentado)
    crown_starch = 0.12 * np.exp(-((u / 0.42) ** 2 + (v / 0.32) ** 2))
    # Micro-estrías del pericarpio
    pericarp = 0.015 * np.sin(u * 36.0 * np.pi) * np.cos(v * 36.0 * np.pi)

    g_lum = np.clip(edge_ao + crown_starch + pericarp, 0.76, 1.0)
    grano_albedo = np.ones((resolucion, resolucion, 4), dtype=np.float32)
    grano_albedo[..., 0] = np.clip(g_lum * 1.02, 0.78, 1.0)
    grano_albedo[..., 1] = np.clip(g_lum * 0.98 + 0.04 * crown_starch, 0.72, 1.0)
    grano_albedo[..., 2] = np.clip(g_lum * 0.86 + 0.14 * crown_starch, 0.52, 1.0)

    img_grano = bpy.data.images.new("TexturaGrano", width=resolucion, height=resolucion, alpha=False)
    img_grano.pixels.foreach_set(grano_albedo.ravel())
    img_grano.pack()

    grano_h = (1.0 - (r_box ** 2.6)) - 0.22 * np.exp(-((u / 0.35) ** 2 + (v / 0.24) ** 2)) + pericarp * 0.5
    grano_nrm = _normal_from_height(grano_h, strength=4.0)
    img_grano_nrm = bpy.data.images.new("NormalGrano", width=resolucion, height=resolucion, alpha=False, is_data=True)
    img_grano_nrm.colorspace_settings.name = "Non-Color"
    img_grano_nrm.pixels.foreach_set(grano_nrm.ravel())
    img_grano_nrm.pack()

    # --- 2. Textura de Totomoxtle (brácteas fibrosas estriadas) ---
    u01 = (u + 1.0) * 0.5
    v01 = (v + 1.0) * 0.5
    ribs_main = (np.abs(np.sin(v01 * 28.0 * np.pi)) ** 2.6) * 0.14
    ribs_fine = (np.abs(np.sin(v01 * 110.0 * np.pi)) ** 2.0) * 0.06
    toto_lum = np.clip(0.84 + ribs_main + ribs_fine - 0.06 * ((v ** 2) + 0.3 * (u01 ** 2)), 0.68, 1.0)

    toto_albedo = np.ones((resolucion, resolucion, 4), dtype=np.float32)
    toto_albedo[..., 0] = toto_lum * 0.98
    toto_albedo[..., 1] = toto_lum * 1.02
    toto_albedo[..., 2] = toto_lum * 0.90

    img_toto = bpy.data.images.new("TexturaTotomoxtle", width=resolucion, height=resolucion, alpha=False)
    img_toto.pixels.foreach_set(toto_albedo.ravel())
    img_toto.pack()

    toto_h = (ribs_main * 3.0 + ribs_fine * 1.5) * (0.85 + 0.15 * np.sin(u01 * np.pi))
    toto_nrm = _normal_from_height(toto_h, strength=5.0)
    img_toto_nrm = bpy.data.images.new("NormalTotomoxtle", width=resolucion, height=resolucion, alpha=False, is_data=True)
    img_toto_nrm.colorspace_settings.name = "Non-Color"
    img_toto_nrm.pixels.foreach_set(toto_nrm.ravel())
    img_toto_nrm.pack()

    return img_grano, img_grano_nrm, img_toto, img_toto_nrm


def crear_material_pbr_maiz():
    mat = bpy.data.materials.new(name="PlantaPBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    tex_node = nodes.new(type="ShaderNodeTexImage")
    nrm_tex = nodes.new(type="ShaderNodeTexImage")
    nrm_map = nodes.new(type="ShaderNodeNormalMap")

    img_albedo, img_normal = crear_texturas_maiz(2048)
    tex_node.image = img_albedo
    nrm_tex.image = img_normal

    bsdf.inputs["Base Color"].default_value = (0.14, 0.42, 0.11, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.36
    bsdf.inputs["Metallic"].default_value = 0.0
    nrm_map.inputs["Strength"].default_value = 1.15

    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(nrm_tex.outputs["Color"], nrm_map.inputs["Color"])
    links.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    return mat


def crear_material_pbr_espiga(img_normal=None):
    """
    Material PBR dedicado para la Espiga / Panoja Apical Masculina (EspigaPBR):
    Diferencia cromáticamente las espiguillas estaminadas, glumas y anteras cargadas de polen
    (tonos verde-lima al emerger del cogollo -> dorado/ámbar intenso en antesis VT-R2 -> pajizo en R6)
    respecto al verde clorofílico oscuro de las hojas.
    """
    mat = bpy.data.materials.new(name="EspigaPBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.84, 0.66, 0.18, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.46
    bsdf.inputs["Metallic"].default_value = 0.0

    if img_normal is not None:
        nrm_tex = nodes.new(type="ShaderNodeTexImage")
        nrm_tex.image = img_normal
        nrm_map = nodes.new(type="ShaderNodeNormalMap")
        nrm_map.inputs["Strength"].default_value = 1.10
        links.new(nrm_tex.outputs["Color"], nrm_map.inputs["Color"])
        links.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])

    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def pos_centro_tallo(t, stem_height=0.96):
    z = t * stem_height
    x = math.sin(t * math.pi * 0.9) * 0.014
    y = math.sin(t * math.pi * 1.4) * 0.008
    return Vector((x, y, z))


def radio_tallo_en(t, num_nudos=9):
    nudo_fase = t * num_nudos * math.pi
    # Atenuar el engrosamiento nodular en el pedúnculo superior (t > 0.82)
    nudo_atten = max(0.0, 1.0 - max(0.0, (t - 0.80) / 0.20))
    nudo_bump = 1.0 + 0.085 * nudo_atten * (max(0.0, math.cos(nudo_fase)) ** 10)
    # Afinamiento continuo hasta el raquis de la panoja en t = 1.0 (sin escalón abrupto)
    taper = (1.0 - 0.54 * (t ** 0.90)) - 0.28 * (max(0.0, (t - 0.78) / 0.22) ** 1.6)
    return (0.025 * max(0.16, taper)) * nudo_bump


def evaluar_arco_lamina(s, leaf_length, elev_start_deg, drop_total_deg, dir_xy, side_xy, twist_deg=12.0):
    """
    Integra un arco catenario/parabólico realista para la lámina foliar del maíz:
    - En s = 0 (cuello/aurícula), la hoja emerge con ángulo elev_start_deg (ej. 58°).
    - A medida que avanza s -> 1, la gravedad curva progresivamente la lámina hacia abajo
      (pasando por la horizontal en s ≈ 0.48 y cayendo en cascada hasta -50°..-65° en la punta).
    - Preserva la longitud de arco biológica de la hoja en todos los estados fenológicos.
    """
    steps = 16
    ds = s / max(1, steps)
    pt = Vector((0.0, 0.0, 0.0))
    elev_start = math.radians(elev_start_deg)
    drop_total = math.radians(drop_total_deg)

    for k in range(steps):
        sk = (k + 0.5) * ds
        theta = elev_start - drop_total * (sk ** 1.38)
        tang = dir_xy * math.cos(theta) + Vector((0.0, 0.0, 1.0)) * math.sin(theta)
        pt += tang * (ds * leaf_length)

    theta_end = elev_start - drop_total * (s ** 1.38)
    forward_local = (dir_xy * math.cos(theta_end) + Vector((0.0, 0.0, 1.0)) * math.sin(theta_end)).normalized()
    normal_no_twist = (-dir_xy * math.sin(theta_end) + Vector((0.0, 0.0, 1.0)) * math.cos(theta_end)).normalized()

    # Leve torsión longitudinal natural en la mitad distal de la hoja
    twist_rad = math.radians(twist_deg) * (s ** 1.4)
    side_local = (side_xy * math.cos(twist_rad) + normal_no_twist * math.sin(twist_rad)).normalized()
    normal_local = (normal_no_twist * math.cos(twist_rad) - side_xy * math.sin(twist_rad)).normalized()

    return pt, forward_local, side_local, normal_local


def construir_maiz_chalqueno():
    """
    Construye el modelo botánico hiper-detallado de Zea mays L. (raza Chalqueño):
    1. Raíces zanco / adventicias aéreas en 2 verticilos basales anclándose al suelo.
    2. Caña de alta densidad con 9 nudos engrosados, estrías vasculares y canal axilar en nudo 7.
    3. 15 hojas con:
       - Vaina foliar cilíndrica envolvente que abraza el entrenudo.
       - Cuello foliar / aurícula blanquecina en la articulación nudo-lámina.
       - Lámina lanceolada con arco parabólico gravitacional realista, nervadura central acanalada
         (quilla en envés) y ondas marginales orgánicas.
    4. Panoja (espiga masculina terminal) con raquis central grueso y 16 ramas laterales arqueadas
       cubiertas de espiguillas estaminadas pareadas en 3D.
    5. Shape Keys: 'Basis', 'Brote', 'Muerte', 'Sequia', 'Frio'.
    """
    mesh = bpy.data.meshes.new("PlantaMesh")
    obj = bpy.data.objects.new("Planta", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    vert_meta = []

    stem_height = 0.96
    num_nudos = 9

    # =========================================================================
    # 1. CAÑA DE MAÍZ CON NUDOS, ESTRÍAS VASCULARES Y CANAL AXILAR
    # =========================================================================
    stem_segs_z = 160
    stem_segs_r = 44
    stem_rings = []

    for iz in range(stem_segs_z + 1):
        t = iz / stem_segs_z
        center = pos_centro_tallo(t, stem_height)
        base_rad = radio_tallo_en(t, num_nudos)

        ring = []
        for ir in range(stem_segs_r):
            ang = (ir / stem_segs_r) * math.pi * 2.0
            nx = math.cos(ang)
            ny = math.sin(ang)

            # Micro-estrías vasculares longitudinales de la caña
            flute = 1.0 + 0.012 * math.cos(ang * 22.0)
            # Canal axilar cóncavo sobre el nudo 7 (donde se aloja el elote hacia +X, -Y)
            groove = 0.0
            if 0.51 <= t <= 0.64:
                ear_dir_dot = nx * 0.76 - ny * 0.65
                if ear_dir_dot > 0.35:
                    t_g = math.sin(((t - 0.51) / 0.13) * math.pi)
                    groove = -0.0028 * t_g * ((ear_dir_dot - 0.35) / 0.65)

            radius = base_rad * flute + groove
            pos = center + Vector((nx * radius, ny * radius, 0.0))
            v = bm.verts.new(pos)
            # Mapear la caña a la zona de vaina/tallo (u_uv en [0.06, 0.13])
            ring.append((v, ir / stem_segs_r, 0.06 + 0.07 * t))
            vert_meta.append({
                "type": "stem",
                "t": t,
                "base_pos": pos.copy(),
                "stem_center": center.copy()
            })
        stem_rings.append(ring)

    for iz in range(stem_segs_z):
        r0 = stem_rings[iz]
        r1 = stem_rings[iz + 1]
        for ir in range(stem_segs_r):
            ir_next = (ir + 1) % stem_segs_r
            v00, _, vt0 = r0[ir]
            v01, _, _   = r0[ir_next]
            v11, _, vt1 = r1[ir_next]
            v10, _, _   = r1[ir]
            face = bm.faces.new((v00, v01, v11, v10))
            uvs = [(0.35, vt0), (0.65, vt0), (0.65, vt1), (0.35, vt1)]
            for loop, uv in zip(face.loops, uvs):
                loop[uv_layer].uv = uv

    top_verts = [item[0] for item in stem_rings[-1]]
    top_face = bm.faces.new(top_verts)
    for loop in top_face.loops:
        loop[uv_layer].uv = (0.5, 0.13)

    # =========================================================================
    # 2. RAÍCES ZANCO / ADVENTICIAS AÉREAS (2 Verticilos Basales de Anclaje)
    # =========================================================================
    whorls = [
        {"t_node": 0.032, "num_roots": 13, "rad_spread": 0.056, "r_thick": 0.0042},
        {"t_node": 0.064, "num_roots": 11, "rad_spread": 0.072, "r_thick": 0.0038},
    ]
    root_segs_u = 10
    root_segs_r = 8

    for w_idx, w_info in enumerate(whorls):
        t_node = w_info["t_node"]
        c_node = pos_centro_tallo(t_node, stem_height)
        r_stem_node = radio_tallo_en(t_node, num_nudos)
        num_roots = w_info["num_roots"]

        for ir_root in range(num_roots):
            ang_r = (ir_root / num_roots) * math.pi * 2.0 + w_idx * 0.28 + 0.08 * math.sin(ir_root * 2.3)
            dir_r = Vector((math.cos(ang_r), math.sin(ang_r), 0.0))
            side_r = Vector((-math.sin(ang_r), math.cos(ang_r), 0.0))

            p_start = c_node + dir_r * (r_stem_node * 0.92)
            spread = w_info["rad_spread"] * (0.88 + 0.22 * math.cos(ir_root * 1.7))
            p_end = Vector((c_node.x + dir_r.x * spread, c_node.y + dir_r.y * spread, -0.008))
            p_ctrl = p_start.lerp(p_end, 0.45) + dir_r * 0.016 + Vector((0.0, 0.0, 0.014))

            root_rings = []
            for iu in range(root_segs_u + 1):
                s = iu / root_segs_u
                # Curva Bézier cuadrática del arco de la raíz zanco hacia el suelo
                spine = ((1.0 - s) ** 2) * p_start + 2.0 * (1.0 - s) * s * p_ctrl + (s ** 2) * p_end
                tang = (2.0 * (1.0 - s) * (p_ctrl - p_start) + 2.0 * s * (p_end - p_ctrl)).normalized()
                norm_r = side_r.cross(tang).normalized()
                rad_local = w_info["r_thick"] * (1.0 - 0.35 * s) * (1.0 + 0.15 * (1.0 - s))

                ring = []
                for iv in range(root_segs_r):
                    phi = (iv / root_segs_r) * math.pi * 2.0
                    pos = spine + (side_r * math.cos(phi) + norm_r * math.sin(phi)) * rad_local
                    v = bm.verts.new(pos)
                    ring.append(v)
                    vert_meta.append({
                        "type": "root",
                        "t": t_node * (1.0 - s),
                        "s_root": s,
                        "base_pos": pos.copy(),
                        "stem_center": c_node.copy()
                    })
                root_rings.append(ring)

            for iu in range(root_segs_u):
                r0 = root_rings[iu]
                r1 = root_rings[iu + 1]
                v_uv0 = 0.045 * (1.0 - iu / root_segs_u)
                v_uv1 = 0.045 * (1.0 - (iu + 1) / root_segs_u)
                for iv in range(root_segs_r):
                    iv_next = (iv + 1) % root_segs_r
                    face = bm.faces.new((r0[iv], r0[iv_next], r1[iv_next], r1[iv]))
                    for loop, uv in zip(face.loops, [(0.4, v_uv0), (0.6, v_uv0), (0.6, v_uv1), (0.4, v_uv1)]):
                        loop[uv_layer].uv = uv

    # =========================================================================
    # 3. PANOJA / ESPIGA APICAL ESTAMINADA (Raquis Central + 22 Ramas con Espiguillas y Anteras 3D)
    # =========================================================================
    tassel_base = pos_centro_tallo(0.955, stem_height)
    # Rama 0 es la espiga central gruesa y alta (28.5 cm); ramas 1..22 son ramas laterales en espiral
    num_tassel_branches = 23

    for i_tb in range(num_tassel_branches):
        is_central = (i_tb == 0)
        if is_central:
            branch_origin = tassel_base
            tb_len = 0.285
            tb_angle = 0.0
            tb_elev = math.radians(88.8)
            segs_u = 36
            segs_r = 10
        else:
            f_tb = (i_tb - 1) / (num_tassel_branches - 1)
            branch_origin = tassel_base + Vector((0.0, 0.0, 0.008 + 0.112 * f_tb))
            # Filotaxis espiral áurea para las ramas de la panoja
            tb_angle = i_tb * 2.39996 + 0.25
            tb_len = 0.205 * (1.0 - 0.34 * f_tb)
            tb_elev = math.radians(42.0 + 30.0 * f_tb)
            segs_u = 22
            segs_r = 8

        dir_horiz = Vector((math.cos(tb_angle), math.sin(tb_angle), 0.0))
        tb_dir = (dir_horiz * math.cos(tb_elev) + Vector((0.0, 0.0, 1.0)) * math.sin(tb_elev)).normalized()

        tb_rings = []
        for iu in range(segs_u + 1):
            s = iu / segs_u
            # Arqueo gravitacional de las ramas laterales cargadas de espiguillas y polen
            droop_z = -0.012 * (s ** 2) if is_central else -0.078 * (s ** 1.75)
            flare_xy = dir_horiz * (0.0 if is_central else 0.036 * (s ** 1.20))
            spine = branch_origin + tb_dir * (s * tb_len) + flare_xy + Vector((0.0, 0.0, droop_z))

            # Relieve nodular pronunciado de espiguillas pareadas (glumas y anteras colgantes)
            spikelet_pulse = 0.42 + 0.58 * (math.sin(s * segs_u * math.pi) ** 2)
            base_r = (0.0112 if is_central else 0.0072) * (1.0 - 0.46 * (s ** 1.25)) * math.sin(max(0.12, s * 0.96) * math.pi)
            rad_s = max(0.0014, base_r * (0.72 + 0.82 * spikelet_pulse))

            ring = []
            for ir in range(segs_r):
                phi = (ir / segs_r) * math.pi * 2.0
                # Asimetría bilobulada de los pares de espiguillas + anteras colgantes hacia -Z
                lobe = 1.0 + 0.34 * math.cos(phi * 2.0 + s * 20.0)
                anther_drop = -0.0032 * spikelet_pulse * max(0.0, -math.sin(phi)) * math.sin(s * math.pi)
                offset = Vector((math.cos(phi) * rad_s * lobe, math.sin(phi) * rad_s * lobe, anther_drop))
                pos = spine + offset
                v = bm.verts.new(pos)
                ring.append(v)
                vert_meta.append({
                    "type": "tassel",
                    "s": s,
                    "is_central": is_central,
                    "rad_s": rad_s,
                    "phi": phi,
                    "base_pos": pos.copy(),
                    "branch_origin": branch_origin.copy()
                })
            tb_rings.append(ring)

        for iu in range(segs_u):
            r0 = tb_rings[iu]
            r1 = tb_rings[iu + 1]
            u_uv0 = 0.92 + 0.075 * (iu / segs_u)
            u_uv1 = 0.92 + 0.075 * ((iu + 1) / segs_u)
            for ir in range(segs_r):
                ir_next = (ir + 1) % segs_r
                face = bm.faces.new((r0[ir], r0[ir_next], r1[ir_next], r1[ir]))
                for loop, uv in zip(face.loops, [(0.45, u_uv0), (0.55, u_uv0), (0.55, u_uv1), (0.45, u_uv1)]):
                    loop[uv_layer].uv = uv

    # =========================================================================
    # 4. HOJAS DE MAÍZ CHALQUEÑO CON VAINA ENVOLVENTE, CUELLO Y ARCO PARABÓLICO
    # 15 hojas en filotaxis dística alterna con ventana limpia para los 3 elotes en nudos 5-7
    # =========================================================================
    num_leaves = 15
    leaf_segs_u = 68  # 10 segmentos de vaina envolvente + 58 segmentos de lámina arqueada
    leaf_segs_v = 32  # Alta resolución transversal para nervadura central y ondas marginales
    sheath_u_end = 0.14

    for i_leaf in range(num_leaves):
        f_leaf = i_leaf / (num_leaves - 1.0)

        # Nudo de origen de la vaina foliar a lo largo de la caña
        t_node = 0.07 + 0.79 * (f_leaf ** 0.96)
        sheath_dt = 0.062 * (1.0 - 0.25 * f_leaf)
        t_collar = min(0.95, t_node + sheath_dt)
        collar_center = pos_centro_tallo(t_collar, stem_height)
        r_collar = radio_tallo_en(t_collar, num_nudos)

        # Filotaxis dística alterna con distribución azimutal 3D orgánica
        # Despejamos los cuadrantes frontales (+X,-Y y -X,-Y) en los nudos 4-8 para lucir los 3 elotes
        base_az = 0.0 if (i_leaf % 2 == 0) else math.pi
        if i_leaf in (4, 6, 8):
            spiral_offset = math.radians(26.0)   # Hojas derechas rotadas ligeramente hacia +Y (atrás)
        elif i_leaf in (5, 7):
            spiral_offset = math.radians(-26.0)  # Hojas izquierdas rotadas ligeramente hacia +Y (atrás)
        else:
            spiral_offset = math.radians(22.0 * math.sin(i_leaf * 1.65))
        azimuth = base_az + spiral_offset

        dir_xy = Vector((math.cos(azimuth), math.sin(azimuth), 0.0)).normalized()
        side_xy = Vector((-math.sin(azimuth), math.cos(azimuth), 0.0)).normalized()

        # Alometría foliar de raza Chalqueño (hojas de la zona media de la mazorca más largas y anchas)
        canopy_bell = math.sin(max(0.08, min(0.96, (f_leaf ** 0.80))) * math.pi)
        leaf_length = 0.32 + 0.38 * canopy_bell
        leaf_width_max = 0.040 + 0.048 * canopy_bell

        # Ángulo inicial en el cuello y caída gravitacional parabólica natural hacia la punta
        elev_start_deg = 56.0 + 18.0 * (f_leaf ** 0.85)
        drop_total_deg = 128.0 * (1.0 - 0.38 * (f_leaf ** 1.15))
        twist_deg = (14.0 if (i_leaf % 2 == 0) else -14.0) * (0.6 + 0.4 * canopy_bell)

        # Origen del cuello foliar ceñido a la superficie de la caña
        blade_origin = collar_center + dir_xy * (r_collar + 0.0006)

        grid_top = []
        grid_bot = []

        for iu in range(leaf_segs_u + 1):
            u = iu / leaf_segs_u

            if u <= sheath_u_end:
                # --- A. VAINA FOLIAR ENVOLVENTE (abraza cilíndricamente el entrenudo) ---
                s_sh = u / sheath_u_end
                s_blade = 0.0
                t_cur = t_node + s_sh * (t_collar - t_node)
                c_cur = pos_centro_tallo(t_cur, stem_height)
                r_cur = radio_tallo_en(t_cur, num_nudos) + 0.0016 + 0.0003 * (i_leaf % 2)
                spine_pt = c_cur + dir_xy * r_cur
                forward_axis = Vector((0.0, 0.0, 1.0))
                side_local = side_xy
                normal_axis = dir_xy
                half_width = r_cur * 1.65
                thickness = 0.0022 * (1.0 - 0.15 * s_sh)
            else:
                # --- B. LÁMINA FOLIAR ARQUEADA (emerge del cuello con caída parabólica) ---
                s_sh = 1.0
                s_blade = (u - sheath_u_end) / (1.0 - sheath_u_end)
                arc_pt, forward_axis, side_local, normal_axis = evaluar_arco_lamina(
                    s_blade, leaf_length, elev_start_deg, drop_total_deg, dir_xy, side_xy, twist_deg
                )
                spine_pt = blade_origin + arc_pt

                # Perfil lanceolado ancho en el tercio medio y punta acuminada fina en s_blade = 1.0
                blade_profile = (math.sin(max(0.02, s_blade * 0.94) * math.pi) ** 0.58) * ((1.0 - s_blade) ** 0.32)
                collar_neck = 0.36 + 0.64 * min(1.0, s_blade / 0.12)
                half_width = max(0.0018, leaf_width_max * blade_profile * collar_neck)
                thickness = 0.0028 * (1.0 - 0.72 * s_blade)

            row_top = []
            row_bot = []

            for iv in range(leaf_segs_v + 1):
                v_norm = (iv / leaf_segs_v) * 2.0 - 1.0
                abs_v = abs(v_norm)

                if u <= sheath_u_end:
                    # Envoltura cilíndrica ceñida alrededor de la caña (sin escalones visibles)
                    s_sh = u / sheath_u_end
                    wrap_span = math.pi * (0.58 - 0.34 * (s_sh ** 1.35))
                    ang_v = azimuth + v_norm * wrap_span
                    rad_dir = Vector((math.cos(ang_v), math.sin(ang_v), 0.0))
                    t_cur = t_node + s_sh * (t_collar - t_node)
                    c_cur = pos_centro_tallo(t_cur, stem_height)
                    r_cur = radio_tallo_en(t_cur, num_nudos) + 0.0007 * (1.0 - 0.4 * (abs_v ** 2))

                    cyl_pt = c_cur + rad_dir * r_cur
                    collar_flat_pt = blade_origin + side_xy * (v_norm * leaf_width_max * 0.36)
                    blend_collar = s_sh ** 2.4
                    base_surf = cyl_pt.lerp(collar_flat_pt, blend_collar * 0.85)
                    n_surf = rad_dir.lerp(normal_axis, blend_collar * 0.7).normalized()

                    local_thick = thickness * (0.55 - 0.35 * (abs_v ** 1.5))
                    pos_top = base_surf + n_surf * (local_thick * 0.5)
                    pos_bot = base_surf - n_surf * (local_thick * 0.5)
                else:
                    # Sección transversal de la lámina foliar:
                    # 1. Canal central en V de la nervadura (haz cóncavo, quilla saliente en el envés)
                    v_channel = (abs_v ** 1.35) * (0.015 * leaf_length * (1.0 - 0.55 * s_blade))
                    # 2. Caída transversal suave de los bordes (camber natural de hoja viva)
                    edge_droop = -(abs_v ** 2.2) * (0.008 * leaf_length * (0.3 + 0.7 * s_blade))
                    # 3. Ondas marginales multiescala características del maíz (ruffled margins)
                    wave_env = (abs_v ** 2.1) * math.sin(min(1.0, s_blade * 1.15) * math.pi)
                    margin_wave = (
                        math.sin(s_blade * math.pi * 8.5 + i_leaf * 0.7) * 0.0078 * leaf_length
                        + math.cos(s_blade * math.pi * 15.0 - i_leaf * 1.1) * 0.0032 * leaf_length
                    ) * wave_env
                    # 4. Quilla de la nervadura central prominente en el envés
                    midrib_ridge = math.exp(-((abs_v / 0.11) ** 2)) * thickness * 2.1 * (1.0 - 0.55 * s_blade)

                    margin_factor = math.sqrt(max(0.0, 1.0 - v_norm * v_norm))
                    local_thick = thickness * (0.24 + 0.76 * margin_factor)

                    lateral = side_local * (v_norm * half_width)
                    camber = normal_axis * (v_channel + edge_droop + margin_wave)

                    pos_top = spine_pt + lateral + camber + normal_axis * (local_thick * 0.5 + midrib_ridge * 0.25)
                    pos_bot = spine_pt + lateral + camber - normal_axis * (local_thick * 0.5 + midrib_ridge)

                vt = bm.verts.new(pos_top)
                vb = bm.verts.new(pos_bot)

                # Mapeo UV: u en [0.06, 0.90] para que el cuello quede en u_uv ≈ 0.145
                u_uv = 0.06 + 0.84 * u
                row_top.append((vt, u_uv, v_norm))
                row_bot.append((vb, u_uv, v_norm))

                common_meta = {
                    "type": "leaf",
                    "i_leaf": i_leaf,
                    "f_leaf": f_leaf,
                    "t_stem": t_collar if u > sheath_u_end else (t_node + (u / sheath_u_end) * (t_collar - t_node)),
                    "stem_origin": blade_origin.copy(),
                    "u": u,
                    "s_blade": s_blade,
                    "v": v_norm,
                    "leaf_length": leaf_length,
                    "half_width": half_width,
                    "dir_xy": dir_xy.copy(),
                    "side_xy": side_local.copy(),
                    "normal_axis": normal_axis.copy(),
                    "forward_axis": forward_axis.copy(),
                    "spine_pt": spine_pt.copy(),
                }
                m_top = dict(common_meta)
                m_top["base_pos"] = pos_top.copy()
                vert_meta.append(m_top)

                m_bot = dict(common_meta)
                m_bot["base_pos"] = pos_bot.copy()
                vert_meta.append(m_bot)

            grid_top.append(row_top)
            grid_bot.append(row_bot)

        for iu in range(leaf_segs_u):
            for iv in range(leaf_segs_v):
                v00, u00, vn00 = grid_top[iu][iv]
                v01, u01, vn01 = grid_top[iu][iv + 1]
                v11, u11, vn11 = grid_top[iu + 1][iv + 1]
                v10, u10, vn10 = grid_top[iu + 1][iv]
                f_top = bm.faces.new((v00, v10, v11, v01))
                for loop, (lu, lvn) in zip(f_top.loops, [(u00, vn00), (u10, vn10), (u11, vn11), (u01, vn01)]):
                    loop[uv_layer].uv = ((lvn + 1.0) * 0.5, lu)

                b00, _, _ = grid_bot[iu][iv]
                b01, _, _ = grid_bot[iu][iv + 1]
                b11, _, _ = grid_bot[iu + 1][iv + 1]
                b10, _, _ = grid_bot[iu + 1][iv]
                f_bot = bm.faces.new((b00, b01, b11, b10))
                for loop, (lu, lvn) in zip(f_bot.loops, [(u00, vn00), (u01, vn01), (u11, vn11), (u10, vn10)]):
                    loop[uv_layer].uv = ((lvn + 1.0) * 0.5, lu)

        for iu in range(leaf_segs_u):
            t0 = grid_top[iu][0][0]
            t1 = grid_top[iu + 1][0][0]
            b1 = grid_bot[iu + 1][0][0]
            b0 = grid_bot[iu][0][0]
            bm.faces.new((t0, b0, b1, t1))

            tr0 = grid_top[iu][leaf_segs_v][0]
            tr1 = grid_top[iu + 1][leaf_segs_v][0]
            br1 = grid_bot[iu + 1][leaf_segs_v][0]
            br0 = grid_bot[iu][leaf_segs_v][0]
            bm.faces.new((tr0, tr1, br1, br0))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    mat = crear_material_pbr_maiz()
    img_nrm_planta = bpy.data.images.get("NormalBotanica")
    mat_espiga = crear_material_pbr_espiga(img_nrm_planta)
    mesh.materials.append(mat)
    mesh.materials.append(mat_espiga)

    for poly in mesh.polygons:
        poly.use_smooth = True
        v0 = vert_meta[poly.vertices[0]]
        if v0["type"] == "tassel":
            poly.material_index = 1
        else:
            poly.material_index = 0

    # =========================================================================
    # 5. SHAPE KEYS FISIOLÓGICOS DEL MAÍZ CHALQUEÑO (INCLUYENDO EMERGENCIA DE ESPIGA)
    # =========================================================================
    sk_basis = obj.shape_key_add(name="Basis", from_mix=False)
    sk_brote = obj.shape_key_add(name="Brote", from_mix=False)
    sk_cogollo = obj.shape_key_add(name="Cogollo", from_mix=False)
    sk_muerte = obj.shape_key_add(name="Muerte", from_mix=False)
    sk_sequia = obj.shape_key_add(name="Sequia", from_mix=False)
    sk_frio = obj.shape_key_add(name="Frio", from_mix=False)
    sk_brote.value = 0.0
    sk_cogollo.value = 0.0
    sk_muerte.value = 0.0
    sk_sequia.value = 0.0
    sk_frio.value = 0.0

    rot_acame = Matrix.Rotation(math.radians(55.0), 3, 'Y')
    t_break = 0.28
    pivot_acame = pos_centro_tallo(t_break, stem_height)

    def delta_cana_sequia(t):
        bend = (t ** 1.7)
        return Vector((0.075 * bend, 0.035 * bend, -0.095 * (t ** 1.5)))

    for idx, meta in enumerate(vert_meta):
        base_pos = meta["base_pos"]
        mtype = meta["type"]
        sk_cogollo.data[idx].co = base_pos

        if mtype == "stem":
            t = meta["t"]
            center = meta["stem_center"]
            radial = base_pos - center

            brote_center = Vector((center.x * 0.35, center.y * 0.35, center.z * 0.35))
            sk_brote.data[idx].co = brote_center + radial * 0.48

            if t <= t_break:
                sk_muerte.data[idx].co = base_pos + Vector((0.01 * (t / t_break), 0.0, -0.02 * (t / t_break)))
            else:
                delta_piv = base_pos - pivot_acame
                sk_muerte.data[idx].co = pivot_acame + rot_acame @ delta_piv

            d_stem = delta_cana_sequia(t)
            sk_sequia.data[idx].co = center + radial * 0.85 + d_stem

            sk_frio.data[idx].co = Vector((base_pos.x * 0.96, base_pos.y * 0.96, base_pos.z * 0.94))

        elif mtype == "root":
            center = meta["stem_center"]
            # En plántula temprana (Brote = 1), las raíces adventicias zanco aún están retraídas en el tallo basal
            sk_brote.data[idx].co = Vector((center.x * 0.35, center.y * 0.35, center.z * 0.35))
            sk_muerte.data[idx].co = base_pos + Vector((0.0, 0.0, -0.004))
            sk_sequia.data[idx].co = center + (base_pos - center) * 0.92
            sk_frio.data[idx].co = base_pos

        elif mtype == "tassel":
            s_t = meta["s"]
            phi_t = meta["phi"]
            r_in = 0.0018 * (1.0 - 0.5 * s_t)
            # En plántula (Brote = 1): espiga envuelta dentro del cogollo juvenil
            sk_brote.data[idx].co = Vector((math.cos(phi_t) * r_in, math.sin(phi_t) * r_in, stem_height * 0.25 + 0.02 * s_t))
            # En etapa vegetativa pre-espigamiento (Cogollo = 1 -> 0): la espiga está plegada en el cogollo superior
            # y emerge hacia arriba abriendo sus ramas conforme la planta crece hacia VT
            sk_cogollo.data[idx].co = tassel_base + Vector((math.cos(phi_t) * r_in, math.sin(phi_t) * r_in, -0.085 + 0.055 * s_t))

            delta_piv = base_pos - pivot_acame
            sk_muerte.data[idx].co = pivot_acame + rot_acame @ delta_piv + Vector((0.0, 0.0, -0.04))

            d_top = delta_cana_sequia(1.0)
            sk_sequia.data[idx].co = base_pos + d_top + Vector((0.0, 0.0, -0.02 * s_t))
            sk_frio.data[idx].co = base_pos + Vector((0.0, 0.0, -0.05))

        elif mtype == "leaf":
            t_stem = meta["t_stem"]
            stem_origin = meta["stem_origin"]
            i_leaf = meta["i_leaf"]
            u = meta["u"]
            s_blade = meta["s_blade"]
            v = meta["v"]
            abs_v = abs(v)
            leaf_length = meta["leaf_length"]
            dir_xy = meta["dir_xy"]
            side_xy = meta["side_xy"]
            normal_axis = meta["normal_axis"]
            spine_pt = meta["spine_pt"]

            # 1. BROTE (Plántula juvenil V2-V6 con cogollo en embudo y hojas arqueadas proporcionales)
            brote_origin = Vector((stem_origin.x * 0.35, stem_origin.y * 0.35, stem_origin.z * 0.35))
            f_emerg = max(0.06, 1.0 - (i_leaf / 9.0)) if i_leaf < 9 else 0.04
            brote_len = leaf_length * (0.42 * f_emerg)
            brote_w = meta["half_width"] * (0.48 * math.sqrt(f_emerg))
            brote_elev = math.radians(52.0 + 18.0 * (i_leaf / 14.0))
            brote_fwd = (dir_xy * math.cos(brote_elev) + Vector((0.0, 0.0, 1.0)) * math.sin(brote_elev)).normalized()
            brote_norm = (-dir_xy * math.sin(brote_elev) + Vector((0.0, 0.0, 1.0)) * math.cos(brote_elev)).normalized()
            brote_arch = (math.sin(s_blade * math.pi * 0.80) * 0.06 * brote_len) - ((s_blade ** 1.9) * 0.24 * brote_len)
            brote_spine = brote_origin + brote_fwd * (s_blade * brote_len) + brote_norm * brote_arch
            sk_brote.data[idx].co = brote_spine + side_xy * (v * brote_w)

            # 2. MUERTE (Quiebre de caña a 55°, colapso foliar gravitacional y acartuchamiento necrótico)
            if t_stem <= t_break:
                stem_pos_muerte = stem_origin
            else:
                stem_pos_muerte = pivot_acame + rot_acame @ (stem_origin - pivot_acame)

            rel_to_stem = spine_pt - stem_origin
            if t_stem > t_break:
                rel_to_stem = rot_acame @ rel_to_stem

            roll_in_muerte = -side_xy * (v * (abs_v ** 1.4) * 0.85 * meta["half_width"])
            droop_muerte_z = -(s_blade ** 1.25) * (0.42 * leaf_length)
            muerte_pt = stem_pos_muerte + rel_to_stem + roll_in_muerte + Vector((0.0, 0.0, droop_muerte_z))
            muerte_pt.z = max(0.015, muerte_pt.z)
            sk_muerte.data[idx].co = muerte_pt

            # 3. SEQUÍA (Acartuchamiento cilíndrico por células buliformes + caída distal pronunciada)
            d_attach = delta_cana_sequia(t_stem)
            rel_to_attach = base_pos - stem_origin
            droop_angle = math.radians(38.0 * (s_blade ** 0.85))
            rot_mat = Matrix.Rotation(droop_angle, 3, side_xy)
            rotated_rel = rot_mat @ rel_to_attach

            roll_in = -side_xy * (v * (abs_v ** 1.25) * 0.72 * meta["half_width"])
            roll_up = normal_axis * ((abs_v ** 1.5) * 0.046 * leaf_length * (0.2 + 0.8 * s_blade))
            extra_droop_z = -(s_blade ** 1.75) * (0.20 * leaf_length)

            sk_sequia.data[idx].co = (
                stem_origin
                + d_attach
                + rotated_rel
                + roll_in
                + roll_up
                + Vector((0.0, 0.0, extra_droop_z))
            )

            # 4. FRÍO / HELADA (Pérdida de turgencia y caída flácida)
            stem_frio_origin = Vector((stem_origin.x * 0.96, stem_origin.y * 0.96, stem_origin.z * 0.94))
            lateral_offset = base_pos - spine_pt
            flaccid_z = -(s_blade ** 1.55) * (0.18 * leaf_length)
            fold_cold = -side_xy * (v * (abs_v ** 1.1) * 0.38 * meta["half_width"])

            sk_frio.data[idx].co = (
                stem_frio_origin
                + (spine_pt - stem_origin)
                + lateral_offset
                + fold_cold
                + Vector((0.0, 0.0, flaccid_z))
            )

    num_tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"[Maíz Chalqueño VR] Vértices: {len(mesh.vertices)} | Triángulos: {num_tris}")
    print(f"[Maíz Chalqueño VR] Shape Keys: {[kb.name for kb in mesh.shape_keys.key_blocks]}")
    return obj


def crear_material_pbr_elote():
    img_grano, img_grano_nrm, img_toto, img_toto_nrm = crear_texturas_elote(1024)

    # 1. TotomoxtlePBR (Brácteas con venación fibrosa paralela)
    mat_totomoxtle = bpy.data.materials.new(name="TotomoxtlePBR")
    mat_totomoxtle.use_nodes = True
    nodes_t = mat_totomoxtle.node_tree.nodes
    links_t = mat_totomoxtle.node_tree.links
    bsdf_t = nodes_t.get("Principled BSDF")
    if bsdf_t:
        bsdf_t.inputs["Base Color"].default_value = (0.26, 0.50, 0.20, 1.0)
        bsdf_t.inputs["Roughness"].default_value = 0.44
        tex_t = nodes_t.new(type="ShaderNodeTexImage")
        tex_t.image = img_toto
        nrm_t = nodes_t.new(type="ShaderNodeTexImage")
        nrm_t.image = img_toto_nrm
        nmap_t = nodes_t.new(type="ShaderNodeNormalMap")
        nmap_t.inputs["Strength"].default_value = 0.95
        links_t.new(tex_t.outputs["Color"], bsdf_t.inputs["Base Color"])
        links_t.new(nrm_t.outputs["Color"], nmap_t.inputs["Color"])
        links_t.new(nmap_t.outputs["Normal"], bsdf_t.inputs["Normal"])

    # 2. GranoPBR (Granos 3D individuales con textura de corona, germen y normal map)
    mat_grano = bpy.data.materials.new(name="GranoPBR")
    mat_grano.use_nodes = True
    nodes_g = mat_grano.node_tree.nodes
    links_g = mat_grano.node_tree.links
    bsdf_g = nodes_g.get("Principled BSDF")
    if bsdf_g:
        bsdf_g.inputs["Base Color"].default_value = (0.92, 0.84, 0.52, 1.0)
        bsdf_g.inputs["Roughness"].default_value = 0.24
        tex_g = nodes_g.new(type="ShaderNodeTexImage")
        tex_g.image = img_grano
        nrm_g = nodes_g.new(type="ShaderNodeTexImage")
        nrm_g.image = img_grano_nrm
        nmap_g = nodes_g.new(type="ShaderNodeNormalMap")
        nmap_g.inputs["Strength"].default_value = 0.75
        links_g.new(tex_g.outputs["Color"], bsdf_g.inputs["Base Color"])
        links_g.new(nrm_g.outputs["Color"], nmap_g.inputs["Color"])
        links_g.new(nmap_g.outputs["Normal"], bsdf_g.inputs["Normal"])

    # 3. EstigmaPBR (Cabellos de elote sedosos)
    mat_estigma = bpy.data.materials.new(name="EstigmaPBR")
    mat_estigma.use_nodes = True
    bsdf_s = mat_estigma.node_tree.nodes.get("Principled BSDF")
    if bsdf_s:
        bsdf_s.inputs["Base Color"].default_value = (0.76, 0.70, 0.40, 1.0)
        bsdf_s.inputs["Roughness"].default_value = 0.52

    return mat_totomoxtle, mat_grano, mat_estigma


def construir_elote_chalqueno(planta_obj=None):
    """
    Construye el sistema prolífico de 3 elotes / mazorcas de Zea mays L. raza Chalqueño:
    - Elote 1 (Principal - Nudo 7, t=0.52, derecha-frontal +X,-Y, escala 100%, 16x26 granos 3D)
    - Elote 2 (Secundario - Nudo 6, t=0.42, izquierda-frontal -X,-Y, escala 86%, 14x22 granos 3D)
    - Elote 3 (Terciario - Nudo 5, t=0.33, derecha-frontal +X,-Y, escala 74%, 12x18 granos 3D)
    Cada elote cuenta con olote interno, granos 3D esculpidos individualmente, brácteas de totomoxtle
    con nervaduras, hojas bandera apicales y penacho denso de estigmas ('espiga de cabellitos') que
    se alarga conforme el elote crece ('Elote_Crec').
    """
    mesh = bpy.data.meshes.new("EloteMesh")
    obj = bpy.data.objects.new("Elote", mesh)
    bpy.context.scene.collection.objects.link(obj)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    vert_meta = []

    def cob_envelope(s):
        return math.sqrt(math.sin(max(0.006, min(0.998, s ** 0.62)) * math.pi)) * (1.0 - 0.18 * s)

    ears_cfg = [
        {
            "t_stem": 0.52,
            "dir_horiz": Vector((0.760, -0.650, 0.0)).normalized(),
            "elev_deg": 57.0,
            "scale_ear": 1.00,
            "num_rows": 16,
            "num_rings": 26,
            "num_husks": 14,
            "num_silks": 112,
        },
        {
            "t_stem": 0.41,
            "dir_horiz": Vector((-0.740, -0.670, 0.0)).normalized(),
            "elev_deg": 54.0,
            "scale_ear": 0.86,
            "num_rows": 14,
            "num_rings": 20,
            "num_husks": 12,
            "num_silks": 88,
        },
        {
            "t_stem": 0.31,
            "dir_horiz": Vector((0.800, -0.600, 0.0)).normalized(),
            "elev_deg": 51.0,
            "scale_ear": 0.72,
            "num_rows": 12,
            "num_rings": 16,
            "num_husks": 10,
            "num_silks": 68,
        },
    ]

    for ear_idx, ecfg in enumerate(ears_cfg):
        sc = ecfg["scale_ear"]
        t_stem = ecfg["t_stem"]
        stem_center = pos_centro_tallo(t_stem, 0.96)
        dir_horiz = ecfg["dir_horiz"]
        elev_rad = math.radians(ecfg["elev_deg"])
        ear_axis = (dir_horiz * math.cos(elev_rad) + Vector((0.0, 0.0, 1.0)) * math.sin(elev_rad)).normalized()
        ear_side = ear_axis.cross(Vector((0.0, 0.0, 1.0))).normalized()
        ear_up = ear_side.cross(ear_axis).normalized()
        front_dir = -ear_up

        shank_len = 0.044 * sc
        ear_base = stem_center + dir_horiz * (shank_len * 0.78) + Vector((0.0, 0.0, shank_len * 0.42))

        common_ear = {
            "stem_center": stem_center.copy(),
            "ear_base": ear_base.copy(),
            "ear_axis": ear_axis.copy(),
            "ear_side": ear_side.copy(),
            "ear_up": ear_up.copy(),
            "front_dir": front_dir.copy(),
            "sc": sc,
        }

        # 1. PEDÚNCULO BASAL
        shank_segs_z = 6
        shank_segs_r = 10
        shank_rings = []
        for iz in range(shank_segs_z + 1):
            tz = iz / shank_segs_z
            p_c = stem_center.lerp(ear_base, tz)
            rad_s = 0.0095 * sc * (1.0 - 0.10 * tz)
            ring = []
            for ir in range(shank_segs_r):
                ang = (ir / shank_segs_r) * math.pi * 2.0
                pos = p_c + (ear_side * math.cos(ang) + ear_up * math.sin(ang)) * rad_s
                v = bm.verts.new(pos)
                ring.append(v)
                m = dict(common_ear)
                m.update({"type": "shank", "base_pos": pos.copy(), "tz": tz})
                vert_meta.append(m)
            shank_rings.append(ring)

        for iz in range(shank_segs_z):
            r0 = shank_rings[iz]
            r1 = shank_rings[iz + 1]
            for ir in range(shank_segs_r):
                ir_next = (ir + 1) % shank_segs_r
                face = bm.faces.new((r0[ir], r0[ir_next], r1[ir_next], r1[ir]))
                for loop in face.loops:
                    loop[uv_layer].uv = (ir / shank_segs_r, iz / shank_segs_z)

        # 2A. NÚCLEO DEL OLOTE
        cob_len = 0.178 * sc
        core_segs_z = 22
        core_segs_r = 20
        core_rings = []

        for iz in range(core_segs_z + 1):
            s = iz / core_segs_z
            env = cob_envelope(s)
            rad_core = 0.0182 * sc * env
            center_s = ear_base + ear_axis * (s * cob_len)
            ring = []
            for ir in range(core_segs_r):
                ang = (ir / core_segs_r) * math.pi * 2.0
                pos = center_s + (ear_side * math.cos(ang) + ear_up * math.sin(ang)) * rad_core
                v = bm.verts.new(pos)
                ring.append(v)
                m = dict(common_ear)
                m.update({
                    "type": "cob_core",
                    "base_pos": pos.copy(),
                    "center_s": center_s.copy(),
                    "s": s,
                    "ang": ang,
                    "rad_core": rad_core,
                })
                vert_meta.append(m)
            core_rings.append(ring)

        for iz in range(core_segs_z):
            r0 = core_rings[iz]
            r1 = core_rings[iz + 1]
            for ir in range(core_segs_r):
                ir_next = (ir + 1) % core_segs_r
                face = bm.faces.new((r0[ir], r0[ir_next], r1[ir_next], r1[ir]))
                for loop in face.loops:
                    loop[uv_layer].uv = (0.05, 0.05)

        # 2B. GRANOS 3D ESCULPIDOS INDIVIDUALMENTE
        num_rows = ecfg["num_rows"]
        num_rings = ecfg["num_rings"]
        k_sub = 4

        for i_ring in range(num_rings):
            s_ring = 0.075 + 0.865 * ((i_ring + 0.5) / num_rings)
            env = cob_envelope(s_ring)
            rad_socket = 0.0182 * sc * env
            ds_half = (0.46 / num_rings) * cob_len
            dphi_half = (math.pi / num_rows) * 1.04

            for i_row in range(num_rows):
                pair_offset = 0.008 * ((i_row % 2) * 2 - 1)
                jitter_phi = 0.004 * math.sin(i_ring * 3.7 + i_row * 2.1 + ear_idx)
                jitter_s = 0.0005 * math.cos(i_ring * 2.9 - i_row * 1.7)
                phi_center = (i_row / num_rows) * math.pi * 2.0 + pair_offset + jitter_phi
                s_center = max(0.02, min(0.98, s_ring + jitter_s))
                center_k = ear_base + ear_axis * (s_center * cob_len)

                k_grid = []
                for iu in range(k_sub + 1):
                    uk = (iu / k_sub) * 2.0 - 1.0
                    row_verts = []
                    for iv in range(k_sub + 1):
                        vk = (iv / k_sub) * 2.0 - 1.0
                        dome_u = max(0.0, 1.0 - (uk ** 4)) ** 0.62
                        dome_v = max(0.0, 1.0 - (vk ** 4)) ** 0.62
                        dome = dome_u * dome_v
                        dent_dimple = math.exp(-((uk / 0.42) ** 2 + (vk / 0.32) ** 2)) * dome

                        phi_v = phi_center + vk * dphi_half
                        radial_dir = (ear_side * math.cos(phi_v) + ear_up * math.sin(phi_v)).normalized()
                        axial_offset = ear_axis * (uk * ds_half * (0.85 + 0.20 * dome))

                        r_ovule = rad_socket + 0.0016 * sc * env * dome
                        pos = center_k + axial_offset + radial_dir * r_ovule

                        v = bm.verts.new(pos)
                        row_verts.append((v, (vk + 1.0) * 0.5, (uk + 1.0) * 0.5))
                        m = dict(common_ear)
                        m.update({
                            "type": "kernel",
                            "base_pos": pos.copy(),
                            "center_s": (center_k + axial_offset).copy(),
                            "radial_dir": radial_dir.copy(),
                            "s": s_center,
                            "ang": phi_v,
                            "env": env,
                            "rad_socket": rad_socket,
                            "dome": dome,
                            "dent_dimple": dent_dimple,
                        })
                        vert_meta.append(m)
                    k_grid.append(row_verts)

                for iu in range(k_sub):
                    for iv in range(k_sub):
                        v00, u00, w00 = k_grid[iu][iv]
                        v01, u01, w01 = k_grid[iu][iv + 1]
                        v11, u11, w11 = k_grid[iu + 1][iv + 1]
                        v10, u10, w10 = k_grid[iu + 1][iv]
                        face = bm.faces.new((v00, v01, v11, v10))
                        for loop, uv in zip(face.loops, [(u00, w00), (u01, w01), (u11, w11), (u10, w10)]):
                            loop[uv_layer].uv = uv

        # 3. TOTOMOXTLE / BRÁCTEAS ENVOLVENTES + BANDERILLAS APICALES
        num_husks = ecfg["num_husks"]
        husk_segs_u = 26
        husk_segs_v = 10
        husk_len = 0.202 * sc

        for i_husk in range(num_husks):
            frac = (i_husk + 0.5) / num_husks
            ang_husk = -math.pi * 0.5 + frac * math.pi * 2.0
            center_radial = (ear_side * math.cos(ang_husk) + ear_up * math.sin(ang_husk)).normalized()
            facing_cam = center_radial.dot(front_dir)
            is_outer = (facing_cam > -0.08)
            side_dot = center_radial.dot(ear_side)
            side_sign = 1.0 if side_dot >= 0.0 else -1.0
            layer_idx = i_husk % 3
            # Hojas bandera laterales en las brácteas externas de los costados
            has_flag = (layer_idx == 2 and abs(side_dot) > 0.55)
            husk_grid = []

            for iu in range(husk_segs_u + 1):
                u = iu / husk_segs_u
                ang_half_span = 1.22 * (math.sin((u ** 0.65) * math.pi) ** 0.62) * ((1.0 - u) ** 0.60)
                base_blend = min(1.0, (u / 0.065) ** 0.65)
                tip_taper = 1.0 - 0.52 * (u ** 1.8)
                rad_cob_u = (0.0265 * sc * (1.0 - 0.14 * u) * tip_taper) + (0.0016 + 0.0007 * layer_idx) * sc
                rad_wrap = 0.0105 * sc * (1.0 - base_blend) + rad_cob_u * base_blend
                center_u = ear_base + ear_axis * (u * husk_len)
                # Si tiene hoja bandera, el tercio distal se arquea grácilmente hacia afuera
                flag_flare = Vector((0.0, 0.0, 0.0))
                if has_flag and u > 0.62:
                    uf = (u - 0.62) / 0.38
                    flag_flare = (center_radial * (0.028 * sc * (uf ** 1.5)) + Vector((0.0, 0.0, -0.022 * sc * (uf ** 1.8))))
                row = []

                for iv in range(husk_segs_v + 1):
                    v = (iv / husk_segs_v) * 2.0 - 1.0
                    phi = ang_husk + v * ang_half_span
                    radial_dir = (ear_side * math.cos(phi) + ear_up * math.sin(phi)).normalized()

                    vein_rib = 0.00045 * sc * math.cos(v * math.pi * 8.0) * math.sin(u * math.pi)
                    edge_wave = 0.0005 * sc * (abs(v) ** 2.0) * math.sin(u * math.pi * 5.0 + i_husk) * (1.0 - u)
                    pos = center_u + radial_dir * (rad_wrap + vein_rib + edge_wave) + flag_flare

                    vert = bm.verts.new(pos)
                    row.append(vert)
                    m = dict(common_ear)
                    m.update({
                        "type": "husk",
                        "base_pos": pos.copy(),
                        "center_u": center_u.copy(),
                        "radial_dir": radial_dir.copy(),
                        "facing_cam": facing_cam,
                        "side_sign": side_sign,
                        "u": u,
                        "v": v,
                        "is_outer": is_outer,
                    })
                    vert_meta.append(m)
                husk_grid.append(row)

            for iu in range(husk_segs_u):
                r0 = husk_grid[iu]
                r1 = husk_grid[iu + 1]
                for iv in range(husk_segs_v):
                    face = bm.faces.new((r0[iv], r0[iv + 1], r1[iv + 1], r1[iv]))
                    for loop, uv in zip(
                        face.loops,
                        [
                            (iv / husk_segs_v, iu / husk_segs_u),
                            ((iv + 1) / husk_segs_v, iu / husk_segs_u),
                            ((iv + 1) / husk_segs_v, (iu + 1) / husk_segs_u),
                            (iv / husk_segs_v, (iu + 1) / husk_segs_u),
                        ]
                    ):
                        loop[uv_layer].uv = uv

        # 4. ESTIGMAS / ESPIGA DE CABELLITOS DEL ELOTE (Emergen abundantemente de la punta al crecer)
        num_silks = ecfg["num_silks"]
        silk_segs = 14
        silk_origin_base = ear_base + ear_axis * (husk_len * 0.94)

        for i_silk in range(num_silks):
            ang_s = (i_silk / num_silks) * math.pi * 2.0 + (i_silk * 0.43)
            rad_s = 0.0058 * sc * ((i_silk % 11) / 11.0)
            radial_s_dir = (ear_side * math.cos(ang_s) + ear_up * math.sin(ang_s)).normalized()
            p_start = silk_origin_base + radial_s_dir * rad_s
            silk_len = 0.115 * sc * (0.78 + 0.36 * math.sin(i_silk * 1.93))

            prev_v_l = None
            prev_v_r = None
            for it in range(silk_segs + 1):
                t_s = it / silk_segs
                disp_axis = ear_axis * (0.010 * sc + t_s * silk_len * 0.78 * (1.0 - 0.30 * t_s))
                side_bias = ear_side * (0.75 if math.cos(ang_s) >= 0.0 else -0.75)
                fan_out = (radial_s_dir * 0.68 + side_bias * 0.22 + front_dir * 0.10) * (0.003 + 0.032 * (t_s ** 1.15)) * sc
                droop_z = Vector((0.0, 0.0, -silk_len * 0.56 * (t_s ** 1.80)))
                side_curl = (
                    ear_side * math.sin(ang_s + t_s * 3.8 + i_silk * 0.3)
                    + ear_up * math.cos(ang_s * 1.3 + t_s * 3.2)
                ) * (0.0055 * sc * (t_s ** 1.2))
                p_seg = p_start + disp_axis + fan_out + droop_z + side_curl

                w_strip = 0.00090 * sc * (1.0 - 0.45 * t_s)
                vl = bm.verts.new(p_seg + ear_side * w_strip)
                vr = bm.verts.new(p_seg - ear_side * w_strip)

                for v_pt in (vl.co.copy(), vr.co.copy()):
                    m = dict(common_ear)
                    m.update({"type": "silk", "base_pos": v_pt, "p_start": p_start.copy(), "t_s": t_s})
                    vert_meta.append(m)

                if prev_v_l and prev_v_r:
                    face = bm.faces.new((prev_v_l, prev_v_r, vr, vl))
                    for loop in face.loops:
                        loop[uv_layer].uv = (0.5, t_s)

                prev_v_l = vl
                prev_v_r = vr

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    m_t, m_g, m_s = crear_material_pbr_elote()
    obj.data.materials.append(m_t)
    obj.data.materials.append(m_g)
    obj.data.materials.append(m_s)

    for poly in mesh.polygons:
        v0 = vert_meta[poly.vertices[0]]
        if v0["type"] in ("kernel", "cob_core"):
            poly.material_index = 1
            poly.use_smooth = True
        elif v0["type"] == "silk":
            poly.material_index = 2
            poly.use_smooth = True
        else:
            poly.material_index = 0
            poly.use_smooth = True

    # -------------------------------------------------------------------------
    # 5. SHAPE KEYS DE LOS 3 ELOTES (Basis = jilote R1 -> Elote_Crec = mazorca adulta)
    # -------------------------------------------------------------------------
    sk_basis = obj.shape_key_add(name="Basis", from_mix=False)
    sk_crec  = obj.shape_key_add(name="Elote_Crec", from_mix=False)
    sk_abre  = obj.shape_key_add(name="Bracteas_Abre", from_mix=False)
    sk_llen  = obj.shape_key_add(name="Grano_Llenado", from_mix=False)
    sk_abor  = obj.shape_key_add(name="Aborto", from_mix=False)

    sk_crec.value = 0.0
    sk_abre.value = 0.0
    sk_llen.value = 0.0
    sk_abor.value = 0.0

    for idx, meta in enumerate(vert_meta):
        pos_adult = meta["base_pos"]
        mtype = meta["type"]
        stem_center = meta["stem_center"]
        ear_axis = meta["ear_axis"]
        ear_side = meta["ear_side"]
        front_dir = meta["front_dir"]
        sc = meta["sc"]

        v_rel = pos_adult - stem_center
        proj_len = v_rel.dot(ear_axis)
        v_perp = v_rel - ear_axis * proj_len

        # 0. BASIS (Elote_Crec = 0.0: Jilote naciente en R1 inicial)
        pos_primordial = (
            stem_center
            + ear_axis * (proj_len * 0.22)
            + v_perp * 0.24
            + Vector((0.0, 0.0, max(0.0, proj_len) * 0.05))
        )
        sk_basis.data[idx].co = pos_primordial

        # A. ELOTE_CREC (Elote_Crec = 1.0: Tamaño adulto completo de los 3 elotes y sus estigmas)
        sk_crec.data[idx].co = pos_adult

        # B. BRACTEAS_ABRE (Apertura suave en V de las brácteas frontales conservando las puntas agudas)
        delta_abre = Vector((0.0, 0.0, 0.0))
        if mtype == "husk" and meta["is_outer"] and meta["u"] > 0.14:
            u = meta["u"]
            u_eff = (u - 0.14) / 0.86
            f_front = max(0.30, meta["facing_cam"] + 0.35)
            parting_lat = ear_side * (meta["side_sign"] * 0.088 * sc * f_front * (u_eff ** 0.78))
            forward_clear = front_dir * (0.026 * sc * f_front * math.sin(u_eff * math.pi * 0.82))
            radial_peel = meta["radial_dir"] * (0.032 * sc * f_front * (u_eff ** 1.18))
            axial_drop = -ear_axis * (0.032 * sc * f_front * (u_eff ** 1.35))
            delta_abre = parting_lat + forward_clear + radial_peel + axial_drop
        sk_abre.data[idx].co = pos_primordial + delta_abre

        # C. GRANO_LLENADO (Expansión radial de cada grano 3D + hendidura dentada apical)
        delta_llen = Vector((0.0, 0.0, 0.0))
        if mtype == "kernel":
            env = meta["env"]
            dome = meta["dome"]
            dent = meta["dent_dimple"]
            radial_swell = ((0.0042 * env) + (0.0056 * env * dome) - (0.0011 * env * dent)) * sc
            delta_llen = meta["radial_dir"] * radial_swell
        elif mtype == "cob_core":
            delta_llen = (pos_adult - meta["center_s"]) * 0.20
        elif mtype == "husk":
            u = meta["u"]
            belly = math.sin(u * math.pi)
            delta_llen = meta["radial_dir"] * (0.0062 * sc * belly)
        sk_llen.data[idx].co = pos_primordial + delta_llen

        # D. ABORTO Y DEGRADACIÓN (Punta vana estéril y arrugamiento de granos)
        delta_abor = Vector((0.0, 0.0, 0.0))
        if mtype in ("kernel", "cob_core"):
            s = meta["s"]
            ang = meta["ang"]
            if s > 0.45:
                s_ab = (s - 0.45) / 0.55
                shrink = 0.64 * (s_ab ** 0.85)
                radial_vec = pos_adult - meta["center_s"]
                delta_abor = -radial_vec * shrink - ear_axis * (0.022 * sc * (s_ab ** 1.2))
            else:
                irregular = 0.18 * (0.5 + 0.5 * math.sin(5.0 * ang + s * 18.0))
                delta_abor = -(pos_adult - meta["center_s"]) * irregular
        elif mtype == "silk":
            t_s = meta["t_s"]
            delta_abor = -ear_axis * (0.026 * sc * t_s) + Vector((0.0, 0.0, -0.020 * sc * t_s))
        elif mtype == "husk" and meta["u"] > 0.50:
            u_ab = (meta["u"] - 0.50) / 0.50
            delta_abor = -meta["radial_dir"] * (0.0085 * sc * u_ab) - ear_axis * (0.016 * sc * u_ab)
        sk_abor.data[idx].co = pos_primordial + delta_abor

    obj["estigma_seco"] = 0.0
    obj["bracteas_seco"] = 0.0
    obj["color_grano"] = 1.0

    if planta_obj:
        obj.parent = planta_obj

    num_tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"[Maíz Chalqueño VR - Elote (3 Mazorcas)] Vértices: {len(mesh.vertices)} | Triángulos: {num_tris}")
    print(f"[Maíz Chalqueño VR - Elote] Shape Keys: {[kb.name for kb in mesh.shape_keys.key_blocks]}")
    return obj


def exportar_glb(ruta_salida):
    os.makedirs(os.path.dirname(ruta_salida), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=ruta_salida,
        export_format='GLB',
        export_texcoords=True,
        export_normals=True,
        export_morph=True,
        export_morph_normal=True,
        export_yup=True,
        export_apply=False
    )
    print(f"[Maíz Chalqueño VR] Exportación completada en: {ruta_salida}")


if __name__ == "__main__":
    limpiar_escena()
    planta = construir_maiz_chalqueno()
    construir_elote_chalqueno(planta)
    proyecto_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ruta_glb = os.path.join(proyecto_dir, "public", "models", "planta.glb")
    exportar_glb(ruta_glb)
