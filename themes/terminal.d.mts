import type { ThemeId } from '../hooks/palettes.mjs'

export type Theme = {
  name: string
  background: string
  foreground: string
  cursor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
  palette: string[]
}
export declare const terminalThemes: Record<ThemeId, Theme>
