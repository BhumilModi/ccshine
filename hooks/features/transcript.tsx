import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'

import { opts } from '../options'
import { palette } from '../theme'
import { imageNumbers, imagePaths } from '../images'
import { fromBase64, parseBmp, thumbCells, thumbSize } from '../thumb'
import { encodeCells } from '../dock'

// Attached images' paths by session and number (numbers start over after /clear, which starts a new session).
// A row reads the conversation for numbers it has not seen, so a prompt queued
// into a running turn (no turn.start) finds its images too; a drawing cannot write state, so this is the module's.
const imageCache = new Map<string, string>()
// When the conversation was last read for a number it did not hold (a pasted image with no file): retried at most
// every RETRY_MS, so such a row does not read the whole conversation on every redraw.
const missedAt = new Map<string, number>()
const RETRY_MS = 10_000

async function pathsFor($: EngineInterface, numbers: number[]): Promise<{ n: number; path: string }[]> {
  if (numbers.length === 0) return []
  const session = await $.session.id().catch(() => '')
  const key = (n: number | string) => `${session}:${n}`
  const missing = numbers.filter(n => !imageCache.has(key(n)))
  const now = missing.length > 0 ? await $.clock.now() : 0
  const unknown = missing.filter(n => now - (missedAt.get(key(n)) ?? -Infinity) >= RETRY_MS)
  if (unknown.length > 0) {
    try {
      for (const [n, path] of Object.entries(imagePaths(await $.session.messages({ as: 'api' })))) imageCache.set(key(n), path)
    } catch {
      // No conversation to read: the row draws without open lines.
    }
    for (const n of unknown) if (!imageCache.has(key(n))) missedAt.set(key(n), now)
  }
  return numbers.flatMap(n => (imageCache.has(key(n)) ? [{ n, path: imageCache.get(key(n))! }] : []))
}

// Images whose thumbnail the person made larger, by image number.
const imageBig = atom({ plugin: 'tidepool', key: 'imageBig' } as const, [])
// A thumbnail's box: small under the prompt, or the chat's width when made larger.
const SMALL = { cols: 40, rows: 10 }
const BIG_ROWS = 30
const THUMB_DIR = '/tmp/tidepool-thumbs'
// Thumbnails made, by file and box; null when the image could not be shrunk (no sips: not macOS, or not an image).
const thumbs = new Map<string, { cols: number; rows: number; cells: string } | null>()

const hash = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}

// A thumbnail of the image at `path` inside maxCols×maxRows cells: macOS `sips` reads its size and writes a BMP
// of exactly the cells' pixels (the mod cannot inflate a PNG itself), which hooks/thumb.ts turns into cells.
async function thumbFor($: EngineInterface, path: string, maxCols: number, maxRows: number) {
  const key = `${path}|${maxCols}x${maxRows}`
  if (thumbs.has(key)) return thumbs.get(key)!
  let made: { cols: number; rows: number; cells: string } | null = null
  try {
    const dims = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path])
    const w = Number(/pixelWidth: (\d+)/.exec(dims.stdout)?.[1])
    const h = Number(/pixelHeight: (\d+)/.exec(dims.stdout)?.[1])
    if (dims.exitCode === 0 && w > 0 && h > 0) {
      const { cols, rows } = thumbSize(w, h, maxCols, maxRows)
      const file = `${THUMB_DIR}/${hash(key)}.bmp`
      await $.process.run(['mkdir', '-p', THUMB_DIR])
      const shrunk = await $.process.run(['sips', '-s', 'format', 'bmp', '--resampleHeightWidth', String(rows * 2), String(cols), path, '--out', file])
      if (shrunk.exitCode === 0) {
        const picture = parseBmp(fromBase64((await $.fs.read(file, { as: 'bytes' })).base64))
        if (picture) made = { cols, rows, cells: encodeCells(thumbCells(picture, cols, rows)) }
      }
    }
  } catch {
    // No sips, or not an image it reads: the line keeps open ↗ and draws no thumbnail.
  }
  thumbs.set(key, made)
  return made
}

// A file path as a file: URL, each segment encoded (spaces, a screenshot name's narrow no-break space, #, ?).
export const fileUrl = (path: string) => `file://${path.split('/').map(encodeURIComponent).join('/')}`

// Text and Markdown elements refuse more than 10000 characters, or control characters other than tab and newline.
// Such rows keep the engine's drawing rather than being refused.
// eslint-disable-next-line no-control-regex
const fits = (text: string) => text.length <= 10_000 && !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)

// Columns kept clear at the chat's right edge, so wrapped text never runs into the docked rail's separator.
const GUTTER = 2

// Opens an image: in Orca, in a tab of Orca's own browser beside the terminal (its image viewer); elsewhere in the
// system's viewer, `open` on macOS, `xdg-open` on Linux.
async function openFile($: EngineInterface, path: string) {
  if ((await $.env.get('TERM_PROGRAM').catch(() => undefined)) === 'Orca') {
    const tab = await $.process.run(['orca', 'tab', 'create', '--url', fileUrl(path)]).catch(() => undefined)
    if (tab?.exitCode === 0) return
  }
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
    const attached = await pathsFor($, imageNumbers(p.text))
    const big = attached.length ? await read($, imageBig) : []
    const { Raster } = $.ui.resolve(e) as unknown as { Raster: (props: Record<string, unknown>) => RenderElement }
    const bigCols = Math.max(SMALL.cols, (e.viewport?.columns ?? 100) - GUTTER - 11)
    const shown = await Promise.all(attached.map(async a => ({
      ...a,
      isBig: big.includes(a.n),
      thumb: await thumbFor($, a.path, big.includes(a.n) ? bigCols : SMALL.cols, big.includes(a.n) ? BIG_ROWS : SMALL.rows),
    })))
    // marginTop keeps the blank line the engine puts between messages.
    return (
      <Box flexDirection="column" marginTop={1} paddingRight={GUTTER}>
        <Box>
          <Box flexShrink={0}>
            <Text color={C.accent} bold>{'▌ you  '}</Text>
          </Box>
          <Text color={C.ink} italic wrap="wrap">{p.text}</Text>
        </Box>
        {shown.map(({ n, path, isBig, thumb }) => (
          <Box key={`img-${n}`} flexDirection="column" paddingLeft={7}>
            <Box flexDirection="row">
              <Box flexShrink={0}><Text color={C.faint}>{`▣ #${n} `}</Text></Box>
              <Text color={C.soft} wrap="truncate-start">{path.split('/').pop() ?? path}</Text>
              <Box flexShrink={0}>
                {thumb && (
                  <Button key={`thumb:${n}`} plain onPress={() => update($, imageBig, list => (list.includes(n) ? list.filter(one => one !== n) : [...list, n]))}>
                    {isBig ? '  ▴ smaller' : '  ▾ larger'}
                  </Button>
                )}
                <Button key={`img:${n}`} plain onPress={() => openFile($, path)}>{'  open ↗'}</Button>
              </Box>
            </Box>
            {thumb && <Box paddingLeft={2}><Raster key={`thumb-${n}`} columns={thumb.cols} rows={thumb.rows} cells={thumb.cells} /></Box>}
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
