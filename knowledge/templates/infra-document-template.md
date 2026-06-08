<!--
  Infrastructure Document Template (living doc)
  Produced/refreshed by /infra-document (Stage 5). Derive every fact from the spec + Terraform
  code; mark anything unknown as TODO — do not invent. Re-run the skill when infra changes.
  Diagram upkeep: open diagrams/infra.drawio → Export PNG → diagrams/infra.png → then delete the
  Mermaid verification block in §2.
-->

# Infrastructure — <project> / <environment>

- **Environment:** <dev-care-hub>   **Region:** <ap-northeast-1>   **Account:** <id/alias>
- **Source of truth:** Terraform at `<environments/...>` · Spec: [`../specs/<name>.spec.md`](../specs/<name>.spec.md)
- **Last generated:** <YYYY-MM-DD> by `/infra-document` (living document — re-run after changes)

## 1. Overview
- **Purpose:** <what this system does and the problem it solves — 1–3 sentences, plain language>
- **The big picture:** <ONE short paragraph a newcomer can read to "get it": what enters the system,
  what happens to it, what comes out, and the 2–4 main building blocks. No jargon / no resource names.>
- **Stack:** <ECS Fargate / Aurora PostgreSQL / ALB / CloudFront …>
- **Scope of this doc:** this environment only (link sibling envs if relevant)

## 2. Architecture diagram

![Infrastructure](diagrams/infra.png)
<!-- ^ PNG not exported yet. Source: diagrams/infra.drawio (open in draw.io → Export → PNG). -->

**How to read this diagram:** <1–2 lines — nested boxes = grouping (AWS Cloud → Region → VPC →
public/private subnet); solid **numbered** arrows ① ② ③ = the main path in order; dashed arrows =
supporting links (secrets, logs, reads); colors follow AWS service category (compute orange,
networking purple, database blue, storage green, security red).>

**The numbered path:** <one compact line decoding the ① ② ③ edges in order — e.g. ① Client → CloudFront
→ ② ALB → ③ ECS → ④ Aurora; dashed = creds/logs. This is the diagram's key; §3 explains the *why*.>

<!-- VERIFICATION DIAGRAM — delete after confirming infra.drawio matches, then export drawio → infra.png -->
```mermaid
flowchart LR
  user([Client])
  subgraph AWS["AWS Cloud — ap-northeast-1"]
    cf[CloudFront]
    subgraph VPC["VPC"]
      subgraph PUB["Public subnet"]
        alb[ALB]
      end
      subgraph PRV["Private subnet"]
        ecs[ECS Fargate]
        rds[(Aurora PostgreSQL)]
      end
    end
    secrets[[Secrets Manager]]
  end
  user --> cf --> alb --> ecs --> rds
  ecs -. reads .-> secrets
```
<!-- END VERIFICATION DIAGRAM -->

## 3. How it works (architecture walkthrough)
> Understand the system here; §4–§5 are the precise reference. Numbers ① ② ③ match the §2 diagram.

<!-- Format for SCANNING, not an essay: bold lead-in labels + short bullets, grouped into a few
     small blocks. Group by subsystem/flow (not by Terraform module). For each part say what it is,
     why it's here, what it connects to. Weave the diagram's ① ② ③ numbers into the bullets so this
     doubles as the flow explanation (no separate data-flow section). Replace the example below. -->

**The shape — <one-line framing of the whole system>.** <Why it's built this way, 1–2 sentences.>

**<Subsystem / Phase 1 name>** · *<when/trigger if any>*
- <what it is · why · what it connects to> ①
- <next step / component> ②

**<Subsystem / Phase 2 name>** · *<when/trigger>*
- <step> ③ → <step> ④
- <step> ⑤ → <step> ⑥

**Key design decisions**
- **<decision>** — <the why / the non-obvious tradeoff>.
- **<decision>** — <why>.

## 4. Components
| Module | AWS resource(s) | Role | Tier / subnet |
|--------|-----------------|------|---------------|
| `network` | VPC, subnets, NAT, IGW | Network foundation | — |
| `alb` | ALB + SG + listeners | Ingress / routing | public |
| `ecs` / `ecs_cluster` | Fargate service + cluster | App compute | private |
| `rds` | Aurora cluster + Secrets Manager | Datastore | private |
| … | … | … | … |

## 5. Network
- **VPC CIDR:** <10.x.0.0/16> · **AZs:** <…>
- **Subnets:** public (<which>), private (<which>)
- **Security groups:** <ALB SG → ECS SG → RDS SG; default-deny + explicit allow>
- **Egress:** <single NAT (dev) / per-AZ NAT (prod)>; VPC endpoints: <list>

## 6. Environments & naming
- **Prefix:** `<env>-<app_name>` (e.g. `dev-care-hub`)
- **State:** S3 `key = "<env>/terraform.tfstate"`, `use_lockfile = true`
- **Sibling environments:** <dev / stg / prod — link their docs>

## 7. Security posture
- **IAM:** <roles, least-privilege; OIDC for CI>
- **Encryption:** <at rest: RDS/S3/EBS; in transit: TLS; KMS keys>
- **Secrets:** <Secrets Manager / SSM — what's stored>
- **Network:** <private resources, SG egress posture, public exposure>
- **Edge protection:** <WAF / CloudFront — or n/a + why>
- **Review:** last `/infra-review` result → <go / open items>; Well-Architected Security coverage
  (IAM · detective · infra-protection · data-protection · incident-response). Link the report if any.

## 8. Cost summary
| Item | Config | Cost/month (est.) |
|------|--------|--------------------|
| … | | |
| **Total (est.)** | | |
(From the spec §6 / `aws-pricing`. Update on resize. Note key savings levers.)
