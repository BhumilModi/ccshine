import type { On } from 'claude-code'

import { opts } from '../options'
import { palette } from '../theme'

// Text and Markdown elements refuse more than 10000 characters, or control characters other than tab and newline.
// Such rows keep the engine's drawing rather than being refused.
// eslint-disable-next-line no-control-regex
const fits = (text: string) => text.length <= 10_000 && !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)

export function registerTranscript(on: On) {
  // The person's own prompts only; notifications and other agents' messages keep the engine's row.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = e.props
    if (!opts.transcript || p.origin.kind !== 'composer' || !fits(p.text)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    // marginTop keeps the blank line the engine puts between messages.
    return (
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color={C.accent} bold>{'▌ you  '}</Text>
        </Box>
        <Text color={C.ink} wrap="wrap">{p.text}</Text>
      </Box>
    )
  })

  // The body goes through the engine's own markdown renderer; only the header and indent are ours.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const p = e.props
    if (!opts.transcript || !fits(p.text)) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const C = palette()
    return (
      <Box flexDirection="column" marginTop={1}>
        {p.isFirstOfReply && <Text color={C.accent} bold>{'◆ claude'}</Text>}
        <Box paddingLeft={2}>
          <Markdown text={p.text} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const p = e.props
    if (!opts.transcript || p.isErrored || !fits(p.text)) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const C = palette()
    const title = `/${p.command}`
    const columns = e.viewport?.columns ?? 40
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={C.accent} bold>{title}</Text>
          <Text color={C.track} wrap="truncate-end">{` ${'─'.repeat(Math.max(0, columns - title.length - 3))}`}</Text>
        </Box>
        <Markdown text={p.text} />
      </Box>
    )
  })
}
