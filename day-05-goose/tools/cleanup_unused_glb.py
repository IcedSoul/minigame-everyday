#!/usr/bin/env python3
"""
清理未使用的GLB文件脚本
移除项目中未被实际使用的GLB模型文件
"""

import os
import shutil

def cleanup_unused_glb():
    """
    清理未使用的GLB文件
    """
    image_dir = r"y:\每日复刻小游戏\day-05-goose\image"
    
    # 根据ItemFactory.js分析，实际被使用的GLB文件
    used_files = {
        # type=0 使用的文件
        "apple-processed.glb",
        
        # type=1-4 使用的文件
        "apple-standard.glb",
        "apple-flat.glb", 
        "apple-perfect.glb",
        "apple-tall.glb"
    }
    
    # 备份目录中的文件也需要保留
    backup_files = {
        "backup/apple-processed-type1.glb",
        "backup/apple-processed-type2.glb",
        "backup/apple-processed-type3.glb", 
        "backup/apple-processed-type4.glb"
    }
    
    print("=== 开始清理未使用的GLB文件 ===")
    print("实际被使用的文件:")
    for file in used_files:
        print(f"  ✓ {file}")
    
    # 获取所有GLB文件
    all_files = []
    for item in os.listdir(image_dir):
        item_path = os.path.join(image_dir, item)
        if os.path.isfile(item_path) and item.endswith('.glb'):
            all_files.append(item)
        elif os.path.isdir(item_path) and item == 'backup':
            # 处理备份目录中的文件
            backup_dir = os.path.join(image_dir, 'backup')
            for backup_item in os.listdir(backup_dir):
                if backup_item.endswith('.glb'):
                    all_files.append(f"backup/{backup_item}")
    
    # 识别未使用的文件
    unused_files = []
    for file in all_files:
        if file not in used_files and file not in backup_files:
            unused_files.append(file)
    
    if not unused_files:
        print("\n✓ 没有发现未使用的GLB文件")
        return
    
    print(f"\n发现 {len(unused_files)} 个未使用的GLB文件:")
    for file in unused_files:
        print(f"  ✗ {file}")
    
    # 自动确认删除（不等待用户输入）
    print("\n自动删除未使用的GLB文件...")
    
    # 删除未使用的文件
    deleted_count = 0
    for file in unused_files:
        file_path = os.path.join(image_dir, file)
        
        # 处理备份目录中的文件
        if file.startswith('backup/'):
            file_path = os.path.join(image_dir, file)
        
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"✓ 已删除: {file}")
                deleted_count += 1
            else:
                print(f"⚠ 文件不存在: {file}")
        except Exception as e:
            print(f"✗ 删除失败 {file}: {e}")
    
    print(f"\n=== 清理完成 ===")
    print(f"总共删除了 {deleted_count} 个未使用的GLB文件")
    
    # 显示剩余的文件
    remaining_files = []
    for item in os.listdir(image_dir):
        item_path = os.path.join(image_dir, item)
        if os.path.isfile(item_path) and item.endswith('.glb'):
            remaining_files.append(item)
    
    print(f"\n剩余的文件 ({len(remaining_files)} 个):")
    for file in sorted(remaining_files):
        print(f"  {file}")

def main():
    """主函数"""
    cleanup_unused_glb()

if __name__ == "__main__":
    main()