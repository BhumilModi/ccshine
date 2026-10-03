export type PlanTask = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: number
  startedAt?: number
  doneAt?: number
}

export type PlanAgent = {
  id: string
  description: string
  type: string
  // The task that was running when the agent started; undefined when none was.
  taskId?: string
  status: 'running' | 'done' | 'stopped'
  startedAt: number
  endedAt?: number
  tokens?: number
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-plus': { tasks: PlanTask[]; agents: PlanAgent[]; tick: number }
  }
}
