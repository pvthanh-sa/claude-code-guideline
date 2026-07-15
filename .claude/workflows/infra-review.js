export const meta = {
  name: 'infra-review',
  description: 'Parallel security + infra-best-practice + cost review of a Terraform environment, synthesized into one severity-ranked go/no-go report. Stage 4 of the DevOps pipeline. Pass args.deep=true for loop-until-dry (higher recall: re-runs finders until 2 consecutive rounds find nothing new). Pass args.baseline=<path to the prior report> to label each finding RESOLVED / NEW / STILL-OPEN vs the last review — finders STILL full-scan every run (catches regressions in unchanged files); only synthesis is baseline-aware (no delta-skip). Pass args.note="<what changed>" to record an operator change-note in the report and focus the finders on that change (they still full-scan).',
  phases: [
    { title: 'Review', detail: 'security-auditor + infra-reviewer (looped until dry when deep) + cost-optimizer' },
    { title: 'Synthesize', detail: 'merge + dedupe + rank by severity, recommend go/no-go' },
  ],
}

// Inputs from /infra-review: args.path (target dir), args.deep (loop-until-dry).
// args may arrive as a plain string (the target dir), a JSON-encoded string, or an object.
let _a = args
if (typeof _a === 'string') {
  const t = _a.trim()
  if (t.startsWith('{')) { try { _a = JSON.parse(t) } catch { _a = { path: t } } }
  else { _a = { path: t } }
}
const target = (_a && _a.path) || '.'
const DEEP = !!(_a && _a.deep)
const MAX_ROUNDS = DEEP ? 5 : 1 // cap deep cost; 2 consecutive dry rounds also stop it
const DRY_STOP = 2
// Optional path to the previous report. Finders ignore it (they ALWAYS full-scan); ONLY synthesis
// reads it — to label findings RESOLVED / NEW / STILL-OPEN. No delta-skip: unchanged files are still audited.
const BASELINE = (_a && typeof _a.baseline === 'string' && _a.baseline.trim()) ? _a.baseline.trim() : ''
// Optional free-text note of what the operator changed this round. Recorded in the report AND given to
// the finders as a FOCUS hint — they still full-scan (the note never narrows coverage, only adds attention).
const NOTE = (_a && typeof _a.note === 'string' && _a.note.trim()) ? _a.note.trim() : ''
const noteFocus = NOTE
  ? ` The operator says they just changed: "${NOTE}". Still audit the FULL configuration as above — do ` +
    `NOT narrow scope — but pay particular attention to that change and its blast radius (what it touches, ` +
    `what could regress because of it).`
  : ''

// ---- Preflight: refuse to review a target with no Terraform in it --------------
// Scripts have no fs access, so a tiny agent checks. Guards against the silent
// wrong-target failure mode (e.g. args lost → '.') that wastes a full 3-agent run.
phase('Review')
const preflight = await agent(
  `Run: find "${target}" -name '*.tf' -not -path '*/.terraform/*' | head -5. ` +
  `Return tfFiles (count found, cap 5) and resolvedPath (realpath of the dir; '' if the dir does not exist). Nothing else.`,
  {
    label: 'preflight',
    model: 'haiku',
    schema: {
      type: 'object',
      required: ['tfFiles', 'resolvedPath'],
      properties: { tfFiles: { type: 'number' }, resolvedPath: { type: 'string' } },
    },
  }
)
if (!preflight || preflight.tfFiles === 0) {
  log(`ABORT: no .tf files under '${target}' — wrong target? Pass the environment dir explicitly.`)
  return {
    recommendation: 'no-go',
    summary: `Preflight failed: '${target}' (resolved: '${preflight ? preflight.resolvedPath : 'unknown'}') contains no Terraform files. The review did not run — re-invoke with the correct environment directory.`,
    topFindings: [],
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
  }
}

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
          // Well-Architected Security Pillar category (security findings only; omit for infra).
          waCategory: {
            type: 'string',
            enum: ['iam', 'detective-controls', 'infrastructure-protection', 'data-protection', 'incident-response'],
          },
          // True when the finding matches a risk explicitly accepted in the repo's spec
          // (docs/specs/*.spec.md "Accepted risks" section) — reported, but not gate-blocking.
          acceptedRisk: { type: 'boolean' },
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

