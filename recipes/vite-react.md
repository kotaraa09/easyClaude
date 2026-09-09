# Vite + React

**Detect:** `vite.config.{js,ts}` with `react` in dependencies.

**Verify steps:**
| name | cmd | tier |
|---|---|---|
| typecheck | `npx tsc --noEmit` | fast |
| lint | `npm run lint` | fast |
| test | `npx vitest run` | fast |
| build | `npm run build` | full |

**Verification strength:** strong.

**Pitfalls**
- Client-side env vars **must** be prefixed `VITE_` and are read via `import.meta.env`, not `process.env`. Anything exposed this way ships to the browser — never put a secret behind it.
- `vitest run` (not bare `vitest`) in the gate. Without `run` it starts watch mode and never exits, which hangs the session.
- React 18 StrictMode double-invokes effects in development only. Code that breaks on the second run has a real bug; don't "fix" it by removing StrictMode.
- `npm run build` type-checks and tree-shakes in ways `dev` does not. A project that runs fine in dev can fail to build.
- Vite serves from the project root — assets belong in `public/`, referenced from `/`, not by relative path.
- This is a single-page app: there is no server. Anything needing a secret needs a backend.

**Setup (greenfield)**
```bash
npm create vite@latest . -- --template react-ts
npm i -D vitest
```
