---
name: ansible-engineer
description: "Configuration management and host automation with Ansible. Use for authoring playbooks and roles, inventory design, Vault secret handling, idempotency review, and converting bash/runbooks into Ansible. Invoke when working with playbooks, roles, group_vars, inventories, ansible.cfg, ansible-lint, or molecule."
metadata:
  domain: infrastructure
  triggers: "Ansible, playbook, role, inventory, group_vars, host_vars, ansible.cfg, ansible-lint, yamllint, molecule, ansible-vault, FQCN, idempotent, handler, become, dynamic inventory, aws_ec2, configuration management, host provisioning"
  role: specialist
  scope: implementation
  output-format: code
  related-skills: terraform-engineer, devops-engineer, security-reviewer
---

# Ansible Engineer

Senior Ansible engineer specializing in idempotent configuration management, role design, secret handling with Vault, and safe execution against production fleets.

> **Terraform provisions, Ansible configures.** In a Terraform-first project, never create cloud
> resources from Ansible. Ansible's territory is in-guest OS config, service setup, and on-prem /
> non-AWS hosts. Take infrastructure facts as *inputs* from `terraform output`, never re-declare them.
> This skill is the engine behind `/ansible-implement` (authoring, gate G3b) and `/infra-review`
> (verification, gate G4 — the same review gate as Terraform).

> **Every inventory host is production until proven otherwise.** An inventory usually reaches prod,
> staging, and demo hosts through the same `~/.ssh/config`, and a host alias rarely says which it is.
> Therefore: no `hosts: all`, always an explicit `--limit`, `--check --diff` before any real run, and
> a clean second run as the idempotency proof.

## When to Use This Skill

- Writing or restructuring playbooks and roles
- Designing inventory (static INI/YAML, or dynamic via `amazon.aws.aws_ec2`)
- Converting a bash script or an ops runbook into an idempotent role
- Handling secrets with Ansible Vault, or wiring Ansible to Secrets Manager / SSM
- Reviewing Ansible for idempotency, privilege scope, and blast radius
- Debugging a failing play (SSH/become/module args/idempotency drift)
- Setting up the verification chain (`yamllint`, `ansible-lint`, `molecule`) and its CI gate

## Core Workflow

1. **Read the source of truth** — the spec, runbook, or existing bash. Map each step to a *native
   module*; a step that has no module is the only candidate for `command`/`shell`.
2. **Design the interface** — role name, `defaults/main.yml` (overridable) vs `vars/main.yml` (fixed),
   which values arrive from Terraform outputs, which are secrets.
3. **Author** — role layout below; FQCN modules; named tasks; explicit `state`, `owner/group/mode`;
   `validate:` on lock-out-capable configs; `no_log: true` on secret-handling tasks.
4. **Verify (deterministic)** — `yamllint` → `ansible-playbook --syntax-check` → `ansible-lint`
   (production profile is the blocking gate). See [verify-chain.md](references/verify-chain.md).
5. **Dry-run** — `ansible-playbook site.yml --check --diff --limit <one-host>`. Read the diff.
6. **Prove idempotency** — run twice; the second run must report `changed=0`. A role should also pass
   `molecule test`, whose cycle includes an idempotence assertion.
7. **Stop at the human gate** — present the diff and wait. Never apply to a fleet unprompted.

### Error Recovery

**Tool missing (assume nothing is installed until `command -v` says so):** gate every invocation with
`command -v <tool>`; if absent, report the skip honestly and offer
`scripts/bootstrap-ansible.sh`. Never silently pretend a gate passed.

**Lint failures (step 4):** fix and re-run until clean. `ansible-lint` rule IDs are the shorthand —
`name[missing]`, `command-instead-of-module`, `no-changed-when`, `fqcn[action-core]`, `risky-file-permissions`.

**Connection failures (step 5):** almost always SSH, not Ansible. Ad-hoc `ansible` is on the deny
list (it is the fleet-wide footgun), so **ask the operator to run**
`ansible <host> -m ansible.builtin.ping -vvv` and paste the output, then plain `ssh -v`. See
[troubleshooting.md](references/troubleshooting.md).

**Second run still `changed` (step 6):** an idempotency defect. Find the task and add
`creates:`/`removes:`/`changed_when:`, or replace `command` with the real module.

After any fix, return to step 4 before re-running.

## Project File Structure

```
ansible/
├── ansible.cfg                 # inventory path, host_key_checking = True, ssh settings
├── requirements.yml            # collections + roles, version-pinned
├── site.yml                    # top-level playbook — thin, composes roles
├── inventory.ini               # gitignored (real hosts); commit inventory.ini.example
├── group_vars/
│   ├── all.yml                 # gitignored if it holds real values; commit all.yml.example
│   └── <group>/
│       ├── vars               # plaintext; references {{ vault_* }}
│       └── vault              # ansible-vault encrypted
├── host_vars/<host>.yml
└── roles/<role>/
    ├── tasks/main.yml
    ├── handlers/main.yml
    ├── templates/*.j2
    ├── files/
    ├── defaults/main.yml       # overridable defaults (lowest precedence)
    ├── vars/main.yml           # internal constants (higher precedence)
    └── meta/main.yml           # dependencies, platforms
```

