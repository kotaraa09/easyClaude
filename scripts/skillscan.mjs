#!/usr/bin/env node
// Scan a third-party skill with NVIDIA SkillSpector before it is installed.
//
// /easyclaude:skills hands people a catalogue of other people's repositories and tells
// them to install one. That is the framework recommending third-party code, and NVIDIA's
// own numbers on this ecosystem are not comfortable reading: a quarter of skills carry
// vulnerabilities and a twentieth look deliberately hostile. A catalogue without a scanner
// in front of it is a list of things to trust because we said so.
//
// So this runs first, every time, and it fails CLOSED. No scanner means no install. That
// is the whole point of calling it mandatory - a gate that waves things through when it
// cannot see them is decoration. --allow-unscanned exists for the person who has decided
// otherwise, prints loudly, and is not the default.
//
//   node scripts/skillscan.mjs <path|url|zip>
//   node scripts/skillscan.mjs ./my-skill --allow-unscanned
//   node scripts/skillscan.mjs https://github.com/user/skill --json
//
// SkillSpector is NOT vendored and never will be. It is a 5MB Python program with a
// Docker image, against a plugin that ships Node built-ins and nothing else. It is called
// where it lives, the way graft is: the benefit is in the tool, not in carrying it.
//
// No dependencies: node: builtins only, same rule as the rest of scripts/.
import { spawnSync } from 'node:child_process';
import { NEEDS_SHELL } from './connect-core.mjs';

// --no-llm is the default here and the choice is deliberate. With LLM analysis on,
// SkillSpector sends the scanned file CONTENTS to whichever provider is configured. This
// gate runs on code the user has not installed yet and may not own, on a framework whose
// .env is in permissions.deny precisely so secrets cannot leave. Shipping a default that
// uploads unread third-party source to a third party would contradict that on day one.
//
// Static mode still catches the patterns that matter and needs no API key. What it gives
// up is the second-stage filter that trims false positives, so a CAUTION here is more
// likely to be noise than it would be with the model stage on. Say so rather than hide it.
//
// One network call survives --no-llm: rule SC4 asks OSV.dev whether the skill's declared
// dependencies have known CVEs. It sends names and versions, never file contents, and
// falls back to a bundled list when it cannot reach the service.
const SCAN_ARGS = ['--no-llm', '--format', 'json'];

const UVX_SPEC = 'git+https://github.com/NVIDIA/skillspector.git';

// How to get one, in the order a person should try. uv first because it needs no clone
// and no virtualenv of your own; Docker second because it needs no Python at all.
export const INSTALL_HELP = [
  'SkillSpector is not installed. Pick one:',
  '',
  '  uv tool install git+https://github.com/NVIDIA/skillspector.git',
  '  (uv itself: https://docs.astral.sh/uv/getting-started/installation/)',
  '',
  'or, with Docker instead of Python:',
  '',
  '  docker run --rm -v "$PWD:/scan" skillspector scan ./my-skill/ --no-llm',
  '  (build it first: git clone https://github.com/NVIDIA/skillspector.git && cd',
  '   skillspector && docker build -t skillspector .)',
  '',
  'Then run this again. Set SKILLSPECTOR_BIN if it lives somewhere off your PATH.',
];

