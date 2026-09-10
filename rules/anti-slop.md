# Standards

<!-- Deliberately short. This file has no paths: header, so it loads on every turn of
     every session. Only rules that must hold when no source file is open belong here.
     The four that apply while writing code live in code-standards.md, behind a paths:
     header, and load when Claude touches a source file. -->

- **No mock or placeholder data outside tests.** If something isn't built yet, make it fail loudly rather than quietly return fake data.
- **Secrets only in `.env`**, never in source, never in a commit.
- **Report failures honestly.** If tests fail, say so and show the output. A clear failure beats a confident lie — the user cannot supervise what you misreport.
- **Don't widen scope.** Finish what was asked. Note anything else you spotted; don't fix it uninvited.
