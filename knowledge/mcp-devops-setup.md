# MCP Setup Guide — DevOps / Solution Architect

A curated reference for setting up Model Context Protocol (MCP) servers tailored to DevOps, Solution Architect, and SRE roles. **Official servers only** — no community/third-party servers for security reasons.

**Last verified:** 2026-04-14

---

## 1. Overview

### What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI assistants (Claude Code, Cursor, VS Code Copilot) connect to external tools and data sources. Instead of copy-pasting CLI output into the chat, MCP gives Claude direct access to query AWS, read Terraform state, check CI pipeline logs, etc.

### How to manage MCP servers — use `.mcp.json`

> **Always use `.mcp.json` files.** Avoid `claude mcp add` commands — they write to `~/.claude.json` user-level config which mixes with project config and causes confusion.

| File                       | Scope             | When to use                                             |
| -------------------------- | ----------------- | ------------------------------------------------------- |
| `.mcp.json` (project root) | This project only | **Preferred** — version-controlled, shareable with team |
| `~/.claude/.mcp.json`      | All your projects | Global MCPs you want everywhere (rare)                  |

Claude Code automatically loads `.mcp.json` from the project root.

**Verify active MCPs:**

```bash
claude mcp list 2>/dev/null | grep -v "^claude\.ai"
```

### Security Mindset: Read-Only Default

> **Rule #1:** Grant MCP servers the minimum permissions needed. Default to read-only. Never auto-approve destructive operations (`terraform apply`, `aws ec2 terminate-instances`, `kubectl delete`).

---

## 2. Infrastructure as Code (Terraform)

### 2.1 HashiCorp Terraform MCP Server

Official MCP server from HashiCorp. Real-time access to Terraform Registry — providers, modules, and policies.

**`.mcp.json`:**

```json
"terraform": {
  "command": "docker",
  "args": ["run", "-i", "--rm", "hashicorp/terraform-mcp-server"]
}
```

With HCP Terraform token:

```json
"terraform": {
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "TFE_TOKEN", "hashicorp/terraform-mcp-server"],
  "env": {
    "TFE_TOKEN": "<your-tfe-token>"
  }
}
```

**Links:**

- GitHub: https://github.com/hashicorp/terraform-mcp-server
- Docs: https://developer.hashicorp.com/terraform/mcp-server

**Security:** Read-only by default (queries Terraform Registry API). HCP Terraform features require `TFE_TOKEN` — scope to minimum workspace access.

---

## 3. AWS Cloud

