#!/usr/bin/env node
// Writes every terminal theme file from themes/terminal.mjs. With --check, writes nothing and exits 1 when a file is stale.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { terminalThemes } from '../themes/terminal.mjs'
import { colourTable, FORMATS, themePath } from './theme-formats.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const stale = []
const files = Object.values(terminalThemes).flatMap(theme =>
  Object.entries(FORMATS).map(([pattern, render]) => [themePath(pattern, theme.name), render(theme)]),
)
// The README's colour reference sits between these markers.
const START = '<!-- theme-colours:start -->'
const END = '<!-- theme-colours:end -->'
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const [before, rest] = readme.split(START)
if (rest === undefined || !rest.includes(END)) {
  console.error(`README.md has no ${START} … ${END} block`)
  process.exit(1)
}
files.push(['README.md', `${before}${START}\n${colourTable(Object.values(terminalThemes))}\n${END}${rest.slice(rest.indexOf(END) + END.length)}`])
for (const [path, text] of files) {
  const file = join(root, path)
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
console.log(check ? 'themes: ok' : `themes: wrote ${files.length - 1} files and the README colour table`)
