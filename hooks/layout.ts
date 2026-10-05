import { IDLE_ROWS, SCENE_ROWS } from './dock'

export type DockSize = 'none' | 'idle' | 'idle-compact' | 'full' | 'compact' | 'tiny'

// Rows each dock takes, the blank row above it included: the idle crab and its label, or the label alone;
// a running turn's status line, scene and recent calls, the status line and calls, or the status line alone.
export const DOCK_ROWS: Record<DockSize, number> = {
  none: 0,
  idle: 1 + IDLE_ROWS,
  'idle-compact': 2,
  full: 1 + 1 + SCENE_ROWS + 1,
  compact: 3,
  tiny: 2,
}

export type BandAsk = {
  // The band's row cap: a taller tree scrolls, which pushes the dock out of sight. Claude Code's own
  // task list shares the slot, so this can be as small as a few rows.
  maxRows: number
  dock: 'none' | 'idle' | 'live'
  // A plan header to show, and the row of the task it is on.
  header: boolean
  focus: boolean
  // The shell section's rows, its label included.
  shell: number
  // Every other plan row wanted (tasks, sub-items, agents, labels).
  plan: number
  tails: number
  usage: number
  expanded: boolean
}

export type BandFit = {
  dock: DockSize
  // The running dock's scene rows: SCENE_ROWS, fewer when squeezed (at least MIN_SCENE), 0 without one.
  scene: number
  // The running dock's recent-calls line.
  calls: boolean
  // The blank row between the chat and the band.
  margin: boolean
  header: boolean
  focus: boolean
  shell: number
  plan: number
  tails: boolean
  usage: boolean
}

// The plan keeps this many of its other rows before the crab grows, usage or output tails.
const MIN_PLAN = 2
// The shortest scene that still holds the crab on its ground.
export const MIN_SCENE = 4

// Rows a fitted dock takes, its blank row included.
export function dockRows(f: BandFit): number {
  if (f.dock === 'full' || f.dock === 'compact' || f.dock === 'tiny') return 2 + f.scene + (f.calls ? 1 : 0)
  return DOCK_ROWS[f.dock]
}

// Hands out the band's rows by priority, so the tree never passes maxRows and the dock is never scrolled away:
// the dock's status line; the plan header, its running task and the shells; the crab at its shortest; the dock's
// calls line; the blank row above the band; a little plan; the crab at full height; usage; output tails; then the
// rest of the plan. "Show all" is the one ask that may pass maxRows: the person asked for every row, and the band scrolls.
export function fitBand(a: BandAsk): BandFit {
  let left = a.maxRows
  const take = (n: number) => {
    if (n > left) return false
    left -= n
    return true
  }
  const live = a.dock === 'live'
  const fit: BandFit = { dock: 'none', scene: 0, calls: false, margin: false, header: false, focus: false, shell: 0, plan: 0, tails: false, usage: false }
  if (a.dock !== 'none' && take(2)) fit.dock = live ? 'tiny' : 'idle-compact'
  fit.header = a.header && take(1)
  fit.focus = fit.header && a.focus && take(1)
  // A shell label without a row under it says nothing.
  const shell = Math.min(a.shell, left)
  if (shell >= 2 && take(shell)) fit.shell = shell
  if (fit.dock === 'tiny' && take(MIN_SCENE)) {
    fit.dock = 'full'
    fit.scene = MIN_SCENE
  }
  if (live && fit.dock !== 'none' && take(1)) {
    fit.calls = true
    if (fit.dock === 'tiny') fit.dock = 'compact'
  }
  fit.margin = (fit.header || fit.shell > 0) && take(1)
  if (fit.focus) {
    // Showing all takes its rows before the crab grows.
    fit.plan = a.expanded ? a.plan : Math.min(a.plan, MIN_PLAN, left)
    left = Math.max(0, left - fit.plan)
  }
  if (fit.dock === 'full') {
    const grow = Math.min(SCENE_ROWS - fit.scene, left)
    left -= grow
    fit.scene += grow
  }
  if (fit.dock === 'idle-compact' && take(IDLE_ROWS - 1)) fit.dock = 'idle'
  // Usage alone above the dock brings its own blank row.
  if (a.usage > 0) fit.usage = fit.margin ? take(a.usage) : take(a.usage + 1) && (fit.margin = true)
  fit.tails = a.tails > 0 && fit.shell > 0 && take(a.tails)
  if (fit.focus && !a.expanded) fit.plan += Math.min(a.plan - fit.plan, left)
  return fit
}
