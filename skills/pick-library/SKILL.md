---
name: pick-library
description: Find and vet an existing library instead of hand-rolling one, with a supply-chain and health check before anything is installed. Use when a task needs dates, timezones, money, parsing, validation, retries, file formats, charts, or another long-solved problem, or when the user asks which package to use or whether one is safe.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
---

# Pick a library

Writing it yourself feels cheaper because the cost lands later. It doesn't: a hand-rolled
date parser is written once and debugged for the life of the project, and every one of
those debugging turns is paid for. A vetted dependency is one decision, made once.

The bias to correct here is *your* bias. Reaching for custom code is the default failure
mode, and "no new dependencies" is not a virtue — an *unvetted* dependency is the problem,
not a dependency.

## 1. Decide whether this is even a library question

**Never hand-roll these.** Getting them subtly wrong is normal, and the bugs surface in
production rather than in tests:

- crypto, password hashing, token signing, random IDs
- authentication, sessions, permissions
- dates, timezones, durations, recurrence
- money and decimal arithmetic
- parsers and serialisers — CSV, XML, YAML, iCal, PDF, spreadsheets
- HTML/SQL escaping, sanitisation, input validation
- HTTP retries, backoff, rate limiting

**Write it yourself** when it's under ~30 lines, has no edge cases you can't enumerate,
and reading the docs would take longer than writing it. A one-line array helper is not
worth a supply chain.

Check the platform first either way. `Intl`, `crypto.randomUUID`, `structuredClone`,
`fetch`, Python's `datetime` and `pathlib`, Go's stdlib. The best dependency is the one
already installed.

## 2. Find candidates

Search for what the ecosystem settled on, not what ranks. Get two or three, not one:

- "best maintained <thing> library <language> 2026"
- the framework's own docs — they usually name the community default
- `grep` the lockfile first: something already present as a transitive dependency costs
  nothing extra to adopt directly

**Prefer boring.** A library stable for five years with no releases is usually finished,
not abandoned — the issue tracker tells you which.

## 3. Vet before installing — this is the gate

Run these **before** anything touches the manifest. Never install to "just try it":
install scripts run at install time, which is exactly the attack.

### Advisories — one command, every ecosystem, no install needed

```bash
curl -s -X POST https://api.osv.dev/v1/query -d '{"package":{"name":"minimist","ecosystem":"npm"}}'
```

`{}` means nothing known against it. Anything else returns the advisories — read the
affected version ranges before reacting, since most are already fixed in a release you can
pin to. Ecosystem is `npm`, `PyPI`, `crates.io`, `Go`, `Packagist`, `RubyGems`, `NuGet`.

### Install scripts — code that runs before you ever call the library

```bash
npm view <pkg> scripts
```

Empty output means none, which is what you want. `{ postinstall: 'node install.js' }` is
not automatically bad — native builds legitimately need it — but you must be able to say
what it does. If you can't, stop.

### Health and provenance

| Check | Command | What fails it |
|---|---|---|
| Last release | `npm view <pkg> time.modified` | years old *and* an issue tracker of unanswered bugs |
| Maintainers | `npm view <pkg> maintainers` | one account, publishing nothing else |
| Real repo | `npm view <pkg> repository` | no repo, or one whose README doesn't name this package |
| License | `npm view <pkg> license` | anything you can't redistribute under |
| Weight | `npm view <pkg> dependencies` | 400 packages for a date formatter |

Use `repository`, not `repository.url` — the dotted form prints nothing and reads as a
missing repo when it isn't one.

Other ecosystems: PyPI's JSON API at `https://pypi.org/pypi/<pkg>/json`, `cargo info`,
`go list -m -json <mod>@latest`. After installing, `npm audit` / `pip-audit` /
`cargo audit` / `govulncheck` confirm the whole resolved tree, including transitives a
single OSV query won't have covered.

### Typosquats — the one a beginner actually gets hit by

Compare the name to the package you *meant*, character by character. Downloads three
orders of magnitude below the real one, first published recently, by a maintainer with
nothing else, is the shape of an attack. Confirm the repository resolves to a real project
and that the project names that exact package.

**Stop and tell the user** if a candidate has a live advisory with no fixed version, runs
install scripts you can't explain, was published weeks ago with no history, or has no
source repository. Do not install it and mention it afterwards.

## 4. Choose, in one line

Name the two or three candidates, pick one, and give the reason in a sentence — size,
maintenance, or fit. Don't hand the user a menu to adjudicate; they asked for working
software.

**Adding a dependency is still their call.** Say what it is, what it replaces, and what it
costs — size, transitive count, license — and get a yes. That rule hasn't changed. What
changed is that hand-rolling is no longer treated as the safe default.

## 5. Install pinned

Install through the package manager so the lockfile is written correctly. Never hand-edit
a lockfile — the project guardrails deny it on purpose; running the installer is not
denied and is the right way.

Pin the version. Commit the lockfile in the same change as the code that uses it.

## 6. Prove it works before building on it

Write the smallest possible use of the library, run it, and run the verify contract in
`.claude/verify.json`. Finding out it doesn't do what the README implied costs one turn
now and a rewrite later.

If it fails here, remove it and go back to step 2. A half-integrated dependency is worse
than none.

## 7. Record it

Add to `docs/DECISIONS.md`: the library, what it replaces, and the one line of reasoning.
In a month the question will be "why is this here", and the answer needs to already be
written down.

## Not in cheap mode

`/easyclaude:cheap` forbids new dependencies and web searches on purpose. If a cheap turn
runs into this, say in one line that the task wants a library and needs a normal turn to
choose one safely. Do not vet a package on a budget.
