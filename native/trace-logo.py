"""Trace a flat two-tone raster mark into an SVG path.

The source is a JPEG, the worst container for a hard-edged two-colour shape: it
rings along every edge. Threshold at the midpoint so the ringing falls to the
correct side, then extract the exact boundary between inside and outside pixels
and simplify it. No curve fitting — at icon sizes a simplified polyline is
visually identical and avoids the wobble a bad fit introduces.
"""
import sys
from PIL import Image
from collections import defaultdict

def mask_from(path, size, thresh=128):
    im = Image.open(path).convert('L').resize((size, size), Image.LANCZOS)
    px = im.load()
    return [[1 if px[x, y] >= thresh else 0 for x in range(size)] for y in range(size)], size

def boundary_edges(m, n):
    """Every lattice edge separating an inside cell from an outside one."""
    E = []
    at = lambda x, y: m[y][x] if 0 <= x < n and 0 <= y < n else 0
    for y in range(n):
        for x in range(n):
            if not at(x, y): continue
            if not at(x - 1, y): E.append(((x, y), (x, y + 1)))         # left
            if not at(x + 1, y): E.append(((x + 1, y + 1), (x + 1, y))) # right
            if not at(x, y - 1): E.append(((x + 1, y), (x, y)))         # top
            if not at(x, y + 1): E.append(((x, y + 1), (x + 1, y + 1))) # bottom
    return E

def loops_from(edges):
    """Chain directed edges into closed loops."""
    nxt = defaultdict(list)
    for a, b in edges: nxt[a].append(b)
    out = []
    while nxt:
        start = next(iter(nxt))
        loop, cur = [start], start
        while True:
            opts = nxt.get(cur)
            if not opts:
                break
            nx = opts.pop()
            if not opts: del nxt[cur]
            loop.append(nx)
            cur = nx
            if cur == start: break
        if len(loop) > 8: out.append(loop)
    return out

def rdp(pts, eps):
    """Douglas-Peucker, iterative so long contours cannot blow the stack."""
    n = len(pts)
    if n < 3: return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1: continue
        x1, y1 = pts[i]; x2, y2 = pts[j]
        dx, dy = x2 - x1, y2 - y1
        den = (dx * dx + dy * dy) ** 0.5
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if den == 0:
                d = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / den
            if d > worst: worst, wi = d, k
        if worst > eps:
            keep[wi] = True
            stack.append((i, wi)); stack.append((wi, j))
    return [pts[i] for i in range(n) if keep[i]]

def rdp_closed(loop, eps):
    """Douglas-Peucker on a closed ring.

    Run directly on a ring, the baseline from first point to last is
    zero-length — they are the same point — so every distance measures zero and
    the whole contour collapses to two points. Cut the ring at two far-apart
    vertices first and simplify each arc as an open polyline.
    """
    pts = loop[:-1] if len(loop) > 1 and loop[0] == loop[-1] else loop[:]
    if len(pts) < 4: return pts
    a = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0]-a[0])**2 + (pts[i][1]-a[1])**2)
    first = rdp(pts[:far + 1], eps)
    second = rdp(pts[far:] + [pts[0]], eps)
    return first[:-1] + second[:-1]

def to_path(pts, s, corner_deg=58):
    """Emit a smooth closed path from a simplified ring.

    Quadratic midpoint smoothing: the midpoint of each segment is an on-curve
    point and the shared vertex is its control point. That follows the polygon
    closely while removing the faceting a plain polyline shows at size.

    Corners are exempt. This mark has genuine points — the two tips at the feet
    and the one where the crossbar meets the stem — and smoothing every vertex
    would round them off into mush.
    """
    import math
    n = len(pts)
    if n < 3: return ''
    P = [(x * s, y * s) for x, y in pts]
    def mid(a, b): return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    def sharp(i):
        a, b, c = P[(i - 1) % n], P[i], P[(i + 1) % n]
        v1 = (b[0] - a[0], b[1] - a[1]); v2 = (c[0] - b[0], c[1] - b[1])
        m1 = math.hypot(*v1); m2 = math.hypot(*v2)
        if m1 == 0 or m2 == 0: return False
        cosang = max(-1.0, min(1.0, (v1[0]*v2[0] + v1[1]*v2[1]) / (m1 * m2)))
        return math.degrees(math.acos(cosang)) > corner_deg
    start = mid(P[-1], P[0])
    d = [f'M{start[0]:.2f},{start[1]:.2f}']
    for i in range(n):
        nxt = mid(P[i], P[(i + 1) % n])
        if sharp(i):
            d.append(f'L{P[i][0]:.2f},{P[i][1]:.2f}')
            d.append(f'L{nxt[0]:.2f},{nxt[1]:.2f}')
        else:
            d.append(f'Q{P[i][0]:.2f},{P[i][1]:.2f} {nxt[0]:.2f},{nxt[1]:.2f}')
    d.append('Z')
    return ''.join(d)

def main(src, out, size=1440, eps=0.7, vb=1024):
    m, n = mask_from(src, size)
    loops = loops_from(boundary_edges(m, n))
    loops.sort(key=len, reverse=True)
    s = vb / n
    paths, sizes = [], []
    for lp in loops:
        simp = rdp_closed(lp, eps)
        if len(simp) < 4: continue
        paths.append(to_path(simp, s)); sizes.append(len(simp))
    body = ''.join(paths)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}">'
           f'<path fill="currentColor" fill-rule="evenodd" d="{body}"/></svg>')
    open(out, 'w').write(svg)
    print(f'  contours: {len(paths)}  vertices: {sizes}')
    print(f'  svg: {len(svg)} bytes')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
