---
globs:
  - '**/ansible/**'
  - '**/playbooks/**'
  - '**/roles/**'
  - '**/group_vars/**'
  - '**/host_vars/**'
  - '**/molecule/**'
  - '**/ansible.cfg'
  - '**/site.yml'
  - '**/requirements.yml'
---
# Ansible Rules

The normative list only. Depth — canonical snippets, inventory design, the verify ladder, the review
checklist — lives in `.claude/skills/ansible-engineer/references/`. The globs above stay narrow on
purpose: a bare `**/*.yml` would swallow GitHub Actions, docker-compose and K8s manifests, which have
their own rules.

## Boundary — what Ansible is and is not for
- Ansible **configures** hosts; Terraform **provisions** infrastructure. Never create cloud resources
  from Ansible in a Terraform-first project — send the user to `/iac-implement` instead
- Consume Terraform outputs as run-time inputs (`-e "x=$(terraform output -raw x)"`); never duplicate
  infrastructure state in Ansible variables
- On-prem / non-AWS hosts and in-guest OS config are Ansible's territory

## File Structure
- Project: `ansible/{site.yml,ansible.cfg,requirements.yml,inventory.ini,group_vars/,host_vars/,roles/}`;
  role: `tasks/`, `handlers/`, `templates/`, `files/`, `defaults/`, `vars/`, `meta/` (all `main.yml`)
- Commit the `.example` twins; gitignore the filled `inventory.ini`, `group_vars/all.yml`,
  `group_vars/*/vault`, `.vault_pass*`, `*.retry`

## Modules & Idempotency
- Always **FQCN**: `ansible.builtin.copy`, `amazon.aws.ec2_instance`, `ansible.posix.firewalld`
- Prefer a native module over `command`/`shell`/`raw` — always
- If `command`/`shell` is unavoidable, make it idempotent: `creates:`, `removes:`, or `changed_when:`
  (`changed_when: false` for read-only commands). A bare `changed_when: true` is not a fix — it makes
  the second-run `changed=0` proof impossible
- Never `ignore_errors: true` — define real failure with `failed_when:`
- `state:` is explicit (`present`/`absent`/`started`) even where optional
- Every play, block, and task has a verb-first capitalized `name:`; `snake_case` variables prefixed
  with the role name; booleans `true`/`false`

## Privilege & Security
- `become: true` at the **task** level unless every task in the play needs root
- Secrets: **Secrets Manager / SSM is the default**, per `security.md`. Reach for Ansible Vault only
  where the host has no AWS identity (on-prem / non-AWS) — duplicating a secret into both creates two
  things to rotate. When Vault is right, use the `vars`/`vault` split: `group_vars/<group>/vars`
  references `{{ vault_<name> }}` defined in an encrypted `group_vars/<group>/vault`
- `no_log: true` on any task that *handles* a secret — but never on an `assert`, which would censor
  its own `fail_msg` and report nothing
- Explicit `owner`, `group`, `mode` on every `copy`/`template`/`file`; secrets `0600`; never `0777`
- `validate:` on any task editing a config that can lock you out (`sshd -t -f %s`, `visudo -cf %s`,
  `named-checkconf %s`). The string **must** contain `%s`, and the command must *check* rather than
  apply — `sysctl -p %s` applies, so it is not a validator
- **A confined validator is denied before it parses a line.** `validate:` runs the binary against
  Ansible's staged file under the login user's remote tmp; AppArmor/SELinux profiles usually allow
  only the service's own config dir. On Ubuntu, `chronyd -p -f %s` fails with `Permission denied` on
  a root-owned file read as root — `journalctl -k | grep apparmor` shows
  `apparmor="DENIED" … fsuid=0 ouid=0`. `sshd -t` and `visudo -c` are unconfined and safe; `chronyd`
  and `named` are not. Remedy: validate **after** the write at the file's final path, inside the same
  `block`/`rescue`, before `flush_handlers` — and say that the guarantee is now "a broken config
  never stays", not "never written" (verified on 24.04)
- Pin a `checksum:` on `get_url` (or vendor the file) — an unpinned download is a MITM window
- `host_key_checking` stays **enabled**. In `ansible.cfg`, keep every comment on its **own line**.
  Ansible builds its parser as `ConfigParser(inline_comment_prefixes=(';',))`, so a `;` comment *is*
  stripped — but `#` is **not**: `host_key_checking = True # keep on` yields the literal string
  `'True # keep on'`, and `boolean(value, strict=False)` turns anything unrecognised into **False**,
  silently disabling the very thing the line claims. Verify with **both**
  `ansible-config dump --only-changed` **and** `ansible-config dump --type connection --only-changed`
  — `ssh_args` is connection-*plugin* config and does **not** appear in the first, so a repo can
  print `HOST_KEY_CHECKING = True` while `ssh_args = -o StrictHostKeyChecking=no` turns verification
  off entirely (verified on 2.21)
