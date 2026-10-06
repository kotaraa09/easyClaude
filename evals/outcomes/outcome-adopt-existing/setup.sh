# A project someone else started, with every layout kickoff used to trample:
#   - docs/ is a published MkDocs site, so a file written there becomes a public page
#   - decisions are one file each in doc/adr/
#   - the team wrote its own CLAUDE.md, and keeps release notes in CHANGELOG.md
#   - a front end and a back end side by side, with no stack marker at the root
# Before 2026-10-06 setup wrote docs/STATE.md onto the site, started docs/DECISIONS.md
# beside the ADRs, and replaced CLAUDE.md. check.mjs pins each of those.
set -euo pipefail
mkdir -p docs doc/adr frontend/src backend
printf 'site_name: Recipe Club\nnav:\n  - Home: index.md\n  - How it works: architecture.md\n' > mkdocs.yml
printf '# Recipe Club\n\nShare your favourite recipes with the club.\n' > docs/index.md
printf '# How it works\n\nThe web page talks to a small Python server.\n' > docs/architecture.md
printf '# 1. Use Flask for the server\n\nDate: 2025-03-02\n\n## Status\n\nAccepted\n\n## Decision\n\nFlask, because it is small.\n' > doc/adr/0001-use-flask.md
printf '# 2. Store recipes in SQLite\n\nDate: 2025-03-09\n\n## Status\n\nAccepted\n\n## Decision\n\nOne file, no server to run.\n' > doc/adr/0002-store-recipes-in-sqlite.md
printf '# Recipe Club\n\nTeam rules: use tabs, not spaces, in Python. Ask Sam before changing the database.\n' > CLAUDE.md
printf '# Changelog\n\n## [1.2.0] - 2025-06-01\n\n- Members can add a photo to a recipe.\n' > CHANGELOG.md
printf '# Recipe Club\n\nA recipe-sharing site for a cooking club.\n' > README.md
printf '{\n  "name": "recipe-club-web",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n' > frontend/package.json
printf '<!doctype html>\n<title>Recipe Club</title>\n<script type="module" src="src/main.js"></script>\n' > frontend/index.html
printf 'export const recipes = [];\n' > frontend/src/main.js
printf 'flask==3.0.3\n' > backend/requirements.txt
printf 'from flask import Flask\n\napp = Flask(__name__)\n\n\n@app.get("/recipes")\ndef recipes():\n\treturn []\n' > backend/app.py
git init -q -b main
git config user.email >/dev/null || git config user.email eval@example.invalid
git config user.name >/dev/null || git config user.name "Plugin Eval"
git add -A && git commit -qm "Recipe Club as the friend left it"
