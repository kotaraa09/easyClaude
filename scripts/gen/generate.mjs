#!/usr/bin/env node
// Generate images, video, audio, or 3D models for a project.
//
// Deliberately a script rather than an MCP server: no tool schemas riding along in
// every turn, it works in CI, it is reviewable, and a spend guard is trivial to add.
//
// One aggregator key covers every modality. The token is read here, inside the script,
// so it never enters the model's context - which is also why .env stays in permissions.deny.
//
//   node generate.mjs --kind image --prompt "..." --out public/hero.png
//   node generate.mjs --list
//   node generate.mjs --kind video --prompt "..." --out media/clip.mp4 --dry-run

import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';

const API = 'https://api.replicate.com/v1';

// Defaults chosen for cost and availability. Replicate slugs DO change - if one 404s,
// pass --model owner/name. `--list` prints these.
const MODELS = {
  image: { slug: 'black-forest-labs/flux-schnell', ext: '.webp', note: 'fast and cheap; use flux-1.1-pro for final art' },
  video: { slug: 'minimax/video-01', ext: '.mp4', note: 'slow and the most expensive kind here' },
  audio: { slug: 'meta/musicgen', ext: '.wav', note: 'music; for speech or SFX prefer ElevenLabs' },
  '3d': { slug: 'firtoz/trellis', ext: '.glb', note: 'image-to-3D; needs --image-url' },
};

const args = process.argv.slice(2);
const flag = (n, d = undefined) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : (args[i + 1] ?? true);
};
const has = (n) => args.includes(`--${n}`);
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };

if (has('list') || args.length === 0) {
  console.log('Modalities (override any with --model owner/name):\n');
  for (const [k, v] of Object.entries(MODELS)) {
    console.log(`  ${k.padEnd(6)} ${v.slug.padEnd(34)} ${v.note}`);
  }
  console.log('\nEvery call costs real money. Use --dry-run to see what would happen.');
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
if (existsSync(outPath) && !has('force')) {
  die(`${out} already exists - pass --force to overwrite`);
}

const model = String(flag('model', MODELS[kind].slug));
if (!/^[\w.-]+\/[\w.-]+$/.test(model)) die(`--model must look like owner/name, got "${model}"`);

// --- token: env first, then the project's .env. Never printed. ---------------
function token() {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^REPLICATE_API_TOKEN\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

// --- input shaping per modality ----------------------------------------------
const input = { prompt };
if (kind === 'image') {
  input.aspect_ratio = String(flag('aspect', '1:1'));
  input.output_format = (extname(outPath).slice(1) || 'webp').replace('jpg', 'jpeg');
} else if (kind === 'audio') {
  input.duration = Number(flag('duration', 8));
} else if (kind === '3d') {
  const img = flag('image-url');
  if (!img) die('--kind 3d needs --image-url (generate an image first, then convert it)');
  input.images = [String(img)];
}

if (dryRun) {
  console.log('DRY RUN - nothing generated, nothing charged\n');
  console.log(`  model   ${model}`);
  console.log(`  out     ${out}`);
  console.log(`  input   ${JSON.stringify(input, null, 2).split('\n').join('\n          ')}`);
  process.exit(0);
}

const key = token();
if (!key) {
  die('no REPLICATE_API_TOKEN found in the environment or ./.env\n' +
      '       get one at https://replicate.com/account/api-tokens, then add to .env:\n' +
      '       REPLICATE_API_TOKEN=r8_...');
}

// --- run ----------------------------------------------------------------------
const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'wait',
};

console.log(`generating ${kind} via ${model} (this costs money)...`);

let res;
try {
  res = await fetch(`${API}/models/${model}/predictions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });
} catch (e) {
  die(`network failure calling Replicate: ${e.message}`);
}

if (res.status === 401) die('Replicate rejected the token (401). Check REPLICATE_API_TOKEN.');
if (res.status === 402) die('Replicate says payment is required (402). Add billing or credits.');
if (res.status === 404) die(`model "${model}" not found (404). Slugs change - try --list or pass --model.`);
if (!res.ok) die(`Replicate returned ${res.status}: ${(await res.text()).slice(0, 400)}`);

let pred = await res.json();

// `Prefer: wait` usually returns a finished prediction, but long jobs still come back
// queued. Poll until terminal, with a ceiling so this can never hang a session.
const deadline = Date.now() + Number(flag('timeout', 600)) * 1000;
while (['starting', 'processing'].includes(pred.status)) {
  if (Date.now() > deadline) die(`timed out waiting for ${model}; check https://replicate.com/predictions/${pred.id}`);
  await new Promise((r) => setTimeout(r, 2000));
  const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${key}` } });
  if (!poll.ok) die(`polling failed with ${poll.status}`);
  pred = await poll.json();
}

if (pred.status !== 'succeeded') die(`generation ${pred.status}: ${pred.error ?? 'no error given'}`);

// Output may be a bare URL, an array of them, or an object wrapping one.
const url = (() => {
  const o = pred.output;
  if (typeof o === 'string') return o;
  if (Array.isArray(o)) return typeof o[0] === 'string' ? o[0] : o[0]?.url;
  if (o && typeof o === 'object') return o.url ?? Object.values(o).find((v) => typeof v === 'string');
  return null;
})();
if (!url) die(`could not find an output URL in the response: ${JSON.stringify(pred.output).slice(0, 300)}`);

const file = await fetch(url);
if (!file.ok) die(`downloading the result failed with ${file.status}`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(await file.arrayBuffer()));

// --- spend log ----------------------------------------------------------------
// Generation costs money and leaves no other trace. Write it down.
const logPath = resolve(process.cwd(), 'docs/asset-log.md');
if (!existsSync(logPath)) {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, '# Generated assets\n\nEvery generation costs money. This is the record.\n\n' +
    '| date | kind | model | output | prompt |\n|---|---|---|---|---|\n');
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
appendFileSync(logPath, `| ${new Date().toISOString().slice(0, 10)} | ${kind} | ${esc(model)} | ${esc(out)} | ${esc(prompt).slice(0, 90)} |\n`);

const kb = Math.round(Buffer.byteLength(readFileSync(outPath)) / 1024);
console.log(`wrote ${out} (${kb} KB)`);
console.log(`logged to docs/asset-log.md`);
if (pred.metrics?.predict_time) console.log(`took ${pred.metrics.predict_time.toFixed(1)}s`);
