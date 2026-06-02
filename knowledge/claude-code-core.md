# Claude Code — Core Knowledge

Distilled from the official Claude Code documentation (memory, permission-modes, common-workflows, best-practices, skills).

> Model references updated 2026-06 — Claude 4.x family: **Opus 4.8 / 4.7**, **Sonnet 4.6**, **Haiku 4.5**. Conceptual sections (memory, skills, hooks, MCP, permissions, worktrees) are version-independent; the official docs remain the source of truth for fast-moving details.

**Core Structure:**

- **Part I: Fundamentals** - Context window, memory systems, workflows
- **Part II: Interaction** - Prompting, communication, permissions
- **Part III: Capabilities** - Thinking mode, images, worktrees, output formats
- **Part IV: Customization** - Skills, subagents, hooks, MCP
- **Part V: Automation** - Non-interactive mode, parallel execution, scheduling
- **Part VI: Troubleshooting** - Common patterns, setup checklist

---

# PART I: FUNDAMENTALS

Core concepts and building blocks: context management, memory systems, and the foundational 4-phase workflow.

---

## 1. The One Constraint That Drives Everything

Claude's context window fills fast. Every message, every file read, every command output occupies tokens. **When the window fills, performance degrades — Claude starts forgetting earlier instructions and making more mistakes.**

All best practices flow from managing that window efficiently.

---

## 2. Memory System

Claude Code has two complementary memory systems.

### CLAUDE.md (you write it)

| Location                               | Scope                    | Use for                                        |
| -------------------------------------- | ------------------------ | ---------------------------------------------- |
| `/etc/claude-code/CLAUDE.md` (Linux)   | All users in org         | Company coding standards, security policies    |
| `~/.claude/CLAUDE.md`                  | All your projects        | Personal shortcuts, preferences                |
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project (shared via git) | Coding standards, build commands, architecture |
| Child directory `CLAUDE.md`            | Loaded on demand         | Sub-module specific instructions               |

**Rules for writing effective CLAUDE.md:**

- Target **under 200 lines** — longer files cause Claude to ignore rules
- Use markdown headers & bullets — Claude scans structure like a reader
- Write **specific, verifiable** instructions:
  - ✅ `Run npm test before committing`
  - ❌ `Test your changes`
- Check into git so the team benefits; grows in value over time
- If Claude ignores a rule, the file is too long — prune ruthlessly

**What belongs in CLAUDE.md vs what doesn't:**

| Include                                     | Exclude                            |
| ------------------------------------------- | ---------------------------------- |
| Build/test commands Claude can't guess      | Things Claude infers from code     |
| Code style that differs from defaults       | Standard language conventions      |
| Repo etiquette (branch naming, PR format)   | Detailed API docs (link instead)   |
| Architectural decisions specific to project | Long tutorials or explanations     |
| Common gotchas, non-obvious behaviors       | File-by-file codebase descriptions |
| Required env vars                           | "Write clean code" (self-evident)  |

**Importing other files:**

```
# CLAUDE.md
See @README.md for project overview.
- Git workflow: @docs/git-instructions.md
- Personal preferences: @~/.claude/my-overrides.md
```

**Skipping unwanted files & integrations:**

- `claudeMdExcludes`: For monorepos, exclude team or external CLAUDE.md files by setting this in `settings.local.json`.
- **AGENTS.md Compatibility**: Claude Code does NOT read `AGENTS.md`. If it exists, create a `CLAUDE.md` and import it directly via `@AGENTS.md`.

### .claude/rules/ (structured rules)

For large projects, split instructions into topic-specific files:

```
.claude/
  CLAUDE.md           ← main instructions
  rules/
    code-style.md
    testing.md
    security.md
```

**Tip:** `.claude/rules/` supports symlinks, allowing you to share rule files across multiple repositories locally.

Path-scoped rules only load when Claude works with matching files:

```yaml
---
paths:
  - 'src/api/**/*.ts'
---
# API Development Rules
- All endpoints must include input validation
```

