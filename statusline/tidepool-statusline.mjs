#!/usr/bin/env node
// Tidepool status line. Claude Code runs this as its statusLine command and pipes session JSON to stdin.
// Run /tidepool-statusline inside Claude Code for the settings.json line that points here.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { gitArgs, parseGitStatus } from './git.mjs'
import { pickConfigKey } from './config.mjs'
import { parsePr, prKey, shouldRefresh } from './pr.mjs'
import { render } from './render.mjs'

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}

// The plugin's own /config options (statusline/config.mjs says which key).
function readOptions() {
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    const configs = settings.pluginConfigs ?? {}
    const key = pickConfigKey(Object.keys(configs))
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

// PR badge cache: { [dir::branch]: { checkedAt, pr, refreshingAt? } }, refreshed in the background.
const PR_CACHE = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'tidepool', 'pr.json')

function readPrCache() {
  try {
    return JSON.parse(readFileSync(PR_CACHE, 'utf8'))
  } catch {
    return {}
  }
}

function writePrEntry(key, entry) {
  const cache = { ...readPrCache(), [key]: entry }
  mkdirSync(dirname(PR_CACHE), { recursive: true })
  const tmp = `${PR_CACHE}.${process.pid}`
  writeFileSync(tmp, JSON.stringify(cache))
  renameSync(tmp, PR_CACHE)
}

// The badge never waits on the network: draw from the cache, and when it is stale start a detached refresh.
function readPr(dir, git) {
  if (typeof dir !== 'string' || !git?.branch || git.branch === 'detached') return undefined
  try {
    const key = prKey(dir, git.branch)
    const entry = readPrCache()[key]
    const now = Date.now()
    if (shouldRefresh(entry, now)) {
      writePrEntry(key, { checkedAt: entry?.checkedAt ?? 0, pr: entry?.pr ?? null, refreshingAt: now })
      spawn(process.execPath, [fileURLToPath(import.meta.url), '--refresh-pr', dir, key], { detached: true, stdio: 'ignore' }).unref()
    }
    return entry?.pr ?? undefined
  } catch {
    return undefined
  }
}

// Background mode: look the PR up with gh and store the answer, including "no PR".
if (process.argv[2] === '--refresh-pr') {
  const [dir, key] = process.argv.slice(3)
  let pr = null
  try {
    pr = parsePr(
      execFileSync('gh', ['pr', 'view', '--json', 'number,state,isDraft'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    pr = null
  }
  try {
    writePrEntry(key, { checkedAt: Date.now(), pr })
  } catch {}
  process.exit(0)
}

const input = readInput()
try {
  const options = readOptions()
  const dir = input?.workspace?.current_dir ?? input?.cwd
  const columns = process.stdout.columns || Number(process.env.COLUMNS) || 120
  const git = readGit(dir)
  const line = render(
    input,
    { theme: options.theme ?? 'claude', powerline: options.powerline === true, columns, now: Date.now() },
    git,
    readPr(dir, git),
  )
  process.stdout.write(line + '\n')
} catch {
  // Never fail Claude Code's footer: fall back to a plain line built only from strings.
  const str = v => (typeof v === 'string' ? v : '')
  const model = str(input?.model?.display_name)
  const dir = str(input?.workspace?.current_dir) || str(input?.cwd)
  process.stdout.write([model, dir.split(/[\\/]/).filter(Boolean).pop() ?? ''].filter(Boolean).join(' · ') + '\n')
}
