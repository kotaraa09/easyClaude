#!/bin/sh
# Draws the README pictures with draw.py, then renders them into docs/assets/.
# Uses Microsoft Edge in headless mode, Git Bash's cygpath for Windows paths, and
# Python with Pillow to shrink and compress the result.
# Set EDGE to the browser's path if it is somewhere else; Chrome takes the same flags.
set -e
cd "$(dirname "$0")"
edge="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
tmp="$(mktemp -d)"
python draw.py "$tmp"

# render <name> <width> <height>: one fresh browser profile per picture, at twice the size.
render() {
  profile="$(mktemp -d)"
  "$edge" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --default-background-color=00000000 --user-data-dir="$(cygpath -w "$profile")" \
    --force-device-scale-factor=2 --window-size="$2,$3" \
    --screenshot="$(cygpath -w "$tmp/$1.png")" "file:///$(cygpath -m "$tmp/$1.svg")" >/dev/null 2>&1
  for _ in $(seq 1 30); do [ -s "$tmp/$1.png" ] && break; sleep 1; done
  rm -rf "$profile" 2>/dev/null || true  # Edge may still hold its files for a moment
}
render hero-light 1280 640
render hero-dark 1280 640
render divider 1640 72
render logo 512 512

python - "$tmp" ../assets <<'EOF'
import sys
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
def save(name, out, size, radius=0):
    im = Image.open(f'{src}/{name}.png').convert('RGBA').resize(size, Image.LANCZOS)
    if not radius and name.startswith('hero'):
        # Flat pastel art fits in 256 colours, which keeps each hero small.
        im = im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    if radius:
        mask = Image.new('L', size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
        im.putalpha(mask)
    im.save(f'{dst}/{out}.png', optimize=True)
    print(f'docs/assets/{out}.png', size)
save('hero-light', 'hero-light', (1640, 820))
save('hero-dark', 'hero-dark', (1640, 820))
save('divider', 'divider-light', (1640, 72))
save('divider', 'divider-dark', (1640, 72))
save('logo', 'logo', (512, 512), radius=112)
EOF
rm -rf "$tmp" 2>/dev/null || true
