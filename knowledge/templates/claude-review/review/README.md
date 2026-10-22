# Claude PR review

Every pull request into the reviewed branches gets an automatic review by Claude. It posts inline
comments on the exact lines and a summary (the sticky "Claude Code" comment): what the PR does, each
verified finding with severity, root cause, a fix, and reproduction steps a tester can follow.

The review is **advisory**. It never approves, blocks, edits, or pushes. Merge gates stay with the
deterministic checks (lint, type-check, tests, IaC and secret scanners).

## How it works

```
PR opened / new commits
  └─ .github/workflows/claude-code-review.yml
       1. checkout
       2. copy .github/claude-review/ from the BASE branch → $RUNNER_TEMP   (PR can't rewrite its own rules)
       3. claude-code-action (read-only tools)
            ├─ reads protocol.md + repo-context.md, picks profiles by changed files
            ├─ large / multi-stack PR → parallel subagents per domain (agents/domain-reviewer.md)
            ├─ every 🔴 checked by an independent verifier subagent (agents/verifier.md)
            └─ posts inline comments + updates the summary comment
```

`@claude` in a PR or issue comment (`.github/workflows/claude.yml`) runs Claude on demand; "@claude
review" uses the same protocol.

## Files

| File | Owner | Purpose |
|---|---|---|
| `protocol.md` | kit | How to review, verify, and report — the same in every repo |
| `profiles/*.md` | kit | Checklists per stack (only the ones this repo needs are installed) |
| `agents/*.md` | kit | Prompts for the domain-reviewer and verifier subagents |
| `repo-context.md` | **this repo** | Architecture, conventions, hot spots, routing table, *Do not flag* |
| `.kit-version` | kit | Kit version installed here |

**Kit** files are replaced when the kit is upgraded (run `/claude-review-setup` again in a Claude
Code session). **Edit `repo-context.md` freely** — it is never overwritten, and it is the right
place to fix reviewer behaviour for this repo.

Because step 2 reads the guide from the base branch, a change to these files takes effect for PRs
opened **after** it is merged.

## One-time setup

1. **Claude GitHub App** installed on this repository — https://github.com/apps/claude
2. **Secret** `CLAUDE_CODE_OAUTH_TOKEN` (repository or organisation secret) — generate with
   `claude setup-token`, or run `/install-github-app` in Claude Code, which does 1 and 2.
3. **Merge to the default branch.** The Claude GitHub App only runs a workflow whose file is
   identical on the repository's default branch — the PR that adds this kit is skipped, and in a repo
   whose default branch is not where PRs land (e.g. default `main`, PRs into `develop`), reviews
   start only once the workflow reaches the default branch.
4. **Label** `skip-claude-review` (optional) — add it to a PR to skip the automatic review:
   `gh label create skip-claude-review --color BFD4F2 --description "Skip the automatic Claude review"`

## Tuning

| Want | Do |
|---|---|
| Fewer false positives of one kind | Add a line under *Do not flag* in `repo-context.md` with the reason |
| Reviewer misses a repo-specific rule | Add it under *Conventions* or *Hot spots* in `repo-context.md` |
| Cheaper / faster reviews | Repository variable `CLAUDE_REVIEW_MODEL=sonnet` (default `opus`) |
| Longer reviews on big PRs | Repository variable `CLAUDE_REVIEW_MAX_TURNS` (default 80) |
| Review other target branches | `on.pull_request.branches` in the workflow |
| Skip one PR | Label `skip-claude-review`, or keep it a draft |

## Authentication options

The workflow uses `CLAUDE_CODE_OAUTH_TOKEN` (a Claude subscription). It is tied to the account that
created it: usage counts against that account, and reviews stop if it is revoked. For team-wide use
prefer one of:

- `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` — billed to an Anthropic Console org.
- Workload identity federation — `anthropic_federation_rule_id` + `anthropic_organization_id`: the
  action exchanges the job's GitHub OIDC token, so there is no static key at all.
- Amazon Bedrock — `use_bedrock: "true"` after `aws-actions/configure-aws-credentials` with an OIDC
  role that can only `bedrock:InvokeModel*`. Never give the review job deploy credentials: it reads
  untrusted PR content.

## Security model

- Runs on `pull_request`, never `pull_request_target`; fork PRs are skipped (no secrets there).
- Reviewer instructions come from the base branch; PR text is treated as data.
- Tools are read-only: file edits and `git add/commit/push` are explicitly denied.
- The job holds no cloud credentials.
- Actions are pinned to commit SHAs; re-run `/claude-review-setup` to move them to the newest release.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Job skipped | Draft, fork PR, bot author, `skip-claude-review` label, or only `paths-ignore` files changed |
| `::error::…protocol.md not found` | `.github/claude-review/` missing on the base branch and in the PR |
| Job **succeeds but posts nothing**; log says *"Workflow validation failed … identical content to the version on the repository's default branch"* | By design of the Claude GitHub App: it only runs a workflow whose file is identical on the **default branch**. The PR that adds or changes a Claude workflow is never reviewed — merge it into the default branch, then reviews start on the next PR |
| No comments, auth error in log | Secret missing/expired, or the Claude GitHub App is not installed |
| Stale "Claude is working…" comment | That run was cancelled by a newer push; the newer run posts its own |
| Review hits max turns on a huge PR | Raise `CLAUDE_REVIEW_MAX_TURNS`, or split the PR |
