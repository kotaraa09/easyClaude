// Provider catalog for asset generation.
//
// THE RULE FOR WHAT BELONGS HERE: a provider earns a slot only if it does something Claude
// cannot. Claude already writes text, so a text-only API adds nothing to a script whose
// entire reason for existing is that Claude can't draw, record, or model. That single rule
// is why the REJECTED list below is as long as this one, and it is written down so the next
// person adds a provider on purpose rather than by enthusiasm.
//
// `tested` is honest and load-bearing:
//   true  - a real generation was run against this provider and produced a usable file
//   false - the adapter follows the provider's documented API, but nobody has made a file
//           with it yet. It may be wrong. Run `--check` to at least prove your key works.
//
// Every base URL here was verified reachable before shipping (401/403/422 from an
// unauthenticated request proves the host is real; 200 where the endpoint is public).

const j = { 'Content-Type': 'application/json' };
const b64 = (s) => Buffer.from(s, 'base64');

export const PROVIDERS = [
  {
    id: 'replicate',
    key: 'REPLICATE_API_TOKEN',
    where: 'https://replicate.com/account/api-tokens',
    modalities: ['image', 'video', 'audio', '3d'],
    tested: true,
    note: 'aggregator - one key covers every modality',
    check: (k) => ['https://api.replicate.com/v1/account', { headers: { Authorization: `Bearer ${k}` } }],
    // Replicate is async: create a prediction, then poll until terminal. `Prefer: wait`
    // usually returns it finished, but long video jobs still come back queued.
    async generate({ kind, prompt, model, flag, key, ext }) {
      const input = { prompt };
      if (kind === 'image') {
        input.aspect_ratio = String(flag('aspect', '1:1'));
        input.output_format = (ext || 'webp').replace('jpg', 'jpeg');
      } else if (kind === 'audio') {
        input.duration = Number(flag('duration', 8));
      } else if (kind === '3d') {
        const img = flag('image-url');
        if (!img) throw new Error('--kind 3d needs --image-url (generate an image first, then convert it)');
        input.images = [String(img)];
      }
      const headers = { Authorization: `Bearer ${key}`, ...j, Prefer: 'wait' };
      const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: 'POST', headers, body: JSON.stringify({ input }),
      });
      if (res.status === 401) throw new Error('Replicate rejected the token (401).');
      if (res.status === 402) throw new Error('Replicate says payment is required (402). Add billing or credits.');
      if (res.status === 404) throw new Error(`model "${model}" not found (404). Slugs change - try --list or pass --model.`);
      if (!res.ok) throw new Error(`Replicate returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

      let pred = await res.json();
      const deadline = Date.now() + Number(flag('timeout', 600)) * 1000;
      while (['starting', 'processing'].includes(pred.status)) {
        if (Date.now() > deadline) throw new Error(`timed out; check https://replicate.com/predictions/${pred.id}`);
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${key}` } });
        if (!poll.ok) throw new Error(`polling failed with ${poll.status}`);
        pred = await poll.json();
      }
      if (pred.status !== 'succeeded') throw new Error(`generation ${pred.status}: ${pred.error ?? 'no error given'}`);

      // Output may be a bare URL, an array of them, or an object wrapping one.
      const o = pred.output;
      const url = typeof o === 'string' ? o
        : Array.isArray(o) ? (typeof o[0] === 'string' ? o[0] : o[0]?.url)
        : o && typeof o === 'object' ? (o.url ?? Object.values(o).find((v) => typeof v === 'string'))
        : null;
      if (!url) throw new Error(`no output URL in response: ${JSON.stringify(o).slice(0, 200)}`);
      const file = await fetch(url);
      if (!file.ok) throw new Error(`downloading the result failed with ${file.status}`);
      return { buffer: Buffer.from(await file.arrayBuffer()), took: pred.metrics?.predict_time };
    },
  },

  {
    id: 'elevenlabs',
    key: 'ELEVENLABS_API_KEY',
    where: 'https://elevenlabs.io/app/settings/api-keys',
    modalities: ['audio'],
    tested: false,
    note: 'speech and sound effects - the gap Replicate\'s musicgen cannot fill',
    check: (k) => ['https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': k } }],
    // Two different endpoints: --sfx makes a sound effect, otherwise it speaks the prompt.
    // Both return raw audio bytes rather than a URL, so there is nothing to download.
    async generate({ prompt, flag, key }) {
      const sfx = flag('sfx') !== undefined;
      const url = sfx
        ? 'https://api.elevenlabs.io/v1/sound-generation'
        : `https://api.elevenlabs.io/v1/text-to-speech/${String(flag('voice', 'EXAVITQu4vr4xnSDxMaL'))}`;
      const body = sfx
        ? { text: prompt, duration_seconds: Number(flag('duration', 5)) }
        : { text: prompt, model_id: 'eleven_multilingual_v2' };
      const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, ...j }, body: JSON.stringify(body) });
      if (res.status === 401) throw new Error('ElevenLabs rejected the key (401).');
      if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { buffer: Buffer.from(await res.arrayBuffer()) };
    },
  },

  {
    id: 'openai',
    key: 'OPENAI_API_KEY',
    where: 'https://platform.openai.com/api-keys',
    modalities: ['image', 'audio'],
    tested: false,
    note: 'a ChatGPT Plus subscription does NOT include this - it is billed separately',
    check: (k) => ['https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${k}` } }],
    async generate({ kind, prompt, flag, key }) {
      const auth = { Authorization: `Bearer ${key}`, ...j };
      if (kind === 'audio') {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST', headers: auth,
          body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: String(flag('voice', 'alloy')), input: prompt }),
        });
        if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { buffer: Buffer.from(await res.arrayBuffer()) };
      }
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: auth,
        body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: String(flag('size', '1024x1024')) }),
      });
      if (res.status === 401) throw new Error('OpenAI rejected the key (401).');
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const d = (await res.json()).data?.[0];
      if (!d?.b64_json) throw new Error('no image data in the OpenAI response');
      return { buffer: b64(d.b64_json) };
    },
  },

  {
    id: 'venice',
    key: 'VENICE_API_KEY',
    where: 'https://venice.ai/settings/api',
    modalities: ['image'],
    tested: false,
    note: 'privacy-focused aggregator; 39 image models including flux and gpt-image',
    check: (k) => ['https://api.venice.ai/api/v1/models', { headers: { Authorization: `Bearer ${k}` } }],
    async generate({ prompt, model, flag, key, ext }) {
      const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, ...j },
        body: JSON.stringify({
          model: model || 'venice-sd35',
          prompt, format: (ext || 'webp').replace('jpg', 'jpeg'),
          width: Number(flag('width', 1024)), height: Number(flag('height', 1024)),
        }),
      });
      if (res.status === 401) throw new Error('Venice rejected the key (401).');
      if (!res.ok) throw new Error(`Venice returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const out = await res.json();
      const img = out.images?.[0];
      if (!img) throw new Error('no image in the Venice response');
      return { buffer: b64(img) };
    },
  },

  {
    id: 'gemini',
    key: 'GEMINI_API_KEY',
    where: 'https://aistudio.google.com/apikey',
    modalities: ['image'],
    tested: false,
    note: 'a Gemini Advanced subscription does NOT include this - the API key is separate',
    check: (k) => [`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`, {}],
    async generate({ prompt, model, key }) {
      const m = model || 'gemini-2.5-flash-image';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
        { method: 'POST', headers: j, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      if (!res.ok) throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const parts = (await res.json()).candidates?.[0]?.content?.parts ?? [];
      const inline = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!inline) throw new Error('no image data in the Gemini response');
      return { buffer: b64(inline) };
    },
  },

  {
    id: 'local',
    key: null, // A URL, not a secret - the whole point is that it costs nothing.
    where: 'run Automatic1111 or ComfyUI yourself; set LOCAL_SD_URL if not on the default port',
    modalities: ['image'],
    tested: false,
    note: 'free per image, works offline - the only zero-cost option here',
    check: () => [`${localUrl()}/sdapi/v1/sd-models`, {}],
    async generate({ prompt, flag }) {
      const res = await fetch(`${localUrl()}/sdapi/v1/txt2img`, {
        method: 'POST', headers: j,
        body: JSON.stringify({
          prompt, steps: Number(flag('steps', 25)),
          width: Number(flag('width', 1024)), height: Number(flag('height', 1024)),
        }),
      }).catch(() => { throw new Error(`nothing answering at ${localUrl()} - start the WebUI with --api first`); });
      if (!res.ok) throw new Error(`local WebUI returned ${res.status}`);
      const img = (await res.json()).images?.[0];
      if (!img) throw new Error('no image in the local WebUI response');
      return { buffer: b64(img) };
    },
  },
];

export const localUrl = () => process.env.LOCAL_SD_URL || 'http://127.0.0.1:7860';

// Considered and deliberately left out. Written down so the rule at the top of this file is
// enforced by reading rather than by memory.
export const REJECTED = [
  ['ollama', 'runs locally and free, but text and vision-input only. It cannot generate media, and Claude already writes text.'],
  ['deepseek', 'text only. Same reason as ollama.'],
  ['kimi / moonshot', 'text only.'],
  ['openrouter', 'an aggregator, but overwhelmingly text. Nothing here it uniquely unlocks.'],
  ['github copilot', 'no media generation, and no general-purpose API to call.'],
  ['notebooklm', 'a research product with no generation API at all. Nothing to connect.'],
  ['midjourney', 'NO official API - it is Discord-only. Every "Midjourney API" you will find is an unofficial reseller. Do not add one.'],
];
