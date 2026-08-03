#!/usr/bin/env bash
# Bootstrap the Ansible toolchain.
#
# Why pip and not the distro package: apt ships ansible-lint 6.17, which predates the
# profile system (--profile production) this toolkit relies on; molecule is not packaged
# at all.
#
# Where it installs, in priority order — never a bare pip3 into a system interpreter,
# which modern distros refuse (PEP 668 "externally-managed-environment") and which would
# put ansible-core in the same site-packages as distro-managed tools:
#   1. an active virtualenv, or a pyenv-selected (non-system) interpreter
#   2. pipx — one isolated venv per tool
#   3. nothing: print the two commands to create a venv, and stop
#
# Usage:
#   bootstrap-ansible.sh --dry-run   # print the plan, change nothing
#   bootstrap-ansible.sh             # install the full toolchain
#   bootstrap-ansible.sh --check     # report what is present / missing, change nothing
#   bootstrap-ansible.sh --ensure    # install ONLY what is missing, then exit 0
#
# --ensure is what verify.sh calls when a gate's tool is absent. House rule: a gate never
# skips because a tool is missing — it installs the tool and runs. So --ensure is deliberately
# narrow: it installs only the missing packages and only the missing collections, and it never
# passes --upgrade, because silently bumping a working ansible-core can break pinned
# collection compatibility mid-verification.
#
# Exit codes: 0 = everything required is now present · 1 = an install failed
#             2 = bad usage, or no installer available (no venv / pyenv / pipx)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=0
CHECK_ONLY=0
ENSURE=0

# Self-documenting --help: replay the header comment block, whatever it currently says.
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --check)   CHECK_ONLY=1 ;;
    --ensure)  ENSURE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# EVERY range below is upper-bounded, and the bounds match knowledge/templates/ansible/
# requirements.yml and the CI workflow exactly. An unbounded range here is not a convenience:
# it silently installs a newer major than CI resolves, which is the "green pipeline, red
# laptop" skew these files warn about -- inverted, and therefore harder to notice.
#
# The 2.17 floor is real, not decorative: amazon.aws >=11 and community.docker >=5 both
# declare `requires_ansible: >=2.17.0`. (The older 9.x/4.x lines only needed 2.15 -- if you
# ever lower the collection floors, re-check whether 2.17 is still required.)
PY_PKGS=(
  "ansible-core>=2.17,<2.22"
  "ansible-lint>=25.0,<27.0"
  "yamllint>=1.35,<2.0"
  "molecule>=25.0,<27.0"
  "molecule-plugins[docker]"
  "boto3"        # required by the amazon.aws collection
  "botocore"
  "jmespath"     # required by the json_query filter
)

COLLECTIONS=(
  "amazon.aws:>=11.0.0,<12.0.0"
  "community.general:>=10.0.0,<11.0.0"
  "ansible.posix:>=2.0.0,<3.0.0"
  "community.docker:>=5.0.0,<6.0.0"
)

say()   { printf '%s\n' "$*"; }
head2() { printf '\n== %s\n' "$*"; }

# A tool is "present" only if it RUNS. `command -v` is not enough: a pyenv shim is on PATH for
# every interpreter, so it answers yes even when the package was installed into a DIFFERENT
# pyenv version -- and the tool then dies with "pyenv: <tool>: command not found". Treating
# that as installed makes a gate fail and blame the playbook instead of the toolchain.
have() { command -v "$1" >/dev/null 2>&1 && "$1" --version >/dev/null 2>&1; }

# ------------------------------------------------------------------ installer selection
INSTALLER=""
INSTALL_CTX=""
if [ -n "${VIRTUAL_ENV:-}" ]; then
  INSTALLER="pip";  INSTALL_CTX="active virtualenv: $VIRTUAL_ENV"
elif command -v pyenv >/dev/null 2>&1 && [ "$(pyenv version-name 2>/dev/null | head -1)" != "system" ]; then
  INSTALLER="pip";  INSTALL_CTX="pyenv interpreter: $(pyenv version-name 2>/dev/null | head -1)"
elif command -v pipx >/dev/null 2>&1; then
  INSTALLER="pipx"; INSTALL_CTX="pipx ($(pipx --version 2>/dev/null))"
else
  INSTALLER="none"; INSTALL_CTX="no virtualenv, no pyenv, no pipx"
fi

head2 "Current state"
MISSING=0
for t in ansible ansible-playbook ansible-galaxy ansible-lint yamllint molecule; do
  if have "$t"; then
    printf '  %-18s %s\n' "$t" "$("$t" --version 2>/dev/null | head -1)"
  elif command -v "$t" >/dev/null 2>&1; then
    printf '  %-18s SHIM ONLY — on PATH but does not run (installed into another interpreter)\n' "$t"
    MISSING=$((MISSING + 1))
  else
    printf '  %-18s MISSING\n' "$t"
    MISSING=$((MISSING + 1))
  fi
done

