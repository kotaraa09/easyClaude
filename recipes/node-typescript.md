# Node + TypeScript (API, CLI, or library)

**Detect:** `package.json` **without** `next.config.*` or `vite.config.*`. Usually a `tsconfig.json` alongside.

**Verify steps:**
| name | cmd |
|---|---|
| typecheck | `npx tsc --noEmit` |
| test | `npm test` |

**Verification strength:** strong.

**Pitfalls**
- **`node --test <dir>` does not mean "run tests in that directory".** On Node 22 it resolves the path as a module and fails with `MODULE_NOT_FOUND`, while still printing a plausible-looking TAP summary. Use bare `node --test` (it discovers `*.test.js` itself) or a glob. This failure looks like a passing run if you only read the tail of the output.
- **Check the exit code, not the output.** `npm test | tail` reports the exit status of `tail`, which is always 0. The verify gate depends entirely on exit codes, so never let a pipe swallow one.
- ESM vs CommonJS is the most common source of import errors. `"type": "module"` in `package.json` changes the meaning of every file. Top-level `await` requires ESM.
- Don't commit `dist/`. Add it to `.gitignore` before the first build, not after.
- Validate environment variables at startup and fail loudly. A missing var that surfaces as `undefined` three layers deep costs far more to debug.
- `npm ci` in CI, `npm install` locally — `ci` respects the lockfile exactly.

**Setup (greenfield)**
```bash
npm init -y && npm i -D typescript @types/node
npx tsc --init
```
Add to scripts: `"verify": "tsc --noEmit && node --test"`.
