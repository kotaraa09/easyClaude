# A Godot 4 project, set up for easyClaude, with nothing else in it. The skills command
# must recommend game skills here, not design skills: on 2026-09-30 it told a user building
# a Godot game that the design skill they had was enough.
set -euo pipefail
mkdir -p docs scenes .claude
printf '; Engine configuration file.
config_version=5

[application]
config/name="Star Hopper"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.4")
' > project.godot
printf '[gd_scene format=3]

[node name="Main" type="Node2D"]
' > scenes/main.tscn
printf '# Star Hopper
A small 2D platformer for one hobby developer who is new to game making.
The user writes in English. Replies and docs/STATE.md use English.
Godot 4.4, GDScript. Open project.godot in the Godot editor to run it.
' > CLAUDE.md
printf '# State

## Now
(nothing in progress)

## Next
- [ ] The player can run and jump

## Blocked
none

## Debt

## Done
' > docs/STATE.md
git init -q -b main
git config user.email >/dev/null || git config user.email eval@example.invalid
git config user.name >/dev/null || git config user.name "Plugin Eval"
git add -A && git commit -qm "Empty Godot project"
