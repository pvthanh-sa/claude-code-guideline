# Ansible Review Checklist

Severity-ranked criteria for reviewing Ansible — whether written by a human or generated. Each item
is a `❌ smell → ✅ good` pair so it is checkable, not just aspirational.

Severity: **Critical** = secret exposure, production blast radius, self-lockout ·
**High** = broken idempotency, unpinned download, missing `validate:` ·
**Medium** = privilege scope, permissions, precedence ambiguity · **Low** = style, FQCN, naming.

## Idempotency

**[High] `command`/`shell` with no change semantics**
```yaml
# ❌ reports "changed" on every run
- ansible.builtin.command: /opt/app/setup.sh
# ✅
- name: Run one-time setup
  ansible.builtin.command: /opt/app/setup.sh
  args:
    creates: /opt/app/.setup-done
```

**[High] A native module existed and wasn't used**
```yaml
# ❌
- ansible.builtin.shell: dnf install -y nginx
# ✅
- name: Ensure nginx is installed
  ansible.builtin.package:
    name: nginx
    state: present
```

**[High] Second run is not clean.** Run twice; `changed=0` on the second pass or it's a defect.

**[High] `ignore_errors` hiding real failure**
```yaml
# ❌
  ignore_errors: true
# ✅
  failed_when: "'already exists' not in result.stderr"
```

**[Medium] Handler can never fire** — its notifying task never reports `changed`, or the handler
needed to run mid-play and `meta: flush_handlers` is missing.

**[Medium] Read-only command reports changed** → add `changed_when: false`.

## Secrets — Critical unless stated

**[Critical] Plaintext secret anywhere** — password, token, API key, PSK, private key.
✅ Vault with the `vars`/`vault` split, or Secrets Manager/SSM when Terraform is in play.

**[Critical] Secret leaked into logs**
```yaml
# ❌
- ansible.builtin.debug:
    var: db_password
# ✅  omit it entirely; on the consuming task:
  no_log: true
```

**[Critical] Filled inventory/vars committed** → `.example` twins committed, real files gitignored
(`group_vars/all.yml`, `group_vars/*/vault`, `inventory.ini`, `*.retry`).

**[Critical] Vault password file committed or world-readable** → gitignored, `chmod 600`
(password *script*: `700`).

**[High] A secret that was ever committed in plaintext** → it lives in git history. Rotate it;
deleting the file is not remediation.

**[Medium] Secret duplicated into Vault when Terraform owns it** → one source of truth; pipe it in
at run time with `-e "x=$(terraform output -raw x)"`.

## Privilege

**[Medium] `become: true` at play level when few tasks need it** → scope it to those tasks.

**[Medium] Escalation to a non-root account without `become_user`** → state it explicitly.

**[High] Playbook weakens SSH** — enabling root login, permitting password auth, or widening
`AllowUsers` without intent.

## File permissions & self-lockout

**[High] Editing a lock-out-capable config without `validate:`**
```yaml
# ❌
- ansible.builtin.lineinfile:
    path: /etc/ssh/sshd_config
    line: 'PermitRootLogin no'
# ✅
    validate: 'sshd -t -f %s'
```
Same for `sudoers` (`visudo -cf %s`), nginx (`nginx -t -c %s`), FRR (`vtysh --dryrun --inputfile %s`),
named (`named-checkconf %s`).

> The `validate:` string **must contain `%s`** — the module substitutes the temp-file path there and
> refuses the task otherwise. A validator without `%s` either errors out or silently checks the wrong
> file. And beware validators that *apply* rather than check: `sysctl -p %s` loads the settings, so it
> is not a validator at all.

**[High] `get_url` with no `checksum:`** → pin it, or vendor the artifact into `files/`. An unpinned
download is a MITM window. (If upstream rotates the artifact and pinning breaks bootstrap, vendoring
is the answer — do not just drop the checksum silently.)

**[Medium] `mode` unset on a file-creating task** → always explicit `owner`/`group`/`mode`.

