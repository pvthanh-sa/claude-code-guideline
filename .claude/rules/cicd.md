---
globs:
  - '**/.github/workflows/*.yml'
  - '**/.github/workflows/*.yaml'
  - '**/.github/**/*.yml'
  - '**/.github/**/*.yaml'
---
# CI/CD Rules (GitHub Actions)

## Authentication
- Always use OIDC for AWS authentication — never long-lived access keys
- Use `aws-actions/configure-aws-credentials@v4` with `role-to-assume`
- Store `AWS_ACCOUNT_ID` in GitHub Environment Secrets (encrypted)
- Store `AWS_REGION` in GitHub Environment Variables (plain text)

## Trigger Strategy
- PR opened/synchronize/reopened → CI only (code quality checks)
- PR merged to target branch → CD to matching environment
- Tag push (`v*`) → production deployment only
- `workflow_dispatch` → manual deployment for non-production only
- Skip CI when PR closed without merge: `github.event.pull_request.merged == true`

## Environment Strategy
- Use GitHub Environments: `develop`, `demo`, `staging`, `production`
- PREFIX-based naming for resources: `dev-`, `demo-`, `stg-`, `prod-`
- Each environment can have different AWS accounts/regions
- Add protection rules (approvals) for staging and production

## Job Structure
- Separate CI and CD into distinct jobs with proper `if` conditions
- CI → Setup (determine environment) → Build → Deploy
- Use `needs:` to chain job dependencies
- Use `outputs:` to pass variables between jobs

## Concurrency
- CI jobs: `cancel-in-progress: true` (safe to cancel when new code pushed)
- Deploy jobs: `cancel-in-progress: false` (prevent incomplete deployments)
- Group by: `ci-${{ github.ref }}` for CI, `deploy-${{ environment }}` for CD

## Security
- Pin action versions. A version tag (`actions/checkout@v4`) is the **minimum** (dev/lab repos); for
  **production-facing repos, pin third-party actions to a full commit SHA** (with a `# v4` trailing
  comment) and enable Dependabot for `github-actions` — a tag is mutable, so SHA-pinning is the real
  supply-chain control (aligns with `security.md`). Reviewers: treat tag-pinning in a disposable lab
  as an accepted choice, not a finding.
- Never expose secrets in logs or echo statements
- Use `secrets.AWS_ACCOUNT_ID` — never hardcode account IDs
- Set `permissions: id-token: write, contents: read` for OIDC

## Docker
- Use Docker layer caching between CI and CD jobs:
  ```yaml
  - uses: actions/cache@v4
    with:
      path: /tmp/.buildx-cache
      key: ${{ runner.os }}-docker-${{ hashFiles('**/lockfile') }}
  ```
- Tag images with short SHA: `$(echo ${{ github.sha }} | cut -c1-7)`
- Always push both SHA tag and `latest` tag

## Deployment Patterns
- **Backend (ECS):** Build Docker → Push ECR → Register task def → CodeDeploy blue-green
- **Frontend (Static):** Build → S3 sync `--delete` → CloudFront invalidation with wait
- Include GitHub Step Summary for deployment logging
- Include rollback information in summary

## Best Practices
- Cache dependencies (pip, npm, Docker layers) for faster builds
- Use `set -e` in shell scripts for fail-fast behavior
- Validate environment variables are non-empty before using them
- Add `timeout-minutes` to long-running steps (e.g., deployment wait)
