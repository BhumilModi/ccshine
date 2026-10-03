// Draws the ccshine status line from the JSON Claude Code sends a statusLine command.
// Pure: no I/O, so the plugin's tests can import it. Every field is optional; missing ones drop their segment.
import { palettes } from '../hooks/palettes.mjs'

const SEP = ''
const START_CAP = ''
const END_CAP = ''
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(';')
const fg = hex => `\x1b[38;2;${rgb(hex)}m`
const bg = hex => `\x1b[48;2;${rgb(hex)}m`
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function tokens(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

// 1h 26m, 1d 17h, 12m
function span(ms) {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

// Same bar as the plugin's band: 12 cells, half-cell precision.
function bar(fraction, width = 12) {
  const units = Math.min(width * 2, Math.max(fraction > 0 ? 1 : 0, Math.round(fraction * width * 2)))
  const full = units >> 1
  const half = units % 2
  return { filled: '━'.repeat(full) + (half ? '╸' : ''), track: '─'.repeat(width - full - half) }
}

const level = (C, pct) => (pct >= 80 ? C.crit : pct >= 50 ? C.warn : C.ink)

// Segments are { bg, parts: [{ text, color, bold }] }; joined with powerline arrows or as flat blocks.
function draw(segments, glyphs) {
  let out = ''
  segments.forEach((seg, i) => {
    if (i === 0 && glyphs) out += fg(seg.bg) + START_CAP + RESET
    for (const p of seg.parts) out += bg(seg.bg) + (p.bold ? BOLD : '') + fg(p.color) + p.text + RESET
    if (!glyphs) return
    const next = segments[i + 1]
    out += next ? bg(next.bg) + fg(seg.bg) + SEP + RESET : fg(seg.bg) + END_CAP + RESET
  })
  return out
}

const width = (segments, glyphs) =>
  segments.reduce((n, s) => n + s.parts.reduce((m, p) => m + [...p.text].length, 0), 0) + (glyphs ? segments.length + 1 : 0)

export function render(input, options, git) {
  const C = Object.hasOwn(palettes, options.theme) ? palettes[options.theme] : palettes.claude
  const glyphs = options.powerline
  const now = options.now
  const segments = []

  const str = v => (typeof v === 'string' && v ? v : undefined)
  const model = str(input?.model?.display_name) ?? str(input?.model?.id)
  if (model) segments.push({ bg: C.accent, parts: [{ text: ` ${model} `, color: C.onAccent, bold: true }] })

  const effort = str(input?.effort?.level)
  if (effort) segments.push({ bg: C.seg, parts: [{ text: ` ${effort} `, color: C.mid }] })

  // Folder name only, for POSIX and Windows paths.
  const dir = str(input?.workspace?.current_dir) ?? str(input?.cwd)
  if (dir) segments.push({ bg: C.segAlt, parts: [{ text: ` ${dir.split(/[\\/]/).filter(Boolean).pop() ?? dir} `, color: C.ink }] })

  if (git?.branch) {
    const parts = [{ text: ` ${git.branch}`, color: C.soft }]
    if (git.dirty) parts.push({ text: ` +${git.dirty}`, color: C.warn })
    if (git.untracked) parts.push({ text: ` ?${git.untracked}`, color: C.mid })
    if (git.ahead) parts.push({ text: ` ↑${git.ahead}`, color: C.info })
    if (git.behind) parts.push({ text: ` ↓${git.behind}`, color: C.info })
    parts.push({ text: ' ', color: C.soft })
    segments.push({ bg: C.seg, parts })
  }

  const cw = input?.context_window
  const size = num(cw?.context_window_size)
  const u = cw?.current_usage
  const used = u ? (num(u.input_tokens) ?? 0) + (num(u.cache_creation_input_tokens) ?? 0) + (num(u.cache_read_input_tokens) ?? 0) : undefined
  const raw = num(cw?.used_percentage) ?? (used !== undefined && size ? (used / size) * 100 : undefined)
  const pct = raw === undefined ? undefined : Math.min(100, Math.max(0, Math.round(raw)))
  if (pct !== undefined) {
    const b = bar(pct / 100)
    const color = level(C, pct)
    const parts = [
      { text: ' ctx ', color: C.faint },
      { text: b.filled, color: pct >= 50 ? color : C.mid },
      { text: b.track, color: C.track },
      { text: ` ${pct}%`, color },
    ]
    if (used !== undefined && size) parts.push({ text: ` ${tokens(used)}/${tokens(size)}`, color: C.faint })
    parts.push({ text: ' ', color: C.faint })
    segments.push({ bg: C.segAlt, parts })
  }

  const expires = num(input?.prompt_cache?.expires_at)
  if (expires !== undefined && now !== undefined) {
    const left = expires * 1000 - now
    const text = left <= 0 ? ' cold ' : ` warm ${Math.ceil(left / 60_000)}m `
    segments.push({ bg: C.seg, parts: [{ text, color: left <= 0 ? C.crit : left < 5 * 60_000 ? C.warn : C.mid }] })
  }

  // Narrow terminal: drop segments from the right, never the model.
  while (segments.length > 1 && width(segments, glyphs) > options.columns) segments.pop()

  const line2 = []
  const limits = input?.rate_limits
  const windows = [
    ['Session', limits?.five_hour],
    ['Weekly', limits?.seven_day],
  ].filter(([, w]) => num(w?.used_percentage) !== undefined)
  windows.forEach(([label, w], i) => {
    const p = Math.round(w.used_percentage)
    const parts = [{ text: ` ${label} ${p}%`, color: level(C, p) }]
    const resets = num(w.resets_at)
    if (resets !== undefined && now !== undefined) parts.push({ text: ` · resets ${span(resets * 1000 - now)}`, color: C.faint })
    parts.push({ text: ' ', color: C.faint })
    line2.push({ bg: i % 2 ? C.segAlt : C.seg, parts })
  })
  const cost = num(input?.cost?.total_cost_usd)
  if (windows.length === 0 && cost !== undefined) {
    line2.push({ bg: C.seg, parts: [{ text: ` Session $${cost.toFixed(2)} `, color: C.ink }] })
  }

  // Narrow terminal: drop the reset times first, then the weekly window.
  if (width(line2, glyphs) > options.columns) {
    for (const seg of line2) seg.parts = seg.parts.filter(p => !p.text.startsWith(' · resets'))
  }
  while (line2.length > 1 && width(line2, glyphs) > options.columns) line2.pop()

  return [draw(segments, glyphs), draw(line2, glyphs)].filter(Boolean).join('\n')
}
