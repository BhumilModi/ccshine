import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { opts } from '../options'
import { palette } from '../theme'
import { describeCall, editStats, fmtShort, groupSummary } from '../tools'

// Written by the tracker (features/track.tsx).
const calls = atom({ plugin: 'terminal-plus', key: 'calls' } as const, {})

let root: string | undefined

async function sessionRoot($: EngineInterface): Promise<string> {
  root ??= await $.session.root()
  return root
}

export function registerTools(on: On) {
  // Header row only: the engine keeps drawing the result (diff, output) under it.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!opts.tools) return next(e)
    const p = e.props
    const described = describeCall(p.tool, p.input, await sessionRoot($))
    if (!described) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    const timing = (await read($, calls))[p.tool_use_id]
    const took = timing?.endedAt !== undefined ? fmtShort(timing.endedAt - timing.startedAt) : undefined
    const stats = editStats(p.tool, p.input)
    const icon = p.isErrored ? '✕' : described.icon
    const iconColor = p.isErrored ? C.crit : p.isInterrupted ? C.faint : C.accent
    return (
      <Box>
        <Text color={iconColor} bold>{icon}</Text>
        <Text color={C.soft}>{` ${p.tool} `}</Text>
        <Text color={C.ink} wrap="truncate-end">{described.target}</Text>
        {stats && stats.added > 0 && <Text color={C.info}>{`  +${stats.added}`}</Text>}
        {stats && stats.removed > 0 && <Text color={C.crit}>{`${stats.added > 0 ? ' ' : '  '}−${stats.removed}`}</Text>}
        {p.isRunning && <Text color={C.faint}>{'  …'}</Text>}
        {took && !p.isRunning && <Text color={C.faint}>{`  ${took}`}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!opts.tools || e.props.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    const parts = groupSummary(e.props.calls)
    const errored = e.props.calls.some(c => c.isErrored)
    return (
      <Box>
        {parts.map((g, i) => (
          <Text key={`g${i}`} color={C.soft}>
            {`${i ? '  ' : ''}${g.icon} ${g.tool}${g.count > 1 ? ` ×${g.count}` : ''}`}
          </Text>
        ))}
        {e.props.isActive && <Text color={C.faint}>{'  …'}</Text>}
        {errored && <Text color={C.crit}>{'  ✕'}</Text>}
      </Box>
    )
  })
}
