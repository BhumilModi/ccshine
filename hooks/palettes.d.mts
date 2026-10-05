export type Palette = {
  accent: string
  onAccent: string
  seg: string
  segAlt: string
  ink: string
  soft: string
  mid: string
  faint: string
  track: string
  warn: string
  crit: string
  info: string
}

export type ThemeId = 'claude' | 'warm' | 'nord' | 'dracula' | 'mono'

export declare const palettes: Record<ThemeId, Palette>
export declare const terminalNames: Record<ThemeId, string>
