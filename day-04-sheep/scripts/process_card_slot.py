"""
Re-process card_frame.png and slot_bg.png from the NEW solid-white-background sources.

Approach (better than naive threshold):
  1. Flood-fill from all 4 corners through near-white pixels -> alpha=0
     (only true background gets removed, internal light highlights are preserved)
  2. Decontaminate edge pixels: for any pixel touching transparent area,
     un-mix the white the AI baked into anti-aliased edges so the icon
     doesn't get a white halo when placed on the green grass background.
  3. Crop to non-transparent bbox (with small padding).
  4. For card_frame: resize to a square 256x256 (game uses square cards).
     For slot_bg:    resize to 700x140 keeping aspect ratio cropped/letterbox.
  5. Save and run a sanity check (corner alpha + average edge alpha report).
"""

from PIL import Image, ImageFilter
from collections import deque
import os

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
OUT_DIR = os.path.join(ASSETS_DIR, 'processed')

# New source files (white background versions)
SRC_CARD = 'ChatGPT Image 2026年5月28日 17_54_41 (1).png'
SRC_SLOT = 'ChatGPT Image 2026年5月28日 17_54_42 (2).png'


# ──────────────── core algo ────────────────

def is_near_white(rgba, thr=235):
    r, g, b, _ = rgba
    return r >= thr and g >= thr and b >= thr


def flood_fill_bg_to_transparent(img, thr=235, tolerance_drop=18):
    """
    BFS from every pixel on the 4 borders. Any pixel reachable through
    near-white pixels gets alpha=0. This preserves any internal light
    (cream/yellow card face) from being eaten, because they aren't connected
    to the outer background.

    `tolerance_drop`: as we walk inward, slightly relax the threshold so
    soft anti-aliased edges (RGB ~210-235) still get partial transparency.
    """
    img = img.convert('RGBA')
    W, H = img.size
    px = img.load()

    visited = [[False] * H for _ in range(W)]
    q = deque()

    # Seed: every border pixel that is near-white
    for x in range(W):
        for y in (0, H - 1):
            r, g, b, _ = px[x, y]
            if r >= thr and g >= thr and b >= thr:
                q.append((x, y))
                visited[x][y] = True
    for y in range(H):
        for x in (0, W - 1):
            r, g, b, _ = px[x, y]
            if r >= thr and g >= thr and b >= thr:
                if not visited[x][y]:
                    q.append((x, y))
                    visited[x][y] = True

    # 4-direction BFS through near-white connected region.
    soft_thr = thr - tolerance_drop  # 217
    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        # Hard-bg: fully transparent
        if r >= thr and g >= thr and b >= thr:
            px[x, y] = (255, 255, 255, 0)
        else:
            # Soft edge: partial alpha based on how white it is
            # whiteness in [soft_thr, thr) -> alpha in (0, 255)
            white_amt = min(r, g, b)  # the "whiteness" floor
            ratio = (white_amt - soft_thr) / float(thr - soft_thr)  # 0..1
            ratio = max(0.0, min(1.0, ratio))
            new_a = int(255 * (1.0 - ratio))
            px[x, y] = (r, g, b, new_a)
            # Don't expand from soft-edge pixels; we only walk the white sea.
            continue

        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not visited[nx][ny]:
                rr, gg, bb, _ = px[nx, ny]
                # expand if neighbor is white-ish (so soft edges get visited too)
                if rr >= soft_thr and gg >= soft_thr and bb >= soft_thr:
                    visited[nx][ny] = True
                    q.append((nx, ny))

    return img


def kill_white_islands(img, thr=235, max_island_ratio=0.05):
    """
    Second pass: detect *internal* connected white regions that the border
    flood-fill couldn't reach (e.g. white pockets enclosed by green leaves),
    and erase them. Only islands smaller than `max_island_ratio` of the total
    image area are removed -- protecting any large legitimate white area.
    """
    img = img.convert('RGBA')
    W, H = img.size
    px = img.load()
    total = W * H
    max_size = int(total * max_island_ratio)

    visited = [[False] * H for _ in range(W)]
    killed_count = 0
    killed_pixels = 0

    for sy in range(H):
        for sx in range(W):
            if visited[sx][sy]:
                continue
            r, g, b, a = px[sx, sy]
            # Only seed on still-opaque near-white pixels
            if a < 200:
                visited[sx][sy] = True
                continue
            if not (r >= thr and g >= thr and b >= thr):
                visited[sx][sy] = True
                continue

            # BFS this connected white region
            region = []
            q = deque([(sx, sy)])
            visited[sx][sy] = True
            while q:
                x, y = q.popleft()
                region.append((x, y))
                if len(region) > max_size:
                    break  # too big - probably a legitimate white area, abort
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and not visited[nx][ny]:
                        rr, gg, bb, aa = px[nx, ny]
                        if aa >= 200 and rr >= thr and gg >= thr and bb >= thr:
                            visited[nx][ny] = True
                            q.append((nx, ny))

            if len(region) <= max_size:
                # Erase this island
                for (x, y) in region:
                    px[x, y] = (255, 255, 255, 0)
                killed_count += 1
                killed_pixels += len(region)

    print(f'    -> killed {killed_count} white islands, {killed_pixels} pixels '
          f'({killed_pixels / total * 100:.2f}% of image)')
    return img


