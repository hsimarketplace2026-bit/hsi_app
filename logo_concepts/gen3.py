import cairosvg, os
os.makedirs("png", exist_ok=True)
DARK="#14532d"; MID="#16a34a"; LEAF="#22c55e"; LIGHT="#4ade80"; PALE="#86efac"

def wrap(inner, size=384):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">
<defs>
<linearGradient id="gT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{PALE}"/><stop offset="1" stop-color="{LIGHT}"/></linearGradient>
<linearGradient id="gB" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{MID}"/><stop offset="1" stop-color="{LEAF}"/></linearGradient>
</defs><rect width="200" height="200" rx="38" fill="{DARK}"/>{inner}</svg>'''

# =====================================================================
# VARIANT F — smooth comma "hand-leaf": pointed leaf TIP + rounded PALM
# with a THUMB nub; fingers/veins drawn as thin dark incision lines
# (also read as leaf veins). Point-symmetric pair = clean S.
# Top pale = giving (palm down) / bottom green = receiving (palm up).
# =====================================================================
# smooth comma leaf: centre(100,100) -> palm(right) -> pointed tip(top)
leaf = ("M100,100 "
        "C93,73 104,46 132,41 "
        "C150,38 168,44 174,40 "         # approach to tip
        "C171,55 162,66 153,76 "         # pointed tip region
        "C146,93 126,104 112,102 "       # outer down to thumb area
        "C108,101 103,101 100,100 Z")
thumb = "M112,102 C118,108 116,116 108,116 C104,112 105,105 112,102 Z"
# finger / vein incision lines fanning from palm toward the rim
veins = "".join(
    f'<path d="{d}" stroke="{DARK}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.42"/>'
    for d in [
        "M120,98 C134,86 146,74 156,62",   # main vein toward tip
        "M118,99 C128,92 136,88 144,86",   # finger 1
        "M122,96 C134,90 144,86 152,80",   # finger 2
    ])
hand = f'<path d="{leaf}"/><path d="{thumb}"/>'
F = f'''
<g fill="url(#gT)">{hand}</g><g transform="rotate(180 100 100)"><g fill="url(#gT)">{hand}</g></g>
<g fill="none">{veins}</g>
<g transform="rotate(180 100 100)"><g fill="none">{veins}</g></g>
'''
# recolor bottom copy green: redo explicitly for two-tone
F = f'''
<g fill="url(#gT)"><path d="{leaf}"/><path d="{thumb}"/></g>
<g fill="none">{veins}</g>
<g transform="rotate(180 100 100)">
  <g fill="url(#gB)"><path d="{leaf}"/><path d="{thumb}"/></g>
  <g fill="none">{veins}</g>
</g>
'''

# =====================================================================
# VARIANT G — bold S, two-tone halves, pointed leaf tips, ONE thumb each,
# NO finger lines (cleanest / most icon-like). Hands implied by thumbs.
# =====================================================================
sc = "M150,64 C150,44 122,40 104,52 C84,66 86,90 100,100 C114,110 116,134 96,146 C78,156 52,152 52,132"
G = f'''
<path d="M100,100 C100,72 116,46 150,64 C156,50 168,46 178,42 C174,56 168,66 158,74 C150,90 124,100 100,100 Z" fill="url(#gT)"/>
<path d="M100,100 C100,128 84,154 50,136 C44,150 32,154 22,158 C26,144 32,134 42,126 C50,110 76,100 100,100 Z" fill="url(#gB)"/>
<ellipse cx="120" cy="86" rx="9" ry="13" fill="url(#gT)" transform="rotate(35 120 86)"/>
<ellipse cx="80" cy="114" rx="9" ry="13" fill="url(#gB)" transform="rotate(35 80 114)"/>
<path d="M150,66 C124,78 116,90 108,100" stroke="{DARK}" stroke-width="3" fill="none" opacity="0.4" stroke-linecap="round"/>
<path d="M50,134 C76,122 84,110 92,100" stroke="{DARK}" stroke-width="3" fill="none" opacity="0.4" stroke-linecap="round"/>
'''

for name, inner in [("F", F), ("G", G)]:
    svg = wrap(inner); open(f"{name}.svg","w").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f"png/{name}.png")
print("done")
