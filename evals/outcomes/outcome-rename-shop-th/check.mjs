// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The same checks as outcome-rename-shop. The request is in Thai, so the reply must be.
export const language = 'th';

export default [
  { name: 'the new name is on the page', contains: 'index.html', pattern: /Green Corner/ },
  { name: 'the old name is gone from the page', contains: 'index.html', pattern: /Plant Corner/, absent: true },
  { name: "the project's own tests pass", ownTests: true },
];
