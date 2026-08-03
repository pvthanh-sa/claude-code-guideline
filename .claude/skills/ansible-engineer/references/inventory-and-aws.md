# Inventory & AWS

## Static inventory (INI) — the default here

The fleet is small and bastion-fronted, so a committed `.example` + a gitignored real file is the
right shape. Group by *function and environment*, never mix tiers in one group.

```ini
# inventory.ini.example  (committed — copy to inventory.ini and fill in)

[onprem]
vpn-gw ansible_host=203.0.113.10

[onprem:vars]
ansible_user=rocky
ansible_python_interpreter=/usr/bin/python3

[webservers_stg]
web-stg-1 ansible_host=10.0.1.11

[webservers_prod]
web-prod-1 ansible_host=10.0.2.11
web-prod-2 ansible_host=10.0.2.12

[webservers_prod:vars]
ansible_user=deploy

# Parent group for shared variables only — NOT a run target
[webservers:children]
webservers_stg
webservers_prod
```

> **`IdentitiesOnly=yes` or your fleet run dies on a workstation.** Naming
> `ansible_ssh_private_key_file` does **not** stop SSH from first offering every identity in
> `ssh-agent` plus the default `~/.ssh/id_*`. `sshd`'s `MaxAuthTries` is 6, so an engineer with a
> normal key collection gets `Received disconnect: Too many authentication failures` against a host
> whose key they are holding. Put it in `ssh_args` (the shipped `ansible.cfg` does) — the failure
> looks like a broken host or a wrong key, and it is neither.

Rules:
- `prod` and `stg` are **separate groups**. A run targets one of them, never their parent.
- Keep connection variables (`ansible_user`, `ansible_port`, `ansible_python_interpreter`) in
  `[group:vars]` or `group_vars/`, not scattered per host.
- Never put `ansible_password` or `ansible_become_pass` in plaintext — vault them.

Verify what a run *would* target before running it:
```bash
ansible-inventory -i inventory.ini --graph
ansible-inventory -i inventory.ini --host web-prod-1
ansible-playbook site.yml --limit webservers_stg --list-hosts   # dry check of the target set
```

## Bastion / ProxyJump

Most hosts sit behind a bastion, and `~/.ssh/config` usually already encodes those hops. Two ways
to use it:

**Preferred — let SSH config do the work.** If `~/.ssh/config` defines the host alias and its
`ProxyJump`, use the alias as `ansible_host` and add nothing else:
```ini
[app_dev]
app-db ansible_host=dev-app-db-server   # alias resolved by ~/.ssh/config
```

**Explicit — when the inventory must be self-contained** (CI, another operator):
```ini
[app_prod]
app-1 ansible_host=10.20.0.11

[app_prod:vars]
ansible_user=ec2-user
ansible_ssh_common_args='-o ProxyCommand="ssh -W %h:%p -q bastion-prod"'
```

For AWS instances reachable only via SSM (prefer Session Manager over inbound SSH):
```ini
[bastionless:vars]
ansible_connection=aws_ssm
ansible_aws_ssm_bucket_name=<transfer-bucket>
ansible_aws_ssm_region=ap-southeast-1
```
`aws_ssm` needs the `amazon.aws` collection and an S3 bucket for file transfer — worth it when the
host has no inbound SSH at all.

> Do not reference key files by a path containing spaces or non-ASCII characters — they survive in
> `~/.ssh` more often than you would expect. Give the host a clean alias with an `IdentityFile` in
> `~/.ssh/config` and point Ansible at the alias instead.

## Dynamic inventory on AWS

The modern mechanism is the **`amazon.aws.aws_ec2` inventory plugin** — a YAML config file, not a
script. (Older material uses an `ec2.py` script; that is the removed Python-2 approach. If you see
`ec2.py`, it is legacy and should be migrated.)

The file must be named `*.aws_ec2.yml` (or `*.aws_ec2.yaml`) for the plugin to pick it up:

```yaml
# inventory.aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - ap-southeast-1
  - ap-northeast-1

# Only managed hosts — never let a dynamic inventory sweep in everything
filters:
  'tag:ManagedBy': Ansible          # quote keys containing ':' — do not rely on YAML luck
  instance-state-name: running

# With the prefix + separator below, groups come out as: env_prod, env_stg, role_web
# (the bare `- key: tags` form is what produces tag_Environment_prod)
keyed_groups:
  - key: tags.Environment
    prefix: env
    separator: '_'
  - key: tags.Role
    prefix: role
    separator: '_'

hostnames:
  - private-ip-address        # prefer private IP; these hosts sit behind a bastion
compose:
  ansible_user: "'ec2-user'"
cache: true
cache_plugin: jsonfile
cache_connection: ~/.ansible/tmp/aws_inventory_cache   # REQUIRED — jsonfile needs a path
cache_timeout: 300
```

