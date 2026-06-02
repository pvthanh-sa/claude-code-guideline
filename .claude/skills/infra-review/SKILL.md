---
name: infra-review
description: 'Stage 4 of the DevOps pipeline. Run a parallel security + infra-best-practice + cost review of a Terraform environment via the infra-review Workflow, present one synthesized severity-ranked go/no-go report, and STOP at human gate G4. Never edits code or applies without explicit approval.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Workflow
argument-hint: '[target-dir]'
---

# Infra Review — Stage 4 (Review gate)

Run the final review across three independent perspectives **in parallel**, then hand the
human one consolidated report to decide go / fix / no-go.

> **Human gate G4:** This skill produces a report and **STOPS**. It does not fix code, does not
> `terraform apply`, does not commit. After presenting the report, ask the human which findings
> to address — and only then, in a follow-up, make changes they approve.

**Target dir:** first token of `$ARGUMENTS` (e.g. `environments/tokyo-dev`). Default: current dir.
Confirm the target before running.

---

## Phase 1: Run the parallel review Workflow

Invoke the saved workflow `infra-review` (`.claude/workflows/infra-review.js`), passing the target:

> Call the `Workflow` tool with `name: "infra-review"` and `args: { path: "<target-dir>" }`.

It fans out three reviewers concurrently — `security-auditor`, `infra-reviewer`,
`cost-optimizer` — and synthesizes their findings into one structured report
(severity counts, top findings, estimated monthly savings, go/no-go, must-fix-before-apply).
The user can watch live progress with `/workflows`.

If the `Workflow` tool is unavailable in this session, fall back to running the three agents
sequentially via the Agent tool (security-auditor → infra-reviewer → cost-optimizer) and
synthesize their outputs yourself — but prefer the Workflow.

## Phase 2: Present the report (G4)

Render the workflow's report for the human:

```
## Infrastructure Review Report (G4) — <target-dir>

### Recommendation: GO | GO-WITH-FIXES | NO-GO
[summary, 2-4 lines]

### Severity:  Critical X · High Y · Medium Z · Low W
### Estimated savings: ~$N/month

### Must fix before apply (Critical/High):
1. [severity][source] title — location → remediation
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
PostToolUse hook formats `.tf`), re-run the relevant validate step, and present the diff —
still without `terraform apply` or committing.
