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

export type DockMode = 'requesting' | 'thinking' | 'tool' | 'responding'

// The prompt dock's main turn (hooks/dock.ts draws it).
export type DockTurn = {
  // turn.start's id; turn.complete with the same id ends it.
  turnId?: string
  startedAt: number
  endedAt?: number
  // When the mode changed; before the first, the turn is waiting on the API.
  phases: { mode: DockMode; at: number }[]
  // Main-loop tool calls: each drops a crate on the course.
  // `dist` is the course position the crate drops at, stored once when the call starts.
  calls: { id: string; at: number; label: string; done: boolean; dist?: number }[]
  // Varies the course from turn to turn.
  seed: number
  // Stopped with Esc: no finish line, no score.
  aborted?: boolean
  // Every main-loop tool call this turn (calls keeps only the last 40).
  crates?: number
}

declare module 'claude-code' {
  interface PluginState {
    'ccshine': {
      tasks: PlanTask[]
      agents: PlanAgent[]
      tick: number
      calls: Record<string, CallTiming>
      turns: TurnRecord[]
      live: Record<string, LiveCall>
      dock: DockTurn | null
    }
  }
}