### Auto memory (Claude writes it)

Claude automatically saves build commands, debugging insights, and patterns it discovers. Stored at `~/.claude/projects/<repo>/memory/MEMORY.md`. First 200 lines loaded every session. Run `/memory` to browse or edit.

---

## 3. The 4-Phase Workflow

```
EXPLORE → PLAN → IMPLEMENT → COMMIT
```

### Phase 1: Explore (Plan Mode — read-only)

```
claude --permission-mode plan

read src/auth/ and understand sessions and login.
look at how secrets are managed.
```

### Phase 2: Plan (Plan Mode — still)

```
I want to add Google OAuth. What files need to change?
What's the session flow? Create a detailed plan.
```

Press `Ctrl+G` to open the plan in your editor and edit before proceeding. For advanced review, use `/ultraplan` for browser-based review GUI.

### Phase 3: Implement (Normal Mode)

```
implement the OAuth flow from the plan.
write tests for the callback handler, run the suite and fix failures.
```

### Phase 4: Commit

```
commit with a descriptive message and open a PR
```

**When to skip planning:** task is clear, fix is small (typo, rename, single-line change). If you can describe the diff in one sentence, skip the plan.

---

# PART II: INTERACTION & PERMISSIONS

How to communicate with Claude, manage permissions, and control access patterns.

---

## 4. Context Management

The context window is the most critical resource.

| Command                 | When to use                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `/clear`                | Between unrelated tasks. Resets the full window.                                       |
| `/compact <focus>`      | Compress long sessions while keeping key context. E.g. `/compact Focus on API changes` |
| `Esc + Esc` / `/rewind` | Open rewind menu — restore code/conversation to a checkpoint                           |
| `/btw`                  | Quick side question — answer appears in overlay, never enters context history          |
| Subagents               | Research tasks that read many files — runs in separate context, reports summary back   |

**Common failure patterns:**

1. **Kitchen sink session** — mixing unrelated tasks. Fix: `/clear` between tasks.
2. **Correction loop** — correcting the same issue 3+ times. Fix: `/clear` and rewrite the prompt from scratch incorporating what you learned.
3. **Bloated CLAUDE.md** — rules get lost in noise. Fix: ruthlessly prune.
4. **Trust-then-verify gap** — plausible output that misses edge cases. Fix: always provide tests or a verification command.
5. **Infinite exploration** — "investigate" without scope. Fix: narrow the scope, or use a subagent.

---

## 5. Work with Images

You can directly analyze images in Claude Code without saving them first.

**Methods to add images:**

1. Drag and drop an image into the Claude Code window
2. Copy an image and paste it with `Ctrl+V` (Windows/Linux) or `Cmd+V` (macOS)
3. Provide an image path directly: `"Analyze this image: /path/to/your/image.png"`

**Use Cases:**

- Analyze UI screenshots and implement matching designs
- Diagnose visual errors in the application
- Reference database schemas, architecture diagrams
- Generate CSS to match design mockups
- Work with error screenshots to fix bugs

**Tip:** Reference images like `[Image #1]` by `Cmd+Click` (Mac) or `Ctrl+Click` (Windows/Linux) to open in viewer.

Use `@` to quickly include files or directories without waiting for Claude to discover them.

| Reference                 | What it loads            | Example                               |
| ------------------------- | ------------------------ | ------------------------------------- |
| `@file.ts`                | Full file content        | `@src/utils/auth.js`                  |
| `@directory/`             | Directory listing + info | `@src/components`                     |
| `@github:org/repo/issues` | MCP resources            | External tools (GitHub, Notion, etc.) |

**Tips:**

- `@` references automatically add `CLAUDE.md` files from the referenced directory hierarchy
- File paths can be relative or absolute
- You can reference multiple files: `@file1.js and @file2.js`

---

## 6. Run Parallel Claude Sessions with Git Worktrees

