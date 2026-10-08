// easyClaude's hooks module. Claude Code loads one per plugin, and one hook per event from
// it, so this starts each part and panels.tsx hooks the events they share:
//
//   panels.tsx          the control panel, and the record of the request in progress
//   clear-reminder.ts   holds the first message of a long stretch with a note about /clear
//   savvy-progress/     the progress bar above the prompt, and the helpers panel
//
// Savvy Progress is vendored and adapted; its PROVENANCE.md says from where, and what
// changed. The file tree and Blast Radius are plugins of their own in plugins/, which
// easyClaude lists as dependencies, so they install with it.
//
// Where installed plugins may not load a hooks module - an older Claude Code, or an account
// the feature has not reached - none of this runs, and everything else in easyClaude works
// as before.
import type { Register } from 'claude-code'

import { register as clearReminder } from './clear-reminder'
import { register as panels } from './panels'
import { register as savvyProgress } from './savvy-progress/register'

export const register: Register = (on, options) => {
  panels(on, options)
  clearReminder(on, options)
  savvyProgress(on, options)
}
