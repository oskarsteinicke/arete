#!/usr/bin/env python3
"""Recolor all 4 brand assets — fix #4 colors and crop bleed on #2/#3."""
from PIL import Image
import os

out_dir = '/Users/steinicke/Documents/ANDET/APP/variants'
gold = (196, 169, 108)   # #c4a96c
dark = (13, 11, 8)       # #0d0b08
cream = (240, 235, 225)

def recolor(src_path, logo_color, bg_color, invert_mask=False):
    """Recolor image. invert_mask=True for dark-bg sources where logo is lighter."""
    img = Image.open(src_path).convert('L')
    if invert_mask:
        # Light parts = logo, dark parts = bg
        mask = img
    else:
        # Dark parts = logo, light parts = bg
        mask = Image.eval(img, lambda x: 255 - x)
    logo_layer = Image.new('RGB', img.size, logo_color)
    bg_layer = Image.new('RGB', img.size, bg_color)
    return Image.composite(logo_layer, bg_layer, mask)

# 1. Main A mark — black on white source → gold on dark
r1 = recolor(f'{out_dir}/main_a_mark.png', gold, dark, invert_mask=False)
r1.save(f'{out_dir}/final_main_a_mark.png')
print(f"1. Main A mark: {r1.size}")

# 2. Horizontal lockup — light logo on dark source, crop right edge bleed
img2 = Image.open(f'{out_dir}/a_gold_on_black.png')
# Crop ~10px off right side to remove golden line bleed
img2_cropped = img2.crop((0, 0, img2.width - 12, img2.height))
img2_cropped.save(f'{out_dir}/a_gold_on_black_cropped.png')
r2 = recolor(f'{out_dir}/a_gold_on_black_cropped.png', gold, dark, invert_mask=True)
r2.save(f'{out_dir}/final_a_horizontal.png')
print(f"2. Horizontal lockup: {r2.size}")

# 3. Circle dark — light logo on dark source, crop right edge bleed
img3 = Image.open(f'{out_dir}/a_circle_dark.png')
img3_cropped = img3.crop((0, 0, img3.width - 10, img3.height))
img3_cropped.save(f'{out_dir}/a_circle_dark_cropped.png')
r3 = recolor(f'{out_dir}/a_circle_dark_cropped.png', gold, dark, invert_mask=True)
r3.save(f'{out_dir}/final_a_circle_dark.png')
print(f"3. Circle dark: {r3.size}")

# 4. Circle light — black on cream source → use matching dark brown on cream
r4 = recolor(f'{out_dir}/a_circle_light.png', dark, cream, invert_mask=False)
r4.save(f'{out_dir}/final_a_circle_light.png')
print(f"4. Circle light: {r4.size}")

# App icons from #3
icon512 = r3.resize((512, 512), Image.LANCZOS)
icon512.save('/Users/steinicke/Documents/ANDET/APP/icon-512.png')
icon192 = r3.resize((192, 192), Image.LANCZOS)
icon192.save('/Users/steinicke/Documents/ANDET/APP/icon-192.png')
print(f"\nApp icons updated")
