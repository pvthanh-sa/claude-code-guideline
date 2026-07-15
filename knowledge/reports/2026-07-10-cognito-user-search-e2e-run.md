# E2E Pipeline Run Report — aws-cognito-user-search (2026-07-07 → 2026-07-10)

Second full end-to-end exercise of the 6-stage pipeline, and the **first with live
infrastructure**: real `terraform apply`, scripted functional validation against the deployed
stack, a review-driven fix round on live resources, and a verified `terraform destroy`. Run in
delegated mode (operator authorized gate approvals, apply, and teardown up front). Lab: the AWS
Architecture Blog's *"Building a scalable user search layer on top of Amazon Cognito"*,
re-implemented in Terraform at `~/Documents/Devops/terraforms/aws-cognito-user-search`.

## 1. What was produced

**Lab artifacts** (all in the lab repo, uncommitted — operator owns git):
- `docs/specs/aws-cognito-user-search.spec.md` — G1 spec incl. §9 risk register (10 initial
  acceptances → 27 tracked after G4, each with a before-prod precondition)
- 7 project-local Terraform modules (the shared library had **zero** matches for this
  serverless stack) + `environments/singapore-prod` + 5 Python Lambdas (boto3-only, zip)
- `scripts/e2e-test.sh` — 23-check functional suite (poll-with-timeout, negative tests,
  self-cleanup); `docs/functional-tests.md` — evidence of 5 runs
- `docs/reviews/singapore-prod-2026-07-08.md` (deep review, GO-WITH-FIXES, 30 findings) and
  `…-2026-07-10.md` (baseline re-review, **GO**, 6 resolved / no regression)
- `docs/infrastructure.md` + `docs/diagrams/infra.drawio` (validator PASS 0/0) +
  auto-exported, vision-checked `infra.png` + `README.md`
- Secret-scan guardrail (`.gitleaks.toml`, pre-push hook, CI workflow) — betterleaks clean
- Library housekeeping: `$TF_MODULE_LIB/MODULES.md` regenerated (42 modules)

**Gates:** G1 ✓ (delegated) · G2 ✓ · G3 ✓ plan 52→53 add, applied · functional E2E ✓ 23/23 ·
G4 ✓ deep → fix High + 6 cheap items → baseline re-review GO · G5 ✓ · G6 ✓ clean ·
**teardown ✓** (53 deleted; account spot-check empty; state bucket kept). Total AWS spend ≈ $9
(dominated by the aoss 1-OCU floor across a 2.5-day pause — see item F).

**Defects the pipeline caught before/at the right gate** (evidence the loop works):
- *Plan-time:* `count` on unknown values; **silent loss of the entire Cognito trigger wiring**
  (a `for_each`/`dynamic` filtered on unknown module outputs → empty map, no error — caught by
  reading the plan resource list, fixed by static keys).
- *Functional-test-time (invisible to every static gate):* aoss returns generic 403 without
  `x-amz-content-sha256` (SigV4Auth alone doesn't add it); **Cognito redacts identities in
  CloudTrail events** (`HIDDEN_DUE_TO_SECURITY_REASONS` — only `additionalEventData.sub`
  is usable; resolved via `ListUsers --filter sub=`); DynamoDB-stream ESM with
  `starting_position=LATEST` silently drops writes made during its ~1-min activation
  (fixed with TRIM_HORIZON + idempotent ingest).
- *Review-time (G4):* 1 High — JWT validity treated as authorization while self sign-up is
  open (any internet user could dump the PII directory) → group-gated + response whitelist,
  verified by a new 403 test; plus TLS-only bucket deny, transposed throttle limits,
  `tfplan*` not gitignored, injection-shaped filter interpolation, a policy↔role rename
  hazard (now a `check` block).

## 2. What held up well

- **The G3 validate chain + G4 two-round review flow.** fmt/validate/tflint/checkov/trivy →
  plan-read caught 2 real bugs pre-apply; `--deep` review found a genuine High that tools and
  tests missed; single-pass + `--baseline` + `--note` labeled 6 RESOLVED / no regression and
  verified all 7 fixes — exactly the designed iteration loop, first time exercised end-to-end.
- **Spec §9 as the risk-acceptance register.** Finders honored it (10→27 acceptances excluded
  from go/no-go but re-listed for validation); "baseline = what changed, §9 = what we chose"
  worked in practice.
- **The new Stage-5 diagram toolkit (first greenfield run).** Validator PASS on first attempt
  (the reference + catalog prevented bad stencils up front); auto-export worked; the **vision
  check earned its place** — it caught 3 render-only defects across 2 fix rounds: a
  catalog-valid stencil that renders as a blank dark square (`authenticated_user` with the
  resourceIcon style), edges bisecting node labels (bottom-center exits), and two edge labels
  colliding mid-corridor.
- **File-first + durable journals across three token-outage pauses.** Nothing was lost: the
  workflow journal (`journal.jsonl`) survived tmp cleanup and the G4 report was rebuilt from
  it; background processes (apply, e2e suite) survived one pause and completed.
- **Delegated mode is workable**: `disable-model-invocation` skills were executed by reading
  each SKILL.md and following its phases verbatim; every gate decision was recorded in the
  artifacts themselves (spec §9, review reports, functional-tests.md).

## 3. What to improve (concrete)

- **A — The guide ends at "you run apply"; everything after was undocumented.** This run's
  most valuable defects (aoss header, CloudTrail redaction, ESM race) are only discoverable
  **after** apply, and teardown had no runbook. → Add an **"After G3: apply → verify →
  teardown"** section to `pipeline-usage-guide.md`: scripted functional validation (poll with
  timeout — eventual-consistency paths like CloudTrail→EventBridge need retries, not
  fail-fast; negative tests; self-cleanup), post-apply IAM Access Analyzer, and a teardown
  runbook (`plan -destroy` → review → `apply tfplan-destroy` → account spot-check) with an
  idle-floor cost warning.
