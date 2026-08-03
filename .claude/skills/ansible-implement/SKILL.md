---
name: ansible-implement
description: 'Stage 3b of the DevOps pipeline — the configure sibling of /iac-implement. Turn a spec, an ops runbook, or an existing bash script into an idempotent Ansible role/playbook: maps every step to a native module, scaffolds the role + inventory + group_vars/vault with committed .example twins, wires Terraform outputs in as run-time inputs, installs the CI gate, runs the deterministic verify ladder, and STOPS at human gate G3b with a reviewed --check --diff. Never runs a playbook against a host, never provisions cloud infrastructure.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: '[source: spec|runbook|bash-script] [target-ansible-dir]'
---

# Ansible Implement — Stage 3b (Configure gate)

Turn an approved source of truth into idempotent Ansible. This is the configuration-management
sibling of Stage 3: `/iac-implement` provisions with Terraform, this configures what runs inside.
In the pipeline it sits after the human has applied the Terraform plan and before `/infra-review`:

```
G3 /iac-implement → [you run terraform apply] → G3b /ansible-implement → G4 /infra-review → G5 → G6
```

> **Human gate G3b:** this skill produces role/playbook code plus a reviewed `--check --diff` and
> then **STOPS**. It never executes a real run against a host, never `git commit`s, and never
> provisions cloud resources.

> **Terraform provisions, Ansible configures.** If the source asks for cloud resources (VPC, EC2,
> RDS, IAM), that belongs in `/iac-implement`, not here. Say so and stop rather than writing
> `amazon.aws.ec2_instance` into a Terraform-first project.

> **Every inventory host is production until proven otherwise.** An inventory typically reaches
> prod, staging and demo through the same `~/.ssh/config`, and an alias rarely says which it is. No
> `hosts: all`; always an explicit `--limit`; `--check --diff` before anything real.

**Source** (`$1`) is one of:
- a spec (`docs/specs/<name>.spec.md`) — its §"deferred to configuration management" section
- an ops runbook (`docs/runbooks/*.md`) — numbered manual steps; the richest source
- a bash script (`host-config/*.sh`, `user-data.sh`) — convert command-by-command

**Target** (`$2`) defaults to `ansible/` at the project root.

Conventions, patterns, and the review criteria live in the `ansible-engineer` skill — read
`references/conventions.md` and `references/patterns.md` there rather than re-deriving them.

---

## Phase 0: Preflight

### 0.1 Resolve the guideline repo

This skill is symlinked into `~/.claude/skills/`, so a bare relative path like
`knowledge/templates/ansible/…` would resolve inside whatever project is open and silently find
nothing. Resolve the real location first (same mechanism as `/iac-implement` Phase 3.5):

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/ansible-implement}" 2>/dev/null)"
GUIDELINE="$(dirname "$(dirname "$(dirname "$SK")")")"
# GUARD: a copied-not-symlinked skill (or a moved repo) resolves $GUIDELINE wrong. Every template
# copy below would then be a "cp: cannot stat" and the project would be left half-scaffolded.
test -d "$GUIDELINE/knowledge/templates/ansible" || {
  echo "ERROR: templates not found at '$GUIDELINE/knowledge/templates/ansible' (resolved from '$SK')."
  echo "  /ansible-implement must be SYMLINKED from the guideline repo, not copied (Guide §1.1)."
  exit 1
}

# The helper scripts ship with the ansible-engineer skill. Prefer the project's own copy (installed
# by /init-project) and fall back to the guideline repo when the project has not been initialized.
AE="$GUIDELINE/.claude/skills/ansible-engineer"
[ -d .claude/skills/ansible-engineer ] && AE=".claude/skills/ansible-engineer"
echo "  templates: $GUIDELINE/knowledge/templates/ansible"
echo "  scripts:   $AE/scripts"
```

### 0.2 Make the toolchain runnable — install it, do not plan around it

The Ansible toolchain is not part of the pipeline baseline, so it is normally absent on the first
run. **Install it now rather than letting the verify gates skip later.** A gate that never ran
produces no evidence, and "inconclusive" is indistinguishable from "fine" a week later.

```bash
# Presence = the tool RUNS. `command -v` is a false positive under pyenv: the shim is on PATH for
# every interpreter, so it answers yes even when the package lives in a different pyenv version --
# and the gate then dies with "pyenv: ansible-lint: command not found", which reads as a broken
# PLAYBOOK rather than a broken toolchain.
have() { command -v "$1" >/dev/null 2>&1 && "$1" --version >/dev/null 2>&1; }
for t in ansible ansible-playbook ansible-lint yamllint; do
  printf '  %-18s %s\n' "$t" "$(have "$t" && "$t" --version 2>/dev/null | head -1 || echo MISSING)"
