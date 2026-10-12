// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The same checks as outcome-rename-shop. The request is in Thai, so the reply must be.
export const language = 'th';

export default [
  { name: 'the new name is on the page', contains: 'index.html', pattern: /Green Corner/ },
  { name: 'the old name is gone from the page', contains: 'index.html', pattern: /Plant Corner/, absent: true },
  { name: "the project's own tests pass", ownTests: true },
  // A rename needs no new file. A spec, a plan or a changelog here is ceremony. These are
  // the sample project's files; the no-easyClaude arm has fewer.
  { name: 'no new files', onlyFiles: [
    '.claude/rules/code-standards.md', '.claude/rules/workflow.md', '.claude/verify.json', '.gitignore',
    'CLAUDE.md', 'docs/ARCHITECTURE.md', 'docs/DECISIONS.md', 'docs/PRD.md', 'docs/STATE.md',
    'index.html', 'package.json', 'src/cart.js', 'src/checkout.js', 'tests/cart.test.mjs', 'tests/checkout.test.mjs',
  ] },
];
