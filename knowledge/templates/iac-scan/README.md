# IaC scan CI gate (Stage 3 — defense-in-depth Layer 3)

The deterministic IaC checks run **locally** when you run `/iac-implement` (gate G3). This workflow
runs the **same checks server-side on every PR/push**, so nothing merges unscanned even if the local
flow is skipped — the standard production "local gate + CI gate" pattern (mirrors `secret-scan.yml`).

## What it runs

| Step | Tool | Blocking? |
|------|------|-----------|
| Format | `terraform fmt -check` | ✅ blocks |
| Syntax/validity | `terraform validate` (per dir, `-backend=false`) | ✅ blocks |
| Lint | `tflint --minimum-failure-severity=error` | ✅ errors block (warnings print, don't block) |
| Misconfig #1 | **Checkov** (1000+ policy-as-code rules) | report-only → run summary (+ Security tab on public repos) |
| Misconfig #2 | **Trivy config** (tfsec successor) | ✅ **blocks on HIGH/CRITICAL** |

Two misconfig scanners on purpose: Checkov and Trivy have different rulesets and catch different
issues. Checkov runs in **report mode** (Checkov CE has no severity threshold, so hard-failing on
every rule is too noisy); Trivy is the **hard gate** because it supports `--severity`.

### Where findings show up — depends on repo visibility

Code scanning (the Security tab) requires **GitHub Code Security / Advanced Security on private and
internal repos**. The workflow therefore gates the two SARIF uploads on
`!github.event.repository.private`:

| Repo | SARIF upload | Where you read findings |
|------|--------------|--------------------------|
| Public | runs | Security tab **+** run summary |
| Private/internal, no Code Security | **skipped** (clean grey, no error) | **Run summary** (Checkov counts + full report in a `<details>`), job log, and Trivy failing the job |

The skip is deliberate rather than `continue-on-error`: a step that fails or warns on *every* run
trains people to ignore the colour, and would also mask a genuine upload failure once the repo is
public. Nothing re-enables by hand — make the repo public or turn on Code Security and the uploads
resume on the next run.

Because Checkov is report-only, it needs a destination people actually see. Step **4b** writes its
pass/fail counts and check list to `$GITHUB_STEP_SUMMARY`, which renders on the workflow-run page —
so a rising failed-check count is noticeable even with no Security tab.

## Install

Automatic (preferred): `/iac-implement` installs/refreshes it into `.github/workflows/iac-scan.yml`.
Manual: copy `iac-scan.yml` to `.github/workflows/`. CI needs no local tools (the workflow installs
them itself).

### Local tools (for the fast G3 gate — optional but recommended)

CI is the enforced gate; installing the tools locally gives you the same checks before you push:

```bash
# binaries
brew install tflint checkov trivy            # macOS / Linuxbrew
# or: pipx install checkov; tflint/trivy from their GitHub releases

# no-install fallback via Docker (note the GHCR ref — the Docker Hub aquasecurity/trivy is retired):
docker run --rm -v "$PWD":/repo ghcr.io/aquasecurity/trivy:latest config /repo --severity HIGH,CRITICAL
docker run --rm -v "$PWD":/repo bridgecrew/checkov:latest -d /repo --framework terraform --compact
```

## Tuning

- **Make Checkov blocking:** remove `--soft-fail` and curate a `.checkov.yaml` (`skip-check: [CKV_AWS_123]`)
  to silence accepted findings.
- **Adjust Trivy severity:** edit `severity: CRITICAL,HIGH` (e.g. add `MEDIUM`) or add a `.trivyignore`.
- **Severity policy (production norm):** Critical → block; High → block or manual-approve; Medium/Low → log.
- **Branch protection:** mark the `iac-scan` check **Required** so PRs can't merge red. The template
  ships **without** `paths:` filters precisely so this is safe — see "Why no paths filter" below.
- **A check must have run once before it can be marked Required** — GitHub's picker only lists checks
  it has seen. Open one PR that exercises the workflow, then set branch protection.

## Why no `paths:` filter

A required status check must be able to report on **every** PR. A workflow skipped by a path filter
reports *no* status, and GitHub cannot distinguish "skipped" from "not started" — so a required check
that can be skipped blocks any PR outside those paths **forever**: nothing failed, nothing to re-run,
nothing to fix. (The filter is evaluated over the PR's whole base…head diff, so a PR that adds a file
and removes it again locks itself out too.)

The cost is ~2-4 min of runner time on PRs that change no Terraform. Take it — one deadlocked PR
costs more than a year of that. It also closes a real gap: the scanners read the **whole tree**, not
the diff, so a finding arriving via a merge into a stale branch is only caught by a run that was not
filtered away.

**If minutes are genuinely scarce (large monorepo):** do not filter the *trigger*. Keep it unfiltered
so the job always reports, and gate the expensive **steps** on a change-detection step (e.g.
`dorny/paths-filter`, SHA-pinned per `rules/cicd.md`). The check still reports success on every PR —
it just does no work when nothing relevant changed.

**Repos that may contain zero `.tf` files:** confirm fmt/tflint/checkov/trivy all exit 0 on an empty
tree before relying on this; only `terraform validate` guards that case here.

## Gotchas

- **The first push to an empty repo does not trigger this workflow.** Path filters are evaluated
  against a two-dot diff, and the initial commit has no parent to diff against, so nothing matches
  and the run is skipped. GitHub documents "always run" fallbacks only for >1,000 commits and diff
  timeouts — *no diff base* is not one of them. `secret-scan.yml` still runs (it has no filters). To
  exercise this gate on a fresh repo, push a second commit that touches a `.tf` file, or open a PR.
- **`paths` on `pull_request` uses a three-dot diff** (merge-base…head) while `push` uses two-dot.
  Testing one does not prove the other; the PR path is the one that actually guards merges.

## Complements (not replaced by) this gate

- **Secrets:** `secret-scan.yml` (Stage 6) — separate gate.
- **AI review:** `/infra-review` (G4) — contextual security/cost judgment tools miss.
- **Runtime (Layer 5, outside this pipeline):** AWS Config conformance packs, Security Hub, GuardDuty,
  Inspector, drift detection — continuous monitoring after deploy.
