#!/usr/bin/env bash
# Preflight for /claude-review-setup: can this machine install the Claude PR review kit?
# Usage: preflight.sh [--install] [--repo <dir>]
#   --install  create or repair the ~/.claude/skills/claude-review-setup symlink to this clone
#   --repo     also check that <dir> is a git repository with a GitHub remote
# Exit 0 when nothing FAILs (WARN is allowed), 1 otherwise.
#
# Runs from the guideline clone it belongs to, so it cannot detect a missing clone — on a new
# machine, clone first (the FAIL hints and knowledge/templates/claude-review/README.md say how).
set -uo pipefail

GUIDE_URL="git@github.com:ThanhPhamit/claude-code-guideline.git"
LINK="$HOME/.claude/skills/claude-review-setup"
INSTALL=0
REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) INSTALL=1 ;;
    --repo) REPO="${2:?--repo needs a directory}"; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

fails=0
pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }

# This file is <guide>/.claude/skills/claude-review-setup/scripts/preflight.sh
SELF_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
SKILL="$(cd "$SELF_DIR/.." && pwd)"
GUIDE="$(cd "$SKILL/../../.." && pwd)"
KIT="$GUIDE/knowledge/templates/claude-review"

# 1. The guideline clone is a real git checkout
if git -C "$GUIDE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  pass "guideline repo: $GUIDE"
else
  fail "guideline repo: $GUIDE is not a git checkout — clone it: git clone $GUIDE_URL"
fi

# 2. The kit is complete
missing=()
for f in review/protocol.md review/README.md review/.kit-version review/repo-context.md \
         review/agents/domain-reviewer.md review/agents/verifier.md \
         review/profiles/security.md review/profiles/ci-github-actions.md \
         workflows/claude-code-review.yml workflows/claude.yml; do
  [ -f "$KIT/$f" ] || missing+=("$f")
done
if [ ${#missing[@]} -eq 0 ]; then
  pass "kit complete: $KIT (v$(cat "$KIT/review/.kit-version"))"
else
  fail "kit incomplete at $KIT — missing: ${missing[*]} (check: git -C \"$GUIDE\" status; git pull)"
fi

# 3. The skill is a symlink to THIS clone. A copy cannot find the kit; a dangling link makes
#    Claude Code drop the skill silently.
target="$(readlink -f "$LINK" 2>/dev/null || true)"
if [ "$target" = "$SKILL" ] && [ -f "$LINK/SKILL.md" ]; then
  pass "skill linked: $LINK -> $SKILL"
elif [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  fail "skill: $LINK is a copied directory, not a symlink — move it aside, then re-run with --install"
elif [ "$INSTALL" -eq 1 ]; then
  mkdir -p "$(dirname "$LINK")"
  if ln -sfn "$SKILL" "$LINK" && [ -f "$LINK/SKILL.md" ]; then
    pass "skill linked (created): $LINK -> $SKILL — restart Claude Code to load it"
  else
    fail "skill: could not create $LINK"
  fi
elif [ -L "$LINK" ] && [ ! -e "$LINK" ]; then
  fail "skill: $LINK is DANGLING (-> $(readlink "$LINK")) — the clone moved or was deleted; re-run with --install"
elif [ -L "$LINK" ]; then
  warn "skill: $LINK points to another clone ($target) — that clone's kit is what gets installed; --install re-points it here"
else
  fail "skill: $LINK does not exist — re-run with --install"
fi

# 4. The kit is published and current (WARN only: offline must not block an install).
#    "Up to date" compares commits, so it says nothing about files that were never committed.
kit_status="$(git -C "$GUIDE" status --porcelain -- knowledge/templates/claude-review .claude/skills/claude-review-setup 2>/dev/null)"
if printf '%s\n' "$kit_status" | grep -q '^??'; then
  warn "kit is NOT COMMITTED (untracked files) — other machines cannot get it, and repos installed now get an unpublished kit"
elif [ -n "$kit_status" ]; then
  warn "kit has uncommitted local changes — repos installed from this machine get them"
fi
upstream="$(git -C "$GUIDE" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$upstream" ]; then
  warn "freshness: the current branch has no upstream — cannot tell whether the kit is current"
elif GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" \
     timeout 30 git -C "$GUIDE" fetch -q 2>/dev/null; then
  behind="$(git -C "$GUIDE" rev-list --count "HEAD..$upstream")"
  ahead="$(git -C "$GUIDE" rev-list --count "$upstream..HEAD")"
  if [ "$behind" -gt 0 ]; then
    warn "kit is $behind commit(s) behind $upstream — update: git -C \"$GUIDE\" pull --ff-only"
  elif [ "$ahead" -gt 0 ]; then
    warn "kit has $ahead unpushed commit(s) — other machines cannot get them until you push"
  else
    pass "committed kit is up to date with $upstream"
  fi
else
  warn "freshness: could not fetch $upstream within 30s (offline or SSH auth) — using the local kit"
fi

# 5. Tools the installer uses (presence is tested by running the tool, not command -v)
if git --version >/dev/null 2>&1; then pass "git"; else fail "git is not installed"; fi
if python3 -c 'import yaml' >/dev/null 2>&1; then
  pass "python3 + PyYAML"
else
  fail "python3 with PyYAML is needed for the YAML check — install: pip install --user pyyaml"
fi
if gh --version >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    pass "gh authenticated"
  else
    warn "gh is not authenticated — action pins stay at the template's (fix: gh auth login)"
  fi
else
  warn "gh is not installed — action pins stay at the template's; secret checks are skipped"
fi
if actionlint --version >/dev/null 2>&1; then
  pass "actionlint (binary)"
elif docker info >/dev/null 2>&1; then
  pass "actionlint via docker (rhysd/actionlint — run it with --user \$(id -u):\$(id -g))"
elif go version >/dev/null 2>&1; then
  pass "actionlint via go run"
else
  fail "actionlint: no binary, no running docker, no go — install one: https://github.com/rhysd/actionlint"
fi

# 6. Target repository (optional)
if [ -n "$REPO" ]; then
  if top="$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null)"; then
    url="$(git -C "$top" remote get-url origin 2>/dev/null || true)"
    case "$url" in
      *github.com[:/]*)
        pass "target repo: $top ($url)"
        # The workflow trusts the review guide on the base branch; that only holds if the branch is
        # protected. Checked on the default branch here; Step 7 asks for every reviewed base branch.
        slug="$(printf '%s' "$url" | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
        if gh --version >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
          def="$(gh api "repos/$slug" --jq .default_branch 2>/dev/null || true)"
          if [ -n "$def" ]; then
            if gh api "repos/$slug/branches/$def" --jq .protected 2>/dev/null | grep -qx true; then
              pass "default branch '$def' is protected"
            else
              warn "default branch '$def' is NOT protected — anyone with write access can push a new review guide straight to it"
            fi
          fi
        fi ;;
      "") fail "target repo: $top has no 'origin' remote" ;;
      *) fail "target repo: origin is not GitHub ($url) — the kit is GitHub Actions only" ;;
    esac
  else
    fail "target repo: $REPO is not a git repository"
  fi
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "PREFLIGHT OK"
else
  echo "PREFLIGHT FAILED ($fails)"
fi
[ "$fails" -eq 0 ]
