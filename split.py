#!/usr/bin/env python3
"""Split branding sheet into 4 clean crops."""
from PIL import Image
import os

img = Image.open('/Users/steinicke/Downloads/ChatGPT Image May 9, 2026 at 03_02_25 PM.png')
w, h = img.size  # 1254 x 1254

out_dir = '/Users/steinicke/Documents/ANDET/APP/variants'
os.makedirs(out_dir, exist_ok=True)

# Horizontal split: bottom strip starts at y=868
# Vertical dividers in bottom strip: x=628, x=942

strip_top = 868

# 1. Main A mark (top section)
top = img.crop((0, 0, w, strip_top))
top.save(f'{out_dir}/main_a_mark.png')

# 2. Bottom left: gold A + text on black (x: 0 to 628)
bl = img.crop((0, strip_top, 628, h))
bl.save(f'{out_dir}/a_gold_on_black.png')

# 3. Bottom center: gold A in circle on dark (x: 628 to 942)
bc = img.crop((628, strip_top, 942, h))
bc.save(f'{out_dir}/a_circle_dark.png')

# 4. Bottom right: dark A in circle on cream (x: 942 to end)
br = img.crop((942, strip_top, w, h))
br.save(f'{out_dir}/a_circle_light.png')

print("Done! Clean crops saved.")
for f in ['main_a_mark.png', 'a_gold_on_black.png', 'a_circle_dark.png', 'a_circle_light.png']:
    im = Image.open(f'{out_dir}/{f}')
    print(f'  {f}: {im.size}')
