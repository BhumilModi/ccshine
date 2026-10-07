# Rail sections: timeline, plan, files

## Problem

The docked rail is one column of parts that compete for rows: the turn's tool rows, the plan
section pinned below them, and (until 2026-10-08) a cost footer. Each change of priority (45% plan
cap, then "plan first") moves rows from one part to another, and nothing on the rail says what
changed in the code this turn. The person wants a fixed, predictable split where each part can be
put away, and a place that shows the files a turn changed with their diffs.

## Goal

The docked rail is three sections, **timeline**, **plan** and **files**, each under a one-line
header that collapses or expands it. Open sections split the rail in thirds. The files section
lists the files the rail's turn changed; pressing one opens its diff in a pane of its own.

The rail above the prompt (inline placement) and the tasks band are unchanged.

## Behaviour

### Layout

- Top to bottom: the brand line, then timeline, plan, files. Each section is a header row and, when
  open, a body.
- A header is a Button (keys `sec:timeline`, `sec:plan`, `sec:files`): `▾` while open, `▸` while
  collapsed. Pressing it toggles the section.
- A section is **folded** to its header when the person collapsed it or when it has nothing to show:
  - timeline: never empty while a turn is selected (no turn: `▸ timeline · no turns yet`);
  - plan: no plan and no running shells (`▸ plan · no tasks`);
  - files: the turn changed no file (`▸ files · none this turn`).
- **Row split.** `bodyRows` less the brand line and one header row per section is shared by the open
  sections in thirds, the remainder going to the plan. A section that asks for fewer rows than its
  share (a two-call turn, a one-file turn) takes only what it asks; the rows it leaves are shared
  again among the open sections that want more, plan first, then timeline, then files. A folded
  section's share is shared the same way.
- **Show all** (the plan header's toggle) lifts the plan's share to its whole tree and the rail
  scrolls, as today.
- The collapsed set is kept in the store (`rail-collapsed`, a list of section names) and so
  survives sessions; it is read once per session into state (`railCollapsed`) for drawing.

### Timeline section

- Header: `▾ timeline · turn N · 52s · live  <prompt…>`, taking over today's turn line and its hover
  group with the chat anchor. `· stopped` for an aborted turn, no word for a finished one. The prompt
  text truncates first.
- Body: the tool rows as today (bars, `+a −r`, pressed rows expanding their detail or child calls),
  the `N earlier` marker when not every row fits, and the time axis under the rows.
- Pinning and scroll-following are unchanged; `following scroll` / `pinned` stays on the brand line.

### Plan section

- Header: today's powerline `Plan d/t ━━── ~4m left` header with the `▾ show all` toggle, led by the
  section's `▾`/`▸`. With no tasks but running shells: `▾ plan · no tasks`, then the shells under
  their `shell` label as today.
- Body: the plan tree (tasks, sub-items, the agents and shells under the task they started in, output
  lines, `outside the plan`), windowed around the running task with `N earlier` / `+N more`.
- The done card (crab, `✓ Plan complete`, counts) draws in the body for its 30 seconds; when it does
  not fit the section's rows it is left out, as today.
- The band's 12-row cap does not apply in the rail; the section's rows are the cap.

### Files section

- Rows come from the rail's turn: every main-loop `Edit` and `Write` call of that turn
  that did not fail, grouped by file path in the order first touched.
- Header: `▾ files · 2 changed · +32 −3` (totals over the turn).
- One row per file: the path relative to the session root, truncated from the left to fit
  (`…/hooks/rail.ts`), then `+a −r`. The row is a Button (key `file:<path>`).
- When not every file fits: the first files, then `+N more`.
- Pressing a file opens (or, when open, re-targets) the **diff pane**.

### Diff pane

- A Pane with id `tidepool-diff`, title the file's relative path, opened by `$.ui.open` from the
  press (a person's press seats a pane at any width).
- Body: for each of the turn's edits to that file, in call order, a dim line
  `edit 1 of 3 · 0:42 into the turn`, then the edit's hunks drawn with `Code` under
  `format: 'diff'`. A `Write` that created the file shows as one all-added hunk.
- An edit whose patch was cut (see Data) ends with `… N more lines`; an edit with no patch
  (patch empty or timed out) says `no diff recorded`.
- Pressing another file re-targets the open pane: the title and body change in place.
- The pane closes from its own close icon; a later press opens it again. `/clear` closes it.
- Which file the pane shows is state (`diffFile`: turn id and path).

### Data

- The tracker (features/track.tsx) keeps, on each main-loop `Edit` or `Write` call's
  `CallTiming`, the result's `structuredPatch` as `patch: { oldStart, oldLines, newStart, newLines,
  lines }[]`, cut to 400 lines per call (`patchCut: n` lines dropped).
- `+a −r` per file comes from the existing `added`/`removed` on each call.
- No file is read from disk and no `git` runs: the diff is what the tools reported.

## Diff pane placement (settled 2026-10-08)

A probe mod opened a second Pane from a typed command while the Tide rail was docked (Claude Code
2.1.293, Orca terminal). The dock does not split: it shows one pane at a time under a tab row
(`tidepool   probe b   ✕`), the new pane in front, `placement` `dock`, `isPlaced: true`. So the diff
pane opens as a second tab in the rail's dock: in front while open, the `tidepool` tab one press
back, its `✕` closing it. No `◂ back` line is drawn; the tab row is the way back.

## Out of scope

- Image previews of attached images (a separate spike).
- Merging a turn's edits into one combined diff.
- Files changed by subagents, shells (`sed -i`, codegen) or the person: only the main loop's edit
  tools are listed.
- The inline rail and the tasks band.

## Replaces

The uncommitted "plan first" change (plan takes every row the timeline's last six calls leave) is
dropped; its `timelineRows` idea survives as the timeline section's row ask.

## Testing

- `sections()` (pure, hooks/rail.ts): thirds; remainder to plan; folded and collapsed sections give
  their rows away; a small ask leaves rows to the others in plan, timeline, files order; show all; a
  rail too short for three headers keeps the headers and draws no bodies.
- Tracker: an `Edit` result's `structuredPatch` lands on the call, cut at 400 lines with `patchCut`.
- `fileRows()` (pure): groups a turn's edit calls by path, sums `+a −r`, skips failed and subagent
  calls.
- Render: each header draws `▾`/`▸`; pressing it folds the section and the others take its rows; the
  files section lists the turn's files; pressing a file opens `tidepool-diff` with `edit 1 of N` and a
  diff `Code`; pressing another re-targets it; `/clear` closes it.
- Live: a fresh Haiku session in an Orca terminal edits two files across a plan; read the rail and the
  diff pane from the screen.