done

# Show the plan, then install only what is missing (never --upgrade a working pin).
"$AE/scripts/bootstrap-ansible.sh" --dry-run
"$AE/scripts/bootstrap-ansible.sh" --ensure
```

If the install is impossible (no virtualenv, no pyenv, no pipx — `--ensure` exits 2 and prints the
two commands that fix it), say so plainly and **stop before promising any verification**. Authoring
can continue, but the G3b report must state that no gate ran and why.

### 0.3 Detect the project shape so you extend rather than reinvent

```bash
ls -d ansible roles playbooks group_vars host_vars 2>/dev/null
test -f ansible/ansible.cfg && cat ansible/ansible.cfg
test -f ansible/requirements.yml && cat ansible/requirements.yml
grep -rn 'ansible' .gitignore 2>/dev/null    # inherit the existing ignore convention
```

> If an `ansible/` tree already exists, **match its conventions** — inventory format, group naming,
> vault layout. Do not impose a different layout on an existing project.

### 0.4 Prove you can reach a target — before authoring, not after

Gate 4 (`--check --diff`) is blocking and needs a live host. Discovering at the end that nothing is
reachable means the whole stage lands on PARTIAL and the work has to be redone once the fleet is up.
**A provider API saying `running` is not reachability** — an instance can be `active/running/ok` in
the provider's console while the guest never finished booting.

```bash
# One host is enough to answer the question. Replace with a real target from the inventory.
ssh -i <key> -o BatchMode=yes -o ConnectTimeout=8 <user>@<host> true && echo "reachable" \
  || echo "NOT reachable — gate 4 cannot run"
```

If nothing is reachable, say so **now** and agree what happens: author anyway and land on PARTIAL
(exit 3, G3b unsatisfied), or stop until the fleet is fixed. Do not discover it at gate 4.

A useful discriminator when a host answers the provider API but not SSH: test **both address
families**. An ISP or transit block hits one family; a guest that never booted is silent on both.

---

## Phase 1: Read the source and build a step→module map

Read `$1` completely first. Then produce a table — this is the artifact you show the user before
writing any YAML, because it is where the real engineering judgment lives:

| # | Source step | Native module | Idempotency mechanism | Notes |
|---|-------------|---------------|-----------------------|-------|
| 1 | `dnf install strongswan` | `ansible.builtin.dnf` | built-in (`state: present`) | RedHat family |
| 2 | write `/etc/sysctl.d/99-x.conf` | `ansible.builtin.template` | built-in (content compare) | no `validate` exists for sysctl.d — `sysctl -p` *applies*, it does not check; reload gated on the template's result |
| 3 | `systemctl enable --now frr` | `ansible.builtin.systemd_service` | `enabled: true, state: started` | |
| 4 | `swanctl --load-all` | `ansible.builtin.command` | `changed_when` on output | no module exists — justify inline |
| 5 | `curl -o /etc/pki/rds.pem https://…` | `ansible.builtin.get_url` | `checksum:` pinned | or vendor into `files/` |

Rules for the mapping:
- **A native module beats `command` every time.** Only when no module exists does `command` survive
  the mapping — and then it carries `creates:`/`removes:`/`changed_when:` and an inline justification.
  `changed_when: true` is not an idempotency mechanism; it guarantees the second-run `changed=0`
  proof can never pass.
- Secrets in the source (PSKs, passwords, keys) become `vault_*` variables — never literals.
- Values that come from infrastructure become **run-time inputs from Terraform outputs**, not
  hardcoded values (see Phase 2.3).
- Note OS-family divergence as you go. RedHat family (Rocky 9 / Amazon Linux 2023) is the house
  default: `dnf`, `firewalld`, SELinux. Watch for path differences — e.g. strongSwan on Rocky 9 uses
  `/etc/strongswan/swanctl/`, not `/etc/swanctl/`.
- Anything in the source that is a *human decision* (approve, verify visually, call a vendor) stays
  in the runbook. Flag it as "not automatable" rather than faking it.

Present the table and get agreement on the mapping before Phase 2.

---

## Phase 2: Scaffold

### 2.1 Layout

```bash
ROLE=<role-name>
mkdir -p ansible/roles/$ROLE/{tasks,handlers,templates,files,defaults,vars,meta}
mkdir -p ansible/group_vars/<group>
```

Write, in this order: `defaults/main.yml` (the public interface) → `vars/main.yml` (internals, and
per-OS files `vars/RedHat.yml` / `vars/Debian.yml`) → `tasks/main.yml` (thin, `import_tasks` per
concern) → the concern files → `handlers/main.yml` → `templates/*.j2` → `meta/main.yml`.

