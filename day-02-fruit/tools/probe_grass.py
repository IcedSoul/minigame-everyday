"""Probe grass V-shape geometry in the source bg image (resized to 390x844)."""
from PIL import Image

im = Image.open('/Users/xiaofengguo/Devlopment/code/github/minigame-everyday/day-02-fruit/asset/ChatGPT Image 2026\u5e745\u670825\u65e5 20_38_21.png').convert('RGB')
im2 = im.resize((390, 844), Image.LANCZOS)
px = im2.load()

def is_grass(rgb):
    r, g, b = rgb
    return g > r + 20 and g > b + 5 and g > 90

print('row | left_inner | right_inner | gap_width')
for y in range(440, 844, 8):
    li = None
    for x in range(195, -1, -1):
        if is_grass(px[x, y]):
            li = x
            break
    ri = None
    for x in range(195, 390):
        if is_grass(px[x, y]):
            ri = x
            break
    gap = (ri - li) if (li is not None and ri is not None) else None
    print(f' y={y:3d} | li={li}  ri={ri}  gap={gap}')

print()
print('col | grass_top_y')
for x in [5, 30, 60, 100, 140, 170, 185, 195, 205, 220, 250, 290, 330, 360, 385]:
    found = None
    for y in range(844):
        if is_grass(px[x, y]):
            found = y
            break
    print(f' x={x:3d} | y={found}')
