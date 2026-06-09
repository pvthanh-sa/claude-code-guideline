<!--
  Manual CLI reference for the pipeline's deterministic security scans.
  Same tools the skills (Stage 3 /iac-implement, Stage 6 /secret-scan) and the CI workflows
  (iac-scan.yml, secret-scan.yml) run — here so you can run any gate by hand, outside the flow.
-->

# Security scans — CLI reference (IaC + Secrets)

Two deterministic gate families. Run them by hand anytime; these are exactly what the pipeline and CI use.

| Gate | Stage | Tools | What it catches |
|------|-------|-------|-----------------|
| **IaC misconfig** | 3 (`/iac-implement`) | terraform fmt/validate · tflint · checkov · trivy config · AWS Access Analyzer | bad Terraform, insecure resource config, over-broad IAM |
| **Secrets** | 6 (`/secret-scan`) | betterleaks (→ gitleaks) | hardcoded keys/tokens/passwords before they reach GitHub |

> **Deterministic, not AI.** Same input → same findings every run. The AI layer (`/infra-review`, G4)
> is separate and complementary — it adds contextual judgment these tools can't.

---

## 0. Install the tools (once)

**Prefer binaries** (CI uses binaries — this keeps local closest to CI). macOS / Linuxbrew:

```bash
brew install tflint checkov trivy gitleaks betterleaks
```

