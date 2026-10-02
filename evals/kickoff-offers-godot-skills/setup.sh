# A Godot 4 project that easyClaude has not set up yet: code, no docs/. The end of setup must
# offer the game skills that fit, by name and cost, without being asked and without the user
# knowing any category name. Added after a user asked for exactly that on 2026-10-02.
set -euo pipefail
mkdir -p scenes
printf '; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="Star Hopper"\nrun/main_scene="res://scenes/main.tscn"\nconfig/features=PackedStringArray("4.4")\n' > project.godot
printf '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n' > scenes/main.tscn
git init -q -b main
git config user.email >/dev/null || git config user.email eval@example.invalid
git config user.name >/dev/null || git config user.name "Plugin Eval"
git add -A && git commit -qm "Empty Godot project"
