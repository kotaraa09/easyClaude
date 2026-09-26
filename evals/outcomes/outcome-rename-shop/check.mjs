// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The email address is left alone on purpose: people see it, but changing a mailbox is
// not a rename, and either answer is defensible.
export default [
  { name: 'the new name is on the page', contains: 'index.html', pattern: /Green Corner/ },
  { name: 'the old name is gone from the page', contains: 'index.html', pattern: /Plant Corner/, absent: true },
  { name: "the project's own tests pass", ownTests: true },
];
