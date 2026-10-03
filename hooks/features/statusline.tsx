import type { On } from 'claude-code'

import { opts } from '../options'

const COMMAND = 'ccshine-statusline'
const LIGHT_THEME = 'ccshine palettes are made for dark terminals — set a dark theme in /config'

export function registerStatusline(on: On) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show the settings.json line that turns on the ccshine status line' })
    // A marketplace update installs into a new versioned folder; a statusLine still pointing at the old one breaks.
    const current = (await $.settings.read()).statusLine
    const command = current && typeof current === 'object' && 'command' in current ? String(current.command) : ''
    if (command.includes('ccshine-statusline.mjs') && !command.includes($.plugin.root)) {
      $.ui.toast('ccshine was updated: run /ccshine-statusline and paste the new statusLine path')
    }
    // Prompt chrome: Claude Code's theme colours the input box, logo and dialogs. ccshine never changes it, only says so.
    // Here because a module registers session.start once.
    if (opts.chrome) {
      try {
        const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
        if (typeof theme === 'string' && theme.includes('light')) $.ui.toast(LIGHT_THEME)
      } catch {
        // No config to read: nothing to suggest.
      }
    }
    return next(e)
  })

  // Plugins cannot edit settings.json, so print the exact line with this install's path.
  on('command.run', { command: COMMAND }, async $ => {
    const script = `${$.plugin.root}/statusline/ccshine-statusline.mjs`
    const line = JSON.stringify({ type: 'command', command: `node "${script}"`, padding: 0, refreshInterval: 10 }, null, 2)
    return {
      text: [
        'Add this to ~/.claude/settings.json (replacing any existing "statusLine"), then start a new session:',
        '',
        '```json',
        `"statusLine": ${line}`,
        '```',
        '',
        'Needs Node 18 or later. Theme and powerline glyphs follow the ccshine options in /config.',
      ].join('\n'),
    }
  })
}