**Plain Linux, no sudo** (installs to `~/.local/bin`; ensure it's on `PATH`) — the verified commands:

```bash
# trivy
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b "$HOME/.local/bin"
# tflint (latest release binary)
ver=$(curl -s https://api.github.com/repos/terraform-linters/tflint/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+')
curl -sL -o /tmp/tflint.zip "https://github.com/terraform-linters/tflint/releases/download/${ver}/tflint_linux_amd64.zip" && unzip -oq /tmp/tflint.zip -d "$HOME/.local/bin"
# checkov
pip install --user checkov
# gitleaks: static binary from github.com/gitleaks/gitleaks/releases  ·  betterleaks: see secret-scan README
```

> **Docker fallback** (only if you can't install a binary): `ghcr.io/aquasecurity/trivy`,
> `bridgecrew/checkov`, `ghcr.io/betterleaks/betterleaks` (Docker Hub `aquasecurity/trivy` is
> retired). Binary is preferred — closer to CI and no per-tool Docker quirks.

`terraform` and `aws` CLI are assumed installed.

---

## 1. IaC scans (Stage 3 equivalent)

Run from the repo root. Order = fail-fast (cheap checks first).

### 1.1 Format
```bash
terraform fmt -check -recursive -diff      # non-zero if anything isn't canonically formatted
terraform fmt -recursive                   # ...or just fix it
```

### 1.2 Validate — ROOT configs only
Validate **root** dirs (those with a `provider`/`backend` block), **not** `modules/*`. Modules are
validated transitively by the roots that call them; validating a module standalone throws false
errors (e.g. *"output refers to sensitive values"*, missing provider `configuration_aliases`).

```bash
roots=$(grep -rlE '^[[:space:]]*(provider[[:space:]]+"|backend[[:space:]]+")' --include='*.tf' . \
        | grep -v '/\.terraform/' | xargs -r -n1 dirname | sort -u)
for d in $roots; do
  echo "== $d =="
  terraform -chdir="$d" init -backend=false -input=false >/dev/null   # no state access
  terraform -chdir="$d" validate
done
```

### 1.3 Lint
```bash
tflint --init                              # loads .tflint.hcl plugins (e.g. AWS ruleset), if present
tflint --recursive --format compact --minimum-failure-severity=error
```
- `--minimum-failure-severity=error` matches CI: **warnings print but don't block** (e.g.
  `terraform_unused_declarations` for an intentionally-reserved provider alias). Drop the flag to
  treat warnings as failures.

### 1.4 Misconfig scanner #1 — Checkov
```bash
checkov -d . --framework terraform --compact --quiet
#   docker:  $CHECKOV -d /repo --framework terraform --compact --quiet
```
- Exit non-zero on any failed check. 1000+ policy-as-code rules.

### 1.5 Misconfig scanner #2 — Trivy config (tfsec successor)
```bash
trivy config . --severity HIGH,CRITICAL
#   docker:  $TRIVY config /repo --severity HIGH,CRITICAL
```
- **Run BOTH** Checkov and Trivy — different rulesets, different findings (production norm). E.g. on a
  test repo Trivy flagged `AWS-0132` (S3 not using a CMK) while Checkov added VPC flow logs, secret
  rotation, default-SG, query logging — neither alone is complete.

### 1.6 IAM policy validation — AWS Access Analyzer *(only if the change defines IAM policies; needs AWS creds)*
Deterministic AWS-native check that complements checkov/trivy: grammar + best-practice (over-broad
`*`, missing conditions) on the **policy document** itself.

```bash
# Extract each rendered policy from the plan, then validate it:
terraform plan -out=tfplan && terraform show -json tfplan > tfplan.json
# for every IAM policy JSON found (identity vs resource policy):
aws accessanalyzer validate-policy \
  --policy-type IDENTITY_POLICY \
  --policy-document file://policy.json \
  --query 'findings[].{type:findingType,detail:findingDetails}'
```
- Treat `ERROR` / `SECURITY_WARNING` as must-fix. Skip cleanly if no creds (CI / G4 covers it).

### 1.7 Run the whole IaC chain
```bash
terraform fmt -check -recursive \
 && for d in $(grep -rlE '^[[:space:]]*(provider[[:space:]]+"|backend[[:space:]]+")' --include='*.tf' . | grep -v '/\.terraform/' | xargs -r -n1 dirname | sort -u); do
      terraform -chdir="$d" init -backend=false >/dev/null && terraform -chdir="$d" validate || break
    done \
 && (tflint --init; tflint --recursive --format compact --minimum-failure-severity=error) \
 && checkov -d . --framework terraform --compact --quiet --soft-fail \
 && trivy config . --severity HIGH,CRITICAL
```

---

## 2. Secret scan (Stage 6 equivalent)

**Betterleaks preferred** (original Gitleaks author, drop-in: reads `.gitleaks.toml` + `.gitleaksignore`).
Native subcommand is `git` (history) / `dir` (working tree) — **not** `detect` (that's gitleaks).

```bash
CFG=""; [ -f .gitleaks.toml ] && CFG="--config .gitleaks.toml"

# committed history (what you're about to push)
betterleaks git . --redact $CFG
# working tree too (catches uncommitted secrets) — recommended before a commit
betterleaks dir . --redact $CFG

# Gitleaks fallback (binary on PATH):
gitleaks detect --no-banner --redact $CFG

# Docker (no binary) — -u matches host ownership so git won't reject the mounted repo:
$BLEAKS git /repo --redact --config /repo/.gitleaks.toml
```
- Exit 0 = clean. Non-zero = potential secret(s); output is redacted.
- **Real leak?** Remove it from code/history **and ROTATE the credential** — removing it is not enough.
- **False positive?** Add its fingerprint to `.gitleaksignore` (one per line).

**Local pre-push gate** (auto-installed by `/secret-scan --setup`): `.githooks/pre-push` runs the
above on every `git push` and blocks on a finding. Bypass (you own the risk): `git push --no-verify`.

---

## 3. Severity policy (what to do with findings)

| Severity | Action | Timeline |
|----------|--------|----------|
| **Critical** | ❌ block | fix now (< 24h) |
| **High** | ⚠️ block or manual-approve | this sprint |
| **Medium** | ℹ️ log / backlog | — |
| **Low** | ℹ️ optional | — |

Secrets are **always** treat-as-Critical (block + rotate).

---

## 4. Suppressions (accept a known finding deliberately)

| Tool | File / mechanism |
|------|------------------|
| Trivy | `.trivyignore` — one rule ID per line (e.g. `AWS-0132`) |
| Checkov | `.checkov.yaml` → `skip-check: [CKV_AWS_145]`, or inline `#checkov:skip=CKV_AWS_145:reason` |
| tflint | `.tflint.hcl` rule blocks (`rule "..." { enabled = false }`) |
| Betterleaks/Gitleaks | `.gitleaksignore` (fingerprints) or `.gitleaks.toml` allowlist (CEL/regex) |

Always record *why* a finding is accepted (comment / commit message) — suppressions are a security decision.

---

## 5. CI equivalents (defense-in-depth — local + server-side)

The same checks run server-side on every PR; never rely on local alone:

- **IaC:** `.github/workflows/iac-scan.yml` (template: `knowledge/templates/iac-scan/`) — installed by `/iac-implement`.
- **Secrets:** `.github/workflows/secret-scan.yml` (template: `knowledge/templates/secret-scan/`) — installed by `/secret-scan --setup`.

Mark both checks **Required** in branch protection so red PRs can't merge.

> **Runtime (out of scope here):** AWS Config conformance packs, Security Hub, GuardDuty, Inspector,
> drift detection — continuous monitoring *after* deploy, not part of this pre-merge gate set.