All servers from the **official AWS MCP collection** at [awslabs/mcp](https://github.com/awslabs/mcp).

Full catalog (66 servers): https://awslabs.github.io/mcp/

### Prerequisites

```bash
# Install uv (Python package manager — required for uvx)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Python
uv python install 3.10
```

### AWS Credentials — Multi-Account Setup

All AWS MCP servers use `AWS_PROFILE` env var in `.mcp.json`. Each team member maps the profile name to their own `~/.aws/credentials`.

```json
// Pattern for all AWS MCP servers:
{
  "command": "uvx",
  "args": ["awslabs.<server-name>@latest"],
  "env": {
    "AWS_PROFILE": "<your-profile>",
    "AWS_REGION": "ap-southeast-1"
  }
}
```

> **Security:** Always use a **read-only named profile** (`ViewOnlyAccess` or custom read-only policy). Never use admin profile.

> **Tip:** Commit `.mcp.json` with the profile name but **not** credentials.

---

### 3.1 Mandatory AWS MCP Servers

Always setup regardless of project. These cover monitoring, security, cost, and documentation.

| #   | Name             | Package                                        | Purpose                                          | Link                                                                               |
| --- | ---------------- | ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | AWS API          | `awslabs.aws-api-mcp-server`                   | Swiss knife — broad AWS API access               | [Docs](https://awslabs.github.io/mcp/servers/aws-api-mcp-server)                   |
| 2   | AWS Knowledge    | `awslabs.aws-knowledge-mcp-server`             | AWS docs + code samples + official content       | [Docs](https://awslabs.github.io/mcp/servers/aws-knowledge-mcp-server)             |
| 3   | CloudWatch       | `awslabs.cloudwatch-mcp-server`                | Metrics, alarms, logs analysis                   | [Docs](https://awslabs.github.io/mcp/servers/cloudwatch-mcp-server)                |
| 4   | CloudTrail       | `awslabs.cloudtrail-mcp-server`                | API audit, security investigation                | [Docs](https://awslabs.github.io/mcp/servers/cloudtrail-mcp-server)                |
| 5   | IAM              | `awslabs.iam-mcp-server`                       | IAM users, roles, policies review                | [Docs](https://awslabs.github.io/mcp/servers/iam-mcp-server)                       |
| 6   | Well-Architected | `awslabs.well-architected-security-mcp-server` | Security assessment against WAF         | [Docs](https://awslabs.github.io/mcp/servers/well-architected-security-mcp-server) |
| 7   | Billing & Cost   | `awslabs.billing-cost-management-mcp-server`   | Budgets, anomaly detection, RI/SP, Cost Explorer | [Docs](https://awslabs.github.io/mcp/servers/billing-cost-management-mcp-server)   |
| 8   | Pricing          | `awslabs.aws-pricing-mcp-server`               | Pre-deployment cost estimation                   | [Docs](https://awslabs.github.io/mcp/servers/aws-pricing-mcp-server)               |

**`.mcp.json` — Mandatory block:**

```json
"aws-api": {
  "command": "uvx",
  "args": ["awslabs.aws-api-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"aws-knowledge": {
  "type": "http",
  "url": "https://knowledge-mcp.global.api.aws"
},
"cloudwatch": {
  "command": "uvx",
  "args": ["awslabs.cloudwatch-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"cloudtrail": {
  "command": "uvx",
  "args": ["awslabs.cloudtrail-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"iam": {
  "command": "uvx",
  "args": ["awslabs.iam-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"well-architected": {
  "command": "uvx",
  "args": ["awslabs.well-architected-security-mcp-server"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"billing": {
  "command": "uvx",
  "args": ["awslabs.billing-cost-management-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<billing-profile>", "AWS_REGION": "us-east-1" }
},
"aws-pricing": {
  "command": "uvx",
  "args": ["awslabs.aws-pricing-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "us-east-1" }
}
```

> **Note:** `aws-knowledge` is a **remote HTTP server** (no uvx/install needed) — uses `type: http` with endpoint `https://knowledge-mcp.global.api.aws`. No authentication required, publicly accessible, rate-limited. It replaces the older `aws-documentation-mcp-server`.

> **Note:** `billing` already includes Cost Explorer functionality, so standalone `cost-explorer-mcp-server` is not needed.

> **Note:** IAM MCP is **write-capable**. Pair with read-only IAM role or add CLAUDE.md rules to block mutation commands.

---

### 3.2 Optional AWS MCP Servers — Infrastructure & Compute

Add these based on what your project uses.

| Name               | Package                                             | When to use                                       | Link                                                                                    |
| ------------------ | --------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| IaC                | `awslabs.aws-iac-mcp-server`                        | CDK / CloudFormation / Terraform on AWS           | [Docs](https://awslabs.github.io/mcp/servers/aws-iac-mcp-server)                        |
| EKS                | `awslabs.eks-mcp-server`                            | Managing EKS clusters                             | [Docs](https://awslabs.github.io/mcp/servers/eks-mcp-server)                            |
| ECS                | `awslabs-ecs-mcp-server` (different syntax!)        | Managing ECS services                             | [Docs](https://awslabs.github.io/mcp/servers/ecs-mcp-server)                            |
| Serverless         | `awslabs.aws-serverless-mcp-server`                 | Lambda / SAM applications                         | [Docs](https://awslabs.github.io/mcp/servers/aws-serverless-mcp-server)                 |
| Lambda Tool        | `awslabs.lambda-tool-mcp-server`                    | Expose Lambda functions as AI tools               | [Docs](https://awslabs.github.io/mcp/servers/lambda-tool-mcp-server)                    |
| Finch              | `awslabs.finch-mcp-server`                          | Local container builds + ECR push                 | [Docs](https://awslabs.github.io/mcp/servers/finch-mcp-server)                          |
| Step Functions     | `awslabs.stepfunctions-tool-mcp-server`             | Complex workflow orchestration                    | [Docs](https://awslabs.github.io/mcp/servers/stepfunctions-tool-mcp-server)             |
| Support            | `awslabs.aws-support-mcp-server`                    | Support cases (requires Business/Enterprise plan) | [Docs](https://awslabs.github.io/mcp/servers/aws-support-mcp-server)                    |
| Managed Prometheus | `awslabs.prometheus-mcp-server`                     | AMP metrics                                       | [Docs](https://awslabs.github.io/mcp/servers/prometheus-mcp-server)                     |
| CW App Signals     | `awslabs.cloudwatch-applicationsignals-mcp-server`  | Application performance monitoring                | [Docs](https://awslabs.github.io/mcp/servers/cloudwatch-applicationsignals-mcp-server)  |

**`.mcp.json` — Optional block (add what you need):**

```json
"iac": {
  "command": "uvx",
  "args": ["awslabs.aws-iac-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"eks": {
  "command": "uvx",
  "args": ["awslabs.eks-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"ecs": {
  "command": "uvx",
  "args": ["--from", "awslabs-ecs-mcp-server", "ecs-mcp-server"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"serverless": {
  "command": "uvx",
  "args": ["awslabs.aws-serverless-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"lambda-tool": {
  "command": "uvx",
  "args": ["awslabs.lambda-tool-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"finch": {
  "command": "uvx",
  "args": ["awslabs.finch-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"step-functions": {
  "command": "uvx",
  "args": ["awslabs.stepfunctions-tool-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"aws-support": {
  "command": "uvx",
  "args": ["awslabs.aws-support-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "us-east-1" }
},
"aws-prometheus": {
  "command": "uvx",
  "args": ["awslabs.prometheus-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
},
"cw-app-signals": {
  "command": "uvx",
  "args": ["awslabs.cloudwatch-applicationsignals-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

> **Note:** ECS uses different uvx syntax: `--from awslabs-ecs-mcp-server ecs-mcp-server` (hyphens, not dots).

> **Note:** `aws-support` API only available in `us-east-1`.

---

### 3.3 Optional AWS MCP Servers — Database

Add only if your project uses the specific database service.

| Name                  | Package                                    | Service                             | Link                                                                           |
| --------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------ |
| DynamoDB              | `awslabs.dynamodb-mcp-server`              | DynamoDB operations                 | [Docs](https://awslabs.github.io/mcp/servers/dynamodb-mcp-server)              |
| Aurora PostgreSQL     | `awslabs.postgres-mcp-server`              | PostgreSQL via RDS Data API         | [Docs](https://awslabs.github.io/mcp/servers/postgres-mcp-server)              |
| Aurora MySQL          | `awslabs.mysql-mcp-server`                 | MySQL via RDS Data API              | [Docs](https://awslabs.github.io/mcp/servers/mysql-mcp-server)                 |
| Aurora DSQL           | `awslabs.aurora-dsql-mcp-server`           | Distributed SQL (PostgreSQL compat) | [Docs](https://awslabs.github.io/mcp/servers/aurora-dsql-mcp-server)           |
| DocumentDB            | `awslabs.documentdb-mcp-server`            | MongoDB-compatible                  | [Docs](https://awslabs.github.io/mcp/servers/documentdb-mcp-server)            |
| Neptune               | `awslabs.amazon-neptune-mcp-server`        | Graph DB (openCypher/Gremlin)       | [Docs](https://awslabs.github.io/mcp/servers/amazon-neptune-mcp-server)        |
| Keyspaces             | `awslabs.amazon-keyspaces-mcp-server`      | Apache Cassandra-compatible         | [Docs](https://awslabs.github.io/mcp/servers/amazon-keyspaces-mcp-server)      |
| Timestream InfluxDB   | `awslabs.timestream-for-influxdb-mcp-server` | InfluxDB-compatible time series   | [Docs](https://awslabs.github.io/mcp/servers/timestream-for-influxdb-mcp-server) |
| ElastiCache           | `awslabs.elasticache-mcp-server`           | ElastiCache operations              | [Docs](https://awslabs.github.io/mcp/servers/elasticache-mcp-server)           |
| ElastiCache Valkey    | `awslabs.valkey-mcp-server`                | Valkey / MemoryDB                   | [Docs](https://awslabs.github.io/mcp/servers/valkey-mcp-server)                |
| ElastiCache Memcached | `awslabs.memcached-mcp-server`             | Memcached                           | [Docs](https://awslabs.github.io/mcp/servers/memcached-mcp-server)             |
| S3 Tables             | `awslabs.s3-tables-mcp-server`             | S3-based tables with SQL            | [Docs](https://awslabs.github.io/mcp/servers/s3-tables-mcp-server)             |
| Redshift              | `awslabs.redshift-mcp-server`              | Data warehouse                      | [Docs](https://awslabs.github.io/mcp/servers/redshift-mcp-server)              |

All follow the standard pattern:

```json
"dynamodb": {
  "command": "uvx",
  "args": ["awslabs.dynamodb-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

---

### 3.4 Optional AWS MCP Servers — Messaging & Integration

| Name      | Package                      | Service                         | Link                                                             |
| --------- | ---------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| SNS / SQS | `awslabs.amazon-sns-sqs-mcp-server` | Event-driven messaging & queues | [Docs](https://awslabs.github.io/mcp/servers/amazon-sns-sqs-mcp-server) |
| MQ        | `awslabs.amazon-mq-mcp-server`      | RabbitMQ / ActiveMQ broker      | [Docs](https://awslabs.github.io/mcp/servers/amazon-mq-mcp-server)      |
| AppSync   | `awslabs.aws-appsync-mcp-server`    | GraphQL API backend             | [Docs](https://awslabs.github.io/mcp/servers/aws-appsync-mcp-server)    |

All follow the standard pattern:

```json
"sns-sqs": {
  "command": "uvx",
  "args": ["awslabs.sns-sqs-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

---

### 3.5 Optional AWS MCP Servers — AI/ML

| Name                    | Package                                          | Service                           | Link                                                                                 |
| ----------------------- | ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------ |
| Bedrock KB Retrieval    | `awslabs.bedrock-kb-retrieval-mcp-server`        | Enterprise knowledge bases + RAG  | [Docs](https://awslabs.github.io/mcp/servers/bedrock-kb-retrieval-mcp-server)        |
| Kendra Index            | `awslabs.amazon-kendra-index-mcp-server`         | Enterprise search + RAG           | [Docs](https://awslabs.github.io/mcp/servers/amazon-kendra-index-mcp-server)         |
| Q Business              | `awslabs.amazon-qbusiness-anonymous-mcp-server`  | Amazon Q AI assistant             | [Docs](https://awslabs.github.io/mcp/servers/amazon-qbusiness-anonymous-mcp-server)  |
| Q Index                 | `awslabs.amazon-qindex-mcp-server`               | Amazon Q index search             | [Docs](https://awslabs.github.io/mcp/servers/amazon-qindex-mcp-server)               |
| Nova Canvas             | `awslabs.nova-canvas-mcp-server`                 | AI image generation               | [Docs](https://awslabs.github.io/mcp/servers/nova-canvas-mcp-server)                 |
| Bedrock Data Automation | `awslabs.aws-bedrock-data-automation-mcp-server`     | Document/image/video analysis     | [Docs](https://awslabs.github.io/mcp/servers/aws-bedrock-data-automation-mcp-server)     |
| Bedrock Custom Model    | `awslabs.aws-bedrock-custom-model-import-mcp-server` | Custom model import for inference | [Docs](https://awslabs.github.io/mcp/servers/aws-bedrock-custom-model-import-mcp-server) |
| SageMaker               | `awslabs.sagemaker-ai-mcp-server`                    | ML model development              | [Docs](https://awslabs.github.io/mcp/servers/sagemaker-ai-mcp-server)                    |
| Bedrock AgentCore       | `awslabs.amazon-bedrock-agentcore-mcp-server`        | Build/deploy intelligent agents   | [Docs](https://awslabs.github.io/mcp/servers/amazon-bedrock-agentcore-mcp-server)        |

All follow the standard pattern:

```json
"bedrock-kb-retrieval": {
  "command": "uvx",
  "args": ["awslabs.bedrock-kb-retrieval-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

---

### 3.6 Optional AWS MCP Servers — Data Processing & Other

| Name                         | Package                                              | Service                         | Link                                                                                     |
| ---------------------------- | ---------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| Data Processing              | `awslabs.aws-dataprocessing-mcp-server`                              | AWS Glue / EMR pipelines        | [Docs](https://awslabs.github.io/mcp/servers/aws-dataprocessing-mcp-server)                              |
| SageMaker Spark Troubleshoot | `awslabs.sagemaker-unified-studio-spark-troubleshooting-mcp-server` | Spark error analysis (Glue/EMR) | [Docs](https://awslabs.github.io/mcp/servers/sagemaker-unified-studio-spark-troubleshooting-mcp-server) |
| SageMaker Spark Upgrade      | `awslabs.sagemaker-unified-studio-spark-upgrade-mcp-server`         | Spark version migration         | [Docs](https://awslabs.github.io/mcp/servers/sagemaker-unified-studio-spark-upgrade-mcp-server)         |
| Location Service             | `awslabs.aws-location-mcp-server`                                    | Geocoding, routing              | [Docs](https://awslabs.github.io/mcp/servers/aws-location-mcp-server)                                    |
| IoT SiteWise                 | `awslabs.aws-iot-sitewise-mcp-server`                                | Industrial IoT                  | [Docs](https://awslabs.github.io/mcp/servers/aws-iot-sitewise-mcp-server)                                |
| HealthOmics                  | `awslabs.aws-healthomics-mcp-server`                                 | Life science workflows          | [Docs](https://awslabs.github.io/mcp/servers/aws-healthomics-mcp-server)                                 |
| HealthImaging                | `awslabs.healthimaging-mcp-server`                   | Medical imaging (DICOM)         | [Docs](https://awslabs.github.io/mcp/servers/healthimaging-mcp-server)                   |
| HealthLake                   | `awslabs.healthlake-mcp-server`                      | Healthcare FHIR data            | [Docs](https://awslabs.github.io/mcp/servers/healthlake-mcp-server)                      |

All follow the standard pattern:

```json
"data-processing": {
  "command": "uvx",
  "args": ["awslabs.data-processing-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

---

### 3.7 Optional AWS MCP Servers — Developer Tools

| Name              | Package                                | Service                           | Link                                                                       |
| ----------------- | -------------------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| Document Loader   | `awslabs.document-loader-mcp-server`   | Document parsing & extraction     | [Docs](https://awslabs.github.io/mcp/servers/document-loader-mcp-server)   |
| Git Repo Research | `awslabs.git-repo-research-mcp-server` | Semantic code search              | [Docs](https://awslabs.github.io/mcp/servers/git-repo-research-mcp-server) |
| Code Doc Gen      | `awslabs.code-doc-gen-mcp-server`      | Auto documentation from code      | [Docs](https://awslabs.github.io/mcp/servers/code-doc-gen-mcp-server)      |
| Frontend          | `awslabs.frontend-mcp-server`          | React / web development guidance  | [Docs](https://awslabs.github.io/mcp/servers/frontend-mcp-server)          |
| Synthetic Data    | `awslabs.synthetic-data-mcp-server`    | Generate test data                | [Docs](https://awslabs.github.io/mcp/servers/synthetic-data-mcp-server)    |
| OpenAPI           | `awslabs.openapi-mcp-server`           | API integration via OpenAPI specs | [Docs](https://awslabs.github.io/mcp/servers/openapi-mcp-server)           |

All follow the standard pattern:

```json
"document-loader": {
  "command": "uvx",
  "args": ["awslabs.document-loader-mcp-server@latest"],
  "env": { "AWS_PROFILE": "<your-profile>", "AWS_REGION": "ap-southeast-1" }
}
```

---

## 4. CI/CD

### 4.1 GitHub MCP Server (Official)

Official server from GitHub. Repos, issues, PRs, GitHub Actions.

**`.mcp.json`:**

```json
"github": {
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-github-pat>"
  }
}
```

> **Why not HTTP endpoint?** `https://api.githubcopilot.com/mcp/` only works inside VS Code/Copilot Chat. Claude Code CLI gets `Incompatible auth server: does not support dynamic client registration`.

> **Why not `@modelcontextprotocol/server-github`?** That's the old reference implementation. Use `ghcr.io/github/github-mcp-server` (official, maintained by GitHub).

**Create PAT:** GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**:

| Permission    | Level                                     |
| ------------- | ----------------------------------------- |
| Metadata      | Read-only (mandatory)                     |
| Contents      | Read-only                                 |
| Issues        | Read-only                                 |
| Pull requests | Read-only                                 |
| Actions       | Read-only (if need to view workflow runs) |

**Links:**

- GitHub: https://github.com/github/github-mcp-server
- Docs: https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server

---

### 4.2 GitLab MCP Server (Official)

Official GitLab MCP server (GitLab 18.6+). OAuth 2.0 authentication.

**`.mcp.json`:**

```json
"gitlab": {
  "type": "http",
  "url": "https://gitlab.com/api/v4/mcp"
}
```

Self-hosted:

```json
"gitlab": {
  "type": "http",
  "url": "https://<your-gitlab-instance>/api/v4/mcp"
}
```

After adding, authenticate **once** via OAuth: `/mcp` → select GitLab → approve in browser.

**Links:**

- Docs: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/
- Tools: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server_tools/

---

### 4.3 Jenkins MCP Server (Official Plugin)

Official Jenkins plugin. Requires Jenkins 2.533+.

**`.mcp.json`:**

```json
"jenkins": {
  "type": "http",
  "url": "http://<jenkins-host>/mcp-server/mcp",
  "headers": {
    "Authorization": "Basic <base64-of-user:api-token>"
  }
}
```

Generate credentials:

1. Jenkins → User Settings → API Token → Generate
2. Base64 encode: `echo -n "username:token" | base64`

**Links:**

- Plugin: https://plugins.jenkins.io/mcp-server

---

## 5. Monitoring & Observability

### 5.1 Grafana MCP Server (Official)

Official server from Grafana Labs. Prometheus, Loki, dashboards.

**`.mcp.json`:**

```json
"grafana": {
  "command": "npx",
  "args": ["-y", "@grafana/mcp-grafana"],
  "env": {
    "GRAFANA_URL": "http://localhost:3000",
    "GRAFANA_TOKEN": "<your-grafana-api-token>"
  }
}
```

**Links:**

- GitHub: https://github.com/grafana/mcp-grafana

> AWS Managed Prometheus and CloudWatch are covered in Section 3.

---

## 6. Configuration Management

### 6.1 Ansible MCP Server (Official — Red Hat)

Requires Ansible Automation Platform (AAP).

**`.mcp.json`:**

```json
"ansible": {
  "command": "npx",
  "args": ["-y", "@ansible/aap-mcp-server"],
  "env": {
    "AAP_BASE_URL": "https://<your-aap-host>",
    "AAP_OAUTH_TOKEN": "<your-aap-token>"
  }
}
```

Get token: AAP → User Settings → Tokens → Add.

**Links:**

- Official: https://github.com/ansible/aap-mcp-server

---

## 7. Security Guidelines

### 7.1 Core Principles

| Principle             | Implementation                                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| **Read-Only Default** | Configure IAM roles, tokens, service accounts with read-only access              |
| **No Auto-Apply**     | Never auto-execute `terraform apply`, `kubectl delete`, or AWS mutation commands |
| **Token Hygiene**     | Store tokens in env vars or secrets managers, never in committed files           |
| **Audit Trail**       | Use CloudTrail MCP to monitor API calls from MCP servers                         |
| **Sandbox Terraform** | Run `terraform plan` in isolated containers                                      |

### 7.2 CLAUDE.md Rules for DevOps

```markdown
## MCP Security Rules

- NEVER execute `terraform apply` or `terraform destroy` via MCP or Bash
- NEVER run AWS commands that mutate resources without explicit user confirmation
- NEVER execute `kubectl delete`, `kubectl apply`, or `helm upgrade` automatically
- ALWAYS use read-only IAM roles/tokens for MCP server authentication
- ALWAYS show the full command before executing anything on remote infrastructure
```

### 7.3 IAM Policy for AWS MCP (Read-Only)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "s3:Get*",
        "s3:List*",
        "cloudwatch:Get*",
        "cloudwatch:List*",
        "cloudwatch:Describe*",
        "logs:Get*",
        "logs:Describe*",
        "logs:FilterLogEvents",
        "ce:Get*",
        "iam:Get*",
        "iam:List*",
        "ecs:Describe*",
        "ecs:List*",
        "eks:Describe*",
        "eks:List*",
        "rds:Describe*",
        "lambda:Get*",
        "lambda:List*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 7.4 What MCP Servers Should NOT Do Automatically

| Action                          | Why                                           |
| ------------------------------- | --------------------------------------------- |
| `terraform apply/destroy`       | Infrastructure mutation requires human review |
| `aws ec2 terminate-instances`   | Irreversible data loss                        |
| `kubectl delete pod/deployment` | Service disruption                            |
| `git push --force`              | Overwrites team history                       |
| IAM policy/role changes         | Security-critical                             |
| Security group modifications    | Network exposure risk                         |
| Database DROP/TRUNCATE          | Data loss                                     |

---

## 8. Notes on Security Scanning Tools

**Checkov, tfsec, tflint, Trivy** do not have dedicated MCP servers as of April 2026.

- **tfsec** has been merged into **Trivy** (by Aqua Security) — use `trivy config .` instead
- **AWS IaC MCP Server** (Section 3.2) includes CDK Nag security scanning

Use them via Claude Code's built-in Bash tool or configure as **hooks**:

```json
// .claude/settings.json — run checkov after Terraform file edits
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "if echo $FILE | grep -q '\\.tf$'; then checkov -f $FILE --quiet; fi"
          }
        ]
      }
    ]
  }
}
```

---

## Sources

All links verified on 2026-04-14:

- [AWS Official MCP Catalog (66 servers)](https://awslabs.github.io/mcp/)
- [AWS MCP GitHub](https://github.com/awslabs/mcp)
- [HashiCorp Terraform MCP Server](https://github.com/hashicorp/terraform-mcp-server)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [GitLab MCP Docs](https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/)
- [Jenkins MCP Plugin](https://plugins.jenkins.io/mcp-server)
- [Grafana MCP Server](https://github.com/grafana/mcp-grafana)
- [Ansible AAP MCP Server](https://github.com/ansible/aap-mcp-server)
