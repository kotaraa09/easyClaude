# Static site (no build step)

**Detect:** `index.html` at the root with no `package.json`.

**Verify steps:** none by default.

**Verification strength:** **none.** This is the honest answer and the user deserves to hear it.

There is no toolchain, so there is nothing that can exit non-zero. Do not invent a gate — a verify contract that always passes is worse than none, because it teaches everyone to ignore the gate. Tell the user directly: *"There's no test runner here, so I can check that the files are well-formed, but only you can confirm it looks and behaves right in a browser."*

If the project grows enough to deserve verification, that's the moment to add a build step — not before.

**Pitfalls**
- **Opening the page with `file://` breaks things silently.** ES modules, `fetch`, and most APIs fail on the `file:` protocol due to CORS. Always serve over HTTP: `python -m http.server` or `npx serve`. Beginners lose hours to this.
- **Start that server yourself, and hand the user a link.** Do not tell a beginner to open a terminal and type a command - many have no Python, and none know which folder to run it in. Run it in the background, ask their permission when Claude Code prompts, and give them the `http://localhost:…` address to click. If neither Python nor Node is installed, say that in one line, and keep the page free of ES modules and `fetch` so that double-clicking `index.html` still works.
- Relative versus absolute paths behave differently once the site is hosted in a subdirectory. Pick one convention early.
- Hard refresh after changes. Cached CSS makes it look like an edit did nothing.
- Every dependency loaded from a CDN is a third party who can change your site. Pin versions with `integrity` hashes, or vendor the file.
- No build step means no bundling, no minification, and no secrets — anything in the source is public.
- Check it works without JavaScript before adding more of it.

**Setup (greenfield)**
```bash
printf '<!doctype html>\n<meta charset="utf-8">\n<title>Site</title>\n' > index.html
```
