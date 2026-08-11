# Verification Chain

The deterministic baseline. AI judgment is best-effort; **these gates are the part that is
reproducible**, so run them and report exactly which ones ran.

## Toolchain status

The Ansible toolchain is **not** part of the pipeline's baseline prerequisites — a Terraform-only
project never needs it, so it is normal for `ansible`, `ansible-lint`, `yamllint` and `molecule` to
all be absent when Stage 3b first runs.

**House rule: a missing tool is installed, not skipped.** A skipped gate produces no evidence, and
"inconclusive" is indistinguishable from "fine" three commits later. `verify.sh` therefore calls
`bootstrap-ansible.sh --ensure` and only then runs the ladder; if the install is impossible it
**FAILS** with the reason.

```bash
# Presence must be tested by RUNNING the tool. Under pyenv the shim is on PATH for every
# interpreter, so `command -v ansible-lint` answers yes even when the package lives in another
# pyenv version -- and the gate then dies with "pyenv: ansible-lint: command not found",
# which reads as a broken playbook instead of a broken toolchain.
have() { command -v "$1" >/dev/null 2>&1 && "$1" --version >/dev/null 2>&1; }
have ansible-lint || "$SKILL_DIR/scripts/bootstrap-ansible.sh" --ensure
```

### Bootstrap

`scripts/bootstrap-ansible.sh` (shipped with this skill) installs the chain. Preview first:

```bash
"${CLAUDE_SKILL_DIR:-.claude/skills/ansible-engineer}"/scripts/bootstrap-ansible.sh --dry-run
"${CLAUDE_SKILL_DIR:-.claude/skills/ansible-engineer}"/scripts/bootstrap-ansible.sh
```

Why pip and not the distro package: apt's `ansible-lint` is 6.17, which predates the profile system
(`--profile production`). pip gets 25.x. Molecule is not packaged at all.

The script picks its install target in this order — **read the `--dry-run` output before running it
for real**, because the choice matters:

1. an already-active virtualenv or pyenv (`pip3 install --upgrade`, then `pyenv rehash` if pyenv is
   in use — without the rehash the shims never expose the new binaries, which is the most common
   "I installed it but it's not found" failure)
2. otherwise `pipx`, one isolated venv per tool
3. never a bare `pip3 install` into a system interpreter — modern Debian/Ubuntu/Fedora refuse it
   (PEP 668 `externally-managed-environment`), and forcing past that breaks distro packages

## The ladder — light to heavy

Run in order; stop at the first failure, fix, restart from the top.

| # | Command | Catches | Blocking? |
|---|---------|---------|-----------|
| 1 | `yamllint .` | Indentation, truthy (`yes` vs `true`), trailing whitespace, line length | advisory¹ |
| 2 | `ansible-playbook site.yml --syntax-check` | Unknown module, bad parameters, missing includes | **blocking** |
| 3 | `ansible-lint --profile production` | FQCN, unnamed tasks, missing `changed_when`, risky permissions | **blocking** |
| 4 | `ansible-playbook site.yml --check --diff --limit <host>` | What would actually change; config drift | **blocking (review the diff)** |
| 5 | run **for real** twice against one host | Idempotency — second run must report `changed=0` | **blocking** |
| 6 | `molecule test` (roles) | Full create → converge → idempotence → verify → destroy | see below — **not enforced by `verify.sh`** |

**Gate 6 is the one gate no script can enforce, and the table used to claim otherwise.** It read
"blocking for shared roles" while `verify.sh` neither ran it nor mentioned it unless a scenario
already existed — so a repo of shared roles with no scenario got silence, and silence reads as
"nothing to do". `verify.sh` now emits a **WARN** when `roles/` exists and no `molecule/` does.

WARN rather than FAIL, because plenty of roles genuinely cannot be container-tested and saying
otherwise would train people to ignore the gate. Two honest outcomes, and picking one is the work:

- **Add a scenario** — worth it for roles that configure the OS itself (packages, users, files,
  services, firewall) and especially for **multi-OS branches**, where the container *is* the host
  you do not otherwise have. A `platforms:` list runs the same role against Rocky and Ubuntu in
  one command; that is the only cheap way to keep a Debian branch honest.
- **Record why not, in the role's README** — a role that needs a cloud identity, a private
  registry, or a live application to answer is not testable in a container. Mocking all of that
  tests the mocks. Write that down; an unexplained absence is indistinguishable from an oversight.

