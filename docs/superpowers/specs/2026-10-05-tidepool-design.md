# Tidepool: rebrand ccshine and add the Tide rail

Date: 2026-10-05

## Intent

Claude Code tracks a lot it never shows: when each tool ran and for how long, which calls ran in
parallel, what subagents and background shells are doing, what a turn cost and how much context it
used. Today that either hides or clutters the chat with tool rows.

Goal: the chat shows only the conversation (prompts and replies). Everything else moves to a side
rail, drawn as pictures (a per-turn waterfall), for whoever installs the mod.

ccshine becomes **Tidepool**: at low tide, what was under the water shows. The clay crab stays the
mascot. Tagline: "Low tide for Claude Code: see every tool, agent and job beside your chat."

Decisions made with the owner:

- Everything stays in this repo; ccshine is rebranded, not split.
- The waterfall is the main view.
- Tool calls and background tasks live in a side rail, not inline.
- Each turn leaves one dim anchor line in the chat.
- The `activity` dev-mod (`~/.claude/dev-mods/2996f5e4-…/activity`) merges in and is then deleted.

## Phase 1: rebrand ccshine to tidepool

Pure rename, no behaviour change, so the feature diff in phase 2 stays readable.

- `.claude-plugin/plugin.json`: `name` `tidepool`, new `description`, `homepage` and `repository`
  pointing at `github.com/BhumilModi/tidepool`. The owner renames the GitHub repo; GitHub redirects
  the old URL.
- Every `atom({ plugin: 'ccshine', … })` becomes `plugin: 'tidepool'` (dock, track, tools, tasks,
  spinner). `types/index.d.ts` `PluginState` key follows.
- Commands: `/ccshine-statusline` becomes `/tidepool-statusline`, `/ccshine-setup` becomes
  `/tidepool-setup`. `statusline/ccshine-statusline.mjs` becomes `statusline/tidepool-statusline.mjs`.
  `startup.tsx` keeps detecting an old `ccshine-statusline.mjs` path in settings and toasts the
  `/tidepool-statusline` fix.
- The statusline reads plugin config under `tidepool` or `tidepool@…`, falling back to `ccshine`.
- PR cache moves from `~/.cache/ccshine/pr.json` to `~/.cache/tidepool/pr.json`. No migration: it is
  a cache.
- Plan-estimate history (`$.store` key `history-by-project`) is plugin-scoped and lives in
  `~/.claude/plugins/store/ccshine_*.json`. On `session.start`, when tidepool's store has no
  `history-by-project`, read the newest `ccshine_*.json` in that folder and copy the key over.
  A missing or unreadable file means estimates relearn; not an error.
- User-visible strings, README, LICENSE holder unchanged, `verify.sh` paths, tests updated.
  README rewritten around the tagline with the rail as the lead screenshot (phase 2 supplies it).

## Phase 2: the Tide rail

### What the person sees

Chat column, per turn:

```
▌ you  fix the login bug

  ◇ 14 tools · 1 agent · 52s · 1 error  ▸ rail

◆ claude
  Found it, the token check compared expiry with < instead of <=.
```

Rail, docked beside the chat:

```
 turn 4 · 52s
 Read   auth.ts         ╸────────── 0.4s
 Grep   token           ╸────────── 0.2s
 Bash   npm test        ─━━━━━━━╸── 41s  exit 1
 Agent  Explore auth    ──━━━━━━━── 30s  9 tools
 Shell  npm run dev     ─━━━━━━━━━━⇢ running
 Edit   auth.ts         ─────────╺─ 0.1s  +12 −3
                        0s       52s
 ctx ━━━━╸━━╸───────── 38% → 52%   $0.31
 files  auth.ts +12 −3 · session.ts +4 −1
 ✕ npm test failed ×2
```

- **Anchor line**: the first tool row of a main-thread turn draws it; every other `ToolUse`,
  `ToolResult` and `ToolGroup` of that turn draws an empty `Box`. Counts update live. Pressing it
  selects that turn in the rail. Errors show in the theme's critical colour.
- **Rail selection**: the first turn whose anchor line is on screen, from the anchor row's
  `onScreen` reports (the anchor is the one tool row per turn the chat still draws). While a turn runs and the chat is scrolled to the
  bottom, the live turn. Pressing an anchor pins that turn until the next scroll.
