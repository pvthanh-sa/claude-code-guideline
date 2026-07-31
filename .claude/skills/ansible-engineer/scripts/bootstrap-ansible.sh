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
#   bootstrap-ansible.sh             # install
#   bootstrap-ansible.sh --check     # report what is present / missing, change nothing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=0
CHECK_ONLY=0

# Self-documenting --help: replay the header comment block, whatever it currently says.
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --check)   CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# ansible-core floor is 2.17, not 2.16: amazon.aws >= 9 and community.general >= 10 both
# declare `requires_ansible: >=2.17`. Pinning 2.16 locally while CI resolves 2.18 is how
# you get a green pipeline and a red laptop.
PY_PKGS=(
  "ansible-core>=2.17"
  "ansible-lint>=25.0"
  "yamllint>=1.35"
  "molecule>=25.0"
  "molecule-plugins[docker]"
  "boto3"        # required by the amazon.aws collection
  "botocore"
  "jmespath"     # required by the json_query filter
)

COLLECTIONS=(
  "amazon.aws:>=9.0.0"
  "community.general:>=10.0.0"
  "ansible.posix:>=2.0.0"
  "community.docker:>=4.0.0"
)

say()   { printf '%s\n' "$*"; }
head2() { printf '\n== %s\n' "$*"; }

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
  if command -v "$t" >/dev/null 2>&1; then
    printf '  %-18s %s\n' "$t" "$("$t" --version 2>/dev/null | head -1)"
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
  pipx install "ansible-core>=2.17"
  pipx inject ansible-core boto3 botocore jmespath
  pipx install "ansible-lint>=25.0"
  pipx install "yamllint>=1.35"
  pipx install "molecule>=25.0"
  pipx inject molecule "molecule-plugins[docker]" || \
    say "  NOTE: molecule-plugins[docker] not injected — check 'molecule drivers' before using it"
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
