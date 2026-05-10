#!/usr/bin/env python3
"""Generate color variants of the Arete logo using only PIL."""
from PIL import Image, ImageChops
import os

src = Image.open('/Users/steinicke/Downloads/ChatGPT Image May 9, 2026 at 11_33_06 PM.png').convert('RGBA')

# Get grayscale mask from source (black logo on white bg)
gray = src.convert('L')  # 0=black(logo), 255=white(bg)
# Invert: logo=white(255), bg=black(0)
logo_mask = Image.eval(gray, lambda x: 255 - x)

out_dir = '/Users/steinicke/Documents/ANDET/APP/variants'
os.makedirs(out_dir, exist_ok=True)

variants = {
    'gold_on_dark':     ((196, 169, 108), (13, 11, 8)),
    'gold_on_navy':     ((196, 169, 108), (26, 28, 44)),
    'white_on_dark':    ((255, 255, 255), (13, 11, 8)),
    'cream_on_dark':    ((235, 220, 185), (13, 11, 8)),
    'black_on_cream':   ((30, 25, 20),    (240, 235, 225)),
    'gold_on_black':    ((196, 169, 108), (0, 0, 0)),
    'bronze_on_dark':   ((180, 140, 90),  (20, 18, 15)),
    'silver_on_dark':   ((190, 195, 200), (18, 20, 25)),
}

w, h = src.size

for name, (logo_rgb, bg_rgb) in variants.items():
    # Create solid color layers
    logo_layer = Image.new('RGB', (w, h), logo_rgb)
    bg_layer = Image.new('RGB', (w, h), bg_rgb)

    # Composite: where mask is white (logo), use logo_layer; where black (bg), use bg_layer
    result = Image.composite(logo_layer, bg_layer, logo_mask)
    result = result.resize((512, 512), Image.LANCZOS)
    result.save(f'{out_dir}/{name}.png')

print(f"Generated {len(variants)} variants in {out_dir}")