**Fidelity limits, so the result is not over-read.** A container shares the host kernel, so
`sysctl` tunables often are not namespaced — the assertion either fails or, worse, passes against
the *host's* value. systemd needs a systemd-enabled image running `privileged`, which is a real
security trade-off. Neither makes molecule useless; both mean gate 6 narrows what gate 5 has to
find, and never replaces it.

¹ **"Advisory" only as a standalone command.** `ansible-lint` embeds yamllint and reports its
problems as `yaml[<rule>]` violations, reading your `.yamllint` when one exists — and under the
production profile those are *errors*. The `level: warning` you set in `.yamllint` does **not** carry
over. To make a rule genuinely advisory, add it to `warn_list` in `.ansible-lint`
(e.g. `- yaml[line-length]`).

> **A skipped `command` looks like a successful one.** In check mode the registered result is
> `{"rc": 0, "skipped": true, "changed": false}` — `rc` is **0**, not absent. So the natural guard
> `probe.rc | default(1) == 0` prints OK for a command that never ran. Test `is skipped` first:
> ```yaml
> verdict: "{{ 'INCONCLUSIVE (check mode)' if probe is skipped
>              else ('OK' if probe.rc == 0 else 'FAIL') }}"
> ```
> This bites hardest inside a `rescue:` that verifies a rollback — the one place a false green costs
> the most.

> **Check mode cannot prove idempotency.** In `--check`, `command`/`shell` tasks are *skipped*, not
> executed — precisely the task class that breaks idempotency is invisible. Meanwhile tasks gated on
> data a skipped task would have produced report false `changed`. So gate 5 must be a **real** run:
> apply once, then run again and require `changed=0`.

`scripts/verify.sh` runs gates 1–4. It installs any missing tool first, so no gate is skipped for a
toolchain reason. Its contract:

| Exit | Meaning |
|------|---------|
| `0` | every gate ran and passed |
| `1` | a gate FAILED, **or** a required tool could not be installed |
| `2` | bad usage — including "`--limit` missing and `--no-diff` not given" |
| `3` | PARTIAL: gates 1–3 passed, gate 4 waived with `--no-diff` |

`--limit <host>` is **required** unless you pass `--no-diff`. Gate 4 is blocking and needs a real
host, which a script cannot invent — so waiving it has to be a deliberate flag, never a default.
Gates 5–6 need a live target or a container; the script points at them instead of faking a result.

> **`ansible.cfg` is found relative to your current directory, not the playbook's.** Running
> `ansible-playbook ansible/site.yml` from the repo root silently ignores `ansible/ansible.cfg` —
> including its `inventory`, `roles_path`, and `host_key_checking` settings. **`cd` into the Ansible
> directory first.** `ANSIBLE_CONFIG=ansible/ansible.cfg` loads the file but does *not* fix the
> relative paths inside it, so `inventory = inventory.ini` still resolves against the repo root.
> `verify.sh` does the `cd` for you.

## `validate:` is a gate that a second OS family can silently remove

`validate:` runs its binary against Ansible's **staged** file, under the login user's remote tmp.
AppArmor and SELinux profiles typically permit the service to read only its own config directory, so
on a confined binary the kernel refuses the open before a single line is parsed:

```
fatal: [ubuntu-host]: FAILED! => msg: failed to validate
  stderr: Could not open /home/svc/.ansible/tmp/ansible-tmp-*/.source.conf : Permission denied
$ journalctl -k | grep apparmor
apparmor="DENIED" operation="open" profile="/usr/sbin/chronyd" … requested_mask="r" fsuid=0 ouid=0
```

Root-owned, read as root, denied — `fsuid=0 ouid=0` is the tell, and `chmod` will not help. The
module reports the symptom of the wrong subsystem, which is what makes it expensive.

`sshd -t` and `visudo -c` are unconfined on both families, so the two validators that matter most are
safe. `chronyd` and `named` are not. The fix that keeps a real gate is a **post-write** validator
reading the file at its final path, inside the same `block`/`rescue`, ordered before
`flush_handlers` — see `patterns.md` for the task, including why it needs `check_mode: false`.
Verified on Ubuntu 24.04, 2026-08-01.

## Verifying effective state — three traps

