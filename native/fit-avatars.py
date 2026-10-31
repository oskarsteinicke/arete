#!/usr/bin/env python3
"""Fit a new set of character avatars to the app's frame.

The app shows each avatar as a 512x768 image on #0B0B0B. Art straight out of
an image generator never lines up: the figure is a different size in every
picture and stands at a different height, so the character seems to grow,
shrink and hop between levels. This puts every figure at the same height,
standing on the same line, centred on the head and shoulders (so a notebook
or bottle held to one side does not pull it off centre).

Usage:
  python3 native/fit-avatars.py SOURCE_DIR                 # write to ./avatars-fitted, plus a check sheet
  python3 native/fit-avatars.py SOURCE_DIR --out DIR       # write somewhere else
  python3 native/fit-avatars.py SOURCE_DIR --install       # write into the app and bump _AVATAR_V in app.js

SOURCE_DIR holds avatar-m-1 ... avatar-m-6 and avatar-f-1 ... avatar-f-6
(.png, .jpg or .webp, any size). Missing ones are skipped. Each figure should
stand on a plain dark background with nothing else in the picture.

Pillow only; this Mac has no numpy.
"""
import argparse
import os
import re
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 512, 768
BG = (11, 11, 11)          # #0B0B0B, the colour the app shows avatars on
FEET_Y = 736               # every figure stands on this line
FIG_H = 672                # head top to feet, so the head sits at y = 64
SIDE = 14                  # keep at least this much clear at the sides
NAMES = [f'avatar-{s}-{n}' for s in ('m', 'f') for n in range(1, 7)]
EXTS = ('.png', '.jpg', '.jpeg', '.webp')

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)


def find_sources(src):
    found = {}
    for name in NAMES:
        for ext in EXTS:
            p = os.path.join(src, name + ext)
            if os.path.exists(p):
                found[name] = p
                break
    return found


def corner_bg(im):
    """The background colour: the middle value of patches in the four corners."""
    w, h = im.size
    k = max(4, min(w, h) // 40)
    px = []
    for x0, y0 in ((0, 0), (w - k, 0), (0, h - k), (w - k, h - k)):
        px += list(im.crop((x0, y0, x0 + k, y0 + k)).getdata())
    return tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))


