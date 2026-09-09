# Python (uv)

**Detect:** `pyproject.toml`, `uv.lock`, `requirements.txt`, or `*.py` at the root.

**Verify steps:**
| name | cmd | tier |
|---|---|---|
| lint | `uv run ruff check .` | fast |
| typecheck | `uv run mypy .` *(only if the project already uses type hints)* | fast |
| test | `uv run pytest -q` | fast |

**Verification strength:** strong.

**Pitfalls**
- Always `uv run <cmd>`, never bare `python`/`pytest` — bare commands hit the system interpreter and the wrong packages.
- Add dependencies with `uv add`, never by hand-editing `pyproject.toml`.
- Don't add `mypy` to verify on an untyped codebase; it produces hundreds of failures and the gate gets ignored.
- ML projects: never let a verify step train a model or download weights. Keep the gate under a minute.
- Notebooks aren't verifiable. Move anything that matters into a module and test that.

**Setup (greenfield)**
```bash
uv init . && uv add --dev pytest ruff
```
