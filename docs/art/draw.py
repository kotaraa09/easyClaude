"""Draws the Mellu.mate README pictures as SVG: the hero, the divider and the logo.

Usage: python docs/art/draw.py <out-dir>
render.sh turns the SVG files into the PNG files in docs/assets/.
Every object and letter is a hand-written shape, so each object has its real form
and the name is real lettering, not AI text.
"""
import math
import os
import sys

P = {  # pastel palette: (light, deep)
    'pink': ('#F9C6D3', '#EFA3B8'), 'mint': ('#BDE8D8', '#8FD3BB'),
    'butter': ('#FCE7AE', '#F2CB6B'), 'sky': ('#C7DDF7', '#97BFEC'),
    'lilac': ('#DDD0F4', '#B8A3E8'), 'peach': ('#FBD5BC', '#F3B087'),
}
INK = '#8F88AE'      # soft lavender grey, for eyes and fine detail
THEMES = {  # paper, grid lines, sticker shadow
    'light': ('#FFFAF2', '#E3ECF7', '#B8B0D8', '0.35'),
    'dark': ('#272433', '#353148', '#0E0C16', '0.55'),
}
PAPER, GRID = THEMES['light'][:2]
STEEL = '#E7E4F2'

FILTER = '''<filter id="sticker" x="-30%" y="-30%" width="160%" height="160%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="{r}" result="d"/>
  <feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>
  <feGaussianBlur in="d" stdDeviation="5" result="b"/><feOffset in="b" dy="5" result="bo"/>
  <feFlood flood-color="{shadow}" flood-opacity="{opacity}"/><feComposite in2="bo" operator="in" result="s"/>
  <feMerge><feMergeNode in="s"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>'''


def filt(r, theme='light'):
    _, _, shadow, opacity = THEMES[theme]
    return FILTER.format(r=r, shadow=shadow, opacity=opacity)


def face(x=0, y=0, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<circle cx="-9" cy="0" r="3.4" fill="{INK}"/><circle cx="9" cy="0" r="3.4" fill="{INK}"/>'
            f'<ellipse cx="-16" cy="7" rx="5" ry="3" fill="{P["pink"][1]}" opacity=".7"/>'
            f'<ellipse cx="16" cy="7" rx="5" ry="3" fill="{P["pink"][1]}" opacity=".7"/>'
            f'<path d="M-4 5 Q0 9 4 5" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/></g>')


# Each object is drawn around (0, 0), about 120 px across.
def pencil(f):
    b, bd = P['butter']
    return (f'<g transform="rotate(-35)"><rect x="-22" y="-64" width="44" height="22" rx="10" fill="{P["pink"][0]}"/>'
            f'<rect x="-22" y="-48" width="44" height="14" fill="{P["lilac"][1]}"/>'
            f'<rect x="-22" y="-36" width="44" height="66" fill="{b}"/><rect x="-7" y="-36" width="14" height="66" fill="{bd}"/>'
            f'<path d="M-22 30 L22 30 L0 66 Z" fill="{P["peach"][0]}"/><path d="M-7 54 L7 54 L0 66 Z" fill="{INK}"/>'
            + (face(0, -4, .8) if f else '') + '</g>')


def eraser(f):
    return (f'<g transform="rotate(12)"><rect x="-50" y="-26" width="100" height="52" rx="14" fill="{P["sky"][0]}"/>'
            f'<path d="M-36 -26 H-6 V26 H-36 Q-50 26 -50 12 V-12 Q-50 -26 -36 -26 Z" fill="{P["pink"][0]}"/>'
            + (face(22, -2, .8) if f else '') + '</g>')


def tape(f):
    m, md = P['mint']
    return (f'<g><path d="M10 38 L72 46 L68 62 L4 54 Z" fill="{m}"/>'
            f'<circle r="48" fill="{m}"/><circle r="40" fill="none" stroke="{md}" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/>'
            f'<circle r="22" fill="{PAPER}"/><circle r="22" fill="none" stroke="{md}" stroke-width="5"/></g>')


def clip(f):
    return (f'<g transform="rotate(-20)"><path d="M-8 -36 V36 A12 12 0 0 0 16 36 V-46 A21 21 0 0 0 -26 -46 V34 A30 30 0 0 0 34 34 V-24" '
            f'fill="none" stroke="{P["sky"][1]}" stroke-width="7" stroke-linecap="round"/></g>')


def note(f):
    b, bd = P['butter']
    return (f'<g transform="rotate(-8)"><path d="M-46 -46 H46 V22 L22 46 H-46 Z" fill="{b}"/>'
            f'<path d="M46 22 L22 22 L22 46 Z" fill="{bd}"/><rect x="-46" y="-46" width="92" height="12" fill="{bd}" opacity=".55"/>'
            + (face(-4, 4) if f else '') + '</g>')


