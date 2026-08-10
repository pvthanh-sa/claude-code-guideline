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

**First: is there a draft from an interrupted run?**

```bash
ls -1 docs/specs/*.spec.draft.md 2>/dev/null || echo "(none — full interview)"
```

If one exists, READ it and resume from Phase 2 — confirm its contents in a single message instead of
re-asking. The interview is the only thing in this skill a re-run cannot recreate; see Phase 1.5.

Read any context already present (`README.md`, an existing requirements/runbook doc, existing
`docs/specs/*`, a `.tf` tree or an `ansible/` tree if the user points at one). Then **ask the user**
the open questions below. Use the `AskUserQuestion` tool for choices with clear options; ask
free-form for the rest. **Batch related questions** — don't interrogate one line at a time.

**First establish the stack, because it decides which question set applies:**
provisioning (Terraform/cloud), configuration management (Ansible over existing hosts), or both.

**Always ask:**
- **Workload:** what is being deployed or managed?
- **Environments:** which of develop / demo / staging / production; same or different accounts
- **Compliance / sensitivity:** PII / healthcare / finance? any standard (HIPAA/PCI/SOC2)?
- **Integrations:** CI/CD platform, existing accounts, external services
- **Acceptance:** how will the human verify this is done? (fills §11 — see Phase 4)

**If the stack provisions cloud infrastructure, also ask:**
- **Traffic / scale:** expected RPS, growth, spiky vs steady, peak hours
- **Data:** datastore (Aurora PostgreSQL/MySQL, DynamoDB, Redis…), size, retention
- **Budget:** rough monthly ceiling, cost sensitivity (non-prod allowed to be cheap?)
- **Availability:** SLO target, multi-AZ, multi-region, RTO/RPO

**If the stack configures existing hosts, ask these instead — none of them are optional, and the
cloud question set above answers none of them:**
- **Fleet shape:** how many hosts, which OS families *and generations*, which providers/locations
- **Reachability:** direct SSH or via bastion? which user and key does the first connection use?
- **Blast radius policy:** max hosts touchable in one run; rolling or all-at-once; who may run it
- **Access today:** who has accounts/keys now, and where is that list kept (if anywhere)
- **Privilege model:** sudo with password or NOPASSWD; is there an identity system to defer to
- **Existing state:** is any of this configured already, by hand or by script? what must not break
- **Lockout policy:** what is the recovery path if SSH breaks — console, IPMI, provider rescue?

> **No user in the session** (headless, CI, or a subagent — `AskUserQuestion` cannot reach anyone)?
> Do **not** silently invent answers, and do not skip to Phase 2 with the questions unanswered.
> Write every unanswered question into §9 using the Recommendation / Need-from-you split below,
> mark the spec header **`status: DRAFT — Phase 1 not interviewed`**, and say so in your closing
> report. A spec built on assumed discovery is the thing G1 exists to catch.

Handle "unclear" in two ways — never make the user invent the answer, and never fabricate facts:

- **Technical/design decisions** (service choice, instance sizing, Serverless vs provisioned,
  single vs multi-AZ, WAF y/n, …): **propose the best option with a one-line rationale + trade-off
  and a clear default.** Record in §9 as *"Recommendation: X (because …) — confirm / change"*. Add
  value — do not dump a blank question.
- **Business facts only the user knows** (budget ceiling, real traffic, compliance constraints,
  which environments, data sensitivity): ask. If still unknown, record in §9 as
  *"Need from you: …"* — do NOT invent a number or assume a constraint.

## Phase 1.5: Persist the interview BEFORE designing anything

**The interview is the one input a re-run cannot recreate.** Everything after this point — the
Well-Architected pass, the pricing lookups, the module mapping — is work a machine can redo. The
user's answers are not: budget ceilings, real traffic, compliance constraints, which environments
exist. If the session dies in Phase 2 or 3 (MCP pricing calls and specialist skills are the
expensive part), re-running means asking a human the same questions again.

So write what you already know, immediately, before spending a token on design:

```bash
mkdir -p docs/specs
```

Write `docs/specs/<spec-name>.spec.draft.md` containing, verbatim, every answer from Phase 1 — the
stack, each question asked, each answer given, and each item recorded as *"Need from you: …"*. No
design, no recommendations, no cost: this file is a transcript, not a spec.

Open it with:

```markdown
> **DRAFT — interview only.** Phase 1 answers, captured before the design phase so a lost session
> costs tokens and not the user's time. `/spec-architect` reads this on the next run and resumes at
> Phase 2 instead of re-interviewing. Delete it when the real spec is written.
```

**On the NEXT run, read `docs/specs/<spec-name>.spec.draft.md` first.** If it exists, confirm its
contents with the user in one message (*"picking up from: <one-line summary> — still accurate?"*)
rather than re-asking the whole set, then go straight to Phase 2. Only re-interview what changed.

