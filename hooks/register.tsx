import type { Register } from 'claude-code'

import { registerAlerts } from './features/alerts'
import { registerChrome } from './features/chrome'
import { registerDock } from './features/dock'
import { registerRail } from './features/rail'
import { registerSpinner } from './features/spinner'
import { registerStartup } from './features/startup'
import { registerStatusline } from './features/statusline'
import { registerTasks } from './features/tasks'
import { registerTools } from './features/tools'
import { registerTrack } from './features/track'
import { registerTranscript } from './features/transcript'
import { setOptions } from './options'

export const register: Register = (on, options) => {
  setOptions(options)
  registerTrack(on)
  registerRail(on)
  registerTasks(on)
  registerTools(on)
  registerSpinner(on)
  registerAlerts(on)
  registerStartup(on)
  registerStatusline(on)
  registerTranscript(on)
  registerChrome(on)
  registerDock(on)
}
