---
name: iac-implement
description: 'Stage 3 of the DevOps pipeline. Turn an approved spec into Terraform by REUSING the custom module library (custom-infrastructure = golden source; standalone projects vendor copies in, edit-upstream-then-recopy) and authoring new standalone/reusable modules when the library lacks one (kept project-local unless you promote them). Generates/reads a MODULES.md catalog, scaffolds an environment directory following the tokyo-dev convention, runs the validate chain, and STOPS at human gate G3 with `terraform plan` — never applies.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write
argument-hint: '[spec-path] [target-env-dir]'
---

# IaC Implement — Stage 3 (Terraform from spec)

Implement the approved spec as IaC by **composing existing modules**, not by writing resources
from scratch. (This workflow targets Terraform; the steps below are Terraform-specific.)

> **Defer to the project's specialist skills — don't hardcode.** This project may have
> domain-specialist skills installed under `.claude/skills/` (model-invocable). Detect the IaC
> tool + stack from the spec/project and lean on whichever matches: `terraform-engineer` for
> Terraform, `kubernetes-specialist` for K8s, `postgres-pro` for DB tuning, `devops-engineer` for
> CI/CD, etc. Let context choose — never assume a tool the project doesn't use (e.g. if the spec
> is Ansible-based, don't pull in `terraform-engineer`). If no specialist matches, proceed with
> general best practices and the applicable `rules/` (auto-applied by file glob).

> **Human gate G3:** This skill ends at `terraform plan` and **STOPS**. It NEVER runs
> `terraform apply` (also blocked by `settings.json`) and never commits. Hand the plan back
> for the human to review and apply.