When working on multiple tasks, use worktrees to create isolated working directories.

```bash
# Start Claude in a worktree named "feature-auth"
claude --worktree feature-auth

# Auto-generates a name like "bright-running-fox"
claude --worktree

# List and manage worktrees
git worktree list
git worktree remove ../project-feature-a
```

**Copy gitignored files to worktrees:**

Create `.worktreeinclude` in project root (uses `.gitignore` syntax):

```
.env
.env.local
config/secrets.json
```

**Subagent worktrees:** Subagents can also use worktree isolation by adding `isolation: worktree` to custom agent frontmatter.

---

## 7. Permission Modes

| Mode                | What Claude can do                  | When to use                         |
| ------------------- | ----------------------------------- | ----------------------------------- |
| `default`           | Read files                          | Sensitive work, getting started     |
| `acceptEdits`       | Read + edit files                   | Iterating on code you're reviewing  |
| `plan`              | Read files only (no edits)          | Exploring, planning complex changes |
| `auto`              | All actions + background classifier | Long tasks, reduce prompt fatigue   |
| `bypassPermissions` | All actions, no checks              | Isolated containers/VMs only        |
| `dontAsk`           | Only pre-approved tools             | Locked-down CI environments         |

**Switch modes:** `Shift+Tab` cycles through modes during a session.

**Start in a specific mode:**

```bash
claude --permission-mode plan
```

**Set as default:**

```json
// .claude/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

### Protected Paths (Never auto-approved)

Regardless of permission mode, Claude must ask permission to write to these protected locations:

**Protected directories:**

- `.git`
- `.vscode`, `.idea`
- `.husky`
- `.claude` (except `.claude/commands`, `.claude/agents`, `.claude/skills`, `.claude/worktrees`)

**Protected files:**

- `.gitconfig`, `.gitmodules`
- `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`
- `.ripgreprc`
- `.mcp.json`, `.claude.json`

---

## 8. Non-interactive (Headless) Mode & Output Formats

Use `claude -p "prompt"` for non-interactive runs in CI, scripts, and integrations.

```bash
# Basic text output (default)
claude -p "explain this code" > output.txt

# Structured JSON output
claude -p "list all API endpoints" --output-format json > output.json

# Streaming JSON (real-time output)
claude -p "analyze this log" --output-format stream-json | my-processor

# Pipe data in
cat error.log | claude -p "find the root cause"

# Combined: read file, structured output, permissions restricted
claude -p "migrate this file to Vue" \
  --output-format json \
  --allowedTools "Edit,Bash(git commit *)"
