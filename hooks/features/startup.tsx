import type { EngineInterface, On } from 'claude-code'

import { opts } from '../options'
import { FONT_FILES, GHOSTTY_THEME, isWindowsRoot, setupGuide, unixTargets, windowsInstallScript } from '../setup'

const STATUSLINE = 'ccshine-statusline'
const SETUP = 'ccshine-setup'
const LIGHT_THEME = 'ccshine palettes are made for dark terminals — set a dark theme in /config'
const INSTALLED =
  'ccshine installed the Maple Mono NF font and Warm Claude theme. Pick "Maple Mono NF" in your terminal\'s font settings (restart it first on Windows). /ccshine-setup has the steps.'

// Copies the bundled font (and, outside Windows, the Ghostty theme) into the user's folders.
// Never overwrites; returns what it copied. Failures go to the debug log, never to the session.
async function installAssets($: EngineInterface): Promise<string[]> {
  const root = $.plugin.root
  const log = (text: string) => $.ui.log(`ccshine: ${text}`, { to: 'debug' })
  try {
    if ((await $.env.get('OS')) === 'Windows_NT' || isWindowsRoot(root)) {
      const ran = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', windowsInstallScript(root)], { timeoutMs: 60_000 })
      if (ran.exitCode !== 0) log(`font install failed: ${ran.stderr.trim()}`)
      return ran.stdout.split(/\r?\n/).filter(line => line.startsWith('copied ')).map(line => line.slice('copied '.length).trim())
    }
    const os = (await $.process.run(['uname', '-s'])).stdout.trim()
    if (os !== 'Darwin' && os !== 'Linux') return []
    // $.env.get takes literal names only.
    const env: Record<string, string> = {}
    const home = await $.env.get('HOME')
    const data = await $.env.get('XDG_DATA_HOME')
    const config = await $.env.get('XDG_CONFIG_HOME')
    if (home) env.HOME = home
    if (data) env.XDG_DATA_HOME = data
    if (config) env.XDG_CONFIG_HOME = config
    const targets = unixTargets(os, env)
    if (!targets) return []
    const assets = [
      ...FONT_FILES.map(f => ({ name: f.file, src: `${root}/fonts/${f.file}`, dir: targets.fontDir })),
      { name: GHOSTTY_THEME, src: `${root}/themes/ghostty/${GHOSTTY_THEME}`, dir: targets.themeDir },
    ]
    const copied: string[] = []
    for (const asset of assets) {
      const dst = `${asset.dir}/${asset.name}`
      if (await $.fs.exists(dst)) continue
      await $.process.run(['mkdir', '-p', asset.dir])
      const ran = await $.process.run(['cp', asset.src, dst])
      if (ran.exitCode === 0) copied.push(asset.name)
      else log(`could not copy ${asset.name}: ${ran.stderr.trim()}`)
    }
    if (os === 'Linux' && copied.some(name => name.endsWith('.ttf'))) {
      await $.process.run(['fc-cache', '-f', targets.fontDir]).catch(() => undefined)
    }
    return copied
  } catch (error) {
    log(`font install skipped: ${String(error)}`)
    return []
  }
}

// The one session.start hook: a module may register it only once.
export function registerStartup(on: On) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: STATUSLINE, description: 'Show the settings.json line that turns on the ccshine status line' })
    await $.command.register({ name: SETUP, description: 'Install the Maple Mono NF font and Warm Claude theme, and show how to use them in your terminal' })
    // A marketplace update installs into a new versioned folder; a statusLine still pointing at the old one breaks.
    const current = (await $.settings.read()).statusLine
    const command = current && typeof current === 'object' && 'command' in current ? String(current.command) : ''
    if (command.includes('ccshine-statusline.mjs') && !command.includes($.plugin.root)) {
      $.ui.toast('ccshine was updated: run /ccshine-statusline and paste the new statusLine path')
    }
    // Prompt chrome: Claude Code's theme colours the input box, logo and dialogs. ccshine never changes it, only says so.
    if (opts.chrome) {
      try {
        const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
        if (typeof theme === 'string' && theme.includes('light')) $.ui.toast(LIGHT_THEME)
      } catch {
        // No config to read: nothing to suggest.
      }
    }
    if (opts.installAssets && (await installAssets($)).length > 0) $.ui.toast(INSTALLED)
    return next(e)
  })

  on('command.run', { command: SETUP }, async $ => ({ text: setupGuide($.plugin.root, await installAssets($)) }))
}
