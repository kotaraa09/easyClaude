// Mutation tests for scripts/validate.mjs.
//
// Every case here breaks one thing in a copy of the tree and requires the validator to
// report it. That is the only way to tell a check that works from a check that has quietly
// stopped checking - the failure this repo has now had four times, and the reason this
// file exists.
//
// Each case names the check it covers. The coverage case at the bottom reads the check
// headings back out of validate.mjs and fails when any of them has no test, so a new check
// cannot ship untested and an old one cannot lose its only test unnoticed.
//
// Mutations locate their target by pattern wherever they can, rather than by a literal
// copy of the current text. A test that breaks every time someone edits prose is a test
// that gets deleted.
import {
  test, assert, assertMatch, workspace, runValidate, covered, repoRoot,
  readText, writeText, editText, editJson, removeFile, replaceOnce,
} from './harness.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// --- the two shapes of a mutation case ---------------------------------------

// The validator must FAIL, and must name the thing that is wrong. Exit code alone is not
// enough: a validator that fails for the wrong reason is still a broken validator, and a
// report that does not say what broke sends the reader back into the source.
function breaks(name, checkId, mutate, expected) {
  test(`${checkId}: ${name}`, async () => {
    const dir = workspace();
    mutate(dir);
    const r = await runValidate(dir);
    assert(r.code !== 0,
      `the validator passed after this mutation, so check ${checkId} is not checking:\n${r.out}`);
    assertMatch(r.out, expected, `check ${checkId} fired, but the report does not identify the fault.`);
  }, { covers: checkId });
}

// The validator must WARN and still pass. A warning that silently became an error is a
// change of contract, so the exit code is asserted too.
function warns(name, checkId, mutate, expected) {
  test(`${checkId}: ${name}`, async () => {
    const dir = workspace();
    mutate(dir);
    const r = await runValidate(dir);
    assertMatch(r.out, expected, `check ${checkId} did not warn about this.`);
    assert(r.code === 0,
      `this must warn, not fail - it is waste or a risk, not breakage:\n${r.out}`);
  }, { covers: checkId });
}

// Bumps the first number captured by `re`, so the expected figure is never hard-coded here.
function bumpNumber(dir, rel, re) {
  const before = readText(dir, rel);
  const m = before.match(re);
  if (!m) throw new Error(`no match for ${re} in ${rel} - update the mutation, do not delete it`);
  const changed = String(Number(m[1]) + 7);
  writeText(dir, rel, before.replace(m[0], m[0].replace(m[1], changed)));
}

const appendLine = (dir, rel, line) => editText(dir, rel, (t) => `${t}\n${line}\n`);

// --- baseline ----------------------------------------------------------------
// Without this, every case above could be passing because the copy is broken rather than
// because the mutation worked.
test('baseline: an unmutated copy of the tree validates clean', async () => {
  const r = await runValidate(workspace());
  assert(r.code === 0, `a clean copy of the repo must validate. Output:\n${r.out}`);
  assertMatch(r.out, /^OK - /m, 'a clean copy must report OK.');
});

// --- 1. commands -------------------------------------------------------------
breaks('a command with no description', '1',
  (d) => editText(d, 'commands/full.md', (t) => t.replace(/^description:.*$/m, '')),
  /commands\/full\.md.*description/i);

breaks('a command using disallowed-tools, which is a CLI flag and not a key', '1',
  (d) => editText(d, 'commands/full.md',
    (t) => t.replace(/^description:/m, 'disallowed-tools: Bash\ndescription:')),
  /"disallowed-tools" is not a frontmatter key/);

// --- 1b. output styles ---------------------------------------------------------
// A style name that matches nothing gives the default style, and nothing else reports it.
breaks('kickoff naming a style that does not ship', '1b',
  (d) => editText(d, 'output-styles/plain.md', (t) => t.replace(/^name: plain$/m, 'name: plain-words')),
  /sets outputStyle "easyclaude:plain", but output-styles\/ has no style named "plain"/);

breaks('a style that drops the coding instructions', '1b',
  (d) => editText(d, 'output-styles/plain.md', (t) => t.replace(/^keep-coding-instructions: true\n/m, '')),
  /keep-coding-instructions: true/);