def kill_halo_near_alpha(img, light_thr=200, neighbor_radius=4, transparent_ratio=0.30):
    """
    Targeted halo removal:
      For each opaque pixel with RGB >= light_thr, if a fraction >= transparent_ratio
      of its (2r+1)x(2r+1) neighborhood is already fully transparent, this pixel is
      considered a "halo / leftover edge fragment" and gets erased.

    This is the safest pass to run last: it only touches pixels that are right next
    to the cutout edge, so the interior of the artwork (no transparent neighbors)
    is never affected, no matter how light it is.
    """
    img = img.convert('RGBA')
    W, H = img.size
    px = img.load()
    snapshot = img.copy().load()

    r = neighbor_radius
    win = (2 * r + 1) * (2 * r + 1)
    min_transparent = int(win * transparent_ratio)

    killed = 0
    for y in range(H):
        for x in range(W):
            cr, cg, cb, ca = snapshot[x, y]
            if ca < 200:
                continue
            if not (cr >= light_thr and cg >= light_thr and cb >= light_thr):
                continue
            # Count transparent neighbors
            tcount = 0
            for dy in range(-r, r + 1):
                ny = y + dy
                if ny < 0 or ny >= H:
                    tcount += (2 * r + 1)  # off-image counts as transparent
                    continue
                for dx in range(-r, r + 1):
                    nx = x + dx
                    if nx < 0 or nx >= W:
                        tcount += 1
                        continue
                    if snapshot[nx, ny][3] == 0:
                        tcount += 1
            if tcount >= min_transparent:
                px[x, y] = (255, 255, 255, 0)
                killed += 1
    print(f'    -> killed {killed} halo pixels '
          f'({killed / (W * H) * 100:.2f}% of image)')
    return img


def kill_light_islands(img, light_thr=215, max_island_ratio=0.03):
    """
    Third pass: catch *light-colored* (not pure white but very light, RGB>=215)
    enclosed regions. Same as kill_white_islands but with a softer threshold,
    used for soft-edge cleanup of leaf-enclosed pockets that have anti-alias
    bleeding (e.g. RGB ~220-234).
    """
    img = img.convert('RGBA')
    W, H = img.size
    px = img.load()
    total = W * H
    max_size = int(total * max_island_ratio)

    visited = [[False] * H for _ in range(W)]
    killed_count = 0
    killed_pixels = 0

    for sy in range(H):
        for sx in range(W):
            if visited[sx][sy]:
                continue
            r, g, b, a = px[sx, sy]
            if a < 200:
                visited[sx][sy] = True
                continue
            if not (r >= light_thr and g >= light_thr and b >= light_thr):
                visited[sx][sy] = True
                continue

            region = []
            q = deque([(sx, sy)])
            visited[sx][sy] = True
            while q:
                x, y = q.popleft()
                region.append((x, y))
                if len(region) > max_size:
                    break
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and not visited[nx][ny]:
                        rr, gg, bb, aa = px[nx, ny]
                        if aa >= 200 and rr >= light_thr and gg >= light_thr and bb >= light_thr:
                            visited[nx][ny] = True
                            q.append((nx, ny))

            if len(region) <= max_size:
                for (x, y) in region:
                    # Soft-feather: larger islands get full transparency,
                    # very small ones (likely halo) get full transparency too.
                    px[x, y] = (255, 255, 255, 0)
                killed_count += 1
                killed_pixels += len(region)

    print(f'    -> killed {killed_count} light islands, {killed_pixels} pixels '
          f'({killed_pixels / total * 100:.2f}% of image)')
    return img


def decontaminate_edges(img, passes=2):
    """
    For every semi-transparent pixel, pull its RGB toward its
    nearest fully-opaque neighbor's RGB. Removes white halo when the
    image is composited over a darker (green) background.
    """
    img = img.convert('RGBA')
    W, H = img.size
    for _ in range(passes):
        px = img.load()
        snapshot = img.copy().load()
        for y in range(H):
            for x in range(W):
                r, g, b, a = snapshot[x, y]
                if a <= 0 or a >= 250:
                    continue
                # average neighboring opaque pixels' RGB
                acc_r = acc_g = acc_b = cnt = 0
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H:
                            rr, gg, bb, aa = snapshot[nx, ny]
                            if aa >= 250:
                                acc_r += rr; acc_g += gg; acc_b += bb; cnt += 1
                if cnt > 0:
                    new_r = acc_r // cnt
                    new_g = acc_g // cnt
                    new_b = acc_b // cnt
                    px[x, y] = (new_r, new_g, new_b, a)
    return img


def crop_to_bbox(img, padding=4):
    bbox = img.getbbox()
    if bbox is None:
        return img
    l, t, r, b = bbox
    W, H = img.size
    l = max(0, l - padding)
    t = max(0, t - padding)
    r = min(W, r + padding)
    b = min(H, b + padding)
    return img.crop((l, t, r, b))


