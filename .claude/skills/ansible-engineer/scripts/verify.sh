#!/usr/bin/env bash
# Run the Ansible verification ladder. Every gate RUNS -- none is skipped for a missing tool.
#
# HOUSE RULE: a gate never reports SKIPPED because its tool is absent. If a tool is missing,
# this script installs it (bootstrap-ansible.sh --ensure) and then runs the gate. If the
# install is impossible, that is a FAIL with the reason -- never a silent pass, and never an
# "inconclusive" shrug that a && chain would read as success.
#
# Usage:
#   verify.sh [target-dir] --limit <host> [--playbook <path>] [--vault-password-file <path>]
#   verify.sh [target-dir] --no-diff     [--playbook <path>] [--vault-password-file <path>]
#
#   verify.sh ansible/ --limit web-stg-1     # the full ladder, gates 1-4
#   verify.sh ansible/ --no-diff             # gates 1-3 only, EXPLICITLY (exits 3, not 0)
#   verify.sh ansible/ --limit web-stg-1 --no-install   # air-gapped: missing tool = FAIL
#
# --limit is REQUIRED unless you pass --no-diff. Gate 4 is blocking, so the choice to run
# without a host has to be deliberate; it is not something the script decides for you.
#
# Exit codes: 0 = every gate ran and passed
#             1 = a gate FAILED, or a required tool could not be installed
#             2 = bad usage
#             3 = PARTIAL: gates 1-3 passed but gate 4 was waived with --no-diff

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="ansible"
LIMIT=""
PLAYBOOK=""
NO_DIFF=0
AUTO_INSTALL=1
VAULT_FILE=""

# Self-documenting --help: replay the header comment block, whatever it currently says.
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    # GUARD: `shift 2` with only one arg left returns 1 WITHOUT shifting -> infinite loop.
    --limit)    [ $# -ge 2 ] || { echo "ERROR: --limit needs a host" >&2; exit 2; }
                LIMIT="$2"; shift 2 ;;
    --playbook) [ $# -ge 2 ] || { echo "ERROR: --playbook needs a path" >&2; exit 2; }
                PLAYBOOK="$2"; shift 2 ;;
    --vault-password-file)
                [ $# -ge 2 ] || { echo "ERROR: --vault-password-file needs a path" >&2; exit 2; }
                VAULT_FILE="$2"; shift 2 ;;
    --no-diff)    NO_DIFF=1; shift ;;
    --no-install) AUTO_INSTALL=0; shift ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "Unknown flag: $1" >&2; exit 2 ;;
    *)          TARGET="$1"; shift ;;
  esac
done

if [ -z "$LIMIT" ] && [ "$NO_DIFF" -eq 0 ]; then
  echo "ERROR: gate 4 (--check --diff) is blocking, so it needs a decision:" >&2
  echo "  verify.sh $TARGET --limit <host>   # run it against ONE host (what G3b requires)" >&2
  echo "  verify.sh $TARGET --no-diff        # waive it deliberately (exits 3, never 0)" >&2
  exit 2
fi
[ -d "$TARGET" ] || { echo "ERROR: target dir '$TARGET' not found" >&2; exit 2; }
TARGET_LABEL="$TARGET"

# Same for the vault password file: it is given relative to the caller's cwd, and we cd below.
# A relative path that survives the cd silently points at a DIFFERENT file (or nothing), and the
# gate then fails with "Attempting to decrypt but no vault secrets found" — which reads as a
# broken playbook rather than a mis-resolved path.
VAULT_ARG=""
if [ -n "$VAULT_FILE" ]; then
  [ -f "$VAULT_FILE" ] || { echo "ERROR: vault password file '$VAULT_FILE' not found" >&2; exit 2; }
  VAULT_FILE="$(cd "$(dirname "$VAULT_FILE")" && pwd)/$(basename "$VAULT_FILE")"
  VAULT_ARG="--vault-password-file $VAULT_FILE"
elif [ -n "${ANSIBLE_VAULT_PASSWORD_FILE:-}" ]; then
  echo "   using ANSIBLE_VAULT_PASSWORD_FILE from the environment"
fi

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

# ---------------------------------------------------- toolchain: install, never skip
# The gates below assume their tools exist, because this block guarantees it. A missing tool
# is a setup problem with a known fix, not a reason to downgrade coverage and move on.
# A tool counts as present only if it RUNS. `command -v` alone is a false positive under
# pyenv: the shim is on PATH for every interpreter, so it answers yes even when the package
# lives in a different pyenv version -- and the gate then fails with
# "pyenv: ansible-lint: command not found", which reads as a broken PLAYBOOK, not a broken
# toolchain. That misdiagnosis is worse than an honest skip.
have() { command -v "$1" >/dev/null 2>&1 && "$1" --version >/dev/null 2>&1; }

TOOL_FAIL=""
MISSING_TOOLS=""
for t in yamllint ansible-playbook ansible-lint; do
  have "$t" || MISSING_TOOLS="$MISSING_TOOLS $t"
