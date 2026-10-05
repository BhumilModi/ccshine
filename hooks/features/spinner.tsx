import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { activity } from '../activity'
import { currentTaskId } from '../plan'
import { opts } from '../options'

const tasks = atom({ plugin: 'tidepool', key: 'tasks' } as const, [])
// Written by the tracker (features/track.tsx); reading it re-runs this hook whenever a call starts or ends.
const liveCalls = atom({ plugin: 'tidepool', key: 'live' } as const, {})

export function registerSpinner(on: On) {
  // Rewrites only the message: the engine keeps drawing elapsed time and tokens after it.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // The prompt dock shows the turn on the terminal, so the line would say it twice.
    if (opts.dock && e.surface === 'terminal') {
      const { Box } = $.ui.resolve(e)
      return <Box />
    }
    if (!opts.spinner || e.props.message !== null) return next(e)
    // Main-loop calls only: a running subagent's own calls belong to its Agent call.
    const live = Object.values(await read($, liveCalls)).filter(c => c.agentId === undefined)
    let message = activity(live)
    if (message === undefined && live.length === 0) {
      const list = await read($, tasks)
      const id = currentTaskId(list)
      message = activity([], list.find(t => t.id === id))
    }
    return message === undefined ? next(e) : next({ ...e, props: { ...e.props, message } })
  })
}
