---
name: infra-review
description: 'Stage 4 of the DevOps pipeline. Run a parallel security + infra-best-practice + cost review of a Terraform environment via the infra-review Workflow, save the report to docs/reviews/<env>-<date>.md, present one synthesized severity-ranked go/no-go report — baseline-aware on re-reviews, labeling each finding RESOLVED/NEW/STILL-OPEN vs the prior report — and STOP at human gate G4. Never edits code or applies without explicit approval.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Workflow
argument-hint: '[target-dir] [--deep] [--baseline <prior-report> | --no-baseline] [--note "<what changed>"]'
---

# Infra Review — Stage 4 (Review gate)

Run the final review across three independent perspectives **in parallel**, then hand the
human one consolidated report to decide go / fix / no-go.

> **Human gate G4:** This skill produces a report and **STOPS**. It does not fix code, does not
> `terraform apply`, does not commit. After presenting the report, ask the human which findings
> to address — and only then, in a follow-up, make changes they approve.

**Target dir:** first non-flag token of `$ARGUMENTS` (e.g. `environments/tokyo-dev`). Default: current dir.
Confirm the target before running.

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

It fans out three reviewers concurrently — `security-auditor`, `infra-reviewer`,
`cost-optimizer` — and synthesizes their findings into one structured report
(severity counts, top findings, estimated monthly savings, go/no-go, must-fix-before-apply).
The user can watch live progress with `/workflows`.

**Fallbacks (in order) if `$WF` is missing or `scriptPath` doesn't run:**
1. Resolve from the symlinked skill instead (works even if the one-time workflow symlink was skipped):
   ```bash
   SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/infra-review}" 2>/dev/null)"
   WF="$(dirname "$(dirname "$SK")")/workflows/infra-review.js"
   ```
2. `Read` the file at `$WF` and pass its contents to the `Workflow` tool via the `script` parameter
   (inline), with the same `args`.
3. If the `Workflow` tool is entirely unavailable, run the three agents sequentially via the Agent
   tool (security-auditor → infra-reviewer → cost-optimizer) and synthesize the report yourself.

> Note: the three agent types must exist in the current project's `.claude/agents/`
> (init-project copies them for AWS/security projects). If missing, use fallback 2.

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
