<!--
  Infrastructure Spec Template
  Produced by /spec-architect. Fill every section; delete sections that genuinely don't apply
  and say why. Anything you are unsure about goes in "Decisions needing the human" — do NOT guess.
-->

# Infra Spec — <project / change name>

- **Author:** <you>            **Date:** <YYYY-MM-DD>
- **Status:** Draft | Approved (G1)
- **AWS account / region:** <account> / <region, e.g. ap-northeast-1>

## 1. Context & Goals
- **Problem / need:** <why this infrastructure is needed>
- **Desired outcome:** <definition of "done">
- **Constraints:** <deadline, budget, compliance: PII/HIPAA/PCI…>

## 2. Scope
- **In scope:** <what this pipeline builds>
- **Out of scope:** <what is NOT done this time>

## 3. Architecture
- **Summary:** <1–3 sentences>
- **Services (AWS):** <ECS Fargate / Aurora PostgreSQL / ALB / CloudFront / S3 / ElastiCache…>
- **Data-flow diagram:**
  ```
  Client ─► CloudFront ─► ALB ─► ECS service ─► Aurora
                                      └──► ElastiCache
  ```
- **HA / multi-AZ / multi-region:** <redundancy strategy, no SPOF>

## 4. Environments & Naming
| Env | Prefix | Account/Region | Notes |
|-----|--------|----------------|-------|
| develop | `dev-`  | | |
| demo    | `demo-` | | |
| staging | `stg-`  | | protection rule |
| production | `prod-` | | protection rule |

- **Resource naming:** `${var.app_name}-<resource-type>` · **Module prefix:** `${var.environment}-${var.app_name}`
- **State:** S3 backend, `key = "<env>/terraform.tfstate"`, `use_lockfile = true`

## 5. Security
- **IAM:** least-privilege; roles not users; OIDC for GitHub Actions
- **Network:** public/private subnets; default-deny security groups; VPC endpoints; never open port 22 to 0.0.0.0/0
- **Encryption:** at rest (S3/RDS/EBS/EFS/ElastiCache) + in transit (TLS); SSL enforced for DB
- **Secrets:** AWS Secrets Manager / SSM — never hardcode, never put in tfvars
- **Relevant compliance:** <if any>

## 6. Cost estimate (aws-pricing)
| Item | Configuration | Cost/month (est.) |
|------|---------------|--------------------|
| Compute (ECS) | | |
| Database | | |
| Networking (NAT/CloudFront) | | |
| **Total (est.)** | | |
- **Savings levers:** single NAT for non-prod, gp3, Fargate Spot for batch, RI/Savings Plan for prod…

## 7. SLO / RTO / RPO
- **SLO:** <e.g. 99.9% availability, p99 latency < 300ms>
- **RTO / RPO:** <acceptable downtime / data loss>
- **Backup & DR:** <strategy>

## 8. Reusable modules (map to MODULES.md)
| Spec component | Module in custom-infrastructure | New module needed? |
|----------------|----------------------------------|--------------------|
| VPC/subnet | `network` | no |
| Load balancer | `alb` | no |
| Container | `ecs`, `ecs_cluster` | no |
| Database | `rds` | no |
| … | … | … |

## 8.1 Deferred to configuration management (Ansible — omit if the stack has no hosts)
> Terraform provisions the host; what runs *inside* it is Stage 3b's job. List it here so it is
> scoped at G1 instead of being discovered after apply. Omit this section entirely for a
> serverless / fully managed stack.

| In-guest concern | Handled by | Values needed from Terraform |
|------------------|-----------|------------------------------|
| <packages, service config, certs, tuning> | `<role name>` | `<terraform output name>` |
| … | … | … |

- **Not automatable** (stays a human runbook step): <e.g. vendor call, physical access, visual check>

## 9. Decisions needing the human (open at G1)
> Two kinds of item — never leave a blank question for the reader to invent, and never fabricate facts:
> - **Recommendation** = the best technical option + reason; you confirm or change it.
> - **Need from you** = a missing business fact only you know.
- [ ] **Recommendation:** <e.g. Aurora Serverless v2 — cheap when idle, auto-scales> — *confirm / change to <provisioned>?*
- [ ] **Recommendation:** <e.g. drop WAF for dev — fake data, saves cost> — *confirm / keep it?*
- [ ] **Need from you:** <e.g. monthly budget ceiling for dev>

## 10. Rollback
- **Strategy:** CodeDeploy blue-green / reverse `terraform plan` / state restore
- **Quick rollback steps:** <describe>

## 11. Acceptance criteria (how the human verifies — filled at G1, checked at G4/G5)
> One row per claim the design makes. Each must be **observable**: a command to run and what its
> output must show. "The report says it passed" is not acceptance — the requirement that a gate be
> checked against real machine state, not against its own summary, lives or dies here.

| # | What will be checked | How (exact command / observation) | Satisfies |
|---|---|---|---|
| A-1 | <the claim> | <command + expected output> | <req id> |