Every task: FQCN, verb-first capitalized `name:`, explicit `state`, explicit `owner/group/mode`,
task-scoped `become: true`, `validate:` on any config that can lock you out or break the service.

### 2.2 Inventory and secrets — `.example` twins are committed, real files are not

```bash
# Committed
ansible/inventory.ini.example
ansible/group_vars/all.yml.example
# Gitignored (real values + secrets)
ansible/inventory.ini
ansible/group_vars/all.yml
ansible/group_vars/<group>/vault
```

Append the gitignore block if it is not already there — the canonical list is
`$GUIDELINE/knowledge/templates/ansible/gitignore-snippet.txt`. Match the project's existing wording,
and remember `.gitignore` has **no inline comments**: a trailing `# …` becomes part of the pattern
and silently makes it match nothing.

Secrets use the `vars`/`vault` split: `group_vars/<group>/vars` holds
`db_password: '{{ vault_db_password }}'`; `group_vars/<group>/vault` holds the real value and is
encrypted with `ansible-vault encrypt`. Consuming tasks carry `no_log: true`.

> **When Terraform is in play, Secrets Manager / SSM is the source of truth** (`rules/security.md`).
> Vault is for hosts with no AWS identity. Do not copy a secret into both — that is two things to
> rotate and one of them will be missed.

### 2.3 The Terraform seam

Infrastructure values arrive at run time and are never committed:

```bash
TF_ENV=<path-to-terraform-env>
ansible-playbook site.yml --limit <group> \
  -e "aws_tunnel_ip=$(terraform -chdir=$TF_ENV output -raw tunnel1_address)" \
  -e "vpn_psk=$(terraform -chdir=$TF_ENV output -raw tunnel1_psk)" \
  --check --diff
```

Guard them so a missing output fails loudly instead of templating an empty string:

```yaml
- name: Assert required Terraform inputs are present
  ansible.builtin.assert:
    that:
      - aws_tunnel_ip is defined and aws_tunnel_ip | length > 0
      - vpn_psk is defined and vpn_psk | length > 0
    fail_msg: 'Missing Terraform outputs — pass them with -e'
    quiet: true
```

> **No `no_log:` on that assert.** `no_log` censors the whole task result including `fail_msg`, so
> the guard would fail with `output has been hidden` and tell the operator nothing. It is also
> unnecessary — `assert` reports the failing expression, never the variable's value.

### 2.4 Supporting files

Copy from the guideline templates, never overwriting silently:

```bash
copy_tpl() {  # copy_tpl <template-name> <dest>
  SRC="$GUIDELINE/knowledge/templates/ansible/$1"
  if   [ ! -f "$SRC" ]; then echo "WARN: template missing upstream: $1"
  elif [ ! -f "$2" ];   then mkdir -p "$(dirname "$2")"; cp "$SRC" "$2"; echo "created  $2"
  elif ! cmp -s "$SRC" "$2"; then echo "EXISTS (differs from template — diff and ask): $2"
  else echo "ok       $2 (current)"; fi
}
copy_tpl ansible.cfg      ansible/ansible.cfg
copy_tpl requirements.yml ansible/requirements.yml
copy_tpl dot-ansible-lint .ansible-lint
copy_tpl dot-yamllint     .yamllint
copy_tpl dot-yamllint     ansible/.yamllint     # see the note below — NOT a duplicate by accident
copy_tpl scan.yml         .github/workflows/ansible-scan.yml
```

> **Why `.yamllint` twice.** `ansible-lint` finds `.ansible-lint` by walking parent directories,
> but its *embedded* yamllint reads only **cwd** (`_yamllint_config_locations()` — `.yamllint`,
> `.yamllint.yaml`, `.yamllint.yml`, `$YAMLLINT_CONFIG_FILE`, `$XDG_CONFIG_HOME`; no parent walk).
> Everything that lints runs from inside the Ansible dir (`verify.sh`, the CI gate, Phase 3), so a
> root-only `.yamllint` is silently ignored there and yamllint's *built-in* defaults apply instead —
> `line-length` 160 and `document-start` disabled rather than your 120/error. Same rule ID, two
> rulesets, and the stricter one only ever runs in the PostToolUse hook. Keep both copies in sync,
> or set `YAMLLINT_CONFIG_FILE` explicitly.

`.ansible-lint` is not optional decoration: the PostToolUse lint hook stays silent until it exists,
because without it yamllint falls back to defaults (`line-length: 80`, everything an error) and
every greenfield file would come back covered in noise.

