import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { activity } from '../activity'
import { currentTaskId } from '../plan'
import { opts } from '../options'
import { running } from './track'

const tasks = atom({ plugin: 'terminal-plus', key: 'tasks' } as const, [])

export function registerSpinner(on: On) {
  // Rewrites only the message: the engine keeps drawing elapsed time and tokens after it.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!opts.spinner || e.props.message !== null) return next(e)
    const live = [...running.values()]
    let message = activity(live)
    if (message === undefined && live.length === 0) {
      const list = await read($, tasks)
      const id = currentTaskId(list)
      message = activity([], list.find(t => t.id === id))
    }
    return message === undefined ? next(e) : next({ ...e, props: { ...e.props, message } })
  })
}
