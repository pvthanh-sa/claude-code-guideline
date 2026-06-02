---
name: spec-architect
description: 'Stage 1 of the DevOps pipeline. Interactively co-design an infrastructure spec with the user before any code is written. Asks discovery questions, consults Well-Architected + pricing, and writes docs/specs/<name>.spec.md. STOPS at human gate G1 — never auto-initializes a project.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion
argument-hint: '[spec-name]'
---

# Spec Architect — Stage 1 (Spec)

Co-design an infrastructure spec **together with the human**. You are the Solution Architect
co-pilot; the human is the decision-maker. Your job is to ask good questions, propose a
Well-Architected design, estimate cost, and capture it all in a reviewable spec file.

> **Human gate G1:** This skill produces a spec and then **STOPS**. Do NOT create project
> folders, do NOT run `/init-project`, do NOT write any Terraform. End by handing the spec
> back for approval.

**Spec name:** first token of `$ARGUMENTS` (kebab-case). If absent, ask the user for one.
**Output path:** `docs/specs/<spec-name>.spec.md` (create `docs/specs/` if needed).

> **MCP for this stage (ephemeral, not global).** Because spec runs *before* the project has a
> `.mcp.json`, the advisory servers (`aws-knowledge`, `well-architected`, `aws-pricing`) are loaded
> **only for this session** via `claude --mcp-config ~/.claude/spec-mcp.json` (template:
> `claude-code-guideline/.mcp.spec.json`). They are not installed globally (to avoid token cost in
> other sessions) and need no cleanup afterward. If these servers are NOT present in the session,
> tell the user to relaunch with the `--mcp-config` flag, **or** proceed from first principles and
> note clearly in the spec that "real pricing / Well-Architected data is not available".

---

## Phase 1: Discovery (interactive — do not skip)

Read any context already present (`README.md`, existing `docs/specs/*`, an `.tf` tree if the
user points at one). Then **ask the user** the open questions below. Use the `AskUserQuestion`
tool for choices with clear options; ask free-form for the rest. **Batch related questions** —
don't interrogate one line at a time. Cover:

- **Workload:** what is being deployed? (web API, worker, static frontend, data pipeline…)
- **Traffic / scale:** expected RPS, growth, spiky vs steady, peak hours
- **Environments:** which of develop / demo / staging / production; same or different accounts
- **Data:** datastore (Aurora PostgreSQL/MySQL, DynamoDB, Redis…), size, retention
- **Compliance / sensitivity:** PII / healthcare / finance? any standard (HIPAA/PCI/SOC2)?
- **Budget:** rough monthly ceiling, cost sensitivity (non-prod allowed to be cheap?)
- **Availability:** SLO target, multi-AZ, multi-region, RTO/RPO
- **Integrations:** CI/CD platform, existing VPC/account, external services

Handle "unclear" in two ways — never make the user invent the answer, and never fabricate facts:

- **Technical/design decisions** (service choice, instance sizing, Serverless vs provisioned,
  single vs multi-AZ, WAF y/n, …): **propose the best option with a one-line rationale + trade-off
  and a clear default.** Record in §9 as *"Recommendation: X (because …) — confirm / change"*. Add
  value — do not dump a blank question.
- **Business facts only the user knows** (budget ceiling, real traffic, compliance constraints,
  which environments, data sensitivity): ask. If still unknown, record in §9 as
  *"Need from you: …"* — do NOT invent a number or assume a constraint.

## Phase 2: Design (Well-Architected)

Lean on whichever specialist skills the project has installed under `.claude/skills/` that match
the spec's stack — `cloud-architect` for AWS architecture, `kubernetes-specialist` for K8s,
`postgres-pro` for databases, etc. Pick by context; don't assume a stack the project doesn't use.
By default follow `cloud-architect`'s flow (Discovery → Design → Security → Cost). If these MCP
servers are configured, use them; otherwise note the gap in the spec and proceed from first
principles:

