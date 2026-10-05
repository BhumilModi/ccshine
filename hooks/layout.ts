import { IDLE_ROWS, SCENE_ROWS } from './dock'

export type DockSize = 'none' | 'idle' | 'idle-compact' | 'full' | 'compact'

// Rows each dock takes, the blank row above it included: the idle crab and its label, its label alone;
// a running turn's status line, scene and recent calls, or the status line and calls alone.
export const DOCK_ROWS: Record<DockSize, number> = { none: 0, idle: 1 + IDLE_ROWS, 'idle-compact': 2, full: 1 + 1 + SCENE_ROWS + 1, compact: 3 }

export type BandAsk = {
  // The band's row cap: a taller tree scrolls, which pushes the dock out of sight.
  maxRows: number
  dock: 'none' | 'idle' | 'live'
  // Rows always shown when present: the plan header and the row it is on, and every shell row.
  pinned: number
  shell: number
  // Every other plan row wanted (tasks, sub-items, agents, labels).
  plan: number
  tails: number
  usage: number
  expanded: boolean
}

export type BandFit = { dock: DockSize; plan: number; tails: boolean; usage: boolean }

// The plan keeps at least this many of its other rows before the dock's scene, usage or output tails.
const MIN_PLAN = 2

// Shares the band's rows so the whole tree fits in maxRows: the dock's scene goes first, then usage,
// then output tails; the plan's other rows take what is left. "Show all" asks for every plan row and may scroll.
export function fitBand(a: BandAsk): BandFit {
  const above = a.pinned + a.shell + a.plan + a.tails + a.usage > 0 ? 1 : 0
  const keep = a.expanded ? a.plan : Math.min(a.plan, MIN_PLAN)
  let dock: DockSize = a.dock === 'live' ? 'full' : a.dock === 'idle' ? 'idle' : 'none'
  if (above + a.pinned + a.shell + keep + DOCK_ROWS[dock] > a.maxRows) dock = dock === 'full' ? 'compact' : dock === 'idle' ? 'idle-compact' : dock
  let left = a.maxRows - above - DOCK_ROWS[dock] - a.pinned - a.shell
  const usage = a.usage > 0 && left - a.usage >= keep
  if (usage) left -= a.usage
  const tails = a.tails > 0 && left - a.tails >= keep
  if (tails) left -= a.tails
  return { dock, plan: a.expanded ? a.plan : Math.max(0, Math.min(a.plan, left)), tails, usage }
}
