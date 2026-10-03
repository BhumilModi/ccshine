# Spike results (Task 0), Claude Code 2.1.288, run live 2026-10-03

| Question | Answer | Decision |
|---|---|---|
| Can `on` be passed to a function in another file? | Yes. Validate accepts it and the hook ran live (counted 7 calls). | Split hooks per feature file (`hooks/features/*.tsx`), `register.tsx` wires them. |
| Does a `ToolUse` tree replace the result block? | No. It replaces only the header row; the engine still draws `⎿ Wrote 3 lines`, the Edit diff, etc. under it. | Task 3 draws only the header row; results stay the engine's. |
| Can `ToolGroup` (`Read 1 file, ran 1 shell command`) be redrawn? | Yes, a tree replaces the whole line; `props.calls` lists the tools. | Task 3 also restyles the group line. |
| Does a `Spinner` `message` rewrite keep elapsed time and tokens? | Yes: `· SPIKE-SPIN… (6s · ↓ 273 tokens)`. | Task 4 as planned. |
| Does `TurnDuration.durationMs` equal `turn.complete` `durationMs`? | Yes, exactly (9911 = 9911, 9668 = 9668). | Task 5 matches on equal `durationMs`. |
| Is the permission mode part of `PromptHint`? | No. The engine draws `⏵⏵ bypass permissions on ·` itself; `hint` is only `(shift+tab to cycle) · ← for agents`. `SessionMode` is a different footer. | Task 6 cannot restyle the mode label. Dropped from v1. |
| `userConfig` shape | `{ type: "boolean" \| "string" \| "number", title, description, default, options? }` validates and loads; options arrive in `register(on, options)`. | Task 1 uses this shape. |
| `$.ui.status` | Drawn under the prompt with a `⚠` prefix. | Do not use it for normal output. |
