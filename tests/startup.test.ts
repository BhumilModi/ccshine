import { expect, test } from 'claude-code/testing'

import { FONT_FILES } from '../hooks/setup'

const WINDOWS_TOAST =
  'ccshine installed the Maple Mono NF font. Restart your terminal and pick "Maple Mono NF" in its font settings. /ccshine-setup has the steps.'
const TOAST =
  'ccshine installed the Maple Mono NF font and Warm Claude theme. Pick "Maple Mono NF" in your terminal\'s font settings (restart it first on Windows). /ccshine-setup has the steps.'

type Machine = {
  env?: Record<string, string>
  uname?: string | Error
  existing?: string[]
  powershellOut?: string
  failCopy?: boolean
}

// Hooks beneath the plugins must all be registered before the test first calls $.
function machine(on: any, m: Machine) {
  const runs: string[][] = []
  const toasts: string[] = []
  const stdins: (string | undefined)[] = []
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: m.env?.[e.name] }))
  on('fs.exists', (_$: unknown, e: { path: string }) => ({ value: (m.existing ?? []).some(p => e.path.endsWith(p)) }))
  on('process.run', (_$: unknown, e: { argv: string[]; init?: { stdin?: string } }) => {
    runs.push([...e.argv])
    if (e.argv[0] === 'powershell') stdins.push(e.init?.stdin)
    const [cmd] = e.argv
    if (cmd === 'uname') {
      if (m.uname instanceof Error) throw m.uname
      return { value: { exitCode: 0, stdout: `${m.uname ?? 'Darwin'}\n`, stderr: '' } }
    }
    if (cmd === 'powershell') return { value: { exitCode: 0, stdout: m.powershellOut ?? '', stderr: '' } }
    if (cmd === 'cp' && m.failCopy) return { value: { exitCode: 1, stdout: '', stderr: 'Permission denied' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('config.list', () => ({ value: [] }))
  on('command.register', (_$: unknown, e: { name: string }) => ({ value: { command: e.name, agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  return { runs, toasts, stdins }
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
const copies = (runs: string[][]) => runs.filter(r => r[0] === 'cp')

test('missing files are copied and toasted once on macOS', async ($, on) => {
  const { runs, toasts } = machine(on, { env: { HOME: '/Users/Jane Doe' } })
  await start($)
  const cps = copies(runs)
  expect(cps).toHaveLength(5)
  for (const font of FONT_FILES) expect(cps.some(r => r[2] === `/Users/Jane Doe/Library/Fonts/${font.file}`)).toBe(true)
  expect(cps.some(r => r[2] === '/Users/Jane Doe/.config/ghostty/themes/Warm Claude' && r[1]!.endsWith('/themes/ghostty/Warm Claude'))).toBe(true)
  expect(runs.some(r => r.join(' ') === 'mkdir -p /Users/Jane Doe/Library/Fonts')).toBe(true)
  expect(toasts).toEqual([TOAST])
})

test('only missing files are copied', async ($, on) => {
  const { runs, toasts } = machine(on, { env: { HOME: '/Users/a' }, existing: ['/Library/Fonts/MapleMono-NF-Regular.ttf'] })
  await start($)
  expect(copies(runs)).toHaveLength(4)
  expect(copies(runs).some(r => r[2]!.endsWith('MapleMono-NF-Regular.ttf'))).toBe(false)
  expect(toasts).toEqual([TOAST])
})

test('nothing to copy means no toast', async ($, on) => {
  const all = [...FONT_FILES.map(f => `/Library/Fonts/${f.file}`), '/ghostty/themes/Warm Claude']
  const { runs, toasts } = machine(on, { env: { HOME: '/Users/a' }, existing: all })
  await start($)
  expect(copies(runs)).toHaveLength(0)
  expect(toasts).toEqual([])
})

test('linux uses XDG folders and refreshes the font cache', async ($, on) => {
  const { runs } = machine(on, { uname: 'Linux', env: { HOME: '/home/a', XDG_DATA_HOME: '/data' } })
  await start($)
  expect(copies(runs).some(r => r[2] === '/data/fonts/MapleMono-NF-Bold.ttf')).toBe(true)
  expect(runs.some(r => r.join(' ') === 'fc-cache -f /data/fonts')).toBe(true)
})

test('windows runs one powershell call and toasts what it copied', async ($, on) => {
  const { runs, toasts } = machine(on, { env: { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, powershellOut: 'copied MapleMono-NF-Regular.ttf\r\n' })
  await start($)
  const ps = runs.filter(r => r[0] === 'powershell')
  expect(ps).toHaveLength(1)
  expect(ps[0]!.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
  // The test kit's $ has no plugin root, so check the script's shape rather than its exact text.
  const bytes = atob(ps[0]![4]!)
  let script = ''
  for (let i = 0; i < bytes.length; i += 2) script += String.fromCharCode(bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8))
  for (const font of FONT_FILES) expect(script).toContain(`'${font.registryName}'`)
  expect(script).toContain('$env:LOCALAPPDATA')
  expect(runs.some(r => r[0] === 'uname' || r[0] === 'cp')).toBe(false)
  expect(toasts).toEqual([WINDOWS_TOAST])
})

test('windows with nothing copied shows no toast', async ($, on) => {
  const { toasts } = machine(on, { env: { OS: 'Windows_NT' }, powershellOut: '' })
  await start($)
  expect(toasts).toEqual([])
})

test('no HOME or a failing uname copies nothing and session start still resolves', async ($, on) => {
  const { runs, toasts } = machine(on, { uname: new Error('uname: not found'), env: {} })
  await start($)
  expect(copies(runs)).toHaveLength(0)
  expect(toasts).toEqual([])
})

test('a failing copy shows no toast', async ($, on) => {
  const { toasts } = machine(on, { env: { HOME: '/Users/a' }, failCopy: true })
  await start($)
  expect(toasts).toEqual([])
})

test('install off runs nothing', { options: { installAssets: false } }, async ($, on) => {
  const { runs, toasts } = machine(on, { env: { HOME: '/Users/a' } })
  await start($)
  expect(runs).toHaveLength(0)
  expect(toasts).toEqual([])
})

test('/ccshine-setup installs and prints the guide', async ($, on) => {
  machine(on, { env: { HOME: '/Users/a' } })
  const { text } = await $.command.run({ command: 'ccshine-setup', args: '' } as never)
  expect(text).toContain(`Installed: ${[...FONT_FILES.map(f => f.file), 'Warm Claude'].join(', ')}.`)
  expect(text).toContain('| iTerm2 |')
})

test('windows skips powershell when every font is already there', async ($, on) => {
  const existing = FONT_FILES.map(f => `\\Microsoft\\Windows\\Fonts\\${f.file}`)
  const { runs, toasts } = machine(on, { env: { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, existing })
  await start($)
  expect(runs.filter(r => r[0] === 'powershell')).toHaveLength(0)
  expect(toasts).toEqual([])
})

test('powershell gets closed standard input so it cannot wait on it', async ($, on) => {
  const { stdins } = machine(on, { env: { OS: 'Windows_NT', LOCALAPPDATA: 'C:\\L' }, powershellOut: '' })
  await start($)
  expect(stdins).toEqual([''])
})

test('WSL and SSH sessions install nothing and show no toast', async ($, on) => {
  const { runs, toasts } = machine(on, { uname: 'Linux', env: { HOME: '/home/a', WSL_DISTRO_NAME: 'Ubuntu' } })
  await start($)
  expect(copies(runs)).toHaveLength(0)
  expect(toasts).toEqual([])
})

test('ssh sessions install nothing', async ($, on) => {
  const { runs } = machine(on, { uname: 'Linux', env: { HOME: '/home/a', SSH_CONNECTION: '10.0.0.2 51000 10.0.0.1 22' } })
  await start($)
  expect(copies(runs)).toHaveLength(0)
})
