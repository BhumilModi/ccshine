# terminal-plus v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shareable Claude Code plugin that restyles the terminal (tool rows, spinner, turn line, mode badge) and shows what is normally hidden (task and agent progress, per-turn usage and cache state), with one theme across all of it.

**Architecture:** One function-hooks plugin. Each feature is a pair: a pure module (no `$`, unit-tested with plain inputs) and a hooks section that reads engine events, keeps session state in `$.state` atoms, and draws through `ui.render`. A shared tracker records tool timings and per-turn usage that several features read. Every feature can be switched off in `/config`, and a switched-off feature calls `next(e)` so the engine draws exactly what it drew before.

**Tech Stack:** Claude Code function hooks (TypeScript/TSX, `h` JSX, no npm dependencies, no DOM, no Node APIs), `claude plugin validate`, `claude plugin test`, `tsc`.

**Spec:** the "Spec" section below (agreed in chat on 2026-10-03). The existing plan-eta plugin at `~/.claude/mods/plan-eta/` is the working base for the tasks band.

## Spec

v1 features, all in one plugin named `terminal-plus` (working name; rename before Task 9 if wanted):

1. **Tasks and agents band** above the prompt: plan-eta as it is today (task list, ETA from per-project history, agents nested under the running task, live timers).
2. **Tool-call rows:** each `ToolUse` row becomes one compact line: tool icon, short target (path, command, pattern), `+N −M` for Edit/Write, duration once finished, red mark on error. Unknown and MCP tools are left to the engine.
3. **Spinner:** the spinner word is replaced by what is happening (`Running tests`, `Reading orchestrator.ts`), keeping the engine's own elapsed time and token count.
4. **Turn receipt:** the `Baked for 1m 3s` line becomes `1m 03s  ▇▇▇░▒▒▒░  48.2k tokens · cache 91%` with a legend of the slowest steps.
5. **Mode badge:** the permission mode in the prompt hint (`bypass permissions on`, `plan mode on`, `accept edits on`) becomes a coloured badge (red, amber, blue), the rest of the hint left as is.
6. **Usage line** in the band: last turn tokens, cache hit rate, a warning when a turn paid full price because the cache was cold, split by agent when agents ran, and time until the cache goes cold.
7. **Attention alerts:** sound plus toast when a main turn longer than a threshold finishes, and when Claude Code raises a Notification (needs permission or input).
8. **Themes:** palettes `claude` (default), `nord`, `dracula`, `mono`; a `powerline` switch (default off) for the arrow and cap glyphs that need a Nerd Font.

Out of v1: context X-ray, session changes pane, hook activity, message gutters, question cards.

## Global Constraints

- Minimum Claude Code: `2.1.288` (the hooks API is early access; state this in README and `plugin.json` description).
- No npm dependencies. Plugin code may not use `import()`, DOM, or Node APIs.
- A function receiving `$` must be declared in the same file that passes it (validator rule), unless Task 0 shows cross-file registration is accepted.
- Colours come only from the active palette (`Palette` in `hooks/theme.ts`); no hex literals elsewhere.
- Every `ui.render` hook returns `next(e)` when its feature is off, when the surface is not one it handles, or when props are not what it expects.
- Render hooks never call `$.store`; they read `$.state` atoms or module caches only (they run for every row).
- Powerline glyphs only when the `powerline` option is on and `e.surface === 'terminal'`.
- Never `git push`. No Co-Authored-By or AI attribution in commit messages.
- Done means `./verify.sh` exits 0.

## Review Focus

