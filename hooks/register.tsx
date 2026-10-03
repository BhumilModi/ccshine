import type { Register } from 'claude-code'

import { registerAlerts } from './features/alerts'
import { registerSpinner } from './features/spinner'
import { registerStatusline } from './features/statusline'
import { registerTasks } from './features/tasks'
import { registerTools } from './features/tools'
import { registerTrack } from './features/track'
import { registerTranscript } from './features/transcript'
import { setOptions } from './options'

export const register: Register = (on, options) => {
  setOptions(options)
  registerTrack(on)
  registerTasks(on)
  registerTools(on)
  registerSpinner(on)
  registerAlerts(on)
  registerStatusline(on)
  registerTranscript(on)
}