`sshd -T`, `firewall-cmd --list-all`, `getenforce` are the right sources: they are the daemon's own
resolved view, not a grep of the file you just wrote. But parsing them has sharp edges.

**1. `sshd -T` normalises multi-value keywords to one line per value.** A drop-in containing
`AllowGroups fleetmanaged fleetauto` is reported as *two* lines. Taking the first match sees one
group and fails the assert on a correct host — a gate that cries wolf, which is how gates stop being
trusted. Collect every matching line, then flatten:

```yaml
_allowgroups: >-
  {{ sshd_t.stdout_lines | select('match', '^allowgroups ')
     | map('regex_replace', '^allowgroups\s*', '')
     | map('split') | flatten | list }}
```

**2. `| first | default(...)` hides an empty result.** When nothing matched, the default is parsed as
if it were real output and the assert reports a plausible-looking wrong value instead of "not set".
Assert `| length > 0` separately so "absent" and "wrong" are distinguishable.

**3. Drop-in order is the whole point — verify it, don't assume it.** On Rocky 9 a stock
`50-cloud-init.conf` ships `PasswordAuthentication yes`. A baseline file named `00-…` wins because
sshd applies first-value-wins in lexical order. Grepping the config directory finds *both* lines and
proves nothing; only `sshd -T` says which one is in force.

## The rules that matter in `ansible-lint`

Learn the IDs — they are the shorthand you'll see in output and CI:

| Rule | Meaning | Fix |
|------|---------|-----|
| `name[missing]` / `name[casing]` | Task has no name, or doesn't start capitalized | Add a verb-first capitalized `name:` |
| `fqcn[action-core]` | Short module name | `copy` → `ansible.builtin.copy` |
| `no-changed-when` | `command`/`shell` with no change semantics | Add `changed_when:` / `creates:` |
| `command-instead-of-module` | A native module exists | Use it |
| `command-instead-of-shell` | `shell` used with no shell features | Use `command` |
| `risky-file-permissions` | `mode` not set on a file-creating task | Set `mode:` explicitly |
| `risky-shell-pipe` | Pipe in `shell` without `pipefail` | `set -o pipefail` or restructure |
| `ignore-errors` | `ignore_errors: true` | Use `failed_when:` |
| `no-log-password` | Password-ish variable without `no_log` | Add `no_log: true` |
| `package-latest` | `state: latest` | Pin, or accept deliberately |
| `var-naming` | Not `snake_case`, or unprefixed in a role | Rename with the role prefix |

> **Read the exit code, not the summary line.** With anything in `warn_list`, ansible-lint still
> prints `WARNING  Listing N violation(s) that are fatal` and ends with
> `Profile 'production' was required, but 'moderate' profile passed. Rating: 2/5 star` — while
> **exiting 0**. Both lines read like failure and neither is. The gate is `$?`; the star rating is
> capped by the mere presence of a warn-listed rule and says nothing about whether you passed.

Configure once in `.ansible-lint` (template: `knowledge/templates/ansible/dot-ansible-lint` in the
guideline repo; `/ansible-implement` copies it into the project) rather than sprinkling `# noqa` in
tasks. When a skip is genuinely warranted, justify it inline:
```yaml
  # noqa: command-instead-of-module — swanctl has no module; guarded by changed_when
```

## Check mode caveats

`--check` doesn't execute changes, which means dependent tasks can fail on data that "would have"
existed. Two escape hatches:

```yaml
- name: Read the current version                  # safe to really run
  ansible.builtin.command: /opt/app/bin/version
  register: ver
  changed_when: false
  check_mode: false          # force real execution even in check mode

- name: Deploy from that version
  ansible.builtin.template:
    src: app.conf.j2
    dest: /etc/app.conf
    mode: '0644'
  when: ver.stdout is defined
```

`--diff` is what makes check mode useful — it shows the line-level change. Always pair them.

## Molecule (role testing)

```bash
molecule init scenario                         # inside roles/<role>/ — creates molecule/default/
molecule converge                              # apply into a container, iterate
molecule idempotence                           # the assertion that matters most
molecule verify                                # run verify.yml assertions
molecule test                                  # full cycle, destroys at the end
```

**Four things that stop a scenario before it tests anything. All measured on molecule 26.6.**

- **`--driver-name` is gone** from `molecule init scenario`, and `molecule drivers` lists `docker`
  only when `molecule-plugins[docker]` is installed. Check with `molecule drivers` first.