- **`well-architected`** — sanity-check the design against the 6 pillars (esp. Security,
  Reliability, Cost). Surface any high-risk items.
- **`aws-knowledge`** — confirm service choices / limits / current best practice.
- **`aws-pricing`** — estimate monthly cost per major component for §6.

Design to the project rules: least-privilege IAM, encryption at rest + in transit, default-deny
SGs, no public SSH, secrets in Secrets Manager/SSM (`.claude/rules/security.md`), and AWS-primary
+ Terraform defaults (`.claude/CLAUDE.md`).

## Phase 3: Map to reusable modules (optional but recommended)

If the custom module library is available — i.e. the user has `/add-dir`'d
`/home/lg-vietnam007/Documents/Devops/terraforms/custom-infrastructure`, or a `MODULES.md`
catalog is readable there — pre-fill §8 by mapping each architecture component to an existing
module (`network`, `alb`, `ecs`, `rds`, `elasticache_*`, `acm`, `waf_standard`, `cloudfront`,
`s3_*`, …). Flag any component with **no** matching module as "new module needed". If the library
isn't loaded, leave §8 as a TODO and note it.

## Phase 4: Write the spec

Write `docs/specs/<spec-name>.spec.md` using the template below (kept in sync with
`knowledge/templates/infra-spec-template.md`). Fill every section from the discovery answers. In
§9, default to **recommended options with rationale** for design decisions (the user confirms or
overrides) and **"Need from you"** only for genuine business unknowns — never invent factual
values.

<details><summary>Spec template (inline)</summary>

```markdown
# Infra Spec — <project / change name>

- **Author:** <you>   **Date:** <YYYY-MM-DD>   **Status:** Draft
- **AWS account / region:** <account> / <region>

## 1. Context & Goals
- Problem / need · Desired outcome · Constraints (deadline, budget, compliance)

## 2. Scope
- In scope · Out of scope

## 3. Architecture
- Summary · Services (AWS) · Data-flow diagram (ASCII) · HA / multi-AZ / multi-region

## 4. Environments & Naming
| Env | Prefix | Account/Region | Notes |
- Naming `${var.app_name}-<resource-type>`; module prefix `${var.environment}-${var.app_name}`
- State: S3 `key = "<env>/terraform.tfstate"`, `use_lockfile = true`

## 5. Security
- IAM least-privilege · Network (SG default-deny, VPC endpoints, no public SSH) · Encryption
  (rest+transit) · Secrets (Secrets Manager/SSM) · Compliance

## 6. Cost estimate (aws-pricing)
| Item | Configuration | Cost/month (est.) | — Savings levers

## 7. SLO / RTO / RPO
- SLO · RTO/RPO · Backup & DR

## 8. Reusable modules (map to MODULES.md)
| Spec component | Module in custom-infrastructure | New module needed? |

## 9. Decisions needing the human (open at G1)
> Recommendation = Claude proposes the best technical option + reason; you confirm/change.
> Need from you = a missing business fact only you know (never fabricated).
- [ ] **Recommendation:** <X> (because <reason/trade-off>) — *confirm / change to <Y>?*
- [ ] **Need from you:** <fact only you know, e.g. budget ceiling>

## 10. Rollback
- Strategy · Quick rollback steps
```

</details>

## Phase 5: STOP at Gate G1

Print a short recap, then hand control back:

```
## Spec ready for review (G1)

Written: docs/specs/<spec-name>.spec.md

### Architecture summary:
[3-5 lines]

### Cost estimate: ~$X/month

### Recommendations awaiting your confirmation (§9):
- [ ] Recommendation: <X> (because <reason>) — confirm / change?

### Need from you (missing facts, not fabricated):
- [ ] <e.g. budget ceiling>

### Warnings (if any): [security/cost/HA risks]

---
👉 Read & edit the spec. Once approved:
   1) create the project folder, copy the spec into docs/specs/
   2) `cd` into the folder, run `claude`, then `/init-project`
(I STOP here — I do not auto-init.)
```

**Do not proceed past this point.** Wait for the human.
