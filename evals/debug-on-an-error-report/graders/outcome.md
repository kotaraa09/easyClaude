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
- It says plainly what it could not confirm. This case allows no shell, so it cannot run
  the tests. A reply that claims the tests pass, or that the bug is confirmed, fails.

These are fine: calling the cause likely rather than certain, asking for the exact error
text, applying the fix, and a short note about other problems it noticed.

Fail if the reply names a different cause without reading the code, or changes code with
no test for the case that failed.
