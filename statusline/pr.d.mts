export type PrState = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED'
export type PrInfo = { number: number; state: PrState | string }
export type PrEntry = { checkedAt: number; pr: PrInfo | null; refreshingAt?: number }
export declare function prKey(dir: string, branch: string): string
export declare function parsePr(stdout: string): PrInfo | null
export declare function shouldRefresh(entry: PrEntry | undefined, now: number): boolean
