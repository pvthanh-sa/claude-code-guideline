# Claude Core Setup — Personal DevOps/SRE Toolkit

A highly customized, reusable toolkit designed for DevOps Engineers, SREs, and Cloud Architects. This repository encapsulates comprehensive infrastructure knowledge, secure CI/CD patterns, and cloud best practices (AWS/Terraform focused), allowing Claude Code to act as an advanced infrastructure co-pilot.

---

## 🏗 Structure & Capabilities

The core configuration is located in the `.claude/` directory and can be copied to any project to instantly arm it with top-tier DevOps capabilities.

### 1. Project Context (`.claude/CLAUDE.md`)
The `CLAUDE.md` sets the standard persona: a Senior DevOps/SRE Engineer prioritizing reliability, security, automation, and cost-efficiency. It defines default tools (Terraform, GitHub Actions, Docker, ECS Fargate, Postgres) and global conventions.

### 2. Agents (`.claude/agents/`)
Specialized subagents configured for specific large-scale audits and investigations:
- **`infra-reviewer`**: Reviews Terraform/Kubernetes/Docker code for naming, tagging, security, and cost optimizations.
- **`security-auditor`**: Scans for secrets exposure, IAM misconfigurations, missing encryption, and network isolation gaps.
- **`incident-responder`**: Operates during outages to triage, diagnose, and suggest remediation for AWS infra.
- **`cost-optimizer`**: Analyzes state/resources for right-sizing, reserved instances, storage lifecycle tweaks.

### 3. Rules (`.claude/rules/`)
Enforced coding standards across different file types:
- **`terraform.md`**: Enforces naming targets, tag merging, S3 backend locks, and prohibits auto-approve.
- **`docker.md`**: Multi-stage builds, non-root users, pinning base images, layer minimization.
- **`kubernetes.md`**: Resource requests/limits, network policies, non-root constraints.
- **`cicd.md`**: GitHub Actions OIDC auth (no long-lived keys), environments, concurrency settings.
- **`security.md`**: Globals preventing hardcoded credentials, wildcard IAM permissions in prod.

### 4. Skills (`.claude/skills/`)
12 bundled skills encompassing varied competencies. Simply type `/` in Claude Code to see and trigger them:
1. `terraform-engineer`: **(Custom)** Handles module development, state management, and infra review.
2. `devops-engineer`: **(Custom)** Encodes strict CI/CD patterns, deployment strategies, release automation.
3. `kubernetes-specialist`: EKS context, Ingress controllers, Helm operations.
4. `cloud-architect`: AWS Well-Architected Framework guidance.
5. `postgres-pro`: Aurora optimization, performance, JSONB tuning.
6. `security-reviewer`: Vetting Code/IaC using Checkov/Trivy patterns.
7. `database-optimizer`: General DB Indexing, query tuning.
8. `monitoring-expert`: Prometheus, Grafana, OpenTelemetry, alert rules.
9. `sre-engineer`: SLOs, SLIs, toil reduction, error budgets.
10. `chaos-engineer`: Infrastructure chaos design, game days.
11. `cli-developer`: Internal tooling (Go/Node/Python CLIs).
12. `secure-code-guardian`: OWASP prevention.

---

## 🔁 DevOps Pipeline (human-in-the-loop)

Beyond individual skills, four of them chain into an end-to-end flow with a **human approval
gate at every step** — Claude never auto-advances and never runs `terraform apply` or commits:

```
/spec-architect ──G1──► /init-project ──G2──► /iac-implement ──G3──► /infra-review ──G4──►
   build spec            bootstrap            Terraform / plan       parallel review
```

- **Stage 1 — `/spec-architect`**: co-design `docs/specs/<name>.spec.md` (Well-Architected + pricing).
- **Stage 2 — `/init-project`**: detect stack (reads the spec), generate `CLAUDE.md` + `.mcp.json`.
- **Stage 3 — `/iac-implement`**: reuse the custom module library (`MODULES.md`) → scaffold an
  environment → `fmt/validate/tflint/checkov/plan`.
- **Stage 4 — `/infra-review`**: a parallel **Workflow** runs `security-auditor` + `infra-reviewer`
  + `cost-optimizer`, synthesized into one severity-ranked go/no-go report.

**Detailed step-by-step guide (worked example, checklists, troubleshooting):**
**[`knowledge/pipeline-usage-guide.md`](knowledge/pipeline-usage-guide.md)**.
Quick reference map: [`knowledge/devops-workflow.md`](knowledge/devops-workflow.md).
Install the pipeline skills once per machine: see [`knowledge/setup-new-project.md`](knowledge/setup-new-project.md) §1.

---

## 🚀 How to Use

### Integrating into your project
To add this DevOps toolkit to any existing or new project, simply copy the `.claude/` directory over:

```bash
cp -r /path/to/claude-code-guideline/.claude /path/to/your-project/
```

Once copied, open your project directory and start the `claude` CLI. Type `/` built-in to view and invoke the newly installed skills.

### Advanced Usage Guides
For special cases using batch processing, CI/CD non-interactive integration, or working with parallel features, refer to the [Advanced Usage Guide](advanced-usage-guide.md).
