// Pull request badge data: parsing `gh pr view` and deciding when to look again.
// Pure, so the plugin's tests can import it; the status line script does the file and process work.

const TTL_MS = 60_000
// A background refresh that has not written back within this time is assumed dead and retried.
const REFRESH_GRACE_MS = 30_000

export function prKey(dir, branch) {
  return `${dir}::${branch}`
}

// `gh pr view --json number,state,isDraft` output; anything else (no PR, not logged in) is null.
export function parsePr(stdout) {
  try {
    const pr = JSON.parse(stdout)
    if (typeof pr?.number !== 'number' || typeof pr?.state !== 'string') return null
    return { number: pr.number, state: pr.isDraft && pr.state === 'OPEN' ? 'DRAFT' : pr.state }
  } catch {
    return null
  }
}

export function shouldRefresh(entry, now) {
  if (!entry) return true
  if (entry.refreshingAt !== undefined && now - entry.refreshingAt < REFRESH_GRACE_MS) return false
  return now - entry.checkedAt > TTL_MS
}
