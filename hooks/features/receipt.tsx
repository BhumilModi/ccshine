import { atom, read } from 'claude-code'
import type { On } from 'claude-code'

import { opts } from '../options'
import { fmtTokens } from '../plan'
import { cacheRate, fmtTurn, legend, timeline } from '../receipt'
import { palette } from '../theme'
import { totalTokens } from '../timing'

// Written by the tracker (features/track.tsx).
const turns = atom({ plugin: 'ccshine', key: 'turns' } as const, [])
const TIMELINE_CELLS = 24

export function registerReceipt(on: On) {
  // The line has no turn id; its durationMs equals that turn's turn.complete durationMs (checked live).
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!opts.receipt || e.surface !== 'terminal') return next(e)
    const turn = [...(await read($, turns))].reverse().find(t => t.agentId === undefined && t.durationMs === e.props.durationMs)
    if (!turn) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    const cells = timeline(turn.steps, turn.durationMs, TIMELINE_CELLS)
    const usage = turn.usage && `${fmtTokens(totalTokens(turn.usage))} tokens · cache ${Math.round(cacheRate(turn.usage) * 100)}%`
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={C.ink} bold>{fmtTurn(turn.durationMs)}</Text>
          <Text>{'  '}</Text>
          {cells.map((c, i) => (
            <Text key={`c${i}`} color={c.tool === 'thinking' ? C.accent : C.mid}>{c.char}</Text>
          ))}
          {usage && <Text color={C.mid} wrap="truncate-end">{`  ${usage}`}</Text>}
        </Box>
        <Text color={C.faint} wrap="truncate-end">{legend(turn.steps, turn.durationMs)}</Text>
      </Box>
    )
  })
}
