---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,cjs}"
  - "**/*.{py,rb,go,rs,java,kt,swift,cs,php,dart}"
  - "**/*.{c,h,cpp,hpp,sql,sh,vue,svelte}"
---

# Code standards

<!-- These load only when Claude touches a source file, which is the only time they
     apply. Everything without a paths: header loads on EVERY turn of EVERY session -
     so a standard about naming was being paid for on turns that wrote no code at all.
     The rules that must hold even when no file is open live in workflow.md. -->

- **Reuse before writing.** Search the codebase first, then the ecosystem — a duplicate implementation is the most expensive kind of mistake here. Custom code is not the safe default: hand-rolled dates, money, auth and parsers are where the debugging turns go. `/easyclaude:pick-library` vets one.
- **No new dependency without asking.** Name what it's for, what it replaces, and what it pulls in.
- **Match the surrounding code**, not your own preferences: naming, layout, error handling, comment density.
- **Delete code, don't comment it out.** Git remembers.
