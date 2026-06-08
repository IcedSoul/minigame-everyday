#!/usr/bin/env python3
"""
3D模型重命名脚本
基于模型特征分析结果重新命名文件
"""

import os
import shutil

def rename_models():
    """
    根据模型特征重新命名文件
    """
    image_dir = r"y:\每日复刻小游戏\day-05-goose\image"
    
    # 基于分析结果的命名方案
    # 模型1: 球形，体积中等，对称性较好 -> 标准苹果
    # 模型2: 横长椭球，较扁平 -> 扁平苹果
    # 模型3: 球形，体积最大，封闭性好 -> 完美苹果
    # 模型4: 球形，高度略高 -> 高苹果
    
    naming_scheme = {
        "apple-processed-type1.glb": "apple-standard.glb",
        "apple-processed-type2.glb": "apple-flat.glb", 
        "apple-processed-type3.glb": "apple-perfect.glb",
        "apple-processed-type4.glb": "apple-tall.glb"
    }
    
    print("=== 开始重命名模型文件 ===")
    
    # 首先备份原始文件
    backup_dir = os.path.join(image_dir, "backup")
    os.makedirs(backup_dir, exist_ok=True)
    
    for old_name, new_name in naming_scheme.items():
        old_path = os.path.join(image_dir, old_name)
        new_path = os.path.join(image_dir, new_name)
        backup_path = os.path.join(backup_dir, old_name)
        
        if os.path.exists(old_path):
            # 备份原始文件
            shutil.copy2(old_path, backup_path)
            print(f"✓ 已备份: {old_name} -> backup/{old_name}")
            
            # 重命名文件
            os.rename(old_path, new_path)
            print(f"✓ 已重命名: {old_name} -> {new_name}")
        else:
            print(f"✗ 文件不存在: {old_name}")
    
    print("\n=== 重命名完成 ===")
    print("命名说明:")
    print("- apple-standard.glb: 标准球形苹果，体积中等")
    print("- apple-flat.glb: 扁平横长椭球苹果，适合特殊展示")
    print("- apple-perfect.glb: 完美球形苹果，体积最大且封闭性好")
    print("- apple-tall.glb: 高度略高的球形苹果")
    
    # 更新ItemFactory.js中的引用
    update_item_factory_references(naming_scheme)

def update_item_factory_references(naming_scheme):
    """
    更新ItemFactory.js中的模型文件引用
    """
    factory_path = r"y:\每日复刻小游戏\day-05-goose\js\core\ItemFactory.js"
    
    try:
        with open(factory_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换模型文件引用
        for old_name, new_name in naming_scheme.items():
            old_ref = f"'{old_name}'"
            new_ref = f"'{new_name}'"
            content = content.replace(old_ref, new_ref)
        
        # 写回文件
        with open(factory_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print("\n✓ 已更新ItemFactory.js中的模型引用")
        
    except Exception as e:
        print(f"✗ 更新ItemFactory.js失败: {e}")

def main():
    """主函数"""
    rename_models()

if __name__ == "__main__":
    main()