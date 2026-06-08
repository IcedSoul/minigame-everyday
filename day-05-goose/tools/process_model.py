#!/usr/bin/env python3
"""
通用3D模型降面处理脚本
基于trimesh库对GLB模型进行降面处理，支持批量处理
"""

import trimesh
import numpy as np
import os
import sys

def simplify_glb(input_path, output_path, target_faces=4000):
    """
    对GLB模型进行降面处理
    
    Args:
        input_path: 输入GLB文件路径
        output_path: 输出GLB文件路径
        target_faces: 目标面数，默认为4000
    
    Returns:
        bool: 处理是否成功
    """
    try:
        print(f"开始处理: {input_path}")
        
        # 1. 加载模型（force='mesh' 自动合并碎片化的多体模型）
        m = trimesh.load(input_path, force='mesh')
        print(f"原始模型: {len(m.faces):,} 面, {len(m.vertices):,} 顶点")
        print(f"  是否封闭: {m.is_watertight}, 体数: {m.body_count}")
        
        # 2. 合并重复顶点
        m.merge_vertices(merge_tex=True, merge_norm=True)
        
        # 3. 清理退化面（面积为 0 的三角形）
        mask = m.nondegenerate_faces()
        m.update_faces(mask)
        m.remove_unreferenced_vertices()
        
        # 4. 手动去重面
        sorted_faces = np.sort(m.faces, axis=1)
        _, unique_idx = np.unique(sorted_faces, axis=0, return_index=True)
        if len(unique_idx) < len(m.faces):
            keep = np.zeros(len(m.faces), dtype=bool)
            keep[unique_idx] = True
            m.update_faces(keep)
            m.remove_unreferenced_vertices()
            print(f"  去重后: {len(m.faces):,} 面")
        
        # 5. 降面（用 face_count 精确指定）
        print(f"目标面数: {target_faces}")
        s = m.simplify_quadric_decimation(face_count=target_faces)
        
        # 6. 降面后再次清理
        s.merge_vertices()
        mask = s.nondegenerate_faces()
        s.update_faces(mask)
        s.remove_unreferenced_vertices()
        
        # 7. 修复法线
        s.fix_normals()
        
        # 8. 验证质量
        print(f"简化后: {len(s.faces):,} 面, {len(s.vertices):,} 顶点")
        print(f"  是否封闭: {s.is_watertight}, 法线一致: {s.is_winding_consistent}")
        
        # 9. 导出
        s.export(output_path, file_type='glb', include_normals=True)
        
        # 10. 文件大小对比
        orig_size = os.path.getsize(input_path) / (1024*1024)
        new_size = os.path.getsize(output_path) / 1024
        print(f"文件大小: {orig_size:.2f} MB → {new_size:.1f} KB")
        print(f"压缩率: {(1 - new_size/(orig_size*1024))*100:.1f}%")
        print(f"输出文件: {output_path}")
        
        return True
        
    except Exception as e:
        print(f"处理失败: {e}")
        return False

def process_single_model(input_file, output_file, target_faces=4000):
    """
    处理单个模型文件
    
    Args:
        input_file: 输入文件路径
        output_file: 输出文件路径
        target_faces: 目标面数
    
    Returns:
        bool: 处理是否成功
    """
    # 检查输入文件是否存在
    if not os.path.exists(input_file):
        print(f"错误: 输入文件不存在 - {input_file}")
        return False
    
    # 创建输出目录（如果不存在）
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # 执行降面处理
    success = simplify_glb(input_file, output_file, target_faces)
    
    if success:
        print("✅ 模型处理完成!")
        return True
    else:
        print("❌ 模型处理失败!")
        return False

def process_multiple_models(model_configs):
    """
    批量处理多个模型
    
    Args:
        model_configs: 模型配置列表，每个配置为(input_file, output_file, target_faces)
    
    Returns:
        bool: 所有处理是否成功
    """
    print("=== 开始批量处理模型 ===")
    
    success_count = 0
    total_count = len(model_configs)
    
    for i, config in enumerate(model_configs, 1):
        if len(config) == 2:
            input_file, output_file = config
            target_faces = 4000
        else:
            input_file, output_file, target_faces = config
        
        print(f"\n[{i}/{total_count}] 处理模型...")
        success = process_single_model(input_file, output_file, target_faces)
        
        if success:
            success_count += 1
    
    print(f"\n=== 批量处理完成 ===")
    print(f"成功: {success_count}/{total_count}")
    
    return success_count == total_count

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='3D模型降面处理工具')
    parser.add_argument('input', help='输入GLB文件路径')
    parser.add_argument('output', help='输出GLB文件路径')
    parser.add_argument('-f', '--faces', type=int, default=4000, 
                       help='目标面数，默认4000')
    
    args = parser.parse_args()
    
    # 执行单个模型处理
    success = process_single_model(args.input, args.output, args.faces)
    
    if success:
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())