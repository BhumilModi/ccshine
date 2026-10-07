import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { opts } from '../options'
import { palette } from '../theme'
import { imageNumbers } from '../images'

// Attached images' paths by number, kept by the turn tracker (features/dock.tsx).
const images = atom({ plugin: 'tidepool', key: 'images' } as const, {})

// Text and Markdown elements refuse more than 10000 characters, or control characters other than tab and newline.
// Such rows keep the engine's drawing rather than being refused.
// eslint-disable-next-line no-control-regex
const fits = (text: string) => text.length <= 10_000 && !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)

// Columns kept clear at the chat's right edge, so wrapped text never runs into the docked rail's separator.
const GUTTER = 2

// Opens a file in the system's viewer: `open` on macOS, `xdg-open` elsewhere.
async function openFile($: EngineInterface, path: string) {
  const ran = await $.process.run(['open', path]).catch(() => undefined)
  if (ran?.exitCode === 0) return
  const other = await $.process.run(['xdg-open', path]).catch(() => undefined)
  if (other?.exitCode !== 0) $.ui.toast(`Could not open ${path}`)
}

export function registerTranscript(on: On) {
  // The person's own prompts only; notifications and other agents' messages keep the engine's row.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = e.props
    if (!opts.transcript || p.origin.kind !== 'composer' || !fits(p.text)) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const C = palette()
    const known = await read($, images)
    const attached = imageNumbers(p.text).flatMap(n => (known[n] ? [{ n, path: known[n] }] : []))
    // marginTop keeps the blank line the engine puts between messages.
    return (
      <Box flexDirection="column" marginTop={1} paddingRight={GUTTER}>
        <Box>
          <Box flexShrink={0}>
            <Text color={C.accent} bold>{'▌ you  '}</Text>
          </Box>
          <Text color={C.ink} italic wrap="wrap">{p.text}</Text>
        </Box>
        {attached.map(({ n, path }) => (
          <Box key={`img-${n}`} flexDirection="row" paddingLeft={7}>
            <Box flexShrink={0}><Text color={C.faint}>{`▣ #${n} `}</Text></Box>
            <Text color={C.soft} wrap="truncate-start">{path.split('/').pop() ?? path}</Text>
            <Box flexShrink={0}>
              <Button key={`img:${n}`} plain onPress={() => openFile($, path)}>{'  open ↗'}</Button>
            </Box>
          </Box>
        ))}
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
      <Box flexDirection="column" marginTop={1} paddingRight={GUTTER}>
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
      <Box flexDirection="column" paddingRight={GUTTER}>
        <Box>
          <Text color={C.accent} bold>{title}</Text>
          <Text color={C.track} wrap="truncate-end">{` ${'─'.repeat(Math.max(0, columns - title.length - 3 - GUTTER))}`}</Text>
        </Box>
        <Markdown text={p.text} />
      </Box>
    )
  })
}
