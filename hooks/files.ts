import type { CallTiming, Hunk } from '../types'

// Lines of patch kept per edit call; the rest are counted, not kept.
export const MAX_PATCH_LINES = 400

// The first `max` lines of a patch, cut inside the hunk that crosses the limit, and how many were dropped.
export function cutPatch(hunks: Hunk[], max = MAX_PATCH_LINES): { patch: Hunk[]; cut: number } {
  const patch: Hunk[] = []
  let left = max
  let cut = 0
  for (const h of hunks) {
    const kept = h.lines.slice(0, Math.max(0, left))
    cut += h.lines.length - kept.length
    left -= kept.length
    if (kept.length > 0) patch.push(kept.length === h.lines.length ? h : { ...h, lines: kept })
  }
  return { patch, cut }
}

const isHunk = (h: unknown): h is Hunk =>
  !!h && typeof h === 'object' && Array.isArray((h as Hunk).lines) && typeof (h as Hunk).oldStart === 'number'

// The hunks an Edit or Write reported. A Write that created a file reports none, so its content is one
// all-added hunk.
export function editPatch(tool: string, input: Record<string, unknown>, result: unknown): Hunk[] {
  const r = (result ?? {}) as { structuredPatch?: unknown; type?: unknown }
  const hunks = Array.isArray(r.structuredPatch) ? r.structuredPatch.filter(isHunk) : []
  if (hunks.length > 0 || tool !== 'Write' || r.type !== 'create' || typeof input.content !== 'string') return hunks
  const lines = input.content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(l => `+${l}`) }]
}

export type FileRow = { path: string; rel: string; added: number; removed: number; calls: string[] }

// A turn's changed files, in the order first touched: its main-loop Edit and Write calls that did not fail,
// grouped by path with their line counts summed.
export function fileRows(turnCalls: [string, CallTiming][], root: string): FileRow[] {
  const rows = new Map<string, FileRow>()
  for (const [id, c] of turnCalls) {
    if ((c.tool !== 'Edit' && c.tool !== 'Write') || c.agentId !== undefined || c.failed || c.file === undefined) continue
    const row = rows.get(c.file) ?? { path: c.file, rel: relPath(c.file, root, Number.MAX_SAFE_INTEGER), added: 0, removed: 0, calls: [] }
    rows.set(c.file, { ...row, added: row.added + (c.added ?? 0), removed: row.removed + (c.removed ?? 0), calls: [...row.calls, id] })
  }
  return [...rows.values()]
}

// A path relative to the session root (as given when outside it), cut from the left to `width`:
// whole trailing folders after `…/`, else the file name's tail.
export function relPath(path: string, root: string, width: number): string {
  const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  if (rel.length <= width) return rel
  const parts = rel.split('/')
  for (let i = 1; i < parts.length; i++) {
    const tail = `…/${parts.slice(i).join('/')}`
    if (tail.length <= width) return tail
  }
  return `…${rel.slice(-(width - 1))}`
}