// Prior-report shape (read by a small agent when a baseline path is passed). Parsed from the
// previous docs/reviews/<env>-<date>.md, NOT from the current code.
const BASELINE_SCHEMA = {
  type: 'object',
  required: ['found'],
  properties: {
    found: { type: 'boolean' },
    baselineDate: { type: 'string' },
    priorRecommendation: { type: 'string' },
    priorFindings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'location'],
        properties: {
          severity: { type: 'string' },
          title: { type: 'string' },
          location: { type: 'string' },
          acceptedRisk: { type: 'boolean' },
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
          waCategory: {
            type: 'string',
            enum: ['iam', 'detective-controls', 'infrastructure-protection', 'data-protection', 'incident-response'],
          },
          // Set ONLY when a baseline was provided: 'still-open' = also in the prior report; 'new' = first seen this run.
          status: { type: 'string', enum: ['new', 'still-open'] },
        },
      },
    },
    mustFixBeforeApply: { type: 'array', items: { type: 'string' } },
    // Findings that match spec-documented accepted risks: listed for re-validation, not blocking.
    acceptedRisks: { type: 'array', items: { type: 'string' } },
    // Count of security findings per Well-Architected Security Pillar category.
    waSecurityCounts: {
      type: 'object',
      properties: {
        iam: { type: 'number' }, 'detective-controls': { type: 'number' },
        'infrastructure-protection': { type: 'number' }, 'data-protection': { type: 'number' },
        'incident-response': { type: 'number' },
      },
    },
    // Free-text echo of what the operator said they changed this round (from args.note); omitted if none.
    changeNote: { type: 'string' },
    // Populated ONLY when a baseline report was provided: the diff vs the last review.
    changeSinceBaseline: {
      type: 'object',
      properties: {
        baselineDate: { type: 'string' },
        resolvedCount: { type: 'number' },
        newCount: { type: 'number' },
        stillOpenCount: { type: 'number' },
        resolved: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string' }, title: { type: 'string' }, location: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

// ---- Prompts (round-aware so deep rounds don't just repeat round 1) ------------
// Reviewers must honor risks the human already accepted at G1 (spec) instead of
// re-reporting them as blocking — G4 re-validates them, it doesn't re-litigate them.
const acceptedRiskNote =
  ` BEFORE reporting: look for the project's approved spec (docs/specs/*.spec.md at the repo ` +
  `root, typically 1–2 levels above "${target}") and read any "Accepted risks" / risk-acceptance ` +
  `section. A finding that matches an explicitly documented accepted risk must STILL be reported ` +
  `(so the gate re-validates the acceptance) but with "acceptedRisk": true and a remediation that ` +
  `cites the spec section and its stated before-production precondition. Only mark a finding ` +
  `accepted on an explicit documented match — never infer acceptance from code comments alone.`

const secPrompt = (round) =>
  `You are auditing the Terraform infrastructure under "${target}". Perform a full security ` +
  `audit (secrets, IAM least-privilege, encryption at rest/in transit, network/SG exposure, ` +
  `container security, CI/CD/OIDC). Report every finding with severity, file:line location, ` +
  `risk, and remediation. Also classify each finding by its AWS Well-Architected Security Pillar ` +
  `category in "waCategory": iam (identity & access) | detective-controls (logging/monitoring/audit, ` +
  `e.g. CloudTrail, Config, flow logs) | infrastructure-protection (network/SG/WAF/boundaries) | ` +
  `data-protection (encryption, secrets, key mgmt) | incident-response (recoverability, alarms, runbooks).` +
  acceptedRiskNote +
  (round > 1 ? ` This is review ROUND ${round}: surface only LESS-obvious issues not caught earlier — edge cases, cross-cutting and second-order risks.` : '') +
  noteFocus

const infraPrompt = (round) =>
  `You are reviewing the Terraform infrastructure under "${target}" for best practices: naming ` +
  `(\${var.app_name}-resource-type), tagging (merge(var.tags,...)), variable descriptions/` +
  `validation, provider pinning, for_each vs count, lifecycle, AND wasted resources (oversized ` +
  `instances, redundant NAT, missing lifecycle policies). Report every finding with severity and file:line.` +
  acceptedRiskNote +
  (round > 1 ? ` This is review ROUND ${round}: surface only issues not already obvious — subtle or cross-module ones.` : '') +
  noteFocus

const costPrompt =
  `You are analyzing the Terraform infrastructure under "${target}" for cost optimization. ` +
  `Inspect instance classes, NAT strategy, desired counts/autoscaling, log retention, storage ` +
  `tiers/lifecycle, caching, and reserved-capacity opportunities. Give concrete actions with ` +
  `estimated monthly savings (USD) and risk.` +
  noteFocus

// ---- Phase 1: review (single pass, or loop-until-dry when deep) ----------------
const seen = new Set()
const key = (f) =>
  `${(f.severity || '').toLowerCase()}|${(f.title || '').toLowerCase().trim()}|${(f.location || '').toLowerCase().trim()}`
const findings = []
let cost = null
let dry = 0
// Track reviewers that returned null (agent missing / died on a terminal error). A failed reviewer
// means the review is INCOMPLETE — it must NOT be allowed to read as a clean "go" (silent false-go
// is the worst failure mode: the agentType may be absent if /init-project wasn't run for the project).
const incomplete = new Set()

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
  // A null result = that reviewer didn't run (missing agentType or terminal error). Record it.
  if (!sec) incomplete.add('security-auditor')
  if (!inf) incomplete.add('infra-reviewer')
  if (round === 1 && !cost) incomplete.add('cost-optimizer')

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
// If a reviewer never ran, the review can't be trusted to clear an apply. Don't emit "go".
if (incomplete.size) {
  const which = [...incomplete].join(', ')
  log(`INCOMPLETE: reviewer(s) did not run: ${which} — forcing go-with-fixes and flagging in the report.`)
  return {
    recommendation: 'go-with-fixes',
    summary: `INCOMPLETE REVIEW — the following reviewer(s) did not run: ${which}. ` +
      `Likely cause: the agent definition(s) are not resolvable — install them user-level so /infra-review ` +
      `works in any project (symlink ~/.claude/agents/{infra-reviewer,cost-optimizer,security-auditor,incident-responder}.md ` +
      `per pipeline-usage-guide §1.1), or run /init-project to copy them into this project's .claude/agents/; ` +
      `failing that the agent hit a terminal error. The findings below cover only the reviewers that DID run, so absence of ` +
      `findings here does NOT mean clean. Re-run /infra-review after restoring the agents before trusting a go.`,
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
    topFindings: findings.slice(0, 50),
    mustFixBeforeApply: [`Restore missing reviewer agent(s): ${which}, then re-run /infra-review`],
  }
}
// Baseline-aware labeling: read the prior report (if one was passed) so synthesis can mark each
// finding RESOLVED / NEW / STILL-OPEN. The finders above always full-scan — this only adds labels.
let baseline = null
if (BASELINE) {
  baseline = await agent(
    `Read the prior infra-review report file at "${BASELINE}". If it does not exist or can't be read, ` +
    `return {"found": false}. If it exists, return found:true, baselineDate (from the filename or the ` +
    `report's header/date), priorRecommendation, and priorFindings: every finding it lists (top findings, ` +
    `must-fix, AND accepted-risks) as {severity,title,location,acceptedRisk}. Only PARSE the report file — ` +
    `do NOT inspect the current Terraform.`,
    { label: 'baseline', model: 'haiku', phase: 'Synthesize', schema: BASELINE_SCHEMA }
  )
  if (baseline && baseline.found) {
    log(`baseline: ${(baseline.priorFindings || []).length} prior finding(s)${baseline.baselineDate ? ' from ' + baseline.baselineDate : ''}`)
  } else {
    log(`baseline '${BASELINE}' not found/empty — proceeding without change labels`)
    baseline = null
  }
}
const baselineNote = baseline
  ? `\n\nBASELINE — prior report${baseline.baselineDate ? ' (' + baseline.baselineDate + ')' : ''} findings:\n` +
    `${JSON.stringify(baseline.priorFindings || [])}\n` +
    `Diff the CURRENT findings against this baseline (match by title + location SEMANTICALLY, not exact ` +
    `string; severity may have shifted). For each current finding set "status": "still-open" if it matches a ` +
    `baseline finding, else "new". Put baseline findings with NO current match into "changeSinceBaseline.resolved" ` +
    `and fill baselineDate + resolvedCount/newCount/stillOpenCount. LEAD the summary with the change framing — ` +
    `e.g. "vs baseline ${baseline.baselineDate || 'prior run'}: N resolved, K new, M still-open; regression: yes/no" ` +
    `— so the reader sees what CHANGED, not a fresh wall of findings. (Full-scan still ran, so a STILL-OPEN that ` +
    `was supposedly fixed, or a NEW one in an untouched file, is a real regression — call it out.)`
  : ''
const noteNote = NOTE
  ? `\n\nOPERATOR CHANGE NOTE (this round): "${NOTE}". Set "changeNote" to it verbatim and OPEN the ` +
    `summary with one line stating what the operator changed + whether the review found any issue ` +
    `introduced by it.`
  : ''
const report = await agent(
  `Merge this review of "${target}" into ONE report. Findings are already deduped; rank by ` +
  `severity, count by severity, sum estimated monthly savings from COST, and give a go/no-go ` +
  `recommendation: "no-go" if any Critical, "go-with-fixes" if any High, else "go". ` +
  `Findings with "acceptedRisk": true are EXCLUDED from the severity counts, the go/no-go ` +
  `decision, and mustFixBeforeApply — instead list each in "acceptedRisks" as ` +
  `"<title> — accepted in spec; before prod: <precondition>" so the human re-validates the ` +
  `acceptance (and mention the accepted count in the summary). Put the remaining ` +
  `Critical/High items in mustFixBeforeApply. Set each topFindings.source from the finding's "source" field, ` +
  `and carry over each security finding's "waCategory". Also tally security findings per ` +
  `Well-Architected Security category into waSecurityCounts so the human sees coverage across the pillar.\n\n` +
  `FINDINGS (security+infra, deduped over ${DEEP ? 'multiple rounds' : '1 round'}):\n${JSON.stringify(findings)}\n\n` +
  `COST:\n${JSON.stringify(cost)}` + baselineNote + noteNote,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT },
)

return report
