# Rail Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the docked Tide rail into collapsible timeline, plan and files sections sharing the rail in thirds, with a diff pane for the files a turn changed.

**Architecture:** A pure `sections()` allocator in `hooks/rail.ts` hands out body rows; `features/rail.tsx` draws three header Buttons and the bodies it was given. The tracker keeps each `Edit`/`Write` call's patch on its `CallTiming`; a new `hooks/files.ts` turns a turn's calls into file rows and diff text, and a second Pane (`tidepool-diff`) draws the diff with `Code format="diff"`.

**Tech Stack:** Claude Code 2.1.293 mod API (`claude-code`, `claude-code/testing`), TSX against global `h`, `./verify.sh` (validate, `claude plugin test`, tsc, status line, themes).

**Spec:** `docs/superpowers/specs/2026-10-08-rail-sections-design.md`

## Global Constraints

- Sections in order: timeline, plan, files. Header Button keys: `sec:timeline`, `sec:plan`, `sec:files`; `▾` open, `▸` collapsed.
- Folded copy: `▸ timeline · no turns yet`, `▸ plan · no tasks`, `▸ files · none this turn`.
- Split: thirds of `bodyRows − 1 (brand) − 3 (headers)`, remainder to plan; unused rows re-shared plan, timeline, files.
- Collapsed set stored under store key `rail-collapsed` (string list), state key `railCollapsed`.
- Files: main-loop, non-failed `Edit` and `Write` calls of the rail's turn only. Header `▾ files · N changed · +A −R`. Row Button key `file:<absolute path>`; path shown relative to the session root, cut from the left (`…/hooks/rail.ts`).
- Diff pane id `tidepool-diff`, title = relative path; per edit a line `edit i of n · m:ss into the turn`, then `Code format="diff"`. Patch kept per call: 400 lines, `patchCut` = lines dropped. Empty patch: `no diff recorded`. State key `diffFile: { turnId, path } | null`.
- The inline rail and the tasks band do not change. The band keeps its 12-row cap (`MAX_TASK_ROWS`); the rail section does not use it.
- Never `git push`. No co-author or AI attribution in commits.

## Review Focus

- A file edited in several turns: the files section and the diff pane show only the rail's turn; scrolling the rail to another turn does not change an open diff pane (it holds its `turnId`). Test in Task 5.
- An `Edit` that failed (`old_string` not found) or ran in a subagent is not listed. Test in Task 3.
- A long path in a 46-column rail keeps `+a −r` whole and cuts the path from the left. Test in Task 4.
- A rail too short for three headers keeps the headers and draws no bodies, never more than `bodyRows`. Test in Task 3.
- A `Write` that created a file (empty `structuredPatch`, `type: 'create'`) still shows one all-added hunk. Test in Task 2.

---

### Task 1: Probe pane placement, drop the plan-first change

**Files:**
- Revert: `README.md`, `hooks/features/rail.tsx`, `hooks/planview.tsx`, `hooks/rail.ts`, `tests/rail-render.test.tsx`, `tests/rail.test.ts` (uncommitted plan-first change)
- Create (throwaway, not in the repo): `~/.claude/dev-mods/<session>/pane-probe/` (plugin.json, hooks/hooks.json, hooks/register.tsx)
- Modify: the spec's "Open item" section with the result

**Interfaces:**
- Produces: a decision recorded in the spec: `side-by-side` (Task 5 opens a second Pane) or `replace-body` (Task 5 draws the diff inside the rail Pane with a `◂ back` header line, key `diff:back`).

