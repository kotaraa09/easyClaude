---
name: write-tests
description: Start a test suite from nothing, or add tests to code that has none. Use when a project has no tests, when the user asks for test coverage, or when kickoff found no suite to wire the verify gate to.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Write tests

The gate already blocks — on whatever `.claude/verify.json` holds. Until a suite exists that is usually just a typecheck, which catches type errors and proves nothing about behaviour. This is the skill that makes the gate catch behaviour.

## 1. Start with one test, not a plan

The first test is the expensive one — it's where the runner gets installed, configured, and proven. Every test after it is cheap.

So: pick the single most important behaviour, make one test pass, and run it. Do not write ten tests before running any. A test file that has never executed is not a test.

Check `${CLAUDE_PLUGIN_ROOT}/recipes/` for this stack's runner and conventions before choosing one.

## 2. What to test, in order

1. **The critical path** — the one flow that makes the product worth having. If checkout breaks, nothing else matters.
2. **Anything that has broken before.** Past bugs are the best predictor of future ones.
3. **Boundaries** — empty, zero, one, missing, null, very large, wrong type. This is where most real bugs live.
4. **Money, auth, and data loss.** Anything irreversible earns a test regardless of how simple it looks.

Stop there. Chasing a coverage percentage produces tests of getters and setters that fail only when someone renames a variable.

## 3. Test behaviour, not implementation

Assert on what a caller observes: the return value, the response, the row in the database, the pixel on screen. Never on private internals or call counts.

The test for this is simple — **could you rewrite the implementation and keep the test?** If not, the test is welded to the code and will punish every future refactor. That's how suites become the thing people delete.

## 4. Make them deterministic

A flaky test is worse than no test: it gets ignored, then skipped, then the whole suite loses authority.

- No real network. No real payment provider. No real email.
- No real clock — inject the time or freeze it. Tests that fail at midnight or in another timezone are a rite of passage worth skipping.
- No unseeded randomness.
- No shared state between tests, and no dependence on test order. Each one sets up and tears down its own world.

## 5. Don't over-mock

Mock what you don't own and can't run: third-party APIs, payment providers, email. Do **not** mock your own functions to make a test pass — a test where everything is mocked verifies only that the mocks were configured, which is always true.

Prefer a real in-memory database over a mocked one. It catches the query bugs the mock cannot.

## 6. Keep it fast

The verify gate runs this constantly. A suite that takes five minutes gets bypassed within a week.

Target seconds. Push slow things — full browser runs, real network, large fixtures — into a separate command that isn't in the gate, and say plainly that they're not covered by it.

## 7. Wire it into the gate — do not skip this

Adding tests is only half the job. Now make them count:

1. Add the test command to `.claude/verify.json`. A changed command needs approval again, so tell the user the new command in one line and run `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs --trust`: they asked for these tests.
2. Run the whole contract and confirm it passes:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs
   ```
3. Tell the user what just changed: the Stop hook already runs that file, so from here on the turn cannot end while a test fails. There is no setting to flip.

Step 2 is the one that matters. A command that has never passed teaches everyone to ignore the gate, and a contract nobody trusts is worse than no contract at all.

If the suite is slow enough to be annoying, **tier it rather than dropping it**. Add `"tier": "full"` to the slow step: it stops running at the end of every turn and runs when a task is finished and when shipping instead. That is a real trade — a broken test no longer blocks the turn that broke it — but it is a far better one than the alternative, which is taking the step out of the contract and covering nothing at all.

Tier on what you measured. `verify.mjs` prints each step's duration, so run the contract once and tier from those numbers. Anything under a couple of seconds should stay `fast`; there is no reason to give up per-turn coverage you can afford.

## 8. Report

Say what is now covered, what deliberately isn't, and what the gate will catch from now on. Add anything you chose not to cover to `## Debt` in `docs/STATE.md` so it's a decision on record rather than an oversight.
