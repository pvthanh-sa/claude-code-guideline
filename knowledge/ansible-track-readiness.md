# Ansible track — what is proven, what is not, and how to start a new project

Written 2026-08-02, after the first end-to-end run of the pipeline on an Ansible-only project
(`ansible-fleet-baseline`, 4 disposable Vultr hosts, two OS families). Full narrative:
[`reports/2026-08-01-ansible-fleet-baseline-e2e.md`](reports/2026-08-01-ansible-fleet-baseline-e2e.md).

This file exists to answer one question honestly: **if I start an Ansible project tomorrow, what
can I rely on and what am I the first to try?**

---

## 1. Starting a new project — what you actually re-run

The setup splits in two, and the split is not obvious. Getting it wrong is the difference between
"the pipeline is stale" and "the pipeline is missing".

### Once per MACHINE — §1.1 of `pipeline-usage-guide.md`

Symlinks `~/.claude/{skills,workflows,agents}` into your guideline clone. **You do not re-run this
per project.** Verified: every entry resolves back into the repo working tree —

```
~/.claude/skills/ansible-implement/SKILL.md
  -> <guide>/.claude/skills/ansible-implement/SKILL.md
```

Because they are symlinks, an edit or a `git pull` in the guideline repo is **live immediately** in
every project. Two consequences, one good and one sharp:

- Good: a fix to a pipeline skill reaches every project with no action.
- Sharp: **uncommitted work in the guideline repo is also live.** A `git checkout .` there silently
  changes the behaviour of every project on the machine. Commit early.

### Once per PROJECT — `/init-project` at G2

`/init-project` **copies** (does not symlink) the per-project layer into `<project>/.claude/`:

| What | Why per-project |
|---|---|
| `rules/{ansible,security,cicd,…}.md` | Always-loaded context; must travel with the repo for a teammate who has no guideline clone |
| `agents/{ansible-reviewer,security-auditor}.md` | Same |
| `skills/{ansible-engineer,devops-engineer,secure-code-guardian}/` | Domain knowledge, including `verify.sh` and `bootstrap-ansible.sh` |
| `CLAUDE.md`, `.mcp.json`, `.gitignore` | Project-specific by definition |

**So: a new Ansible project = `/spec-architect` (G1) → `/init-project` (G2) → `/ansible-implement`
(G3b).** Nothing from §1.1 is repeated.

### The catch nobody notices: per-project copies go stale

Copies are snapshots taken at G2. They do **not** track the guideline repo. Measured on the lab
repo one day after its own G2 ran, against the same day's guideline repo:

```
STALE  rules/ansible.md                                   55 lines differ
STALE  agents/ansible-reviewer.md                         27 lines differ
STALE  skills/ansible-engineer/references/patterns.md    330 lines differ
STALE  skills/ansible-engineer/references/verify-chain.md 64 lines differ
STALE  skills/ansible-engineer/scripts/verify.sh          26 lines differ
```

Every one of those lines is a lesson the lab itself produced — the project that generated the
knowledge is running without it. That is the intended trade-off (a project must be self-contained
for a teammate with no guideline clone), but it needs a deliberate refresh, not an assumption:

```bash
G=~/Documents/Devops/claude-code-guideline/.claude
cp    "$G/rules/ansible.md"            .claude/rules/
cp    "$G/agents/ansible-reviewer.md"  .claude/agents/
cp -r "$G/skills/ansible-engineer/."   .claude/skills/ansible-engineer/
# then re-read the diff before trusting it — a refreshed rule can change what a gate accepts
```

Do this at the **start** of any session on an older project, and after any pipeline change you want
that project to inherit.

---

## 2. Verified live — exercised on real hosts, not read

Each row was run against the 4-host fleet and left raw output in the lab's `docs/acceptance/`.

| Area | What was actually proven |
|---|---|
| **G2 → G3b routing** | An Ansible project with no `.tf` correctly **skips G3** and `/init-project`'s exit text points at `/ansible-implement`. First project to take that path. |
| **`verify.sh` no-skip contract** | Run on a machine with no `ansible-lint`: the gate **installed it and ran**. Exit 0, 4 gates, **0 skipped**. |
| **Idempotency** | Two consecutive **real** runs, 4 hosts, both OS families: `changed=0 failed=0`. Re-proved after the G4 fix round, because a review that changes roles invalidates every earlier claim. |
| **Effective-state verification** | Every check reads `sshd -T`, `firewall-cmd`, `getenforce`/`aa-status`, `chronyc` — the daemon's own view, never the file just written. |
| **Multi-OS** | Rocky 9.8 / Rocky 10.2 / Ubuntu 24.04.4 — so both `ansible_os_family` and `ansible_distribution_major_version` branching are exercised. |
| **Drift detection** | Compliance report drifted on purpose (3 kinds, 3 hosts) → correct rows FAIL, run red (rc 2) → restored → green. A report only ever seen passing is untested instrumentation. |
| **Self-lockout guards** | Invalid sshd config rejected by `validate:` in the temp dir; live drop-in byte-identical by hash; `rescue` reloaded and re-probed; run still **red**. |
| **G4 stack-aware roster** | `security-auditor` + `ansible-reviewer` on an Ansible-only repo. Both found real defects; three findings converged independently. |
| **G5 on a non-Terraform project** | 3 diagrams, 19/19 role×host-group coverage. 8 places where the skill assumes Terraform are recorded in the doc's own §9. |
| **G6** | Clean — and found **two defects in itself** (a zero-byte scan reporting a pass; a vault password invisible to content scanning). |
| **Teardown** | `instance list` **unfiltered** → `TOTAL 0`; reserved-IP / snapshot / block-storage all 0; all four addresses time out. |

