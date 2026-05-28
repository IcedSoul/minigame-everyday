"""Scan slot_bg.png to measure the 7 inner cell-center positions.

Usage:
    python3 _measure_slot.py
"""

from pathlib import Path
import numpy as np
from PIL import Image

PNG = Path(__file__).resolve().parent.parent / "assets" / "processed" / "slot_bg.png"


def main() -> None:
    img = Image.open(PNG).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    print(f"image size: W={w} H={h}  aspect={w / h:.4f}")

    # The inner cells are the beige/cream coloured rounded squares.
    # A horizontal scan-line through the vertical centre of the bar should
    # cross all 7 cells.  We try a few y positions and pick the one with the
    # most candidate segments matching the cream colour.
    y_candidates = [int(h * r) for r in (0.40, 0.45, 0.50, 0.55, 0.60)]

    def scan(y: int) -> list[tuple[int, int]]:
        row = arr[y]
        # Cream colour is high R + G, lower B, fully opaque.
        mask = (
            (row[:, 3] > 200)
            & (row[:, 0] > 215)
            & (row[:, 1] > 195)
            & (row[:, 1] < 245)
            & (row[:, 2] > 140)
            & (row[:, 2] < 210)
        )
        segs: list[tuple[int, int]] = []
        in_seg = False
        start = 0
        for i, m in enumerate(mask):
            if m and not in_seg:
                start = i
                in_seg = True
            elif not m and in_seg:
                segs.append((start, i - 1))
                in_seg = False
        if in_seg:
            segs.append((start, len(mask) - 1))
        # Keep wide segments only (filter out tiny noise / narrow gaps)
        return [(a, b) for a, b in segs if (b - a) >= 100]

    best_y = y_candidates[0]
    best_segs: list[tuple[int, int]] = []
    for y in y_candidates:
        segs = scan(y)
        if len(segs) > len(best_segs):
            best_segs = segs
            best_y = y

    print(f"best scan y = {best_y}, segments = {len(best_segs)}")
    for a, b in best_segs:
        cx = (a + b) / 2
        print(
            f"  [{a:4d},{b:4d}]  width={b - a + 1:4d}  cx={cx:7.1f}  cx/W={cx / w:.4f}"
        )

    if len(best_segs) >= 2:
        left = (best_segs[0][0] + best_segs[0][1]) / 2
        right = (best_segs[-1][0] + best_segs[-1][1]) / 2
        avg_cell_w = sum((b - a + 1) for a, b in best_segs) / len(best_segs)
        print()
        print(f"SLOT_BG_LEFT_CX_RATIO  = {left / w:.4f}")
        print(f"SLOT_BG_RIGHT_CX_RATIO = {right / w:.4f}")
        print(f"SLOT_BG_INNER_CELL_RATIO = {avg_cell_w / w:.4f}")
        print(f"SLOT_BG_ASPECT = {w / h:.4f}")


if __name__ == "__main__":
    main()
