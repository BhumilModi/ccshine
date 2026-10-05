import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { encodeCells, idleCells, site } from '../dock'
import { oldStore } from '../migrate'
import { opts } from '../options'
import { palette } from '../theme'
import { encodePowerShell, FONT_FILES, GHOSTTY_THEME, isWindowsRoot, setupGuide, unixTargets, windowsInstallScript } from '../setup'
import type { InstallOutcome } from '../setup'

const STATUSLINE = 'tidepool-statusline'
// The side pane the Tide rail used to be drawn in; a hot reload from that version can leave it open.
const OLD_RAIL_PANE = 'tidepool-rail'
const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
const jobs = atom({ plugin: 'tidepool', key: 'jobs' } as const, [])
const railNow = atom({ plugin: 'tidepool', key: 'railNow' } as const, 0)

// The timeline's live rows grow once a second, only while a turn or a background job runs.
async function tickRail($: EngineInterface) {
  const isLive = (await read($, spans)).some(s => s.endedAt === undefined) || (await read($, jobs)).some(j => j.status === 'running')
  if (isLive) {
    const at = await $.clock.now()
    await update($, railNow, () => at)
  }
}
const SETUP = 'tidepool-setup'
const LIGHT_THEME = 'Tidepool palettes are made for dark terminals — set a dark theme in /config'
const INSTALLED_WINDOWS =
  'Tidepool installed the Maple Mono NF font. Restart your terminal and pick "Maple Mono NF" in its font settings. /tidepool-setup has the steps.'
const INSTALLED =
  'Tidepool installed the Maple Mono NF font and Warm Claude theme. Pick "Maple Mono NF" in your terminal\'s font settings (restart it first on Windows). /tidepool-setup has the steps.'

// Copies the bundled font (and, outside Windows, the Ghostty theme) into the user's folders.
// Never overwrites. Failures go to the debug log, never to the session.
async function installAssets($: EngineInterface): Promise<InstallOutcome> {
  const root = $.plugin.root
  const log = (text: string) => $.ui.log(`tidepool: ${text}`, { to: 'debug' })
  const none: InstallOutcome = { copied: [], failed: false, remote: false }
  try {
    // Under WSL or SSH the terminal drawing this session is on another machine, which a copy here cannot reach.
    if ((await $.env.get('WSL_DISTRO_NAME')) || (await $.env.get('SSH_CONNECTION')) || (await $.env.get('SSH_TTY'))) {
      return { ...none, remote: true }
    }
    if ((await $.env.get('OS')) === 'Windows_NT' || isWindowsRoot(root)) {
      // Checked here so PowerShell, slow to start, runs only when a font is missing.
      const local = await $.env.get('LOCALAPPDATA')
      if (local) {
        let missing = false
        for (const font of FONT_FILES) if (!(await $.fs.exists(`${local}\\Microsoft\\Windows\\Fonts\\${font.file}`))) missing = true
        if (!missing) return none
      }
      const ran = await $.process.run(
        ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(windowsInstallScript(root))],
        { stdin: '', timeoutMs: 60_000 },
      )
      const copied = ran.stdout.split(/\r?\n/).filter(line => line.startsWith('copied ')).map(line => line.slice('copied '.length).trim())
      if (ran.exitCode !== 0) log(`font install failed: ${ran.stderr.trim()}`)
      return { copied, failed: ran.exitCode !== 0, remote: false }
    }
    const os = (await $.process.run(['uname', '-s'])).stdout.trim()
    if (os !== 'Darwin' && os !== 'Linux') return none
    // $.env.get takes literal names only.
    const env: Record<string, string> = {}
    const home = await $.env.get('HOME')
    const data = await $.env.get('XDG_DATA_HOME')
    const config = await $.env.get('XDG_CONFIG_HOME')
    if (home) env.HOME = home
    if (data) env.XDG_DATA_HOME = data
    if (config) env.XDG_CONFIG_HOME = config
    const targets = unixTargets(os, env)
    if (!targets) {
      log('font install skipped: no HOME')
      return { ...none, failed: true }
    }
    const assets = [
      ...FONT_FILES.map(f => ({ name: f.file, src: `${root}/fonts/${f.file}`, dir: targets.fontDir })),
      { name: GHOSTTY_THEME, src: `${root}/themes/ghostty/${GHOSTTY_THEME}`, dir: targets.themeDir },
    ]
    const copied: string[] = []
    let failed = false
    for (const asset of assets) {
      const dst = `${asset.dir}/${asset.name}`
      if (await $.fs.exists(dst)) continue
      await $.process.run(['mkdir', '-p', asset.dir])
      const ran = await $.process.run(['cp', asset.src, dst])
      if (ran.exitCode === 0) copied.push(asset.name)
      else {
        failed = true
        log(`could not copy ${asset.name}: ${ran.stderr.trim()}`)
      }
    }
    if (os === 'Linux' && copied.some(name => name.endsWith('.ttf'))) {
      await $.process.run(['fc-cache', '-f', targets.fontDir]).catch(() => undefined)
    }
    return { copied, failed, remote: false }
  } catch (error) {
    log(`font install skipped: ${String(error)}`)
    return { ...none, failed: true }
  }
}

