# Rail plan section

## Problem

The tasks band shares the bottom slot with Claude Code's own task list, which every
`TaskCreate`/`TaskUpdate` re-opens. In a big plan the band gets a handful of rows: the plan
shrinks to its header and the running task, and nothing else of the plan is visible. The Tide
rail, docked beside the chat, sits mostly empty below its turn view.

## Goal

When the rail is docked, it owns the plan: the full plan (tasks, sub-items, agents, shells, ETA)
draws as a section in the rail above its footer, and the band draws no plan, so the dock always has
room. When the rail is not docked, the band works exactly as it does today.

## Behaviour

### Who draws the plan

- **Rail owns it** when `railDocked()` holds: rail option on, fullscreen, the `tidepool-rail` pane
  placed. No column count: a pane the person opened docks at any width (110 columns is only the
  threshold for one opened unasked).
- While the rail owns it, the band draws no plan, task rows or shell section; the dock takes the
  band's rows (`fitBand` with `header: false`). Usage rows keep their own rule.
- Otherwise nothing changes: the band draws the fitted plan, shells and usage as now, and the
  rail draws no plan section.

### Rail layout

Top to bottom: brand, turn title, tool rows, axis, then the plan section after a `╌` rule, then the
footer (rule, cost and tool count, failures, files). The footer has no ctx line: the status line
already shows context.

- Plan and footer sit at the bottom: a growing spacer sits between the tool rows and the plan
  section, so a short turn leaves the gap above the plan.
- The rail splits about 40-45-15: tool rows, plan section, footer. The plan section asks for its
  full height (header, task lines, markers, shell label, shell rows, output lines) and gets at
  most 45% of `scroll.bodyRows`; the footer's failures and files lists stop at 15%. Rows either
  leaves go to the tool rows. Past its cap, task lines window around the running task with
  `N earlier` / `+N more`, as the band does.
- The turn's tool rows trim from the top to `N earlier` so brand, title, rows, axis, the plan
  section and the footer fit `scroll.bodyRows`. Rows opened to show detail are not counted: an
  opened row may still make the pane scroll.
- **Show all** (`planAll`, shared with the band) lifts the 45% cap: every plan line is
  drawn and the turn rows trim to what is left; if the plan alone is taller than the rail, the
  pane scrolls.
- Inline placement (rail above the prompt, not fullscreen) draws no plan section; the band owns
  the plan there.

### Finished plan

`✓ Plan 8/8 done in 24m` shows for 30s after the last task finishes (in the rail when it owns the
plan, else in the band), then folds away until a new plan starts (the existing `AGENT_LINGER_MS` rule).

### Live timers

The rail redraws while a plan task is in progress, an agent row is live or lingering, or a shell
row is shown, in addition to the running turn and background jobs it already follows.

## Structure

- **`hooks/planview.tsx` (new).** The plan's drawing, moved out of `features/tasks.tsx`:
  `planLines` (one line per task, sub-item, agent, note), the header segments, the line renderer
  and the shell rows renderer. Pure: it takes plain data (`tasks`, agent rows, shell rows, output
  lines, shell history, plan history, `now`, `all`, row budget, palette, the resolved `Box`,
  `Text`, `Button`) and an `onToggle` callback, and returns elements plus the rows used. It never
  takes `$`, which the plugin loader does not follow across an import.
- **`features/tasks.tsx`.** Reads state and the output tails, then calls planview. When the rail
  owns the plan, asks `fitBand` for the header only.
- **`features/rail.tsx`.** Reads the same atoms (`tasks`, `agents`, `turns`, `calls`, `live`,
  `jobs`, `shellHistory`, `planAll`, `tick`), reads output tails itself, budgets the turn rows and
  calls planview for the section. Atoms are declared in each file that reads them, as now.
- **Live timers.** The rail reads the band's `tick` atom, which `features/tasks.tsx` bumps every
  second while a task, agent or shell is live or lingering; `features/startup.tsx` is unchanged.

## Testing

- Rail render: the plan section draws between the tool rows and the footer when tasks exist; it stays within 45% of
  `bodyRows`; tool rows trim to `N earlier` to make room; no section in inline placement; show all
  draws every line.
- Band render: with the rail docked, the band is the header line plus the dock, no task rows and
  no shell section; with it closed, today's band tests pass unchanged.
- Finished plan folds away from the rail after 30s.
- `./verify.sh` exits 0.

## Out of scope

- Hiding Claude Code's own task list (no plugin API; `ctrl+t` toggles it, task calls re-open it).
- Clicking a plan row to jump to its turn or agent.
- A separate pane for the plan.