**[Critical] `mode: '0777'`, or a secret file not `0600`.**

**[High] Firewall change can cut the control node's own access** → open the new port before closing
the old one; confirm the management path survives.

## Targeting safety — assume every host is production

**[Critical] `hosts: all`** → target a specific group.

**[Critical] No `--limit` on a real run** → always scope explicitly.

**[Critical] `host_key_checking` disabled** in `ansible.cfg` or via env → keep it on outside
throwaway hosts.

**[High] Prod and non-prod in the same group** → separate groups; the parent group is for shared
variables, not a run target.

**[High] Multi-host change with no `serial:`** → roll it.

**[Medium] Unconditioned destructive task** — `state: absent`, service stop, file removal — verify
it's intended and guarded.

## Structure & modernization

**[Low] Short module names** → FQCN (`ansible.builtin.copy`).

**[Low] Unnamed task** → verb-first capitalized `name:`.

**[High] `include:` — removed in ansible-core 2.16, so the play will not even parse** →
`include_tasks` (dynamic) or `import_tasks` (static). Remember the semantic difference: `when` on
`import_tasks` applies to each task individually; on `include_tasks` it is evaluated once for the
whole include.

**[Low] `with_items` where `loop:` fits.** Also: looping a module that already accepts a list
(`dnf`, `apt`, `package`) — pass the list, one transaction.

**[Medium] Same variable set at multiple precedence levels** → the runtime value differs from what a
reader expects. Resolve it. Overridable values → role `defaults/`; fixed internals → `vars/`.

**[Low] Role variables not prefixed with the role name** → collision risk across roles.

**[Medium] Deeply nested Jinja2 in a template** → move logic into a task or `set_fact`.

**[Medium] Collections not pinned** in `requirements.yml` → version-constrain them.

**[Medium] OS branching on hostnames instead of facts** → use `ansible_os_family` /
`ansible_distribution_major_version`.

**[High] SELinux disabled to make something work** → set the right `seboolean` or `setype` instead.

## Boundary

**[High] Ansible provisioning cloud infrastructure in a Terraform-first project** → reject on
architecture, not syntax. Ansible has no state file; drift and teardown become manual. Terraform
provisions, Ansible configures.

## CI / safety net

**[High] No `ansible-lint` in CI** → local gates alone are not enough; add the path-filtered workflow.

**[Medium] Shared role with no molecule scenario** → at least a converge + idempotence check.

## Reviewing what you cannot execute

Most of what you review will never have been run. Four blind spots to name explicitly rather than
assume away:

**1. `--diff` leaks secrets — and `no_log` hides the diff.** These two mandates are in direct
tension. A `template` task rendering a PSK prints the secret into your terminal, the transcript, and
`log_path` when you run `--diff`. Adding `no_log: true` fixes the leak but *suppresses the very diff
you were told to review*. The resolution: keep `no_log: true` on secret-bearing tasks and review them
by reading the template and its variable sources, not by reading a diff. Treat any secret-handling
task whose diff you *can* read as a finding.

**2. Check mode is blind to `command`/`shell`.** They are skipped in `--check`, so a clean dry run
proves nothing about the task class most likely to be non-idempotent. Read those tasks manually.

**3. Templated targets cannot be statically verified.** `hosts: "{{ target_group }}"`,
`include_tasks: "{{ os }}.yml"`, `--limit` from a variable — grep cannot tell you what these resolve
to. Ask what the value is at run time; an unpinned `hosts:` variable is a blast-radius finding.

**4. Encrypted vars are unreadable by design.** You cannot confirm a vaulted value is the *right*
value, only that it is vaulted. Verify instead that the plaintext side (`group_vars/<g>/vars`) only
references `vault_*` and never inlines anything.

## Reporting

Report findings as `[FINDING-NNN] [Severity] title` with `file:line`, the concrete consequence, and a
corrected snippet. Then state what you could **not** verify — tools not installed, no inventory
present, vault contents unreadable, targets resolved from variables. A review is "reviewed", not
"provably clean".