Use it and inspect it:
```bash
ansible-inventory -i inventory.aws_ec2.yml --graph
ansible-playbook site.yml -i inventory.aws_ec2.yml --limit env_stg --check --diff
```

Notes:
- Requires `amazon.aws` + `boto3`; auth uses the standard AWS chain. Pass the profile as a **CLI
  flag or env var scoped to the command**, matching the read-only-profile discipline used elsewhere:
  `AWS_PROFILE=<ro-profile> ansible-inventory -i inventory.aws_ec2.yml --graph`
- `filters:` is a safety control, not an optimization. Without it, one typo in `--limit` can target
  every instance in the account.
- MFA-based profiles need a valid session; refresh it before the run, not halfway through one.
- The plugin **executes** on every `-i` — including `ansible-inventory --graph`. That is a live
  `DescribeInstances` call under whatever profile is ambient, which is why `ansible-inventory` is
  not on the permission allow-list.

## Mixing static and dynamic

Point `-i` at a **directory** and Ansible merges every source in it:
```
inventories/prod/
├── inventory.ini              # on-prem and non-AWS hosts
├── inventory.aws_ec2.yml      # EC2, discovered
└── group_vars/
```
```bash
ansible-playbook site.yml -i inventories/prod --limit onprem --check --diff
```
Keep that directory clean — Ansible tries to parse everything in it, including stray backups.

## Runtime inventory additions

After provisioning a host in the same run (rare in a Terraform-first setup, but useful for
bootstrap), add it in memory rather than writing a file:
```yaml
- name: Register the new host for later plays
  ansible.builtin.add_host:
    name: '{{ new_host_ip }}'
    groups: bootstrap
    ansible_user: ec2-user

- name: Wait for SSH to come up
  ansible.builtin.wait_for_connection:
    delay: 5
    timeout: 300
```

`group_by` builds groups from facts — handy for OS branching across a mixed fleet:
```yaml
- name: Group hosts by OS family
  ansible.builtin.group_by:
    key: 'os_{{ ansible_os_family | lower }}'
```

## A matching ansible.cfg

> **Never put a comment on the same line as a value — and know which character bites.** Ansible
> builds its parser as `configparser.ConfigParser(inline_comment_prefixes=(';',))`
> (`ansible/config/manager.py`), so a **`;`** comment *is* stripped and
> `host_key_checking = True ; keep on` is actually safe. **`#` is not stripped**: the value becomes
> the literal string `'True # keep on'`, and `manager.py` then runs `boolean(value, strict=False)`,
> which returns **False** for anything it does not recognise — silently disabling host key checking on
> the very line that claims to enable it.
>
> ```ini
> host_key_checking = True ; keep on   # -> True   (safe: ';' is an inline comment prefix)
> host_key_checking = True # keep on   # -> False  (SILENT FAILURE: '#' is kept in the value)
> ```
>
> Put every comment on its own line regardless, and verify with **two** dumps — one is not enough:
> ```bash
> ansible-config dump --only-changed                    # [defaults]: HOST_KEY_CHECKING
> ansible-config dump --type connection --only-changed  # [ssh_connection]: ssh_args, pipelining
> ```
> `ssh_args` is connection-**plugin** config and never appears in the first dump. A repo can show
> `HOST_KEY_CHECKING = True` while `ssh_args = -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`
> disables verification completely — verified on ansible-core 2.21. Checking only the first dump is
> how a "host key checking is on" claim survives review while being false.
> Note this cuts both ways for review: a grep for `= False` will never catch the `#` form.

```ini
[defaults]
inventory = inventory.ini
roles_path = roles
# No collections_path — see the note below.

# Keep enabled — a prior infrastructure review flagged this being off.
host_key_checking = True
interpreter_python = auto_silent
forks = 10

# YAML output via core's own callback. The community.general 'yaml' callback is deprecated;
# core has done this natively since 2.13.
stdout_callback = default
callback_result_format = yaml
callbacks_enabled = ansible.posix.profile_tasks

retry_files_enabled = False
nocows = True

[privilege_escalation]
# Escalate per task, not globally.
become = False
become_method = sudo

[ssh_connection]
# Faster; requires 'requiretty' to be off in sudoers on the targets.
pipelining = True
ssh_args = -o ControlMaster=auto -o ControlPersist=600s -o PreferredAuthentications=publickey
```

The fully annotated version ships as `knowledge/templates/ansible/ansible.cfg` in the guideline repo
(`/ansible-implement` copies it in). Note it deliberately sets **no** `collections_path` — that key
replaces the default search list instead of extending it, so setting it hides everything
`ansible-galaxy collection install` put in `~/.ansible/collections`.
