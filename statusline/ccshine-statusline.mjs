#!/usr/bin/env node
// ccshine status line. Claude Code runs this as its statusLine command and pipes session JSON to stdin.
// Run /ccshine-statusline inside Claude Code for the settings.json line that points here.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { gitArgs, parseGitStatus } from './git.mjs'
import { render } from './render.mjs'

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}

// The plugin's own /config options: pluginConfigs["ccshine"] for a local folder, "ccshine@<marketplace>" when installed.
function readOptions() {
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    const configs = settings.pluginConfigs ?? {}
    const key = Object.keys(configs).find(k => k === 'ccshine' || k.startsWith('ccshine@'))
    return (key && configs[key]?.options) || {}
  } catch {
    return {}
  }
}

// Branch, changes and ahead/behind from one git call; nothing when not a repo, git is missing or slow.
function readGit(dir) {
  if (typeof dir !== 'string' || !dir) return undefined
  try {
    return parseGitStatus(
      execFileSync('git', gitArgs(dir), { encoding: 'utf8', timeout: 500, stdio: ['ignore', 'pipe', 'ignore'] }),
    )
  } catch {
    return undefined
  }
}

const input = readInput()
try {
  const options = readOptions()
  const dir = input?.workspace?.current_dir ?? input?.cwd
  const columns = process.stdout.columns || Number(process.env.COLUMNS) || 120
  const line = render(
    input,
    { theme: options.theme ?? 'claude', powerline: options.powerline === true, columns, now: Date.now() },
    readGit(dir),
  )
  process.stdout.write(line + '\n')
} catch {
  // Never fail Claude Code's footer: fall back to a plain line built only from strings.
  const str = v => (typeof v === 'string' ? v : '')
  const model = str(input?.model?.display_name)
  const dir = str(input?.workspace?.current_dir) || str(input?.cwd)
  process.stdout.write([model, dir.split(/[\\/]/).filter(Boolean).pop() ?? ''].filter(Boolean).join(' · ') + '\n')
}
