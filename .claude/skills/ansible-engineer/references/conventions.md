# Ansible Conventions

House conventions for authoring Ansible. Derived from the official Ansible documentation
(tips & tricks, best practices), adapted to this toolkit's Terraform-first, RedHat-primary defaults.

## Naming

**Tasks, plays, blocks** — all get a `name:`.
- Start with an action verb: `Install`, `Configure`, `Deploy`, `Ensure`, `Remove`, `Restart`
- Capitalize the first letter; no trailing period
- Describe intent, not the module: `Ensure firewalld allows the BGP port`, not `Run firewalld module`
- Inside a role, omit the role name — Ansible already prints it
- In an included task file, prefixing helps locate the task: `strongswan : Deploy swanctl.conf`

**Variables**
- `snake_case` always
- **Prefix role variables with the role name** — `nginx_port`, `strongswan_local_ts`. This is the
  single most effective defence against variable collisions across roles
- Booleans read as predicates: `nginx_enable_ssl`, `app_create_user`
- Internal-only variables (not meant to be overridden) get a leading underscore: `_nginx_pkg_name`
- Never name a variable so it shadows a fact (`ansible_*` is reserved)

**Files**
- Playbooks: `site.yml` at the top, task files `verb-noun.yml` (`install-packages.yml`)
- Templates end in `.j2` and mirror the destination filename (`nginx.conf.j2` → `/etc/nginx/nginx.conf`)
- Inventory: `inventory.ini` (real, gitignored) + `inventory.ini.example` (committed)

## Style

- **2-space indentation**, lists indented under their key
- **Booleans are `true`/`false`** — not `yes`/`no`/`on`/`off` (yamllint's `truthy` rule)
- **Always multi-line map syntax**, even for one key. It keeps diffs small and reviewable:
  ```yaml
  # good
  ansible.builtin.service:
    name: nginx
    state: started

  # avoid
  ansible.builtin.service: {name: nginx, state: started}
  ```
- **Quote any value that begins with `{{ }}`** — otherwise YAML reads it as a dict:
  `mode: "{{ file_mode }}"`
- Prefer single quotes; use double quotes only when nesting quotes or when you need escapes (`"\n"`)
- Long strings: folded `>` (newlines → spaces) or literal `|` (newlines preserved); no manual escaping
- One blank line between tasks; one blank line between plays
- Sort variables alphabetically in `vars:` blocks and variable files — makes review diffs meaningful

**Key order within a play**
1. `name`
2. `hosts`
3. play options alphabetically (`become`, `gather_facts`, `serial`, `vars`)
4. `pre_tasks`
5. `roles`
6. `tasks`
7. `handlers`

**Key order within a task**
1. `name`
2. the module (FQCN) and its parameters
3. `loop` / `with_*`
4. other options alphabetically (`become`, `changed_when`, `failed_when`, `no_log`, `register`, `when`)
5. `notify`
6. `tags`

## Modules

- **FQCN, always**: `ansible.builtin.copy`, `ansible.posix.firewalld`, `amazon.aws.ec2_instance`,
  `community.general.pids`. Short names still resolve but are a modernization smell and
  `ansible-lint` flags them (`fqcn[action-core]`)
- Explicit `state:` even where it's optional — `state: present` documents intent
- `ansible.builtin.package` when the package name matches across OS families; `dnf`/`apt` when the
  options differ
- **Never** `command`/`shell`/`raw` where a module exists. When forced:
  - `command` (no shell) unless you genuinely need pipes, redirection, or globbing → then `shell`
  - Always add `creates:`, `removes:`, or `changed_when:`
  - `raw` only for bootstrapping a host that has no Python yet

## Variable precedence — what you must remember

Low → high (abbreviated; the full list has ~22 levels):

| Level | Where | Use for |
|-------|-------|---------|
| 1 | role `defaults/main.yml` | Overridable defaults — put most role variables here |
| 2 | `group_vars/all` | Fleet-wide values |
| 3 | `group_vars/<group>` | Per-group values |
| 4 | `host_vars/<host>` | Per-host overrides |
| 5 | play `vars:` | Values specific to one play |
| 6 | role `vars/main.yml` | Internal constants that should *not* be overridden |
| 7 | **`include_vars`** | **Beats `host_vars` AND `group_vars`** — OS/branch constants only (see warning) |
| 8 | `set_fact` | Values computed at runtime |
| 9 | `-e` / `--extra-vars` | **Wins over everything** — one-off runs and CI injection only |

Rules of thumb:
- Anything a consumer might change → `defaults/`. Anything they must not → `vars/`.
- Reserve `-e` for ephemeral values (a Terraform output, a one-off flag). Never for standing config.
- If the same variable name appears at several levels, that is a defect to resolve, not a feature.

> **The `include_vars` trap.** The recommended multi-OS pattern
> (`include_vars: '{{ ansible_os_family }}.yml'`) loads at a precedence level **above** `host_vars`
> and `group_vars`. So a per-host override of the same variable is **silently ignored** — no error,
> no warning, just the wrong value at runtime. Put only genuinely OS-fixed constants in those files
> (package names, config paths). Anything a consumer may tune belongs in `defaults/`, and anything a
> single host must override must not also be set by `include_vars`.

## Secrets

**Ansible-only projects — the vars/vault split.** It makes every secret's definition site obvious:

1. Create `group_vars/<group>/` as a *directory*
2. Inside it, two files: `vars` (plaintext) and `vault` (encrypted)
3. Define all variables in `vars`, including the sensitive ones
4. Move each sensitive value into `vault`, renamed with a `vault_` prefix
5. In `vars`, point at it: `db_password: '{{ vault_db_password }}'`
6. Encrypt: `ansible-vault encrypt group_vars/<group>/vault`
7. Playbooks reference the friendly name (`db_password`) and never touch `vault_*` directly

Then: `no_log: true` on every task that consumes the secret, `mode: '0600'` on anything it writes.

**When Terraform is in play**, Secrets Manager / SSM Parameter Store is the single source of truth —
duplicating a secret into Vault creates two things to rotate. Pipe values in at run time:
`-e "psk=$(terraform output -raw tunnel_psk)"`.

**Vault hygiene**
- Vault password file: gitignored, `chmod 600`; a password *script*: `chmod 700`
- Never `ansible-vault decrypt` to disk. At run time, supply `--vault-password-file` and let Ansible
  decrypt in memory.
- To *read* a vaulted value, run `ansible-vault view` **yourself, outside the Claude session**.
  Both `decrypt` and `view` are on the deny list: they print the plaintext to stdout, and anything
  on stdout lands in the transcript and therefore in the model's context.
- A secret that was ever committed in plaintext is compromised — rotate it, don't just delete it
- Rotate the vault password with `ansible-vault rekey` — you run it, and record the new password in
  the password manager *before* rekeying. A rekey with an unrecorded password is data loss.

## Git hygiene

Commit the `.example` twins; ignore anything that holds real values or secrets:

```gitignore
# Ansible — commit only the .example files; filled vars/vault/inventory carry
# real output values + secrets (PSKs, access keys)
ansible/group_vars/all.yml
ansible/group_vars/vault.yml
ansible/group_vars/*/vault
ansible/inventory.ini
*.retry
```

## Comments

- Explain **why**, not what. `# dnsmasq must bind the dummy interface, not 0.0.0.0 (BGP-advertised)`
- Note where a variable comes from when it isn't local: `# from terraform output tunnel_psk`
- Record deliberate non-obvious decisions inline; skip redundant restatement of the module name
