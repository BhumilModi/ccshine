# ccshine

**A clearer, better-looking Claude Code terminal.**

Claude Code tracks a lot it never shows you: how far along a plan is, what each subagent is doing, what it cost, and whether your prompt cache just expired. ccshine puts that on screen and restyles the rest of the terminal to match: your prompts, Claude's replies, tool calls, command output and the hint line under the prompt.

![ccshine in a Claude Code session: tasks band with a subagent, usage line and status line](docs/screenshot.png)

```
 Plan  2/5 ━━━━╸─────── ~18m left
 ✓ 1. Schema migration  6m
 ▶ 2. Engine tests  4m 12s
     ◆ general-purpose  Running engine and orchestrator tests  2m 47s
 · 3. API routes
 main 101.2k · general-purpose 42.0k
```

## What you get

| Where | Before | With ccshine |
|---|---|---|
| Above the prompt | Nothing | **Tasks band.** Every task with done, running or waiting, how long each took, and the time left. The estimate learns from your past plans in each project, so it shows before the first task finishes. Subagents appear under the task they work on, with a live timer and their tokens once done. |
| Above the prompt | Nothing | **Usage line, only when it matters:** a warning when a turn re-sent your context at full price because the prompt cache had gone cold, and tokens split by agent when subagents ran. Tokens, cache rate and the cache countdown live in the status line. |
| Your prompts and replies | `> fix the queue test`, `●` before each reply | **A styled transcript:** `▌ you` before your prompts and `◆ claude` above each reply, in the theme's accent colour. Replies still go through Claude Code's own markdown renderer, so code blocks and links look the same. Slash command output (`/cost` and others) gets a title line. |
| Each tool call | `Read(src/very/long/path/file.ts)` blocks | **One line each:** `◆ Edit src/queue.ts  +12 −3  0.4s`, with Claude Code's own diff and output kept underneath. Runs of reads and searches fold into `◇ Read ×6  ⌕ Grep ×2`, with `· 1 failed` when any of them failed. |
| Spinner | A random word (`Sauteing…`) | **What is actually running:** `Editing queue.ts`, `Run the test suite`, `Agent: Find entry points`. Claude Code's timer and token count stay. |
| Under the prompt | Dim labels | **Themed labels:** mode labels as small chips, notices with their `/command` in the accent colour, the run-in-background hint as `⇣ ctrl+b to run in background`. The hint line (`? for shortcuts`) stays Claude Code's, so its keys keep working. |
| Between turns | `Baked for 1m 3s` | **Nothing.** The spinner already shows the time while a turn runs. |
| When you are away | Silence | **A chime and a toast** when a turn longer than 30 seconds finishes or fails, and when Claude needs your permission. |
| Status line | Whatever you set up | **A matching status line:** model, effort, folder, git branch and changes, the branch's pull request (`#5 MERGED`), context meter, cache countdown, and your session and weekly limits with reset times. |

```
 Opus 5.5  high  my-app  main +2 ?1 ↑1  #5 OPEN  ctx ━━╸───────── 22% 44k/200k  warm 52m
 Session 40% · resets 1h 26m  Weekly 68% · resets 1d 17h
```

Everything runs locally. ccshine sends nothing anywhere.

## Install

You need **Claude Code 2.1.288 or later**.

**1. Add the plugin.** Inside Claude Code:

```
/plugin marketplace add BhumilModi/ccshine
/plugin install ccshine@ccshine
```

Claude Code may say the options are not set yet; every option has a default, so you can skip `/plugin configure`. Start a new session. The transcript style, tool rows and spinner work right away. The tasks band appears the first time Claude works through a task list.

**2. Turn on the status line (optional).** Claude Code only runs a status line that `settings.json` points to, and plugins cannot edit that file. So, inside Claude Code, run:

```
/ccshine-statusline
```

