import cairosvg, os
os.makedirs("png", exist_ok=True)

DARK="#14532d"; MID="#16a34a"; LEAF="#22c55e"; LIGHT="#4ade80"; PALE="#86efac"

def wrap(inner, bg=True, size=384):
    bgrect = f'<rect width="200" height="200" rx="38" fill="{DARK}"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">
<defs>
<linearGradient id="gT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{PALE}"/><stop offset="1" stop-color="{LIGHT}"/></linearGradient>
<linearGradient id="gB" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{MID}"/><stop offset="1" stop-color="{LEAF}"/></linearGradient>
</defs>{bgrect}{inner}</svg>'''

# =====================================================================
# VARIANT D — Two-tone "S-leaf hands": one comma/hand-leaf shape with a
# pointed leaf tip + 3 finger ridges on its cupped (concave) edge.
# Duplicated rotated 180 about centre -> forms an S of two hands meeting.
# Top (pale, palm facing DOWN = giving) / bottom (green, facing UP = receiving)
# =====================================================================
# one hand-leaf, tip up-right, palm top-right, cupped underside w/ finger ridges
handleaf = ("M100,100 "
            "C92,78 98,52 122,42 "          # outer edge from centre up
            "C140,34 162,40 170,58 "         # over the palm knuckles
            "C176,72 174,86 164,94 "         # down outer right to tip base
            "L182,46 "                       # OUT to leaf tip
            "L150,92 "                       # back from tip
            # cupped inner edge with 3 finger ridges back toward centre:
            "C148,84 142,84 140,92 "
            "C138,84 132,84 130,92 "
            "C128,85 122,85 120,93 "
            "C113,99 106,100 100,100 Z")
D = f'''
<path d="{handleaf}" fill="url(#gT)"/>
<path d="{handleaf}" fill="url(#gB)" transform="rotate(180 100 100)"/>
<circle cx="100" cy="100" r="3.2" fill="{DARK}" opacity="0.35"/>
'''

# =====================================================================
# VARIANT E — Literal cupped hands cradling a sprout, forming an S.
# Top hand: palm facing DOWN giving (cup opens downward).
# Bottom hand: palm facing UP receiving (cup opens upward). Sprout between.
# =====================================================================
def cup(open_up=True):
    # a shallow cupped palm (bowl) with 4 finger tips on the rim + thumb
    if open_up:
        bowl = "M40,118 C40,150 160,150 160,118 C150,150 50,150 40,118 Z"
        # rim fingers (upward) + thumb
        fingers = "".join(
            f'<circle cx="{x}" cy="118" r="9" fill="url(#gB)"/>' for x in (62,86,110,134))
        thumb = '<ellipse cx="42" cy="124" rx="8" ry="13" fill="url(#gB)" transform="rotate(-25 42 124)"/>'
        palm = f'<path d="M40,118 C40,150 160,150 160,118 C158,134 42,134 40,118 Z" fill="url(#gB)"/>'
        return palm+fingers+thumb
    return ""
spr = ('<path d="M100,108 C100,92 100,78 100,66" stroke="'+DARK+'" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.0"/>'
       '<path d="M100,104 C88,96 80,80 86,66 C96,74 102,88 100,104 Z" fill="url(#gT)"/>'
       '<path d="M100,104 C112,96 120,80 114,66 C104,74 98,88 100,104 Z" fill="url(#gT)"/>')
E = f'''
<g transform="rotate(180 100 92)">{cup(True)}</g>
<g transform="translate(0,2)">{cup(True)}</g>
{spr}
'''

for name, inner in [("D", D), ("E", E)]:
    svg = wrap(inner); open(f"{name}.svg","w").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f"png/{name}.png")
print("done")
