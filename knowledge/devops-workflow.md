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
   │   /iac-implement   │   reuse/author modules → scaffold env → CI gate → fmt/validate/tflint/checkov/trivy/plan
   └───┬────────────────┘
       │
   ┌───▼────────────────┐   ── G4 ──►  you approve the report → go / fix / no-go
   │ 4. REVIEW         │
   │   /infra-review    │   PARALLEL Workflow: security + infra + cost → one report
   └───┬────────────────┘
       │
   ┌───▼────────────────┐   ── G5 ──►  you approve the document + diagram
   │ 5. DOCUMENT       │
   │   /infra-document  │   living doc + AWS-grouped infra.drawio (+ Mermaid verify) + README
   └───┬────────────────┘
       │
   ┌───▼────────────────┐   ── G6 ──►  secret scan clean → you `git push`
   │ 6. SECRET SCAN    │
   │   /secret-scan     │   Betterleaks/Gitleaks tool gate (pre-push hook + CI)
   └────────────────────┘
```

> **Sessions:** Stage 1 runs in a throwaway session (`claude --mcp-config …`); Stage 2 needs its own
> session in the new project dir, then a **restart** to load `.claude/`. **Stages 3 → 4 → 5 → 6 all
> run in that one project session** — no restart between them (and the in-session context carries the
> review results into the doc). Use `/compact`, not a new session, if it gets long.

---

## Human Gates

| Gate   | After step        | You receive                                                                | You decide                                                                 | After approval, run                                       |
| ------ | ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| **G1** | `/spec-architect` | `docs/specs/<name>.spec.md` + list of open decisions                       | Is the spec right? Services/cost/SLO OK?                                   | create project folder → `/init-project`                   |
| **G2** | `/init-project`   | `CLAUDE.md` (tracked) + `.claude/` & `.mcp.json` (**gitignored** — public-repo safe)      | Stack detected correctly? CLAUDE.md correct? Fill `.mcp.json` placeholders | `/add-dir` custom-infra → `/iac-implement <spec>`         |
| **G3** | `/iac-implement`  | `terraform plan` output (NO apply)                                         | Plan correct? Resources sensible? Right modules reused?                    | you run `terraform apply tfplan` OR `/infra-review <env>` |
| **G4** | `/infra-review`   | one merged report (severity + savings + go/no-go), saved to `docs/reviews/<env>-<date>.md` | Which items to fix? Go or no-go?                                           | ask Claude to fix specific items, then `/infra-document`  |
| **G5** | `/infra-document` | `docs/infrastructure.md` + `docs/diagrams/infra.drawio` (+ Mermaid verify) + `README.md` | Doc accurate? Diagram correct? README clear?                              | export drawio→PNG, delete Mermaid, commit                 |
| **G6** | `/secret-scan`    | scan result + installed guardrail (Betterleaks/Gitleaks)                   | Clean? any real leak to rotate?                                            | `git push` (pre-push hook + CI re-scan as backstop)       |

> **Safety invariant:** `settings.json` (copied into the project by `/init-project` if absent)
> denies `terraform destroy` and `terraform apply -auto-approve`. No skill in the pipeline
> auto-`apply`s or auto-commits — it always stops at a gate for you to decide.

---

## Who does what at each stage

| Stage       | Primary skill                         | Agent / Workflow                                                                       | MCP used                                                          | Rules applied                                         |
| ----------- | ------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Spec     | `spec-architect`, `cloud-architect`   | —                                                                                      | `well-architected`, `aws-pricing`, `aws-knowledge`                | `security.md`                                         |
| 2. Init     | `init-project`                        | (copies `infra-reviewer`, `cost-optimizer`, `security-auditor`)                        | `aws-api`, `terraform`, `well-architected`, …                     | all copied rules                                      |
| 3. IaC      | `iac-implement`, `terraform-engineer` | `infra-reviewer` (quick check while writing)                                           | `terraform`, `iac`, `aws-api`                                     | `terraform.md`, `security.md`, `docker.md`, `cicd.md` |
| 4. Review   | `infra-review` (writes `docs/reviews/`) | **Workflow `infra-review`** → `security-auditor` + `infra-reviewer` + `cost-optimizer` | `aws-api`, `cloudwatch`, `iam`, `aws-pricing`, `well-architected` | `security.md`, `terraform.md`                         |
| 5. Document | `infra-document`                      | —                                                                                      | (optional `aws-api` for live outputs)                             | —                                                     |
| 6. Secret scan | `secret-scan`                      | external tool: **Betterleaks** (fallback Gitleaks)                                     | —                                                                 | `security.md`, `cicd.md` |

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

The skill reads/generates `MODULES.md` (catalog of 36 modules), maps spec → **reusable** modules
(or authors new project-local ones), scaffolds the env per the tokyo-dev convention, installs the
**CI security gate** (`.github/workflows/iac-scan.yml`), then runs the validate chain
`fmt → validate → tflint → checkov → trivy config → plan` (+ AWS Access Analyzer on IAM policies).
Two misconfig scanners (Checkov + Trivy) catch different issues; the same checks re-run in CI on
every PR (defense-in-depth).
**→ Stop at G3** with the `plan` output. You run `terraform apply tfplan` once approved.

### Step 4 — Review before/after deploy: `/infra-review <env-dir>`

Calls the `infra-review` Workflow, which runs **three perspectives in parallel** (security /
infra-best-practice + waste / cost) and merges them into **one** report with severity + estimated
savings + a go/no-go recommendation. The report is **saved to `docs/reviews/<env>-<date>.md`** so
Stage 5 (and later sessions) can read it. A single AI pass isn't exhaustive — add **`--deep`** to
loop the finders until 2 consecutive rounds find nothing new (the deterministic baseline is the
checkov/tflint and gitleaks tool gates).
**→ Stop at G4.** You choose which items to fix; Claude lists the work and waits for your
confirmation before changing any code.

### Step 5 — Document the infrastructure: `/infra-document <env-dir>`

Derives the as-built architecture from the Terraform module wiring + spec and writes a **living
document** `docs/infrastructure.md`, an editable AWS-grouped `docs/diagrams/infra.drawio`, and a
temporary Mermaid block to verify the diagram. Re-run it whenever the infra changes.
**→ Stop at G5.** Open the `.drawio`, check it matches the Mermaid, export to PNG, delete the
Mermaid block, review the doc, then commit. Claude does not commit.

### Step 6 — Secret scan before push: `/secret-scan [--setup | --scan]`
The last gate before code reaches GitHub. Scanning is done by a **tool** — **Betterleaks**
(fallback **Gitleaks**), both reading `.gitleaks.toml`. `--setup` installs the guardrail (config +
a pre-push hook + a `secret-scan.yml` CI workflow); `--scan` (default) runs a scan now.
Enforced at two layers: the local pre-push hook blocks `git push` on a leak, and the CI workflow
re-scans full history on push/PR. You can also install it by hand from
[`templates/secret-scan/`](templates/secret-scan/README.md).
After setup you don't have to call the skill each time — the pre-push hook scans automatically on
`git push`, CI scans on push/PR, and you can run the tool manually (`betterleaks git . --redact
--config .gitleaks.toml`, or via Docker). Use `/secret-scan` when you want the AI to scan **and**
triage/fix findings. See the [pipeline guide](pipeline-usage-guide.md#step-6--secret-scan-gate-g6)
for all four run methods.
**→ Stop at G6.** If clean, you `git push`. If a real secret is found, remove it **and rotate it**.

---

## When to use Plan Mode before the pipeline

Per `.claude/CLAUDE.md`: production changes, new module/service/environment design, migration
strategy, cost-optimization reviews, security-architecture decisions → enable Plan Mode during the
Spec/IaC steps.

## Related

- [`pipeline-usage-guide.md`](pipeline-usage-guide.md) — **detailed A→Z guide (with a worked example)**
- [`setup-new-project.md`](setup-new-project.md) — install & symlink the pipeline skills
- [`templates/infra-spec-template.md`](templates/infra-spec-template.md) — spec template (Stage 1)
- [`templates/infra-document-template.md`](templates/infra-document-template.md) — infra doc template (Stage 5)
- [`templates/secret-scan/`](templates/secret-scan/README.md) — secret-scan config + hook + CI workflow (Stage 6)
- [`mcp-devops-setup.md`](mcp-devops-setup.md) · [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)
