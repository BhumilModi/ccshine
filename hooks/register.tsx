import type { Register } from 'claude-code'

import { registerReceipt } from './features/receipt'
import { registerSpinner } from './features/spinner'
import { registerTasks } from './features/tasks'
import { registerTools } from './features/tools'
import { registerTrack } from './features/track'
import { setOptions } from './options'

export const register: Register = (on, options) => {
  setOptions(options)
  registerTrack(on)
  registerTasks(on)
  registerTools(on)
  registerSpinner(on)
  registerReceipt(on)
}