printf '  %-18s %s\n' "python3" "$(python3 --version 2>/dev/null || echo MISSING)"
printf '  %-18s %s\n' "installer" "$INSTALLER — $INSTALL_CTX"
printf '  %-18s %s\n' "docker" "$(docker --version 2>/dev/null || echo 'MISSING (molecule docker driver unavailable)')"

if [ "$CHECK_ONLY" -eq 1 ]; then
  head2 "Check only — nothing changed"
  say "  $MISSING tool(s) missing."
  exit 0
fi

# ------------------------------------------------------------------------------ --ensure
# Narrow, idempotent, no --upgrade: install exactly the missing tools and collections so the
# caller's gate can run. Anything already present is left alone.
have_collection() {  # have_collection <namespace.name>
  ansible-galaxy collection list 2>/dev/null | grep -qE "^$1[[:space:]]"
}

if [ "$ENSURE" -eq 1 ]; then
  NEED_PKGS=()
  have ansible-playbook || NEED_PKGS+=("ansible-core>=2.17,<2.22" "boto3" "botocore" "jmespath")
  have ansible-lint     || NEED_PKGS+=("ansible-lint>=25.0,<27.0")
  have yamllint         || NEED_PKGS+=("yamllint>=1.35,<2.0")

  NEED_COLS=()
  if have ansible-galaxy; then
    for c in "${COLLECTIONS[@]}"; do
      have_collection "${c%%:*}" || NEED_COLS+=("$c")
    done
  else
    NEED_COLS=("${COLLECTIONS[@]}")   # no galaxy yet -> ansible-core is coming, so all of them
  fi

  if [ "${#NEED_PKGS[@]}" -eq 0 ] && [ "${#NEED_COLS[@]}" -eq 0 ]; then
    head2 "Ensure — nothing to do"
    say "  Every gate prerequisite is already present."
    exit 0
  fi

  head2 "Ensure — installing ONLY what is missing"
  [ "${#NEED_PKGS[@]}" -gt 0 ] && say "  packages:    ${NEED_PKGS[*]}"
  [ "${#NEED_COLS[@]}" -gt 0 ] && say "  collections: ${NEED_COLS[*]}"

  if [ "$INSTALLER" = "none" ]; then
    say ""
    say "  CANNOT INSTALL — no virtualenv, no pyenv, no pipx. A bare 'pip3 install' would"
    say "  target the system interpreter, which modern distros refuse (PEP 668)."
    say "  Create one of these, then re-run:"
    say "    python3 -m venv ~/.venvs/ansible && . ~/.venvs/ansible/bin/activate"
    say "    python3 -m pip install --user pipx && python3 -m pipx ensurepath   # new shell after"
    exit 2
  fi

  if [ "${#NEED_PKGS[@]}" -gt 0 ]; then
    if [ "$INSTALLER" = "pip" ]; then
      # No --upgrade: only the missing ones are named, and a working pin stays put.
      pip3 install "${NEED_PKGS[@]}" || { say "  ERROR: pip install failed"; exit 1; }
      command -v pyenv >/dev/null 2>&1 && { pyenv rehash; say "  pyenv rehash done"; }
    else
      for p in "${NEED_PKGS[@]}"; do
        case "$p" in
          ansible-core*) pipx install "$p" && pipx inject ansible-core boto3 botocore jmespath ;;
          boto3|botocore|jmespath) : ;;   # injected with ansible-core above
          *) pipx install "$p" ;;
        esac || { say "  ERROR: pipx install of '$p' failed"; exit 1; }
      done
    fi
  fi

  if [ "${#NEED_COLS[@]}" -gt 0 ]; then
    command -v ansible-galaxy >/dev/null 2>&1 || {
      say "  ERROR: ansible-galaxy still not on PATH after install."
      say "  pyenv: run 'pyenv rehash'. pipx: open a new shell ('pipx ensurepath')."
      exit 1; }
    for c in "${NEED_COLS[@]}"; do
      ansible-galaxy collection install "${c%%:*}:${c##*:}" || {
        say "  ERROR: collection install of '${c%%:*}' failed"; exit 1; }
    done
  fi

  head2 "Ensure — done"
  for t in ansible-playbook ansible-lint yamllint; do
    printf '  %-18s %s\n' "$t" "$(have "$t" && echo present || echo 'STILL MISSING')"
  done
  if command -v pyenv >/dev/null 2>&1; then
    say ""
    say "  Installed into pyenv '$(pyenv version-name 2>/dev/null | head -1)'."
    say "  pyenv resolves per-directory, so a project on a DIFFERENT version sees only the shim"
    say "  and the tool dies with 'pyenv: <tool>: command not found'. If that happens there:"
    say "    pyenv local $(pyenv version-name 2>/dev/null | head -1)   # in the project dir"
  fi
  exit 0
fi

