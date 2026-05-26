"""
Slice asset images for day-02-fruit.

Inputs (under day-02-fruit/asset/):
  - "ChatGPT Image 2026年5月25日 20_38_21.png"  : background (sky + grass with Y gap)
  - "ChatGPT Image 2026年5月25日 20_48_00.png"  : 2x3 fruits grid on white background

Outputs (under day-02-fruit/assets/):
  - fruit_red.png, fruit_orange.png, fruit_yellow.png,
    fruit_green.png, fruit_purple.png, fruit_coral.png   (88x88 transparent PNG)
  - bg_stage.png  (390x844 PNG, the source bg image resized 1:1 — no recompositing)

Usage:
  python3 day-02-fruit/tools/slice_assets.py

Geometry note:
  After resizing the source bg to 390x844, the grass V-shape converges to:
    funnel top      y ~ 536   (grass starts at the outermost columns)
    funnel bottom   y ~ 640   (left/right grass inner edges become parallel)
    channel inner   x = 161 .. 228   (channel width = 67 px, centered at x=195)
  These numbers are reflected in js/core/config.js so the physics walls align
  with the painted grass edges exactly.
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "asset")
OUT_DIR = os.path.join(ROOT, "assets")
os.makedirs(OUT_DIR, exist_ok=True)

BG_SRC = os.path.join(SRC_DIR, "ChatGPT Image 2026年5月25日 20_38_21.png")
FRUITS_SRC = os.path.join(SRC_DIR, "ChatGPT Image 2026年5月25日 20_48_00.png")

GAME_W = 390
GAME_H = 844

# Fruit names in the order they appear in the 2x3 grid (row-major: top-left -> bottom-right)
# Row 0: apple(red), orange, lemon(yellow)
# Row 1: watermelon(green), grape(purple), peach(coral)
FRUIT_NAMES = ["red", "orange", "yellow", "green", "purple", "coral"]


# ----------------------------------------------------------------------------
# Fruit slicing
# ----------------------------------------------------------------------------

def remove_white_background(img: Image.Image, threshold: int = 240) -> Image.Image:
    """Convert near-white pixels to transparent with a soft-edge alpha ramp."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    soft = 25
    lo = threshold - soft
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            m = min(r, g, b)
            if m >= threshold:
                px[x, y] = (r, g, b, 0)
            elif m <= lo:
                px[x, y] = (r, g, b, 255)
            else:
                t = (threshold - m) / float(soft)
                a = int(round(t * 255))
                px[x, y] = (r, g, b, a)
    return img


def trim_to_content(img: Image.Image, alpha_min: int = 8) -> Image.Image:
    bbox = img.getchannel("A").point(lambda v: 255 if v >= alpha_min else 0).getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def fit_into_square(img: Image.Image, size: int = 88, pad: int = 4) -> Image.Image:
    inner = size - 2 * pad
    w, h = img.size
    scale = min(inner / w, inner / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - new_w) // 2
    oy = (size - new_h) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def slice_fruits():
    grid = Image.open(FRUITS_SRC).convert("RGBA")
    gw, gh = grid.size
    cell_w = gw // 3
    cell_h = gh // 2
    print(f"[fruits] source {gw}x{gh}, cell {cell_w}x{cell_h}")

    for row in range(2):
        for col in range(3):
            idx = row * 3 + col
            name = FRUIT_NAMES[idx]
            x0 = col * cell_w
            y0 = row * cell_h
            cell = grid.crop((x0, y0, x0 + cell_w, y0 + cell_h))
            transparent = remove_white_background(cell, threshold=240)
            a = transparent.getchannel("A").point(lambda v: 0 if v < 6 else v)
            transparent.putalpha(a)
            trimmed = trim_to_content(transparent, alpha_min=12)
            out = fit_into_square(trimmed, size=88, pad=4)
            out_path = os.path.join(OUT_DIR, f"fruit_{name}.png")
            out.save(out_path, "PNG")
            print(f"[fruits] -> {out_path}  ({trimmed.size} -> 88x88)")


# ----------------------------------------------------------------------------
# Background: just resize the source image. No masks, no recoloring.
# The painted grass V-shape *is* the canonical funnel geometry; config.js
# is calibrated to match it.
# ----------------------------------------------------------------------------

def export_background():
    src = Image.open(BG_SRC).convert("RGB")
    sw, sh = src.size
    print(f"[bg] source {sw}x{sh} -> {GAME_W}x{GAME_H}")
    out = src.resize((GAME_W, GAME_H), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, "bg_stage.png")
    out.save(out_path, "PNG")
    print(f"[bg] -> {out_path}")


if __name__ == "__main__":
    slice_fruits()
    export_background()
    print("done.")
