#!/usr/bin/env python3
"""
3D模型特征分析脚本
分析GLB模型的外观特征，用于重新命名
"""

import trimesh
import numpy as np
import os
import sys

def analyze_model(file_path):
    """
    分析GLB模型的特征
    
    Args:
        file_path: GLB文件路径
    
    Returns:
        dict: 包含模型特征的字典
    """
    try:
        print(f"\n=== 分析模型: {os.path.basename(file_path)} ===")
        
        # 加载模型
        mesh = trimesh.load(file_path, force='mesh')
        
        # 基础信息
        vertex_count = len(mesh.vertices)
        face_count = len(mesh.faces)
        
        # 边界框尺寸
        bbox = mesh.bounds
        bbox_size = bbox[1] - bbox[0]  # 最大-最小
        
        # 体积和表面积
        volume = mesh.volume
        surface_area = mesh.area
        
        # 形状特征
        extent_ratio = bbox_size.max() / bbox_size.min() if bbox_size.min() > 0 else float('inf')
        
        # 顶点分布特征
        centroid = mesh.centroid
        vertex_distances = np.linalg.norm(mesh.vertices - centroid, axis=1)
        avg_distance = np.mean(vertex_distances)
        std_distance = np.std(vertex_distances)
        
        # 对称性分析（简单版本）
        x_symmetry = np.abs(mesh.vertices[:, 0]).std()
        y_symmetry = np.abs(mesh.vertices[:, 1]).std()
        z_symmetry = np.abs(mesh.vertices[:, 2]).std()
        
        # 形状分类
        shape_type = classify_shape(mesh, bbox_size, extent_ratio)
        
        features = {
            'file_name': os.path.basename(file_path),
            'vertex_count': vertex_count,
            'face_count': face_count,
            'bbox_size': bbox_size,
            'volume': volume,
            'surface_area': surface_area,
            'extent_ratio': extent_ratio,
            'shape_type': shape_type,
            'is_watertight': mesh.is_watertight,
            'symmetry': {'x': x_symmetry, 'y': y_symmetry, 'z': z_symmetry},
            'centroid': centroid,
            'avg_vertex_distance': avg_distance,
            'std_vertex_distance': std_distance
        }
        
        # 打印分析结果
        print(f"顶点数: {vertex_count:,}")
        print(f"面数: {face_count:,}")
        print(f"边界框尺寸: {bbox_size}")
        print(f"体积: {volume:.6f}")
        print(f"表面积: {surface_area:.6f}")
        print(f"长宽比: {extent_ratio:.2f}")
        print(f"形状类型: {shape_type}")
        print(f"是否封闭: {mesh.is_watertight}")
        print(f"对称性 (x/y/z): {x_symmetry:.4f}/{y_symmetry:.4f}/{z_symmetry:.4f}")
        
        return features
        
    except Exception as e:
        print(f"分析失败: {e}")
        return None

def classify_shape(mesh, bbox_size, extent_ratio):
    """
    根据几何特征分类形状
    """
    # 判断是否为球体
    if extent_ratio < 1.5:
        return "球形"
    
    # 判断是否为椭球体
    elif extent_ratio < 3.0:
        # 检查哪个轴最长
        max_axis = np.argmax(bbox_size)
        if max_axis == 0:
            return "横长椭球"
        elif max_axis == 1:
            return "竖长椭球"
        else:
            return "纵深椭球"
    
    # 判断是否为不规则形状
    else:
        # 检查是否有明显的对称性
        symmetry_scores = [
            np.abs(mesh.vertices[:, 0]).std(),
            np.abs(mesh.vertices[:, 1]).std(), 
            np.abs(mesh.vertices[:, 2]).std()
        ]
        
        if min(symmetry_scores) < 0.1:  # 某个方向对称性很好
            return "对称不规则形状"
        else:
            return "不规则形状"

def suggest_name(features):
    """
    根据特征建议文件名
    """
    shape_type = features['shape_type']
    bbox_size = features['bbox_size']
    
    # 根据形状类型和建议
    if "球形" in shape_type:
        return "round-fruit"
    elif "椭球" in shape_type:
        if "横长" in shape_type:
            return "horizontal-ellipsoid"
        elif "竖长" in shape_type:
            return "vertical-ellipsoid"
        else:
            return "depth-ellipsoid"
    elif "对称" in shape_type:
        return "symmetric-fruit"
    else:
        # 根据尺寸比例进一步分类
        size_ratio = bbox_size.max() / bbox_size.min()
        if size_ratio > 5:
            return "elongated-fruit"
        else:
            return "complex-fruit"

def main():
    """主函数"""
    model_files = [
        "apple-processed-type1.glb",
        "apple-processed-type2.glb", 
        "apple-processed-type3.glb",
        "apple-processed-type4.glb"
    ]
    
    image_dir = r"y:\每日复刻小游戏\day-05-goose\image"
    
    all_features = []
    
    for model_file in model_files:
        file_path = os.path.join(image_dir, model_file)
        
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            continue
            
        features = analyze_model(file_path)
        if features:
            suggested_name = suggest_name(features)
            features['suggested_name'] = suggested_name
            all_features.append(features)
            print(f"建议名称: {suggested_name}")
            print("-" * 50)
    
    # 汇总分析
    if all_features:
        print("\n=== 模型特征汇总 ===")
        for i, features in enumerate(all_features, 1):
            print(f"模型 {i}: {features['file_name']}")
            print(f"  形状: {features['shape_type']}")
            print(f"  建议名称: {features['suggested_name']}")
            print(f"  尺寸: {features['bbox_size']}")
            print()

if __name__ == "__main__":
    main()