- **B — Idle-floor cost across pauses.** The aoss 1-OCU floor billed through a 2.5-day pause
  (~$6/day); the operator had to destroy manually mid-run. Rebuild from state+code took ~5
  minutes, which makes destroy-and-reapply the obviously correct pause strategy — but the
  guide never said so. → Same new section: "pausing a lab? destroy idle-floor resources
  (aoss/NAT/ALB/provisioned RDS); state makes rebuild cheap."
- **C — G3's Access Analyzer step can't run at plan time on greenfield stacks.** Inline
  policies referencing not-yet-applied resources are unknown in `tfplan.json`, so only trust
  policies validate (and those false-positive as RESOURCE_POLICY). This run validated the 10
  live policies post-apply instead (all clean). → Note in `iac-implement` Phase 4 + guide:
  greenfield ⇒ defer identity-policy validation to post-apply/G4; don't validate trust
  policies as resource policies.
- **D — `authenticated_user` renders blank with the resourceIcon style** despite being
  catalog-valid — a silent-failure class the validator cannot catch (only vision can). → Add
  to `drawio-reference.md` §Gotchas; prefer `user`/`users` for actors.
- **E — Secret-scan on a never-committed repo scans 0 bytes in `git` mode.** The gate passed
  vacuously until the working-tree (`dir .`) pass ran. → One-line note in the guide's Step 6
  (the skill already documents `dir .` — surface it where the operator reads).
- **F — MODULES.md regeneration drops hand-added annotations** (external-repo markers were
  lost) and surfaced a dangling `modules/rds-cluster` reference in the library's
  `tokyo-staging` env. → `iac-implement` Phase 1: preserve a manual "Notes" section on
  regenerate; library owner should fix or remove the dangling env reference.
- **G — Delegated-run mechanics are tribal knowledge.** Pipeline skills are
  `disable-model-invocation` (correct for the human flow), so a delegated run = Claude reads
  each SKILL.md and executes it, using absolute paths when the session cwd isn't the lab, and
  self-approves gates *with the decision recorded in the artifact*. → Short FAQ box in the
  guide so the next delegated run doesn't rediscover this.

## 4. Notes

- Cost: ≈$9 total (aoss floor ~2.6 days + trail/S3/DDB/Lambda noise); would have been ~$3
  without the pause. Functional latencies measured: CloudTrail→EventBridge 20 s–3 min
  (blog says "near real time" — plan retries accordingly); index visibility ~10 s;
  delete-to-index-removal ~30–60 s.
- The aws provider 6.53 deprecation warning on `aws_dynamodb_table.hash_key` points at a
  `key_schema` attribute that doesn't exist in that version's schema — cosmetic, ignored.
- Review workflow economics: `--deep` = 13 agents / ~38 min / ~800k tokens; single-pass +
  baseline = 6 agents / ~17 min / ~325k. The cadence table's "deep first, single-pass
  re-review" guidance matches observed value.
- The e2e suite briefly had a vacuous-pass assertion (jq `all()` over an empty array);
  guarded with `length >= 1` — worth remembering when writing poll-based checks.
- Blog-fidelity deltas discovered (redaction, sha256 header, ESM race, ID-token audience)
  are documented in the lab's `docs/functional-tests.md` and `infrastructure.md` §3.

## 5. Update (same day) — improvements implemented

A/B/C/E/G folded into `knowledge/pipeline-usage-guide.md` (new "Step 3 §5 — After G3" section +
Step-6 note + FAQ box + cheat-sheet/G3-checklist/troubleshooting rows) and
`knowledge/devops-workflow.md` (G3 gate-table row + Step-3 paragraph). D added to the skill's
`drawio-reference.md` §Gotchas.
C/F notes added to `iac-implement/SKILL.md` (Phase 4 Access-Analyzer caveat; Phase 1
annotation preservation). All skills are symlinked, so the fixes are live for future runs.
