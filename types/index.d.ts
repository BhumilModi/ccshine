export type PlanTask = {
  id: string
  subject: string
  // Present-tense label from TaskCreate/TodoWrite (`Running tests`), shown by the spinner.
  activeForm?: string
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
  startedAt: number
  // Set by the tracker when the agent's turn completes, so status survives trimming of old turn records.
  endedAt?: number
  tokens?: number
  stopped?: boolean
}

// A tool call in flight, as the spinner reads it.
export type LiveCall = { tool: string; input: Record<string, unknown>; agentId?: string }

export type CallTiming = {
  tool: string
  startedAt: number
  endedAt?: number
  agentId?: string
}

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type Step = { tool: string; ms: number; count: number }

export type TurnRecord = {
  turnId: string
  agentId?: string
  startedAt: number
  durationMs: number
  usage?: Usage
  steps: Step[]
  aborted?: true
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-plus': {
      tasks: PlanTask[]
      agents: PlanAgent[]
      tick: number
      calls: Record<string, CallTiming>
      turns: TurnRecord[]
      live: Record<string, LiveCall>
    }
  }
}
