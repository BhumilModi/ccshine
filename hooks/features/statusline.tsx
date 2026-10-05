import type { On } from 'claude-code'

// Registered with the other commands in features/startup.tsx.
const COMMAND = 'tidepool-statusline'

export function registerStatusline(on: On) {
  // Plugins cannot edit settings.json, so print the exact line with this install's path.
  on('command.run', { command: COMMAND }, async $ => {
    const script = `${$.plugin.root}/statusline/tidepool-statusline.mjs`
    const line = JSON.stringify({ type: 'command', command: `node "${script}"`, padding: 0, refreshInterval: 10 }, null, 2)
    return {
      text: [
        'Add this to ~/.claude/settings.json (replacing any existing "statusLine"), then start a new session:',
        '',
        '```json',
        `"statusLine": ${line}`,
        '```',
        '',
        'Needs Node 18 or later. Theme and powerline glyphs follow the Tidepool options in /config.',
      ].join('\n'),
    }
  })
}
