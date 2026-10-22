# Claude PR review kit

Source of truth for the Claude PR review that `/claude-review-setup` installs into project repos
(application or IaC). This file is for whoever maintains the kit; the installed repo gets
`review/README.md` as `.github/claude-review/README.md`.

## New machine — install once

The skill is a symlink into this clone, so without the clone it does not exist — and Claude Code
drops a skill with a dangling link silently. Clone, then let the preflight create the link and check
everything the installer needs:

```bash
GUIDE=~/Documents/Devops/claude-code-guideline       # wherever you want the clone
git clone git@github.com:ThanhPhamit/claude-code-guideline.git "$GUIDE"
bash "$GUIDE/.claude/skills/claude-review-setup/scripts/preflight.sh" --install
```

Restart Claude Code afterwards. Run the preflight (without `--install`) any time to re-check: it
reports PASS/WARN/FAIL for the clone, the kit files, the symlink (missing / dangling / a copy / another
clone), kit freshness against the remote (non-blocking, 30s timeout, never prompts for SSH), and the
tools the installer uses (git, python3 + PyYAML, gh, actionlint via binary/docker/go). The skill also
runs it as its first step and stops on any FAIL.

## Using it in a repo

On a machine where the skill is symlinked (`pipeline-usage-guide.md` §1.1), open Claude Code in the
target repo and say:

```
/claude-review-setup
```

or in plain words — "set up Claude Code Review GitHub workflow for this repo". Without the symlink:

```
Read ~/Documents/Devops/claude-code-guideline/.claude/skills/claude-review-setup/SKILL.md and follow it for this repo.
```

Upgrade an installed repo after the kit changes: run the same command (it detects
`.github/claude-review/.kit-version` and upgrades kit-owned files, leaving `repo-context.md` alone).

## Layout

```
claude-review/
├── README.md                    # this file (maintainers)
├── workflows/
│   ├── claude-code-review.yml   # automatic review — lines marked ADAPT are fitted per repo
│   └── claude.yml               # @claude on demand
└── review/                      # → <repo>/.github/claude-review/
    ├── README.md                # kit-owned: how it works / setup / tuning / troubleshooting
    ├── .kit-version             # bump on every kit change that repos should pick up
    ├── protocol.md              # kit-owned: review → verify → report, output format
    ├── agents/                  # kit-owned: domain-reviewer + verifier subagent prompts
    ├── profiles/                # kit-owned: per-stack checklists; installer copies only matching ones
    └── repo-context.md          # TEMPLATE for the repo-owned file the installer writes once
```

## Design decisions (and why)

| Decision | Why |
|---|---|
| Reviewer knowledge lives in `.github/claude-review/`, **not** `.claude/` | `claude-code-action` restores `.claude/`, `CLAUDE.md`, `.mcp.json` from the PR base branch and **deletes** what the base lacks; and `/init-project` gitignores `.claude/` in project repos. Anything under `.claude/` would be absent in CI. |
| Subagents are prompt files, not `.claude/agents/*.md` | Same reason. The main reviewer passes the file's text to a `general-purpose` subagent, which works in any repo with no agent definitions. |
| The guide is read from the **base branch** into `$RUNNER_TEMP`, passed with `--add-dir` | A PR cannot rewrite the rules it is reviewed by. Writing into the workspace instead would collide with the action's own `git checkout` of the PR branch. Tested: a PR replacing `protocol.md` still gets the base copy; the bootstrap PR falls back to its own copy with a notice; neither present → hard error. |
| Explicit `--disallowedTools` for edits and `git add/commit/push/rm` | `track_progress` runs tag mode, which grants file edits (`acceptEdits`) and git commit/push by default. An automatic review must be read-only; deny rules win over allow rules. |
| Every 🔴 goes through an independent verifier subagent | Precision. A reviewer that cries wolf gets ignored; the verifier tries to refute each blocker against the code. |
| `repo-context.md` is repo-owned and never overwritten | It is where a team corrects the reviewer (*Do not flag*, *Conventions*, *Hot spots*). Kit-owned files can then be upgraded freely. |
| Advisory, never a merge gate | LLM output varies run to run. Gates stay deterministic (lint/tests, `iac-scan.yml`, `ansible-scan.yml`, `secret-scan.yml`); the reviewer reads their results and does not repeat them. |
| No cloud credentials in the review job | It reads untrusted PR content; prompt injection must have nothing to steal. IaC is reviewed from code — the reviewer says "confirm with `terraform plan`" where it depends on provider behaviour. |
| SHA-pinned actions, refreshed by re-running the installer | `cicd.md`: production-facing repos pin third-party actions to a commit SHA. The kit installs the review only — no Dependabot or other repo changes; re-running `/claude-review-setup` moves the pins to the newest exact release. |
| Model via repo variable `CLAUDE_REVIEW_MODEL` (default `opus`) | Tune cost per repo without editing the workflow. |

Verified against `anthropics/claude-code-action` v1.0.258 source: `claude_args` parsing
(`base-action/src/parse-sdk-options.ts` — repeated `--allowedTools`/`--disallowedTools` accumulate,
`--add-dir` becomes `additionalDirectories`), tag-mode default tools (`src/modes/tag/index.ts`), and
config restore (`src/github/operations/restore-config.ts`).

## Changing the kit

1. Edit the files here. Profiles: keep them to **what goes wrong**, not style — style belongs to
   linters. Protocol: anything that changes the output format must stay compatible with what teams
   already read.
2. Bump `review/.kit-version` (semver: patch = wording, minor = new profile/check, major = format or
   layout change).
3. Validate the workflows:
   ```bash
   cd knowledge/templates/claude-review/workflows
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 claude-code-review.yml claude.yml
   yamllint -d '{extends: default, rules: {line-length: {max: 120}, truthy: {check-keys: false}, document-start: disable}}' *.yml
   ```
4. Re-run `/claude-review-setup` in each installed repo to upgrade it.

Adding a stack: write `review/profiles/<stack>.md` (same shape as the others), add a detection row
to the table in `.claude/skills/claude-review-setup/SKILL.md` Step 2, and to the `DOMAIN` examples
in `review/agents/domain-reviewer.md`.
