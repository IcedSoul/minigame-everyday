"""
Process game assets for Day 4 - Sheep Planet
1. Remove white background from vegetable icons (make transparent)
2. Rename all assets to standard names
3. Resize to appropriate game sizes
"""

from PIL import Image, ImageFilter
import os
import shutil

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
OUTPUT_DIR = os.path.join(ASSETS_DIR, 'processed')

os.makedirs(OUTPUT_DIR, exist_ok=True)

# File mapping: source filename -> target filename
FILE_MAP = {
    'ChatGPT Image 2026年5月28日 17_24_49.png': 'bg_grass.png',
    'ChatGPT Image 2026年5月28日 17_33_20.png': 'slot_bg.png',
    'ChatGPT Image 2026年5月28日 17_43_02.png': 'card_frame.png',
    'ChatGPT Image 2026年5月28日 17_38_04 (1).png': 'veg_0.png',   # carrot
    'ChatGPT Image 2026年5月28日 17_38_05 (2).png': 'veg_1.png',   # eggplant
    'ChatGPT Image 2026年5月28日 17_38_05 (3).png': 'veg_2.png',   # corn
    'ChatGPT Image 2026年5月28日 17_38_05 (4).png': 'veg_3.png',   # broccoli
    'ChatGPT Image 2026年5月28日 17_38_06 (5).png': 'veg_4.png',   # tomato
    'ChatGPT Image 2026年5月28日 17_38_07 (6).png': 'veg_5.png',   # lettuce
    'ChatGPT Image 2026年5月28日 17_38_07 (7).png': 'veg_6.png',   # chili
    'ChatGPT Image 2026年5月28日 17_38_08 (8).png': 'veg_7.png',   # mushroom
    'ChatGPT Image 2026年5月28日 17_38_08 (9).png': 'veg_8.png',   # cucumber
    'ChatGPT Image 2026年5月28日 17_38_08 (10).png': 'veg_9.png',  # strawberry
    'ChatGPT Image 2026年5月28日 17_39_00 (1).png': 'veg_10.png',  # grapes
    'ChatGPT Image 2026年5月28日 17_39_01 (2).png': 'veg_11.png',  # peach
}

# Files that need white background removal (vegetables + slot)
NEEDS_BG_REMOVAL = [
    'veg_0.png', 'veg_1.png', 'veg_2.png', 'veg_3.png',
    'veg_4.png', 'veg_5.png', 'veg_6.png', 'veg_7.png',
    'veg_8.png', 'veg_9.png', 'veg_10.png', 'veg_11.png',
    'slot_bg.png',
]

# Target sizes
VEG_SIZE = (200, 200)       # Vegetable icons
CARD_FRAME_SIZE = (200, 200)  # Square card frame
BG_SIZE = (720, 1280)       # Background (9:16)
SLOT_SIZE = (700, 140)      # Slot bar


def remove_white_background(img, threshold=240):
    """Remove white/near-white background and make it transparent."""
    img = img.convert('RGBA')
    data = img.getdata()
    new_data = []
    for item in data:
        r, g, b, a = item
        # If pixel is near-white, make it transparent
        if r > threshold and g > threshold and b > threshold:
            new_data.append((r, g, b, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    return img


def remove_white_background_smooth(img, threshold=230, edge_feather=2):
    """
    Remove white background with smooth edges.
    Uses alpha gradient near edges for anti-aliasing.
    """
    img = img.convert('RGBA')
    width, height = img.size
    pixels = img.load()

    # First pass: mark fully transparent pixels
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if r > threshold and g > threshold and b > threshold:
                pixels[x, y] = (r, g, b, 0)

    # Second pass: feather edges for smooth transition
    # Create a copy for reading while we modify
    alpha_img = img.split()[3]  # Get alpha channel
    # Apply slight blur to alpha for smooth edges
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=edge_feather))

    # Recombine
    r, g, b, _ = img.split()
    img = Image.merge('RGBA', (r, g, b, alpha_img))

    return img


def process_file(src_name, dst_name):
    """Process a single file: remove bg if needed, resize, save."""
    src_path = os.path.join(ASSETS_DIR, src_name)
    dst_path = os.path.join(OUTPUT_DIR, dst_name)

    if not os.path.exists(src_path):
        print(f'  [SKIP] Source not found: {src_name}')
        return False

    img = Image.open(src_path)
    print(f'  [LOAD] {src_name} ({img.size[0]}x{img.size[1]})')

    # Remove background if needed
    if dst_name in NEEDS_BG_REMOVAL:
        img = remove_white_background_smooth(img, threshold=235, edge_feather=1.5)
        print(f'    -> Background removed')

    # Resize based on target type
    if dst_name.startswith('veg_'):
        img = img.resize(VEG_SIZE, Image.LANCZOS)
        print(f'    -> Resized to {VEG_SIZE}')
    elif dst_name == 'card_frame.png':
        img = img.resize(CARD_FRAME_SIZE, Image.LANCZOS)
        print(f'    -> Resized to {CARD_FRAME_SIZE}')
    elif dst_name == 'bg_grass.png':
        img = img.resize(BG_SIZE, Image.LANCZOS)
        print(f'    -> Resized to {BG_SIZE}')
    elif dst_name == 'slot_bg.png':
        img = img.resize(SLOT_SIZE, Image.LANCZOS)
        print(f'    -> Resized to {SLOT_SIZE}')

    # Ensure RGBA for transparency support
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    img.save(dst_path, 'PNG', optimize=True)
    print(f'    -> Saved: {dst_path}')
    return True


def main():
    print('=== Processing Day 4 Game Assets ===\n')

    success = 0
    total = len(FILE_MAP)

    for src_name, dst_name in FILE_MAP.items():
        print(f'\n[{success+1}/{total}] {dst_name}')
        if process_file(src_name, dst_name):
            success += 1

    print(f'\n=== Done! {success}/{total} files processed ===')
    print(f'Output directory: {OUTPUT_DIR}')


if __name__ == '__main__':
    main()
