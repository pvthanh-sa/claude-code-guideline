# Profile: CI/CD — GitHub Actions

> Kit-owned. Globs: `.github/workflows/**`, `.github/actions/**`, `action.yml`.
> actionlint may run in CI — don't re-list syntax errors.

## Security (most findings here are 🔴)
- **Script injection:** `${{ github.event.* }}` (PR title/body, branch name, issue/comment body,
  head_ref, commit message) interpolated directly into `run:` or into `actions/github-script`
  `script:`. Pass it through `env:` and quote the variable.
- **`pull_request_target` / `workflow_run` + checkout of the PR head** (`ref: …head.sha`) followed by
  running anything from it (install, build, tests, scripts) → untrusted code with secrets and a
  write token.
- AWS auth with long-lived access keys instead of OIDC (`aws-actions/configure-aws-credentials`
  with `role-to-assume`); an OIDC role whose trust policy is not scoped to this repo +
  branch/environment.
- `permissions:` missing (defaults may be write-all) or broader than the job needs; `id-token:
  write` on jobs that don't assume a role.
- Third-party actions not pinned to a full commit SHA in a production repo (a tag is mutable);
  new actions from unknown publishers.
- Secrets echoed, written to files that get uploaded as artifacts, or passed on the command line of
  tools that log their args; `set -x` around secret use.
- Self-hosted runners used by workflows that run PR code.

## Deployment safety
- Deploy jobs without a GitHub `environment:` (no protection rules / approvals for prod).
- `concurrency` missing on deploy jobs, or `cancel-in-progress: true` on a deploy (an interrupted
  deploy leaves partial state). CI jobs should cancel; deploys should not.
- Trigger mistakes: deploy on `pull_request` instead of on merge/push; `if:` that runs a prod deploy
  for every branch; `workflow_dispatch` allowing prod when the policy says tags only.
- Missing `timeout-minutes` on steps that wait (deployment waits, ECS service stable).
- Wrong environment wiring: prod job reading staging vars/secrets or vice versa; account IDs or
  regions hard-coded instead of environment secrets/variables.
- Image tags: deploying `latest` instead of the immutable SHA tag that was just built and scanned.

## Correctness
- `needs:` / `outputs:` names that do not match (empty value at runtime, no error).
- Shell steps without `set -euo pipefail` (or `shell: bash` default `-e` only) where a failing
  command in a pipe is ignored.
- Path filters (`paths:`) that exclude the files the workflow actually depends on.
- Caches keyed on files that don't exist (`hashFiles` returns empty → one shared cache forever).
