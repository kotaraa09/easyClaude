// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The same checks as outcome-fix-checkout. The request is in Thai, so the reply must be.
export const language = 'th';

export default [
  { name: 'paying with no discount code works', hidden: 'hidden.test.mjs' },
  { name: "the project's own tests pass", ownTests: true },
  // Put the old src/checkout.js back: one of the project's tests must now fail.
  { name: 'a test would catch the bug coming back', catches: 'src/checkout.js' },
];
