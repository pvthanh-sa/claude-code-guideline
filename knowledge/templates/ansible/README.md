# Ansible scaffolding templates (Stage 3b)

Project files that `/ansible-implement` copies in when it scaffolds a role. They are templates, not
config for this repo — nothing here is read at runtime by the pipeline itself.

| File | Copies to | What it is for |
|------|-----------|----------------|
| `ansible.cfg` | `<project>/ansible/ansible.cfg` | Per-project config so it travels with the playbooks. `host_key_checking = True`, `become = False` (escalate per task), pipelining on, `retry_files_enabled = False`. |
| `requirements.yml` | `<project>/ansible/requirements.yml` | The four baseline collections, upper- **and** lower-bounded. |
| `dot-ansible-lint` | `<project>/.ansible-lint` | `profile: production` — the blocking gate's ruleset. |
| `dot-yamllint` | `<project>/.yamllint` **and** `<project>/ansible/.yamllint` | 2-space indent, `truthy` restricted to `true`/`false`, ignores `*vault*`. Two copies on purpose — see below. |
| `scan.yml` | `<project>/.github/workflows/ansible-scan.yml` | The CI gate. |
| `gitignore-snippet.txt` | appended to `<project>/.gitignore` | Ignores the filled inventory/vault/`.vault_pass`, run artifacts, installed collections. |

## The CI gate (`scan.yml`)

Same two-tier doctrine as `iac-scan.yml`: advisory reporters plus one blocking gate, path-filtered so
unrelated PRs don't pay for it.

| Step | Tool | Blocking? |
|------|------|-----------|
| Style | `yamllint -f github` | report-only (`continue-on-error`) |
| Syntax | `ansible-playbook --syntax-check` | ✅ blocks |
| Lint | `ansible-lint --profile production` | ✅ blocks — the real gate |
| Targeting safety | `grep` for `hosts: all` and disabled `host_key_checking` | ✅ blocks (warns on a templated `hosts:`) |

Deliberately absent: any job that **runs** a playbook against a host. CI lints; humans apply.

The targeting-safety step exists because linting cannot express blast radius. `hosts: all` and
`host_key_checking = False` are Critical findings in
`.claude/skills/ansible-engineer/references/review-checklist.md`, and both are one-line greps.

## Three things that will bite you

**`.yamllint` has to sit where the linter is *run from*, which is why it is copied twice.**
`ansible-lint` locates `.ansible-lint` by walking parent directories, but its **embedded** yamllint
reads **cwd only** (`_yamllint_config_locations()` in `ansiblelint/yaml_utils.py`: `.yamllint`,
`.yamllint.yaml`, `.yamllint.yml`, `$YAMLLINT_CONFIG_FILE`, `$XDG_CONFIG_HOME` — no parent walk).
Everything that lints runs from inside the Ansible dir, so a root-only `.yamllint` is silently
ignored there and yamllint's *built-in* defaults apply instead — `line-length` 160 and
`document-start` disabled rather than your 120/error. Same rule ID, two rulesets, and the stricter
one would only ever run in the PostToolUse hook. Keep both copies in sync, or set
`YAMLLINT_CONFIG_FILE` explicitly.

Note also that both octal switches are `true` and `braces.max-spaces-inside` is `1` because
ansible-lint validates a custom `.yamllint` against six required settings; a mismatch prints
*"Found incompatible custom yamllint configuration … Fix mode will not be available."* on every run.
Do not "simplify" those back.

**Every ansible step runs with `working-directory: ansible`, and `verify.sh` does the same `cd`.**
`ansible.cfg` is resolved against the *current directory*, never the playbook's. Setting
`ANSIBLE_CONFIG=ansible/ansible.cfg` from the repo root loads the file but leaves the relative paths
*inside* it (`inventory`, `roles_path`) pointing at the repo root — you get the config without its
inventory, and `--check` fails with "Could not match supplied host pattern". Only a real `cd` works.

**Keep the `ansible-core` floor in step across three files** — `requirements.yml`, `scan.yml`, and
`.claude/skills/ansible-engineer/scripts/bootstrap-ansible.sh` all pin `>=2.17`. That floor is a
house choice, *not* something the pinned collections force: `amazon.aws 9.x`,
`community.general 10.x`, `ansible.posix 2.x` and `community.docker 4.x` each declare only
`requires_ansible: >=2.15.0` (amazon.aws first demands 2.17 at 10.0.0, above our ceiling). The
reason to keep the three identical is unchanged: let CI resolve a newer core than the laptop and
you get a green pipeline with a red laptop.

## Install

Automatic (preferred): `/ansible-implement` (gate G3b) copies whichever of these are missing.
Manual: copy each to the destination in the table above. `dot-ansible-lint` and `dot-yamllint` are
named without the leading dot so they stay visible in this repo — rename on copy.

## Complements (not replaced by) this gate

- **Local ladder:** `.claude/skills/ansible-engineer/scripts/verify.sh` — the same gates, before you push.
- **Secrets:** `secret-scan.yml` (Stage 6). Vault-encrypted files are high-entropy base64; the shared
  `gitleaks.toml` allowlists the `$ANSIBLE_VAULT` header so they don't false-positive.
- **AI review:** `/infra-review` (G4) — stack-aware; fans out `ansible-reviewer` when it finds an
  Ansible tree, for the judgment findings a linter cannot reach.
- **Idempotency:** neither CI nor `--check` can prove it. That needs two real runs against one host,
  the second reporting `changed=0`.
