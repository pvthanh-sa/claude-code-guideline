export const meta = {
  name: 'infra-review',
  description: 'Parallel security + infra-best-practice + cost review of a Terraform environment, synthesized into one severity-ranked go/no-go report. Stage 4 of the DevOps pipeline.',
  phases: [
    { title: 'Review', detail: 'security-auditor + infra-reviewer + cost-optimizer in parallel' },
    { title: 'Synthesize', detail: 'merge + dedupe + rank by severity, recommend go/no-go' },
  ],
}

// Target directory to review. Passed by /infra-review as args.path; defaults to cwd.
const target = (args && args.path) || '.'

// ---- Structured output schemas -------------------------------------------------
const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'location', 'remediation'],
        properties: {
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
          title: { type: 'string' },
          location: { type: 'string', description: 'file:line or resource' },
          risk: { type: 'string' },
          remediation: { type: 'string' },
        },
      },
    },
  },
}

const COST = {
  type: 'object',
  required: ['recommendations', 'estimatedMonthlySavingsUsd'],
  properties: {
    estimatedMonthlySavingsUsd: { type: 'number' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['action', 'estimatedMonthlySavingsUsd', 'risk'],
        properties: {
          action: { type: 'string' },
          location: { type: 'string' },
          estimatedMonthlySavingsUsd: { type: 'number' },
          risk: { type: 'string', enum: ['Low', 'Medium', 'High'] },
        },
      },
    },
  },
}

const REPORT = {
  type: 'object',
  required: ['recommendation', 'summary', 'topFindings'],
  properties: {
    recommendation: { type: 'string', enum: ['go', 'go-with-fixes', 'no-go'] },
    summary: { type: 'string' },
    counts: {
      type: 'object',
      properties: {
        critical: { type: 'number' }, high: { type: 'number' },
        medium: { type: 'number' }, low: { type: 'number' },
      },
    },
    estimatedMonthlySavingsUsd: { type: 'number' },
    topFindings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'location', 'remediation', 'source'],
        properties: {
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
          title: { type: 'string' },
          location: { type: 'string' },
          remediation: { type: 'string' },
          source: { type: 'string', enum: ['security', 'infra', 'cost'] },
        },
      },
    },
    mustFixBeforeApply: { type: 'array', items: { type: 'string' } },
  },
}

// ---- Phase 1: three independent reviewers, in parallel -------------------------
phase('Review')
const [security, infra, cost] = await parallel([
  () => agent(
    `You are auditing the Terraform infrastructure under "${target}". Perform a full security ` +
    `audit (secrets, IAM least-privilege, encryption at rest/in transit, network/SG exposure, ` +
    `container security, CI/CD/OIDC). Report every finding with severity, file:line location, ` +
    `risk, and remediation.`,
    { agentType: 'security-auditor', label: 'security', phase: 'Review', schema: FINDINGS },
  ),
  () => agent(
    `You are reviewing the Terraform infrastructure under "${target}" for best practices: naming ` +
    `(\${var.app_name}-resource-type), tagging (merge(var.tags,...)), variable descriptions/` +
    `validation, provider pinning, for_each vs count, lifecycle, AND cost efficiency / wasted ` +
    `resources (oversized instances, redundant NAT, missing lifecycle policies). Report every ` +
    `finding with severity and file:line.`,
    { agentType: 'infra-reviewer', label: 'infra', phase: 'Review', schema: FINDINGS },
  ),
  () => agent(
    `You are analyzing the Terraform infrastructure under "${target}" for cost optimization. ` +
    `Inspect instance classes, NAT strategy, desired counts/autoscaling, log retention, storage ` +
    `tiers/lifecycle, caching, and reserved-capacity opportunities. Give concrete actions with ` +
    `estimated monthly savings (USD) and risk.`,
    { agentType: 'cost-optimizer', label: 'cost', phase: 'Review', schema: COST },
  ),
])

// ---- Phase 2: synthesize into one report --------------------------------------
phase('Synthesize')
const report = await agent(
  `Merge these three reviews of "${target}" into ONE report. Dedupe overlapping findings, rank ` +
  `by severity, count by severity, sum estimated monthly savings, and give a go/no-go ` +
  `recommendation: "no-go" if any Critical, "go-with-fixes" if any High, else "go". List the ` +
  `Critical/High items in mustFixBeforeApply.\n\n` +
  `SECURITY:\n${JSON.stringify(security)}\n\n` +
  `INFRA:\n${JSON.stringify(infra)}\n\n` +
  `COST:\n${JSON.stringify(cost)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT },
)

return report