- **`host_key_checking = True` only enforces the trust you already established — say where it came
  from.** A repo that keeps the setting on and then populates `known_hosts` with bare `ssh-keyscan`
  (or `StrictHostKeyChecking=accept-new`) is trusting whatever answered on port 22, then faithfully
  detecting changes to it. That still catches a *later* substitution, so it is not worthless — what
  it never verified is the key trusted on the **first** connection, which is the moment an
  interceptor would choose. Record where the authoritative fingerprint comes from, over a channel
  independent of SSH — a platform that serves the first-boot log through its control-plane API makes
  this a scripted check authenticated by that platform's own IAM; a platform offering only an
  interactive serial/VNC console makes it a human comparing two strings, which is why it gets
  skipped. Prefer the API form when it exists, and when it does not, write the skip down as a known
  gap rather than letting the `True` imply a guarantee nobody delivered

## Targeting Safety — treat every inventory host as production
- Never `hosts: all`, and never `ansible <pattern> -m <module>` ad-hoc against the fleet
- Always pass an explicit `--limit`; prefer a narrow group over a broad one
- `--check --diff` before any real run; `serial:` for rolling changes across more than one host
- **A `delegate_to: localhost` retry loop must finish inside `ControlPersist`.** Attempts are
  `1 + retries` (`task_executor.py`), so `retries: 6, ConnectTimeout 10, delay 5` is 7×10+6×5 =
  **100s** of sending the host nothing — and at `ControlPersist=60s` the multiplexed master is
  gone before the `rescue` needs it. The rollback then has to open a *new* connection to the host
  that just stopped accepting them. Testing hides this: a dead sshd answers `Connection refused`
  instantly, so only the DROPPED-packet case (wrong `ListenAddress`, `MaxStartups`, hung PAM, a
  firewall change) spends the full timeout. Use `ControlPersist=600s` and assert the budget
- The human runs the playbook. Author, verify, present the diff — then stop

## Multi-OS
- RedHat family is the house default (Rocky 9 / Amazon Linux 2023): `dnf`, `firewalld`, SELinux
- Branch on facts (`ansible_os_family`, `ansible_distribution_major_version`), never on hostnames.
  Guard SELinux checks with `ansible_selinux.status | default('disabled')`. On a host with no
  SELinux python binding the fact is `{'status': 'Missing selinux Python library'}`, and older
  cores set it to the boolean `False` — either way a bare comparison misreads or raises
- Set SELinux context with `sefcontext` + `restorecon` — never disable SELinux to make a task pass
- **Equivalent tools answer differently; a path variable is not a port.** `needs-restarting -r`
  reports through its exit code, `needrestart -b` through stdout — and `needrestart` *restarts*
  services in batch mode unless given `-r l`. Branch, then normalise both branches into the same
  named facts so everything downstream is OS-blind
- **Name a check after the requirement, not the mechanism.** A row called `selinux_persistent`
  reports FAIL on a correct Ubuntu host. The requirement is "mandatory access control is enforcing";
  `mac_persistent` reading `getenforce` *or* `aa-status` means the same thing everywhere
- When a fleet gains an OS family the baseline fails loudly and gets fixed, but the **compliance
  report keeps running and quietly answers nothing** for the new host while still listing it. After
  adding one, read that host's rows and require **zero** `SKIPPED`

## Collections & Versions
- Declare every collection in `requirements.yml` with a version constraint
- Target **ansible-core 2.17+**, and it is a real requirement, not a preference: the pinned
  `amazon.aws >=11,<12` and `community.docker >=5,<6` both declare `requires_ansible: >=2.17.0`
  (`community.general >=10,<11` and `ansible.posix >=2,<3` only need 2.15 — if you ever lower the
  first two floors, re-check whether 2.17 is still required). Keep the local, CI and
  `requirements.yml` floors identical — whichever of the three resolves a different major first is
  where "green pipeline, red laptop" comes from. Single source of truth for the numbers:
  `knowledge/templates/ansible/requirements.yml`
- `include:` was **removed** in 2.16; a playbook using it does not parse. Use `include_tasks`
  (dynamic) or `import_tasks` (static). Prefer `loop:` over `with_*`

## Validation
- After every change: `yamllint` → `--syntax-check` → `ansible-lint --profile production` →
  `--check --diff --limit <host>` → real run twice → (roles) `molecule test`
- **Blocking:** `--syntax-check` and `ansible-lint --profile production`. **Advisory:** `yamllint` as
  a standalone command — but `ansible-lint` embeds yamllint and reports it as `yaml[*]` *errors*, so
  make a yamllint rule advisory via `warn_list` in `.ansible-lint`, not `level:` in `.yamllint`
- Idempotency is proven by a **real** second run reporting `changed=0`. `--check` cannot prove it:
  `command`/`shell` tasks are skipped in check mode
