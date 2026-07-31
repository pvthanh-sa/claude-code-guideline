#!/usr/bin/env bash
# Run the Ansible verification ladder, skipping any tool that is not installed.
#
# A skipped gate is reported as SKIPPED and lowers the coverage summary — it is never
# counted as a pass. ansible-lint (production profile) is the blocking gate.
#
# Usage:
#   verify.sh [target-dir] [--limit <host>] [--playbook <path>]
#
#   verify.sh ansible/
#   verify.sh ansible/ --limit web-stg-1          # also runs --check --diff
#   verify.sh . --playbook playbooks/site.yml
#
# Exit codes: 0 = all blocking gates ran and passed · 1 = a blocking gate failed
#             2 = bad usage · 3 = INCONCLUSIVE (a blocking gate never ran; tool missing)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="ansible"
LIMIT=""
PLAYBOOK=""

# Self-documenting --help: replay the header comment block, whatever it currently says.
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    # GUARD: `shift 2` with only one arg left returns 1 WITHOUT shifting -> infinite loop.
    --limit)    [ $# -ge 2 ] || { echo "ERROR: --limit needs a host" >&2; exit 2; }
                LIMIT="$2"; shift 2 ;;
    --playbook) [ $# -ge 2 ] || { echo "ERROR: --playbook needs a path" >&2; exit 2; }
                PLAYBOOK="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "Unknown flag: $1" >&2; exit 2 ;;
    *)          TARGET="$1"; shift ;;
  esac
done

[ -d "$TARGET" ] || { echo "ERROR: target dir '$TARGET' not found" >&2; exit 2; }
TARGET_LABEL="$TARGET"

# --playbook is given relative to the caller's cwd; resolve it BEFORE we cd away.
if [ -n "$PLAYBOOK" ]; then
  [ -f "$PLAYBOOK" ] || { echo "ERROR: playbook '$PLAYBOOK' not found" >&2; exit 2; }
  PLAYBOOK="$(cd "$(dirname "$PLAYBOOK")" && pwd)/$(basename "$PLAYBOOK")"
fi

# Ansible resolves ansible.cfg relative to the CURRENT DIRECTORY, never the playbook's.
# Exporting ANSIBLE_CONFIG is NOT enough: it loads the file, but the relative paths *inside*
# it (inventory, roles_path, collections) still resolve against the caller's cwd. Only a real
# cd makes the config mean what it says. Everything below is therefore relative to $TARGET.
cd "$TARGET" || exit 2
[ -f ansible.cfg ] && echo "   using $(pwd)/ansible.cfg"

INV_ARG=""
[ -f inventory.ini ] && INV_ARG="-i inventory.ini"

# Find the playbook if not given: prefer site.yml at the target root.
if [ -z "$PLAYBOOK" ]; then
  for cand in site.yml site.yaml playbooks/site.yml; do
    [ -f "$cand" ] && { PLAYBOOK="$cand"; break; }
  done
fi

PASS=0; FAIL=0; SKIP=0; WARN=0; SKIP_BLOCKING=0
result() { # result <PASS|FAIL|WARN|SKIP> <gate> [detail]
  case "$1" in
    PASS) PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m    %s %s\n' "$2" "${3:-}" ;;
    FAIL) FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m    %s %s\n' "$2" "${3:-}" ;;
    WARN) WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m    %s %s\n' "$2" "${3:-}" ;;
    SKIP) SKIP=$((SKIP+1)); printf '  \033[33mSKIPPED\033[0m %s %s\n' "$2" "${3:-}" ;;
  esac
}

printf '\n== Verifying %s\n' "$TARGET_LABEL"
if [ -n "$PLAYBOOK" ]; then
  printf '   playbook: %s\n' "$PLAYBOOK"
else
  printf '   playbook: none found (syntax-check and dry-run will be skipped)\n'
fi

# ---------------------------------------------------------------- 1. yamllint (advisory)
printf '\n-- 1/4 yamllint (advisory)\n'
if command -v yamllint >/dev/null 2>&1; then
  if yamllint -f parsable .; then result PASS yamllint
  else result WARN yamllint '(advisory — style only, does not block)'
  fi
