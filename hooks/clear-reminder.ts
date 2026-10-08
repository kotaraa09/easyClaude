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
// turn.complete are hooked in panels.tsx, and turn.step in savvy-progress/, which call the
// functions below. This file hooks only the events nothing else in easyClaude does.
import type { Register } from 'claude-code'

// History, in tokens, beyond what a fresh conversation carries. Same figure as
// prompt-check.mjs used for its advice.
export const ADVICE_LIMIT = 80_000
// What a fresh conversation carries before any history: Claude Code's own prompt, its tools
// and the project's files. Measured on the first model request of a fresh conversation; until
// then, as after a resume or a reload, this guess stands in.
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
  // What the conversation carries before any history: its first model request, measured on a
  // fresh start. Null until then, and after a reload or a resume, where FLOOR_GUESS stands in.
  floor: number | null
  // Set on a fresh start (a new session, /clear): its first model request is the floor.
  expectFloor: boolean
  // The context after the last turn, or null before one. Read when a turn ends, never when
  // a message is sent: reading the figures there held every message back by about a second.
  ctx: number | null
  // The context when a message was last held, or null: one hold per long stretch. Cleared
  // once the conversation shrinks to half of it, so the next long stretch gets one too.
  heldAt: number | null
  // False for a `-p` run or the SDK: nobody is there to send the message again.
  isInteractive: boolean
}

// A reload lands here too, in the middle of a conversation, so nothing is measured as the
// floor until a fresh start says so.
export const freshGuard = (isInteractive = true, expectFloor = false): Guard =>
  ({ floor: null, expectFloor, ctx: null, heldAt: null, isInteractive })

const floorOf = (g: Guard): number => g.floor ?? FLOOR_GUESS

// Whether to hold this message, given the conversation's size after the last turn. Only a
// message a person sent: a helper's report or a scheduled prompt cannot be sent again.
export function shouldHold(g: Guard, text: string, fromPerson: boolean): boolean {
  const ctx = g.ctx
  if (!g.isInteractive || !fromPerson || ctx === null || g.heldAt !== null) return false
  if (!text.trim() || text.trimStart().startsWith('/')) return false
  return ctx - floorOf(g) > ADVICE_LIMIT
}

// One model request of the main conversation: the first of a fresh one is its floor, and no
// request can carry less than the floor.
export const afterStep = (g: Guard, tokens: number): Guard =>
  g.expectFloor ? { ...g, floor: tokens, expectFloor: false } : { ...g, floor: Math.min(floorOf(g), tokens) }

// The size after a turn of the main conversation.
export const afterTurn = (g: Guard, ctx: number | null): Guard => {
  if (ctx === null) return g
  const next = g.expectFloor ? { ...g, floor: ctx, expectFloor: false } : g
  return { ...next, ctx, heldAt: next.heldAt !== null && ctx < next.heldAt / 2 ? null : next.heldAt }
}

// Module state: a reload starts it over with the guessed floor.
let g = freshGuard()

// --- called from the files that own these events ---------------------------------------
// Claude Code takes one hook per event from a plugin, and follows `$` only within one file,
// so none of these takes it. panels.tsx owns session.start, prompt.submit and turn.complete;
// savvy-progress/ owns turn.step.
export const clearOnStart = (isInteractive: boolean) => { g = { ...g, isInteractive } }

export const clearOnStep = (tokens: number) => { if (tokens > 0) g = afterStep(g, tokens) }

export const clearOnTurnEnd = (ctx: number | null) => { g = afterTurn(g, ctx) }

// The history to hold this message for, in tokens, or null to let it through. Pure, so an
// ordinary message waits on nothing; panels.tsx reads the plan file only for a hold.
export const clearHistory = (text: string, fromPerson: boolean): number | null =>
  shouldHold(g, text, fromPerson) && g.ctx !== null ? g.ctx - floorOf(g) : null

// The message was held: none again in this stretch.
export const clearHeld = () => { g = { ...g, heldAt: g.ctx } }

export const register: Register = (on) => {
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    // A fresh conversation: its first request is measured as the floor.
    if (e.source === 'startup' || e.source === 'clear') g = freshGuard(g.isInteractive, true)
    else if (e.source === 'resume' || e.source === 'fork') {
      // A resumed conversation is the costly case, so its size is read now, before the first
      // message: the figures the engine restored with it. Its floor stays the guess.
      let ctx: number | null = null
      try {
        const t = (await $.session.usage()).context?.tokens
        ctx = typeof t === 'number' && t > 0 ? t : null
      } catch { /* unknown until the first turn ends */ }
      g = { ...freshGuard(g.isInteractive), ctx }
    } else if (e.source === 'compact') g = { ...g, ctx: null, heldAt: null, expectFloor: false }
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // The size before it is no guide: the next turn's end measures the shorter one.
    if (!e.agentId) g = { ...g, ctx: null, heldAt: null, expectFloor: false }
    return r
  })
}
