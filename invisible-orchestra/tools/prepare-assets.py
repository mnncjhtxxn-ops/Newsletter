"""
Asset preparation for The Invisible Orchestra.

Takes a source model (FBX / GLB / .blend), joins its meshes, drops ground
planes, decimates to a triangle budget, normalises scale and orientation to
the sculpture's local units, and writes a compact quantised geometry file
that the build embeds. Only geometry is kept: the objects are formed from
light, so textures and materials are never used.

Run with Blender's Python module:   python3 tools/prepare-assets.py <name> <source> [options]
Output:                              src/assets/<name>.geo   (see loader.js for the format)

Format (little-endian):
  magic 'IOG1' | uint32 vertexCount | uint32 triangleCount | float32 min[3] | float32 max[3]
  int16 positions[vertexCount*3] quantised to [min,max]
  uint16 indices[triangleCount*3]  (uint32 when vertexCount > 65535; flag in byte 3 of the magic: 'IOG1' = u16, 'IOG2' = u32)
"""
import sys, struct, math, argparse
import bpy
from mathutils import Vector, Matrix

ap = argparse.ArgumentParser()
ap.add_argument('name'); ap.add_argument('source')
ap.add_argument('--tris', type=int, default=24000)
ap.add_argument('--size', type=float, default=2.4, help='target extent along the longest horizontal axis, local units')
ap.add_argument('--yaw', type=float, default=0, help='extra rotation about the up axis, degrees, after alignment')
ap.add_argument('--long-axis-x', action='store_true', help='rotate so the longest horizontal extent lies along X')
ap.add_argument('--drop', default='ground,plane,floor,backdrop,terrain,road', help='delete objects whose names contain these words')
ap.add_argument('--keep-largest', type=int, default=0, help='keep only the N largest mesh objects by volume (0 = all)')
a = ap.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
src = a.source.lower()
if src.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=a.source)
elif src.endswith('.glb') or src.endswith('.gltf'): bpy.ops.import_scene.gltf(filepath=a.source)
elif src.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=a.source)
else: raise SystemExit('unsupported source')

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
drop = [w.strip() for w in a.drop.split(',') if w.strip()]
kept = []
for o in meshes:
    n = o.name.lower()
    if any(w in n for w in drop):
        print('drop', o.name); continue
    kept.append(o)
if a.keep_largest:
    def vol(o):
        b = [o.matrix_world @ Vector(c) for c in o.bound_box]
        xs=[v.x for v in b]; ys=[v.y for v in b]; zs=[v.z for v in b]
        return (max(xs)-min(xs))*(max(ys)-min(ys))*(max(zs)-min(zs))
    kept = sorted(kept, key=vol, reverse=True)[:a.keep_largest]
print('source meshes', len(meshes), 'kept', len(kept), 'names:', ', '.join(sorted(set(o.name for o in meshes)))[:600])

# Collect world-space triangles from all kept meshes (evaluated, so modifiers apply).
deps = bpy.context.evaluated_depsgraph_get()
verts = []; tris = []
for o in kept:
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    base = len(verts)
    mw = ev.matrix_world
    for v in me.vertices: verts.append(mw @ v.co)
    for t in me.loop_triangles: tris.append((base + t.vertices[0], base + t.vertices[1], base + t.vertices[2]))
    ev.to_mesh_clear()
print('joined: verts', len(verts), 'tris', len(tris))

# Build one mesh object for decimation.
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new('joined')
me.from_pydata([tuple(v) for v in verts], [], [tuple(t) for t in tris])
me.validate(); me.update()
ob = bpy.data.objects.new('joined', me)
bpy.context.scene.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
# weld duplicate vertices so decimation has connectivity
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode='OBJECT')
# Decimate iteratively: scenes made of many small parts resist a single pass.
for _ in range(6):
    ntri = len(ob.data.polygons)
    if ntri <= a.tris * 1.05: break
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = max(0.05, a.tris / ntri); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    print('decimate pass ->', len(ob.data.polygons))
deps = bpy.context.evaluated_depsgraph_get()
me = ob.evaluated_get(deps).to_mesh(); me.calc_loop_triangles()
P = [Vector(v.co) for v in me.vertices]
T = [(t.vertices[0], t.vertices[1], t.vertices[2]) for t in me.loop_triangles]
print('decimated: verts', len(P), 'tris', len(T))

# Blender is Z-up; the sculpture is Y-up: (x, y, z) -> (x, z, -y)
P = [Vector((v.x, v.z, -v.y)) for v in P]
def bounds(P):
    xs=[v.x for v in P]; ys=[v.y for v in P]; zs=[v.z for v in P]
    return Vector((min(xs),min(ys),min(zs))), Vector((max(xs),max(ys),max(zs)))
mn, mx = bounds(P)
ext = mx - mn
if a.long_axis_x and ext.z > ext.x:
    P = [Vector((v.z, v.y, -v.x)) for v in P]
    mn, mx = bounds(P); ext = mx - mn
if a.yaw:
    R = Matrix.Rotation(math.radians(a.yaw), 3, 'Y')
    P = [R @ v for v in P]; mn, mx = bounds(P); ext = mx - mn
c = (mn + mx) / 2
s = a.size / max(ext.x, ext.z)
P = [(v - c) * s for v in P]
mn, mx = bounds(P)
print('final bounds', tuple(round(x,3) for x in mn), tuple(round(x,3) for x in mx))

out = f'/home/user/Newsletter/invisible-orchestra/src/assets/{a.name}.geo'
with open(out, 'wb') as f:
    wide = len(P) > 65535
    f.write(b'IOG2' if wide else b'IOG1'); f.write(struct.pack('<II', len(P), len(T)))
    f.write(struct.pack('<6f', mn.x, mn.y, mn.z, mx.x, mx.y, mx.z))
    q = []
    for v in P:
        for k in range(3):
            lo, hi = mn[k], mx[k]
            t = 0 if hi - lo < 1e-9 else (v[k] - lo) / (hi - lo)
            q.append(int(round(-32767 + t * 65534)))
    f.write(struct.pack(f'<{len(q)}h', *q))
    f.write(struct.pack(f'<{len(T)*3}{"I" if wide else "H"}', *[i for t in T for i in t]))
import os
print('wrote', out, os.path.getsize(out), 'bytes')
