import cairosvg, os

os.makedirs("png", exist_ok=True)

# Palette (matches app)
DARK   = "#14532d"
MID    = "#16a34a"
LEAF   = "#22c55e"
LIGHT  = "#4ade80"
PALE   = "#86efac"
CREAM  = "#dcfce7"

def wrap(inner, bg=True, size=192):
    bgrect = f'<rect width="200" height="200" rx="38" fill="{DARK}"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{LIGHT}"/><stop offset="1" stop-color="{MID}"/>
</linearGradient>
<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="{PALE}"/><stop offset="1" stop-color="{LEAF}"/>
</linearGradient>
</defs>
{bgrect}
{inner}
</svg>'''

# ---------------------------------------------------------------
# VARIANT A — "S-leaf": thick S stroke, leaf tips at both ends,
# central vein. Top curve cups down (giving), bottom cups up (receiving).
# ---------------------------------------------------------------
s_center = "M148,66 C148,44 120,38 100,52 C82,64 82,88 100,100 C118,112 118,138 100,150 C80,164 52,156 52,134"
A = f'''
<path d="{s_center}" fill="none" stroke="url(#g2)" stroke-width="34" stroke-linecap="round"/>
<!-- leaf tips -->
<path d="M148,66 C156,52 168,46 176,40 C172,52 166,64 154,72 Z" fill="{PALE}"/>
<path d="M52,134 C44,148 32,154 24,160 C28,148 34,136 46,128 Z" fill="{LEAF}"/>
<!-- vein -->
<path d="{s_center}" fill="none" stroke="{DARK}" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
'''

# ---------------------------------------------------------------
# VARIANT B — Two cupped hands forming S, with finger scallops.
# Each "hand" is a comma/leaf with 3 finger bumps on the cup side.
# Bottom hand = top hand rotated 180 about center (point symmetry => S).
# ---------------------------------------------------------------
hand = ("M100,100 C100,74 112,52 138,48 "
        "C158,45 174,58 172,78 "                      # palm / outer top
        "C171,90 163,98 152,99 "                      # finger 1
        "C156,93 156,86 150,84 C145,90 145,95 140,98 "# scallop
        "C144,92 143,85 137,84 C132,90 133,95 128,99 "# scallop
        "C132,93 131,86 125,85 C120,91 119,97 116,100 "# finger near center
        "C110,101 104,101 100,100 Z")
B = f'''
<path d="{hand}" fill="url(#g2)"/>
<path d="{hand}" fill="url(#g)" transform="rotate(180 100 100)"/>
<circle cx="100" cy="100" r="4" fill="{DARK}" opacity="0.3"/>
'''

# ---------------------------------------------------------------
# VARIANT C — Bold S = two leaf halves split by vein, palm-cup hint.
# Outer silhouette reads as a single leaf/fruit; the S split + two
# pointed tips give the giving/receiving read.
# ---------------------------------------------------------------
top = ("M100,98 C96,70 108,44 138,42 C162,40 178,56 174,80 "
       "C171,98 156,108 134,108 C118,108 108,104 100,98 Z")
bot = ("M100,102 C104,130 92,156 62,158 C38,160 22,144 26,120 "
       "C29,102 44,92 66,92 C82,92 92,96 100,102 Z")
C = f'''
<path d="{top}" fill="url(#g)"/>
<path d="{bot}" fill="url(#g2)"/>
<!-- leaf tips -->
<path d="M138,42 C150,30 162,26 172,22 C168,34 160,44 150,50 Z" fill="{PALE}"/>
<path d="M62,158 C50,170 38,174 28,178 C32,166 40,156 50,150 Z" fill="{MID}"/>
<!-- center vein curving through both -->
<path d="M150,52 C120,66 116,86 110,100 C104,114 100,134 70,148"
      fill="none" stroke="{DARK}" stroke-width="3.5" opacity="0.4" stroke-linecap="round"/>
'''

for name, inner in [("A", A), ("B", B), ("C", C)]:
    svg = wrap(inner)
    open(f"{name}.svg", "w").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f"png/{name}.png", output_width=384, output_height=384)
    # also on white to judge silhouette
    cairosvg.svg2png(bytestring=wrap(inner, bg=False).encode(), write_to=f"png/{name}_nobg.png", output_width=384, output_height=384)

print("done")
