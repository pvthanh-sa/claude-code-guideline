# DevOps Workflow — Spec → Init → IaC → Review

A **human-in-the-loop** pipeline for the Solution Architect / SRE / Security Engineer roles,
built on Claude Code Core. It chains the existing skills, agents, and rules into one
end-to-end flow **with an approval gate at every stage transition** — Claude never auto-advances.

> **Philosophy:** Claude is the co-pilot, **the human is the driver**. Each step is a discrete
> skill: when it finishes it **STOPS**, presents its output, and waits for your approval. There is
> no "run everything automatically" mode.

> 📖 **Want a hands-on, step-by-step guide (worked example, checklists, troubleshooting)?**
> See [`pipeline-usage-guide.md`](pipeline-usage-guide.md). The file below is just the quick map.

---

## Pipeline map

```
  [Infrastructure request / change]
       │
   ┌───▼────────────────┐   ── G1 ──►  you approve the SPEC
   │ 1. SPEC            │
   │   /spec-architect  │   interactive spec-building (well-architected + pricing)
   └───┬────────────────┘
       │  docs/specs/<name>.spec.md (approved)
   ┌───▼────────────────┐   ── G2 ──►  you approve CLAUDE.md + scaffold
   │ 2. INIT           │
   │   /init-project    │   detect stack (reads spec) → CLAUDE.md + .mcp.json + skills
   └───┬────────────────┘
       │
   ┌───▼────────────────┐   ── G3 ──►  you approve `terraform plan` BEFORE apply
   │ 3. IAC            │
   │   /iac-implement   │   reuse custom modules → scaffold env → fmt/validate/tflint/checkov/plan
   └───┬────────────────┘
       │
   ┌───▼────────────────┐   ── G4 ──►  you approve the report → go / fix / no-go
   │ 4. REVIEW         │
   │   /infra-review    │   PARALLEL Workflow: security + infra + cost → one report
   └────────────────────┘
```

---

## Human Gates

| Gate | After step | You receive | You decide | After approval, run |
|------|------------|-------------|------------|---------------------|
| **G1** | `/spec-architect` | `docs/specs/<name>.spec.md` + list of open decisions | Is the spec right? Services/cost/SLO OK? | create project folder → `/init-project` |
| **G2** | `/init-project` | `CLAUDE.md`, `.mcp.json`, copied skills/agents/rules | Stack detected correctly? CLAUDE.md correct? Fill `.mcp.json` placeholders | `/add-dir` custom-infra → `/iac-implement <spec>` |
| **G3** | `/iac-implement` | `terraform plan` output (NO apply) | Plan correct? Resources sensible? Right modules reused? | you run `terraform apply tfplan` OR `/infra-review <env>` |
| **G4** | `/infra-review` | one merged report: severity + estimated savings + go/no-go | Which items to fix? Go or no-go? | ask Claude to fix specific items, or finish |

> **Safety invariant:** `settings.json` (copied into the project by `/init-project` if absent)
> denies `terraform destroy` and `terraform apply -auto-approve`. No skill in the pipeline
> auto-`apply`s or auto-commits — it always stops at a gate for you to decide.

---

## Who does what at each stage

| Stage | Primary skill | Agent / Workflow | MCP used | Rules applied |
|-------|---------------|------------------|----------|----------------|
| 1. Spec | `spec-architect`, `cloud-architect` | — | `well-architected`, `aws-pricing`, `aws-knowledge` | `security.md` |
| 2. Init | `init-project` | (copies `infra-reviewer`, `cost-optimizer`, `security-auditor`) | `aws-api`, `terraform`, `well-architected`, … | all copied rules |
| 3. IaC | `iac-implement`, `terraform-engineer` | `infra-reviewer` (quick check while writing) | `terraform`, `iac`, `aws-api` | `terraform.md`, `security.md`, `docker.md`, `cicd.md` |
| 4. Review | `infra-review` | **Workflow `infra-review`** → `security-auditor` + `infra-reviewer` + `cost-optimizer` | `aws-api`, `cloudwatch`, `iam`, `aws-pricing`, `well-architected` | `security.md`, `terraform.md` |

---

## Step-by-step

### Step 1 — Build the spec: `/spec-architect <name>`
Claude interviews you (workload, traffic, environments, compliance, budget, RTO/RPO), consults
Well-Architected + pricing, then writes `docs/specs/<name>.spec.md` per
[`templates/infra-spec-template.md`](templates/infra-spec-template.md).
**→ Stop at G1.** Read the spec carefully, edit the file directly if needed, then move to step 2.

### Step 2 — Bootstrap the project: `/init-project`
```bash
mkdir -p ~/Documents/Devops/<project-name> && cd ~/Documents/Devops/<project-name>
cp /path/to/docs/specs/<name>.spec.md docs/specs/   # bring the spec over so init can read it
claude
```
In the session: `/init-project`. The skill reads the spec (if present) for more accurate stack
detection, generates `CLAUDE.md` + `.mcp.json`, and copies the relevant skills/agents/rules.
**→ Stop at G2.** Fill the placeholders in `.mcp.json` (see
[`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)), review `CLAUDE.md`, restart.

### Step 3 — Implement IaC: `/iac-implement docs/specs/<name>.spec.md [env-dir]`
First, load the module library:
```
/add-dir /home/lg-vietnam007/Documents/Devops/terraforms/custom-infrastructure
# (optional) reference env:
/add-dir /home/lg-vietnam007/Desktop/Lion_Graden/clinic_online/new-clinic-infrastructure/environments/tokyo-dev
```
The skill reads/generates `MODULES.md` (catalog of 36 modules), maps spec → **reusable** modules,
scaffolds the environment directory per the tokyo-dev convention, then runs
`fmt → validate → tflint → checkov → plan`.
**→ Stop at G3** with the `plan` output. You run `terraform apply tfplan` once approved.

### Step 4 — Review before/after deploy: `/infra-review <env-dir>`
Calls the `infra-review` Workflow, which runs **three perspectives in parallel** (security /
infra-best-practice + waste / cost) and merges them into **one** report with severity + estimated
savings + a go/no-go recommendation.
**→ Stop at G4.** You choose which items to fix; Claude lists the work and waits for your
confirmation before changing any code.

---

## When to use Plan Mode before the pipeline
Per `.claude/CLAUDE.md`: production changes, new module/service/environment design, migration
strategy, cost-optimization reviews, security-architecture decisions → enable Plan Mode during the
Spec/IaC steps.

## Related
- [`pipeline-usage-guide.md`](pipeline-usage-guide.md) — **detailed A→Z guide (with a worked example)**
- [`setup-new-project.md`](setup-new-project.md) — install & symlink the pipeline skills
- [`templates/infra-spec-template.md`](templates/infra-spec-template.md) — spec template
- [`mcp-devops-setup.md`](mcp-devops-setup.md) · [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)
