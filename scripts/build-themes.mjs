#!/usr/bin/env node
// Writes every terminal theme file from themes/warm-claude.mjs. With --check, writes nothing and exits 1 when a file is stale.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { warmClaude } from '../themes/warm-claude.mjs'
import { FORMATS } from './theme-formats.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const stale = []
for (const [path, render] of Object.entries(FORMATS)) {
  const file = join(root, path)
  const text = render(warmClaude)
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) stale.push(path)
    continue
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
if (stale.length) {
  console.error(`themes out of date, run node scripts/build-themes.mjs: ${stale.join(', ')}`)
  process.exit(1)
}
console.log(check ? 'themes: ok' : `themes: wrote ${Object.keys(FORMATS).length} files`)