> **Module sourcing — `custom-infrastructure` is the golden source.** Two layouts exist; detect
> which one the target dir implies (ask if unclear):
> - **(A) Env inside the library** (target is `…/custom-infrastructure/environments/<env>`):
>   source modules in place via relative path (`../../modules/<name>`). No copying.
> - **(B) Standalone project repo** (target is its own repo, e.g. `voteapp_2025`,
>   `extracting-namecard-infrastructure` — has its own `modules/`): **vendor (copy)** the chosen
>   modules from the library into the project's local `modules/<name>` and source them locally
>   (`../modules/<name>` or `../../modules/<name>`, matching the project's depth). This matches
>   how the user's standalone repos actually work.
>
> **Golden-source rule (layout B):** if a vendored module needs changes, edit it **upstream first**
> at `$LIB/modules/<name>`, re-validate there, *then* re-copy into the project. Do **not** edit the
> project's copy in isolation — that silently forks it from the library and the fix never flows back.
> The only exception is a deliberate project-specific divergence; mark it clearly (provenance note
> below) and tell the user it is now a fork.

**Arguments:** `$ARGUMENTS` → first token = spec path (e.g. `docs/specs/api.spec.md`),
second token = target environment dir (e.g. `environments/tokyo-dev`). Ask if missing.

---

## Phase 0: Load inputs & the module library

1. Read the spec file. If it's still `Status: Draft` (not approved at G1), confirm with the
   user before continuing.
2. The custom module library must be readable. Check for it:

```bash
# Path comes from the TF_MODULE_LIB env var (no hardcoded default). Set it once per machine
# (Guide §1.3). If unset, stop and ask the user to export it.
LIB="$TF_MODULE_LIB"
if [ -z "$LIB" ]; then
  echo "ERROR: TF_MODULE_LIB is not set — export it first (Guide §1.3), e.g.:"
  echo '  export TF_MODULE_LIB="$HOME/path/to/custom-infrastructure"'
  exit 1
fi
if [ -d "$LIB/modules" ]; then echo "library: $LIB"; else echo "NOT LOADED ($LIB)"; fi
```

   If `NOT LOADED`, stop and ask the user to `/add-dir` the library — the path echoed above as
   `$LIB` (i.e. wherever `$TF_MODULE_LIB` points on this machine):
   `/add-dir <the $LIB path>`
   (optionally also a reference env, e.g. `.../new-clinic-infrastructure/environments/tokyo-dev`).

## Phase 1: Module catalog — read or (re)generate `MODULES.md`

The catalog lives at `$LIB/MODULES.md`. Generate it if missing or stale, else read it.

```bash
# stale if any module dir is newer than the catalog, or catalog is absent
if [ ! -f "$LIB/MODULES.md" ] || [ -n "$(find "$LIB/modules" -maxdepth 2 -newer "$LIB/MODULES.md" 2>/dev/null | head -1)" ]; then
  echo "REGENERATE"
else
  echo "FRESH"
fi
ls -1 "$LIB/modules"   # the list of modules
```

If `REGENERATE`: for each `modules/<name>/`, read its `variables.tf` (required inputs — those
without a `default`) and `outputs.tf` (output names), infer purpose from the directory name and
`main.tf` resources, and find an example usage under `$LIB/environments/*/main.tf` if present.
Then **write `$LIB/MODULES.md`** as a table:

```markdown
# Custom Terraform Module Catalog
> Auto-generated by /iac-implement. Refresh: delete this file and re-run, or it regenerates when a module changes.

| Module | Purpose | Required inputs | Key outputs | Used in env (example) |
|--------|----------|-----------------|-------------|--------------------|
| network | VPC + public/private subnets + NAT | name, cidr, azs | vpc_id, private_subnet_ids | tokyo-dev |
| alb     | Application Load Balancer + SG      | app_name, vpc_id, subnets | alb_arn, dns_name | tokyo-dev |
| ecs / ecs_cluster | Fargate service + cluster | app_name, image, vpc_id | service_name, task_role_arn | tokyo-dev |
| rds     | Aurora/RDS + Secrets Manager        | app_name, engine, subnets | endpoint, secret_arn | tokyo-dev |
| ...     | (one row per module under modules/) | | | |
```

Cover **every** module dir (the library has ~36: `network`, `vpc-endpoints-network`,
`alb`, `nlb`, `ecs`, `ecs_cluster`, `rds`, `rds_secret_rotation`, `elasticache_server_based`,
`elasticache_serverless`, `acm`, `internal_acm`, `cloudfront`, `s3_frontend`, `s3_backend_storage`,
`s3_api_assets`, `ecr_private_registry`, `codedeploy`, `waf_standard`, `waf_monitoring`,
`iam_role`, `aws_oidc_with_github_actions`, `client_VPN_endpoints`, `bastion_host`,
`cloudwatch_alarm_*`, `alert_email`, `chatbot_slack`, `ses`, `lightsail*`, …). Do not silently
drop modules — list them all.

## Phase 2: Map spec → modules + decide sourcing layout

1. Build the implementation plan: for each component in the spec's §3/§8, prefer an **existing**
   library module. The library does **not** cover everything, so authoring a new module is a
   **normal, expected** outcome — not a failure. For each gap, briefly tell the user the plan
   ("no library module for X → I'll author a new reusable module `x`") and proceed unless they'd
   rather (a) adjust the design to fit an existing module. Don't silently reshape a component just
   to avoid a new module. **New modules live in the project's local `modules/<name>` and are NOT
   promoted back to `custom-infrastructure`** — that only happens later, on your explicit request
   (then it follows the golden-source flow). Author them per Phase 2.6.
2. Decide the **sourcing layout** (see the "Module sourcing" callout above): **(A)** env inside the
   library, or **(B)** standalone project that vendors copies. Infer from the target path; confirm
   with the user. This determines the `source =` paths and whether Phase 2.5 runs.

## Phase 2.5: Vendor modules into the project (layout B only)

Skip for layout A. For a standalone project, **copy** each chosen module from the library into the
project, preserving the directory name, then stamp a provenance header so the copy is traceable
back to the golden source:

```bash
SRC="$LIB/modules/<name>"
DST="<project-root>/modules/<name>"
mkdir -p "$DST" && cp -R "$SRC/." "$DST/"
# provenance: which library version this copy came from
REF="$(git -C "$LIB" rev-parse --short HEAD 2>/dev/null || echo 'unversioned')"
printf '# vendored from custom-infrastructure/modules/%s @ %s on %s — edit UPSTREAM first, then re-copy\n' \
  "<name>" "$REF" "$(date +%F)" >> "$DST/.provenance"
```

Record the same `module @ ref @ date` line per vendored module in the project's `MODULES.md`
(create a short "Vendored modules" section) so a future session knows the source revision and the
golden-source rule. Never modify a vendored module in place — edit `$LIB/modules/<name>` and re-copy.

## Phase 2.6: Author a new module (when the library lacks one)

Write it at `<project-root>/modules/<name>/` (project-local; not in `custom-infrastructure`). Design
it as a **standalone, reusable** unit — assume it'll be reused in unrelated stacks later, so bake in
no environment- or project-specific values. Model it on existing library modules for consistency and
honor `.claude/rules/terraform.md`.

**Module-design checklist:**
- **Single responsibility** — one logical component (e.g. "an SQS queue + its DLQ + alarms"), not a
  grab-bag. If it does two unrelated things, split it.
- **Standard files**: `versions.tf` (only `terraform`/`required_providers` — **never** a `provider`
  block; the caller configures providers), `variables.tf`, `main.tf`, `outputs.tf`, plus `data.tf` /
  `locals.tf` if needed, and a short `README.md` (purpose + usage example + inputs/outputs).
- **Fully parameterized** — no hardcoded names, regions, account IDs, CIDRs, ARNs, or env names.
  Everything env-specific is an input. The caller passes identifiers in (e.g. `vpc_id`,
  `subnet_ids`); avoid reaching out via `data` sources for things the caller should own.
- **Variables**: every var has `description` + `type`; constrained vars get a `validation` block;
  safe defaults where sensible; booleans prefixed `enable_` / `create_` to make resources optional
  (`for_each`/`count` gated on them). Use `for_each` over `count` unless ordering matters.
- **Outputs**: expose everything a caller might wire downstream, each with a `description`;
  `sensitive = true` for secrets.
- **Naming & tags**: derive names from an input prefix (`${var.app_name}-<resource-type>`); tag via
  `merge(var.tags, { Name = "...", ManagedBy = "Terraform" })`. IAM via
  `data.aws_iam_policy_document`, never inline JSON. `dynamic` blocks for optional nested config.
- **Self-contained**: no backend/state config, no reference to a specific environment. It should
  `terraform validate` in isolation.
- Catalog it in the project's `MODULES.md` under a **"New modules (project-local)"** section so it's
  discoverable, and note it's a candidate to promote upstream later if it proves broadly useful.

If — and only if — the user asks to promote a new module into the shared library, copy it to
`$LIB/modules/<name>`, re-validate there, and from then on treat the library as the golden source.

## Phase 3: Scaffold the environment directory

Create the target env dir following the **tokyo-dev convention** (`.claude/rules/terraform.md`
§File Structure for environments). Generate these files:

- `versions.tf` — `required_version`, pinned providers (`aws >= …`, plus `awscc`/`tls`/`random`
  as needed)
- `providers.tf` — default region+profile provider **and** a `us-east-1` alias
  (`aws.virginia`) for CloudFront/ACM
- `backend.tf` — S3 backend, `use_lockfile = true`, `key = "<env>/terraform.tfstate"`
- `locals.tf` — centralized `tags` map (`merge` base), account id from `data.aws_caller_identity`
- `data.tf` — `aws_caller_identity`, AZs, any lookups
- `variables.tf` — every var has `description` + `type`; constrained vars get `validation`
- `main.tf` — module blocks via **relative source** pointing at the layout chosen in Phase 2:
  layout A → `../../modules/<name>` (library in place); layout B → the project's **vendored** copy
  (`../modules/<name>` or `../../modules/<name>`, matching the repo's depth — never reach back into
  `custom-infrastructure`). Instance prefix `${var.environment}-${var.app_name}`, `tags = local.tags`,
  wiring outputs between modules
- `terraform.tfvars` — concrete values from the spec (NO secrets — those go to Secrets Manager/SSM)
- `outputs.tf` — key outputs

Honor all conventions: naming `${var.app_name}-<resource-type>`, tagging
`merge(var.tags, { Name = "...", ManagedBy = "Terraform" })`, `for_each` over `count`,
`data.aws_iam_policy_document` for IAM, `sensitive = true` for secret outputs.

## Phase 4: Validate chain (per terraform.md)

Run, in order, and report each result:

```bash
terraform fmt -recursive
terraform init -backend=false   # validate without touching remote state
terraform validate
tflint || true
checkov -d . --quiet || true
```

Then, only if the user confirms backend/credentials are ready:

```bash
terraform init
terraform plan -out=tfplan
```

**IAM policy validation (AWS-native, complements checkov)** — run when the change defines IAM
policies. `checkov` catches misconfig patterns; AWS **Access Analyzer** `validate-policy` adds
grammar + best-practice + overly-permissive findings that linters miss. Best-effort (needs AWS
creds; skip cleanly if unavailable):

```bash
# Only if IAM policies are present in this env
if grep -rqE 'aws_iam_policy|aws_iam_role_policy|aws_iam_policy_document|assume_role_policy' . --include=*.tf; then
  terraform show -json tfplan > tfplan.json 2>/dev/null || true
  # Extract each rendered policy document from the plan and validate it. For every IAM policy /
  # assume-role / resource policy JSON found, run (IDENTITY_POLICY or RESOURCE_POLICY as appropriate):
  #   aws accessanalyzer validate-policy --policy-type IDENTITY_POLICY \
  #     --policy-document file://<policy>.json --query 'findings[].{type:findingType,detail:findingDetails}'
  # Surface every SECURITY_WARNING / ERROR / WARNING (e.g. wildcard "*" action/resource, missing
  # conditions). Treat ERROR/SECURITY_WARNING as must-fix; fold into the G3 report. || true on failure.
  rm -f tfplan.json
fi
```

> If creds aren't available at G3, defer this to G4 — `/infra-review`'s `security-auditor` also flags
> IAM least-privilege issues. Access Analyzer here is the *deterministic* complement (tool, not AI).

(The PostToolUse hook already auto-runs `terraform fmt` on edited `.tf` files.)

## Phase 5: STOP at Gate G3

```
## Terraform ready for review (G3)

### Sourcing layout: A (in-library) | B (standalone, vendored copies)
### Reused modules:
- network, alb, ecs, rds, ... (layout B: vendored into ./modules/ @ <lib-ref> — edit upstream first to change)
### New modules (if any): [name + reason — project-local under ./modules/, designed reusable; say the word to promote upstream]

### Validate chain:
- fmt ✓  validate ✓  tflint [n issues]  checkov [n failed]  [IAM Access Analyzer: n findings | n/a]

### terraform plan: [summary: +X / ~Y / -Z resources]

---
👉 Review the plan above. Once approved:
   - `terraform apply tfplan`  (you run it — I do NOT auto-apply)
   - or review first: `/infra-review <env-dir>`
```

**Do not run `terraform apply`. Do not commit.** Wait for the human.