done
if [ -n "$MISSING_TOOLS" ]; then
  printf '\n== Toolchain: missing%s\n' "$MISSING_TOOLS"
  if [ "$AUTO_INSTALL" -eq 1 ]; then
    printf '   installing (house rule: a gate installs its tool rather than skipping)\n'
    if "$SCRIPT_DIR/bootstrap-ansible.sh" --ensure; then
      :
    else
      TOOL_FAIL="bootstrap-ansible.sh --ensure failed (exit $?)"
    fi
  else
    TOOL_FAIL="--no-install was passed, so the missing tool(s) were not installed"
  fi
  STILL=""
  for t in yamllint ansible-playbook ansible-lint; do
    have "$t" || STILL="$STILL $t"
  done
  if [ -n "$STILL" ]; then
    [ -n "$TOOL_FAIL" ] || TOOL_FAIL="still missing after install:$STILL"
    printf '\n\033[31m== BLOCKED — the verification gates cannot run\033[0m\n'
    printf '   missing:%s\n' "$STILL"
    printf '   cause:  %s\n' "$TOOL_FAIL"
    printf '   fix:    %s/bootstrap-ansible.sh --dry-run   (read the plan, then run it)\n' "$SCRIPT_DIR"
    for t in $STILL; do
      command -v "$t" >/dev/null 2>&1 && {
        printf '   NOTE:   %s IS on PATH but does not run — a pyenv shim pointing at another\n' "$t"
        printf '           interpreter. In THIS directory: pyenv local <the version it was installed into>\n'
        break; }
    done
    printf '\n'
    printf '   This is a FAIL, not a skip: an unrun gate must never read as a pass.\n\n'
    exit 1
  fi
fi

PASS=0; FAIL=0; SKIP=0; WARN=0
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
if yamllint -f parsable .; then result PASS yamllint
else result WARN yamllint '(advisory — style only, does not block)'
fi

# ------------------------------------------------------- 2. syntax-check (BLOCKING)
printf '\n-- 2/4 ansible-playbook --syntax-check (BLOCKING)\n'
if [ -z "$PLAYBOOK" ]; then
  # Not a skip: there is nothing to verify, which is a real defect in the target, not a
  # gap in coverage. Name the paths that were tried so the fix is obvious.
  result FAIL syntax-check 'no playbook found (looked for site.yml, site.yaml, playbooks/site.yml) — pass --playbook <path>'
else
  # shellcheck disable=SC2086  # INV_ARG is intentionally word-split
  # shellcheck disable=SC2086  # VAULT_ARG is intentionally word-split
  if ansible-playbook $INV_ARG $VAULT_ARG "$PLAYBOOK" --syntax-check; then result PASS syntax-check
  else result FAIL syntax-check '(blocking)'; fi
fi

# ------------------------------------------------- 3. ansible-lint (BLOCKING gate)
printf '\n-- 3/4 ansible-lint --profile production (BLOCKING)\n'
if ansible-lint --profile production --nocolor .; then result PASS ansible-lint
else result FAIL ansible-lint '(blocking)'; fi

# ----------------------------------------------------- 4. dry run (only with --limit)
printf '\n-- 4/4 --check --diff\n'
if [ "$NO_DIFF" -eq 1 ]; then
  # Waived on purpose by the caller. Recorded as a WAIVED gate and forced to exit 3 below --
  # this is the one gate a script cannot run for you, because it needs a real host.
  result SKIP 'check --diff' 'WAIVED by --no-diff (needs a host; run with --limit <host> to satisfy G3b)'
else
  # shellcheck disable=SC2086
  if ansible-playbook $INV_ARG $VAULT_ARG "$PLAYBOOK" --limit "$LIMIT" --check --diff; then
    result PASS 'check --diff' "(limit: $LIMIT)"
  else
    result FAIL 'check --diff' "(limit: $LIMIT)"
  fi
fi

# Molecule and the idempotency re-run are NOT gates here -- they need a live target or a
# container and must be run deliberately. Point at them instead of faking a result.
#
# Report on molecule whether or not a scenario exists. Speaking only when one is already
# present means a repo of shared roles with NO scenario gets total silence, and silence reads
# as "nothing to do" -- which is how an untested role ships. Absence is the finding worth
# naming; it is a WARN and not a FAIL because plenty of roles legitimately cannot be
# container-tested (anything needing a cloud identity, a real registry, or a live service).
printf '\n-- next (not run by this script)\n'
_roledirs="$(find . -type d -name roles -not -path '*/molecule/*' -print -quit)"
_scenarios="$(find . -type d -name molecule -print -quit)"
if [ -n "$_scenarios" ]; then
  if have molecule; then
    printf '   molecule scenario found: run "molecule test" inside the role dir\n'
  else
    result WARN 'molecule' 'scenario exists but molecule is not installed — the role tree ships an untested gate'
  fi
elif [ -n "$_roledirs" ]; then
  result WARN 'molecule' "roles/ present, no molecule scenario — role-level idempotency is unproven off-host. Add one, or record in the role's README that it cannot be container-tested and why"
fi
[ -n "$LIMIT" ] && printf '   idempotency proof: run the playbook FOR REAL twice against %s;\n                      the second run must report changed=0 (check mode cannot prove this)\n' "$LIMIT"

# ------------------------------------------------------------------------ summary
printf '\n== Summary:  \033[32m%d passed\033[0m · \033[31m%d failed\033[0m · \033[33m%d warned\033[0m · \033[33m%d skipped\033[0m\n' \
  "$PASS" "$FAIL" "$WARN" "$SKIP"
[ "$SKIP" -gt 0 ] && printf '   NOTE: a WAIVED gate is not a pass — coverage is lower than it looks.\n'

if [ "$FAIL" -gt 0 ]; then
  printf '   Result: BLOCKED — fix the failing gate(s) and re-run.\n\n'
  exit 1
fi
if [ "$NO_DIFF" -eq 1 ]; then
  printf '   Result: PARTIAL — gates 1-3 ran and passed; gate 4 waived with --no-diff.\n'
  printf '           G3b is NOT satisfied without a reviewed --check --diff. Re-run with\n'
  printf '           --limit <host> once a host is reachable.\n\n'
  exit 3
fi
printf '   Result: OK — every gate ran and passed.\n\n'
exit 0
