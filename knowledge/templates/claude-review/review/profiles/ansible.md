# Profile: Ansible

> Kit-owned. Globs: `ansible/**`, `**/playbooks/**`, `**/roles/**`, `**/group_vars/**`,
> `**/host_vars/**`, `**/inventory*`, `ansible.cfg`, `requirements.yml`.
> `ansible-lint --profile production` may run in CI — do not re-list what it reports.

## Idempotency — the second run must report `changed=0`
- `command`/`shell`/`raw` without `creates:`, `removes:`, or a meaningful `changed_when:` — reports
  changed every run. `changed_when: true` is not a fix. Read-only probes need `changed_when: false`.
- A native module exists for what the `shell:` does (package, service, file, lineinfile, user,
  firewalld, sysctl, systemd) — prefer it.
- `changed_when: "'CHANGED' in result.stdout"` — `in` on a **string** is a substring test;
  `'CHANGED' in 'UNCHANGED'` is true → changed forever. Use `result.stdout_lines`.
- Templates rendering non-deterministic content (timestamps, unordered dict iteration, random) →
  file changes every run → handler restarts every run.

## Check mode & verification gates
- A probe (`command` that only reads, `uri`, `stat`) whose result feeds an `assert` must carry
  `check_mode: false`, or `--check` skips it and the assert verifies nothing.
- A skipped `command` registers `rc: 0` — `probe.rc | default(1) == 0` passes for a command that
  never ran. Test `probe is skipped` first.
- `rc` checks belong in `that:`, not in `when:` on the assert (a probe that could not run would
  SKIP the gate → green play that verified nothing).
- A `check_mode: false` probe that calls a file the same run installs → fails `rc 127` on the very
  first `--check`.
- `until:` retry loops that wait for success instead of a terminal state; retry budgets that
  outlast `ControlPersist` when delegated to localhost (attempts = `1 + retries`).
- Verification placed in the last role while handlers flush at end of play → it certifies the
  pre-restart state. Needs `meta: flush_handlers` before it.

## Secrets & privilege
- Secrets in plain vars, defaults, inventory, or templates in git — must come from Secrets
  Manager/SSM lookup or Ansible Vault (`vars`/`vault` split).
- Task handling a secret without `no_log: true` — but **never** `no_log` on an `assert` (it hides
  its own `fail_msg`).
- `become: true` at play level when only some tasks need root; `become_user` broader than needed.
- `copy`/`template`/`file` without explicit `owner`, `group`, `mode`; secrets not `0600`; any
  `0777`; `mode` as an unquoted octal-looking number (`mode: 644` is decimal 644).
- `get_url` without `checksum:`; `validate_certs: false`.

## Lock-out risks (🔴 when wrong)
- Editing sshd, sudoers, PAM, firewall, or network config without `validate:` (`sshd -t -f %s`,
  `visudo -cf %s`). The string must contain `%s` and must *check*, not apply (`sysctl -p %s`
  applies). Confined validators (chronyd, named under AppArmor/SELinux) fail on the staged file —
  validate after write inside `block`/`rescue`.
- Firewall changes that could drop the management connection before the play finishes; no
  `serial:` on rolling changes across many hosts.
- `ansible.cfg`: an inline `#` comment after a value (`host_key_checking = True # keep`) makes the
  value a string that evaluates to **False**; `ssh_args` with `StrictHostKeyChecking=no`;
  `host_key_checking = False`.

## Targeting
- `hosts: all`, or a broad group where a narrow one fits; ad-hoc patterns in scripts/CI without
  `--limit`.
- Branching on hostnames instead of facts (`ansible_os_family`, distribution version).
- SELinux checks not guarded (`ansible_selinux.status | default('disabled')`); disabling SELinux
  to make a task pass.

## Structure & versions
- Short module names instead of FQCN (`ansible.builtin.copy`); `include:` (removed in 2.16);
  `ignore_errors: true` instead of `failed_when:`; missing `state:`; tasks without a `name:`.
- Regex backslashes: in block/single-quoted/plain YAML scalars write `\s`; only double-quoted
  strings need `\\s`. The wrong count matches nothing, silently. `^` anchors need
  `multiline=True` on multi-line output.
- Collections in `requirements.yml` without version constraints; floors that disagree with CI.
- Ansible creating cloud resources (EC2, RDS, VPC…) in a repo where Terraform provisions — 🟡,
  belongs in Terraform.