def fit_square(img, size):
    """Resize image into a perfect square `size`x`size`, padding with transparent."""
    img = img.convert('RGBA')
    w, h = img.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2), img)
    return canvas.resize((size, size), Image.LANCZOS)


def fit_letterbox(img, target_w, target_h):
    """Resize keeping aspect ratio, fit inside target, pad transparent."""
    img = img.convert('RGBA')
    w, h = img.size
    scale = min(target_w / w, target_h / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    canvas.paste(img, ((target_w - new_w) // 2, (target_h - new_h) // 2), img)
    return canvas


# ──────────────── sanity check ────────────────

def sanity_report(name, img):
    """Print: corner alpha, edge alpha avg, transparent ratio."""
    img = img.convert('RGBA')
    W, H = img.size
    px = img.load()

    # 4 corner pixels
    corners = [px[0, 0], px[W - 1, 0], px[0, H - 1], px[W - 1, H - 1]]
    corner_a = [c[3] for c in corners]

    # edge pixel alpha avg
    edge_total = 0
    edge_cnt = 0
    for x in range(W):
        for y in (0, H - 1):
            edge_total += px[x, y][3]
            edge_cnt += 1
    for y in range(H):
        for x in (0, W - 1):
            edge_total += px[x, y][3]
            edge_cnt += 1
    edge_avg = edge_total / edge_cnt

    # transparency ratio
    transp = 0
    total = W * H
    for y in range(H):
        for x in range(W):
            if px[x, y][3] == 0:
                transp += 1

    print(f'  ┌─ Sanity: {name} ({W}x{H})')
    print(f'  │  Corner alphas    : {corner_a}  (expect [0,0,0,0])')
    print(f'  │  Edge alpha avg   : {edge_avg:.1f}  (expect very low, < 5)')
    print(f'  │  Transparent ratio: {transp / total * 100:.1f}%')
    print(f'  └─')


# ──────────────── main ────────────────

def process_card_frame():
    print('\n[1/2] card_frame.png  (square card base)')
    src = os.path.join(ASSETS_DIR, SRC_CARD)
    if not os.path.exists(src):
        print(f'  ERROR: source not found: {src}')
        return
    img = Image.open(src)
    print(f'  loaded: {img.size}')

    img = flood_fill_bg_to_transparent(img, thr=235)
    print(f'  flood-fill done')

    img = kill_white_islands(img, thr=235, max_island_ratio=0.05)
    print(f'  white-island kill done')

    img = kill_light_islands(img, light_thr=215, max_island_ratio=0.03)
    print(f'  light-island kill done')

    img = decontaminate_edges(img, passes=2)
    print(f'  edge decontamination done')

    img = crop_to_bbox(img, padding=6)
    print(f'  cropped to bbox: {img.size}')

    img = fit_square(img, 256)
    print(f'  resized to: {img.size}')

    out = os.path.join(OUT_DIR, 'card_frame.png')
    img.save(out, 'PNG', optimize=True)
    print(f'  saved -> {out}')
    sanity_report('card_frame', img)


def process_slot_bg():
    print('\n[2/2] slot_bg.png  (slot bar)')
    src = os.path.join(ASSETS_DIR, SRC_SLOT)
    if not os.path.exists(src):
        print(f'  ERROR: source not found: {src}')
        return
    img = Image.open(src)
    print(f'  loaded: {img.size}')

    img = flood_fill_bg_to_transparent(img, thr=235)
    print(f'  flood-fill done')

    img = kill_white_islands(img, thr=235, max_island_ratio=0.05)
    print(f'  white-island kill done')

    img = kill_light_islands(img, light_thr=215, max_island_ratio=0.03)
    print(f'  light-island kill done')

    # Slot has leaves on both ends -> there are halo fragments tucked under
    # the leaves that none of the above passes catch. This safe targeted
    # halo-killer only touches light pixels that are directly next to a
    # transparent area (so it can't damage the wood-board interior).
    img = kill_halo_near_alpha(img, light_thr=200, neighbor_radius=4,
                                transparent_ratio=0.30)
    print(f'  halo-near-alpha kill done')

    img = decontaminate_edges(img, passes=2)
    print(f'  edge decontamination done')

    img = crop_to_bbox(img, padding=6)
    print(f'  cropped to bbox: {img.size}')

    # slot bar is wide; aspect ratio of source is roughly 5:1
    # game uses 700x140, but to keep more detail, we save at 1400x280
    img = fit_letterbox(img, 1400, 280)
    print(f'  resized to: {img.size}')

    out = os.path.join(OUT_DIR, 'slot_bg.png')
    img.save(out, 'PNG', optimize=True)
    print(f'  saved -> {out}')
    sanity_report('slot_bg', img)


if __name__ == '__main__':
    print('=== Re-processing card_frame & slot_bg from new white-bg sources ===')
    process_card_frame()
    process_slot_bg()
    print('\n=== Done ===')