def ruler(f):
    m, md = P['peach']
    ticks = ''.join(f'<rect x="{-62 + i * 12}" y="-18" width="3" height="{14 if i % 2 == 0 else 8}" rx="1.5" fill="{md}"/>'
                    for i in range(11))
    return f'<g transform="rotate(18)"><rect x="-70" y="-18" width="140" height="36" rx="8" fill="{m}"/>{ticks}</g>'


def pushpin(f):
    return (f'<g transform="rotate(25)"><path d="M0 18 V60" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
            f'<rect x="-26" y="8" width="52" height="13" rx="6.5" fill="{P["lilac"][1]}"/>'
            f'<rect x="-13" y="-22" width="26" height="32" fill="{P["lilac"][0]}"/>'
            f'<rect x="-24" y="-40" width="48" height="20" rx="10" fill="{P["lilac"][1]}"/></g>')


def scissors(f):
    sd = P['sky'][1]
    return (f'<g transform="rotate(-12)">'
            f'<path d="M-5 10 L50 -50 Q56 -50 56 -44 L5 14 Z" fill="{STEEL}"/>'
            f'<path d="M5 10 L-50 -50 Q-56 -50 -56 -44 L-5 14 Z" fill="{STEEL}"/>'
            f'<path d="M-4 12 L-14 22" stroke="{sd}" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="M4 12 L14 22" stroke="{sd}" stroke-width="10" stroke-linecap="round"/>'
            f'<circle cx="-24" cy="36" r="16" fill="none" stroke="{sd}" stroke-width="10"/>'
            f'<circle cx="24" cy="36" r="16" fill="none" stroke="{sd}" stroke-width="10"/>'
            f'<circle cx="0" cy="10" r="4.5" fill="{INK}"/></g>')


def notebook(f):
    l, ld = P['lilac']
    rings = ''.join(f'<rect x="-50" y="{-42 + i * 20}" width="20" height="7" rx="3.5" fill="{INK}" opacity=".7"/>'
                    for i in range(5))
    return (f'<g transform="rotate(10)"><rect x="-40" y="-54" width="88" height="108" rx="10" fill="{l}"/>'
            f'<rect x="-40" y="-54" width="16" height="108" fill="{ld}"/>'
            f'<rect x="-10" y="-36" width="46" height="18" rx="5" fill="{PAPER}"/>{rings}'
            + (face(13, 18) if f else '') + '</g>')


def highlighter(f):
    m, md = P['mint']
    return (f'<g transform="rotate(40)"><rect x="-17" y="-58" width="34" height="38" rx="10" fill="{md}"/>'
            f'<rect x="-20" y="-24" width="40" height="70" rx="12" fill="{m}"/>'
            f'<path d="M-12 44 H12 L7 62 H-7 Z" fill="{md}"/>'
            + (face(0, 10, .8) if f else '') + '</g>')


def glue(f):
    return (f'<g transform="rotate(-25)"><rect x="-22" y="-58" width="44" height="32" rx="10" fill="{P["peach"][1]}"/>'
            f'<rect x="-22" y="-24" width="44" height="80" rx="10" fill="{P["peach"][0]}"/>'
            f'<rect x="-22" y="2" width="44" height="22" fill="{P["butter"][0]}"/></g>')


def stamp(f):
    k, kd = P['pink']
    return (f'<g transform="rotate(-6)"><circle cx="0" cy="-40" r="20" fill="{kd}"/>'
            f'<rect x="-11" y="-26" width="22" height="30" fill="{k}"/>'
            f'<rect x="-44" y="2" width="88" height="26" rx="8" fill="{kd}"/>'
            f'<rect x="-40" y="28" width="80" height="12" rx="4" fill="{P["lilac"][0]}"/>'
            + (face(0, 15, .7) if f else '') + '</g>')


def sparkle(c, s=1):
    return f'<path transform="scale({s})" d="M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12 Z" fill="{c}"/>'


def heart(c, s=1):
    return (f'<path transform="scale({s})" d="M0 10 C-14 0 -12 -12 -4 -12 C-1 -12 0 -9 0 -8 '
            f'C0 -9 1 -12 4 -12 C12 -12 14 0 0 10 Z" fill="{c}"/>')


# Wordmark: monoline rounded letters on a 150-unit body (baseline y=150, x-height y=50).
W = 34


def glyphs():
    ex = 50 + 50 * math.cos(math.radians(40))
    ey = 100 + 50 * math.sin(math.radians(40))
    e = ('path', f'M0 100 H100 A50 50 0 1 0 {ex:.1f} {ey:.1f}', 100)
    return [
        ('M', 'pink', [('path', 'M0 150 V4 L50 86 L100 4 V150', 100)]),
        ('e', 'peach', [e]),
        ('l', 'butter', [('path', 'M0 0 V150', 0)]),
        ('l', 'mint', [('path', 'M0 0 V150', 0)]),
        ('u', 'sky', [('path', 'M0 50 V110 A40 40 0 0 0 80 110 V50 M80 110 V150', 80)]),
        ('.', 'lilac', [('dot', '', 0)]),
        ('m', 'pink', [('path', 'M0 150 V50 M0 82 A32 32 0 0 1 64 82 V150 M64 82 A32 32 0 0 1 128 82 V150', 128)]),
        ('a', 'mint', [('circle', '', 100), ('path', 'M100 50 V150', 100)]),
        ('t', 'sky', [('path', 'M20 8 V118 A32 32 0 0 0 52 150 M0 55 H58', 58)]),
        ('e', 'lilac', [e]),
    ]