It prints a `"statusLine"` block with the path to your install. Paste it into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json` if you use a custom config folder), replacing any existing `"statusLine"`, and start a new session. The status line needs **Node 18 or later** on your `PATH`. It reads the ccshine theme from your user settings, so set the theme there rather than in a project's settings.

The pull request badge needs the [GitHub CLI](https://cli.github.com/) (`gh`), logged in. ccshine looks the PR up in the background at most once a minute per branch and keeps the answer in `~/.cache/ccshine/pr.json`, so the status line never waits on the network. A new PR shows up within about a minute. Without `gh`, or outside a GitHub repo, the badge just doesn't appear.

When ccshine updates, its install folder changes. If your status line still points at the old one, ccshine shows a reminder at startup: run `/ccshine-statusline` again and paste the new block.

**From a local copy** (for trying changes):

```
git clone https://github.com/BhumilModi/ccshine
claude --plugin-dir ./ccshine
```

## Settings

Open `/config` and find the ccshine rows. Every switched-off feature leaves Claude Code's own display exactly as it was.

| Setting | Default | What it does |
|---|---|---|
| Theme | `claude` | Colours for everything ccshine draws, including the status line: `claude`, `nord`, `dracula`, `mono` |
| Powerline glyphs | off | Arrow and rounded-cap separators in headers and the status line. Needs a [Nerd Font](https://www.nerdfonts.com/) in your terminal, otherwise you see empty boxes |
| Tasks band | on | Tasks, time left and agents above the prompt |
| Tool rows | on | One-line tool calls |
| Spinner activity | on | Spinner says what is running |
| Transcript style | on | `▌ you` and `◆ claude` markers, titled command output |
| Prompt chrome | on | Mode chips, notices and the background hint; hides the `Baked for` line between turns |
| Usage line | on | Cold-cache warnings and the token split by agent above the prompt |
| Attention alerts | on | Chime and toast |
| Alert after (seconds) | `30` | Only alert for turns at least this long |

## Good to know

- **Tasks band empty?** It only shows while Claude has a task list. Ask for a plan, or anything with several steps.
- **Token counts look large.** A turn's tokens add up every request in that turn, and each request re-reads the cached context. That is how Claude Code bills usage, which is why the cache state matters.
- **No chime?** Sounds play through `afplay` on macOS. Linux and Windows get the toast only.
- **Dark terminals.** The palettes are designed for dark backgrounds. If Claude Code's own theme is a light one, ccshine says so once at startup; it never changes the setting.
- **What stays Claude Code's.** The input box, the logo, permission dialogs and the `bypass permissions on` line are drawn where plugins cannot restyle them. Tool output under each tool row is Claude Code's own too.
- **Early-access API.** ccshine uses Claude Code's function-hooks plugin API, which may change between releases. If something stops drawing after a Claude Code update, switch that feature off in `/config` and open an issue.

## Uninstall

```
/plugin uninstall ccshine@ccshine
```

Then remove the `"statusLine"` block from `~/.claude/settings.json` if you added it.

## Development

```
git clone https://github.com/BhumilModi/ccshine && cd ccshine
CLAUDE_CODE_TYPES=/path/to/claude-code.d.ts ./verify.sh
```

`verify.sh` validates the manifest, runs the tests with `claude plugin test`, type-checks with `tsc`, and smoke-runs the status line script.

Claude Code writes its plugin API types into `.claude-plugin/types/` the first time it loads the plugin (run `claude --plugin-dir .` once). Until then, editors show type errors and `verify.sh` needs `CLAUDE_CODE_TYPES` pointing at a `claude-code.d.ts`: Claude Code's built-in plugin-authoring skill prints that file's path when it loads. `docs/spike.md` records what was checked live against Claude Code 2.1.288.

Layout: `hooks/features/*.tsx` are the hooks, one file per feature; `hooks/*.ts` are the pure helpers they use; `statusline/` is the status line script; `tests/` has one file per feature.

## Licence

MIT