---

## 3. NOT verified — you would be the first

Do not read these as broken. Read them as untested, which for a gate is the same risk class.

| Gap | Why it matters | Nearest evidence |
|---|---|---|
| **Mixed Terraform + Ansible repo** | `.claude/CLAUDE.md` promises "a mixed repo gets all four reviewers in one report". That path has never run. The lab had no `.tf` at all. | G4 ran Ansible-only |
| **CI actually executing** | `ansible-scan.yml` and `secret-scan.yml` are installed and syntactically fine, but the lab was never pushed, so **no workflow has ever run on a PR**. The local gate is the only one with evidence. | local `ansible-lint`/`--syntax-check` pass |
| **`molecule`** | Out of scope for the pilot by the lab's own brief. `verify-chain.md` documents the driver trap; nobody has run it. | — |
| **The Terraform → Ansible seam** | `-e "x=$(terraform output -raw x)"` is the documented way infra values arrive. Never exercised. | — |
| **A fleet larger than 4** | `serial:` and `max_fail_percentage: 0` behaved correctly at n=4. The blast-radius ceiling logic is written for larger, untested there. | `serial: 1` roll across 2 hosts |
| **`fleet_web_witness` on Debian** | Its own vars file describes a `conf-available/` + `a2enconf` branch that **does not exist**; `defaults/` holds RedHat-only paths. Latent — the role is disabled for the group the Ubuntu host is in. | raised at G4, deliberately not fixed |

---

## 4. Decisions to make at G1, not inherit

These are not pipeline bugs. They are lab-shaped choices that a real fleet must re-decide, and
copying the lab unchanged would carry them in silently. Both were raised as **High** at G4 and
deliberately deferred, because fixing them changes the access model.

- **The roster has no scope dimension.** One entry in `fleet_access_users` grants
  password-authenticated root on *every* host in the inventory. Correct for a single-tenant pilot;
  wrong for the "30 hosts, several customers" shape the requirements describe. Fix is per-project
  `group_vars/<project>/` plus a `sudo_commands:` dimension.
- **One `become` password and one automation hash fleet-wide.** Root on any single host yields a
  credential valid on all of them, and with pipelining the cleartext is presented to `sudo -S` on
  every host on every run. Fix is a per-project vault.
- **Root's `authorized_keys` is managed `exclusive: true`.** On a customer fleet that deletes their
  provider key, backup-agent key, and any out-of-band break-glass key. The role default is `[]`;
  the value must be a deliberate per-deployment declaration.
- **Compliance reports commit every host's address**, in a repo that gitignores `inventory.ini` for
  exactly that reason. Either the addresses are sensitive (the reports leak them) or they are not
  (the gitignore is theatre). Fix is `fleet_compliance_include_addresses: false`.

---

## 5. The five rules this run added, in one place

Each was measured, not reasoned. Full detail in
[`patterns.md`](../.claude/skills/ansible-engineer/references/patterns.md) and
[`rules/ansible.md`](../.claude/rules/ansible.md).

1. **Backslash count depends on the YAML scalar style.** In a block scalar (`>-`, `|`), plain, or
   single-quoted scalar, write `\s`. Only in `"..."` write `\\s`. Most Ansible regexes live in block
   scalars, so **the careful-looking double backslash is the broken one** — it reaches the engine as
   a literal backslash and matches nothing, with no error. Caused five bugs in one repo. Also:
   `search`/`match` are `re.search` with no flags, so `^` needs `multiline=True`.
2. **A tool's exit code is often the answer, not an error.** `dnf check-update` 100 = updates
   available; `apt-get` 100 = **error**. `aa-status` 1 = not enabled, 2 = no policy — both real
   answers meaning non-compliant; only 3/4/42 mean "could not look". Copying one whitelist onto the
   other certifies a broken host as clean.
3. **An `rc` check belongs in `that:`, never in `when:`.** A *report* may answer SKIPPED; a *gate*
   may not. `failed_when: false` + `when: probe.rc == 0` turns a failed probe into a green play.
4. **`validate:` can be denied by AppArmor/SELinux before it parses a line.** `sshd -t` and
   `visudo -c` are unconfined and safe; `chronyd` and `named` are not. Remedy is a post-write
   validator inside the same `block`/`rescue`, and stating the downgrade out loud.
5. **Testing a checker against compliant hosts tests nothing.** Both exit-code bugs above passed
   lint and a live run. They only appear on a host that is already broken — the only kind a
   compliance check exists for. Drift a host on purpose before believing a report.

One more, about method rather than Ansible: **when a global setting cannot be right in either
position, the answer is local.** `display_skipped_hosts` hides the safety gates when False and
prints 135 noise lines against 419 tasks when True. Neither wins; the gates now announce their own
absence instead.
