<context>
I run a small online plant shop, and this repository is its website. I am not a programmer, so I cannot check the code myself.
</context>

<task>
Add shipping to the amount a shopper pays.
</task>

<rules>
- Shipping costs $6.
- Shipping is free when the order is $50 or more.
- The amount the shopper pays includes shipping.
</rules>

<success_criteria>
- The amount to pay follows the rules above, including an order of exactly $50.
- Automated tests cover an order under $50, exactly $50 and over $50.
- Every test passes. If an existing test expected an amount that shipping now changes, update that expectation. Do not delete tests.
</success_criteria>

<constraints>
- Read the existing checkout code and tests before you change anything.
- Keep the change small. Do not refactor unrelated code.
- If something is ambiguous, choose the most sensible option, state the assumption, and finish the work.
</constraints>

<report>
When you finish, explain in plain, non-technical words what changed and how you checked it. If you could not check something, say so.
</report>
