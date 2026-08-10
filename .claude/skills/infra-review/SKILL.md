---
name: infra-review
description: 'Stage 4 of the DevOps pipeline. Run a parallel, stack-aware review of an environment via the infra-review Workflow — Terraform gets security + infra-best-practice + cost, Ansible gets security + idempotency/secrets/privilege/targeting, a mixed repo gets all four in one report — save it to docs/reviews/<env>-<date>.md, present one synthesized severity-ranked go/no-go — baseline-aware on re-reviews, labeling each finding RESOLVED/NEW/STILL-OPEN vs the prior report — optionally cross-checking the deployed stack read-only with --live (drift + live-only findings), and STOP at human gate G4. Never edits code or applies without explicit approval.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Workflow
argument-hint: '[target-dir] [--deep] [--live] [--only security,infra,ansible,cost] [--baseline <prior-report> | --no-baseline] [--note "<what changed>"]'
---

# Infra Review — Stage 4 (Review gate)

Run the final review across several independent perspectives **in parallel**, then hand the
human one consolidated report to decide go / fix / no-go.

> **Human gate G4:** This skill produces a report and **STOPS**. It does not fix code, does not
> `terraform apply`, does not commit. After presenting the report, ask the human which findings
> to address — and only then, in a follow-up, make changes they approve.

**This is the review gate for BOTH stacks.** The workflow's preflight detects what the target
actually contains and picks the roster: Terraform → `security-auditor` + `infra-reviewer` +
`cost-optimizer`; Ansible → `security-auditor` + `ansible-reviewer` (idempotency, secrets,
privilege scope, targeting safety); a repo with both → all four, one report. There is no separate
Ansible review gate — `/ansible-implement` (G3b) hands off to here.

**Target dir:** first non-flag token of `$ARGUMENTS` (e.g. `environments/tokyo-dev`). Default: current dir.
Confirm the target before running — and point it at the directory that holds the stack you mean.
For a mixed repo, the repo root reviews both; an `environments/<env>` dir reviews only the
Terraform under it.

**`--deep` flag:** if `$ARGUMENTS` contains `--deep`, run in **loop-until-dry** mode — the workflow
re-runs the finders for several rounds and stops only after 2 consecutive rounds surface no new
(deduped) findings. Use it for higher recall (a single AI pass is **not exhaustive** — see the note
at the end). Default (no flag) = one pass.

**Baseline — iterative reviews (RESOLVED / NEW / STILL-OPEN).** `/infra-review` audits the FULL code
every run (full-scan is the point — it catches regressions in files you didn't touch, like
`checkov`/`trivy`; there is **no delta-skip**). What it adds across iterations is a **label layer**:
pass the prior report as a baseline and synthesis tags each finding **RESOLVED** (was in the prior
report, gone now), **STILL-OPEN** (in both), or **NEW** (first seen this run) — so a re-review reads as
*"last run's High is resolved, no regression, only X + Y new"* instead of re-printing the whole wall.

- **Auto-detect the baseline** before running — the most recent existing report for this env (skip if
  none → that's the first run):
  ```bash
  ENV="$(basename '<target-dir>')"
  BASELINE="$(ls -1 docs/reviews/${ENV}-*.md 2>/dev/null | sort | tail -1)"
  echo "${BASELINE:-<none — first review>}"
  ```
  Pass `args.baseline = "$BASELINE"` when non-empty. `--no-baseline` forces a clean review (no labels);
  an explicit `--baseline <path>` overrides the auto-detected one. The baseline feeds **only** the
  synthesis agent — the finders never see it, so coverage is identical with or without it.
- **`--note "<what changed>"`** — when you re-review after editing the IaC, pass a one-line note of
  *what* you changed. It is recorded in the report (`changeNote` + a lead line in the summary) **and**
  handed to the finders as a focus hint — they still **full-scan**, just pay extra attention to that
  change and its blast radius. Use it so the report captures the *intent* of the change, not only the
  findings delta (baseline alone sees which findings changed, not what code you touched). If the
  operator typed `--note "<text>"` (or said it in chat at invocation), parse it out and pass `args.note`.

**`--live` flag (optional — review the deployed stack, not just the code).** The finders read
**code + plan**; they cannot see what actually got applied. When the env is deployed and you want the
review to also check reality, pass `--live`: the skill adds a **read-only** live-inspection pass (see
Phase 1.5) that catches what static review structurally can't — **drift** (console/CLI changes not in
code), resources created **outside** Terraform, and posture that's only observable live (actual
public-access blocks, encryption state, attached IAM, SG ingress). Skip it (default) when the stack
isn't applied yet or you're reviewing pure code.

