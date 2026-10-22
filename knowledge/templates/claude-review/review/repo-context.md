# Repository context for the Claude PR reviewer

> **Repo-owned file.** Written once by `/claude-review-setup` from a reading of this repository,
> then maintained by the team. The kit never overwrites it on upgrade. Keep it factual and short:
> every line here is read on every review. When the reviewer gets something wrong for this repo,
> fix it here (usually under *Do not flag* or *Conventions*).

<!-- installer: replace every {{…}} block. Every statement must come from something you read in
     this repository — cite the path. Never invent a convention; if unsure, leave the bullet out.
     Never tell the reviewer to read another working-tree file for its rules (docs, copilot
     instructions, skills): the PR controls those. Summarise what matters here instead.
     Delete all installer comments when done. -->

## Review settings

- **Review language:** {{English | Vietnamese | …}}
- **Base branches reviewed:** {{develop, staging}}
- **Production branch / release flow:** {{e.g. "merge to staging auto-deploys stg; prod is a manual workflow_dispatch (cicd.yaml)" — or for IaC: "no CD; a human runs terraform plan/apply per env"}}
- **Inline comments:** {{on | off — off when the team wants a single summary comment only}}
- **Additional instructions:** {{none — or demands carried over from the team's previous review prompt}}

## What this repository is

{{2–4 sentences: what the system does, who uses it, what it talks to (DB, queues, external APIs),
how it is deployed. Cite the files you learned it from.}}

## Routing — which profile applies to which files

`profiles/security.md` always applies. Load only the rows whose globs match changed files.

| Files | Profile |
|---|---|
| {{`src/**/*.ts` (NestJS API)}} | `profiles/backend-node.md` |
| {{`src/database/migrations/**`, `src/**/*.entity.ts`}} | `profiles/database.md` |
| {{`docker/**`, `Dockerfile`, `docker-compose*.yml`}} | `profiles/docker.md` |
| {{`.github/workflows/**`}} | `profiles/ci-github-actions.md` |

Files that match no row still get `profiles/security.md` and protocol §3 (e.g. plain jQuery,
shell scripts) — list them here with "security only" when that is a deliberate choice.

**Skip entirely (generated / vendored / lock):** {{`dist/**`, `pnpm-lock.yaml` (only check it
matches package.json), `**/*.snap`, `temp/**`, `logs/**`}}

## Architecture map

{{Where things live — 5–12 bullets, each `path` → responsibility. Example:
- `src/modules/<feature>/` — one NestJS module per feature (controller → service → repository)
- `src/common/guards/` — auth guards; every controller is expected to use `JwtAuthGuard`
- `src/database/` — TypeORM data source + migrations}}

## Conventions the reviewer must hold the code to

{{Only conventions visible in the code or written in CLAUDE.md/README/CONTRIBUTING. Example:
- Multi-step writes go through `DataSource.transaction()` (see src/…/inventory.service.ts)
- Money and quantities are `numeric` in DB and `Decimal` in code
- Errors are thrown as NestJS `HttpException` subclasses; no raw `Error` from controllers}}

## Hot spots — look harder here

<!-- installer: name the AREA and the bug class ("article search builds SQL with DB::expr"), not a
     write-up of a live vulnerability — those go in your report. Never include secret values. -->

{{Areas where a bug is expensive, from the domain and the code. Example for a warehouse system:
- Stock quantity changes (receive, pick, adjust, transfer): concurrency + transaction + negative stock
- Integrations that are retried (webhooks, queue consumers): idempotency
- Auth / tenant (warehouse, company) scoping on every query}}

## Deterministic checks already in CI (don't duplicate their findings)

{{From .github/workflows/*: e.g. `cicd.yaml` runs eslint + `tsc --noEmit` + jest; `iac-scan.yml`
runs tflint/checkov/trivy. Write "none" if there are none.}}

## Do not flag

{{Things that look wrong to a generic reviewer but are intentional here, with the reason. Start
small; the team adds to this when the reviewer produces noise. Example:
- `console.log` in `scripts/**` — one-off CLI scripts, not the server
- Missing auth guard on `HealthController` — public by design for the ALB}}
