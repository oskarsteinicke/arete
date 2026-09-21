# Reduce the character art to the logo's palette: ivory and gold on black.
#
#   python3 native/restyle-avatars.py <source.png> <out.png>
#
# The logo is a white letterform on near-black. The illustrated character set
# arrived in full colour, so the two read as different products sitting next to
# each other. This maps every pixel's luminance through a four-stop ramp, which
# keeps the drawing's form and shading while putting the whole set on the two
# brand colours.
#
# Desaturating instead would give grey skin and grey cloth — a faded photograph
# rather than a designed mark. The ramp is what makes it read as intentional.
#
# The sources are the full-colour PNGs as committed in 3558fd1; the files in
# the app root have already been through this, so do not run it on them twice.
import sys
from PIL import Image

BLACK = (0x00, 0x00, 0x00)
GOLD_D = (0x6b, 0x4c, 0x27)
GOLD = (0xb8, 0x87, 0x4a)
IVORY = (0xf2, 0xf1, 0xee)

STOPS = [(0.00, BLACK), (0.22, GOLD_D), (0.62, GOLD), (1.00, IVORY)]

def build_lut(stops):
    lut = []
    for i in range(256):
        t = i / 255
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1 or t1 == 1.0:
                f = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                f = max(0.0, min(1.0, f))
                lut.append(tuple(round(a + (b - a) * f) for a, b in zip(c0, c1)))
                break
    return lut

def restyle(src, dst, stops=STOPS):
    im = Image.open(src).convert('RGB')
    lut = build_lut(stops)
    out = Image.new('RGB', im.size)
    px, op = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            l = int(0.2126 * r + 0.7152 * g + 0.0722 * b)
            op[x, y] = lut[l]
    # Palette mode keeps these small; the art is flat enough to survive it.
    out.convert('P', palette=Image.ADAPTIVE, colors=128).save(dst, optimize=True)

if __name__ == '__main__':
    restyle(sys.argv[1], sys.argv[2])
