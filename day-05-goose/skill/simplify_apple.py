"""
从原始 GLB 降面，保留真实几何外形：
1. 加载原始 GLB
2. merge_vertices 合并重复顶点
3. 清理退化面
4. 降面到指定比例
5. 再次 merge_vertices
6. fix_normals 修复 winding
7. 导出带法线的 GLB
"""
import trimesh
import numpy as np

INPUT = r'Y:\每日复刻小游戏\day-05-goose\image\0cb954680ee0299d468e2dd9d52057fb.glb'
OUTPUT = r'Y:\每日复刻小游戏\day-05-goose\image\apple-processed.glb'
TARGET_FACES = 4000  # 目标面数（原始 50000 面 → 4000 面，适合移动端）

print("Loading original GLB...")
m = trimesh.load(INPUT, force='mesh')
print(f"  Original: {len(m.faces)} faces, {len(m.vertices)} verts")
print(f"  watertight: {m.is_watertight}")
print(f"  bodies: {m.body_count}")

# 1. 合并重复顶点
print("\n[1] Merging vertices...")
m.merge_vertices(merge_tex=True, merge_norm=True)
print(f"  After merge: {len(m.faces)} faces, {len(m.vertices)} verts")

# 2. 清理退化面
print("[2] Removing degenerate faces...")
mask = m.nondegenerate_faces()
m.update_faces(mask)
m.remove_unreferenced_vertices()
# 手动去重面（按排序后的顶点索引）
sorted_faces = np.sort(m.faces, axis=1)
_, unique_idx = np.unique(sorted_faces, axis=0, return_index=True)
if len(unique_idx) < len(m.faces):
    m.update_faces(np.ones(len(m.faces), dtype=bool))
    keep = np.zeros(len(m.faces), dtype=bool)
    keep[unique_idx] = True
    m.update_faces(keep)
    m.remove_unreferenced_vertices()
print(f"  After cleanup: {len(m.faces)} faces, {len(m.vertices)} verts")

# 3. 降面
print(f"\n[3] Simplifying to {TARGET_FACES} faces...")
s = m.simplify_quadric_decimation(face_count=TARGET_FACES)
print(f"  After simplify: {len(s.faces)} faces, {len(s.vertices)} verts")
print(f"  winding_consistent: {s.is_winding_consistent}")

# 4. 再次合并 + 清理
print("\n[4] Post-simplify cleanup...")
s.merge_vertices()
mask = s.nondegenerate_faces()
s.update_faces(mask)
s.remove_unreferenced_vertices()
print(f"  After cleanup: {len(s.faces)} faces, {len(s.vertices)} verts")

# 5. 修复法线方向
print("[5] Fixing normals...")
s.fix_normals()
print(f"  winding_consistent: {s.is_winding_consistent}")
print(f"  watertight: {s.is_watertight}")

# 6. 验证法线
print(f"\n[6] Vertex normals shape: {s.vertex_normals.shape}")
print(f"  Any NaN: {np.any(np.isnan(s.vertex_normals))}")

# 7. 导出
print("\n[7] Exporting...")
s.export(OUTPUT, file_type='glb', include_normals=True)

import os
size = os.path.getsize(OUTPUT)
print(f"\n=== Done ===")
print(f"  Output: {OUTPUT}")
print(f"  Size: {size/1024:.1f} KB ({size/1024/1024:.2f} MB)")
print(f"  Faces: {len(s.faces)}")
print(f"  Vertices: {len(s.vertices)}")
print(f"  Watertight: {s.is_watertight}")
print(f"  Winding OK: {s.is_winding_consistent}")
