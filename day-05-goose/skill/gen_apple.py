import trimesh
import numpy as np

def create_apple_mesh(radius=0.5, resolution=40):
    """Generate a procedural apple shape mesh - guaranteed watertight."""
    sphere = trimesh.creation.uv_sphere(radius=radius, count=[resolution, resolution])
    verts = sphere.vertices.copy()
    
    for i in range(len(verts)):
        x, y, z = verts[i]
        h = z / radius  # normalized height -1 to 1
        r = np.sqrt(x*x + y*y)
        
        if r > 0.001:
            # Apple profile: bulge in middle, narrow at top
            scale = 1.0 + 0.15 * (1 - h*h)
            if h > 0.3:
                scale *= 1.0 - 0.3 * ((h - 0.3) / 0.7) ** 1.5
            if h < -0.5:
                scale *= 1.0 - 0.15 * ((-0.5 - h) / 0.5) ** 2
            verts[i][0] = x * scale
            verts[i][1] = y * scale
        
        # Top indentation
        if h > 0.7:
            depth = 0.08 * ((h - 0.7) / 0.3) ** 2
            verts[i][2] -= depth
        
        # Bottom slight indentation
        if h < -0.85:
            depth = 0.03 * ((-0.85 - h) / 0.15) ** 2
            verts[i][2] += depth
    
    apple = trimesh.Trimesh(vertices=verts, faces=sphere.faces)
    apple.fix_normals()
    return apple

apple = create_apple_mesh(radius=0.5, resolution=40)
print(f'Apple mesh: {len(apple.faces)} faces, {len(apple.vertices)} verts')
print(f'  watertight: {apple.is_watertight}')
print(f'  winding_consistent: {apple.is_winding_consistent}')

apple.export('Y:/每日复刻小游戏/day-05-goose/image/apple-processed.glb', file_type='glb', include_normals=True)
import os
size = os.path.getsize('Y:/每日复刻小游戏/day-05-goose/image/apple-processed.glb')
print(f'Exported: {size/1024:.1f} KB')