The CI gate mirrors the Terraform one — advisory `yamllint`, blocking `--syntax-check` +
`ansible-lint --profile production`, plus grep-level targeting-safety checks. Tell the user to mark
`ansible-scan` **Required** in branch protection. Details and tuning:
`$GUIDELINE/knowledge/templates/ansible/README.md`.

---

## Phase 3: Verify (deterministic gates)

```bash
"$AE/scripts/verify.sh" ansible/ --limit <single-host>   # the full ladder
# no host reachable yet? waive gate 4 EXPLICITLY — it still exits 3, never 0:
"$AE/scripts/verify.sh" ansible/ --no-diff
```

`--limit` is required unless you pass `--no-diff`; the script refuses to guess (exit 2). Exit codes:
`0` every gate ran and passed · `1` a gate FAILED or a tool could not be installed · `2` bad usage ·
`3` **PARTIAL** — gates 1–3 passed but gate 4 was waived. **Never report 1, 2 or 3 as a pass**, and
never report 3 as satisfying G3b.

Or step by step. **Use `if`/`else`, never `cmd && tool || echo SKIPPED`** — in that form a *failing*
tool also triggers the `||`, so a broken blocking gate silently reports as "SKIPPED":

```bash
# GUARD: distinguish three outcomes — passed, FAILED, and not-installed.
# cd, don't export ANSIBLE_CONFIG: the env var loads the file but leaves the relative paths inside
# it (inventory, roles_path) resolving against the caller's cwd.
cd ansible || exit 1

if command -v yamllint >/dev/null 2>&1; then
  yamllint . || echo 'WARN: yamllint findings (advisory)'
else echo 'SKIPPED: yamllint not installed'; fi

if command -v ansible-playbook >/dev/null 2>&1; then
  ansible-playbook site.yml --syntax-check || echo 'FAILED: syntax-check (blocking)'
else echo 'SKIPPED: ansible-playbook not installed'; fi

if command -v ansible-lint >/dev/null 2>&1; then
  ansible-lint --profile production . || echo 'FAILED: ansible-lint (blocking)'
else echo 'SKIPPED: ansible-lint not installed — the blocking gate did not run'; fi
```

`ansible-lint --profile production` is the blocking gate. Fix every error; re-run from the top.
Record which gates were skipped — never present a skipped gate as a pass.

---

## Phase 3.5: Dry run with an explicit limit

```bash
# GUARD: --limit is mandatory. One host first, never a whole group, never 'all'.
cd ansible && ansible-playbook site.yml --limit <single-host> --check --diff
```

Read the diff line by line. Idempotency is proven later by applying for real and running **for real
again** — the second real run must report `changed=0`. A second `--check` does **not** prove it:
check mode skips `command`/`shell`, which is exactly the task class that breaks idempotency.

If the target host is unreachable (no inventory yet, no VPN, no bastion session), say so plainly —
authoring is complete but **G3b is not satisfied without a diff**. Offer `molecule converge` against
a container as substitute evidence, and label it as such.

---

## Phase 4: STOP at Gate G3b

Present, in the user's language:

1. **What was created** — file tree with one-line purposes
2. **The step→module map** from Phase 1, with any step that stayed `command`/`shell` and why
3. **Gate results** — which ran, which were skipped and why
4. **The `--check --diff` output** — what would change on which host
5. **Not automatable** — steps left in the runbook for a human
6. **Secrets** — which variables are vaulted, which come from Terraform, what the user must fill in
7. **Residual risk** — blast radius, anything unverified

```
👉 What would you like to do:
   [a] Approve — YOU run it, one host, then paste the output back:
         cd ansible && ansible-playbook site.yml --limit <host> --diff
         cd ansible && ansible-playbook site.yml --limit <host> --diff   # again: must be changed=0
       I'll read both runs and confirm (or disprove) idempotency.
   [b] Adjust the role first (tell me what to change)
   [c] Only fill in the inventory/vault values, then re-diff
   [d] Stop here — keep the code, no execution
(I do NOT execute a playbook against any host, commit, or push. The irreversible step is yours,
 exactly as `terraform apply` is at G3.)
```

> **Hand-off:** the review pass is `/infra-review` at gate **G4** — the same review gate Terraform
> uses. It detects the Ansible tree and fans out the `ansible-reviewer` agent alongside the security
> auditor; in a mixed repo it reviews both stacks in one report. There is no separate Ansible review
> gate.

---

## Note: authoring is not proof

A generated role that lints clean is **not** a working role. The deterministic evidence is the
`--check --diff` plus a clean second real run; everything before that is plausible-looking YAML. Say
this honestly when presenting, and never describe an unexecuted role as "working" — the accurate
words are "authored and lint-clean".
