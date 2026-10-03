import type { On } from 'claude-code'

const COMMAND = 'ccshine-statusline'

export function registerStatusline(on: On) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show the settings.json line that turns on the ccshine status line' })
    // A marketplace update installs into a new versioned folder; a statusLine still pointing at the old one breaks.
    const current = (await $.settings.read()).statusLine
    const command = current && typeof current === 'object' && 'command' in current ? String(current.command) : ''
    if (command.includes('ccshine-statusline.mjs') && !command.includes($.plugin.root)) {
      $.ui.toast('ccshine was updated: run /ccshine-statusline and paste the new statusLine path')
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
