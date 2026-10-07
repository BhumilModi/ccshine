import type { Hunk } from '../types'

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
