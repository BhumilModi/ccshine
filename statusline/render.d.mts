export type StatusLineOptions = { theme: string; powerline: boolean; columns: number; now?: number }
export type GitInfo = { branch: string; dirty: number; untracked: number; ahead: number; behind: number }
export declare function render(input: unknown, options: StatusLineOptions, git?: GitInfo): string
