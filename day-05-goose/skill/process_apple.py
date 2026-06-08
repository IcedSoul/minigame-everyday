import trimesh
import numpy as np
import os
import sys

# 配置路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_PATH = os.path.join(BASE_DIR, "image", "0cb954680ee0299d468e2dd9d52057fb.glb")
OUTPUT_PATH = os.path.join(BASE_DIR, "image", "apple-processed.glb")

def process_apple():
    """处理apple.glb模型：降面优化以便游戏使用"""
    print(f"[3D Skill] 开始处理苹果模型...")
    print(f"[3D Skill] 输入: {INPUT_PATH}")
    
    if not os.path.exists(INPUT_PATH):
        print(f"[3D Skill] 错误: 找不到输入文件 {INPUT_PATH}")
        # 尝试找其他apple.glb
        alt_path = os.path.join(BASE_DIR, "image", "apple.glb")
        if os.path.exists(alt_path):
            print(f"[3D Skill] 使用备用路径: {alt_path}")
            return process_with_path(alt_path, OUTPUT_PATH)
        sys.exit(1)
    
    return process_with_path(INPUT_PATH, OUTPUT_PATH)

def compute_smooth_normals(mesh):
    """
    计算平滑顶点法线（带顶点焊接）。
    
    对于降面后产生的重复顶点（位置相同但索引不同），
    通过空间哈希将它们合并为同一组，确保法线一致，消除裂痕。
    """
    vertices = mesh.vertices
    faces = mesh.faces
    num_verts = len(vertices)
    
    # 1. 空间哈希焊接：位置相同的顶点映射到同一个代表
    precision = 5  # 小数位数
    rounded = np.round(vertices, precision)
    # 使用结构化数组做唯一化
    dtype = [('x', 'f8'), ('y', 'f8'), ('z', 'f8')]
    structured = np.array(list(map(tuple, rounded)), dtype=dtype)
    _, inverse = np.unique(structured, return_inverse=True)
    
    num_groups = inverse.max() + 1
    print(f"[3D Skill] 顶点焊接: {num_verts} → {num_groups} 组")
    
    # 2. 计算面法线（未归一化，面积加权）
    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]
    face_normals = np.cross(v1 - v0, v2 - v0)  # shape: (num_faces, 3)
    
    # 3. 按代表顶点组累加面法线
    group_normals = np.zeros((num_groups, 3), dtype=np.float64)
    for i in range(3):
        vert_indices = faces[:, i]
        groups = inverse[vert_indices]
        np.add.at(group_normals, groups, face_normals)
    
    # 4. 归一化
    norms = np.linalg.norm(group_normals, axis=1, keepdims=True)
    norms[norms < 1e-10] = 1.0  # 避免除零
    group_normals /= norms
    
    # 5. 分发回每个顶点
    vertex_normals = group_normals[inverse]
    
    return vertex_normals

def process_with_path(input_path, output_path):
    # 加载模型
    print(f"[3D Skill] 加载模型...")
    mesh = trimesh.load(input_path, force='mesh')
    
    orig_faces = len(mesh.faces)
    orig_verts = len(mesh.vertices)
    orig_size = os.path.getsize(input_path) / (1024*1024)
    
    print(f"[3D Skill] 原始面数: {orig_faces:,}")
    print(f"[3D Skill] 原始顶点数: {orig_verts:,}")
    print(f"[3D Skill] 原始文件大小: {orig_size:.2f} MB")
    
    # 降面处理 - 保留50%面数（通用道具推荐值）
    percent = 0.5
    print(f"[3D Skill] 降面处理 (保留 {percent*100:.0f}% 面数)...")
    simplified = mesh.simplify_quadric_decimation(percent=percent)
    
    new_faces = len(simplified.faces)
    new_verts = len(simplified.vertices)
    
    print(f"[3D Skill] 简化后面数: {new_faces:,}")
    print(f"[3D Skill] 简化后顶点数: {new_verts:,}")
    
    # 计算平滑法线（带焊接，消除裂痕）
    print(f"[3D Skill] 计算平滑法线（带顶点焊接）...")
    smooth_normals = compute_smooth_normals(simplified)
    simplified.vertex_normals = smooth_normals
    print(f"[3D Skill] 法线计算完成，形状: {smooth_normals.shape}")
    
    # 导出（include_normals=True 确保法线数据写入 GLB）
    print(f"[3D Skill] 导出到: {output_path}")
    simplified.export(output_path, file_type='glb', include_normals=True)
    
    new_size = os.path.getsize(output_path) / (1024*1024)
    print(f"[3D Skill] 简化后文件大小: {new_size:.2f} MB")
    print(f"[3D Skill] 压缩率: {(1 - new_size/orig_size)*100:.1f}%")
    print(f"[3D Skill] 处理完成! (含平滑法线数据)")
    
    return output_path

if __name__ == "__main__":
    process_apple()