> `--live` is **Terraform/AWS-only** — it is built on `terraform plan -refresh-only` and read-only
> `aws` calls. On an Ansible-only target it has nothing to inspect: say so and run without it. The
> Ansible equivalent of drift detection is a `--check --diff` run against the host, which is the
> human's to run (G3b), not this gate's.

- **Zero per-review setup — the skill resolves the profile itself.** It reads the AWS profile already
  configured in the project's **`.mcp.json`** (the advisory-MCP identity) and passes it as **`--profile
  <that>` on every live-read command** (see Phase 1.5). A CLI flag — not an `export` (shell state
  doesn't persist between calls) and not an inline `AWS_PROFILE=… aws …` (that would stop the command
  matching the read-only allowlist and re-trigger prompts). The operator does **not** export anything
  or edit `settings.json` before each run.
- **Coverage first — do not pre-narrow the command set.** Investigate the deployed stack as widely as
  the resources demand; run whatever `describe-*`/`list-*`/`get-*` reads across whatever services are
  in play give a complete posture. **The safety boundary is the IAM identity, not a hand-picked verb
  list**: that `.mcp.json` profile is **read-only by construction** — it's set up per
  `knowledge/aws-iam-mcp-setup.md`, whose boundary policy already **denies** the dangerous "reads"
  (`kms:Decrypt`, `secretsmanager:GetSecretValue`, `ssm:GetParameter*`, `dynamodb` data reads,
  `s3:GetObject`, `lambda:InvokeFunction`, all mutations). So you can go wide safely and never need to
  hand-trim verbs. **Never** use the full-access backend/apply profile (the `profile` in
  `backend-<env>.hcl`) for this pass.
- The pass **never mutates** and never runs `apply`/`destroy`. If `.mcp.json` has no AWS profile, or a
  read is denied / creds are missing, note it and continue — `--live` degrades to a code/plan review,
  never blocks. If the resolved profile turns out to be the same as the backend/apply profile (i.e. not
  a read-only identity), warn and recommend configuring the read-only MCP profile per
  `aws-iam-mcp-setup.md` before relying on `--live`.

**`--only <sources>` — run part of the review now, the rest later.** Comma-separated, from
`security,infra,ansible,cost`. Parse it into `args.only`. This is the flag that makes a 700k-token
stage fit in a session that does not have 700k tokens.

```
/infra-review <dir> --only ansible
/infra-review <dir> --only security,infra,cost        # the next session
```

> **`--only` and `--baseline` together need `priorFindings`, or the labels lie.** Synthesis marks a
> baseline finding RESOLVED when nothing in the CURRENT set matches it — and a reviewer that was
> deliberately skipped contributes nothing, so all of its still-open findings would be reported as
> fixed. The workflow detects this and **disables baseline labelling** with a log line rather than
> emitting a report that says a Critical went away. Feed `priorFindings` from the partial-state file
> and the labels are correct again.

**Resuming a review that ran out of budget — do this BEFORE anything else.**

A four-reviewer pass over a mixed repo costs roughly **700k output tokens**, which is more than one
session usually has. Measured on a real repo: `--deep` spent 681k and lost rounds 2-3, a retry spent
792k the same way, and a single-pass attempt spent 706k and lost **all four reviewers in round 1** —
0 findings for 706k tokens. So the review is built to run in pieces.

**Partial-state file:** `docs/reviews/.partial-<env>.json`, holding
`{ "allFindings": [...], "ranSources": [...], "target": "...", "startedAt": "..." }`.

1. **Before running**, look for it and decide what still needs to run:
   ```bash
   ENV="$(basename '<target-dir>')"; P="docs/reviews/.partial-${ENV}.json"
   [ -f "$P" ] && python3 -c "
   import json;d=json.load(open('$P'))
   print('resuming:',len(d.get('allFindings',[])),'finding(s) already collected from',
         ', '.join(d.get('ranSources',[])) or 'nothing')" || echo "no partial state — full run"
   ```
   Pass `args.priorFindings` = that file's `allFindings`, and `args.only` = the sources NOT yet in
   `ranSources` (`security`, `infra`, `ansible`, `cost` — restricted to the ones the preflight's
   stack actually has).

2. **After every run**, write the file from the workflow's `allFindings` + `ranSources` — including
   after a run that failed part way, because that is exactly when it matters.

3. **Delete it** once the report is written and every expected source is present. A stale partial
   file would silently suppress a reviewer on the next full review.

**Deliberately running one reviewer at a time** is the same mechanism, used on purpose:
```
args: { path, only: ["security"] }                      # session 1
args: { path, only: ["infra","ansible","cost"], priorFindings: [...] }   # session 2
```
A source listed in `only` is *deferred*, not missing — the incomplete-reviewer guard does not fire
for it, and its findings arrive via `priorFindings`.

> `agent()` returns `null` for a dead agent and for an unresolvable `agentType` alike, so the guard
> cannot tell a token limit from a missing definition. Read the run's `<failures>` block or
> `/workflows` before acting on its advice — reinstalling agents does nothing for a token limit. And
> `resumeFromRunId` replays only agents that COMPLETED: a round-1 failure caches nothing, so it
> re-runs everything at full price. The partial-state file above is what actually resumes work.

**Cadence (which mode when):**

| Situation | How to run |
| --- | --- |
| First review of an env, or a periodic deep audit | `--deep` (loop-until-dry); no baseline yet |
| Re-review after applying fixes / a confirmation pass | **single-pass + baseline** (auto-detected) — fast, shows what the fixes resolved + any regression |
| Suspect the last pass missed something | `--deep` again (baseline still applies if one exists) |

> **Make a finding stop recurring — the spec is the memory.** Baseline marks a *defect* STILL-OPEN
> every run until it's fixed. If it's a **conscious accepted risk** (not a defect to fix), record it in
> the project **spec's "Accepted risks" section** (`docs/specs/*.spec.md`): the finders read it and tag
> the finding `acceptedRisk: true`, so it drops out of the go/no-go counts (still listed for
> re-validation). Rule of thumb — **baseline = "what changed since last run"; spec Accepted-risks =
> "what we chose to live with."** Use both.

---

## Phase 0: Check the workflow script before spending tokens on it

`node --check` parses; it does **not** resolve identifiers. A workflow that references an undeclared
`const` passes `--check` cleanly and then dies at runtime — after the preflight agent has already
run and been paid for. That happened: an edit added uses of `ONLY`/`PRIOR` while the declaration was
lost to a failed patch, and the run died with `PRIOR is not defined` at line 311.

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/infra-review}")"
node --check "$HOME/.claude/workflows/infra-review.js" \
  && python3 "$SK/scripts/check-undeclared.py" "$HOME/.claude/workflows/infra-review.js"
```

Run it after ANY edit to the workflow. Both must pass — syntax and identifiers are different
questions, and only the second one catches this.

## Phase 1: Run the parallel review Workflow

The workflow is installed into your user dir at a **machine-independent** path —
**`~/.claude/workflows/infra-review.js`** — by the one-time setup (Guide §1.1, the same symlink step
as the skills). Run it from there; no guideline-repo path is hardcoded at runtime:

```bash
WF="$HOME/.claude/workflows/infra-review.js"
test -f "$WF" && echo "workflow: $WF" \
  || echo "MISSING — run one-time setup (Guide §1.1: symlink workflows into ~/.claude/workflows)"
```

Then call the `Workflow` tool with:
- `scriptPath`: the resolved `$WF` (you may also try `name: "infra-review"` if your Claude Code
  discovers user-level workflows; `scriptPath` always works)
- `args`: `{ "path": "<target-dir>", "deep": <true if --deep, else false>, "baseline": "<auto-detected prior report — see the Baseline section above; omit/empty on a first or --no-baseline run>", "note": "<--note text if the operator gave one, else omit>" }`

Its preflight counts `*.tf` and Ansible markers (`ansible.cfg`, `site.yml`, `roles/*/tasks/`,
`playbooks/`, `group_vars/`), then fans the matching reviewers out concurrently — `security-auditor`
always, plus `infra-reviewer` + `cost-optimizer` when Terraform is present and `ansible-reviewer`
when Ansible is — and synthesizes their findings into one structured report (severity counts, top
findings, estimated monthly savings, go/no-go, must-fix-before-apply). It aborts only when the
target holds neither stack. The user can watch live progress with `/workflows`.

**Fallbacks (in order) if `$WF` is missing or `scriptPath` doesn't run:**
1. Resolve from the symlinked skill instead (works even if the one-time workflow symlink was skipped):
   ```bash
   SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/infra-review}" 2>/dev/null)"
   WF="$(dirname "$(dirname "$SK")")/workflows/infra-review.js"
   ```
2. `Read` the file at `$WF` and pass its contents to the `Workflow` tool via the `script` parameter
   (inline), with the same `args`.
3. If the `Workflow` tool is entirely unavailable, run the stack's agents sequentially via the Agent
   tool (Terraform: security-auditor → infra-reviewer → cost-optimizer; Ansible: security-auditor →
   ansible-reviewer) and synthesize the report yourself. Say in the report that the workflow's
   incomplete-reviewer guard did **not** run, so a missing agent would not have been caught.

> Note: the agent types for the detected stack must exist in the current project's `.claude/agents/`
> or user-level in `~/.claude/agents/` (init-project copies them; Guide §1.1 symlinks them). If
> missing, use fallback 2 — the workflow refuses to emit "go" when a reviewer didn't run.

## Phase 1.5 (optional, `--live`): read-only live-stack inspection

Run **only if `--live` was given** and the env is applied. This is a **read-only** pass — it never
mutates and never runs `terraform apply`/`destroy`.

**First, resolve the read-only profile from `.mcp.json`** (do this once; reuse it on every read below):

```bash
# read the AWS profile the advisory MCP servers use (read-only by construction — see aws-iam-mcp-setup.md)
RO_PROFILE="$(python3 - <<'PY' 2>/dev/null
import json,glob
for f in ('.mcp.json',) + tuple(glob.glob('*/.mcp.json')):
    try:
        s=json.load(open(f)).get('mcpServers',{})
        for c in s.values():
            p=(c or {}).get('env',{}).get('AWS_PROFILE')
            if p: print(p); raise SystemExit
    except Exception: pass