// --- 2. skills ---------------------------------------------------------------
breaks('a skill whose name does not match its directory', '2',
  (d) => editText(d, 'skills/kickoff/SKILL.md', (t) => t.replace(/^name:.*$/m, 'name: kickof')),
  /does not match directory/);

breaks('a skill directory with no SKILL.md', '2',
  (d) => removeFile(d, 'skills/debug/SKILL.md'),
  /skills\/debug.*missing SKILL\.md/);

// --- 2b. agents --------------------------------------------------------------
// The tool grant is the case that matters. A subagent runs with whatever tools its
// frontmatter lists, so a reviewer holding Edit can rewrite the diff it was dispatched to
// judge - after the verify gate in ship step 1 has already run. Nothing else in the tree
// would notice, which is exactly the shape of failure this suite exists for.
const AGENT = 'agents/easyclaude-diff-reviewer.md';

breaks('a shipped agent that can write', '2b',
  (d) => replaceOnce(d, AGENT, 'tools: Read, Glob, Grep', 'tools: Read, Glob, Grep, Edit'),
  /grants Edit, which can change the tree or run commands/);

breaks('a shipped agent that can run commands', '2b',
  (d) => replaceOnce(d, AGENT, 'tools: Read, Glob, Grep', 'tools: Read, Glob, Grep, Bash'),
  /grants Bash, which can change the tree or run commands/);

breaks('an agent with no tools line at all', '2b',
  (d) => editText(d, AGENT, (t) => t.replace(/^tools:.*\r?\n/m, '')),
  /missing required "tools"/);

breaks('an agent that does not pin a model', '2b',
  (d) => editText(d, AGENT, (t) => t.replace(/^model:.*\r?\n/m, '')),
  /missing required "model"/);

breaks('an agent whose name does not match its file', '2b',
  (d) => replaceOnce(d, AGENT, 'name: easyclaude-diff-reviewer', 'name: diff-reviewer'),
  /does not match the file name/);

// --- 3. every JSON file parses ----------------------------------------------
breaks('a JSON file that does not parse', '3',
  (d) => appendLine(d, '.claude/verify.json', '}}} not json'),
  /verify\.json.*invalid JSON/);

// --- 3b. every script parses -------------------------------------------------
breaks('a script that is not valid JavaScript', '3b',
  (d) => appendLine(d, 'scripts/env.mjs', 'const broken = {{{;'),
  /scripts\/env\.mjs.*not valid JavaScript/);

// --- 4. manifests agree ------------------------------------------------------
breaks('a plugin the marketplace does not list', '4',
  (d) => editJson(d, '.claude-plugin/plugin.json', (j) => { j.name = 'renamed-plugin'; }),
  /marketplace\.json.*does not list plugin/);

// --- 5. hooks ----------------------------------------------------------------
breaks('a hook pointing at a script that is not there', '5',
  (d) => editJson(d, 'hooks/hooks.json', (j) => {
    j.hooks.Stop[0].hooks[0].command = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/renamed.mjs" --hook';
  }),
  /scripts\/renamed\.mjs.*does not exist/);

// A Stop prompt hook that ignores stop_hook_active re-blocks until the block cap
// overrides it, which wedges the session rather than failing it.
breaks('a Stop prompt hook with no loop guard', '5',
  (d) => editJson(d, 'hooks/hooks.json', (j) => {
    j.hooks.Stop[0].hooks[0] = { type: 'prompt', timeout: 600, prompt: 'Check the work before stopping.' };
  }),
  /must check "stop_hook_active"/);

