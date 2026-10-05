// Two moments when one message costs far more than it looks: reopening an old conversation,
// and switching model in a long one. Claude Code now reports the figure in the hook input
// before the request is sent, so these notices can say it while the user can still choose.
//
// Both go out as systemMessage, which the user sees and Claude does not. A notice to Claude
// would ride on the very request it warns about, which is already paid for by then. The
// text is fixed English for the same reason prompt-check.mjs gives: a hook message cannot
// follow the user's language. It is kept short and plain for that reason.
//
// Small conversations say nothing. Claude Code already confirms a switch while the cache is
// warm, and repeating a few cents back to someone is noise.
//
// No dependencies: node: builtins only, same rule as validate.mjs.

// The smallest re-send worth interrupting for. Below this, /clear saves less than it costs
// to read the notice.
export const NOTICE_USD = 0.25;
// When Claude Code has no price for the model, tokens stand in: roughly $0.25 at list
// price on the models this is likely to see.
export const NOTICE_TOKENS = 50_000;

function worth(payload) {
  const usd = Number(payload.estimated_cache_write_usd);
  const tokens = Number(payload.context_tokens) || 0;
  return Number.isFinite(usd) && usd > 0 ? usd >= NOTICE_USD : tokens >= NOTICE_TOKENS;
}

function size(payload) {
  const k = `about ${Math.round((Number(payload.context_tokens) || 0) / 1000)}k tokens`;
  const usd = Number(payload.estimated_cache_write_usd);
  if (!Number.isFinite(usd) || usd <= 0) return k;
  const rough = payload.pricing === 'default' ? 'roughly' : 'about';
  return `${k}, ${rough} $${usd.toFixed(2)}`;
}

// plan: the path of the project's plan file (docs/STATE.md unless it moved, see
// locations.mjs), so a fresh conversation loses nothing and the notice can say so. Without
// one, /clear is still cheaper, but not free.
const planTail = (plan) => plan
  ? `. Nothing is lost: your plan is in ${plan === true ? 'docs/STATE.md' : plan}, and the next session opens with it.`
  : '.';

// SessionStart with source "resume" or "fork".
export function resumeNotice(payload, plan) {
  if (!['resume', 'fork'].includes(payload.source)) return null;
  if (payload.prompt_cache_likely_expired !== true || !worth(payload)) return null;
  return `easyClaude: the saved copy of this conversation has expired, so your first message ` +
    `will send all of it again (${size(payload)}). If you are starting a new task, /clear is ` +
    `cheaper${planTail(plan)}`;
}

// PreModelSwitch. Only while the cache is warm: once it has expired, the next request
// re-sends everything on either model, so switching costs nothing extra.
export function switchNotice(payload, plan) {
  if (payload.prompt_cache_warm !== true || !worth(payload)) return null;
  return `easyClaude: switching model now sends this whole conversation again (${size(payload)}), ` +
    `because each model keeps its own copy. If you are starting a new task, run /clear first and ` +
    `then switch${planTail(plan)}`;
}
