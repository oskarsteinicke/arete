#!/usr/bin/env python3
"""Upscale logo assets to high res with crisp edges."""
from PIL import Image, ImageFilter
import os

out_dir = '/Users/steinicke/Documents/ANDET/APP/variants'
gold = (196, 169, 108)
dark = (13, 11, 8)
TARGET = 2048  # upscale to 2048px, then we can downscale to any size crisply

def upscale_crisp(src_path, out_path, logo_color, bg_color, invert_mask=False, crop_right=0):
    """Upscale a logo image with clean, sharp edges."""
    img = Image.open(src_path).convert('L')

    # Crop right edge bleed if needed
    if crop_right > 0:
        img = img.crop((0, 0, img.width - crop_right, img.height))

    # Make it square by padding
    w, h = img.size
    size = max(w, h)
    square = Image.new('L', (size, size), 255 if not invert_mask else 0)
    paste_x = (size - w) // 2
    paste_y = (size - h) // 2
    square.paste(img, (paste_x, paste_y))

    # Upscale to target with LANCZOS
    big = square.resize((TARGET, TARGET), Image.LANCZOS)

    # Create mask
    if invert_mask:
        # Light parts = logo
        mask = big
    else:
        # Dark parts = logo
        mask = Image.eval(big, lambda x: 255 - x)

    # Sharpen the mask edges: threshold to remove fuzzy anti-aliasing artifacts
    # Use a slight blur first to smooth, then threshold for clean edges
    mask_smooth = mask.filter(ImageFilter.GaussianBlur(radius=1))
    # Threshold: anything above 40 becomes fully logo, below becomes fully bg
    mask_clean = Image.eval(mask_smooth, lambda x: 255 if x > 40 else 0)

    # Apply slight anti-aliasing back (just 0.5px blur for smooth edges)
    mask_final = mask_clean.filter(ImageFilter.GaussianBlur(radius=0.8))

    # Composite
    logo_layer = Image.new('RGB', (TARGET, TARGET), logo_color)
    bg_layer = Image.new('RGB', (TARGET, TARGET), bg_color)
    result = Image.composite(logo_layer, bg_layer, mask_final)

    result.save(out_path, quality=95)
    print(f"  {os.path.basename(out_path)}: {result.size}")
    return result

print("Upscaling to 2048x2048 with crisp edges...\n")

# 1. Main A mark
r1 = upscale_crisp(f'{out_dir}/main_a_mark.png', f'{out_dir}/hq_main_a_mark.png',
                    gold, dark, invert_mask=False)

# 2. Horizontal lockup
r2 = upscale_crisp(f'{out_dir}/a_gold_on_black.png', f'{out_dir}/hq_a_horizontal.png',
                    gold, dark, invert_mask=True, crop_right=12)

# 3. Circle dark
r3 = upscale_crisp(f'{out_dir}/a_circle_dark.png', f'{out_dir}/hq_a_circle_dark.png',
                    gold, dark, invert_mask=True, crop_right=10)

# 4. Circle (was light, now gold on dark)
r4 = upscale_crisp(f'{out_dir}/a_circle_light.png', f'{out_dir}/hq_a_circle_light.png',
                    gold, dark, invert_mask=False)

# Generate app icons from #3
print("\nGenerating app icons from circle dark...")
icon512 = r3.resize((512, 512), Image.LANCZOS)
icon512.save('/Users/steinicke/Documents/ANDET/APP/icon-512.png')
icon192 = r3.resize((192, 192), Image.LANCZOS)
icon192.save('/Users/steinicke/Documents/ANDET/APP/icon-192.png')
print("  icon-512.png and icon-192.png saved")
