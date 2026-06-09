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
| Misconfig #1 | **Checkov** (1000+ policy-as-code rules) | report-only → Security tab |
| Misconfig #2 | **Trivy config** (tfsec successor) | ✅ **blocks on HIGH/CRITICAL** |

Two misconfig scanners on purpose: Checkov and Trivy have different rulesets and catch different
issues. Checkov runs in **report mode** (Checkov CE has no severity threshold, so hard-failing on
every rule is too noisy); Trivy is the **hard gate** because it supports `--severity`. Both upload
SARIF, so all findings — including Checkov's — appear in the repo **Security tab**.

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
- **Branch protection:** mark the `iac-scan` check **Required** in repo settings so PRs can't merge red.

## Complements (not replaced by) this gate

- **Secrets:** `secret-scan.yml` (Stage 6) — separate gate.
- **AI review:** `/infra-review` (G4) — contextual security/cost judgment tools miss.
- **Runtime (Layer 5, outside this pipeline):** AWS Config conformance packs, Security Hub, GuardDuty,
  Inspector, drift detection — continuous monitoring after deploy.