1. **Resumed or hot-reloaded session:** tool rows and turn lines drawn for calls the tracker never saw (`--resume`, reload) must render without duration or usage, not crash or show `NaN`. Test owner: Task 3 and Task 5.
2. **Narrow terminal (40 columns):** every row truncates with `truncate-end`; the band header fits by dropping the time-left segment before wrapping. Test owner: Task 1.
3. **Unknown and MCP tools** (`mcp__linear__save_issue`, a plugin's tool): left to the engine (`next(e)`), and the spinner falls back to the engine word. Test owner: Task 3 and Task 4.
4. **Features switched off:** each off feature produces the engine's own drawing, verified by asserting the hook returned what `next` returned. Test owner: each feature task, one test each.
5. **Desktop and VS Code surfaces:** terminal-only components (`TurnDuration`) untouched elsewhere; band and tool rows render on `desktop` without powerline glyphs. Test owner: Task 1 and Task 3.

---

## File Structure

```
~/.claude/mods/terminal-plus/
  .claude-plugin/plugin.json        manifest, userConfig, types
  .claude-plugin/marketplace.json   one-plugin catalogue for /plugin marketplace add (Task 9)
  hooks/hooks.json                  { "modules": ["./register.tsx"] }
  hooks/register.tsx                all hooks, grouped by feature sections (or split per Task 0)
  hooks/theme.ts                    Palette, palettes, powerline(), bar()
  hooks/track.ts                    pure: tool timing + turn records
  hooks/tasks.ts                    pure: from plan-eta plan.ts (estimate, window, agents)
  hooks/tools.ts                    pure: describeCall(), editStats()
  hooks/activity.ts                 pure: spinner text from the live call
  hooks/receipt.ts                  pure: turn receipt segments
  hooks/mode.ts                     pure: parseMode()
  hooks/usage.ts                    pure: cache stats, cold detection, countdown
  sounds/done.wav, sounds/attention.wav
  types/index.d.ts                  PluginState contract
  tests/*.test.ts(x)                one file per feature
  verify.sh                         validate + test + tsc
  README.md, LICENSE (MIT)
```

---

### Task 0: Spike the unknowns in a live session

Nothing is built for users here. It answers the questions the later tasks depend on and records the answers in `docs/spike.md`.

**Files:**
- Create: `~/.claude/dev-mods/<session>/tp-spike/` (throwaway plugin, hot-reloaded)
- Create: `docs/spike.md`

- [ ] **Step 1:** Throwaway plugin with: `on` passed to a function exported from a second file that registers a `tool.call` hook; a `ToolUse` hook drawing `<Text>SPIKE {props.tool}</Text>`; a `PromptHint` hook drawing its own tree; a `TurnDuration` hook logging `props.durationMs`; a `turn.complete` hook logging `e.durationMs`; a `userConfig` with one boolean, one string with `options`.
- [ ] **Step 2:** `claude plugin validate` it. Record whether cross-file registration and the `userConfig` shape are accepted.
- [ ] **Step 3:** Enable hot reload, run a turn with Read, Edit and Bash. Record: does the ToolUse tree replace the result block too (Edit diff gone?); does ctrl+o still show it; do the PromptHint pills (`← for agents`) survive a full tree, or only with `tail`; does `TurnDuration.durationMs` equal `turn.complete` `durationMs`.
- [ ] **Step 4:** Write `docs/spike.md`: one line per question, answer, and the decision for the owning task. Delete the throwaway plugin.

Decisions the later tasks take from it: file layout (split vs one register file), whether Task 3 keeps the engine's result under its own header row, whether Task 6 uses a tree or `tail`, how Task 5 matches a line to its turn.

### Task 1: Scaffold the plugin, theme system and options; move the tasks band in

**Files:**
- Create: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/theme.ts`, `hooks/tasks.ts`, `types/index.d.ts`, `tests/theme.test.ts`, `tests/tasks.test.ts`, `tests/band.test.tsx`, `verify.sh`
- Source: copy from `~/.claude/mods/plan-eta/` (`hooks/plan.ts` becomes `hooks/tasks.ts`; tests carried over with renamed plugin and state keys)

**Interfaces:**
- Produces: `type Palette = { accent, onAccent, seg, segAlt, ink, soft, mid, faint, track, warn, crit, info: string }`; `palettes: Record<'claude'|'nord'|'dracula'|'mono', Palette>`; `powerline(segments: Segment[], glyphs: boolean): Run[]`; `bar(fraction: number, width?: number)`; `Options = { theme: string, powerline: boolean, tasks: boolean, tools: boolean, spinner: boolean, receipt: boolean, mode: boolean, usage: boolean, alerts: boolean, alertAfterSeconds: number, cacheTtl: string }`; module-level `opts: Options` set in `register`.
- State atoms under plugin `terminal-plus`: `tasks`, `agents`, `tick` (types unchanged from plan-eta).

- [ ] **Step 1:** `plugin.json`: name `terminal-plus`, version `0.1.0`, author, license `MIT`, `types`, and `userConfig` with the fields above (`theme` string with `options: ["claude","nord","dracula","mono"]` default `claude`; `powerline` boolean default `false`; each feature boolean default `true`; `alertAfterSeconds` number default `30`; `cacheTtl` string `options: ["1h","5m"]` default `1h`). Use the field shape Task 0 confirmed.
- [ ] **Step 2:** Port plan-eta. All `plugin: 'plan-eta'` keys become `terminal-plus`; colours read from `palettes[opts.theme]`; powerline glyphs gated on `opts.powerline`.
- [ ] **Step 3:** Tests: carry over all 14 plan-eta tests; add `palettes all define every Palette key`, `mono palette uses no accent hue` (accent equals ink), `band uses no powerline glyphs when the option is off` (test with `{ options: { powerline: false } }`), `band header drops the time-left segment at 40 columns` (`bodyColumns: 40`; text has no `left`), `tasks off: band hook returns next(e)`.
- [ ] **Step 4:** `verify.sh`: `claude plugin validate . && claude plugin test . && npx -y -p typescript tsc -p .` (tsconfig extends `.claude-plugin/types/tsconfig.json`, which the engine writes once the plugin has loaded). Run it; expect exit 0.
- [ ] **Step 5:** `git init`, commit `feat: scaffold terminal-plus with themes and tasks band`.

### Task 2: Shared tracker for tool timings and turn usage

**Files:**
- Create: `hooks/track.ts`, `tests/track.test.ts`
- Modify: `hooks/register.tsx`, `types/index.d.ts`

**Interfaces:**
- Produces: state atom `calls: Record<string, CallTiming>` with `CallTiming = { tool: string, startedAt: number, endedAt?: number, agentId?: string }` (last 500 kept); state atom `turns: TurnRecord[]` with `TurnRecord = { turnId: string, agentId?: string, startedAt: number, durationMs: number, usage?: Usage, steps: Step[] }`, `Usage = { input: number, output: number, cacheRead: number, cacheWrite: number }`, `Step = { tool: string, ms: number }` (last 200 kept); pure `addCall`, `endCall`, `closeTurn(calls, turn): TurnRecord`, `totalTokens(u: Usage): number`; module map `running: Map<string, { tool: string, input: unknown }>` (tool_use_id to live call, removed on end) exported for Task 4.
- Hooks: a generic `tool.call` hook (no matcher) records start and end around `next(e)`; `turn.complete` closes the turn for `e.agentId` from the calls that ran in it. `turn.start` is not usable (it has no `agentId`); a turn's start is its first call's start, or `now - durationMs`.

- [ ] **Step 1:** Tests: `running map holds a call only while it runs`; `endCall sets endedAt only for the given id`; `closeTurn sums step time per tool in call order`; `closeTurn on a turn with no calls has empty steps`; `trim keeps the newest 500 calls`; integration `a Bash call through $.tool.call leaves a CallTiming with both times`.
- [ ] **Step 2:** Implement; run `./verify.sh`; commit `feat: track tool timings and turn usage`.

### Task 3: Tool-call rows

**Files:**
- Create: `hooks/tools.ts`, `tests/tools.test.ts`, `tests/tool-rows.test.tsx`
- Modify: `hooks/register.tsx`

**Interfaces:**
- Consumes: `calls` atom (Task 2), `Palette` (Task 1).
- Produces: `describeCall(tool: string, input: unknown): { icon: string, target: string } | undefined` (undefined for any tool not in the table); `editStats(tool: string, input: unknown): { added: number, removed: number } | undefined`.

Table (icon, target): `Read` `◇` file path relative to session root; `Edit`/`MultiEdit`/`Write` `◆` path; `Bash` `❯` description, else first 60 chars of command; `Grep` `⌕` pattern plus path; `Glob` `⌕` pattern; `WebFetch`/`WebSearch` `↗` host or query; `Agent` `◈` description; `TaskCreate`/`TaskUpdate`/`TodoWrite` `☐` subject or status.

- [ ] **Step 1:** Tests for `describeCall`: one per table row with a realistic input; `mcp__linear__save_issue → undefined`; `Bash with no description truncates command to 60 chars`; `path outside session root stays absolute`. `editStats`: `Edit counts lines of old_string as removed and new_string as added`; `Write counts content lines as added, 0 removed`; `Read → undefined`.
- [ ] **Step 2:** Row hook `ui.render { component: 'ToolUse' }`: icon in `accent` (`crit` when `isErrored`, `faint` when `isInterrupted`), target in `ink` truncate-end, stats as `+N` in `info` and `−M` in `crit`, duration from `calls[tool_use_id]` in `faint` once `endedAt` is set, `…` while `isRunning`. Result handling per Task 0 decision (keep the engine's result under the row if a tree replaces it).
- [ ] **Step 3:** Render tests on terminal and desktop: `Edit row shows icon, path, +3 −1 and 2s`; `row for a call the tracker never saw renders without duration`; `errored Bash row uses crit colour`; `mcp tool row equals next(e)`; `tools off returns next(e)`.
- [ ] **Step 4:** `./verify.sh`; commit `feat: compact tool-call rows`.

### Task 4: Spinner activity

**Files:**
- Create: `hooks/activity.ts`, `tests/activity.test.ts`
- Modify: `hooks/register.tsx`

**Interfaces:**
- Consumes: `calls` atom, `describeCall` (Task 3), `tasks` atom.
- Produces: `activity(running: { tool: string, input: unknown }[], task?: PlanTask): string | undefined`. Rules, first match wins: one running call with a table entry → `Running <description>` for Bash with description, `Reading <basename>`, `Editing <basename>`, `Searching <pattern>`, `Fetching <host>`, `Running agent: <description>`; several running → `<n> tools running`; nothing running and a task in progress → the task's `activeForm` or subject; else `undefined`.
- Hook: `ui.render { component: 'Spinner' }` rewrites `message` only (`next({ ...e, props: { ...e.props, message } })`) so the engine keeps elapsed time and tokens. `undefined` → `next(e)` unchanged. Needs the running calls' inputs: Task 2's tool.call hook also keeps `running: Record<string, { tool, input }>` in a module map.

- [ ] **Step 1:** Tests: one per rule above; `mcp tool running → undefined`; `basename of a deep path`.
- [ ] **Step 2:** Implement; spinner render test `spinner message reads Editing queue.ts while an Edit runs`; `spinner off returns next(e)`.
- [ ] **Step 3:** `./verify.sh`; commit `feat: spinner shows the current activity`.

### Task 5: Turn receipt

**Files:**
- Create: `hooks/receipt.ts`, `tests/receipt.test.ts`
- Modify: `hooks/register.tsx`

**Interfaces:**
- Consumes: `turns` atom (Task 2), `bar`/`Palette` (Task 1), `fmtClock`, `fmtTokens` (from `tasks.ts`).
- Produces: `timeline(steps: Step[], durationMs: number, width: number): { char: string, tool: string }[]` (thinking time = duration minus tool time, drawn as `▇`; each tool a distinct shade `▒░▓` cycling; width cells total); `legend(steps, durationMs): string` (top 3 by time: `thinking 18s · Bash 31s · Read ×6 4s`); `cacheRate(u: Usage): number` = `cacheRead / (input + cacheRead + cacheWrite)`.
- Hook: `ui.render { component: 'TurnDuration' }`, terminal only. Find the main-loop `TurnRecord` per Task 0's matching decision (default: same `durationMs`, newest first). Draw `durationMs` as `1m 03s`, the 24-cell timeline, `48.2k tokens · cache 91%`, then the legend in `faint` on the next line. No record found → engine's line (`next(e)`).

- [ ] **Step 1:** Tests: `timeline cells sum to width`; `thinking fills the gap not covered by tools`; `turn with no steps is all thinking`; `legend orders by time and groups Read ×6`; `cacheRate 0 when all fields 0` (no NaN).
- [ ] **Step 2:** Render tests: `receipt shows duration, tokens and cache rate`; `TurnDuration with no matching record returns next(e)`; `receipt off returns next(e)`.
- [ ] **Step 3:** `./verify.sh`; commit `feat: turn receipt with timeline and usage`.

### Task 6: Mode badge

**Files:**
- Create: `hooks/mode.ts`, `tests/mode.test.ts`
- Modify: `hooks/register.tsx`

**Interfaces:**
- Produces: `parseMode(hint: string): { mode: 'bypass' | 'plan' | 'acceptEdits' | 'auto', label: string, rest: string } | undefined`, matching the engine's phrases `bypass permissions on`, `plan mode on`, `accept edits on`, `auto mode on` and the `▸▸`/`⏸` glyphs before them.
- Hook: `ui.render { component: 'PromptHint' }`. With a mode: badge segment (`crit` bg for bypass, `warn` plan, `info` acceptEdits, `seg` auto; `onAccent` text, bold) then `rest` in `faint`, using the tree or `tail` approach Task 0 chose. No mode → `next(e)`.

- [ ] **Step 1:** Tests: one per mode phrase taken from the live hint strings recorded in Task 0; `hint without a mode → undefined`; `rest keeps (shift+tab to cycle) · ← for agents`.
- [ ] **Step 2:** Render tests: `bypass hint draws a crit badge`; `plain hint returns next(e)`; `mode off returns next(e)`.
- [ ] **Step 3:** `./verify.sh`; commit `feat: permission mode badge`.

### Task 7: Usage line

**Files:**
- Create: `hooks/usage.ts`, `tests/usage.test.ts`
- Modify: `hooks/register.tsx` (band hook draws the usage line under the tasks block, or alone when there is no plan)

**Interfaces:**
- Consumes: `turns` atom (Task 2), `cacheRate` (Task 5), `opts.cacheTtl`.
- Produces: `lastTurn(turns): TurnRecord | undefined` (main loop); `wasCold(turn: TurnRecord, previous?: TurnRecord): boolean` = previous exists and `cacheRead < 0.2 * (cacheRead + cacheWrite)` and `cacheWrite > 10_000`; `bySource(turns, agents: PlanAgent[], sinceMs): { source: string, tokens: number }[]` (main plus each agent type, looked up from the `agents` atom by `agentId`; last 30 min); `cacheLeftMs(lastTurnEnd: number, now: number, ttl: '1h' | '5m'): number`.
- Line: `Usage  48.2k last turn  ━━━━━━━━╸─── cache 91%  ·  warm 52m`; second line only when `wasCold`: `⚠ cache was cold · this turn re-sent 41.0k at full price` in `warn`; third line only when agents ran: `main 31.0k · general-purpose 12.4k · Explore 4.8k` in `faint`. Countdown turns `warn` under 5 minutes, shows `cold` at 0. Redraws through the existing `tick` (start the ticker while the countdown is under 10 minutes).

- [ ] **Step 1:** Tests: `wasCold false on the first turn`; `wasCold true for 2k read / 41k write after a turn`; `bySource groups agents by type`; `cacheLeftMs clamps at 0`; `5m ttl counts from the last turn end`.
- [ ] **Step 2:** Render tests: `usage line shows last turn tokens and cache rate`; `cold warning appears only after a cold turn`; `usage off and tasks off returns next(e)`.
- [ ] **Step 3:** `./verify.sh`; commit `feat: usage line with cache state`.

### Task 8: Attention alerts

**Files:**
- Create: `sounds/done.wav`, `sounds/attention.wav` (short, under 40 KB each; generate as a 0.15 s sine chime with a one-off script in the scratchpad, not shipped), `tests/alerts.test.ts`
- Modify: `hooks/register.tsx`

**Interfaces:**
- Hooks: `turn.complete` with no `agentId` and `e.durationMs >= opts.alertAfterSeconds * 1000` and not `isAborted` → `$.audio.play({ asset: 'sounds/done.wav' })` and `$.ui.toast('Claude finished · <duration>')`. `classic.Notification` → `attention.wav` and `$.ui.toast(e.message)`. Both fire-and-forget (`void`), errors swallowed: a missing player must never fail the turn.

- [ ] **Step 1:** Tests (use the kit's mocks for audio and toast as the typings provide): `long main turn plays done.wav`; `short turn plays nothing`; `subagent turn plays nothing`; `aborted turn plays nothing`; `notification plays attention.wav and toasts its message`; `alerts off plays nothing`.
- [ ] **Step 2:** `./verify.sh`; commit `feat: attention alerts`.

### Task 9: Package for sharing

**Files:**
- Create: `README.md`, `LICENSE`, `.claude-plugin/marketplace.json`, `docs/screenshot.png` (placeholder slot; the user captures it)
- Modify: `~/.claude/settings.json` (point `CLAUDE_CODE_PLUGIN_DIRS` at `~/.claude/mods/terminal-plus` instead of plan-eta, after confirming with the user)

- [ ] **Step 1:** README: one-paragraph pitch, screenshot slot, feature list matching the Spec, install (`/plugin marketplace add <owner>/<repo>` then `/plugin install terminal-plus@<repo>`; local `claude --plugin-dir <path>`), every option with default, minimum Claude Code `2.1.288` and the early-access note, how to turn on powerline (Nerd Font).
- [ ] **Step 2:** `marketplace.json` listing the one plugin with `"source": "./"`; `claude plugin validate .` accepts it.
- [ ] **Step 3:** Run `./verify.sh`; expect exit 0. Commit `docs: readme, licence and marketplace entry`.
- [ ] **Step 4:** Ask the user before switching their settings from plan-eta to terminal-plus; on yes, switch and back up `settings.json` first.
