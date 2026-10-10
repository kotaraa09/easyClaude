<context>
I run a small online plant shop, and this repository is its website. I am not a programmer, so I cannot check the code myself.
</context>

<problem>
When a shopper tries to pay without entering a discount code, checkout breaks. Paying with a valid discount code works.
</problem>

<task>
Find the root cause of this bug and fix it.
</task>

<success_criteria>
- Paying without a discount code works and charges the full amount.
- Paying with a valid discount code works exactly as before.
- A new automated test covers paying without a code. It fails on the old code and passes on the fixed code.
- Every existing test still passes. Do not delete or weaken any test.
</success_criteria>

<constraints>
- Read the relevant code and tests before you change anything.
- Make the smallest change that fixes the cause. Do not refactor or add features.
</constraints>

<report>
When you finish, explain in plain, non-technical words what was wrong, what you changed and how you checked it. If you could not check something, say so.
</report>