def wordmark():
    """Returns (svg, width) with the left stroke edge at x=0."""
    x, out = W / 2, []
    for ch, col, parts in glyphs():
        width = max(p[2] for p in parts)
        c = P[col][1]
        for kind, d, _ in parts:
            if kind == 'path':
                out.append(f'<path transform="translate({x} 0)" d="{d}" fill="none" stroke="{c}" '
                           f'stroke-width="{W}" stroke-linecap="round" stroke-linejoin="round"/>')
            elif kind == 'circle':
                out.append(f'<circle cx="{x + 50}" cy="100" r="50" fill="none" stroke="{c}" stroke-width="{W}"/>')
            else:
                out.append(f'<circle cx="{x}" cy="146" r="21" fill="{c}"/>')
        last = x + width
        x += width + W + (16 if ch in 'l.' else 26)
    return '\n'.join(out), last + W / 2


def grid(w, h, step=32, theme='light'):
    paper, lines_c = THEMES[theme][:2]
    lines = ''.join(f'<path d="M{i} 0 V{h}"/>' for i in range(step // 2, w, step))
    lines += ''.join(f'<path d="M0 {j} H{w}"/>' for j in range(step // 2, h, step))
    return f'<rect width="{w}" height="{h}" fill="{paper}"/><g stroke="{lines_c}" stroke-width="1.5">{lines}</g>'


OBJECTS = [pencil, note, tape, clip, eraser, pushpin, ruler, scissors, notebook, highlighter, glue, stamp]


def hero(faces, theme='light'):
    w, h = 1280, 640
    word, ww = wordmark()
    scale = 680 / ww
    wx, wy = (w - ww * scale) / 2, h / 2 - 92 * scale
    deco, items, n = [], [], len(OBJECTS)
    for i, fn in enumerate(OBJECTS):
        a = -math.pi / 2 + 2 * math.pi * i / n
        x, y = w / 2 + 530 * math.cos(a), h / 2 + 238 * math.sin(a)
        items.append(f'<g transform="translate({x:.0f} {y:.0f}) scale(.92)" filter="url(#sticker)">{fn(faces)}</g>')
        a2 = a + math.pi / n
        x2, y2 = w / 2 + 455 * math.cos(a2), h / 2 + 190 * math.sin(a2)
        col = list(P.values())[i % 6][1]
        deco.append(f'<g transform="translate({x2:.0f} {y2:.0f})">{(sparkle if i % 2 else heart)(col, .8)}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{filt(10, theme)}</defs>{grid(w, h, 32, theme)}{"".join(deco)}{"".join(items)}'
            f'<g transform="translate({wx:.1f} {wy:.1f}) scale({scale:.4f})" filter="url(#sticker)">{word}</g></svg>')


def logo(faces):
    s = 512
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">'
            f'<defs>{filt(12)}<clipPath id="round"><rect width="{s}" height="{s}" rx="112"/></clipPath></defs>'
            f'<g clip-path="url(#round)">{grid(s, s, 40)}</g>'
            f'<g transform="translate(300 292) scale(2.1)" filter="url(#sticker)">{note(faces)}</g>'
            f'<g transform="translate(170 246) scale(2.0)" filter="url(#sticker)">{pencil(False)}</g></svg>')


def divider():
    """A row of pastel washi dashes with a heart between two sparkles in the middle."""
    w, h = 1640, 72
    cols = [v[1] for v in P.values()]
    dashes, x, i = [], 0, 0
    while x + 28 <= w:
        if abs(x + 14 - w / 2) > 70:
            dashes.append(f'<rect x="{x}" y="{h / 2 - 4}" width="28" height="8" rx="4" fill="{cols[i % 6]}"/>')
            i += 1
        x += 42
    mid = (f'<g transform="translate({w / 2 - 40} {h / 2})">{sparkle(P["sky"][1], 1.1)}</g>'
           f'<g transform="translate({w / 2} {h / 2})">{heart(P["pink"][1], 1.8)}</g>'
           f'<g transform="translate({w / 2 + 40} {h / 2})">{sparkle(P["mint"][1], 1.1)}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{"".join(dashes)}{mid}</svg>')


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    files = {'hero-light.svg': hero(True, 'light'), 'hero-dark.svg': hero(True, 'dark'),
             'divider.svg': divider(), 'logo.svg': logo(True)}
    for name, svg in files.items():
        with open(os.path.join(out, name), 'w', encoding='utf8') as fh:
            fh.write(svg)
