// The /clear reminder: in a long conversation, the first message of a new stretch is held
// once, with a note that says what the length costs and that /clear loses nothing. Sending
// the message again lets it through. The pattern is Cache Tax's cold-send guard
// (karanb192/cache-tax).
//
// Until now scripts/prompt-check.mjs asked Claude to say this. That cost tokens in a
// conversation that was already expensive, and it came only after the task, when the user
// had paid for it. A note from here costs nothing and comes before the message is sent.
//
// Cheap mode keeps its own, stricter hold in prompt-check.mjs, so nothing is held here
// while it is on.
//
// Claude Code takes one hook per event from a plugin, so session.start, prompt.submit and
// turn.complete are hooked in panels.tsx, which calls the functions below. This file hooks
// only the events nothing else in easyClaude does.
import type { Register } from 'claude-code'

// History, in tokens, beyond what a fresh conversation carries. Same figure as
// prompt-check.mjs used for its advice.
export const ADVICE_LIMIT = 80_000
// What a fresh conversation carries before any history: Claude Code's own prompt, its tools
// and the project's files. Measured once a fresh conversation's first turn ends; until then,
// as after a resume, this guess stands in.
export const FLOOR_GUESS = 30_000

const THAI = /[฀-๿]/

// The note, in Thai when the message is, and in English otherwise.
export function holdText(history: number, plan: string | null, message: string): string {
  const thai = THAI.test(message)
  const k = `${Math.round(history / 1000)}k`
  if (thai) {
    return `easyClaude: บทสนทนานี้ยาวแล้ว มีประวัติประมาณ ${k} โทเคน และทุกขั้นตอนจะอ่านประวัติทั้งหมดซ้ำ ` +
      `ถ้านี่เป็นงานใหม่ ให้พิมพ์ /clear ก่อน${plan ? ` แผนของคุณยังอยู่ใน ${plan}` : ''} และทุกขั้นตอนจะถูกลง ` +
      'ถ้าจะทำต่อในบทสนทนานี้ ให้ส่งข้อความเดิมอีกครั้ง'
  }
  return `easyClaude: this conversation holds about ${k} tokens of history, and every step re-reads all of it. ` +
    `If this is a new task, type /clear first${plan ? `: your plan stays in ${plan}` : ''}, and every step costs less. ` +
    'To go on here, send your message again.'
}

export type Guard = {
  // The smallest context seen this conversation; null until a fresh one's first turn ends.
  floor: number | null
  // Set on a fresh start (/clear, a new session): its first turn's context is the floor.
  expectFloor: boolean
  // The context after the last turn, or null before one. Read when a turn ends, never when
  // a message is sent: reading the figures there held every message back by about a second.
  ctx: number | null
  // The context when a message was last held, or null: one hold per long stretch.
  heldAt: number | null
  // False for a `-p` run or the SDK: nobody is there to send the message again.
  isInteractive: boolean
}

export const freshGuard = (isInteractive = true): Guard =>
  ({ floor: null, expectFloor: true, ctx: null, heldAt: null, isInteractive })

// Whether to hold this message, given the conversation's size after the last turn.
export function shouldHold(g: Guard, text: string, fromPlugin: boolean): boolean {
  const ctx = g.ctx
  if (!g.isInteractive || fromPlugin || ctx === null || text.trimStart().startsWith('/')) return false
  // Held once already in this stretch. A conversation that shrank to half since then is a new
  // stretch: /compact, or anything else that cut it down.
  if (g.heldAt !== null && ctx >= g.heldAt / 2) return false
  return ctx - (g.floor ?? FLOOR_GUESS) > ADVICE_LIMIT
}

// The size after a turn of the main conversation. The first turn of a fresh one is its floor.
export const afterTurn = (g: Guard, ctx: number | null): Guard =>
  ctx === null ? g : { ...g, ctx, floor: g.expectFloor ? ctx : Math.min(g.floor ?? ctx, ctx), expectFloor: false }

// Module state: a reload starts it over, which costs one floor measurement at most.
let g = freshGuard()

// --- called from panels.tsx, which owns these three events ----------------------------
// Claude Code follows `$` only within one file, so none of these takes it.
// Only who is there: a load starts the module, and so the guard, over already, and a resume's
// size may have been read before this runs.
export const clearOnStart = (isInteractive: boolean) => { g = { ...g, isInteractive } }

export const clearOnTurnEnd = (ctx: number | null) => { g = afterTurn(g, ctx) }

// The history to hold this message for, in tokens, or null to let it through. Pure, so an
// ordinary message waits on nothing; panels.tsx reads the plan file only for a hold.
export const clearHistory = (text: string, fromPlugin: boolean): number | null =>
  shouldHold(g, text, fromPlugin) && g.ctx !== null ? g.ctx - (g.floor ?? FLOOR_GUESS) : null

// The message was held: none again in this stretch.
export const clearHeld = () => { g = { ...g, heldAt: g.ctx } }

export const register: Register = (on) => {
  // A resumed conversation has history, so its first turn is no floor; /clear starts a fresh one.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear') g = freshGuard(g.isInteractive)
    else if (e.source === 'resume' || e.source === 'compact') {
      // A resumed conversation is the costly case, so its size is read now, before the first
      // message: the figures the engine restored with it.
      let ctx: number | null = null
      if (e.source === 'resume') {
        try {
          const t = (await $.session.usage()).context?.tokens
          ctx = typeof t === 'number' && t > 0 ? t : null
        } catch { /* unknown until the first turn ends */ }
      }
      g = { ...g, ctx, heldAt: null, expectFloor: false }
    }
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // The size before it is no guide: the next turn's end measures the shorter one.
    if (!e.agentId) g = { ...g, ctx: null, heldAt: null, expectFloor: false }
    return r
  })
}
