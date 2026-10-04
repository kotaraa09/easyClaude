#!/bin/sh
# Renders draw.html into the README pictures in docs/assets/.
# Uses Microsoft Edge in headless mode, and Git Bash's cygpath for Windows paths.
# Set EDGE to the browser's path if it is somewhere else; Chrome takes the same flags.
set -e
cd "$(dirname "$0")"
edge="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
url="file:///$(cygpath -m "$PWD")/draw.html"
out="$(cygpath -w "$PWD/../assets")"
for kind in hero divider; do
  h=724; [ "$kind" = divider ] && h=120
  for theme in dark light; do
    # The transparent default background is what lets the divider sit on any page colour.
    "$edge" --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
      --virtual-time-budget=8000 --window-size=2172,$h \
      --screenshot="$out\\$kind-$theme.png" "$url?kind=$kind&theme=$theme" >/dev/null 2>&1
    echo "docs/assets/$kind-$theme.png $(wc -c < "../assets/$kind-$theme.png") bytes"
  done
done
