export const meta = {
  name: 'infra-review',
  description: 'Parallel security + infra-best-practice + cost review of a Terraform environment, synthesized into one severity-ranked go/no-go report. Stage 4 of the DevOps pipeline. Pass args.deep=true for loop-until-dry (higher recall: re-runs finders until 2 consecutive rounds find nothing new).',
  phases: [
    { title: 'Review', detail: 'security-auditor + infra-reviewer (looped until dry when deep) + cost-optimizer' },
    { title: 'Synthesize', detail: 'merge + dedupe + rank by severity, recommend go/no-go' },
  ],
}

// Inputs from /infra-review: args.path (target dir), args.deep (loop-until-dry).
const target = (args && args.path) || '.'
const DEEP = !!(args && args.deep)
const MAX_ROUNDS = DEEP ? 5 : 1 // cap deep cost; 2 consecutive dry rounds also stop it
const DRY_STOP = 2

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

// ---- Prompts (round-aware so deep rounds don't just repeat round 1) ------------
const secPrompt = (round) =>
  `You are auditing the Terraform infrastructure under "${target}". Perform a full security ` +
  `audit (secrets, IAM least-privilege, encryption at rest/in transit, network/SG exposure, ` +
  `container security, CI/CD/OIDC). Report every finding with severity, file:line location, ` +
  `risk, and remediation.` +
  (round > 1 ? ` This is review ROUND ${round}: surface only LESS-obvious issues not caught earlier — edge cases, cross-cutting and second-order risks.` : '')

const infraPrompt = (round) =>
  `You are reviewing the Terraform infrastructure under "${target}" for best practices: naming ` +
  `(\${var.app_name}-resource-type), tagging (merge(var.tags,...)), variable descriptions/` +
  `validation, provider pinning, for_each vs count, lifecycle, AND wasted resources (oversized ` +
  `instances, redundant NAT, missing lifecycle policies). Report every finding with severity and file:line.` +
  (round > 1 ? ` This is review ROUND ${round}: surface only issues not already obvious — subtle or cross-module ones.` : '')

const costPrompt =
  `You are analyzing the Terraform infrastructure under "${target}" for cost optimization. ` +
  `Inspect instance classes, NAT strategy, desired counts/autoscaling, log retention, storage ` +
  `tiers/lifecycle, caching, and reserved-capacity opportunities. Give concrete actions with ` +
  `estimated monthly savings (USD) and risk.`

// ---- Phase 1: review (single pass, or loop-until-dry when deep) ----------------
const seen = new Set()
const key = (f) =>
  `${(f.severity || '').toLowerCase()}|${(f.title || '').toLowerCase().trim()}|${(f.location || '').toLowerCase().trim()}`
const findings = []
let cost = null
let dry = 0

phase('Review')
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const tasks = [
    () => agent(secPrompt(round), { agentType: 'security-auditor', label: `security r${round}`, phase: 'Review', schema: FINDINGS }),
    () => agent(infraPrompt(round), { agentType: 'infra-reviewer', label: `infra r${round}`, phase: 'Review', schema: FINDINGS }),
  ]
  if (round === 1) {
    tasks.push(() => agent(costPrompt, { agentType: 'cost-optimizer', label: 'cost', phase: 'Review', schema: COST }))
  }
  const res = await parallel(tasks)
  const sec = res[0]
  const inf = res[1]
  if (round === 1) cost = res[2]

  const tagged = [
    ...(((sec && sec.findings) || []).map((f) => ({ ...f, source: 'security' }))),
    ...(((inf && inf.findings) || []).map((f) => ({ ...f, source: 'infra' }))),
  ]
  const fresh = tagged.filter((f) => {
    const k = key(f)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  findings.push(...fresh)
  log(`round ${round}: +${fresh.length} new finding(s) (total ${findings.length})`)

  if (!DEEP) break
  if (fresh.length === 0) {
    if (++dry >= DRY_STOP) { log(`dry for ${DRY_STOP} rounds — stopping`); break }
  } else {
    dry = 0
  }
}

// ---- Phase 2: synthesize into one report --------------------------------------
phase('Synthesize')
const report = await agent(
  `Merge this review of "${target}" into ONE report. Findings are already deduped; rank by ` +
  `severity, count by severity, sum estimated monthly savings from COST, and give a go/no-go ` +
  `recommendation: "no-go" if any Critical, "go-with-fixes" if any High, else "go". Put the ` +
  `Critical/High items in mustFixBeforeApply. Set each topFindings.source from the finding's "source" field.\n\n` +
  `FINDINGS (security+infra, deduped over ${DEEP ? 'multiple rounds' : '1 round'}):\n${JSON.stringify(findings)}\n\n` +
  `COST:\n${JSON.stringify(cost)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT },
)

return report
