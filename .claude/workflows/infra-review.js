export const meta = {
  name: 'infra-review',
  description: 'Parallel stack-aware review of an environment — Terraform, Ansible, or both — synthesized into one severity-ranked go/no-go report. Stage 4 of the DevOps pipeline. The preflight detects which stacks are present and picks the reviewer roster: Terraform gets security + infra-best-practice + cost, Ansible gets security + ansible (idempotency, secrets, privilege, targeting safety), a mixed repo gets all four in one report. Pass args.deep=true for loop-until-dry (higher recall: re-runs finders until 2 consecutive rounds find nothing new). Pass args.baseline=<path to the prior report> to label each finding RESOLVED / NEW / STILL-OPEN vs the last review — finders STILL full-scan every run (catches regressions in unchanged files); only synthesis is baseline-aware (no delta-skip). Pass args.note="<what changed>" to record an operator change-note in the report and focus the finders on that change (they still full-scan). RESUMABLE: a full four-reviewer pass costs ~700k tokens, more than one session usually has, so pass args.only=["security"] to run a subset and args.priorFindings=[...] to carry forward what earlier partial runs already found. The return value carries allFindings (raw, uncapped) and ranSources so the caller can persist them between sessions. A source omitted from args.only is DEFERRED, not missing -- the incomplete-reviewer guard does not fire for it.',
  phases: [
    { title: 'Review', detail: 'security-auditor + per-stack reviewers (looped until dry when deep) + cost-optimizer' },
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
// Set at synthesis time when a partial run would make the baseline lie. See the guard below.
let BASELINE_DISABLED = false
// Optional free-text note of what the operator changed this round. Recorded in the report AND given to
// the finders as a FOCUS hint — they still full-scan (the note never narrows coverage, only adds attention).
const NOTE = (_a && typeof _a.note === 'string' && _a.note.trim()) ? _a.note.trim() : ''
// ---- RESUMABILITY -------------------------------------------------------------
// A four-reviewer pass costs ~700k tokens, which is more than one session usually has. Losing all
// of it because reviewer four ran out of budget is the failure this pair of inputs removes.
//
//   args.only          -- run ONLY these sources (e.g. ["ansible"]). Everything else is DEFERRED,
//                         which is not the same as missing: the incomplete guard must not fire.
//   args.priorFindings -- findings already collected by earlier partial runs. Merged and deduped
//                         exactly like fresh ones, so the report is whole even though no single
//                         run produced all of it.
//
// The skill owns the state file; scripts have no fs access, so the split is deliberate.
const ONLY = Array.isArray(_a && _a.only) ? _a.only.filter((x) => typeof x === 'string') : []
const PRIOR = Array.isArray(_a && _a.priorFindings) ? _a.priorFindings : []
const noteFocus = NOTE
  ? ` The operator says they just changed: "${NOTE}". Still audit the FULL configuration as above — do ` +
    `NOT narrow scope — but pay particular attention to that change and its blast radius (what it touches, ` +
    `what could regress because of it).`
  : ''

// ---- Preflight: detect which stack(s) are present ------------------------------
// Scripts have no fs access, so a tiny agent checks. Guards against the silent
// wrong-target failure mode (e.g. args lost → '.') that wastes a full reviewer run.
// It also picks the roster: an Ansible-only repo used to abort here with a bare no-go.
phase('Review')
const preflight = await agent(
  `In "${target}", run BOTH of these and report the counts:\n` +
  `  A) find "${target}" -name '*.tf' -not -path '*/.terraform/*' | head -5\n` +
  `  B) find "${target}" \\( -name ansible.cfg -o -name site.yml -o -path '*/roles/*/tasks/*' ` +
  `-o -path '*/playbooks/*' -o -path '*/group_vars/*' \\) ` +
  `-not -path '*/.git/*' -not -path '*/knowledge/templates/*' -not -path '*/.claude/*' | head -5\n` +
  `Exclude template and tooling copies (B's -not clauses): a scaffolding template is not a stack, ` +
  `and counting one would make every repo that merely SHIPS Ansible templates look like an Ansible ` +
  `project. If B finds nothing but a real playbook exists under an unusual name, say so rather than ` +
  `guessing — the operator can re-target.\n` +
  `Return tfFiles (count from A, cap 5), ansibleFiles (count from B, cap 5), and resolvedPath ` +
  `(realpath of the dir; '' if the dir does not exist). Nothing else.`,
  {
    label: 'preflight',
    model: 'haiku',
    schema: {
      type: 'object',
      required: ['tfFiles', 'ansibleFiles', 'resolvedPath'],
      properties: {
        tfFiles: { type: 'number' },
        ansibleFiles: { type: 'number' },
        resolvedPath: { type: 'string' },
      },
    },
  }
)
const HAS_TF = !!(preflight && preflight.tfFiles > 0)
const HAS_ANSIBLE = !!(preflight && preflight.ansibleFiles > 0)
if (!HAS_TF && !HAS_ANSIBLE) {
  log(`ABORT: no Terraform and no Ansible under '${target}' — wrong target? Pass the directory explicitly.`)
  return {
    recommendation: 'no-go',
    summary: `Preflight failed: '${target}' (resolved: '${preflight ? preflight.resolvedPath : 'unknown'}') contains neither Terraform (*.tf) nor Ansible (ansible.cfg / site.yml / roles/*/tasks / playbooks / group_vars). The review did not run — re-invoke with the correct directory.`,
    topFindings: [],
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
  }
}

// The stack drives the reviewer roster AND the noun every prompt uses. Saying "the Terraform
// infrastructure" to a reviewer looking at a role tree makes it hunt for something that isn't there.
const STACK = HAS_TF && HAS_ANSIBLE ? 'both' : (HAS_TF ? 'terraform' : 'ansible')
const stackNoun = STACK === 'both'
  ? 'Terraform infrastructure and Ansible configuration'
  : (STACK === 'terraform' ? 'Terraform infrastructure' : 'Ansible configuration (playbooks, roles, inventory)')
log(`stack: ${STACK} (tf=${preflight.tfFiles}, ansible=${preflight.ansibleFiles}) — reviewing as "${stackNoun}"`)

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
  required: ['recommendation', 'summary', 'topFindings', 'findingsBySource'],
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
          source: { type: 'string', enum: ['security', 'infra', 'ansible', 'cost'] },
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
      // Findings contributed by EACH reviewer that ran. Required, because the failure this guards
      // against is silent: a report can list 50 findings and look complete while an entire
      // reviewer's output is missing. A per-source tally makes "ansible: 0" impossible to miss on
      // a repo whose ansible-reviewer just spent 129k tokens.
      findingsBySource: {
        type: 'object',
        properties: {
          security: { type: 'number' }, infra: { type: 'number' }, ansible: { type: 'number' },
        },
      },
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

// Ansible widens the security surface: plaintext secrets in group_vars, an unencrypted vault,
// a disabled host_key_checking, and blast radius are all security findings a Terraform-shaped
// prompt would never look for.
const secAnsibleNote = HAS_ANSIBLE
  ? ` The target also contains Ansible: additionally check for plaintext secrets in group_vars/` +
    `host_vars/templates, unencrypted vault files, missing no_log on secret-handling tasks, ` +
    `host_key_checking disabled, hosts: all / unbounded blast radius, unpinned get_url downloads ` +
    `(no checksum), and world-readable modes on files that carry credentials.`
  : ''

const secPrompt = (round) =>
  `You are auditing the ${stackNoun} under "${target}". Perform a full security ` +
  `audit (secrets, IAM least-privilege, encryption at rest/in transit, network/SG exposure, ` +
  `container security, CI/CD/OIDC). Report every finding with severity, file:line location, ` +
  `risk, and remediation.` + secAnsibleNote +
  ` Also classify each finding by its AWS Well-Architected Security Pillar ` +
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

// Ansible-specific judgment pass. Deliberately NOT a linter re-run: yamllint / --syntax-check /
// ansible-lint already ran at G3b, and the ansible-reviewer agent is told to skip what they cover.
const ansiblePrompt = (round) =>
  `You are reviewing the Ansible configuration under "${target}" — playbooks, roles, inventory, ` +
  `group_vars/host_vars, templates, ansible.cfg. Judgment findings only: the deterministic gates ` +
  `(yamllint, --syntax-check, ansible-lint --profile production) run separately at G3b, so do not ` +
  `re-report what a linter already flags. Cover idempotency (command/shell without ` +
  `creates/removes/changed_when; changed_when: true, which makes the second-run changed=0 proof ` +
  `impossible; unreachable handlers), secret handling (vars/vault split, no_log, nothing written ` +
  `plaintext to a target), privilege scope (play-wide vs task-scoped become), file permissions and ` +
  `self-lockout (missing validate: on sshd/sudoers/nginx configs, firewall rules that can cut the ` +
  `control node's own access), targeting safety (hosts: all, missing serial:, mixed prod/non-prod ` +
  `groups), and structure (FQCN, role-prefixed vars, defaults vs vars, pinned collections). ` +
  `Report every finding with severity, file:line location, risk, and remediation. NEVER run a ` +
  `playbook — read only.` +
  acceptedRiskNote +
  (round > 1 ? ` This is review ROUND ${round}: surface only issues not already obvious — subtle, cross-role, or second-order ones.` : '') +
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
// Seed from whatever earlier PARTIAL runs already produced, and seed `seen` with them too so a
// reviewer re-run today cannot duplicate a finding it reported yesterday. This is what makes the
// review survive a session that ran out of budget half way through.
const findings = [...PRIOR]
for (const f of PRIOR) seen.add(key(f))
// Rank before any truncation. `findings` accumulates in roster order (security, infra, ansible),
// so a plain slice() drops whatever the LAST reviewer found — and ansible-reviewer is always last.
// Measured: 86 findings became "security 28 + infra 22", with all 24 ansible findings and 12 of
// infra's silently gone, in a report whose whole purpose was to prove the four-reviewer path.
// Sorting by severity first means a cap can only ever cost Low/Info, never a reviewer.
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const bySeverity = (a, b) =>
  (SEV_RANK[(a.severity || '').toLowerCase()] ?? 9) - (SEV_RANK[(b.severity || '').toLowerCase()] ?? 9)
const TOP_N = 50
// Never truncate silently: say what was dropped and from whom, so a short report is visibly short.
function topN(all) {
  const ranked = [...all].sort(bySeverity)
  if (ranked.length <= TOP_N) return ranked
  const dropped = ranked.slice(TOP_N)
  const per = {}
  for (const f of dropped) per[f.source || '?'] = (per[f.source || '?'] || 0) + 1
  log(`topFindings capped at ${TOP_N}: ${dropped.length} lower-severity finding(s) omitted (` +
      Object.entries(per).map(([k, v]) => `${k}:${v}`).join(', ') +
      `). Full set is in the per-agent transcripts.`)
  return ranked.slice(0, TOP_N)
}
let cost = null
let dry = 0
// Track reviewers that returned null (agent missing / died on a terminal error). A failed reviewer
// means the review is INCOMPLETE — it must NOT be allowed to read as a clean "go" (silent false-go
// is the worst failure mode: the agentType may be absent if /init-project wasn't run for the project).
const incomplete = new Set()
// A reviewer that produced findings in round 1 and then died in round 3 is NOT missing — recall is
// reduced, that is all. Conflating the two made the guard print "install the agents / run
// /init-project" about three reviewers that had just spent 490k tokens reviewing, and sent the
// operator to reinstall something that was never broken. Track them apart.
const everRan = new Set()
const lateFailures = []

phase('Review')
for (let round = 1; round <= MAX_ROUNDS; round++) {
  // Roster by stack. Named, not positional: the set of reviewers now varies, and index-based
  // unpacking would silently misattribute findings the first time a stack combination changes.
  const roster = [
    { source: 'security', agentType: 'security-auditor', prompt: secPrompt(round) },
  ]
  if (HAS_TF) roster.push({ source: 'infra', agentType: 'infra-reviewer', prompt: infraPrompt(round) })
  if (HAS_ANSIBLE) roster.push({ source: 'ansible', agentType: 'ansible-reviewer', prompt: ansiblePrompt(round) })

  // args.only lets an operator spend one session on one reviewer. A source that is skipped is NOT
  // "did not run" -- it was deliberately deferred, and its findings arrive via args.priorFindings on
  // a later run. Conflating the two would make every partial run report itself as incomplete.
  const active = ONLY.length ? roster.filter((r) => ONLY.includes(r.source)) : roster
  if (ONLY.length && round === 1) {
    const deferred = roster.filter((r) => !ONLY.includes(r.source)).map((r) => r.source)
    log(`partial run: running ${active.map((r) => r.source).join(', ') || '(nothing — check args.only)'}` +
        (deferred.length ? `; deferred ${deferred.join(', ')} (pass their findings back via priorFindings)` : ''))
  }

  const tasks = active.map((r) => () =>
    agent(r.prompt, { agentType: r.agentType, label: `${r.source} r${round}`, phase: 'Review', schema: FINDINGS })
  )
  // Cost is Terraform-only (instance classes, NAT, storage tiers) and round-1 only.
  const runCost = round === 1 && HAS_TF && (!ONLY.length || ONLY.includes('cost'))
  if (runCost) {
    tasks.push(() => agent(costPrompt, { agentType: 'cost-optimizer', label: 'cost', phase: 'Review', schema: COST }))
  }
  const res = await parallel(tasks)
  if (runCost) cost = res[active.length]

  // A null result in ROUND 1 means the reviewer never ran at all — a missing agentType or a
  // terminal error, and the review genuinely cannot be trusted. A null in a LATER round means it
  // ran and then died (token limit, timeout); the findings it already produced still count.
  active.forEach((r, i) => {
    if (res[i]) { everRan.add(r.agentType); return }
    if (everRan.has(r.agentType)) lateFailures.push(`${r.agentType} (round ${round})`)
    else incomplete.add(r.agentType)
  })
  if (runCost) { if (cost) everRan.add('cost-optimizer'); else incomplete.add('cost-optimizer') }

  const tagged = active.flatMap((r, i) =>
    (((res[i] && res[i].findings) || []).map((f) => ({ ...f, source: r.source })))
  )
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
  // Count what the reviewers that DID run actually found. Returning zeroed counts next to a
  // populated topFindings list contradicts itself, and downgrading a real Critical to
  // go-with-fixes is a worse failure than the missing reviewer: an incomplete review may not
  // clear an apply, but it must not soften a finding it did produce either.
  const partial = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) {
    if (f.acceptedRisk) continue
    const k = (f.severity || '').toLowerCase()
    if (k in partial) partial[k]++
  }
  log(`INCOMPLETE: reviewer(s) did not run: ${which} — counted ${partial.critical} critical / ${partial.high} high from the reviewers that did.`)
  return {
    recommendation: partial.critical > 0 ? 'no-go' : 'go-with-fixes',
    summary: `INCOMPLETE REVIEW — reviewer(s) that NEVER ran: ${which}. ` +
      `They produced nothing in any round. agent() returns null for BOTH causes and cannot tell them ` +
      `apart, so check which one this was before acting: the task notification's <failures> block and ` +
      `/workflows print the real error. ` +
      `(a) "session limit" / timeout — nothing is broken; the run was too expensive. A four-reviewer ` +
      `pass over a mixed repo costs ~700k tokens, so start it FIRST in a session, drop --deep, or ` +
      `narrow the target. Resuming does not help when the failure was in round 1: nothing was cached. ` +
      `(b) agent not resolvable — symlink ` +
      `~/.claude/agents/{infra-reviewer,cost-optimizer,security-auditor,ansible-reviewer,incident-responder}.md ` +
      `per pipeline-usage-guide §1.1, or run /init-project to copy them into this project's .claude/agents/. ` +
      `Reinstalling agents will NOT fix (a). ` +
      `The findings below cover only the reviewers that DID run, so absence of findings here does NOT mean clean. ` +
      `Counts are PARTIAL: ${partial.critical} critical, ${partial.high} high, ${partial.medium} medium, ` +
      `${partial.low} low.` +
      (lateFailures.length
        ? ` SEPARATELY — and NOT a missing agent — these reviewers ran and then died in a later round: ` +
          `${lateFailures.join(', ')}. Their earlier findings are included above; only RECALL is reduced. ` +
          `A token limit mid-run looks like this. Do not reinstall anything on account of it.`
        : ''),
    counts: partial,
    topFindings: topN(findings),
    // RAW and uncapped, for the skill to persist. topFindings is ranked and capped for humans;
    // feeding that back as priorFindings next run would silently lose everything the cap dropped.
    allFindings: findings,
    ranSources: [...everRan],
    mustFixBeforeApply: [
      `Restore missing reviewer agent(s): ${which}, then re-run /infra-review`,
      ...findings
        .filter((f) => !f.acceptedRisk && ['critical', 'high'].includes((f.severity || '').toLowerCase()))
        .map((f) => `[${f.severity}] ${f.title} — ${f.location}`),
    ],
  }
}
// Every reviewer ran at least once, but a later round may still have died. That is not an
// incomplete review — it is a shallower one — and staying silent about it would let a --deep run
// that actually managed one round read as if it had looped to exhaustion.
if (lateFailures.length) {
  log(`NOTE: ${lateFailures.join(', ')} ran and then failed in a later round. Findings from their ` +
      `completed rounds are included; recall is lower than a full --deep pass. Common cause: a ` +
      `session token limit. No agent is missing.`)
}

// GUARD: `only` + `baseline` is a false-RESOLVED machine unless priorFindings covers the deferred
// sources. Synthesis marks a baseline finding RESOLVED when it has no match in the CURRENT set --
// and a reviewer that was deliberately skipped contributes nothing, so every one of its real,
// still-open findings would be reported as fixed. That is worse than no labels at all: it tells the
// operator a Critical went away.
if (ONLY.length && BASELINE) {
  const covered = new Set(findings.map((f) => f.source))
  const missing = ['security', 'infra', 'ansible'].filter(
    (src) => !ONLY.includes(src) && !covered.has(src),
  )
  if (missing.length) {
    log(`baseline DISABLED: this run skipped ${missing.join(', ')} and priorFindings carries nothing ` +
        `for them, so every baseline finding from those reviewers would be mislabelled RESOLVED. ` +
        `Re-run with priorFindings from the partial-state file, or without --baseline.`)
    BASELINE_DISABLED = true
  }
}

// Baseline-aware labeling: read the prior report (if one was passed) so synthesis can mark each
// finding RESOLVED / NEW / STILL-OPEN. The finders above always full-scan — this only adds labels.
let baseline = null
if (BASELINE && !BASELINE_DISABLED) {
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
    `Set findingsBySource to the count of INPUT findings per source — count what you were GIVEN, not ` +
    `what you kept. EVERY source present in the input must appear in topFindings: if the cap forces a ` +
    `choice, drop the lowest-severity items ACROSS sources, never a whole source. A reviewer that ran ` +
    `and contributed nothing to topFindings is indistinguishable from one that never ran at all.\n\n` +
  `The target's stack is: ${STACK} (${stackNoun}). Say so in the summary so the reader knows which ` +
  `reviewers ran${HAS_TF ? '' : ' — cost analysis is Terraform-only and did not run for this target'}.\n\n` +
  `FINDINGS (deduped over ${DEEP ? 'multiple rounds' : '1 round'}, source ∈ security|infra|ansible):\n${JSON.stringify(findings)}\n\n` +
  `COST:\n${JSON.stringify(cost)}` + baselineNote + noteNote,
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT },
)

  // Same reason as the incomplete branch: the caller persists the RAW set so a later partial run can
  // resume from it. The synthesised report is for humans and is lossy by design -- feeding it back as
  // priorFindings would silently drop everything the cap removed.
  return { ...(report || {}), allFindings: findings, ranSources: [...everRan] }