```

| Mode             | When to use                                               |
| ---------------- | --------------------------------------------------------- |
| `text` (default) | Simple integrations, logs                                 |
| `json`           | Parse results programmatically, full conversation history |
| `stream-json`    | Real-time processing, streaming output                    |

---

## 9. Auto Mode Classifier

Auto mode eliminates permission prompts by using a background classifier to evaluate actions.

**Requirements:**

- Plan: Team, Enterprise, or API (not Pro/Max)
- Model: Claude Sonnet 4.6 or Opus 4.7/4.8 (not Haiku)
- Provider: Anthropic API only
- Admin: Enabled via admin settings on Team/Enterprise

**Enable auto mode:**

```bash
claude --enable-auto-mode
```

**What it blocks by default:**

- `curl | bash` and similar code-download-execute patterns
- Sending credentials to unknown external services
- Production deploys and migrations
- Mass deletion on cloud storage
- IAM and repo permission changes
- Force push to main

**What it allows by default:**

- Local file operations in working directory
- Installing declared dependencies
- Reading `.env` and using credentials for matching APIs
- Read-only HTTP requests
- Pushing to your branch or new Claude-created branches

**When auto mode pauses:**

- 3 consecutive denials or 20+ total denials in a session → resumes manual prompting
- Approving a prompt resumes auto mode
- Non-interactive mode (`-p` flag): repeated blocks abort the session

See `/permissions` in a session to view Recently denied actions.

---

## 10. Scheduled Tasks & Automation

Run Claude on a schedule for recurring tasks like PR reviews or CI checks.

| Platform              | Setup                       | Best for                                             |
| --------------------- | --------------------------- | ---------------------------------------------------- |
| Cloud scheduled tasks | Configure at claude.ai/code | Tasks that run 24/7 (even when your computer is off) |
| Desktop app           | Built-in scheduling         | Tasks needing local file access                      |
| GitHub Actions        | YAML workflow file          | Tasks tied to repo events or cron schedules          |
| `/loop`               | In-session CLI              | Quick polling while session is open                  |

**Example: `/loop` for quick polling**

```bash
/loop 30s ping http://localhost:8080/health and let me know when it returns 200 OK
/loop 5m check if the CI build finished and summarize results
```

**Writing prompts for scheduled tasks:**
Be explicit about success criteria and how to handle results, since the task runs autonomously:

```
Review open PRs labeled "needs-review", leave inline comments on any issues,
and post a summary in the #eng-reviews Slack channel.
```

---

## 11. Session Management

```bash
claude --continue         # Resume most recent conversation
claude --resume           # Open Session Picker to Search (/) or Branch preview (B) session
claude -n auth-refactor   # Start session with name
/rename auth-refactor     # Rename current session
```

Every Claude action creates a checkpoint. `Esc + Esc` → `/rewind` to restore.

---

# PART III: ADVANCED CAPABILITIES

Powerful features: extended thinking, images, worktrees, and output formats.

---

## 12. Extended Thinking (Thinking Mode)

Claude uses adaptive reasoning and extended thinking to work through complex problems. More thinking = more space to explore solutions, analyze edge cases, and self-correct mistakes.

### Configure Thinking Mode

| Control                                   | How to use   | Purpose                                                                |
| ----------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `/effort`                                 | In session   | Adjust effort level: `low`, `medium`, `high`, `xhigh`, `max` (`xhigh` Opus 4.8/4.7 only)    |
| `Option+T` / `Alt+T`                      | Toggle       | Enable/disable thinking mode (all models)                              |
| `Ctrl+O`                                  | Verbose mode | Show Claude's internal reasoning as gray italic text                   |
| `ultrathink`                              | In prompt    | Include anywhere in prompt to set effort=high for that turn            |
| `MAX_THINKING_TOKENS`                     | Env var      | Limit thinking budget (Opus 4.7/4.8 & Sonnet 4.6 only; 0=disabled)         |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` | Env var      | Disable adaptive thinking on Opus 4.7/4.8 & Sonnet 4.6 (reverts to fixed budget) |
| `/config`                                 | In session   | Toggle thinking globally (saved to ~/.claude/settings.json)            |

> **Fast mode (`/fast`):** uses Claude Opus with **faster output** (it does NOT downgrade to a smaller model). Toggle with `/fast`; available on Opus 4.8/4.7/4.6.

### Use Cases

- Complex architectural decisions
- Challenging bugs and debugging
- Multi-step planning
- Evaluating tradeoffs

---

# PART IV: CUSTOMIZATION

Extend Claude Code with skills, subagents, hooks, and MCP integrations.

---

## 13. Skills