**Delete the draft in Phase 4**, once `docs/specs/<spec-name>.spec.md` is written — a stale draft
would make the next run resume from an interview that has been superseded.

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

> **Mandatory security default — CloudFront origin mTLS** *(applies only when CloudFront is in
> scope; if the design has no CloudFront, this rule is silent — do not carry an N/A row for it).*
> Whenever the design has **CloudFront in front of an origin you control** (ALB / custom origin),
> you MUST lock the origin to the
> distribution with **origin mTLS** — CloudFront presents a client certificate the origin verifies.
> A CloudFront **prefix list or a shared-secret header alone is NOT sufficient**: the origin-facing
> CloudFront IP ranges are shared across all AWS accounts, so anyone can point their own distribution
> at the origin and pass. Capture it in §5 (Security) and §8 (modules: `cloudfront` with
> `origin_client_certificate_arn` + an ALB listener running `mutual_authentication mode=verify` and a
> trust store). Exceptions: **S3 origins → OAC**; **in-VPC origins → prefer VPC origins/PrivateLink**.
> Do not silently omit this — if the user declines it, record the residual risk explicitly in §9.

## Phase 3: Map to reusable units (optional but recommended)

**Terraform stacks — map to modules.** If the custom module library is available (the user has
`/add-dir`'d it at `$TF_MODULE_LIB`, or a `MODULES.md` catalog is readable there), pre-fill §8 by
mapping each architecture component to an existing module (`network`, `alb`, `ecs`, `rds`,
`elasticache_*`, `acm`, `waf_standard`, `cloudfront`, `s3_*`, …). Flag any component with **no**
matching module as "new module needed". If the library isn't loaded, leave §8 as a TODO and note it.

**Configuration-management stacks — map to roles, and do NOT leave §8 empty.** `$TF_MODULE_LIB` may
well be set in the environment and point at an unrelated Terraform library; ignore it. There is no
role library, so §8 is where the role decomposition is *designed*: one row per role with its
concern, the host groups it targets, its public variable interface (`defaults/`), and the pinned
collections it needs. That table is the main output of G1 for this stack — leaving it as a TODO
throws away the design and leaves G3b with nothing to build from.

## Phase 4: Write the spec

> **§8.1 is the section `/ansible-implement` (G3b) reads as its source** — omitting it means the
> configure track starts from nothing. Include it whenever the stack has hosts; delete it for a
> serverless/managed stack. This skill has no `Bash`, so it cannot resolve and read the guideline
> repo's copy of the template — the inline copy below is therefore load-bearing, and the §1.5 doctor
> mechanically diffs the two heading lists so this pair cannot drift again unnoticed.

Once the spec file is written, delete the interview draft — a stale draft would make the next run
resume from questions this spec has already answered:

```bash
rm -f docs/specs/<spec-name>.spec.draft.md
```

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

## 8.1 Deferred to configuration management (Ansible — omit if the stack has no hosts)
| In-guest concern | Handled by | Values needed from Terraform |
- **Not automatable** (stays a human runbook step): <…>

## 9. Decisions needing the human (open at G1)
> Recommendation = Claude proposes the best technical option + reason; you confirm/change.
> Need from you = a missing business fact only you know (never fabricated).
- [ ] **Recommendation:** <X> (because <reason/trade-off>) — *confirm / change to <Y>?*
- [ ] **Need from you:** <fact only you know, e.g. budget ceiling>

## 10. Rollback
- Strategy · Quick rollback steps

## 11. Acceptance criteria (how the human verifies — filled at G1, checked at G4/G5)
> One row per claim the design makes. Each must be **observable**: a command to run and what its
> output must show. "The report says it passed" is not acceptance — the requirement that a gate be
> checked against real machine state, not against its own summary, lives or dies here.

| # | What will be checked | How (exact command / observation) | Satisfies |
|---|---|---|---|
| A-1 | <the claim> | <command + expected output> | <req id> |
```

</details>

## Phase 4.5: Self-critique (completeness pass)

Before presenting, **adversarially review your own spec** — a single design pass misses things.
Re-read it as a skeptical reviewer and check:

- **Missing requirements / unstated assumptions** — anything the user didn't specify that the design
  silently assumed (capacity, data retention, auth, multi-AZ, backups, scaling)?
- **Well-Architected gaps** — Reliability (SPOF, RTO/RPO), Security (IAM, encryption, exposure),
  Cost (oversize, redundant NAT), Operability (monitoring, alarms).
- **Downstream blockers** — anything too vague for Stage 3 (`/iac-implement`) to build from?

Fold each gap into §9 as a new **Recommendation** (with a suggested default) or **Need from you**
item, or into the warnings. Don't silently pass — surfacing a gap now is far cheaper than at G3/G4.

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
