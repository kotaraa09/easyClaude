#!/usr/bin/env node
// Generate images, video, audio, or 3D models for a project.
//
// Deliberately a script rather than an MCP server: no tool schemas riding along in every
// turn, it works in CI, it is reviewable, and a spend guard is trivial to add.
//
// Keys are read HERE, inside the script, so they never enter the model's context - which is
// also why .env stays in permissions.deny. The provider catalog lives in providers.mjs
// alongside the rule for what is allowed in it.
//
//   node generate.mjs --kind image --prompt "..." --out public/hero.png
//   node generate.mjs --list                 modalities, providers, and which are tested
//   node generate.mjs --check                prove your keys work, without generating
//   node generate.mjs --kind video --prompt "..." --out clip.mp4 --dry-run

import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { PROVIDERS, REJECTED, localUrl } from './providers.mjs';
import { readEnv } from '../env.mjs';

// Replicate slugs, kept because it is the only provider addressed by owner/name. Slugs DO
// change - if one 404s, pass --model.
const MODELS = {
  image: { slug: 'black-forest-labs/flux-schnell', note: 'fast and cheap; use flux-1.1-pro for final art' },
  video: { slug: 'minimax/video-01', note: 'slow and the most expensive kind here' },
  audio: { slug: 'meta/musicgen', note: 'music only; use --provider elevenlabs for speech or SFX' },
  '3d': { slug: 'firtoz/trellis', note: 'image-to-3D; needs --image-url' },
};

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };

// Every flag read through here takes a value; boolean switches go through has(). Both are
// handed to the adapters, because an adapter that only had flag() had to route its one
// boolean switch through it - and then died on the value that never followed.
//
// The old version returned `args[i + 1] ?? true`, which meant `--prompt --out x.png`
// silently took "--out" as the prompt, and a trailing `--prompt` became the boolean
// true and then the string "true". Both passed the required-value checks below and
// both reached a paid API. A generator that spends money on a typo has to refuse it
// instead of guessing.
const flag = (n, d = undefined) => {
  // --name=value is checked first, so a value that legitimately begins with "--"
  // stays expressible now that a bare "--" prefix is rejected.
  const eq = args.find((a) => a.startsWith(`--${n}=`));
  if (eq !== undefined) {
    const v = eq.slice(n.length + 3);
    if (!v) die(`--${n}= was given with nothing after it`);
    return v;
  }
  const i = args.indexOf(`--${n}`);
  if (i === -1) return d;
  const next = args[i + 1];
  if (next === undefined) die(`--${n} needs a value, but nothing followed it`);
  if (next.startsWith('--')) die(`--${n} needs a value, but the next argument is "${next}". Use --${n}=<value> if the value really starts with "--".`);
  return next;
};

// env first, then the project's .env. Returned only to the adapter, never printed.
//
// Read once and cached: keyFor() is called several times per run, and re-reading the file
// per call was the reason it had its own parser at all. That parser required the key to
// start at column zero, so an indented line here was "no key set" while connect.mjs, in
// the same repo and against the same file, reported "key present". env.mjs is now the one
// reader for both.
let form;
function keyFor(name) {
  if (!name) return null;
  if (process.env[name]) return process.env[name];
  form ??= readEnv(process.cwd());
  return form.values.get(name) ?? null;
}

const available = (p) => p.key === null || keyFor(p.key) !== null;

if (has('list') || args.length === 0) {
  console.log('\nModalities (Replicate defaults; override with --model owner/name):\n');
  for (const [k, v] of Object.entries(MODELS)) {
    console.log(`  ${k.padEnd(6)} ${v.slug.padEnd(34)} ${v.note}`);
  }
  console.log('\nProviders (pick with --provider, or the first one holding a key is used):\n');
  for (const p of PROVIDERS) {
    const state = p.key === null ? 'local' : available(p) ? 'ready' : 'no key';
    // Per modality, not per provider. One tested image adapter used to print "tested"
    // beside a video, audio and 3D adapter nobody had ever run.
    const proof = p.tested.length ? `tested: ${p.tested.join(',')}` : 'UNTESTED';
    console.log(`  ${p.id.padEnd(11)} ${p.modalities.join(',').padEnd(22)} ${state.padEnd(7)} ${proof.padEnd(20)} ${p.note}`);
  }
  console.log('\n  A modality listed under "tested" has produced a real file. Anything else follows');
  console.log('  the documented API but has never been run. Use --check to prove the key works.\n');
  console.log('Deliberately not supported:\n');
  for (const [name, why] of REJECTED) console.log(`  ${name.padEnd(16)} ${why}`);
  console.log('\nEvery hosted call costs real money. Use --dry-run to see what would happen.\n');
  process.exit(0);
}

