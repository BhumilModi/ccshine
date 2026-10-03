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

export declare const palettes: Record<'claude' | 'nord' | 'dracula' | 'mono', Palette>
