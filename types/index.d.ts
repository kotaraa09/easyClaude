// What hooks/panels.tsx keeps in the session's $.state, so `claude plugin validate` can hold
// every key it names to a declared type.

// One step of the request in progress, from Claude's own step list (TodoWrite or the Task
// tools).
export type Step = {
  id: string
  title: string
  // What the step is doing, as Claude worded it ("Building page 2").
  doing: string
  status: 'pending' | 'in_progress' | 'completed'
}

// The request the user sent last, and what it has cost so far.
export type Request = {
  // The start of what the user asked, for the panel's first line.
  text: string
  startedAt: number
  // Set when the turn ended; until then the request is running.
  endedAt: number | null
  steps: Step[]
  // The last few actions, in plain words ("Changed checkout.js"), newest last. The panel
  // shows these when Claude keeps no step list, so a request is never only "working".
  recent: string[]
  tools: number
  // The session's cost when the request began, so the request's own cost is the difference.
  costAtStart: number | null
}

// The figures the session reports, read after each tool call and at the end of a turn.
export type Usage = {
  costUsd: number | null
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    easyclaude: {
      request: Request | null
      usage: Usage
    }
  }
}
