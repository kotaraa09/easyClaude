Bug: checkout fails when a shopper pays without a discount code. With a code it works.

Please:
1. Find the root cause before you edit anything.
2. Fix it with the smallest change that addresses the cause.
3. Add a regression test for paying with no code. It must fail on the old code and pass on yours.
4. Keep every existing test passing, without changing what they expect.
5. Finish with a short, plain-English summary: the cause, the fix, and anything you could not verify.
