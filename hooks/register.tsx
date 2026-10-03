import type { Register } from 'claude-code'

import { registerTasks } from './features/tasks'
import { registerTrack } from './features/track'
import { setOptions } from './options'

export const register: Register = (on, options) => {
  setOptions(options)
  registerTrack(on)
  registerTasks(on)
}
