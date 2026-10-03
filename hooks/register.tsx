import type { Register } from 'claude-code'

import { registerTasks } from './features/tasks'
import { setOptions } from './options'

export const register: Register = (on, options) => {
  setOptions(options)
  registerTasks(on)
}
