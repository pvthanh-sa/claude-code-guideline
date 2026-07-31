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
- Pin a `checksum:` on `get_url` (or vendor the file) — an unpinned download is a MITM window
- `host_key_checking` stays **enabled**. In `ansible.cfg`, keep the comment on its own line:
  `configparser` does not strip inline comments, so `host_key_checking = True ; keep on` parses as a
  non-boolean string and evaluates **False** — silently disabling the very thing the line claims

## Targeting Safety — treat every inventory host as production
- Never `hosts: all`, and never `ansible <pattern> -m <module>` ad-hoc against the fleet
- Always pass an explicit `--limit`; prefer a narrow group over a broad one
- `--check --diff` before any real run; `serial:` for rolling changes across more than one host
- The human runs the playbook. Author, verify, present the diff — then stop

## Multi-OS
- RedHat family is the house default (Rocky 9 / Amazon Linux 2023): `dnf`, `firewalld`, SELinux
- Branch on facts (`ansible_os_family`, `ansible_distribution_major_version`), never on hostnames.
  Guard SELinux checks with `ansible_selinux.status | default('disabled')` — on a host without
  SELinux, `ansible_selinux` is the boolean `False` and a bare `.status` raises
- Set SELinux context with `sefcontext` + `restorecon` — never disable SELinux to make a task pass

## Collections & Versions
- Declare every collection in `requirements.yml` with a version constraint
- Target **ansible-core 2.17+** — the floor `amazon.aws >=9` and `community.general >=10` declare via
  `requires_ansible`. Keep the local, CI and `requirements.yml` floors identical
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
- `ansible.cfg` is found relative to the **current directory**, not the playbook's. **`cd` into the
  ansible dir** — `ANSIBLE_CONFIG=<dir>/ansible.cfg` loads the file but leaves the relative paths
  inside it (`inventory`, `roles_path`) resolving against the caller's cwd
- **Enforce the same checks in CI** (`.github/workflows/ansible-scan.yml`) on every PR touching
  Ansible paths — the local gate alone is not enough
- The toolchain is not part of the pipeline baseline and is often absent. Gate every invocation with
  `command -v <tool>` and report a skipped gate as skipped, never as a pass