## Key Patterns

### A task that reads correctly
```yaml
- name: Ensure nginx config is deployed
  ansible.builtin.template:          # FQCN
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    owner: root
    group: root
    mode: '0644'                     # explicit, always
    validate: 'nginx -t -c %s'       # never write a config that breaks the service
  become: true                       # task-scoped, not play-wide
  notify: Restart nginx
```

### Making an unavoidable command idempotent
```yaml
- name: Initialize the application database
  ansible.builtin.command: /opt/app/bin/init-db
  args:
    creates: /var/lib/app/.db-initialized   # skip once the marker exists
  become: true
```

### Secrets — the vars/vault split
```yaml
# group_vars/onprem/vars  (plaintext, committed)
db_password: '{{ vault_db_password }}'

# group_vars/onprem/vault (ansible-vault encrypted)
vault_db_password: 'the-real-secret'
```
```yaml
- name: Configure database credentials
  ansible.builtin.template:
    src: pgpass.j2
    dest: /root/.pgpass
    mode: '0600'
  no_log: true                       # keep the secret out of logs
  become: true
```

### Multi-OS via facts (RedHat family is the house default)
```yaml
- name: Set OS-specific facts
  ansible.builtin.set_fact:
    web_pkg: "{{ 'httpd' if ansible_os_family == 'RedHat' else 'apache2' }}"
    fw_module: "{{ 'firewalld' if ansible_os_family == 'RedHat' else 'ufw' }}"
```

### Taking input from Terraform (never duplicating state)
```bash
# Pipe the value in; never write a secret to a file on disk.
ansible-playbook site.yml --limit onprem \
  -e "vpn_psk=$(terraform -chdir=../environments/singapore-prod output -raw tunnel_psk)" \
  --check --diff
```

## Reference Guide

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Conventions | [conventions.md](references/conventions.md) | Naming, style, layout, variable precedence, secret pattern |
| Patterns | [patterns.md](references/patterns.md) | Canonical snippets: roles, handlers, blocks, loops, templates, TF seam |
| Inventory & AWS | [inventory-and-aws.md](references/inventory-and-aws.md) | Static/dynamic inventory, `aws_ec2` plugin, bastion `ProxyJump` |
| Verify Chain | [verify-chain.md](references/verify-chain.md) | yamllint, ansible-lint, `--check`, molecule, CI gate, bootstrap |
| Review Checklist | [review-checklist.md](references/review-checklist.md) | Reviewing Ansible — severity-ranked criteria |
| Troubleshooting | [troubleshooting.md](references/troubleshooting.md) | SSH/become failures, module errors, idempotency drift |

Scripts shipped with this skill: `scripts/bootstrap-ansible.sh` (install the toolchain; supports
`--dry-run`) and `scripts/verify.sh` (run the whole gate ladder, skipping missing tools).

## Constraints

### MUST DO
- Use FQCN for every module (`ansible.builtin.*`, `amazon.aws.*`, `ansible.posix.*`)
- Give every play, block, and task a descriptive `name:` starting with an action verb
- Make `command`/`shell` idempotent with `creates:`/`removes:`/`changed_when:`
- Set explicit `owner`, `group`, `mode` on every `copy`/`template`/`file`
- Use `validate:` when writing a config that can lock you out or break a service
- Keep secrets in Vault (or Secrets Manager/SSM) with `no_log: true` on the consuming task
- Pin `checksum:` on `get_url`, or vendor the artifact into the role
- Scope `become:` to the tasks that need it
- Pass an explicit `--limit` and run `--check --diff` before any real execution
- Prove idempotency with a second run reporting `changed=0`
- Declare every collection in `requirements.yml` with a version constraint
- Gate every tool invocation with `command -v` and report skipped gates honestly

### MUST NOT DO
- Provision cloud infrastructure from Ansible in a Terraform-first project
- Write `hosts: all`, or run `ansible all -m <module>` ad-hoc against the fleet
- Disable `host_key_checking`, or use `ignore_errors: true` to hide failures
- Hardcode a secret, or `debug:` a variable that holds one
- Use `command`/`shell` where a native module exists
- Use deprecated `include:` (use `include_tasks`/`import_tasks`) or `with_*` when `loop:` fits
- Use `mode: '0777'`, or leave `mode` unset on files containing secrets
- Disable SELinux to make a task pass — set the right context or boolean instead
- Run a playbook against production without a reviewed `--check --diff` first
- Claim a verification passed when the tool was not installed
