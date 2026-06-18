---
name: secret-scan
description: 'Stage 6 of the DevOps pipeline. Tool-based secret scanning before pushing to GitHub. Bootstraps the guardrail (.gitleaks.toml + a pre-push hook + a GitHub Actions workflow) and runs an on-demand scan with Betterleaks (fallback Gitleaks). STOPS at human gate G6; never pushes or commits.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write
argument-hint: '[--setup | --scan]'
---

# Secret Scan — Stage 6 (Pre-push secret gate)

The last gate before code leaves the machine. Scanning is done by a **tool** (Betterleaks,
falling back to Gitleaks) — not by Claude grepping. Two enforcement layers, per the DevSecOps
roadmap (defense-in-depth): a **local pre-push hook** (Layer 2) and a **CI workflow** (Layer 3).

> **Human gate G6:** This skill reports findings and **STOPS**. It never runs `git push` or
> `git commit`. You decide whether to push.

**Mode** from `$ARGUMENTS`:
- `--setup` → install the guardrail into this project (idempotent).
- `--scan` (default) → run a scan now. If the guardrail isn't installed, offer `--setup` first.

Resolve the template source (this skill is symlinked from the guideline repo, like `init-project`).
The templates are **not copied** into projects — they're read live from the guideline repo via the
symlink, so `readlink -f` is required to follow the symlink to the real path (and `$CLAUDE_SKILL_DIR`
may be the symlink path itself, or empty in some shells — handle both):
```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/secret-scan}" 2>/dev/null)"
GUIDELINE="$(dirname "$(dirname "$(dirname "$SK")")")"
TPL="$GUIDELINE/knowledge/templates/secret-scan"
test -d "$TPL" || { echo "ERROR: templates not found at $TPL — is the guideline repo present and the skill symlinked? (Guide §1.1)"; exit 1; }
# GUARD: secret-scan is meaningless outside a git repo, and --setup would otherwise create
# .githooks/ + .github/ files then fail on `git config core.hooksPath`. Check up front, both modes.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not inside a git repository — cd into your project repo first (git init if new)."; exit 1; }
```

> The per-file installer below also verifies each template exists before copying — a template
> removed/renamed upstream surfaces as an error, not a silent "created" with no source.

---

## Setup mode (`--setup`)

Install the guardrail from the templates. Setup is **idempotent and drift-aware**: it creates
missing files, and for files that **already exist but differ from the current template** (e.g. an
older hook installed before a template fix) it reports the drift and refreshes them — guardrail files
are not user-customized, so keeping them in sync with the source is the point. It still asks before
overwriting a file the user has clearly hand-edited (a diff that isn't just the template moving
forward — when unsure, show the diff and ask).

```bash
mkdir -p .githooks .github/workflows
# install_or_refresh <template-file> <dest>: create if missing, refresh if it drifted from template.
install_or_refresh() {
  src="$1"; dst="$2"
  [ -f "$src" ] || { echo "ERROR: template missing: $src — guideline repo incomplete"; return 1; }
  if [ ! -f "$dst" ]; then cp "$src" "$dst"; echo "created  $dst";
  elif ! cmp -s "$src" "$dst"; then cp "$src" "$dst"; echo "refreshed $dst (was stale vs template)";
  else echo "ok       $dst (current)"; fi
}
install_or_refresh "$TPL/gitleaks.toml"   .gitleaks.toml
install_or_refresh "$TPL/pre-push"        .githooks/pre-push
install_or_refresh "$TPL/secret-scan.yml" .github/workflows/secret-scan.yml
chmod +x .githooks/pre-push
git config core.hooksPath .githooks
```

Then check a scanner is available (PATH binary **or** the Docker image, since the hook supports both)
and tell the user how to install one if not:
```bash
BL_IMG="ghcr.io/betterleaks/betterleaks:latest"
if command -v betterleaks >/dev/null 2>&1; then echo "scanner: betterleaks (binary)"
elif command -v gitleaks >/dev/null 2>&1; then echo "scanner: gitleaks (binary)"
elif command -v docker >/dev/null 2>&1 && docker image inspect "$BL_IMG" >/dev/null 2>&1; then echo "scanner: betterleaks (docker)"
else echo "NOTE: no scanner — install one (options below, or see $TPL/README.md)"; fi
```