def distance_map(im, bg):
    """Per pixel, the largest channel difference from the background (0-255)."""
    d = ImageChops.difference(im, Image.new('RGB', im.size, bg))
    r, g, b = d.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def noise_level(dist, w, h):
    """How far the background strays from its own colour: in each corner, the
    level 99% of pixels stay under; then the middle of the four, so a figure
    that reaches into one corner does not count as noise."""
    k = max(4, min(w, h) // 20)
    levels = []
    for x0, y0 in ((0, 0), (w - k, 0), (0, h - k), (w - k, h - k)):
        hist = dist.crop((x0, y0, x0 + k, y0 + k)).histogram()
        total, run = sum(hist), 0
        for i, n in enumerate(hist):
            run += n
            if run >= total * 0.99:
                levels.append(i)
                break
    levels.sort()
    return (levels[1] + levels[2]) // 2


def figure_box(dist, w, h, thr):
    """Rows and columns that clearly hold the figure, ignoring stray specks.
    thr is the smallest difference from the background that counts."""
    mask = dist.point(lambda v: 255 if v > thr else 0)
    # Shrink to one pixel per row / column by averaging, then threshold.
    rows = list(mask.resize((1, h), Image.BOX).getdata())
    cols = list(mask.resize((w, 1), Image.BOX).getdata())
    lim_r = 255 * max(2, w * 0.004) / w
    lim_c = 255 * max(2, h * 0.004) / h
    ys = [y for y, v in enumerate(rows) if v > lim_r]
    xs = [x for x, v in enumerate(cols) if v > lim_c]
    if not ys or not xs:
        return None, mask, None
    # The top of the head, not of a spear or staff held above it: the first row
    # at least 4% of the picture wide. A shaft is a handful of pixels; a head
    # is that wide a few pixels below the crown.
    head = next((y for y, v in enumerate(rows) if v > 255 * 0.04), ys[0])
    return (xs[0], ys[0], xs[-1] + 1, ys[-1] + 1), mask, head


def body_centre(mask, box):
    """Horizontal centre of the head and shoulders (top 40% of the figure)."""
    x0, y0, x1, y1 = box
    top = mask.crop((x0, y0, x1, y0 + max(1, int((y1 - y0) * 0.4))))
    cols = list(top.resize((x1 - x0, 1), Image.BOX).getdata())
    total = sum(cols)
    if not total:
        return (x0 + x1) / 2
    return x0 + sum(i * v for i, v in enumerate(cols)) / total


def fit(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    notes = []
    bg = corner_bg(im)
    if max(bg) > 60:
        notes.append(f'background is not dark ({bg}); the figure may not separate cleanly')
    dist = distance_map(im, bg)
    # As low as the background allows, so dark shoes on a clean background
    # still count as feet; a noisy one raises it so noise is not the figure.
    noise = noise_level(dist, w, h)
    box, mask, head = figure_box(dist, w, h, max(10, noise + 8))
    if noise > 24:
        notes.append(f'the background is uneven (it varies by up to {noise}); check the feet and head lines on the sheet')
    if not box:
        raise ValueError('no figure found')
    x0, y0, x1, y1 = box
    if head - y0 > (y1 - y0) * 0.03:
        notes.append('something thin sticks up above the head (a spear, a staff); the head was used as the top')
        y0 = head
    if y1 >= h - 1:
        notes.append('feet touch the bottom edge; they may be cut off in the source')
    if y0 <= 0:
        notes.append('the head touches the top edge; it may be cut off in the source')
    if x0 <= 0 or x1 >= w:
        notes.append('the figure touches a side edge')
    cx = body_centre(mask, box)

    s = FIG_H / (y1 - y0)
    # Too wide at that size (arms out, a prop): fit the width instead.
    half = max(cx - x0, x1 - cx)
    if half * s > W / 2 - SIDE:
        s = (W / 2 - SIDE) / half
        notes.append(f'scaled to fit the width, so it stands {round((y1 - y0) * s)} px tall instead of {FIG_H}')
    if s > 1.05:
        notes.append(f'source is small ({w}x{h}), enlarged {s:.1f}x and will look soft; use the full-size export')

    # Shift the tones so the source background lands exactly on #0B0B0B. The
    # figure keeps every shade: cutting it out by colour instead would eat
    # black clothes on a near-black background, along with their folds.
    lut = []
    for c in range(3):
        b, t = bg[c], BG[c]
        lut += [(round(v * t / b) if b else t) if v <= b else round(t + (v - b) * (255 - t) / (255 - b)) for v in range(256)]
    toned = im.point(lut)

    # The whole picture, scaled and placed. Its outer edge is background and
    # fades into the frame so no seam shows; the fade never reaches the figure.
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    big = toned.resize((sw, sh), Image.LANCZOS)
    mask = Image.new('L', (sw, sh), 255)
    feather = max(8, round(min(sw, sh) * 0.04))
    room = {'left': box[0] * s, 'right': (w - box[2]) * s, 'top': box[1] * s, 'bottom': (h - box[3]) * s}
    for side, space in room.items():
        n = int(min(feather, space * 0.8))
        if n < 1:
            continue
        ramp = Image.new('L', (sw, sh), 255)
        d = ImageDraw.Draw(ramp)
        for i in range(n):
            v = round(255 * i / n)
            if side == 'left':
                d.line([(i, 0), (i, sh)], fill=v)
            elif side == 'right':
                d.line([(sw - 1 - i, 0), (sw - 1 - i, sh)], fill=v)
            elif side == 'top':
                d.line([(0, i), (sw, i)], fill=v)
            else:
                d.line([(0, sh - 1 - i), (sw, sh - 1 - i)], fill=v)
        mask = ImageChops.darker(mask, ramp)

    out = Image.new('RGB', (W, H), BG)
    out.paste(big, (round(W / 2 - cx * s), round(FEET_Y - y1 * s)), mask)
    return out, {'source': f'{w}x{h}', 'bg': bg, 'scale': round(s, 3), 'notes': notes}


def save_small(img, path, full):
    """256 colours with dithering keeps a 512x768 render near the old sizes
    without banding the soft shading; the background stays exactly #0B0B0B."""
    if full:
        img.save(path, optimize=True)
        return
    q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    pal = q.getpalette()[:768]
    idx = q.getpixel((2, 2))
    pal[idx * 3:idx * 3 + 3] = list(BG)
    q.putpalette(pal)
    q.save(path, optimize=True)


def sheet(images, path):
    """All fitted avatars side by side, with the head and feet lines drawn in."""
    cw, ch = W // 2, H // 2
    rows = [[n for n in NAMES if n.startswith('avatar-m')], [n for n in NAMES if n.startswith('avatar-f')]]
    rows = [r for r in rows if any(n in images for n in r)]
    s = Image.new('RGB', (cw * 6 + 70, ch * len(rows) + 40), (24, 24, 24))
    d = ImageDraw.Draw(s)
    for ri, row in enumerate(rows):
        for ci, name in enumerate(row):
            x, y = 10 + ci * (cw + 10), 20 + ri * (ch + 0)
            if name in images:
                s.paste(images[name].resize((cw, ch), Image.LANCZOS), (x, y))
            d.text((x + 6, y + 6), name.replace('avatar-', ''), fill=(200, 200, 200))
        top, feet = 20 + ri * ch + (FEET_Y - FIG_H) // 2, 20 + ri * ch + FEET_Y // 2
        d.line([(0, top), (s.width, top)], fill=(255, 106, 0), width=1)
        d.line([(0, feet), (s.width, feet)], fill=(255, 106, 0), width=1)
    s.save(path)


def bump_avatar_version():
    p = os.path.join(APP, 'app.js')
    src = open(p, encoding='utf-8').read()
    m = re.search(r"const _AVATAR_V = '(\d+)';", src)
    if not m:
        print('  could not find _AVATAR_V in app.js; bump it by hand')
        return None
    new = str(int(m.group(1)) + 1)
    open(p, 'w', encoding='utf-8').write(src.replace(m.group(0), f"const _AVATAR_V = '{new}';", 1))
    return new


def main():
    ap = argparse.ArgumentParser(description='Fit avatars to the app frame.')
    ap.add_argument('source')
    ap.add_argument('--out', default=None, help='where to write (default ./avatars-fitted)')
    ap.add_argument('--install', action='store_true', help='write into the app folder and bump _AVATAR_V')
    ap.add_argument('--partial', action='store_true', help='with --install, allow fewer than all 12')
    ap.add_argument('--full', action='store_true', help='save full colour instead of 256 colours (bigger files)')
    args = ap.parse_args()

    found = find_sources(args.source)
    if not found:
        sys.exit(f'No avatar-m-1 ... avatar-f-6 images in {args.source}')
    # Half a new set in the app would mix two art styles between levels.
    if args.install and len(found) < len(NAMES) and not args.partial:
        missing = ', '.join(n for n in NAMES if n not in found)
        sys.exit(f'Not installing: {missing} missing. Run without --install to check them, or add --partial.')
    out_dir = APP if args.install else (args.out or os.path.join(os.getcwd(), 'avatars-fitted'))
    os.makedirs(out_dir, exist_ok=True)

    fitted, problems = {}, 0
    for name in NAMES:
        if name not in found:
            print(f'{name}: missing, skipped')
            continue
        try:
            img, info = fit(found[name])
        except Exception as e:
            print(f'{name}: FAILED, {e}')
            problems += 1
            continue
        dst = os.path.join(out_dir, name + '.png')
        save_small(img, dst, args.full)
        fitted[name] = img
        print(f"{name}: from {info['source']}, background {info['bg']}, scale {info['scale']}, {os.path.getsize(dst) // 1024} KB")
        for n in info['notes']:
            print(f'    note: {n}')

    # The check sheet never goes into the app folder.
    sheet_dir = (args.out or os.path.join(os.getcwd(), 'avatars-fitted')) if args.install else out_dir
    os.makedirs(sheet_dir, exist_ok=True)
    sheet_path = os.path.join(sheet_dir, 'check-sheet.png')
    sheet(fitted, sheet_path)
    print(f'\n{len(fitted)} fitted into {out_dir}')
    print(f'Check sheet: {sheet_path} (every head on the top line, every pair of feet on the bottom one)')
    if args.install and fitted:
        v = bump_avatar_version()
        if v:
            print(f"_AVATAR_V is now '{v}'. Bump ?v= in index.html and CACHE in service-worker.js before pushing.")
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
