# Standards

- **Reuse before writing.** Search the codebase first, then the ecosystem — a duplicate implementation is the most expensive kind of mistake here. Custom code is not the safe default: hand-rolled dates, money, auth and parsers are where the debugging turns go. `/easyclaude:pick-library` vets one.
- **No new dependency without asking.** Name what it's for, what it replaces, and what it pulls in.
- **Match the surrounding code**, not your own preferences: naming, layout, error handling, comment density.
- **Delete code, don't comment it out.** Git remembers.
- **No mock or placeholder data outside tests.** If something isn't built yet, make it fail loudly rather than quietly return fake data.
- **Secrets only in `.env`**, never in source, never in a commit.
- **Report failures honestly.** If tests fail, say so and show the output. A clear failure beats a confident lie — the user cannot supervise what you misreport.
- **Don't widen scope.** Finish what was asked. Note anything else you spotted; don't fix it uninvited.
