# E2E Pipeline Run Report — ansible-fleet-baseline (2026-08-01 → 08-02)

First end-to-end exercise of the pipeline on an **Ansible-only** project: no Terraform, no cloud
provider layer, four real disposable VMs configured over SSH. It is therefore the first real test of
everything added to the pipeline for Ansible — G3b, the stack-aware G4 roster, `verify.sh`'s
no-skip contract, `rules/ansible.md`, and the `/infra-document` §4.1 configuration layer.

Lab: `~/Documents/Devops/ansible/ansible-fleet-baseline`, against `LAB-REQUIREMENTS.md` — an
operations brief with 9 baseline requirements, 11 operational, 6 security, 7 past incidents to
reproduce, and 16 acceptance items.

Fleet: 4 × Vultr `vc2-1c-1gb` in `sgp`, tag `lab-fleet-baseline` — `web-1`/`web-2` (Rocky 9.8),
`int-1` (Rocky 10.2), `int-2` (Ubuntu 24.04.4). Two OS families, and within RedHat two DNF
generations, so both `ansible_os_family` and `ansible_distribution_major_version` branching are
exercised rather than assumed.

## 1. What was produced

**Lab artifacts** (uncommitted — operator owns git):
- `docs/specs/fleet-baseline.spec.md` (G1) + `docs/requirements/decisions-g1.md`
- `ansible/` — 9 roles (`fleet_access`, `fleet_firewall`, `fleet_selinux`, `fleet_time`,
  `fleet_patch`, `fleet_stamp`, `fleet_verify`, `fleet_web_witness`, `fleet_compliance`),
  4 playbooks (`site.yml`, `bootstrap.yml`, `compliance.yml`, `drift-lab.yml`)
- `docs/compliance/<date>-pilot.md` + `.json` — generated from real host state, not from the run
  that made the changes
- `docs/acceptance/README.md` + 8 evidence files with raw output for NT-1…NT-14
- `docs/runbooks/{break-glass,incident-replay,teardown}.md`
- Secret-scan guardrail (`.gitleaks.toml`, pre-push hook, CI workflow) — clean

**Gates:** G1 ✓ · G2 ✓ · G3 — **skipped, correctly** (no `.tf`; the project went G2 → G3b) ·
G3b ✓ · G4 ✓ (two independent reviewers, GO WITH FIXES — 9 of 10 High resolved, 1 deferred to G1
as a design change) · G5 ✓ (3 diagrams, 19/19 role×group coverage) · G6 ✓ clean.

**`verify.sh` exit 0** — 4 gates ran, 4 passed, **0 skipped**. That number is the point: the whole
no-skip doctrine was written between the last report and this one, and this is the first run where
it was tested against a machine that had none of the toolchain.

## 2. What held up well

- **The "prove you can reach a target before authoring" rule (Phase 0.4).** Added to
  `/ansible-implement` after the previous session handed an implementer a fleet nobody had SSH'd
  into. This run it caught a dead host before a single task was written.
- **`verify.sh` installing rather than skipping.** The lab machine had no `ansible-lint`; the gate
  installed it and ran. Under the old contract this would have been a green "SKIPPED".
- **Reading `sshd -T` instead of the file we just wrote.** Every effective-state check in the lab is
  built this way, and it is what made NT-5 and NT-13 provable rather than assertable.
- **The `--limit` requirement in `verify.sh`.** Gate 4 needs a real host, which a script cannot
  invent; making the waiver an explicit `--no-diff` flag meant no run silently skipped the diff.
- **Stack detection at G2.** `/init-project` correctly identified an Ansible project with no
  Terraform and branched its exit text to `/ansible-implement`. This was a fix made from the
  previous session's reading; this run confirmed it on a real project.

## 3. What to improve (concrete)

Each item is a defect the run exposed, with what was changed. All were fixed during the run; the
pipeline-side fixes are in this repo and uncommitted.

A–D came from building and applying the baseline. **F–H came from G4** — two independent reviewers
with no shared context, whose findings I verified individually before touching anything; three of
their findings were raised by both, and two of the defects were mine, written the same day.

**A. `validate:` can be denied by mandatory access control, and the error blames the wrong
subsystem.** `chronyd -p -f %s` on Ubuntu 24.04 fails with `Permission denied` on a root-owned file
read as root. The cause is AppArmor: `/etc/apparmor.d/usr.sbin.chronyd` grants reads only under
`/etc/chrony/**`, and `validate:` points the binary at Ansible's staged copy in the login user's
remote tmp. `journalctl -k | grep apparmor` shows `apparmor="DENIED" … fsuid=0 ouid=0` — root, root,
denied. Nothing in the module output says AppArmor.

*Pipeline change:* new trap documented in `ansible-engineer/references/verify-chain.md` — any
`validate:` whose binary is confined can be denied before it parses a line. `sshd -t` and `visudo -c`
are unconfined on both families; `chronyd` and `named` are not. The remedy that keeps a real check is
a post-write validator reading the file at its final path, inside a `block`/`rescue`, with the
downgrade stated: *"a broken config never stays"* rather than *"a broken config is never written"*.