- **Bar style**: the status line's context-meter look, nothing new. A heavy `━` line on a thin `─`
  track in the palette's `track` colour, at half-cell precision (`╸` for a half cell at the end, `╺`
  at the start). No block characters, no `▕▏` caps. `hooks/theme.ts` gains
  `span(from, to, width)` next to the existing `bar(fraction, width)`. The summary's context gauge
  uses `bar()`: the part used at turn start in `soft`, the part this turn added in `accent`.
- **Bars**: one row per main-thread call, sorted by start. Bar span = call start to end scaled to the
  turn window (turn start to turn end, or to now while running). Running calls are drawn dim and grow
  each tick. A background shell or agent that outlives the turn ends in `⇢`.
- **Folded runs** (`ToolGroup`): one row, `Read ×6`, bar from first start to last end.
- **Agents**: a row with tool count; pressed, it opens child rows (`└ Grep session`) from calls
  carrying that `agentId`.
- **Expand**: pressing any row opens its detail under it inside the rail: Bash command and the last
  lines of output with exit code, Edit diff stats per file, Read path and line count, error text.
  Pressed again, it closes.
- **Summary block**: duration, tool and agent count, context % at start and end, cost delta, files
  changed with `+/−`, failed calls with a repeat count when the same tool and argument failed more
  than once.
- **Theme**: Tidepool palette from `theme.ts`; no frame colours of its own.

### Placement and fallback

The engine docks a pane beside the transcript only in fullscreen at 110+ columns (`placement:
'dock'`). Otherwise it seats it inline above the prompt.

- Docked: full rail as above, scrolling with the pane's own `scroll`.
- Inline: live turn only, header plus at most 6 call rows plus a `n more` row; finished turns
  close the inline rail so it never sits above an idle prompt.
- Tidepool never forces fullscreen.

### Lifecycle

- `session.start`: close any pane this plugin left open (hot reload), then open the rail.
- `/clear` (new `usage().startedAt`): reset turns, selection and expanded rows.
- `/tidepool-rail`: toggle the rail for this session.
- Setting `rail` (boolean, default true). With `rail` false, tool rows render as ccshine's one-line
  rows did, and the anchor is not drawn. `tools` false still means the engine's own rows.

### Code layout

- `hooks/rail.ts` (new, pure): `turnOf(calls, turns, at)`, `bars(calls, window, width)`,
  `summary(turn, calls, jobs, usage)`, `repeats(calls)`. No engine imports.
- `hooks/features/rail.tsx` (new): pane open and close, `Pane` render, row press handling, selection
  from `onScreen`, the 1s tick (runs only while a call or job is running).
- `hooks/features/tools.tsx`: anchor line, hide rule, old rows behind `rail: false`.
- `hooks/features/track.tsx`: adds per-turn start and context % at start (main-thread turn start taken
  from the dock's turn), background jobs from `backgroundTaskId` and `TaskStop`, task-notification
  parsing (`<task-id>`, `<status>`), and `agent.spawn` jobs with tool counts. Ported from the activity
  dev-mod with its tests.
- `hooks/features/tasks.tsx`: while the rail is docked, the band drops its agent sub-rows; plan tasks
  stay.
- `hooks/options.ts`, `plugin.json` `userConfig`: `rail`.
- `types/index.d.ts`: `Job`, rail state (`selected`, `pinned`, `expanded`, `now`).

### Error handling

- `$.ui.open` refused: no rail; tool rows fall back to the `rail: false` look so nothing is lost.
- A call with no timing (started before a reload): row without a bar.
- A job whose completion notice never arrives: stays `running` until `/clear`; the agent list poll
  ends agent jobs.
- Narrow docked rail (under 40 body columns): bars drop, rows keep name, time and status.

## Testing

- `tests/rail.test.ts`: turn grouping, bar maths at edges (zero-length call, call longer than
  window, background overrun), narrow width, repeat detection, summary figures.
- `tests/rail-render.test.tsx`: anchor line, hidden rows, docked rail, inline fallback, expand and
  collapse.
- Ported activity tests: notification parsing, job lifecycle.
- Existing suites updated for the rename.
- `./verify.sh` exits 0.
- Manual: fullscreen terminal at 120+ columns; rail docks, follows scroll, rows expand, `/clear`
  resets, hot reload leaves no stale pane. Then a normal-mode terminal for the inline fallback.

## Out of scope

- A context-map or cost-over-time chart.
- Rail views for desktop, mobile or VS Code surfaces beyond what the engine draws from the tree.
- Persisting rail history across sessions.
