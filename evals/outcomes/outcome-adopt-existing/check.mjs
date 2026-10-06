// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// Each check is one way setup used to damage a project it did not start; see setup.sh.
// .claude/easyclaude.json is graded in graders/ instead, on the attempt: the eval runner
// denies every write into .claude/, where a real session asks the user first.
const anything = /[\s\S]*/;
export default [
  { name: 'the plan is kept outside the published site', contains: 'planning/STATE.md', pattern: /^## Next/m },
  { name: 'nothing of setup is on the site', contains: 'docs/**', pattern: /^## (Now|Next|Blocked|Debt)\b/m, absent: true },
  { name: 'a decision went into the ADR folder', contains: 'doc/adr/0003-*.md', pattern: /^# / },
  { name: 'no new decision log beside the ADRs', contains: '**/DECISIONS.md', pattern: anything, absent: true },
  { name: "the team's CLAUDE.md is kept", contains: 'CLAUDE.md', pattern: /Ask Sam before changing the database/ },
  { name: 'the release notes are left alone', contains: 'CHANGELOG.md', pattern: /## \[1\.2\.0\]/ },
  { name: 'the release notes hold no plan', contains: 'CHANGELOG.md', pattern: /^## (Now|Next|Done)\b/m, absent: true },
  { name: "the site's own pages are unchanged", contains: 'docs/architecture.md', pattern: /^# How it works\r?\n\r?\nThe web page talks to a small Python server\.\r?\n?$/ },
];