- [ ] **Step 1:** `git checkout -- README.md hooks/features/rail.tsx hooks/planview.tsx hooks/rail.ts tests/rail-render.test.tsx tests/rail.test.ts`; `./verify.sh` prints `verify: ok`.
- [ ] **Step 2:** Write the probe mod: a `/probe-b` command whose `command.run` hook calls `$.ui.open({ id: 'probe-b', title: 'probe b' })` (a typed command is the person's act, as a press is) and draws `probe b` in that Pane; a `/probe-panes` command returns `JSON.stringify(await $.ui.panes())`.
- [ ] **Step 3:** In a fresh Claude Code session in an Orca terminal (`orca terminal create --worktree id:0da48f56-fe1b-41da-a0c6-eecf912331e7::/Users/bhumilmodi/TheAgentic/videoreach --command "claude --model claude-haiku-4-5 --plugin-dir <probe> --dangerously-skip-permissions"`), wait for the Tide rail to dock, send `/probe-b`, then `/probe-panes`, then `orca terminal read`.
- [ ] **Step 4:** Side-by-side when both panes report `isPlaced: true` with distinct placement and the screen shows two columns beside the chat; else `replace-body`. Write the result and the evidence line into the spec's "Open item"; delete the probe folder; close the terminal.
- [ ] **Step 5:** `git add docs/superpowers/specs/2026-10-08-rail-sections-design.md && git commit -m "docs: rail sections spec settles where the diff pane sits"`

### Task 2: Tracker keeps each edit's patch

**Files:**
- Create: `hooks/files.ts`
- Modify: `types/index.d.ts` (CallTiming), `hooks/features/track.tsx` (where `detail` is set after `next(e)`)
- Test: `tests/files.test.ts`

**Interfaces:**
- Produces: `export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }` in `types/index.d.ts`; `CallTiming` gains `file?: string` (absolute path, Edit/Write only), `patch?: Hunk[]`, `patchCut?: number`.
- Produces: `cutPatch(hunks: Hunk[], max?: number): { patch: Hunk[]; cut: number }` (default 400 lines, cuts inside the hunk that crosses the limit and adjusts nothing else) and `editPatch(tool: string, input: Record<string, unknown>, result: unknown): Hunk[]` in `hooks/files.ts`.

- [ ] **Step 1: Write the failing tests** in `tests/files.test.ts`:
  - `cutPatch keeps 400 lines and counts the rest`: three hunks of 150 lines → kept hunks hold 400 lines total, `cut` is 50.
  - `editPatch reads an Edit result's structuredPatch`: result `{ structuredPatch: [h] }` → `[h]`.
  - `a Write that created a file is one all-added hunk`: input `{ content: 'a\nb\n' }`, result `{ type: 'create', structuredPatch: [] }` → `[{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] }]`.
  - `tracker keeps the patch on the call` (dispatch test, pattern of `tests/plan-tree.test.tsx` last test): `on('tool.call', { tool: 'Edit' })` answers `{ result: { filePath: '/repo/a.ts', structuredPatch: [h] } }`; after `$.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' })`, `written.calls.e1` has `file: '/repo/a.ts'`, `patch: [h]`, no `patchCut`.
- [ ] **Step 2:** `claude plugin test .` → the four fail (`editPatch` not exported).
- [ ] **Step 3:** Implement `cutPatch`, `editPatch` in `hooks/files.ts`; in `track.tsx`, for main-loop `Edit`/`Write` that did not fail, merge `file` (from `input.file_path`), `patch` and `patchCut` (only when > 0) into the call with the same `update($, calls, …)` that `endCall` uses.
- [ ] **Step 4:** `./verify.sh` → `verify: ok`.
- [ ] **Step 5:** Commit `feat: tracker keeps each edit's patch for the files section`.

### Task 3: Pure layout — sections() and fileRows()

**Files:**
- Modify: `hooks/rail.ts` (add `sections`, `timelineAsk`; remove `sectionCap`, `PLAN_SHARE` once Task 4 stops using them — here, keep both), `hooks/files.ts`
- Test: `tests/rail.test.ts`, `tests/files.test.ts`

**Interfaces:**
- Produces: `export type SectionName = 'timeline' | 'plan' | 'files'`.
- Produces: `sections(a: { bodyRows: number; asks: Record<SectionName, number>; open: Record<SectionName, boolean>; all: boolean }): Record<SectionName, number>` — body rows per section (headers excluded). A section is folded (0) when `!open[s]` or `asks[s] === 0`. With `all`, plan gets its whole ask and the others share as if plan took a third.
- Produces: `export type FileRow = { path: string; rel: string; added: number; removed: number; calls: string[] }` and `fileRows(turnCalls: [string, CallTiming][], root: string): FileRow[]` — order first touched, `calls` in call order.
- Produces: `relPath(path: string, root: string, width: number): string` — relative to root, cut from the left with `…/` to `width`.

- [ ] **Step 1: Write the failing tests:**
  - `sections splits 40 rows in thirds, remainder to plan`: bodyRows 40, asks all 99, all open → `{ timeline: 12, plan: 12, files: 12 }`; bodyRows 41 → plan 13.
  - `a small ask gives its rows away, plan first`: asks `{ timeline: 3, plan: 99, files: 2 }`, bodyRows 40 → `{ timeline: 3, plan: 31, files: 2 }`.
  - `folded and collapsed sections give their rows away`: files ask 0 → `{ timeline: 18, plan: 18, files: 0 }`; plan closed → timeline and files 18 each.
  - `show all gives the plan its whole tree`: plan ask 60, all → plan 60, timeline 12, files 12.
  - `a rail too short for three headers draws no bodies`: bodyRows 4 → all 0; for bodyRows 4..60 and mixed asks, `1 + 3 + sum ≤ bodyRows` unless `all`.
  - `fileRows groups a turn's edits by file and sums them`: two Edits on `/r/a.ts` (+2 −1, +1 −0) and a Write on `/r/b.ts` → `[{ rel: 'a.ts', added: 3, removed: 1, calls: ['e1','e3'] }, { rel: 'b.ts', … }]`.
  - `fileRows skips failed and subagent edits`: a `failed: true` Edit and one with `agentId` are absent.
  - `relPath cuts from the left`: `relPath('/r/hooks/features/rail.tsx', '/r', 14)` → `'…/rail.tsx'`-style string of length ≤ 14 ending `rail.tsx`.
- [ ] **Step 2:** Run → fail (not exported).
- [ ] **Step 3:** Implement. `sections`: avail = `max(0, bodyRows − 4)`; open-and-asking sections get `floor(avail / n)`, the remainder to plan (else the first open in plan, timeline, files order); each takes `min(ask, share)`; loop handing leftovers in plan, timeline, files order to sections still short of their ask until none left.
- [ ] **Step 4:** `./verify.sh` → `verify: ok`.
- [ ] **Step 5:** Commit `feat: rail section allocator and file rows`.

### Task 4: Rail draws three collapsible sections

**Files:**
- Modify: `hooks/features/rail.tsx` (the docked branch of the `Pane` render, `planSection`), `hooks/features/startup.tsx` (load `rail-collapsed` into state in its `session.start`), `types/index.d.ts` (PluginState: `railCollapsed: string[]`, `diffFile: { turnId: string; path: string } | null`), `hooks/rail.ts` (drop `sectionCap`, `PLAN_SHARE`, `railBudget` once unused), `README.md` (rail paragraph and the picture at the top)
- Test: `tests/rail-render.test.tsx`, `tests/rail.test.ts`

**Interfaces:**
- Consumes: `sections`, `SectionName`, `timelineAsk` (Task 3), `fileRows`, `relPath` (Task 3), `planBody`/`planHeader`/`planLines` (existing).
- Produces: header Buttons `sec:<name>`; file row Buttons `file:<path>` whose `onPress` sets `diffFile` to `{ turnId, path }` and opens the diff (Task 5 supplies `openDiff($, turnId, path)` — here a stub that only sets state).

- [ ] **Step 1: Write the failing render tests** (world/call/pane helpers in `tests/rail-render.test.tsx`):
  - `docked rail draws timeline, plan and files headers in order`: a turn with a Read and an Edit, a 3-task plan → text has `▾ timeline`, then ` Plan `, then `▾ files · 1 changed · +2 −1`, in that order.
  - `pressing a header collapses its section and the others take its rows`: press `sec:timeline` → text has `▸ timeline`, no tool row text, and `$.store.get('rail-collapsed')` is `['timeline']`; press again → open.
  - `an empty files section folds`: a turn with no edits → `▸ files · none this turn`.
  - `a long path keeps its counts whole`: bodyColumns 46, file `/repo/a/very/long/path/to/some/deeply/nested/file.ts` → row ends `+2 −1`, contains `file.ts`, contains `…/`.
  - Update `rail draws the plan under the tool rows, with no cost footer` and `tool rows trim to make room for the plan` to the section headers; remove `rail plan stays within 60%`-style share tests; keep inline-rail tests unchanged.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement: compute asks (timeline: `all.length` rows + axis when bars, or 1 for "no tools"; plan: `planLines` length, plus `DONE_ROWS` while the done card shows; files: `fileRows(...).length`), call `sections`, draw each header then its body cut to its rows (timeline: last rows with `N earlier`; plan: `planBody(room)`; files: first rows with `+N more`). Headers are `Button plain` rows; the timeline header carries today's hover scope `tidepool-turn-<id>`.
- [ ] **Step 4:** `./verify.sh` → `verify: ok`.
- [ ] **Step 5:** Commit `feat: docked rail draws timeline, plan and files sections that collapse`.

### Task 5: Diff pane

**Files:**
- Modify: `hooks/files.ts` (diff text), `hooks/features/rail.tsx` (`openDiff`, a `ui.render` hook for `tidepool-diff` — or the `replace-body` branch per Task 1), `hooks/features/track.tsx` (`syncChat` closes the pane and clears `diffFile` on `/clear`)
- Test: `tests/files.test.ts`, `tests/rail-render.test.tsx`

**Interfaces:**
- Consumes: `CallTiming.patch`/`patchCut`/`file` (Task 2), `fileRows` (Task 3), `diffFile` state (Task 4).
- Produces: `diffEdits(turnCalls: [string, CallTiming][], path: string, turnStart: number): { label: string; source: string; cut: number }[]` — `label` `edit i of n · m:ss into the turn`, `source` the hunks as unified text (`@@ -a,b +c,d @@` then lines), `''` when no patch.
- Produces: `openDiff($: EngineInterface, turnId: string, path: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests:**
  - `diffEdits labels each edit and writes its hunks`: two calls at turn +42s and +65s → labels `edit 1 of 2 · 0:42 into the turn`, `edit 2 of 2 · 1:05 into the turn`; first `source` starts `@@ -40,7 +40,7 @@`.
  - `pressing a file opens the diff pane with its edits`: press `file:/repo/a.ts` → `ui.open` received `{ id: 'tidepool-diff', title: 'a.ts' }`; mounting that pane shows `edit 1 of 1` and a `Code` with `format: 'diff'`.
  - `pressing another file re-targets the open pane`: second press `file:/repo/b.ts` → the pane's text has `b.ts`'s hunk, not `a.ts`'s.
  - `the pane keeps its turn when the rail scrolls`: set `railSel` to another turn → pane still shows the first turn's edit.
  - `an edit with no patch says so, a cut one says how much`: `no diff recorded`; `… 50 more lines`.
  - `/clear closes the diff pane`: after a composer `prompt.submit` with a new `startedAt` → `ui.close` received `tidepool-diff`, `diffFile` null.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement per the spec's Diff pane section (or Task 1's fallback).
- [ ] **Step 4:** `./verify.sh` → `verify: ok`.
- [ ] **Step 5:** Commit `feat: files section opens each file's diff in a pane`.

### Task 6: Live check

**Files:** none changed unless the check finds a defect (fix it test-first in the owning task's files).

- [ ] **Step 1:** Fresh Haiku session in an Orca terminal (as in Task 1 Step 3, without `--plugin-dir`): create a 2-task plan, edit two scratch files in a temp folder of that worktree (`.tidepool-check/`), run a background shell. Read the rail: three headers in order, `▾ files · 2 changed`.
- [ ] **Step 2:** Clicks cannot be sent through `orca terminal send`, so collapse and the diff pane are covered by Task 4 and 5's render tests; ask the person to click a header and a file in their own session and send a screenshot.
- [ ] **Step 3:** Delete `.tidepool-check/`, close the terminal, `git status` clean in videoreach.
- [ ] **Step 4:** Update the memory note on Tidepool layout (the rail is now sections; diff pane placement result).
