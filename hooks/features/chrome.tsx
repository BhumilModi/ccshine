import type { On } from 'claude-code'

import { opts } from '../options'
import { palette } from '../theme'

// `? for shortcuts · esc to interrupt` → each part's first word is its key, the rest describes it.
function hintParts(hint: string): { key: string; words: string }[] {
  return hint.split(' · ').map(part => {
    const space = part.indexOf(' ')
    return space < 0 ? { key: part, words: '' } : { key: part.slice(0, space), words: part.slice(space) }
  })
}

export function registerChrome(on: On) {
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!opts.chrome || e.props.hint.trim() === '') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    return (
      <Box>
        {hintParts(e.props.hint).flatMap((p, i) => [
          ...(i ? [<Text key={`s${i}`} color={C.track}>{' · '}</Text>] : []),
          <Text key={`k${i}`} color={C.accent}>{p.key}</Text>,
          ...(p.words ? [<Text key={`w${i}`} color={C.faint} wrap="truncate-end">{p.words}</Text>] : []),
        ])}
      </Box>
    )
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!opts.chrome || e.props.modes.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    return (
      <Box>
        {e.props.modes.flatMap((mode, i) => [
          ...(i ? [<Text key={`g${i}`}>{' '}</Text>] : []),
          <Text key={`m${i}`} color={C.soft} backgroundColor={C.seg}>{` ${mode} `}</Text>,
        ])}
      </Box>
    )
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (!opts.chrome) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    return (
      <Box>
        <Text color={C.faint} wrap="truncate-end">{e.props.text}</Text>
        {e.props.command !== null && <Text color={C.accent}>{` ${e.props.command}`}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!opts.chrome || e.props.kind !== 'background_hint' || e.props.hint === '') return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text color={palette().faint} wrap="truncate-end">{`⇣ ${e.props.hint.replace(/^\((.*)\)$/, '$1')}`}</Text>
  })

  // `Baked for 3s` between turns: the spinner already shows elapsed time while a turn runs.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!opts.chrome) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