**B. A well-behaved `SKIPPED` is the hardest coverage gap to see.** `fleet_patch` installed the
correct package on Ubuntu (`needrestart`) and then looked for the RedHat binary
(`/usr/bin/needs-restarting`), producing a polite, correct-sounding *"SKIPPED — not installed, this
is a gap in coverage, not a pass"* on a host that could have answered. Everything about it looked
like the system working.

The deeper half: the two tools disagree about **how** to answer — `needs-restarting -r` uses its exit
code, `needrestart -b` uses stdout. A path variable alone would have swapped the binary and kept the
wrong parser.

*Pipeline change:* a pattern in `references/patterns.md` — when branching a check across OS families,
normalise both branches into the same named facts, and treat "the tool reports differently" as the
default expectation, not the exception. Also: `needrestart -b` **restarts services by default**;
`-r l` is required to make it a read.

**C. The baseline was portable; the assurance layer was not — and that is the worse half.** After
A and B, `site.yml` converged on Ubuntu with `changed=0`. The compliance report then said
`selinux_persistent: FAIL` on a host with no SELinux, plus three `SKIPPED` rows for checks that only
knew how to ask dnf and firewalld. The host still appeared in the summary table with a full row per
check, four of which said nothing.

*Fixes in the lab:* `selinux_*` renamed to `mac_runtime`/`mac_persistent` (BL-5 asks for mandatory
access control to be enforcing, not for SELinux specifically); ufw and apt branches added; a fourth
status **`NOT APPLICABLE`** introduced, distinct from `SKIPPED` — `firewall_layers_agree` guards
firewalld's runtime set drifting from its permanent set, and ufw has one rule set, so the failure
cannot occur. Merging the two would put permanent, unfixable noise in the coverage-gap column until
nobody reads it.

*Pipeline change:* `references/patterns.md` gains the four-status contract
(PASS / FAIL / ACTION REQUIRED / SKIPPED / NOT APPLICABLE) with the rule that made it necessary:
**naming a check after one mechanism is how a correct host gets reported as failing.**

**D. Two defects in G6, both found by running it rather than reading it.**

1. *The gate reported a pass having scanned zero bytes.* The pre-push hook scans committed history.
   On a repo with no commits that is `~0 bytes` and `no leaks found`, printed under a green tick.
   Exactly the SC-6 shape the pipeline exists to prevent.
   *Fix:* detect the no-commit case and scan the working tree instead — and **print which target was
   scanned**, because "history" and "working tree" answer different questions.
2. *A content scanner cannot see a vault password.* `.vault_pass` holds the key to every vault in the
   repo; gitleaks reads it and reports clean, correctly — it is a bare high-entropy string matching
   no rule. Same for a raw token in `.mcp.json` or an account id in `backend-<env>.hcl`. For that
   class the only protection is `.gitignore`, one `git add -f` from being bypassed with no second
   opinion.
   *Fix:* a path guard that runs **before** the scanner and fails closed on any tracked file that
   *is* a credential rather than one that might contain one. Tested both directions.

Both are in `knowledge/templates/secret-scan/pre-push` and `skills/secret-scan/SKILL.md`.

**E. The same parse implemented twice, so fixing one left the other wrong.** `sshd -T` emits one line
per value for multi-value keywords; `AllowGroups a b` comes back as two `allowgroups` lines. Taking
`| first` sees one group and fails a correct host. This was fixed in `fleet_verify` and then found
again, unfixed, in `fleet_compliance` — two roles that both had to parse the same output.

*Pipeline change:* the `sshd -T` normalisation trap is already in `verify-chain.md`; what this run
adds is the review question — **"is this parse implemented anywhere else in the repo?"** — as an
explicit item, because the second copy is invisible to the test that caught the first.

**F. The same escaping trap, three times in one repo, and it fails silently every time.** The
number of backslashes a regex needs depends on the **YAML scalar style**, and the intuition is
backwards. Measured on 2.21, same expression, same data:

| Scalar style | YAML processes `\`? | Correct form | `\\s` gives |
|---|---|---|---|
| `>-` / `\|` (block) | no | `\s` | **False** — never matches |
| `'...'`, plain | no | `\s` | **False** |
| `"..."` | yes | `\\s` | True |

Most Ansible regexes live in block scalars, so **the careful-looking double backslash is the broken
one** — it reaches the engine as "literal backslash, then s". There is no error: the check goes
FAIL while printing a correct *observed* value, so it reads as a host problem. Four instances
existed at once, including in the assert written to prevent a self-lockout (it would have refused
every legitimate run). A fifth appeared later as `regex_search(..., '\1')` → Jinja turned `\1`
into the control character `\x01` → "Unknown argument".

*Pipeline change:* the measured table is now in `references/patterns.md` and the one-line rule in
`rules/ansible.md`, together with two habits that make it not happen — prefer a match with **no
backslash class at all** (`split()[3]`, `'x' in line`), and when a regex fails against data you can
see is right, test the expression in both scalar styles before touching the data. Related:
Ansible's `search`/`match` are `re.search` with no flags, so `^` means start-of-*string*; multi-line
tool output needs `multiline=True`.

**G. Testing a checker against compliant hosts tests nothing.** Two defects were written, passed
lint, passed a live run, and were caught only by a reader who checked the tool's documentation:

- `apt-get` returns **100 on error**; `dnf check-update` returns **100 for "updates available"**.
  Copying dnf's `failed_when: rc not in [0, 100]` onto apt made every apt failure a successful
  read with no `Inst ` lines — `0 updates available` → **PASS**. A host that cannot be patched at
  all, certified as fully patched, by the one check that exists to detect under-patching.
- `aa-status` answers **in its exit code**: 0 enabled+policy, 1 not enabled, 2 no policy loaded,
  3/4/42 could-not-look. Treating every non-zero as "could not look" reported SKIPPED for a host
  with AppArmor switched off — the exact state the check exists for — and the run exited 0.

Both were tested against healthy hosts, where the tool returns 0 and everything looks right. The
failure only appears on a host that is already broken, which is the only kind a compliance check is
for. *Pipeline change:* an exit-code table in `patterns.md`, the rule in `rules/ansible.md`, and a
new **Unearned-pass** category in `agents/ansible-reviewer.md` whose first question is *"could this
host have answered, and did we ask the right way?"*

**H. An `rc` gate in `when:` deletes the assert it was meant to protect.** Found by both reviewers
independently. `failed_when: false` on a probe plus `when: probe.rc == 0` on the assert means a
probe that could not run **skips** the assert — a green play that verified nothing. The
`display_skipped_hosts = False` in the shipped `ansible.cfg` then hid the evidence.

The first fix was to flip that to **True** — and measuring it showed why nobody keeps it that way:
135 `skipping:` lines against 419 tasks, a third of the output as OS-branch chatter. Output nobody
reads is its own failure mode, so a blanket display policy cannot win in either position.
*Pipeline change:* the setting stays **False** and each **gate announces its own absence** —
an explicit `debug` in check mode saying NOT VERIFIED / NOT PREVIEWED, on the one host at the one
moment it matters. The rule underneath is: a *report* may answer SKIPPED; a *gate* may not, and a
gate that cannot run must say so in its own voice rather than relying on a global setting.

**I. Provisioning tools sit outside the pipeline's secret hygiene.** `vultr-cli instance create`
prints the provider-generated root password to stdout, where it lands in shell history and in any
session transcript. Nothing in the playbooks caused it and nothing in them could have prevented it.
`fleet_access`'s *"Lock the provider-generated root password"* task exists precisely because that
credential is born exposed — worth stating in the docs rather than leaving as folklore.

## 4. Notes

- **G3 being skipped is the correct behaviour and now the documented one.** This is the first project
  to take the G2 → G3b path, and the run confirmed the branch works end to end.
- **The lab's own runbook contained an SC-6.** `incident-replay.md` asserted "two `failed_when: false`
  uses exist"; the real count is 18. Nothing was broken — every one is a read-only probe whose
  undefined result becomes a visible `SKIPPED`, or a rescue-path restart that must not mask the
  original error. But a confident, specific, wrong number in a document about not letting checks
  report unearned passes is the same failure in prose. Rewritten to state the rule that holds —
  *no suppressed failure may reach a reader as a pass* — and to tell the reader to count for
  themselves.
- **Idempotency was proved by real second runs throughout**, never by `--check`. Check mode skips
  `command`/`shell`, the exact class that breaks idempotency, and a bare `changed_when: true` makes
  the `changed=0` proof impossible by construction while satisfying `ansible-lint`'s
  `no-changed-when`. The lint passes and the claim becomes unprovable — worth knowing as a pair.
- **Acceptance: 16/16.** Every NT item has raw output behind it in `docs/acceptance/`; the SC-1…SC-7
  replays were executed against real hosts rather than described. **Teardown verified**: `instance
  list` *unfiltered* returns `TOTAL 0`, reserved IPs / snapshots / block storage all zero, and all
  four addresses time out. Checking the tag instead of the whole account is how a hand-made host
  survives a teardown that reports success.
- **The lab found five defects in the pipeline itself** (two in G6, one each in `ansible.cfg`,
  `/infra-document`'s Terraform assumptions, and the `.gitignore`/pre-push vault coverage), and the
  G4 reviewers found nine High findings in the lab — of which **two were written by me the same
  day**, both from testing a checker against healthy hosts.
- **One decision was reversed by measurement.** `display_skipped_hosts = True` was the obvious fix
  for "check mode hides the safety gates" — until it printed 135 skip lines against 419 tasks.
  Neither position wins; the gates now announce their own absence instead. Worth remembering as a
  shape: when a global setting cannot be right in either position, the answer is usually local.
- **Cost:** 4 × `vc2-1c-1gb` in `sgp` for roughly one working day.
