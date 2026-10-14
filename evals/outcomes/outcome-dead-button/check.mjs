// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The project's own tests pass before the fix too, so they say nothing here. The hidden
// test builds a stand-in page from the real index.html and clicks its Pay button.
export default [
  { name: 'clicking Pay shows the amount to pay', hidden: 'hidden.test.mjs' },
  { name: "the project's own tests pass", ownTests: true },
];