- **`meta/main.yml` needs `namespace:` and `role_name:`.** ansible-compat runs before anything else
  and derives the fully-qualified role name from the directory; without them it aborts with
  `InvalidPrerequisiteError`. Nothing is published to Galaxy — the fields exist so the gate runs.
- **molecule no longer puts the role's parent directory on the search path.** `include_role` then
  fails with "not found" while printing a plausible-looking list that simply omits `roles/`. Set
  `provisioner.env.ANSIBLE_ROLES_PATH: ${MOLECULE_PROJECT_DIRECTORY}/..`.
- **A nested `ansible-playbook` inherits molecule's `ANSIBLE_CONFIG` and `ANSIBLE_ROLES_PATH`.** If
  a scenario shells out to test a real playbook, pin both in the task's `environment:` or it runs
  against the scenario's configuration while appearing to test the repo's.

- **Give the platforms a named group and target that, not `hosts: all`.** The CI targeting-safety
  gate greps every playbook for `hosts: all` and does **not** special-case `molecule/` — a scenario
  written the conventional way fails the PR. That is deliberate: a grep-based guard with exceptions
  is one people learn to route around, and `groups: [<name>]` on the platform plus `hosts: <name>`
  in converge/prepare/verify costs one line. Molecule's own create/destroy playbooks target
  localhost and are unaffected.

**And two that make a container lie rather than fail.**

- **`sudo` can be broken in a base image** (PAM account management fails even as root). Ansible
  reports `Module result deserialization failed: No start of json char found`, because sudo writes
  the real reason to stderr and the module emits no JSON at all. The visible error names the
  symptom; `docker exec <c> sudo -n true` names the cause.
- **A `prepare.yml` is the honest place for container-only repairs** — package caches, sudo, stale
  repo metadata. Keep it to things a managed host genuinely supplies. If a fix ever has to move
  from `prepare.yml` into the role, that is a finding about the role.

**What a multi-OS scenario is actually for.** `platforms:` runs the identical role against Rocky and
Ubuntu in one command, which is the only cheap way to keep a second OS branch honest — a branch
written without a host to run it on is how most of them ship with a bug. It cuts both ways: on the
first real run of `fleet_web_witness` the *unproven* Debian branch passed and the *proven* RedHat
one failed, because its SELinux handler branched on `os_family == 'RedHat'` instead of on whether
SELinux is enforcing, and `restorecon` does not exist on a host with SELinux off.

> **Check the driver against your installed molecule version before copying any tutorial.** The
> docker driver was moved out of molecule core into the separate `molecule-plugins[docker]` package,
> and the `molecule init scenario --driver-name <x>` flag was dropped along with it — the driver is
> now declared in `molecule/default/molecule.yml`. Run `molecule --version` and
> `molecule drivers` first; if `docker` is not listed, either install `molecule-plugins[docker]` or
> use `driver: {name: default}` with `create.yml`/`destroy.yml` playbooks built on `community.docker`.

Use a RedHat-family image to match the real target (Rocky 9 / AL2023). Note that testing systemd
services in Docker needs a systemd-enabled image and elevated privileges — that is a real trade-off,
not a detail to hide. Prefer testing the config-rendering tasks in molecule and validating service
behavior on a real staging host with `--check --diff`.

## CI gate

`knowledge/templates/ansible/scan.yml` (guideline repo) → copy to
`.github/workflows/ansible-scan.yml`. `/ansible-implement` installs it for you.

It mirrors the two-tier doctrine already used for Terraform: advisory reporters plus one blocking
gate, path-filtered so unrelated PRs don't pay for it.

- `yamllint` + `--syntax-check` — run, report, do not fail the build
- `ansible-lint --profile production` — **fails the build on errors**
- Path filter: `ansible/**`, `roles/**`, `playbooks/**`, `group_vars/**`, `host_vars/**`,
  `requirements.yml`

The local gate alone is not enough — CI is the defense-in-depth copy.

## Reporting honestly

When you present verification results, say which gates ran:

```
Gates: yamllint ✓ · syntax-check ✓ · ansible-lint ✓ (production, 0 errors)
       --check --diff ✓ (limit: web-stg-1, 3 changed)
       second run ✓ (changed=0 — idempotent)
       molecule ⚠ SKIPPED (not installed)
```

Never write "all checks passed" when a tool was absent.