If **no scanner** is installed, present **both** options so the user picks (don't silently default to
gitleaks just because it has a one-line binary install). Betterleaks is preferred — by the original
Gitleaks author, MIT, drop-in (reads the same `.gitleaks.toml`):

```bash
# Betterleaks (preferred): brew install betterleaks   |   docker pull ghcr.io/betterleaks/betterleaks:latest
#                          sudo dnf install betterleaks (Fedora)   |   build from source (needs Go)
# Gitleaks (fallback, easiest on plain Linux): brew install gitleaks, or download the static
#   binary for the OS/arch from github.com/gitleaks/gitleaks/releases
```

> On plain Ubuntu/Debian (no Homebrew) the quickest path is Docker (`betterleaks` image) or the
> single gitleaks binary. Ask the user which they prefer; installing either is an outward network
> fetch, so confirm before running it.

After setup, run a scan (below). Note: `.gitleaks.toml`, `.githooks/`, and
`.github/workflows/secret-scan.yml` are tracked files (commit them whenever you choose — the user
manages git themselves).

## Scan mode (`--scan`, default)

Pick the scanner (Betterleaks preferred), then scan the repo before push. Use each tool's native
invocation — betterleaks uses the `git` subcommand, gitleaks uses `detect`:
```bash
CFG=""; [ -f .gitleaks.toml ] && CFG="--config .gitleaks.toml"
BL_IMG="ghcr.io/betterleaks/betterleaks:latest"
if command -v betterleaks >/dev/null 2>&1; then
  betterleaks git . --redact $CFG
elif command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --redact $CFG
elif command -v docker >/dev/null 2>&1 && docker image inspect "$BL_IMG" >/dev/null 2>&1; then
  # No PATH binary but the Docker image is pulled — run betterleaks through it.
  # -u matches host ownership (avoids git "dubious ownership"); repo mounted at /repo.
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/repo" -w /repo "$BL_IMG" git . --redact $CFG
else
  echo "❌ no scanner — install a binary, or: docker pull $BL_IMG (see $TPL/README.md)"; exit 1
fi
```
> The pre-push hook uses this **same three-way detection** (binary → binary → Docker image), so a
> Docker-only Betterleaks install drives both the on-demand scan and the local gate — no separate
> binary needed. (To also catch **uncommitted** secrets in a mostly-unstaged repo, add a working-tree
> pass: swap `git .` for `dir .`.)
- Exit 0 → clean. Non-zero → potential secret(s) found (output is redacted).
- If findings appear, summarize: file, rule, and the remediation order (remove → **rotate** →
  ignore only if false positive via `.gitleaksignore`).

## Phase: STOP at Gate G6

```
## Secret scan (G6) — <repo>

Scanner: <betterleaks binary | gitleaks binary | betterleaks docker>   Guardrail: <installed | not installed>

### Result: ✅ no secrets   |   ❌ N potential secret(s)
[if findings: list file · rule · (value redacted)]

---
👉 Next:
   - Clean: you may `git push` (the pre-push hook will re-scan as a backstop).
   - Findings: remove the secret, ROTATE it if real, re-run `/secret-scan`. Do NOT push yet.
   - Not set up? run `/secret-scan --setup` first.
(I do NOT push or commit.)
```

**Do not `git push` or `git commit`.** Wait for the human.

## Notes
- The local hook blocks `git push`; bypass is `git push --no-verify` (discourage — user owns the risk).
- CI (`secret-scan.yml`) is the server-side backstop (full-history scan on push/PR).
- Optional 3rd layer: GitHub native push protection (repo settings) — see `$TPL/README.md`.
- Complements the `security-auditor` agent (pattern grep) with a real, deterministic tool gate.
