import type { PlanTask } from '../types'

type Input = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const base = (path: string): string => path.split('/').pop() ?? path

function one(tool: string, i: Input): string | undefined {
  switch (tool) {
    case 'Bash': return str(i.description) || `Running ${str(i.command).trim().split(/\s+/)[0] ?? ''}`.trim()
    case 'Read': return `Reading ${base(str(i.file_path))}`
    case 'Edit': case 'MultiEdit': return `Editing ${base(str(i.file_path))}`
    case 'Write': return `Writing ${base(str(i.file_path))}`
    case 'Grep': case 'Glob': return `Searching ${str(i.pattern)}`
    case 'WebFetch': {
      try {
        return `Fetching ${new URL(str(i.url)).host}`
      } catch {
        return 'Fetching'
      }
    }
    case 'WebSearch': return 'Searching the web'
    case 'Agent': return `Agent: ${str(i.description)}`
  }
  return undefined
}

// What the spinner says instead of its random word; undefined keeps the engine's word.
export function activity(
  running: ReadonlyArray<{ tool: string; input: unknown }>,
  task?: Pick<PlanTask, 'subject' | 'activeForm'>,
): string | undefined {
  if (running.length > 1) return `${running.length} tools running`
  const call = running[0]
  if (call) return typeof call.input === 'object' && call.input !== null ? one(call.tool, call.input as Input) : undefined
  return task ? task.activeForm || task.subject : undefined
}