if [ "$MISSING" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  # GUARD: do NOT fall through to an upgrade. Silently upgrading a working toolchain can
  # break pinned collection compatibility; that must be an explicit request.
  head2 "Nothing to do"
  say "  All tools already present. Nothing was changed."
  say "  To force an upgrade anyway, run the install step for your installer by hand."
  exit 0
fi

if [ "$INSTALLER" = "none" ]; then
  head2 "Refusing to install"
  say "  A bare 'pip3 install' would target the system interpreter. Modern Debian/Ubuntu/"
  say "  Fedora refuse that (PEP 668), and forcing past it breaks distro-managed packages."
  say ""
  say "  Pick one, then re-run this script:"
  say "    python3 -m venv ~/.venvs/ansible && . ~/.venvs/ansible/bin/activate"
  say "    # or:"
  say "    python3 -m pip install --user pipx && python3 -m pipx ensurepath   # new shell after this"
  exit 2
fi

# ------------------------------------------------------------------------------- plan
head2 "Plan  (installer: $INSTALLER — $INSTALL_CTX)"
if [ "$INSTALLER" = "pip" ]; then
  say "  1. pip3 install --upgrade ${PY_PKGS[*]}"
  if command -v pyenv >/dev/null 2>&1; then
    say "  2. pyenv rehash            # REQUIRED: expose the new console scripts on PATH"
  else
    say "  2. (pyenv not in use — no rehash needed)"
  fi
else
  say "  1. pipx install ansible-core / ansible-lint / yamllint / molecule (one venv each)"
  say "  2. pipx inject ansible-core boto3 botocore jmespath"
  say "     pipx inject molecule 'molecule-plugins[docker]'"
fi
say "  3. ansible-galaxy collection install, version-pinned:"
for c in "${COLLECTIONS[@]}"; do say "       - ${c%%:*} ${c##*:}"; done
say "  4. ansible --version  (verify the config file and collections path in effect)"

if [ "$DRY_RUN" -eq 1 ]; then
  head2 "Dry run — nothing was installed"
  say "  Re-run without --dry-run to apply."
  exit 0
fi

# ---------------------------------------------------------------------------- install
head2 "Installing Python packages"
if [ "$INSTALLER" = "pip" ]; then
  pip3 install --upgrade "${PY_PKGS[@]}"
  if command -v pyenv >/dev/null 2>&1; then
    head2 "pyenv rehash"
    pyenv rehash
    say "  done"
  fi
else
  # Derived from PY_PKGS, never re-typed. A hardcoded copy here drifted out of sync with the
  # pip branch once already: it installed UNBOUNDED versions (ansible-core 2.21, ansible-lint 26)
  # while pip and CI were capped -- the exact "green pipeline, red laptop" skew, self-inflicted.
  for p in "${PY_PKGS[@]}"; do
    case "$p" in
      ansible-core*)
        pipx install "$p" || { say "  ERROR: pipx install '$p' failed"; exit 1; }
        pipx inject ansible-core boto3 botocore jmespath || { say "  ERROR: pipx inject failed"; exit 1; } ;;
      boto3|botocore|jmespath) : ;;                 # injected into ansible-core above
      molecule-plugins*)
        pipx inject molecule "$p" || \
          say "  NOTE: $p not injected — check 'molecule drivers' before using the docker driver" ;;
      *) pipx install "$p" || { say "  ERROR: pipx install '$p' failed"; exit 1; } ;;
    esac
  done
fi

head2 "Installing collections"
if command -v ansible-galaxy >/dev/null 2>&1; then
  for c in "${COLLECTIONS[@]}"; do
    name="${c%%:*}"; ver="${c##*:}"
    ansible-galaxy collection install "${name}:${ver}" --upgrade
  done
else
  say "  ERROR: ansible-galaxy still not on PATH."
  say "  pyenv: run 'pyenv rehash'. pipx: open a new shell (PATH is set by 'pipx ensurepath')."
  exit 1
fi

head2 "Verify"
# Each guarded: a PATH miss must not abort the script before the "Next" instructions.
PATH_HINT="not on PATH — open a new shell (pipx) or run 'pyenv rehash'"
ansible --version      || say "  ansible: $PATH_HINT"
ansible-lint --version || say "  ansible-lint: $PATH_HINT"
yamllint --version     || say "  yamllint: $PATH_HINT"
molecule --version 2>/dev/null || say "  molecule: not on PATH (optional)"

head2 "Next"
say "  Scaffolding templates live in the guideline repo under knowledge/templates/ansible/."
say "  /ansible-implement installs them for you; by hand it is:"
say "    <guideline>/knowledge/templates/ansible/dot-ansible-lint -> .ansible-lint"
say "    <guideline>/knowledge/templates/ansible/dot-yamllint     -> .yamllint"
say "    <guideline>/knowledge/templates/ansible/ansible.cfg      -> ansible/ansible.cfg"
say "    <guideline>/knowledge/templates/ansible/requirements.yml -> ansible/requirements.yml"
say "    <guideline>/knowledge/templates/ansible/scan.yml         -> .github/workflows/ansible-scan.yml"
say "  Then run: $SCRIPT_DIR/verify.sh ansible/"
