export type StatusLineOptions = { theme: string; powerline: boolean; columns: number; now?: number }
export type GitInfo = { branch: string; dirty: number; untracked: number; ahead: number; behind: number }
import type { PrInfo } from './pr.mjs'
export declare function render(input: unknown, options: StatusLineOptions, git?: GitInfo, pr?: PrInfo | null): string