- **Backslashes in a regex depend on the YAML scalar style, and the wrong count fails SILENTLY.**
  Block (`>-`, `|`), single-quoted and plain scalars do **not** process escapes — write `\s`.
  Only double-quoted `"..."` does — there write `\\s`. Most Ansible regexes sit in block scalars,
  so the careful-looking `\\s` is the **broken** one: it reaches the engine as "literal backslash,
  then s" and matches nothing, with no error. The check just goes FAIL while printing a correct
  observed value, so it reads as a host problem (measured on 2.21). Also add `multiline=True` to
  `search`/`match` when the pattern is anchored with `^` and the target is multi-line output —
  Ansible's tests are `re.search` with no flags, so `^` means start-of-string, not start-of-line
- **An `rc` check belongs in `that:`, never in `when:`.** `failed_when: false` on a probe plus
  `when: probe.rc == 0` on the assert means a probe that could not run SKIPS the assert — and a
  skipped assert in a blocking role is a green play that verified nothing. A *report* may answer
  SKIPPED; a *gate* may not. Put `probe.rc | default(1) == 0` inside `that:` with a `fail_msg`
  that distinguishes "could not look" from "looked, and it is wrong"
- **A tool's exit code is often the answer, not an error.** Whitelisting the wrong codes silently
  converts a real finding into a pass, and the two package managers disagree about the *same
  number*: `dnf check-update` returns **100 = updates available**, `apt-get` returns
  **100 = error** (apt-get(8) DIAGNOSTICS: "zero on normal operation, decimal 100 on error").
  Copying dnf's `rc not in [0, 100]` onto apt certifies a host with broken sources as fully
  patched. `aa-status` is the same shape: 0 enabled+policy, **1 not enabled**, **2 no policy** —
  both real answers meaning *non-compliant* — and only 3/4/42 mean "could not look"
- **A `command` skipped by check mode registers `rc: 0`.** Verified on 2.21 — the result is
  `{"rc": 0, "skipped": true, "changed": false}`. So `probe.rc | default(1) == 0` reports success for
  a command that never executed. Any verdict built on a registered `rc` must test `is skipped`
  **first** and report INCONCLUSIVE; never fold a skip into a pass
- `ansible.cfg` is found relative to the **current directory**, not the playbook's. **`cd` into the
  ansible dir** — `ANSIBLE_CONFIG=<dir>/ansible.cfg` loads the file but leaves the relative paths
  inside it (`inventory`, `roles_path`) resolving against the caller's cwd
- **A verdict built on a registered result must survive check mode, and `check_mode: false` is the
  fix — not a `when:` guard.** Read-only probes (`command` that only reads, `uri`, `stat`) should
  carry `check_mode: false` so the gate runs during `--check` too. Gating the assert on
  `not ansible_check_mode` instead produces an approval preview that verifies nothing, which is the
  failure this whole ladder exists to prevent. Keep the `is skipped` test in `that:` as well: it
  costs nothing and it is what catches a probe that could not run for some other reason
- **`in` on `.stdout` is a SUBSTRING test — use `.stdout_lines`.** A script reporting `CHANGED` /
  `UNCHANGED` and a task written `changed_when: "'CHANGED' in result.stdout"` reports **changed on
  every run, forever**, because `'CHANGED' in 'UNCHANGED'` is true. The idempotency proof then
  becomes unobtainable and the cause is invisible. `.stdout_lines` is a list, so `in` is an exact
  element match. Measured on a real run; the same file had already documented the trap in a comment
  and still carried a third instance of it
- **A `notify` fires only in the run that changes the file — so a suppressed restart is forgotten.**
  Once a gated handler declines to restart, every later run sees a converged file, notifies nothing,
  and the service goes on using the old configuration with no record that a restart is owed.
  Re-derive the condition every run instead: compare what is on disk against what the process is
  actually running (for a container, `docker inspect -f '{{range .Config.Env}}...'`). Do **not** use
  mtime — a generator that rewrites the file unconditionally advances mtime on every run, so an
  mtime comparison reports "stale" forever
- **Handlers flush at the END of the play, i.e. AFTER your verification role.** A gate that runs as
  the last `role:` therefore certifies the state the pending restart is about to replace. Put
  `meta: flush_handlers` in `tasks:` and move the gate to `post_tasks:` so it measures what the run
  actually leaves behind
- **Enforce the same checks in CI** (`.github/workflows/ansible-scan.yml`) on every PR touching
  Ansible paths — the local gate alone is not enough
- **A gate never skips because its tool is missing — it installs the tool and runs.**
  `verify.sh` calls `bootstrap-ansible.sh --ensure` (installs only what is absent, never
  `--upgrade`), then runs. If the install is impossible, that is a **FAIL** with the cause, not
  an "inconclusive" shrug a `&&` chain would read as success
- Test presence by **running** the tool (`<tool> --version`), not with `command -v`. Under pyenv the
  shim is on PATH for every interpreter, so `command -v` says yes even when the package lives in a
  different version — the gate then dies with `pyenv: ansible-lint: command not found`, which reads
  as a broken *playbook* rather than a broken toolchain
