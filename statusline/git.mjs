// Git state for the status line from one `git status` call. Pure parsing, so the plugin's tests can import it.

// --no-optional-locks: a status line runs every few seconds and must never hold the index lock
// while the user (or Claude) runs git commit, add or rebase.
export function gitArgs(dir) {
  return ['--no-optional-locks', '-C', dir, 'status', '--porcelain=v2', '--branch']
}

export function parseGitStatus(out) {
  const git = { branch: '', dirty: 0, untracked: 0, ahead: 0, behind: 0 }
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) git.branch = line.slice(14)
    else if (line.startsWith('# branch.ab ')) {
      const [, a, b] = line.match(/\+(\d+) -(\d+)/) ?? []
      git.ahead = Number(a ?? 0)
      git.behind = Number(b ?? 0)
    } else if (/^[12u] /.test(line)) git.dirty++
    else if (line.startsWith('? ')) git.untracked++
  }
  if (git.branch === '(detached)') git.branch = 'detached'
  return git.branch ? git : undefined
}
