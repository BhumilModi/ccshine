import { fmtClock } from './plan'

type Input = Record<string, unknown>

const ICONS: Record<string, string> = {
  Read: '◇', Edit: '◆', MultiEdit: '◆', Write: '◆', Bash: '❯', Grep: '⌕', Glob: '⌕',
  WebFetch: '↗', WebSearch: '↗', Agent: '◈', TaskCreate: '☐', TaskUpdate: '☐', TodoWrite: '☐',
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function rel(path: string, root: string): string {
  return root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}

// One-line icon and target for the built-in tools; undefined leaves the row to the engine.
export function describeCall(tool: string, input: unknown, root: string): { icon: string; target: string } | undefined {
  const icon = ICONS[tool]
  if (icon === undefined || input === null || typeof input !== 'object') return undefined
  const i = input as Input
  switch (tool) {
    case 'Read': case 'Edit': case 'MultiEdit': case 'Write':
      return { icon, target: rel(str(i.file_path), root) }
    case 'Bash':
      return { icon, target: str(i.description) || (str(i.command).split('\n')[0] ?? '').slice(0, 60) }
    case 'Grep':
      return { icon, target: i.path ? `${str(i.pattern)} in ${rel(str(i.path), root)}` : str(i.pattern) }
    case 'Glob':
      return { icon, target: str(i.pattern) }
    case 'WebFetch': {
      try {
        return { icon, target: new URL(str(i.url)).host }
      } catch {
        return { icon, target: str(i.url) }
      }
    }
    case 'WebSearch':
      return { icon, target: str(i.query) }
    case 'Agent':
      return { icon, target: str(i.description) }
    case 'TaskCreate':
      return { icon, target: str(i.subject) }
    case 'TaskUpdate':
      return { icon, target: `#${str(i.taskId)} ${str(i.status)}`.trim() }
    case 'TodoWrite':
      return { icon, target: `${Array.isArray(i.todos) ? i.todos.length : 0} todos` }
  }
  return undefined
}

const lines = (s: unknown): number => (typeof s === 'string' && s !== '' ? s.replace(/\n$/, '').split('\n').length : 0)

export function editStats(tool: string, input: unknown): { added: number; removed: number } | undefined {
  if (input === null || typeof input !== 'object') return undefined
  const i = input as Input
  if (tool === 'Edit') return { added: lines(i.new_string), removed: lines(i.old_string) }
  if (tool === 'Write') return { added: lines(i.content), removed: 0 }
  if (tool === 'MultiEdit' && Array.isArray(i.edits)) {
    const edits = i.edits as Input[]
    return {
      added: edits.reduce((n, e) => n + lines(e.new_string), 0),
      removed: edits.reduce((n, e) => n + lines(e.old_string), 0),
    }
  }
  return undefined
}

export function fmtShort(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return fmtClock(ms)
}

export function isKnownTool(tool: string): boolean {
  return tool in ICONS
}

export function groupSummary(calls: ReadonlyArray<{ tool: string }>): { tool: string; icon: string; count: number }[] {
  const out: { tool: string; icon: string; count: number }[] = []
  for (const c of calls) {
    const seen = out.find(o => o.tool === c.tool)
    if (seen) seen.count += 1
    else out.push({ tool: c.tool, icon: ICONS[c.tool] ?? '·', count: 1 })
  }
  return out
}
