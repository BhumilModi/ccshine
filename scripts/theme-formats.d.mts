import type { Theme } from '../themes/terminal.mjs'
export declare const FORMATS: Record<string, (theme: Theme) => string>
export declare function themePath(pattern: string, name: string): string
export declare function colourTable(themes: Theme[]): string
