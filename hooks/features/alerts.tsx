import type { On } from 'claude-code'

import { opts } from '../options'
import { fmtTurn } from '../receipt'

export function registerAlerts(on: On) {
  // Matched on reason, so the tracker keeps the one unmatched turn.complete hook.
  // An answer and an API error both mean the user can come back; an interrupt was the user's own doing.
  for (const reason of ['answer', 'error'] as const) {
    on('turn.complete', { reason }, async ($, e, next) => {
      const done = await next(e)
      if (opts.alerts && e.agentId === undefined && !e.isAborted && e.durationMs >= opts.alertAfterSeconds * 1000) {
        // Fire and forget: a terminal with no audio player must never fail the turn.
        void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
        const what = reason === 'error' ? 'Claude stopped on an error' : 'Claude finished'
        $.ui.toast(`${what} · ${fmtTurn(e.durationMs)}`)
      }
      return done
    })
  }

  on('classic.Notification', async ($, e, next) => {
    // The idle reminder follows every long turn; the finish chime already covered it.
    if (opts.alerts && e.notification_type !== 'idle_prompt') {
      void $.audio.play({ asset: 'sounds/attention.wav' }).catch(() => {})
      $.ui.toast(e.message)
    }
    return next(e)
  })
}
