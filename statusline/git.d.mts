import type { GitInfo } from './render.mjs'
export declare function gitArgs(dir: string): string[]
export declare function parseGitStatus(out: string): GitInfo | undefined