// Plan-time history is kept per plugin name, so the rename would start it over; copy it across once.
async function migrateHistory($: EngineInterface): Promise<void> {
  try {
    if ((await $.store.get('history-by-project')) !== undefined) return
    const home = await $.env.get('HOME')
    const dir = `${(await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`}/plugins/store`
    const name = oldStore(await $.fs.list(dir))
    if (!name) return
    const history = (JSON.parse(String(await $.fs.read(`${dir}/${name}`))) as Record<string, unknown>)['history-by-project']
    if (history !== undefined) await $.store.set('history-by-project', history)
  } catch {
    // Nothing to carry over: estimates relearn.
  }
}

// The one session.start hook: a module may register it only once.
export function registerStartup(on: On) {
  on('session.start', async ($, e, next) => {
    await migrateHistory($)
    // A hot reload from the version that drew the rail in a pane leaves that pane open with nothing to draw it.
    for (const pane of await $.ui.panes().catch(() => [])) if (pane.id === OLD_RAIL_PANE) await $.ui.close({ id: OLD_RAIL_PANE })
    $.clock.every(1000, () => void tickRail($))
    await $.command.register({ name: STATUSLINE, description: 'Show the settings.json line that turns on the Tidepool status line' })
    await $.command.register({ name: SETUP, description: 'Install the Maple Mono NF font and Warm Claude theme, and show how to use them in your terminal' })
    // A marketplace update installs into a new versioned folder; a statusLine still pointing at the old one breaks.
    const current = (await $.settings.read()).statusLine
    const command = current && typeof current === 'object' && 'command' in current ? String(current.command) : ''
    if (command.includes('ccshine-statusline.mjs') || (command.includes('tidepool-statusline.mjs') && !command.includes($.plugin.root))) {
      $.ui.toast('Tidepool was updated: run /tidepool-statusline and paste the new statusLine path')
    }
    // Prompt chrome: Claude Code's theme colours the input box, logo and dialogs. Tidepool never changes it, only says so.
    if (opts.chrome) {
      try {
        const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
        if (typeof theme === 'string' && theme.includes('light')) $.ui.toast(LIGHT_THEME)
      } catch {
        // No config to read: nothing to suggest.
      }
    }
    // Prompt dock: the idle crab blinks every few seconds, while the band shows its corner (site.cols unset).
    if (opts.dock && e.surface === 'terminal') {
      const paint = (blink: boolean) =>
        site.id && site.cols === undefined
          ? $.ui.blit({ requestId: site.id, key: 'dock-idle', cells: encodeCells(idleCells(blink, palette())) }).catch(() => undefined)
          : undefined
      $.clock.every(3800, () => {
        void paint(true)
        $.clock.after(140, () => void paint(false))
      })
    }
    if (opts.installAssets) {
      const outcome = await installAssets($)
      const windows = (await $.env.get('OS')) === 'Windows_NT' || isWindowsRoot($.plugin.root)
      if (outcome.copied.length > 0) $.ui.toast(windows ? INSTALLED_WINDOWS : INSTALLED)
    }
    return next(e)
  })

  on('command.run', { command: SETUP }, async $ => ({ text: setupGuide($.plugin.root, await installAssets($)) }))
}