Skills follow the [Agent Skills](https://agentskills.io/) open standard. Claude Code extends it with invocation control, subagent execution, and dynamic context injection.

### Storage locations (priority: enterprise > personal > project)

| Level      | Path                               | Scope             |
| ---------- | ---------------------------------- | ----------------- |
| Enterprise | managed settings                   | All users in org  |
| Personal   | `~/.claude/skills/<name>/SKILL.md` | All your projects |
| Project    | `.claude/skills/<name>/SKILL.md`   | This project only |

**Token Budgeting for Skills**: When calling a skill, it consumes context capacity. After context is compacted, Claude only retains the first 5,000 tokens of each skill (across a shared budget of 25,000 tokens). If a skill is very long, it may need to be invoked again after compacting.

### Frontmatter fields

```yaml
---
name: skill-name # becomes /slash-command (optional, defaults to dir name)
description: When to use this # RECOMMENDED — Claude uses this to auto-detect
disable-model-invocation: true # Only YOU can invoke (not Claude auto)
user-invocable: false # Only Claude can invoke (hidden from / menu)
allowed-tools: Read, Grep, Glob # Tools Claude can use without asking permission
context: fork # Run in isolated subagent (separate context)
agent: Explore # Which subagent type (Explore|Plan|general-purpose|custom)
effort: high # Effort level override (low|medium|high|max)
argument-hint: '[issue-number]' # Shown in autocomplete
---
```

### Invocation control

| Setting                          | You invoke? | Claude auto-invoke? | When to use                                     |
| -------------------------------- | ----------- | ------------------- | ----------------------------------------------- |
| (default)                        | ✅          | ✅                  | Reference knowledge, conventions                |
| `disable-model-invocation: true` | ✅          | ❌                  | Side-effect actions: deploy, commit, send-slack |
| `user-invocable: false`          | ❌          | ✅                  | Background knowledge, not a user command        |

### Arguments

```yaml
---
name: fix-issue
disable-model-invocation: true
---
Fix GitHub issue $ARGUMENTS.        # $ARGUMENTS = all args

# Or positional:
Migrate $0 from $1 to $2.           # $0 = first arg, $1 = second, etc.
# Also: $ARGUMENTS[0], $ARGUMENTS[1]
```

Advanced environment variables available in skills:

- `$CLAUDE_SESSION_ID`: Useful for creating session-specific log files.
- `$CLAUDE_SKILL_DIR`: Point to accompanying scripts exactly inside the skill folder.

### Dynamic context injection (!`command`)

Runs shell commands before Claude sees the skill — output replaces the placeholder:

```yaml
---
name: pr-summary
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---
### PR context
- Diff: !`gh pr diff`
- Comments: !`gh pr view --comments`
- Files: !`gh pr diff --name-only`

### Task
Summarize this pull request...
```

### Supporting files

Skills can include more than just `SKILL.md`. Keep `SKILL.md` under 500 lines:

```
.claude/skills/my-skill/
  SKILL.md              ← required, overview + navigation
  reference.md          ← detailed docs, loaded on demand
  examples.md           ← usage examples
  scripts/
    validate.sh         ← scripts Claude can execute
```

Reference from `SKILL.md`:

```markdown
- Full API reference: see [reference.md](reference.md)
- Examples: see [examples.md](examples.md)
```

### Bundled skills (ship with Claude Code)

| Command                     | What it does                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/batch <instruction>`      | Fan out large-scale changes across codebase in parallel (5–30 agents, each in isolated git worktree) |
| `/simplify [focus]`         | Spawn 3 review agents in parallel, aggregate, then fix code quality issues                           |
| `/debug [description]`      | Enable debug logging + analyze session debug log                                                     |
| `/loop [interval] <prompt>` | Poll/repeat a prompt on a schedule (e.g. `/loop 5m check if deploy finished`)                        |
| `/claude-api`               | Load Claude API reference for your language (auto-activates when code imports `anthropic`)           |

#### Command Examples

**1. `/batch <instruction>`**
_Fan out tasks in parallel for large-scale refactoring._

- `/batch migrate all React class components in src/components to functional components with hooks`
- `/batch replace the deprecated 'request' package with 'axios' across all microservices`

**2. `/simplify [focus]`**
_Spawn review agents in parallel to aggregate and fix code quality._

- `/simplify the payment processing logic in src/checkout.ts`
- `/simplify deeply nested conditionals`
- `/simplify` (Runs automatically with current context)

**3. `/debug [description]`**
_Enable debug logging and analyze the session._

- `/debug why the workspace tests failed to run in the last step`
- `/debug Claude seems to be stuck in an infinite loop trying to read compiling logs`

**4. `/loop [interval] <prompt>`**
_Schedule a command to periodically run._

- `/loop 30s ping http://localhost:8080/health and let me know when it returns 200 OK`
- `/loop 5m check the CI github actions status for the latest commit and summarize the failures if any`

**5. `/claude-api`**
_Load Claude API documentation._

- Type `/claude-api` before asking tasks like: _"Now write a Python script using the API to summarize text."_

### Troubleshooting skills

| Problem                  | Fix                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Skill not triggering     | Check description has keywords users would say. Try `/skill-name` directly.                             |
| Skill triggers too often | Make description more specific. Add `disable-model-invocation: true`.                                   |
| Skills missing           | Many skills exceed the character budget (2% of context window, ~16,000 chars). Run `/context` to check. |

### Key distinction

- **CLAUDE.md / rules/** → loaded every session → persistent standards, build commands
- **Skills** → loaded on demand → domain knowledge, reusable workflows, actions with side effects

---

## 14. Hooks

Hooks run scripts automatically at specific points in Claude's workflow. Unlike CLAUDE.md (advisory), hooks are **deterministic** — they always execute.

### Hook events

| Event                               | When it fires                                                        |
| ----------------------------------- | -------------------------------------------------------------------- |
| `PreToolUse`                        | Before every tool call — can allow/deny/escalate                     |
| `PostToolUse`                       | After every tool call                                                |
| `Notification`                      | Claude needs attention (idle, permission prompt, auth)               |
| `InstructionsLoaded`                | When CLAUDE.md and rules files are loaded (debug which files loaded) |
| `WorktreeCreate` / `WorktreeRemove` | Custom worktree logic for non-git VCS                                |

### Configure in `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "npm run lint -- $FILE" }]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Needs your attention'"
          }
        ]
      }
    ]
  }
}
```

**Notification matcher values:** `permission_prompt` | `idle_prompt` | `auth_success` | `elicitation_dialog`

### Use cases

- `PostToolUse` on `Edit` → run eslint after every file edit
- `PreToolUse` → block writes to migrations folder
- `Notification` on `idle_prompt` → desktop notification when Claude finishes

Ask Claude to write hooks for you: _"Write a hook that runs eslint after every file edit"_

---

## 15. Subagents

Subagents run in isolated contexts with their own tool sets. They are used to:

- Investigate codebases (keeps main context clean)
- Review code from a fresh perspective
- Fan out parallel work

**Writer/Reviewer pattern:**

1. Session A: `implement a rate limiter for our API endpoints`
2. Session B: `review the rate limiter in @src/middleware/rateLimiter.ts. look for edge cases, race conditions, and consistency with existing patterns.`
3. Session A: `here's the review feedback: [paste]. address these issues.`

### Where they're defined

```
.claude/agents/
  security-reviewer.md
  test-writer.md
```

### Frontmatter

```yaml
---
name: security-reviewer
description: Reviews code for security vulnerabilities. Use when checking auth, APIs, or data handling.
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior security engineer. Review for:
  - Injection vulnerabilities (SQL, XSS, command injection)
  - Auth and authz flaws
  - Secrets or credentials in code
```

### Key fields

| Field       | Options                           | Purpose                               |
| ----------- | --------------------------------- | ------------------------------------- |
| `tools`     | `Read, Grep, Glob, Bash, Edit...` | Restrict to only what the agent needs |
| `model`     | `opus`, `sonnet`, `haiku`         | Different model per agent             |
| `isolation` | `worktree`                        | Agent gets its own git worktree       |

### How to use

```
# Automatic delegation
use a subagent to review this code for edge cases

# Explicit
use the security-reviewer subagent to check the auth module

# Available built-in agents
Explore   ← read-only, fast codebase research
Plan      ← planning only, no edits
general-purpose ← default
```

### Subagent + skill (`context: fork`)

Skill with `context: fork` becomes a subagent task — the SKILL.md content is the prompt:

```yaml
---
name: deep-research
context: fork
agent: Explore # or any custom agent from .claude/agents/
---
Research $ARGUMENTS thoroughly.
Find relevant files, read code, summarize with file references.
```

---

## 16. MCP (Model Context Protocol)

Connect external tools so Claude can query databases, read Figma, search GitHub issues, etc.

```bash
# Add a server interactively
claude mcp add

# Common MCP servers
claude mcp add github    # GitHub repos, issues, PRs
claude mcp add notion    # Notion pages
claude mcp add postgres  # Query databases
```

Once connected, reference MCP resources with `@`:

```
Show me the data from @github:repos/owner/repo/issues
```

Use `/permissions` to allowlist frequently used MCP domains.

---

## 17. Sandboxing & Network Isolation

Isolate Claude's filesystem and network access for safer execution.

**Enable sandboxing:**

```bash
claude --sandbox
```

Works with any permission mode to restrict:

- Read/write access to specific directories
- Network requests to allowlisted domains
- Process execution

Use in conjunction with `/permissions` to define allowlists.

---

## 18. Ultraplan & Browser-based Review

For advanced review of complex plans, use `/ultraplan` to open browser-based review GUI with:

- Visual diff highlighting
- Step-by-step approval
- In-browser editing

Particularly useful for large refactors or architectural changes.

---

# PART V: AUTOMATION & SCALE

Non-interactive execution, scheduled tasks, and parallel automation.

---

## 19. Automation & Scale

**Non-interactive (CI, scripts):**

```bash
claude -p "your prompt" --output-format json
claude -p "fix all lint errors" --permission-mode auto
```

**Fan out across files:**

```bash
for file in $(cat files.txt); do
  claude -p "migrate $file from React to Vue. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```

**Verify with Claude in CI:**

```json
// package.json
{
  "scripts": {
    "lint:claude": "claude -p 'look at changes vs. main. report typos: filename + line number on one line, description on next. no other text.'"
  }
}
```

---

# PART VI: TROUBLESHOOTING & REFERENCE

## 21. Project Setup Checklist

When starting on a new project with Claude Code:

```
1. Run /init                 ← generates starter CLAUDE.md from codebase analysis
2. Refine CLAUDE.md          ← add what /init missed (gotchas, env vars, test commands)
3. Create .claude/rules/     ← split large CLAUDE.md into topic files
4. Add skills                ← domain knowledge + repeatable workflows
5. Create agents             ← specialized subagents for security, testing, etc.
6. Configure hooks           ← automate lint/format after edits
7. Connect MCP servers       ← external tools (GitHub, Figma, DB)
8. Set permission mode       ← defaultMode in .claude/settings.json
```

---

## 22. Quick Reference by Task

| I want to...                       | Use this         | Command/Key                                    |
| ---------------------------------- | ---------------- | ---------------------------------------------- |
| **Explore code safely**            | Plan Mode        | `claude --permission-mode plan`                |
| **Review before editing**          | Browser review   | `/ultraplan`                                   |
| **Work on multiple tasks**         | Git Worktrees    | `claude --worktree feature-name`               |
| **Switch permissions mid-session** | Permission cycle | `Shift+Tab`                                    |
| **See Claude's reasoning**         | Thinking mode    | `Ctrl+O` (verbose) or `Option+T` (toggle)      |
| **Control thinking depth**         | Effort level     | `/effort high` (or `xhigh` on Opus 4.8/4.7)    |
| **Faster Opus output**             | Fast mode        | `/fast`                                        |
| **Quick question without context** | Side question    | `/btw your question`                           |
| **Recover from mistakes**          | Rewind           | `Esc+Esc` or `/rewind`                         |
| **Clean up context**               | Clear context    | `/clear` or `/compact [focus]`                 |
| **Reference a file**               | @ syntax         | `@src/utils/helpers.ts`                        |
| **Add an image**                   | Drag & drop      | Or `Ctrl+V` (paste)                            |
| **Run in scripts**                 | Non-interactive  | `claude -p "your prompt" --output-format json` |
| **Analyze images**                 | Image analysis   | Drag/paste screenshot + ask Claude             |
| **Use database**                   | MCP              | `claude mcp add postgres`                      |
| **Run daily task**                 | Scheduled tasks  | Cloud scheduled tasks or `/loop 24h`           |
| **Limit file access**              | Sandbox          | `claude --sandbox`                             |
| **See what's loaded**              | Show memory      | `/memory`                                      |
| **Rename session**                 | Session naming   | `/rename auth-refactor`                        |
| **Resume last work**               | Continue session | `claude --continue`                            |

---

## 23. Common Keyboard Shortcuts

| Action                | Key (Windows/Linux) | Key (macOS) |
| --------------------- | ------------------- | ----------- |
| Cycle permissions     | `Shift+Tab`         | `Shift+Tab` |
| Toggle thinking       | `Alt+T`             | `Option+T`  |
| Show thinking details | `Ctrl+O`            | `Cmd+O`     |
| Stop mid-action       | `Esc`               | `Esc`       |
| Rewind menu           | `Esc+Esc`           | `Esc+Esc`   |
| Open plan in editor   | `Ctrl+G`            | `Cmd+G`     |
| Paste image           | `Ctrl+V`            | `Cmd+V`     |
| Copy file reference   | (use `@`)           | (use `@`)   |

---

## 24. Environment Variables & Configuration

| Variable                                         | Purpose                           | Example                                |
| ------------------------------------------------ | --------------------------------- | -------------------------------------- |
| `MAX_THINKING_TOKENS`                            | Limit thinking budget             | `export MAX_THINKING_TOKENS=10000`     |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`              | Disable auto memory               | Toggle in `/config` instead            |
| `CLAUDE_CODE_EFFORT_LEVEL`                       | Set default effort                | `export CLAUDE_CODE_EFFORT_LEVEL=high` |
| `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | Load CLAUDE.md from shared dirs   | Useful for monorepos                   |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1`        | Revert to fixed thinking budget   | On Opus/Sonnet 4.6                     |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`              | Use PowerShell on Windows         | For PowerShell-specific tasks          |
| `SLASH_COMMAND_TOOL_CHAR_BUDGET`                 | Increase skill description budget | Raise if descriptions get cut short    |

---

## 25. Model-Specific Capabilities

| Capability            | Opus 4.8/4.7  | Sonnet 4.6               | Haiku 4.5    | claude-3       |
| --------------------- | ------------- | ------------------------ | ------------ | -------------- |
| **Adaptive thinking** | ✅ Full       | ✅ Full                  | ❌           | ❌             |
| **Auto mode**         | ✅            | ✅                       | ❌           | ❌             |
| **Extended thinking** | ✅            | ✅                       | Fixed budget | Fixed budget   |
| **Max effort level**  | `max` (+ `xhigh`) | `high`               | `high`       | `high`         |
| **Fast mode (`/fast`)** | ✅          | ❌                       | ❌           | ❌             |
| **Recommended for**   | Complex tasks | Balanced (speed+quality) | Quick tasks  | Legacy support |

> Opus 4.8 is available with a **1M-token context window** (vs the standard 200K).

---

## 26. Troubleshooting Quick Links

- **Claude isn't following CLAUDE.md:** Run `/memory`, check file is loaded. Make instructions more specific.
- **Auto memory not saving:** Check `/memory` toggle is ON. Files at `~/.claude/projects/<project>/memory/`
- **Skills not triggering:** Description might need keywords. Try `/skill-name` directly.
- **Permission prompts too frequent:** Use `/permissions` to pre-approve tools or try `--permission-mode auto`
- **Context window filling fast:** Use `/compact`, `/clear` between tasks, or delegate to subagents.
- **Extended thinking not working:** Check model is Opus/Sonnet 4.6. Older models use fixed budget.
