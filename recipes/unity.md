# Unity

**Detect:** `ProjectSettings/ProjectVersion.txt` and an `Assets/` directory.

**Verify steps:**
| name | cmd | tier |
|---|---|---|
| edit-mode tests | `Unity -batchmode -quit -projectPath . -runTests -testPlatform EditMode -logFile -` | full |

**Verification strength:** **compile-only at best, often none.** Be honest with the user about this.

Batchmode requires a Unity licence activated on the machine, and the CLI path differs per install. EditMode tests can run headlessly when that's set up; PlayMode tests, rendering, physics, input, and anything about whether the game is *fun* cannot be verified at all. If batchmode isn't available, write no verify contract, and tell the user their gate is "it compiles in the editor" — not something stronger.

**Pitfalls**
- **`.meta` files must be committed.** Every asset has one, and losing them silently breaks references across the project. This is the single most damaging Unity mistake in version control.
- Never commit `Library/`, `Temp/`, `Logs/`, or `Build/`. Use Unity's official `.gitignore`.
- Scenes and prefabs are YAML but merge terribly. Enable Force Text serialisation and Unity's Smart Merge, and still avoid two people editing one scene.
- The editor holds a lock — a batchmode run will fail or block while the project is open.
- `Update()` runs every frame. Allocations there cause GC stalls that look like random stutter, not like a bug.
- Prefer `[SerializeField] private` over public fields for inspector values; public fields are part of your API by accident.
- Put game logic in plain C# classes that don't inherit `MonoBehaviour`. Those are the only parts EditMode tests can reach.

**Setup (greenfield)**
Create the project from Unity Hub. Choose the render pipeline up front — changing it later is a migration, not a setting.
