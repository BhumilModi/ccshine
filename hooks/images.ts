// Attached images: Claude Code shows `[Image #N]` in the prompt and, for an image that came from a file, adds a
// hidden `[Image: source: <path>]` text block after it. These pair the two so a prompt row can offer to open each.

const PLACEHOLDER = /\[Image #(\d+)\]/g
const SOURCE = /^\[Image: source: (.+)\]$/

// The image numbers a prompt shows, in order.
export function imageNumbers(text: string): number[] {
  return [...text.matchAll(PLACEHOLDER)].map(m => Number(m[1]))
}

type Message = { role: string; content: unknown }

const texts = (content: unknown): string[] =>
  typeof content === 'string'
    ? [content]
    : Array.isArray(content)
      ? content.flatMap(b => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string' ? [(b as { text: string }).text] : []))
      : []

// Image number to file path, over the conversation: each user prompt's placeholders, then the source blocks that
// follow them (in the same message or the next), paired in order. A pasted image with no file has no entry.
export function imagePaths(messages: readonly Message[]): Record<number, string> {
  const out: Record<number, string> = {}
  let pending: number[] = []
  for (const m of messages) {
    if (m.role !== 'user') continue
    for (const t of texts(m.content)) {
      const source = SOURCE.exec(t.trim())
      if (source) {
        const n = pending.shift()
        if (n !== undefined) out[n] = source[1]!
      } else if (imageNumbers(t).length > 0) {
        pending = imageNumbers(t)
      }
    }
  }
  return out
}