if (has('check')) {
  console.log('\nChecking credentials - one cheap call each, nothing is generated:\n');
  let any = false;
  for (const p of PROVIDERS) {
    if (!available(p)) { console.log(`  ${p.id.padEnd(11)} no key set`); continue; }
    any = true;
    const [url, init] = p.check(keyFor(p.key));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      const verdict = res.ok ? 'OK' : res.status === 401 || res.status === 403 ? `REJECTED (${res.status})` : `HTTP ${res.status}`;
      console.log(`  ${p.id.padEnd(11)} ${verdict}`);
    } catch (e) {
      const hint = p.key === null ? ` - is it running at ${localUrl()}?` : '';
      console.log(`  ${p.id.padEnd(11)} unreachable${hint}`);
    }
  }
  if (!any) console.log('\n  No keys found. Fill them into .env - see .env.example.');
  console.log('');
  process.exit(0);
}

const kind = flag('kind');
const prompt = flag('prompt');
const out = flag('out');
const dryRun = has('dry-run');

if (!MODELS[kind]) die(`--kind must be one of: ${Object.keys(MODELS).join(', ')}`);
if (!prompt) die('--prompt is required');
if (!out) die('--out is required');

const outPath = resolve(process.cwd(), String(out));
if (existsSync(outPath) && !has('force')) die(`${out} already exists - pass --force to overwrite`);

// Provider selection: explicit wins, otherwise the first one that supports this modality
// and actually has a key. Being explicit about which one ran matters for the spend log.
const wanted = flag('provider');
let provider;
if (wanted) {
  provider = PROVIDERS.find((p) => p.id === wanted);
  if (!provider) die(`unknown --provider "${wanted}". Options: ${PROVIDERS.map((p) => p.id).join(', ')}`);
  if (!provider.modalities.includes(kind)) die(`provider "${provider.id}" does not do ${kind} (it does ${provider.modalities.join(', ')})`);
  if (!available(provider)) die(`provider "${provider.id}" needs ${provider.key} in .env - get one at ${provider.where}`);
} else {
  provider = PROVIDERS.find((p) => p.modalities.includes(kind) && available(p));
  if (!provider) {
    die(`no provider configured for ${kind}.\n` +
        `       options: ${PROVIDERS.filter((p) => p.modalities.includes(kind)).map((p) => `${p.id} (${p.key ?? 'local'})`).join(', ')}\n` +
        `       add a key to .env, then re-run. node generate.mjs --list shows where to get one.`);
  }
}

// Per modality. `tested` is a list now, and an empty array is truthy - so every "is this
// adapter proven?" test has to name the kind being generated, or it silently answers yes.
const isTested = provider.tested.includes(kind);

const model = String(flag('model', provider.id === 'replicate' ? MODELS[kind].slug : ''));
if (model && !/^[\w.\/-]+$/.test(model)) die(`--model has unexpected characters: "${model}"`);
const ext = extname(outPath).slice(1);

if (dryRun) {
  console.log('DRY RUN - nothing generated, nothing charged\n');
  console.log(`  provider  ${provider.id}${isTested ? '' : `   (UNTESTED for ${kind})`}`);
  console.log(`  model     ${model || '(provider default)'}`);
  console.log(`  out       ${out}`);
  console.log(`  prompt    ${String(prompt).slice(0, 120)}`);
  process.exit(0);
}

if (!isTested) {
  console.log(`note: nobody has generated ${kind} with ${provider.id} yet - if this fails, run --check first.`);
}
console.log(`generating ${kind} via ${provider.id}${model ? ` (${model})` : ''}${provider.key ? ' - this costs money' : ' - local, free'}...`);

let result;
try {
  result = await provider.generate({ kind, prompt: String(prompt), model, flag, has, key: keyFor(provider.key), ext });
} catch (e) {
  die(e.message);
}
if (!result?.buffer?.length) die('the provider returned no data');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, result.buffer);

// --- spend log ----------------------------------------------------------------
// Generation costs money and leaves no other trace. Write it down.
const logPath = resolve(process.cwd(), 'docs/asset-log.md');
if (!existsSync(logPath)) {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, '# Generated assets\n\nEvery generation costs money. This is the record.\n\n' +
    '| date | kind | provider | model | output | prompt |\n|---|---|---|---|---|---|\n');
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
appendFileSync(logPath, `| ${new Date().toISOString().slice(0, 10)} | ${kind} | ${provider.id} | ${esc(model || 'default')} | ${esc(out)} | ${esc(prompt).slice(0, 90)} |\n`);

const kb = Math.round(result.buffer.length / 1024);
console.log(`wrote ${out} (${kb} KB)`);
console.log('logged to docs/asset-log.md');
if (result.took) console.log(`took ${result.took.toFixed(1)}s`);