else
  result SKIP yamllint 'not installed — bootstrap-ansible.sh'
fi

# ------------------------------------------------------- 2. syntax-check (BLOCKING)
printf '\n-- 2/4 ansible-playbook --syntax-check (BLOCKING)\n'
if command -v ansible-playbook >/dev/null 2>&1 && [ -n "$PLAYBOOK" ]; then
  # shellcheck disable=SC2086  # INV_ARG is intentionally word-split
  if ansible-playbook $INV_ARG "$PLAYBOOK" --syntax-check; then result PASS syntax-check
  else result FAIL syntax-check '(blocking)'; fi
elif [ -z "$PLAYBOOK" ]; then
  result SKIP syntax-check 'no playbook found'; SKIP_BLOCKING=1
else
  result SKIP syntax-check 'ansible-playbook not installed'; SKIP_BLOCKING=1
fi

# ------------------------------------------------- 3. ansible-lint (BLOCKING gate)
printf '\n-- 3/4 ansible-lint --profile production (BLOCKING)\n'
if command -v ansible-lint >/dev/null 2>&1; then
  if ansible-lint --profile production --nocolor .; then result PASS ansible-lint
  else result FAIL ansible-lint '(blocking)'; fi
else
  result SKIP ansible-lint 'not installed — this IS the blocking gate, coverage is reduced'
  SKIP_BLOCKING=1
fi

# ----------------------------------------------------- 4. dry run (only with --limit)
printf '\n-- 4/4 --check --diff\n'
if [ -z "$LIMIT" ]; then
  result SKIP 'check --diff' 'pass --limit <host> to enable (never runs against all hosts)'
elif command -v ansible-playbook >/dev/null 2>&1 && [ -n "$PLAYBOOK" ]; then
  # shellcheck disable=SC2086
  if ansible-playbook $INV_ARG "$PLAYBOOK" --limit "$LIMIT" --check --diff; then
    result PASS 'check --diff' "(limit: $LIMIT)"
  else
    result FAIL 'check --diff' "(limit: $LIMIT)"
  fi
else
  result SKIP 'check --diff' 'ansible-playbook or playbook missing'
fi

# Molecule and the idempotency re-run are NOT gates here -- they need a live target or a
# container and must be run deliberately. Point at them instead of faking a result.
printf '\n-- next (not run by this script)\n'
if command -v molecule >/dev/null 2>&1 && [ -n "$(find . -type d -name molecule -print -quit)" ]; then
  printf '   molecule scenario found: run "molecule test" inside the role dir\n'
fi
[ -n "$LIMIT" ] && printf '   idempotency proof: run the playbook FOR REAL twice against %s;\n                      the second run must report changed=0 (check mode cannot prove this)\n' "$LIMIT"

# ------------------------------------------------------------------------ summary
printf '\n== Summary:  \033[32m%d passed\033[0m · \033[31m%d failed\033[0m · \033[33m%d warned\033[0m · \033[33m%d skipped\033[0m\n' \
  "$PASS" "$FAIL" "$WARN" "$SKIP"
[ "$SKIP" -gt 0 ] && printf '   NOTE: skipped gates are NOT passes — coverage is lower than it looks.\n'

if [ "$FAIL" -gt 0 ]; then
  printf '   Result: BLOCKED — fix the failing gate(s) and re-run.\n\n'
  exit 1
fi
if [ "$SKIP_BLOCKING" -gt 0 ]; then
  # A zero-coverage run must NOT exit 0 -- in CI or a && chain that would read as success.
  printf '   Result: INCONCLUSIVE — a BLOCKING gate never ran. Install the toolchain:\n'
  printf '           %s/bootstrap-ansible.sh --dry-run\n\n' "$SCRIPT_DIR"
  exit 3
fi
printf '   Result: OK — all blocking gates ran and passed.\n\n'
exit 0
