# Next.js + TypeScript

**Detect:** `next.config.{js,ts,mjs}`, or `next` in `package.json` dependencies.

**Verify steps:**
| name | cmd | tier |
|---|---|---|
| typecheck | `npx tsc --noEmit` | fast |
| lint | `npm run lint` | fast |
| test | `npm test` | fast |
| build | `npm run build` | full |

**Verification strength:** strong. Add Vitest for units and Playwright for one smoke test of the critical path.

**Pitfalls**
- Server vs client components: `useState`/`useEffect`/browser APIs need `"use client"`. This is the single most common build failure.
- Don't reach for `useEffect` to fetch data in a server component — fetch in the component itself.
- Env vars are server-only unless prefixed `NEXT_PUBLIC_`. Never put a secret behind that prefix.
- `npm run build` catches type and prerender errors that `dev` silently tolerates. Run it before shipping.
- App Router vs Pages Router are different frameworks in practice. Check which exists before writing routes.

**Setup (greenfield)**
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app
npm i -D vitest @vitejs/plugin-react
```
Then add to `package.json` scripts: `"verify": "tsc --noEmit && next lint && vitest run"`.
