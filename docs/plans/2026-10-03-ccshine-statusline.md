# ccshine rename + status line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the plugin to ccshine and ship a themed status line with it, so one install gives the whole look.

**Architecture:** The status line is a standalone Node script that Claude Code runs as `statusLine.command` (plugins cannot set settings themselves). Its drawing logic is a pure `.mjs` module the plugin's test kit can import, and it shares one palette file with the plugin's hooks. A `/ccshine-statusline` command prints the exact settings line with the installed path.

**Tech Stack:** Node 18+ (status line script, no dependencies), Claude Code function hooks, `claude plugin test`.

**Spec:** agreed in chat 2026-10-03: name `ccshine`; status line = our own themed script (option 1); content modelled on the user's current ccstatusline layout. Status line stdin captured live: `scratchpad/statusline-sample.json` (Claude Code 2.1.288).

## Global Constraints

- Plugin name `ccshine` everywhere: manifest, catalogue, state keys, README, folder `~/.claude/mods/ccshine`, settings key `pluginConfigs.ccshine`.
- No npm dependencies; status line uses only Node built-ins (`node:child_process`, `node:fs`, `node:os`, `node:path`).
- Status line never throws to Claude Code: any failure prints a plain fallback line (`<model> · <dir>`) and exits 0.
- Git calls time out after 500 ms each.
- Colours only from the shared palette file.
- Done means `./verify.sh` exits 0, which now also smoke-runs the status line script on the captured sample.

## Review Focus

1. Input from older or newer Claude Code versions with fields missing (`rate_limits`, `prompt_cache`, `effort`, `current_usage: null`, `used_percentage: null`): the line still renders, never `NaN` or `undefined`. Owner: Task 3.
2. Not a git repo, or git missing: git segments vanish, nothing else changes. Owner: Task 4.
3. API-key users (no `rate_limits`): line 2 shows session cost instead of limits. Owner: Task 3.
4. Narrow terminal: segments drop from the right on line 1 instead of wrapping. Owner: Task 3.
5. Settings file missing, unreadable or without `pluginConfigs.ccshine`: defaults (`claude` theme, no powerline). Owner: Task 4.

---

### Task 1: Rename to ccshine

**Files:** move `~/.claude/mods/terminal-plus` → `~/.claude/mods/ccshine`; modify `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/features/*.tsx` (atom `plugin:` keys), `types/index.d.ts`, `tests/*` (`plugin: 'terminal-plus'`), `README.md`; `~/.claude/settings.json` env `CLAUDE_CODE_PLUGIN_DIRS` (backup first).

- [ ] Rename every `terminal-plus` occurrence to `ccshine` (grep must return nothing afterwards except the v1 plan doc).
- [ ] Run `./verify.sh`; expect `verify: ok` with all 92 tests.
- [ ] Commit `refactor: rename terminal-plus to ccshine`.

### Task 2: One palette file for hooks and status line

**Files:** create `hooks/palettes.mjs` (palettes as plain data) and `hooks/palettes.d.mts` (its types); modify `hooks/theme.ts` to re-export from it; test `tests/theme.test.ts`.

**Interfaces:** Produces `palettes` (same keys and values as today) importable from `.mjs` by Node and from TS by the hooks.

- [ ] Test `theme palettes are the shared palette file` (`palettes` from `../hooks/theme` is the same object as from `../hooks/palettes.mjs`); watch it fail.
- [ ] Move the data; `./verify.sh`; commit `refactor: share palettes with the status line`.

### Task 3: Status line renderer

**Files:** create `statusline/render.mjs`, `statusline/render.d.mts`, `tests/statusline.test.ts` (sample input embedded from the captured JSON).

**Interfaces:** Produces `render(input: object, options: { theme: string, powerline: boolean, columns: number, now: number }, git?: { branch: string, dirty: number, untracked: number, ahead: number, behind: number }): string` (two lines joined by `\n`, ANSI truecolour).

Line 1 segments, in order: model (`accent` bg, `onAccent` text, bold) · effort level (when present) · folder (last path part) · git branch, `+dirty ?untracked`, `↑ahead ↓behind` (when git) · context `ctx ━━━╸──── 22% 44k/200k` (bar `mid`, turns `warn` at 50%, `crit` at 80%) · cache `warm 52m` / `cold` from `prompt_cache.expires_at` (omitted when absent).
Line 2: `Session 40% · resets 2h 30m` and `Weekly 68% · resets 1d 18h` from `rate_limits` (percent coloured like context); without `rate_limits`, `Session $0.03`.

- [ ] Tests (assert on text with ANSI stripped, plus one colour check): `renders model, folder, context and cache from the captured sample`; `context at 85% uses crit colour`; `missing rate_limits shows session cost`; `null used_percentage and missing prompt_cache render without NaN or undefined`; `git segment shows branch, +2 ?1 ↑1`; `no git leaves no git segment`; `drops right-most line-1 segments to fit 50 columns`; `powerline off uses no private-use glyphs`.
- [ ] Watch them fail, implement, `./verify.sh`, commit `feat: status line renderer`.

### Task 4: Status line script

**Files:** create `statusline/ccshine-statusline.mjs` (entry), `statusline/fixtures/sample.json`; modify `verify.sh`.

**Interfaces:** Consumes `render` (Task 3). Reads stdin JSON; options from `~/.claude/settings.json` → `pluginConfigs.ccshine.options` (`theme`, `powerline`); columns from `process.stdout.columns` or `COLUMNS`, default 120; git from `git -C <cwd> status --porcelain=v2 --branch` (500 ms timeout, failure → no git).

- [ ] `verify.sh` gains: `node statusline/ccshine-statusline.mjs < statusline/fixtures/sample.json` exits 0 and prints `Haiku 4.5`; and with `{}` as input it still exits 0. Watch it fail.
- [ ] Implement; `./verify.sh`; commit `feat: status line script`.

### Task 5: `/ccshine-statusline` command

**Files:** modify `hooks/register.tsx` (or a new `hooks/features/statusline.tsx`); test `tests/command.test.ts`.

**Interfaces:** Registers command `ccshine-statusline` in `session.start`; `command.run` returns `{ text }` containing the JSON line `"statusLine": { "type": "command", "command": "node \"<$.plugin.root>/statusline/ccshine-statusline.mjs\"", "padding": 0, "refreshInterval": 10 }` and one sentence on where to paste it.

- [ ] Test `command prints the settings line with the plugin root`; watch it fail; implement; `./verify.sh`; commit `feat: /ccshine-statusline prints the settings line`.

### Task 6: README and handoff

- [ ] README: status line section (what it shows, Node 18+ requirement, run `/ccshine-statusline` and paste), name everywhere, screenshot slot for the status line.
- [ ] `./verify.sh`; commit `docs: status line`.
- [ ] Ask the user before replacing their ccstatusline `statusLine` with ccshine's.
