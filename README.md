# Tidepool

**Low tide for Claude Code: see every tool, agent and job beside your chat.**

Claude Code tracks a lot it never shows you: when each tool ran and for how long, which calls ran side by side, what each subagent and background shell is doing, what a turn cost and how much context it used. Tidepool moves all of that out of the chat into the **Tide rail**, a timeline beside the conversation, so the chat holds only what you and Claude said. It also restyles the rest of the terminal to match: your prompts, Claude's replies, the tasks band, the spinner and the status line.

![Tidepool with the Warm Claude theme and Maple Mono NF: the chat on the left, the Tide rail with a turn's timeline on the right, and the status line](docs/screenshot.png)

```
▌ you  fix the login bug                    │ ≈ tidepool  turn 4 · 52s
                                            │ Read  auth.ts         ╸─────────── 0.4s
  ◇ 14 tools · 1 agent · 52s · 1 error ▸ rail│ ✕ Bash npm test     ─━━━━━━━╸─── 41s
                                            │ Agent Explore auth    ──━━━━━━━─── 30s  9 tools ▸
◆ claude                                    │ Bash  npm run dev     ─━━━━━━━━━━━⇢ running · 1m 5s
  Found it: the token check compared expiry │ Edit  auth.ts         ─────────╺── 0.1s  +12 −3
  with < instead of <=.                     │                       0s        52s
                                            │ ctx  ━━━━━━╸───── 38% → 52%  $0.31
                                            │ files auth.ts +12 −3
                                            │ ✕ Bash npm test ×2
```

## What you get

| Where | Before | With Tidepool |
|---|---|---|
| Beside the chat | Tool calls stacked between your prompt and the answer | **The Tide rail.** A timeline for the turn you are reading: one row per tool call with a bar for when it ran, so slow steps and parallel calls show at a glance. Subagents show their tool count and open into their own calls. Background shells keep running past the turn's end (`⇢`) until they finish. Press a row for its command, output or error. Under the timeline: context before and after, what the turn cost, files changed and calls that failed more than once. The rail follows your scroll. |
| In the chat | Every tool call and its output | **One anchor line per turn:** `◇ 14 tools · 1 agent · 52s · 1 error  ▸ rail`. Press it to pin that turn in the rail. |
| Above the prompt | Nothing | **Tasks band.** Every task with done, running or waiting, how long each took, and the time left. The estimate learns from your past plans in each project, so it shows before the first task finishes. Subagents appear under the task they work on, with a live timer and their tokens once done. |
| Above the prompt | Nothing | **Usage line, only when it matters:** a warning when a turn re-sent your context at full price because the prompt cache had gone cold, and tokens split by agent when subagents ran. Tokens, cache rate and the cache countdown live in the status line. |
| Your prompts and replies | `> fix the queue test`, `●` before each reply | **A styled transcript:** `▌ you` before your prompts and `◆ claude` above each reply, in the theme's accent colour. Replies still go through Claude Code's own markdown renderer, so code blocks and links look the same. Slash command output (`/cost` and others) gets a title line. |
| Each tool call, with the rail off | `Read(src/very/long/path/file.ts)` blocks | **One line each:** `◆ Edit src/queue.ts  +12 −3  0.4s`, with Claude Code's own diff and output kept underneath. Runs of reads and searches fold into `◇ Read ×6  ⌕ Grep ×2`, with `· 1 failed` when any of them failed. |
| Spinner | A random word (`Sauteing…`) | **What is actually running:** `Editing queue.ts`, `Run the test suite`, `Agent: Find entry points`. Claude Code's timer and token count stay. |
| Above the prompt | Nothing | **The prompt dock.** A little clay crab lives above the input. Idle, it stands beside `◆ Ask Claude` and the keys that matter. When you send a prompt it hops onto a dinosaur-game course and runs while Claude works: walking while it waits on the API, jogging while it thinks, sprinting while tools run or the reply streams. Cacti and rocks come by, every tool call drops a crate, and it jumps them all. Above the scene: the current step, the time in each phase and the turn's clock; below it, the latest calls ticking to ✓. When the turn finishes, a checkered flag scrolls in, the crab runs through it and does a victory hop, and the header shows the score: `★ 23 jumped · 6 crates · 1m 42s`. Then it hops home. A turn you stop with Esc skips the flag. |
| Under the prompt | Dim labels | **Themed labels:** mode labels as small chips, notices with their `/command` in the accent colour, the run-in-background hint as `⇣ ctrl+b to run in background`. The hint line (`? for shortcuts`) stays Claude Code's, so its keys keep working. |
| Between turns | `Baked for 1m 3s` | **Nothing.** The spinner already shows the time while a turn runs. |
| When you are away | Silence | **A chime and a toast** when a turn longer than 30 seconds finishes or fails, and when Claude needs your permission. |
| Status line | Whatever you set up | **A matching status line:** model, effort, folder, git branch and changes, the branch's pull request (`#5 MERGED`), context meter, cache countdown, and your session and weekly limits with reset times. |

```
 Opus 5.5  high  my-app  main +2 ?1 ↑1  #5 OPEN  ctx ━━╸───────── 22% 44k/200k  warm 52m
 Session 40% · resets 1h 26m  Weekly 68% · resets 1d 17h
```

Everything runs locally. Tidepool sends nothing anywhere.

## Install

You need **Claude Code 2.1.288 or later**.

**1. Add the plugin.** Inside Claude Code:

```
/plugin marketplace add BhumilModi/tidepool
/plugin install tidepool@tidepool
```

Claude Code may say the options are not set yet; every option has a default, so you can skip `/plugin configure`. Start a new session. The transcript style, tool rows and spinner work right away. The tasks band appears the first time Claude works through a task list.

**2. Turn on the status line (optional).** Claude Code only runs a status line that `settings.json` points to, and plugins cannot edit that file. So, inside Claude Code, run:

```
/tidepool-statusline
```

It prints a `"statusLine"` block with the path to your install. Paste it into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json` if you use a custom config folder), replacing any existing `"statusLine"`, and start a new session. The status line needs **Node 18 or later** on your `PATH`. It reads the Tidepool theme from your user settings, so set the theme there rather than in a project's settings.

The pull request badge needs the [GitHub CLI](https://cli.github.com/) (`gh`), logged in. Tidepool looks the PR up in the background at most once a minute per branch and keeps the answer in `~/.cache/tidepool/pr.json`, so the status line never waits on the network. A new PR shows up within about a minute. Without `gh`, or outside a GitHub repo, the badge just doesn't appear.

When Tidepool updates, its install folder changes. If your status line still points at the old one, Tidepool shows a reminder at startup: run `/tidepool-statusline` again and paste the new block.

**Coming from ccshine?** Tidepool is ccshine's new name. Uninstall `ccshine@ccshine`, install `tidepool@tidepool`, and run `/tidepool-statusline` to point the status line at the new install. Your plan-time history carries over on the first start; settings in `/config` start from their defaults.

**From a local copy** (for trying changes):

```
git clone https://github.com/BhumilModi/tidepool
claude --plugin-dir ./tidepool
```

## Warm Claude look

Tidepool comes with a terminal colour theme and a font, so the whole terminal matches what Tidepool draws.

- **Font: [Maple Mono NF](https://github.com/subframe7536/maple-font)** (v7.9, with Nerd Font glyphs for the powerline separators). Rounded shapes and cursive italics; your prompts are drawn in italic.
- **Theme: Warm Claude.** A warm near-black background (`#1A1817`), warm off-white text and Claude's clay accent, shipped for Ghostty, iTerm2, Windows Terminal, kitty, WezTerm, Alacritty and Warp under [`themes/`](themes). Set Tidepool's Theme to `warm` to match it.

**What installs by itself.** When a session starts, Tidepool copies whatever of these is missing (it never overwrites a file); the first session after you install Tidepool does the work and shows one toast:

| System | Font goes to | Theme goes to |
|---|---|---|
| macOS | `~/Library/Fonts` | `~/.config/ghostty/themes/Warm Claude` |
| Linux | `~/.local/share/fonts` (or `$XDG_DATA_HOME/fonts`), then `fc-cache` | `~/.config/ghostty/themes/Warm Claude` (or under `$XDG_CONFIG_HOME`) |
| Windows | `%LOCALAPPDATA%\Microsoft\Windows\Fonts`, registered for your user (Windows 10 1809 or later, no admin); restart your terminal to see it | Not copied: paste the Windows Terminal scheme yourself |

Under WSL or over SSH your terminal runs on another machine, so Tidepool installs nothing there; `/tidepool-setup` shows where the font files are so you can install them on that machine. Turn all of this off with **Install font and theme** in `/config`. Run `/tidepool-setup` at any time to install again and see the steps for your terminal.

**What you do once in your terminal.** No terminal lets a plugin change its font or colours, so pick them yourself (size 14 and line height 1.2 look right):

| Terminal | Font | Colours |
|---|---|---|
| Ghostty | `font-family = Maple Mono NF` | `theme = Warm Claude` |
| iTerm2 | Settings → Profiles → Text → Font | Profiles → Colors → Color Presets → Import `themes/iterm2/Warm Claude.itermcolors` |
| Windows Terminal | Profile → Appearance → Font face | Paste `themes/windows-terminal/warm-claude.json` into `schemes`, then pick it (restart the terminal first so it sees the font) |
| kitty | `font_family Maple Mono NF` | Copy `themes/kitty/warm-claude.conf` into your kitty config folder, then `include warm-claude.conf` |
| WezTerm | `font = wezterm.font 'Maple Mono NF'` | Copy `themes/wezterm/Warm Claude.toml` into your `colors` folder, then `color_scheme = 'Warm Claude'` |
| Alacritty | `font.normal.family = "Maple Mono NF"` | Copy `themes/alacritty/warm-claude.toml` into your Alacritty config folder, then add `[general]` with `import = ['<that copy>']` |
| Warp, and apps that import Warp themes (Orca: Terminal Themes → Import from YAML) | Settings → Appearance → Text | Import `themes/warp/warm_claude.yaml`, or copy it into your Warp themes folder |
| Others | Pick Maple Mono NF | The colours are in `themes/warm-claude.json` |

`/tidepool-setup` prints this table with the full paths to your install. Copy theme files into your terminal's own config folder rather than pointing at the install: its folder changes with each Tidepool version.

Maple Mono is distributed under the SIL Open Font License 1.1; see [`fonts/OFL.txt`](fonts/OFL.txt).

## Tide rail

The rail opens by itself when a session starts.

- **Fullscreen, 110 columns or wider:** it docks beside the chat and shows the turn you are reading. Scroll the chat and it follows; press an anchor line to pin a turn until you scroll again.
- **Anything else** (the main screen, a narrow window): Claude Code places it above the prompt. There it shows the turn that is running, six rows at most, and between turns shrinks to one line: `≈ tidepool  turn 4 · 52s · 14 tools`.
- `/tidepool-rail` hides or shows it for the session. Switch it off for good with the Tide rail setting; tool rows then go back to one line each in the chat.
- While the rail is docked, the tasks band leaves subagents to the rail and keeps the plan.

## Settings

Open `/config` and find the Tidepool rows. Every switched-off feature leaves Claude Code's own display exactly as it was.

| Setting | Default | What it does |
|---|---|---|
| Theme | `claude` | Colours for everything Tidepool draws, including the status line: `claude`, `warm` (matches the Warm Claude terminal theme), `nord`, `dracula`, `mono` |
| Powerline glyphs | off | Arrow and rounded-cap separators in headers and the status line. Needs a [Nerd Font](https://www.nerdfonts.com/) in your terminal, such as the bundled Maple Mono NF; otherwise you see empty boxes |
| Tide rail | on | Tool calls, agents and background jobs on a timeline beside the chat, with one anchor line per turn in the chat |
| Tasks band | on | Tasks, time left and agents above the prompt |
| Tool rows | on | Tidepool's tool rows: the anchor line and rail, or one-line calls with the rail off. Off leaves Claude Code's own rows |
| Spinner activity | on | Spinner says what is running |
| Transcript style | on | `▌ you` and `◆ claude` markers, titled command output |
| Prompt chrome | on | Mode chips, notices and the background hint; hides the `Baked for` line between turns |
| Prompt dock | on | The crab and its course above the prompt (terminal only). It replaces the spinner line, so Claude Code's live token count is not shown during a turn |
| Install font and theme | on | Copy the bundled Maple Mono NF font and Warm Claude theme on first start (see [Warm Claude look](#warm-claude-look)) |
| Usage line | on | Cold-cache warnings and the token split by agent above the prompt |
| Attention alerts | on | Chime and toast |
| Alert after (seconds) | `30` | Only alert for turns at least this long |

## Good to know

- **Tasks band empty?** It only shows while Claude has a task list. Ask for a plan, or anything with several steps.
- **The prompt dock** is drawn in half-block pixels, so it looks best with a Nerd Font such as the bundled Maple Mono NF. Collapse it with ctrl+x ctrl+a, or switch it off in `/config` to get Claude Code's spinner back.
- **Token counts look large.** A turn's tokens add up every request in that turn, and each request re-reads the cached context. That is how Claude Code bills usage, which is why the cache state matters.
- **No chime?** Sounds play through `afplay` on macOS. Linux and Windows get the toast only.
- **Dark terminals.** The palettes are designed for dark backgrounds. If Claude Code's own theme is a light one, Tidepool says so once at startup; it never changes the setting.
- **What stays Claude Code's.** The input box, the logo, permission dialogs and the `bypass permissions on` line are drawn where plugins cannot restyle them. Tool output under each tool row is Claude Code's own too.
- **Early-access API.** Tidepool uses Claude Code's function-hooks plugin API, which may change between releases. If something stops drawing after a Claude Code update, switch that feature off in `/config` and open an issue.

## Uninstall

```
/plugin uninstall tidepool@tidepool
```

Then remove the `"statusLine"` block from `~/.claude/settings.json` if you added it.

## Development

```
git clone https://github.com/BhumilModi/tidepool && cd tidepool
CLAUDE_CODE_TYPES=/path/to/claude-code.d.ts ./verify.sh
```

`verify.sh` validates the manifest, runs the tests with `claude plugin test`, type-checks with `tsc`, smoke-runs the status line script, and checks the terminal theme files are up to date. After changing `themes/warm-claude.mjs`, run `node scripts/build-themes.mjs`.

Claude Code writes its plugin API types into `.claude-plugin/types/` the first time it loads the plugin (run `claude --plugin-dir .` once). Until then, editors show type errors and `verify.sh` needs `CLAUDE_CODE_TYPES` pointing at a `claude-code.d.ts`: Claude Code's built-in plugin-authoring skill prints that file's path when it loads. `docs/spike.md` records what was checked live against Claude Code 2.1.288.

Layout: `hooks/features/*.tsx` are the hooks, one file per feature; `hooks/*.ts` are the pure helpers they use; `statusline/` is the status line script; `tests/` has one file per feature.

## Licence

MIT
