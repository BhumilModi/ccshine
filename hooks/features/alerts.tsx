import type { On } from 'claude-code'

import { opts } from '../options'
import { fmtTurn } from '../receipt'

export function registerAlerts(on: On) {
  // Main-loop answers only (matched on reason, so the tracker keeps the one unmatched turn.complete hook).
  on('turn.complete', { reason: 'answer' }, async ($, e, next) => {
    const done = await next(e)
    if (opts.alerts && e.agentId === undefined && !e.isAborted && e.durationMs >= opts.alertAfterSeconds * 1000) {
      // Fire and forget: a terminal with no audio player must never fail the turn.
      void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
      $.ui.toast(`Claude finished · ${fmtTurn(e.durationMs)}`)
    }
    return done
  })

  on('classic.Notification', async ($, e, next) => {
    if (opts.alerts) {
      void $.audio.play({ asset: 'sounds/attention.wav' }).catch(() => {})
      $.ui.toast(e.message)
    }
    return next(e)
  })
}