PY
)"
echo "${RO_PROFILE:-<none — .mcp.json has no AWS profile; --live will use session default creds>}"
```

Then pass **`--profile "$RO_PROFILE"`** on **every** AWS read below (CLI flag → the command still starts
with `aws …` so it matches the read-only allowlist and won't prompt, and it overrides any exported
apply profile). **Never** use the backend/apply profile (`profile` in `backend-<env>.hcl`) — it's
full-access; the read-only MCP identity is what lets the reads go wide without risk (its IAM boundary
denies `kms:Decrypt`, `GetSecretValue`, `dynamodb` data reads, `s3:GetObject`, and all mutations).

1. **Drift** — from the env dir, `terraform plan -lock=false -refresh-only -no-color` (or a normal
   `plan`): a non-empty diff after a clean apply means the live stack drifted from code (out-of-band
   console/CLI change). Capture the drifted resources. (`terraform` uses the backend profile, not
   `$RO_PROFILE` — that's correct; only the raw `aws` reads below take `--profile`.)
2. **Live posture snapshot** — investigate **every** resource in `main.tf` (and its blast radius) with
   whatever read-only AWS calls give a complete picture; **do not restrict yourself to a fixed verb
   list** — go as wide as the stack needs. The IAM boundary (`$RO_PROFILE`) is what keeps this safe, so
   coverage can be exhaustive. Pass `--profile "$RO_PROFILE"` on each. Typical angles (extend freely per
   service in scope):
   - public exposure: `aws s3api get-public-access-block --profile "$RO_PROFILE"`, `get-bucket-policy`; `aws ec2 describe-security-groups --profile "$RO_PROFILE"` (0.0.0.0/0 ingress?); resource policies / auth on API Gateway, aoss data-access policies, etc.
   - encryption on: `aws s3api get-bucket-encryption`, `aws rds describe-db-instances`/`describe-db-clusters` (StorageEncrypted), `aws dynamodb describe-table` (SSEDescription), KMS key policies — each `--profile "$RO_PROFILE"`
   - identity as written: `aws iam get-role-policy` / `get-policy-version` / `list-attached-role-policies` for every role the stack created (also feeds post-apply Access Analyzer — Guide Step 3 §5)
   - resources **outside** Terraform: `list-*` each service the stack uses (`aws lambda list-functions`, `aws cognito-idp list-user-pools`, …) and diff against `terraform state list`.

   No need to hand-avoid "dangerous" reads — `$RO_PROFILE`'s IAM boundary already denies the
   value/data-returning ones (`get-secret-value`, `kms decrypt`, `dynamodb get-item`/`scan`,
   `s3:GetObject`, `admin-get-user`), so they'd `AccessDenied` rather than leak. Read as wide as you need.
3. **Fold into the review** — summarize drift + any live-only issue as findings (severity like any
   other) and add a **"Live stack check"** section to the report (Phase 2). A live-only issue with no
   code counterpart is tagged `[LIVE]`; if the env is clean and matches code, say so
   ("live matches code, no drift"). If creds are missing or a read is denied, note it and continue —
   `--live` degrades to a code/plan review, never blocks.

## Phase 2: Save + present the report (G4)

First **persist** the report (so Stage 5 `/infra-document` and any future session can read it),
then render it in chat. Compute the path and write the report markdown there:

```bash
ENV="$(basename '<target-dir>')"          # e.g. dev-singapore
mkdir -p docs/reviews
REPORT="docs/reviews/${ENV}-$(date +%F).md"   # e.g. docs/reviews/dev-singapore-2026-06-04.md
echo "$REPORT"
```

Write the full report (the block below, including the `Saved:` line) to `$REPORT` — overwrite on a
same-day re-run — then show the same content in chat. When the report carries `changeSinceBaseline`
(a baseline was used), render the **Change since last review** line + the **Resolved** list, and tag
each finding with its `status` (`[NEW]` / `[STILL-OPEN]`); omit all three when no baseline was used.

```
## Infrastructure Review Report (G4) — <target-dir>
_Saved: docs/reviews/<env>-<date>.md_

