---
name: security-check
description: Sweep a project for leaked secrets, exposed endpoints, and vulnerable dependencies before it goes public or gets deployed. Use before making a repository public, before a first deploy, when the user mentions API keys, credentials, auth or ".env", or when they ask whether something is safe to ship.
allowed-tools: Read, Bash, Glob, Grep
---

# Security check

Run this **before** a repo goes public and **before** a first deploy. Most of what it finds is invisible to someone who hasn't been burned yet.

Uses only `git` and `grep`, so it works regardless of the project's stack.

## 1. Secrets in the working tree

```bash
git grep -nIE '(AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]+|AIza[0-9A-Za-z_-]{35}|r8_[A-Za-z0-9]{30,}|(sk|pk|rk)_live_[A-Za-z0-9]{20,})'
git grep -nIE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----'
git grep -nIE '(password|passwd|secret|api_?key|access_?token)\s*[:=]\s*[\x27"][^\x27"]{8,}'
```

The last one produces false positives — test fixtures, examples, placeholder strings. Read each hit before reporting it. Crying wolf here trains people to ignore the real one.

## 2. Secrets in git history — the part people miss

**Deleting a file does not remove it from history.** A key committed six months ago is still in every clone.

```bash
git log --all --oneline -- .env .env.local .env.production
git log --all --oneline -S'AKIA' --  ; git log --all --oneline -S'sk-ant-' --
git log --all --oneline -S'BEGIN RSA PRIVATE KEY' --
```

On a large repo these are slow. Say so and let them run rather than skipping the check.

**If anything is found, the fix is to rotate the key, not to rewrite history.** Say this plainly and first:

> That key is in your git history. Even if we remove it, assume it is compromised — anyone who cloned or forked the repo has it, and GitHub caches unreachable commits. **Revoke it in the provider's dashboard and issue a new one.** History rewriting is optional cleanup afterwards, not the fix.

Never offer `filter-branch` or `git push --force` as the primary remedy. That's how people convince themselves a leaked key is safe.

## 3. What is actually being tracked

```bash
git ls-files | grep -iE '(^|/)\.env|\.pem$|\.key$|\.p12$|id_rsa|credentials|serviceAccount.*\.json'
git check-ignore -v .env 2>/dev/null || echo 'WARNING: .env is not gitignored'
```

## 4. Secrets that are public by design

Client-side bundles ship to the browser. Anything with these prefixes is **world-readable**:

```bash
git grep -nE '(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_)[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)'
```

A service-role database key behind `NEXT_PUBLIC_` is the single most damaging mistake in this category — it usually bypasses every access rule the project has.

## 5. Exposed surface

Look for, and read rather than assume:

- API routes and endpoints with no authentication check — list them and ask which are meant to be public.
- `cors({ origin: '*' })` or equivalent on anything authenticated.
- Debug flags on in production config: `DEBUG=True`, `NODE_ENV` unset, verbose error pages that leak stack traces.
- Default or example credentials left in seeds, fixtures, or docker-compose.
- Database or admin ports bound to `0.0.0.0` rather than localhost.

## 6. Dependencies

Run whichever fits; skip silently if the toolchain is absent.

| stack | command |
|---|---|
| Node | `npm audit --omit=dev` |
| Python | `uv run pip-audit` or `pip-audit` |
| Rust | `cargo audit` |
| Go | `govulncheck ./...` |
| Ruby | `bundle audit` |

Report **only** what's reachable and high severity. A wall of transitive dev-dependency warnings is noise that hides the one that matters.

## 7. Report

Group by what the user should do, not by what you scanned:

```
CRITICAL - do this now
  - Stripe live key in git history (commit a1b2c3). Rotate it at
    dashboard.stripe.com. It is compromised regardless of what we do next.

FIX BEFORE DEPLOY
  - .env is tracked. Remove from the index, add to .gitignore.
  - /api/admin/users has no auth check (app/api/admin/users/route.ts:12).

WORTH KNOWING
  - 3 moderate npm advisories, all dev-only.
```

If nothing is found, say so in one line. Do not pad a clean result to look thorough.

## Boundaries

This is a **sweep for common, high-frequency mistakes** — not a penetration test or a security audit. Say that when reporting. Someone who reads "security check passed" as "this app is secure" has been misled, and for anything handling payments, health data, or personal data at scale, they need a real audit by a person.
