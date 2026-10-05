export type Options = {
  theme: string
  powerline: boolean
  tasks: boolean
  tools: boolean
  spinner: boolean
  usage: boolean
  alerts: boolean
  alertAfterSeconds: number
  transcript: boolean
  chrome: boolean
  installAssets: boolean
  dock: boolean
  rail: boolean
}

export const DEFAULTS: Options = {
  theme: 'claude',
  powerline: false,
  tasks: true,
  tools: true,
  spinner: true,
  usage: true,
  alerts: true,
  alertAfterSeconds: 30,
  transcript: true,
  chrome: true,
  installAssets: true,
  dock: true,
  rail: true,
}

// The engine fills defaults from plugin.json; DEFAULTS covers anything it leaves out.
export let opts: Options = DEFAULTS

export function setOptions(values: Record<string, unknown> | undefined) {
  opts = { ...DEFAULTS, ...(values as Partial<Options>) }
}
