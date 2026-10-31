# The landing page's background tile: pixel-art sprites (a Bangladeshi farmer in a mathal hat and a checked lungi with
# a sickle, a button phone, a satellite, a rice plant, a paddy sheaf, a few twinkles) on a transparent 420 px tile.
# Each sprite is an ASCII grid; runs of one colour on a row become one <rect>. The whole tile is drawn at low opacity.
# Run from the repository root: python apps/saao-dashboard/tools/pixel_pattern.py apps/saao-dashboard/public/img/pattern-pixel.svg
import sys

PX = 3  # one sprite pixel, in CSS pixels
TILE = 420
OPACITY = 0.06

COL = {
    'k': '#1F2B2A',  # ink
    't': '#0B4A4F',  # teal
    'g': '#5E8445',  # leaf
    'l': '#8DAA62',  # light leaf
    'y': '#D9A647',  # gold
    'o': '#B5701F',  # amber
    's': '#8A5A3C',  # skin
    'w': '#F4EEDF',  # cream
    'b': '#2C5E86',  # blue
    'r': '#B4483C',  # red check
    'h': '#C89B55',  # straw hat
    'm': '#8A9094',  # metal
}

FARMER = """
.......hhhh.......
.....hhhhhhhh.....
...hhhhhhhhhhhh...
.hhhhhhhhhhhhhhhh.
......ssssss......
......skssks......
......ssssss......
.......ssss.......
.....wwwwwwww.....
....swwwwwwwws....
...ss.wwwwww.ss...
...s..wwwwww..s.m.
..ss..wwwwww..smm.
..s...rbrbrb..s.m.
..s...brbrbr...mm.
..yy..rbrbrb...m..
.yyyy.brbrbr......
..yy..rbrbrb......
.......s..s.......
.......s..s.......
......ss..ss......
"""

PHONE = """
...tttttttt...
..tttttttttt..
..ttttkkkttt..
..ttwwwwwwtt..
..ttwbbbbwtt..
..ttwbbbbwtt..
..ttwbbbbwtt..
..ttwwwwwwtt..
..tttttttttt..
..ttt.ww.ttt..
..tttttttttt..
..twwtwwtwwt..
..tttttttttt..
..twwtwwtwwt..
..tttttttttt..
..twwtwwtwwt..
..tttttttttt..
..twwtwwtwwt..
..tttttttttt..
...tttttttt...
"""

SATELLITE = """
...........m...........
..........mmm..........
...........m...........
bbbbbbbb..yyyyy..bbbbbbbb
bwbwbwbw..yyyyy..bwbwbwbw
bbbbbbbbmmyyyyymmbbbbbbbb
bwbwbwbw..yyyyy..bwbwbwbw
bbbbbbbb..ooooo..bbbbbbbb
"""

RICE = """
....y.....y....
...y.y...y.y...
..y...y.y...y..
.y.....g.....y.
y......g......y
...l...g...l...
...l...g...l...
....l..g..l....
....l..g..l....
.g...l.g.l...g.
..g..lggg l.g..
...g..ggg..g...
....g.ggg.g....
.....ggggg.....
......ggg......
....ttttttt....
"""

SHEAF = """
..y.y..y..y.y..
.y.y.yyyyy.y.y.
..yyyyyyyyyyy..
...yyyyyyyyy...
....yyyyyyy....
.....yyyyy.....
.....ooooo.....
.....yyyyy.....
....yyyyyyy....
...yyyyyyyyy...
..yyyyyyyyyyy..
.yyyyyyyyyyyyy.
"""

TWINKLE = """
.y.
yyy
.y.
"""

DOT = """
t
"""

def flip(art):
    return '\n'.join(row[::-1] for row in art.strip('\n').split('\n'))

def sprite(art, x0, y0, px=PX):
    out = []
    for r, row in enumerate(art.strip('\n').split('\n')):
        c = 0
        while c < len(row):
            ch = row[c]
            if ch in COL:
                n = 1
                while c + n < len(row) and row[c + n] == ch:
                    n += 1
                out.append(f'<rect x="{x0 + c * px}" y="{y0 + r * px}" width="{n * px}" height="{px}" fill="{COL[ch]}"/>')
                c += n
            else:
                c += 1
    return ''.join(out)

parts = [
    sprite(FARMER, 26, 30),
    sprite(SATELLITE, 214, 22),
    sprite(PHONE, 336, 128),
    sprite(RICE, 150, 150),
    sprite(SHEAF, 40, 252),
    sprite(flip(FARMER), 252, 270),
    sprite(flip(SATELLITE), 96, 372, 2),
    sprite(PHONE, 196, 320, 2),
    sprite(RICE, 352, 330, 2),
    sprite(TWINKLE, 150, 58), sprite(TWINKLE, 360, 30), sprite(TWINKLE, 120, 236), sprite(TWINKLE, 300, 220),
    sprite(TWINKLE, 20, 180), sprite(TWINKLE, 404, 400 - 6),
    sprite(DOT, 90, 120, 4), sprite(DOT, 250, 120, 4), sprite(DOT, 210, 260, 4), sprite(DOT, 330, 300, 4), sprite(DOT, 60, 400, 4),
]
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{TILE}" height="{TILE}" viewBox="0 0 {TILE} {TILE}" shape-rendering="crispEdges">'
       f'<g opacity="{OPACITY}">{"".join(parts)}</g></svg>\n')
out = sys.argv[1]
open(out, 'w', encoding='utf-8', newline='\n').write(svg)
print(len(svg), 'bytes')
