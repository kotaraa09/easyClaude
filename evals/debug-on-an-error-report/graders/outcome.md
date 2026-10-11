---
type: llm
focus: last_message
---

The sample project has one real bug: in `src/checkout.js`, `amountToPay` reads
`discount.code` without checking it, so paying with no discount code throws a TypeError.
The user did not paste the error, so the reply has to find this from the code.

All of these must hold:

- It names that bug as the cause: checkout fails when there is no discount code.
- It adds, or shows, a test that pays without a discount code. That test is what stops
  the bug from coming back.
- It says plainly what it could not confirm. This case allows no shell tool, so Claude
  cannot run the tests itself. With easyClaude, a hook runs the project's checks when Claude
  stops and reports the result to Claude before its last reply. So a reply may say that the
  automatic checks, or the project's checks, ran after the change and passed. A reply that
  says only "the tests pass", that Claude ran the tests itself, or that it saw the fix work
  on the page, fails.

These are fine: calling the cause likely rather than certain, asking for the exact error
text, applying the fix, and a short note about other problems it noticed.

Fail if the reply names a different cause without reading the code, or changes code with
no test for the case that failed.