### Recommendation: GO | GO-WITH-FIXES | NO-GO
[summary, 2-4 lines]

### Severity:  Critical X · High Y · Medium Z · Low W
### Security coverage (Well-Architected Security Pillar): IAM a · Detective b · Infra-protection c · Data-protection d · Incident-response e
### Changes this round (only when `--note` was given): <what the operator changed — from changeNote>
### Change since last review (only when a baseline was used): N resolved · K new · M still-open — regression: yes/no
### Estimated savings: ~$N/month

### Must fix before apply (Critical/High):
1. [severity][source][wa-category][NEW|STILL-OPEN] title — location → remediation
...

### Live stack check (only when `--live` was given — from Phase 1.5):
- Drift: <none / list of drifted resources> · Outside Terraform: <none / list>
- [severity][LIVE] live-only finding — resource → remediation   (or: "live matches code, no drift")

### Resolved since last review (only with a baseline — from changeSinceBaseline.resolved):
- [severity] title — location  ✓ no longer found
...

### Top cost-saving recommendations:
1. action — ~$X/month (risk: Low/Med/High)
...
```

## Phase 3: STOP at Gate G4

End by asking the human to decide — do not act yet:

```
👉 What would you like to do:
   [a] I fix the Critical/High items (I'll list the changes & wait for your OK per group)
   [b] Fix only the items you pick (give the numbers)
   [c] No-go / stop
(I do NOT edit code or apply anything without your approval.)
```

Wait for the human's choice. When they pick fixes, make the edits in the working tree (the
PostToolUse hook formats `.tf`), then **re-run the affected GATE — not just `terraform validate`**:
if the fix touched a scanner suppression or a scanned resource, re-run `trivy config` / `checkov`; if
it touched IAM, re-run Access Analyzer. A finding's *premise can be wrong* (e.g. it claims "no
matching resource" for a rule that does fire, or recommends dropping a suppression that's actually
load-bearing) — **verify the claim against the real tool output before applying its remediation**, and
confirm the gate is green afterward. Present the diff — still without `terraform apply` or committing.

> **Hand-off:** once the review is accepted (and any fixes applied), continue **in the same
> session** with Stage 5: `/infra-document <target-dir>`. It will read the saved
> `docs/reviews/<env>-<date>.md` into the doc's security-posture section.

## Note: AI review is not exhaustive

A single pass is **best-effort, not deterministic or complete** — re-running can surface more real
findings (use `--deep` for higher recall). The *deterministic* baseline lives in the **tool gates**,
not here: `checkov` + `tflint` (Stage 3, IaC misconfig) and `betterleaks`/`gitleaks` (Stage 6,
secrets) catch their full ruleset every run. This stage adds **contextual judgment** (architecture
waste, cross-cutting security, cost) that tools miss — so treat G4 as "reviewed", not "provably
clean". State this honestly when presenting the report.
