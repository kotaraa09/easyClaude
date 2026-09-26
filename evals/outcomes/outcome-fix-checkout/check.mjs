// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
export default [
  { name: 'paying with no discount code works', hidden: 'hidden.test.mjs' },
  { name: "the project's own tests pass", ownTests: true },
  // Put the old src/checkout.js back: one of the project's tests must now fail.
  { name: 'a test would catch the bug coming back', catches: 'src/checkout.js' },
];
