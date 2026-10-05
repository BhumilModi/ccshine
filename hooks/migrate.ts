// The newest store file ccshine (Tidepool's old name) left behind.
export function oldStore(entries: { name: string; mtimeMs: number }[]): string | undefined {
  return entries.filter(e => /^ccshine_.*\.json$/.test(e.name)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.name
}
