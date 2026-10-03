import type { PlanAgent, TurnRecord } from '../types'
import { totalTokens } from './timing'

export function lastTurn(turns: TurnRecord[]): TurnRecord | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (t.agentId === undefined && t.usage) return t
  }
  return undefined
}

// A turn paid full price when most of its context was written to the cache instead of read from it.
// The first turn of a session always writes, so only a turn after another one can count as cold.
export function wasCold(turn: TurnRecord, previous: TurnRecord | undefined): boolean {
  if (!previous || !turn.usage) return false
  const { cacheRead, cacheWrite } = turn.usage
  return cacheWrite > 10_000 && cacheRead < 0.2 * (cacheRead + cacheWrite)
}

export function bySource(turns: TurnRecord[], agents: PlanAgent[], sinceMs: number): { source: string; tokens: number }[] {
  const out = new Map<string, number>()
  for (const t of turns) {
    if (!t.usage || t.startedAt + t.durationMs < sinceMs) continue
    const source = t.agentId === undefined ? 'main' : (agents.find(a => a.id === t.agentId)?.type ?? 'agent')
    out.set(source, (out.get(source) ?? 0) + totalTokens(t.usage))
  }
  return [...out]
    .map(([source, tokens]) => ({ source, tokens }))
    .sort((a, b) => (a.source === 'main' ? -1 : b.source === 'main' ? 1 : b.tokens - a.tokens))
}