// The same Windows problem connect-core.mjs documents, and it bites harder here: a uv or
// pipx install puts skillspector.exe on PATH on some machines and a .cmd shim on others,
// and Node cannot start a .cmd through spawn without a shell at all. Try without a shell,
// fall back to one only when the executable could not be launched - never when the scan
// itself returned a verdict we asked for.
export function run(bin, argv, { platform = process.platform, spawn = spawnSync } = {}) {
  let r = spawn(bin, argv, { stdio: 'pipe', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.error && NEEDS_SHELL.has(r.error.code)) {
    if (platform !== 'win32') return { launched: false };
    r = spawn(bin, argv, { stdio: 'pipe', encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 });
  }
  if (r.error) return { launched: false, error: r.error };
  return { launched: true, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Whether a runner is REALLY there, asked separately from the scan itself.
//
// This existed as one combined step and got the worst answer available. spawn of a missing
// command gives ENOENT, the Windows branch retries it through cmd.exe, and cmd.exe answers
// "not recognized as an internal or external command" with exit status 1 and no error
// object. Status 1 is SkillSpector's code for "scored above 50", so a machine with no
// scanner installed was told its skill was dangerous and must not be installed. A security
// gate that invents findings when it is absent is worse than one that is simply absent:
// people learn the verdict is noise and stop reading it.
//
// So ask first, with a call whose only job is to answer "are you there". Exit 0 and some
// output means yes. Anything else - not launched, cmd.exe complaining, a non-zero probe -
// means no, and the caller falls through to the install instructions.
export function present(r) {
  return Boolean(r.launched && r.status === 0 && `${r.stdout}${r.stderr}`.trim());
}

// Tried in order. The env var wins, for a virtualenv or a machine that puts it somewhere
// unusual, and it is also the seam the tests use - there is no other way to exercise the
// "scanner is present" branch on a machine that does not have a 5MB Python program on it.
//
// The uvx entry probes `uvx --version`, not the scanner's. Probing through --from would
// download and build the whole package just to ask whether uv exists, which is a long
// silent wait for a question with a fast answer.
export function runners(env = process.env) {
  const named = env.SKILLSPECTOR_BIN;
  return [
    ...(named ? [{ bin: named, probe: ['--version'], pre: [] }] : []),
    { bin: 'skillspector', probe: ['--version'], pre: [] },
    { bin: 'uvx', probe: ['--version'], pre: ['--from', UVX_SPEC, 'skillspector'] },
  ];
}

// SkillSpector's own contract, not one invented here: 0 means it finished and scored 50 or
// less, 1 means it scored above 50, 2 means it could not scan at all. Exit 2 must never be
// read as a clean bill - it is the scanner failing, which is the case this gate exists for.
export function verdict({ status, stdout }) {
  let report = null;
  try {
    report = JSON.parse(stdout);
  } catch {
    /* fall through to the exit code, which is still a contract */
  }
  const risk = report?.risk_assessment ?? {};
  const say = String(risk.recommendation ?? '').toUpperCase();
  const score = risk.risk_score;

  if (status === 2 || (report === null && status !== 0 && status !== 1)) {
    return { ok: false, label: 'SCAN FAILED', why: 'the scanner could not read this skill', score };
  }
  if (say === 'DO_NOT_INSTALL' || status === 1) {
    return { ok: false, label: 'DO NOT INSTALL', why: 'scored above 50', score };
  }
  if (say === 'CAUTION') {
    return { ok: true, label: 'CAUTION', why: 'findings worth reading before you install', score };
  }
  return { ok: true, label: 'SAFE', why: 'no findings above the threshold', score };
}

// Printed rather than summarised. A gate that says "2 issues" and hides them teaches
// people to type the override, which is worse than no gate.
function issues(stdout) {
  let report = null;
  try {
    report = JSON.parse(stdout);
  } catch {
    return [];
  }
  return (report?.issues ?? []).map((i) => {
    const where = i.file ?? i.path ?? i.location ?? '';
    const what = i.title ?? i.rule ?? i.id ?? 'finding';
    return `  ${String(i.severity ?? '?').toUpperCase().padEnd(9)} ${what}${where ? ` (${where})` : ''}`;
  });
}

// Only run when invoked as a script. The exports above exist so the verdict rules can be
// tested without a 5MB Python program present, which is the only way they get tested at all.
const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invoked) {
  const args = process.argv.slice(2);
  const has = (n) => args.includes(`--${n}`);
  const target = args.find((a) => !a.startsWith('--'));

  if (!target) {
    console.error('usage: node scripts/skillscan.mjs <path|url|zip> [--allow-unscanned] [--json]');
    process.exit(2);
  }

  let result = null;
  for (const { bin, probe, pre } of runners()) {
    if (!present(run(bin, probe))) continue;
    result = run(bin, [...pre, 'scan', target, ...SCAN_ARGS]);
    break;
  }

  if (!result?.launched) {
    if (has('allow-unscanned')) {
      console.log(`\nNOT SCANNED  ${target}`);
      console.log('You passed --allow-unscanned, so this was installed without being checked.');
      console.log('NVIDIA measured this ecosystem at roughly a quarter vulnerable and a');
      console.log('twentieth deliberately hostile. Read the skill yourself before you trust it.\n');
      process.exit(0);
    }
    console.error('');
    for (const line of INSTALL_HELP) console.error(line);
    console.error('');
    console.error('Refusing to report a skill as safe without scanning it. To install anyway,');
    console.error('and to say so out loud, add --allow-unscanned.');
    process.exit(3);
  }

  if (has('json')) {
    console.log(result.stdout.trim() || '{}');
    process.exit(verdict(result).ok ? 0 : 1);
  }

  const v = verdict(result);
  console.log(`\n${v.label}  ${target}${v.score === undefined ? '' : `  (risk ${v.score}/100)`}`);
  console.log(`  ${v.why}`);
  const found = issues(result.stdout);
  if (found.length) {
    console.log('');
    for (const line of found.slice(0, 20)) console.log(line);
    if (found.length > 20) console.log(`  ...and ${found.length - 20} more`);
  }
  if (v.label === 'SCAN FAILED' && result.stderr.trim()) {
    console.log(`\n  ${result.stderr.trim().split('\n')[0].slice(0, 200)}`);
  }
  console.log(
    v.ok
      ? '\nStatic analysis only, so this is a floor and not a guarantee. Read the code too.\n'
      : '\nDo not install this. If you believe the score is wrong, read the findings and say why.\n'
  );
  process.exit(v.ok ? 0 : 1);
}