// The shape every release up to 0.1.2 shipped: events at the top level. Claude Code refused
// the whole file and ran no hook at all, while this check printed OK.
breaks('events at the top level, with no "hooks" object around them', '5',
  (d) => editJson(d, 'hooks/hooks.json', (j) => j.hooks),
  /must put its events under a top-level "hooks" object \(found SessionStart, /);

breaks('a SessionStart prompt hook, which Claude Code fails at run time', '5',
  (d) => editJson(d, 'hooks/hooks.json', (j) => {
    j.hooks.SessionStart[0].hooks[0] = { type: 'prompt', timeout: 30, prompt: 'Orient yourself.' };
  }),
  /"SessionStart" cannot be a prompt hook/);

// --- 5b. curated skill registry ----------------------------------------------
// The mutation adds an entry rather than editing one, because nothing is vendored today.
// Editing j.vendored[0] read a property of undefined the moment design-taste was removed,
// so the test for the pinning rule failed for a reason that had nothing to do with pinning,
// and would have been "fixed" by deleting it. A check on a policy has to keep working when
// the repo currently has nothing the policy applies to - that is the state the next
// vendored skill arrives in.
breaks('a vendored skill pinned to a branch instead of a commit', '5b',
  (d) => editJson(d, 'skills/registry.json', (j) => {
    j.vendored.push({ name: 'design-taste', commit: 'main', license: 'MIT', why: 'taste rules' });
  }),
  /40-character commit SHA/);

// --- 6. docs use namespaced invocations --------------------------------------
breaks('a doc using the bare command form', '6',
  (d) => appendLine(d, 'recipes/README.md', 'Run /kickoff to begin.'),
  /references "\/kickoff"/);

// --- 6b. docs must not claim hooks that do not exist -------------------------
breaks('a doc promising a hook nobody implemented', '6b',
  (d) => appendLine(d, 'recipes/README.md', 'A PreCompact hook trims this file for you.'),
  /"PreCompact" hook, but hooks\.json does not implement it/);

// --- 6c. paths named in prose must exist -------------------------------------
breaks('prose naming a plugin file that is not there', '6c',
  (d) => appendLine(d, 'recipes/README.md', 'See `${CLAUDE_PLUGIN_ROOT}/scripts/absent.mjs` for details.'),
  /scripts\/absent\.mjs.*does not exist/);

// --- 6d. shipped assets should be referenced ---------------------------------
warns('an asset nothing points at', '6d',
  (d) => writeFileSync(join(d, 'docs/assets/unreferenced-fixture.png'), Buffer.alloc(2048)),
  /unreferenced-fixture\.png.*referenced by nothing/);

// --- 7. line endings ---------------------------------------------------------
warns('a file committed with CRLF', '7',
  (d) => editText(d, 'recipes/rust.md', (t) => t.replace(/\r?\n/g, '\r\n')),
  /recipes\/rust\.md.*CRLF/);

// --- 8. recipes --------------------------------------------------------------
breaks('a recipe step with a tier that is neither fast nor full', '8',
  (d) => replaceOnce(d, 'recipes/go.md', '| fast |', '| WRONG |'),
  /tier "WRONG"/);

breaks('a recipe with its two headings in the wrong order', '8',
  (d) => editText(d, 'recipes/go.md', (t) => {
    // The order guard exists because the reversed form made the tier check read an empty
    // string and pass. Rebuilding the file in the wrong order reproduces exactly that.
    const steps = t.indexOf('**Verify steps:**');
    const strength = t.indexOf('**Verification strength:**');
    const table = t.slice(steps, strength);
    const strengthLine = t.slice(strength).split('\n')[0];
    return `${t.slice(0, steps)}${strengthLine}\n\n${table}\n`;
  }),
  /comes before "Verify steps"/);

// --- 8b. kickoff must be able to find every recipe that ships ----------------
breaks('a recipe detecting on a marker kickoff never looks for', '8b',
  (d) => replaceOnce(d, 'recipes/go.md', '`go.mod`', '`go.manifest`'),
  /not in kickoff's marker list/);

// --- 9. skill descriptions must not collide ----------------------------------
// Both skills set disable-model-invocation, so copying a description between them changes
// no token figure and this case cannot be passing for some unrelated reason. It used deploy
// and rescue until rescue started listening for plain words in 0.1.7; then the copy moved
// the estimate and the case failed for a reason that had nothing to do with overlap.
warns('two skills competing for the same turn', '9',
  (d) => {
    const from = readText(d, 'skills/deploy/SKILL.md').match(/^description:(.*)$/m)[1];
    editText(d, 'skills/security-check/SKILL.md', (t) => t.replace(/^description:.*$/m, `description:${from}`));
  },
  /descriptions overlap/);

// --- 9b. template settings must match the real plugin ------------------------
breaks('a template that enables no plugin', '9b',
  (d) => editJson(d, 'template/.claude/settings.json', (j) => { j.enabledPlugins = {}; }),
  /enabledPlugins must contain/);

// --- 10. always-on token budget ----------------------------------------------
breaks('an always-on cost over budget', '10',
  (d) => editJson(d, 'skills/registry.json', (j) => { j.max_always_on_tokens = 10; }),
  /exceeds budget 10/);

// --- 10. a scoped rule must not be billed as always-on -----------------------
// Claude Code loads a rule with `paths:` frontmatter only when it touches a matching
// file. The validator used to count every rules/*.md the same way, which made scoping a
// rule LOOK more expensive than leaving it always-on - so the only way under the cap was
// to delete a standard rather than scope it. The budget has to reward the cheaper shape,
// or it argues for the wrong one. No number is hard-coded here: the case reads the
// measured figure back both ways and only requires that unscoping raises it.
test('10: a rule with paths: frontmatter is not counted against the budget', async () => {
  const dir = workspace();
  const measured = (out) => {
    // The figure appears with a thousands separator in one message and without it in
    // another. Matching only the bare form captured a leading "1" out of "1,250".
    const m = out.match(/([\d,]+) tok\/turn always-on/) ?? out.match(/measured ([\d,]+)/);
    assert(m, `no measured always-on figure in the output:\n${out}`);
    return Number(m[1].replace(/,/g, ''));
  };

  const before = measured((await runValidate(dir)).out);

  const rel = 'rules/code-standards.md';
  const text = readText(dir, rel);
  assertMatch(text, /^---\r?\n[\s\S]*?^paths\s*:/m,
    `${rel} is the scoped rule this case is about, and it no longer declares paths:`);
  writeText(dir, rel, text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));

  const after = measured((await runValidate(dir)).out);
  assert(after > before,
    `unscoping ${rel} left the always-on figure at ${after}. The validator is still ` +
    'counting scoped rules, so the budget cannot tell the two shapes apart.');
}, { covers: '10' });

// --- 10. an agent's description must be billed like a skill's ----------------
// An agent's name and description ride in the Agent tool's description on every turn, the
// same way a skill's ride in the Skill tool's. Counting skills and not agents would let the
// standing cost grow through a door the budget does not watch - which is how a vendored
// skill once sat in the always-on set unmentioned. No figure is hard-coded: the case reads
// the measured total back with the agent and without it.
test('10: a shipped agent is counted against the budget', async () => {
  const dir = workspace();
  const measured = (out) => {
    const m = out.match(/([\d,]+) tok\/turn always-on/) ?? out.match(/measured ([\d,]+)/);
    assert(m, `no measured always-on figure in the output:\n${out}`);
    return Number(m[1].replace(/,/g, ''));
  };

  const before = measured((await runValidate(dir)).out);
  removeFile(dir, 'agents/easyclaude-diff-reviewer.md');
  const after = measured((await runValidate(dir)).out);

  assert(after < before,
    `removing the only shipped agent left the always-on figure at ${after}, from ${before}. ` +
    'The budget is not counting agent descriptions, so the next one ships for free.');
}, { covers: '10' });

// --- 10b. stated costs must match the measured figure ------------------------
breaks("the README's cost sentence drifting from the measurement", '10b',
  (d) => bumpNumber(d, 'README.md', /tokens per turn\*\*: ~([\d,]+) of rules/),
  /claims ~[\d,]+ tokens\/turn of rules, measured/);

breaks("the README's cost sentence being reworded away", '10b',
  (d) => replaceOnce(d, 'README.md', 'tokens per turn**: ~', 'tokens each turn**: ~'),
  /cost sentence is missing or reworded/);

// --- 10c. every README's cost figures, translations included -----------------
// Mutated in the translation, because the English sentence has its own check above and
// this one exists for the file that had none.
breaks("a translation's cost marker drifting", '10c',
  (d) => bumpNumber(d, 'README.th.md', /<!--cost:(\d+),\d+,\d+,\d+-->/),
  /cost marker claims \d+ tokens\/turn of total/);

// --- 10d. the measured cost, as Claude Code reports it -----------------------
// The estimate above said ~958 while a real set-up project cost ~2,190. These pin the
// measured figure to the README, in both languages and in the badge.
breaks('a measured figure in the README that is not the measured one', '10d',
  (d) => bumpNumber(d, 'README.md', /<!--measured:(\d+),/),
  /README\.md: its measured-cost marker says/);

breaks('a translation that lost its measured-cost marker', '10d',
  (d) => editText(d, 'README.th.md', (t) => t.replace(/<!--measured:[\d,]+-->/, '')),
  /README\.th\.md: the cost section must carry <!--measured:/);

breaks('a badge that quotes an old cost', '10d',
  (d) => editText(d, 'README.md', (t) => t.replace(/badge\/costs-~[\d.]+k/, 'badge/costs-~1.0k')),
  /its badge says ~1\.0k tokens\/turn/);

breaks('no measurement at all', '10d',
  (d) => removeFile(d, 'docs/cost.json'),
  /docs\/cost\.json: missing or not JSON/);

// A warning, not a failure: CI cannot re-measure, so all it can say is that the figure is
// about files that have changed since. A comment is the mutation because the estimate skips
// comments, so the only thing this edit can trip is the fingerprint.
warns('a rule edited after the last measurement', '10d',
  (d) => appendLine(d, 'rules/workflow.md', '<!-- a note added after the measurement -->'),
  /docs\/cost\.json: measured on .*changed since/);

// --- 11. the STATE.md compaction rule must not drift -------------------------
breaks('one of the four copies of the "## Done" cap drifting', '11',
  (d) => editText(d, 'skills/ship/SKILL.md', (t) => t.replace('ten most recent', 'twenty most recent')),
  /skills\/ship\/SKILL\.md.*ten most recent/);

// --- 11b. the template must actually reach kickoff -------------------------
breaks('a template that can never reach kickoff', '11b',
  (d) => editText(d, 'template/docs/STATE.md', (t) => t.replace('<!-- easyclaude:not-kicked-off -->', '')),
  /template\/docs\/STATE\.md: must carry/);

breaks('a session-start script that no longer knows the marker', '11b',
  (d) => editText(d, 'scripts/session-start.mjs',
    (t) => t.replaceAll('<!-- easyclaude:not-kicked-off -->', '<!-- renamed -->')),
  /SessionStart hook must test for/);

breaks("kickoff's state template carrying the not-kicked-off marker", '11b',
  (d) => editText(d, 'skills/kickoff/SKILL.md',
    (t) => t.replace('`docs/STATE.md` starts as', '`docs/STATE.md` starts as <!-- easyclaude:not-kicked-off -->')),
  /every project it sets up would then report itself as never set up/);

breaks("kickoff's state anchor being reworded", '11b',
  (d) => editText(d, 'skills/kickoff/SKILL.md',
    (t) => t.replace('`docs/STATE.md` starts as', '`docs/STATE.md` begins as')),
  /must introduce its state template with the exact phrase/);

// --- 12. only skills that can hear a phrase may be promised one ----------------
breaks('a spoken skill with no documented phrase', '12',
  (d) => editText(d, 'README.md', (t) => t.replace('<!--skill:debug-->', '')),
  /skill "debug" fires on plain English but no row is marked/);

breaks('a phrase promised for a skill that cannot hear one', '12',
  (d) => editText(d, 'README.md', (t) => t.replace('<!--skill:debug-->', '<!--skill:debug--><!--skill:deploy-->')),
  /promises a phrase for "deploy"/);

// --- 12a. the Stop hook must actually run the gate ---------------------------
// The gate is the product. Each of these three left the framework enforcing nothing while
// every other check still passed.
breaks('a Stop hook that runs something else entirely', '12a',
  (d) => editJson(d, 'hooks/hooks.json', (j) => { j.hooks.Stop[0].hooks[0].command = 'echo hello'; }),
  /does not invoke scripts\/verify\.mjs --hook/);

breaks('a Stop hook that runs the gate without --hook', '12a',
  (d) => editJson(d, 'hooks/hooks.json', (j) => {
    j.hooks.Stop[0].hooks[0].command = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs"';
  }),
  /does not invoke scripts\/verify\.mjs --hook/);

breaks('no Stop hook at all', '12a',
  (d) => editJson(d, 'hooks/hooks.json', (j) => { delete j.hooks.Stop; }),
  /no Stop command hook/);

// --- 12b. the hook's time limit and the gate's own budget must agree ---------
breaks("the hook's timeout drifting from the gate's budget", '12b',
  (d) => editJson(d, 'hooks/hooks.json', (j) => { j.hooks.Stop[0].hooks[0].timeout = 45; }),
  /HOOK_TIMEOUT_MS is \d+ms, but the Stop hook/);

// --- 12b. the hook's time limit and the gate's own budget must agree ---------
breaks("the gate losing the line that states its own budget", '12b',
  (d) => editText(d, 'scripts/verify.mjs',
    (t) => t.replace('const HOOK_TIMEOUT_MS =', 'const HOOK_BUDGET_MS =')),
  /no "const HOOK_TIMEOUT_MS = <n>;" line/);

// --- 13. one security policy, two copies, no drift ---------------------------
// Both directions, because the policy is written twice and either copy can be the one
// that falls behind.
breaks('a guardrail the template does not carry', '13',
  (d) => editJson(d, 'template/.claude/settings.json', (j) => { j.permissions.deny.pop(); }),
  /anyone forking the template runs without that guardrail/);

breaks('a guardrail the merged rules do not carry', '13',
  (d) => editJson(d, 'rules/permissions.json', (j) => { j.deny.pop(); }),
  /a project set up by kickoff runs without that guardrail/);

// --- 13b. every command guardrail must be able to match something ------------
// Each mutation goes into both copies, so check 13 stays quiet and only 13b can fire.
const bothDenyLists = (dir, change) => {
  editJson(dir, 'rules/permissions.json', (j) => { j.deny = change(j.deny); });
  editJson(dir, 'template/.claude/settings.json', (j) => { j.permissions.deny = change(j.permissions.deny); });
};

breaks('a guardrail that spells out a whole pipeline', '13b',
  (d) => bothDenyLists(d, (deny) => [...deny, 'Bash(curl * | sh)']),
  /"Bash\(curl \* \| sh\)" can never match/);

breaks('a guardrail with :* in the middle', '13b',
  (d) => bothDenyLists(d, (deny) => [...deny, 'Bash(git:* push)']),
  /"Bash\(git:\* push\)" has :\* before the end/);

breaks('a git guardrail with no PowerShell twin', '13b',
  (d) => bothDenyLists(d, (deny) => deny.filter((r) => !/^PowerShell\(git push --force/.test(r))),
  /has no PowerShell\(git push --force \*\) twin/);

// --- 14. the template must protect what its own docs say it protects ---------
breaks('a template that does not ignore the file it tells you to put keys in', '14',
  (d) => editText(d, 'template/.gitignore', (t) => t.replace(/^\.env$/m, '')),
  /does not ignore "\.env"/);

// --- 15. the cost section must count the skills that are actually always-on --
breaks('an always-on count drifting from the measured set', '15',
  (d) => bumpNumber(d, 'README.th.md', /<!--\s*always-on:(\d+)\s*-->/),
  /claims \d+ always-on skills, measured/);

// --- 16. eval cases must stay loadable ---------------------------------------
// CI does not run these cases, so this check is the only thing on each push standing
// between the suite and quiet rot. Each mutation below is a way a case could be wrong while
// looking fine in a diff.
const CASE = 'evals/plan-feature-on-a-feature-request';
const NEGATIVE = 'evals/quiet-on-a-typo-fix';

breaks('an eval case with a frontmatter key the runner rejects', '16',
  (d) => editText(d, `${CASE}/prompt.md`, (t) => t.replace(/^tags:/m, 'skill: plan-feature\ntags:')),
  /unknown frontmatter key "skill"/);

breaks('an eval case whose name does not match its directory', '16',
  (d) => editText(d, `${CASE}/prompt.md`, (t) => t.replace(/^name:.*$/m, 'name: something-else')),
  /does not match the directory/);

breaks('an eval case run fewer than three times', '16',
  (d) => editText(d, `${CASE}/prompt.md`, (t) => t.replace(/^runs:.*$/m, 'runs: 1')),
  /three is the minimum/);

// The frontmatter has to survive, or this tests the frontmatter parser instead.
breaks('an eval case with an empty prompt', '16',
  (d) => editText(d, `${CASE}/prompt.md`, (t) => t.slice(0, t.indexOf('\n---\n', 4) + 5)),
  /has no body/);

breaks('a grader with a type the runner does not know', '16',
  (d) => editText(d, `${CASE}/graders/outcome.md`, (t) => t.replace('type: llm', 'type: vibes')),
  /is not one of/);

breaks('a case that only proves a skill fired', '16',
  (d) => removeFile(d, `${CASE}/graders/outcome.md`),
  /every grader here is tool_used/);

// The quietest way one of these cases could stop testing anything: assert on a tool the
// case never allows. It matters most for the negative cases, where nothing could have
// fired anyway and the assertion passes on a technicality.
breaks('a grader asserting on a tool the case never allows', '16',
  (d) => editText(d, `${NEGATIVE}/prompt.md`,
    (t) => t.replace(/^allowed_tools:.*$/m, 'allowed_tools: [Read, Glob, Grep]')),
  /passes without testing anything/);

breaks('a grader matching a skill that does not exist', '16',
  (d) => editText(d, `${CASE}/graders/fired.md`,
    (t) => t.replace('input_match: plan-feature', 'input_match: plan-features')),
  /is not a skill in this plugin/);

// Three ways a case could hide from the check entirely. Each one passed while the check
// reported OK on the whole suite, which is worse than a case that fails: it is a check
// covering a subset while reporting on all of it.
const writeAt = (d, relPath, text) => {
  mkdirSync(join(d, relPath, '..'), { recursive: true });
  writeFileSync(join(d, relPath), text);
};

breaks('a case with graders but no prompt, which can never run', '16',
  (d) => writeAt(d, 'evals/no-prompt-case/graders/outcome.md', '---\ntype: llm\n---\n\nSomething.\n'),
  /has graders\/ but no prompt\.md/);

// The CLI globs <eval dir>/**, so one folder deeper is still a case it would run.
breaks('a case nested below the top level', '16',
  (d) => {
    writeAt(d, 'evals/group/nested-case/prompt.md', '---\nnot_a_real_key: x\n---\n\nhello\n');
    writeAt(d, 'evals/group/nested-case/graders/outcome.md', '---\ntype: llm\n---\n\nSomething.\n');
  },
  /evals[\\/]group[\\/]nested-case/);

// The other supported form. This check cannot read it, so it must refuse it rather than
// let an unreadable case sit in the suite looking covered.
breaks('a case written in the form this check cannot read', '16',
  (d) => writeAt(d, 'evals/orphan/case.yaml', 'name: orphan\n'),
  /accepts a case\.yaml only/);

// The one case.yaml it does accept carries the scaffold and nothing else. A grader or a
// prompt slipped in beside it would run without ever being checked.
breaks('a scaffold case.yaml that also carries settings', '16',
  (d) => editText(d, `${CASE}/case.yaml`, (t) => `${t}runs: 1\n`),
  /accepts a case\.yaml only/);

breaks('a scaffold that does not exist', '16',
  (d) => removeFile(d, `${CASE}/setup.sh`),
  /does not exist, so every run of this case fails to start/);

// The runner refuses this path, so each case carries a one-line setup.sh of its own.
breaks('a scaffold outside the case directory', '16',
  (d) => editText(d, `${CASE}/case.yaml`,
    (t) => t.replace(/scaffold_script: .*/, 'scaffold_script: ../_fixture/setup.sh')),
  /leaves the case directory/);

// The runner defaults min to 1. Every should-not-fire grader here was once written with
// max: 0 alone, and the first real run failed all of them whatever the model did.
breaks('a should-not-fire grader that can never pass', '16',
  (d) => editText(d, `${NEGATIVE}/graders/quiet.md`, (t) => t.replace(/^min: 0\n/m, '')),
  /can never pass\. Add "min: 0"/);

// The runner skips a graders/ file with no frontmatter, so notes may sit beside the
// graders. Failing on one made this stricter than the tool it checks for.
warns('a notes file beside the graders', '16',
  (d) => writeAt(d, `${CASE}/graders/NOTES.md`, 'Where these criteria came from.\n'),
  /has no frontmatter, so the runner ignores it/);

breaks('a graders folder holding nothing but notes', '16',
  (d) => {
    for (const g of ['fired.md', 'outcome.md']) removeFile(d, `${CASE}/graders/${g}`);
    writeAt(d, `${CASE}/graders/NOTES.md`, 'Only a note.\n');
  },
  /the runner sees no graders here/);

// The runner reads this frontmatter as YAML, so both list forms are the same to it. The
// line-based reader used for skills rejected the block form, which failed a suite the
// runner would have accepted.
const toBlockList = (t) => t
  .replace('tags: [triggering, positive]', 'tags:\n  - triggering\n  - positive')
  .replace('allowed_tools: [Skill, Read, Glob, Grep]', 'allowed_tools:\n  - Skill\n  - Read\n  - Glob\n  - Grep');

test('16: a case written with YAML block lists is accepted', async () => {
  const dir = workspace();
  editText(dir, `${CASE}/prompt.md`, toBlockList);
  const r = await runValidate(dir);
  assert(r.code === 0,
    `both list forms are valid YAML and the runner accepts both. Output:\n${r.out}`);
}, { covers: '16' });

test('16: a fault in a block-list case is still caught', async () => {
  // Otherwise the fix above would have bought acceptance by checking nothing.
  const dir = workspace();
  editText(dir, `${CASE}/prompt.md`, (t) => toBlockList(t).replace('  - Skill\n', ''));
  const r = await runValidate(dir);
  assert(r.code !== 0, 'a case that withholds the tool it asserts on must still fail.');
  assertMatch(r.out, /not in allowed_tools \(Read, Glob, Grep\)/,
    'the block form must be read as a list, not as one string.');
}, { covers: '16' });

breaks('an outcome case with nothing to grade it', '16',
  (d) => removeFile(d, 'evals/outcomes/outcome-rename-shop/check.mjs'),
  /is tagged outcome but has no check\.mjs/);

breaks('a suite with no should-not-fire case', '16',
  (d) => {
    for (const c of ['quiet-on-a-typo-fix', 'quiet-on-a-security-question']) {
      editText(d, `evals/${c}/prompt.md`, (t) => t.replace('negative]', 'positive]'));
    }
  },
  /no case is tagged "negative"/);

// --- the validator must report, never crash and never go silent --------------
// Both of these once replaced the whole report: a missing README.md sent the cost check
// into a null read, and a broken script was not read for syntax at all.
test('robustness: a missing README is a finding, not a stack trace', async () => {
  const dir = workspace();
  removeFile(dir, 'README.md');
  const r = await runValidate(dir);
  assert(!/TypeError|at Array\.forEach/.test(r.out),
    `a missing README crashed the validator instead of being reported:\n${r.out}`);
  assertMatch(r.out, /README\.md/, 'a missing README was not reported at all.');
  assert(r.code !== 0, 'a missing README must fail the validator.');
});

test('robustness: the validator runs from a directory that is not the repo', async () => {
  // It resolves its own root. It used to read cwd and die on ENOENT over its own report.
  const dir = workspace();
  const r = await runValidate(dir);
  assert(r.code === 0, `the validator must work when run from elsewhere:\n${r.out}`);
});

// --- coverage ----------------------------------------------------------------
// The case that ends the loop. Every numbered check in validate.mjs must have at least one
// mutation test proving it fires. Adding check 16 with no test fails here, and so does
// deleting the last test for check 8.
test('coverage: every check in validate.mjs has a mutation test', () => {
  const source = readFileSync(join(repoRoot, 'scripts', 'validate.mjs'), 'utf8');
  const ids = [...source.matchAll(/^\/\/ --- (\d+[a-z]?)\. (.+?) -*$/gm)].map((m) => [m[1], m[2].trim()]);
  assert(ids.length > 0,
    'no check headings found in validate.mjs. They must read "// --- <id>. <title> ---", ' +
    'because that is what this test counts. If the format changed, change it here too.');

  // Two checks sharing a number would let one hide behind the other's test, which is a
  // check that stops checking by the quietest route this file has.
  const seen = new Map();
  const duplicated = [];
  for (const [id, title] of ids) {
    if (seen.has(id)) duplicated.push(`${id}. ${seen.get(id)} / ${title}`);
    seen.set(id, title);
  }
  assert(duplicated.length === 0,
    `two checks in validate.mjs share a number, so one test would cover both by accident:\n` +
    duplicated.map((d) => `  ${d}`).join('\n'));

  const have = covered();
  const missing = ids.filter(([id]) => !have.has(id));
  assert(missing.length === 0,
    `${missing.length} check(s) in validate.mjs have no mutation test, so nothing would ` +
    'notice if they stopped checking:\n' +
    missing.map(([id, title]) => `  ${id}. ${title}`).join('\n') +
    '\nAdd a case to tests/validate.test.mjs that breaks what each one guards.');

  const stale = [...have].filter((id) => !ids.some(([known]) => known === id));
  assert(stale.length === 0,
    `tests claim to cover check(s) that no longer exist in validate.mjs: ${stale.join(', ')}. ` +
    'Either the check was removed and its test should go, or the heading was renumbered.');
});
