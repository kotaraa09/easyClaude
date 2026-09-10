// Tests for the Replicate adapter's polling loop.
//
// This is the only code in the repo that spends real money and then waits, and it had no
// test of any kind. It also carried a bug its own comment described: the comment said long
// video jobs "still come back queued", and the loop waited only on `starting` and
// `processing` - so a queued job skipped the loop entirely and failed instantly as
// `generation queued`, on a prediction that was running fine and had already been charged
// for.
//
// Nothing here touches the network. The adapter takes its fetch and its sleep as defaulted
// arguments, so the whole sequence - create, poll, poll, download - is driven from here.
import { test, assert, assertMatch } from './harness.mjs';
import { PROVIDERS } from '../scripts/gen/providers.mjs';

const replicate = PROVIDERS.find((p) => p.id === 'replicate');

// Each entry answers one call, in order. The last entry answers every call after it, which
// is what lets a test poll an unfinished job as many times as it likes.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  fn.calls = calls;
  return fn;
}

const json = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});
const bytes = (...values) => ({
  ok: true, status: 200, arrayBuffer: async () => new Uint8Array(values).buffer,
});
const POLL_URL = 'https://api.replicate.com/v1/predictions/p1';
const pending = (status) => json({ status, id: 'p1', urls: { get: POLL_URL } });
const done = (output) => json({ status: 'succeeded', id: 'p1', output, metrics: { predict_time: 1.5 } });

// sleep is stubbed out, or every polling case would take two seconds per turn of the loop.
const generate = (fetchImpl, over = {}) => replicate.generate({
  kind: 'image',
  prompt: 'a cat',
  model: 'owner/name',
  key: 'r8-token',
  ext: 'png',
  flag: (_name, fallback) => fallback,
  fetchImpl,
  sleep: async () => {},
  ...over,
});

// --- the bug -------------------------------------------------------------------
test('replicate: a job that comes back queued is waited for, not failed', async () => {
  const f = fakeFetch(pending('queued'), pending('processing'), done('https://cdn/out.png'), bytes(1, 2, 3));
  const r = await generate(f);
  assert(r.buffer.length === 3, 'the finished job must be downloaded.');
  assert(f.calls.length === 4, `expected create, two polls and a download, got ${f.calls.length} calls.`);
});

test('replicate: starting and processing are waited for too', async () => {
  for (const first of ['starting', 'processing']) {
    const f = fakeFetch(pending(first), done('https://cdn/out.png'), bytes(9));
    const r = await generate(f);
    assert(r.buffer.length === 1, `a job that began as "${first}" must be waited for.`);
  }
});

test('replicate: a job already finished is not polled at all', async () => {
  // `Prefer: wait` usually returns it finished. That path must not cost an extra call.
  const f = fakeFetch(done('https://cdn/out.png'), bytes(4, 5));
  const r = await generate(f);
  assert(r.buffer.length === 2, 'the result must be downloaded.');
  assert(f.calls.length === 2, `a finished job needs create and download only, got ${f.calls.length}.`);
});

// --- the ways a job ends badly ---------------------------------------------------
test('replicate: a failed job reports what the API said', async () => {
  const f = fakeFetch(json({ status: 'failed', id: 'p1', error: 'NSFW content detected' }));
  await assertRejects(() => generate(f), /failed.*NSFW content detected/,
    'the API\'s own reason is what tells the user whether to retry.');
});

test('replicate: a cancelled job stops rather than polling forever', async () => {
  const f = fakeFetch(json({ status: 'canceled', id: 'p1' }));
  await assertRejects(() => generate(f), /canceled/, 'a cancelled job is finished, not pending.');
});

test('replicate: a response with no polling URL says so instead of throwing a TypeError', async () => {
  const f = fakeFetch(json({ status: 'queued', id: 'p1' }));
  await assertRejects(() => generate(f), /no polling URL/,
    'dereferencing undefined here buries the prediction id the user needs.');
});

test('replicate: polling that starts failing is reported', async () => {
  const f = fakeFetch(pending('queued'), json({}, { ok: false, status: 503 }));
  await assertRejects(() => generate(f), /polling failed with 503/, 'a broken poll must not look like a result.');
});

test('replicate: a job that never finishes stops at the deadline', async () => {
  const f = fakeFetch(pending('processing'));
  // A deadline already in the past, so the loop gives up on its first turn.
  await assertRejects(() => generate(f, { flag: (name, fallback) => (name === 'timeout' ? 0 : fallback) }),
    /timed out/, 'a job that never finishes must not poll for ever.');
});

// --- reading the output ------------------------------------------------------------
test('replicate: the output URL is found however the API wraps it', async () => {
  const wrappings = [
    ['a bare string', 'https://cdn/out.png'],
    ['an array', ['https://cdn/out.png']],
    ['an array of objects', [{ url: 'https://cdn/out.png' }]],
    ['an object', { url: 'https://cdn/out.png' }],
  ];
  for (const [shape, output] of wrappings) {
    const f = fakeFetch(done(output), bytes(7));
    const r = await generate(f);
    assert(r.buffer.length === 1, `the output URL was not found when the API returned ${shape}.`);
    assert(f.calls[f.calls.length - 1].url === 'https://cdn/out.png',
      `the wrong URL was downloaded for ${shape}: ${f.calls[f.calls.length - 1].url}`);
  }
});

test('replicate: a success with no output URL is reported', async () => {
  const f = fakeFetch(done(null));
  await assertRejects(() => generate(f), /no output URL/, 'an empty result must not be written to disk.');
});

// --- the errors that come before any polling -----------------------------------------
test('replicate: a rejected token, a billing problem and a bad slug each say which', async () => {
  for (const [status, expected] of [[401, /rejected the token/], [402, /payment is required/], [404, /not found/]]) {
    const f = fakeFetch(json({}, { ok: false, status }));
    await assertRejects(() => generate(f), expected, `HTTP ${status} must be explained, not passed through raw.`);
  }
});

// A rejects helper, kept here rather than in the harness: this is the only suite whose
// subject is an async function that throws.
async function assertRejects(fn, pattern, message) {
  let threw = null;
  try {
    await fn();
  } catch (e) {
    threw = e;
  }
  assert(threw !== null, `${message}\n  expected it to throw, but it returned normally.`);
  assertMatch(threw.message, pattern, message);
}
