---
name: init-project
description: 'Initialize or refresh Claude Code Core for the current project. Init mode analyzes project structure and README (for CI/CD tech), generates CLAUDE.md, selectively copies relevant skills/agents/rules, and creates a project-specific .mcp.json. Sync mode (--sync) refreshes already-installed skills/agents/rules from the guideline repo in place.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write
argument-hint: '[output-path] | --sync'
---

# Init Project — Full Claude Code Core Setup

Initialize Claude Code Core for the current project in 4 phases:

1. Analyze project structure and detect tech stack (including CI/CD from README)
2. Generate a tailored CLAUDE.md
3. Copy **only the relevant** skills, agents, rules, and settings based on what was detected
4. Generate `.mcp.json` with **only the relevant** MCP servers

---

## Mode Selection

Inspect `$ARGUMENTS` first and pick exactly one mode:

- **Sync mode** — if `$ARGUMENTS` contains the token `--sync`: jump straight to the
  [Sync Mode](#sync-mode--refresh-installed-core-files-in-place) section at the bottom and
  ignore Phases 1–6. Sync **refreshes in place** the skills/agents/rules that are already
  installed under `.claude/`, pulling the latest copy from the guideline repo. It never
  touches `CLAUDE.md`, `.mcp.json`, or `settings.json`, and never adds new files.
- **Init mode** (default — anything that is not `--sync`) — run the full 6-phase bootstrap below.

**Output path for CLAUDE.md (init mode only):** the first non-flag token in `$ARGUMENTS` if
provided (e.g. `docs/CLAUDE.md`), otherwise auto-detect:

- Use `.claude/CLAUDE.md` if `.claude/` directory exists
- Use `CLAUDE.md` at project root otherwise

---

## Phase 1: Explore Project Structure

```bash
find . -maxdepth 3 -type f \
  ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.terraform/*' \
  ! -path '*/venv/*' ! -path '*/__pycache__/*' ! -path '*/dist/*' \
  ! -path '*/dist-packages/*' ! -path '*/.next/*' \
  | sort
```

Read the following files to build a complete picture of the project:

- `docs/specs/*.spec.md` — **if present**, an approved spec from `/spec-architect` (Stage 1). This
  is the strongest signal: read it first to drive stack detection, CLAUDE.md, and `.mcp.json`,
  even when the project is otherwise empty (greenfield-from-spec).
- `README.md` — project overview, CI/CD platform, deployment description
- `package.json` / `Pipfile` / `go.mod` / `Cargo.toml` — language/framework/dependencies
- `.env.example` — required environment variables
- `docker-compose.yml` or `docker-compose.yaml` — local dev services

**CI/CD Detection:** Read `README.md` only — do NOT look for `.github/workflows/`. CI/CD files may not exist yet; the README describes the intended CI/CD platform (GitHub Actions, GitLab CI, Jenkins, CircleCI, ArgoCD, etc.).

After reading, build a detection matrix. For each item below, note **yes / no / maybe**:

| Category             | Detected? | Evidence                                  |
| -------------------- | --------- | ----------------------------------------- |
| Terraform            |           | .tf files found?                          |
| Docker               |           | Dockerfile / docker-compose?              |
| Kubernetes / Helm    |           | k8s/ charts/ manifests?                   |
| ECS (AWS)            |           | ecs in terraform or README?               |
| EKS (AWS)            |           | eks in terraform or README?               |
| PostgreSQL / Aurora  |           | db deps, .env vars, terraform?            |
| MySQL                |           |                                           |
| Redis / ElastiCache  |           |                                           |
| Lambda / Serverless  |           |                                           |
| SQS / SNS            |           |                                           |
| Kafka / MSK          |           |                                           |
| Grafana / Prometheus |           |                                           |
| CI/CD platform       |           | GitHub Actions / GitLab / Jenkins / other |
| CLI tool project     |           | entrypoint is a CLI?                      |
| SRE / SLO patterns   |           | SLO, error budget mentioned?              |

---

## Phase 2: Analyze Infrastructure

**Terraform (if detected):**

- Glob `**/*.tf` and `**/*.tfvars`
- Identify: AWS resources used, environments (dirs under `environments/`, `envs/`), modules, backend

**Docker (if detected):**

- Read `Dockerfile*` and `docker-compose*.yml`
- Identify: base images, services, ports, multi-stage structure

**Kubernetes (if detected):**

- Glob `**/*.yaml` in `k8s/`, `kubernetes/`, `helm/`, `charts/`
- Identify: namespaces, resource types, ingress

---

## Phase 3: Generate CLAUDE.md

Write a concise CLAUDE.md (~100-150 lines). **Only include sections that actually apply — omit any section that would be N/A or placeholder-only.**

````markdown
# [Project Name] — Claude Code Guidelines

## Stack

- **Language/Framework:** [detected]
- **Infrastructure:** [Terraform + AWS resources / K8s / etc.]
- **Database:** [PostgreSQL/MySQL/Redis/etc.]
- **CI/CD:** [GitHub Actions / GitLab CI / Jenkins / etc. — from README]

## Essential Commands

```bash
# Local dev
[actual dev command from README or docker-compose]

# Test
[actual test command]

# Build
[actual build command]

# Deploy (if manual step exists)
[actual deploy command]
```
````

## Architecture

[2-5 bullet points — key decisions not obvious from code]

## Environments

| Env | Branch | Deploy Trigger |
| --- | ------ | -------------- |

[fill from README or CI/CD description — omit if unknown]

## Gotchas

[Non-obvious behaviors, known pitfalls — omit if none found]

## Skills Available

[List only the skills that were copied in Phase 4]

````

**Rules:**
- Under 150 lines total
- Do NOT repeat what can be inferred from reading the code
- Write specific, verifiable instructions — not generic advice

---

## Phase 4: Copy Relevant Claude Core Files

Based on the detection matrix from Phase 1, selectively copy **only what's needed**.

```bash
# Resolve the guideline repo via the symlinked skill. readlink -f follows the symlink to the real
# path; the fallback covers $CLAUDE_SKILL_DIR being the symlink path itself or empty in some shells.
# NOTE: $GUIDELINE_CLAUDE is the .claude dir (dirname x2). Phase 5's MCP catalog lives at the repo
# ROOT (parent of this) and is resolved separately by walk-up — do not conflate the two levels.
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/init-project}" 2>/dev/null)"
GUIDELINE_CLAUDE="$(dirname "$(dirname "$SK")")"
# GUARD: if resolution failed (skill copied not symlinked, or repo missing), every cp below would
# silently read from the project's own cwd. Stop loudly instead — same guard as Sync mode.
test -d "$GUIDELINE_CLAUDE/skills" || {
  echo "ERROR: guideline source not found at '$GUIDELINE_CLAUDE' (resolved from '$SK')."
  echo "  /init-project must be SYMLINKED from the guideline repo, not copied:"
  echo "    ln -sfn <path>/claude-code-guideline/.claude/skills/init-project ~/.claude/skills/init-project"
  exit 1
}
mkdir -p .claude/skills .claude/agents .claude/rules

# Copy helper: warns + records (never silently skips) when a source is missing upstream, so a
# renamed/removed guideline file surfaces in the summary instead of a lost stderr line.
MISSING=""
cpx() {  # cpx <src> <dest>
  if [ -e "$1" ]; then cp -r "$1" "$2"; else MISSING="$MISSING\n  - ${1#$GUIDELINE_CLAUDE/}"; echo "WARN: source missing, skipped: $1"; fi
}
````

### Skills — copy based on detection

```bash
# Always copy (foundation)
# NOTE: do NOT copy `init-project` itself — it is installed once per machine as a
# user-level symlink (~/.claude/skills/init-project) and is available to every project.
# Copying it here would be redundant AND would break `--sync`, because a project-local
# copy makes $CLAUDE_SKILL_DIR resolve into the project instead of the guideline repo.
cpx "$GUIDELINE_CLAUDE/skills/devops-engineer" ".claude/skills/"
cpx "$GUIDELINE_CLAUDE/skills/secure-code-guardian" ".claude/skills/"

# If Terraform detected
cpx "$GUIDELINE_CLAUDE/skills/terraform-engineer" ".claude/skills/"
cpx "$GUIDELINE_CLAUDE/skills/cloud-architect"    ".claude/skills/"

# If Kubernetes / Helm detected
cpx "$GUIDELINE_CLAUDE/skills/kubernetes-specialist" ".claude/skills/"

# If PostgreSQL / Aurora detected
cpx "$GUIDELINE_CLAUDE/skills/postgres-pro"       ".claude/skills/"
cpx "$GUIDELINE_CLAUDE/skills/database-optimizer" ".claude/skills/"

# If Grafana / Prometheus / CloudWatch monitoring detected
cpx "$GUIDELINE_CLAUDE/skills/monitoring-expert" ".claude/skills/"

# If SRE / SLO patterns mentioned in README
cpx "$GUIDELINE_CLAUDE/skills/sre-engineer" ".claude/skills/"

# If security-sensitive project (IAM complexity, PII, compliance)
cpx "$GUIDELINE_CLAUDE/skills/security-reviewer" ".claude/skills/"

# If CLI tool project
cpx "$GUIDELINE_CLAUDE/skills/cli-developer" ".claude/skills/"

# If chaos / resilience testing mentioned
cpx "$GUIDELINE_CLAUDE/skills/chaos-engineer" ".claude/skills/"
```

### Agents — copy based on detection

```bash
# If Terraform or any IaC detected
cpx "$GUIDELINE_CLAUDE/agents/infra-reviewer.md" ".claude/agents/"

# If AWS project (ECS, EKS, RDS, Lambda, etc.)
cpx "$GUIDELINE_CLAUDE/agents/cost-optimizer.md"    ".claude/agents/"
cpx "$GUIDELINE_CLAUDE/agents/incident-responder.md" ".claude/agents/"

# If security-sensitive (finance, healthcare, PII, compliance requirements)
cpx "$GUIDELINE_CLAUDE/agents/security-auditor.md" ".claude/agents/"
```

### Rules — copy based on detection

```bash
# Always copy
cpx "$GUIDELINE_CLAUDE/rules/security.md" ".claude/rules/"

# If Terraform detected
cpx "$GUIDELINE_CLAUDE/rules/terraform.md" ".claude/rules/"

# If Kubernetes / Helm detected
cpx "$GUIDELINE_CLAUDE/rules/kubernetes.md" ".claude/rules/"

# If Docker / docker-compose detected
cpx "$GUIDELINE_CLAUDE/rules/docker.md" ".claude/rules/"

# If CI/CD platform mentioned in README
cpx "$GUIDELINE_CLAUDE/rules/cicd.md" ".claude/rules/"
```

### Settings — copy if not exists

```bash
[ -f ".claude/settings.json" ] || cpx "$GUIDELINE_CLAUDE/settings.json" ".claude/settings.json"

# Surface anything that was missing upstream (renamed/removed in the guideline repo). cpx already
# printed a WARN per file; this is the aggregate the Phase 6 summary must report.
[ -n "$MISSING" ] && printf "WARN: guideline sources missing (project is incomplete):%b\n" "$MISSING" || echo "OK: all selected core files copied"
```

> If any `WARN: source missing` appears above, **report it in the Phase 6 summary** and treat the
> project core as incomplete — the named skill/agent/rule won't be available until the guideline
> repo is fixed and `/init-project --sync` (or re-init) is re-run.

---

## Phase 5: Generate .mcp.json

Create `.mcp.json` with **only** the MCP servers that match what was detected in Phase 1–2.
**Skip entirely if `.mcp.json` already exists.**

> ⚠️ **Source of truth — never hand-write or cache MCP server JSON in this skill.** Server
> definitions drift (package names, `@latest` pinning, transport). This skill carries **no copy**
> of the entries. Both of these live in the guideline repo and are authoritative:
>
> - **`.mcp.guideline-only.json`** (repo root) — the canonical catalog: copy each selected
>   server's JSON entry **verbatim** from here.
> - **`knowledge/mcp-devops-setup.md`** — what each server does, prerequisites (`uv`/`uvx`,
>   AWS creds, OAuth), the read-only security posture, and which servers to pick.

Use the detection matrix below to choose **which** server keys to include — no server is added by
default, every server requires a detected reason. The matrix lists the common DevOps subset; if a
detected technology isn't here, look it up by name in the catalog / setup doc and add it the same way.

| Condition                                          | Add MCP servers (keys in the catalog)           |
| -------------------------------------------------- | ----------------------------------------------- |
| Any AWS service detected (ECS/EKS/RDS/Lambda/etc.) | `aws-api`, `aws-knowledge`, `cloudwatch`, `iam` |
| New project / architecture design phase            | `well-architected`, `aws-pricing`               |
| Terraform detected                                 | `terraform`, `iac`                              |
| ECS detected                                       | `ecs`                                           |
| EKS / Kubernetes detected                          | `eks`                                           |
| PostgreSQL / Aurora detected                       | `aurora-postgresql`                             |
| MySQL detected                                     | `aurora-mysql`                                  |
| Redis / ElastiCache detected                       | `elasticache`, `elasticache-valkey`             |
| Lambda / Serverless detected                       | `serverless`, `lambda-tool`                     |
| SQS / SNS detected                                 | `sns-sqs`                                       |
| Kafka / MSK detected                               | `msk`                                           |
| GitHub Actions in README                           | `github`                                        |
| GitLab CI in README                                | `gitlab`                                        |
| Jenkins in README                                  | `jenkins`                                       |
| Grafana / Prometheus detected                      | `grafana`                                       |

**Build `.mcp.json` by copying entries from the canonical catalog** (resolve the guideline repo
the same way Phase 3 does), keeping the `<your-...>` placeholders for the human to fill at G2:

```bash
# Resolve the guideline repo root (same readlink trick as Phase 3; repo root = parent of .claude/).
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/init-project}" 2>/dev/null)"

# Locate the catalog by WALKING UP from the skill's real dir until .mcp.guideline-only.json appears.
# This finds it wherever the repo is cloned on this machine, and survives layout/depth changes —
# unlike a fixed "dirname x3". It works as long as the skill is reached via its symlink INTO the
# repo (the normal install). If the skill was COPIED into a project, the walk-up won't reach the
# repo — the known-location fallback + loud error below handle that.
CATALOG=""; d="$SK"
while [ -n "$d" ] && [ "$d" != "/" ]; do
  [ -f "$d/.mcp.guideline-only.json" ] && { CATALOG="$d/.mcp.guideline-only.json"; break; }
  d="$(dirname "$d")"
done
if [ -z "$CATALOG" ]; then
  for c in "$HOME/Documents/Devops/claude-code-guideline" "$HOME/claude-code-guideline" "$HOME/.claude/claude-code-guideline"; do
    [ -f "$c/.mcp.guideline-only.json" ] && { CATALOG="$c/.mcp.guideline-only.json"; break; }
  done
fi
if [ -z "$CATALOG" ]; then
  echo "ERROR: MCP catalog (.mcp.guideline-only.json) not found from skill path '$SK'."
  echo "  Cause: the init-project skill must be SYMLINKED from the guideline repo, not copied:"
  echo "    ln -sfn <path-to>/claude-code-guideline/.claude/skills/init-project ~/.claude/skills/init-project"
  echo "  Or clone the guideline repo to ~/Documents/Devops/claude-code-guideline. See knowledge/setup-new-project.md."
  exit 1
fi
SETUP_DOC="$(dirname "$CATALOG")/knowledge/mcp-devops-setup.md"  # human reference; warn (don't fail) if absent
[ -f "$SETUP_DOC" ] || echo "WARN: $SETUP_DOC missing — server descriptions/prereqs unavailable; catalog JSON still authoritative."
echo "Using MCP catalog: $CATALOG"

# Build the final config from the SELECTED keys (edit this list to match the detection matrix).
# Use Python + the catalog so the entries are always the current upstream definitions — never a
# stale copy. Catalog keys starting with "_comment_" are section separators; ignore them.
SELECTED='aws-api aws-knowledge cloudwatch iam well-architected aws-pricing terraform iac'
python3 - "$CATALOG" $SELECTED <<'PY' > .mcp.json
import json, sys
catalog = json.load(open(sys.argv[1]))["mcpServers"]
keys = sys.argv[2:]
missing = [k for k in keys if k not in catalog]
if missing:
    sys.exit(f"ERROR: keys not in catalog: {missing} — check names against {sys.argv[1]}")
json.dump({"mcpServers": {k: catalog[k] for k in keys}}, sys.stdout, indent=2)
print()
PY
echo "Wrote .mcp.json with: $SELECTED"
```

> The catalog holds the full set (AWS mandatory + infra/compute + database + messaging + AI/ML +
> data + devtools + CI/CD + monitoring + config). `mcp-devops-setup.md` is the human reference for
> what each does and how to authenticate. If a server you need isn't in the catalog yet, add it to
> `.mcp.guideline-only.json` first (source of truth), then re-run — don't inline it here.

**Ignore the Claude Code footprint in `.gitignore`** (the project repo may be **public** — don't
expose internal tooling; `.mcp.json` also holds local profile/secrets). The `.claude/` tooling is
**local, regenerated per machine** via `/init-project` (and refreshed by `--sync`), so it doesn't
need to be committed:

Also seed the **secret-material + Terraform-local baseline** — cert/key files and local state must
never be committable, in any project (a later stage may write them to disk, e.g. a cert-minting
script; the gate must exist *before* that happens):

```bash
{
  grep -qxF ".mcp.json" .gitignore 2>/dev/null || echo ".mcp.json"
  grep -qxF ".claude/"  .gitignore 2>/dev/null || echo ".claude/"
  for p in "certs/" "*.pem" "*.key" ".terraform/" "*.tfstate" "*.tfstate.*"; do
    grep -qxF "$p" .gitignore 2>/dev/null || echo "$p"
  done
} >> .gitignore 2>/dev/null
```

(`terraform.tfvars` is intentionally NOT ignored — project convention commits it and keeps it
secret-free; secrets go to Secrets Manager/SSM, account-specific values like ARNs to a gitignored
override file.)

`CLAUDE.md` stays **tracked** — it's lightweight project guidance (stack/commands), useful to share
and not sensitive. (Private team repo and you *want* to commit the skills/agents/rules? Remove
`.claude/` from `.gitignore`.)

---

## Phase 6: Summary

Before printing the summary, run a **best-effort AWS credentials preflight** (so the human learns
*now* — not at Stage 3 — whether `terraform plan` will work at G3):

```bash
aws sts get-caller-identity --query Account --output text 2>&1 | head -1
```

Report the result in the summary; never print the full account ID (mask all but the last 4 digits).

After completing all phases, print a summary:

```
## Claude Code Core Setup Complete

### Detection Results:
[List what was detected — tech stack, CI/CD platform, AWS services]

### Files created:
- [CLAUDE.md path]  (tracked — shareable project guidance)
- .claude/  (gitignored — local tooling, regenerated via /init-project):
  - settings.json · skills/ [N: list] · agents/ [N: list] · rules/ [N: list]
- .mcp.json (gitignored) — [N MCP servers configured]

### AWS credentials preflight:
[✅ valid — account ····XXXX, terraform plan will work at Stage 3 (G3)
 | ⚠️ invalid/absent — Stage 3 stops after the local validate chain; fix credentials
   (aws configure / SSO login) before expecting a plan at G3]

### Next steps:
1. Fill in placeholders in .mcp.json:
   - <your-aws-profile>  →  e.g., my-project-dev
   - <your-aws-region>   →  e.g., ap-southeast-1
   [list other placeholders relevant to what was included]

2. Review CLAUDE.md — add gotchas, verify commands are correct
   (`.mcp.json` is gitignored — never commit it; it holds local profile/secrets)

3. Next in the DevOps pipeline (Stage 3 — IaC): load the module library and implement:
   /add-dir $TF_MODULE_LIB   # the custom module library (set TF_MODULE_LIB — Guide §1.3)
   /iac-implement docs/specs/<name>.spec.md <env-dir>
   (see knowledge/devops-workflow.md for the full Spec → Init → IaC → Review flow)
```

> This is **Gate G2** of the pipeline — stop here for the human to fill `.mcp.json` placeholders
> and review `CLAUDE.md` before moving to Stage 3. Do not auto-run `/iac-implement`.

---

## Sync Mode — Refresh Installed Core Files In Place

Triggered by `/init-project --sync`. Use this to pull the **latest** version of the
skills/agents/rules already installed in this project, after the guideline repo has been
updated (`git pull` in `claude-code-guideline`). This is the safe, reviewable alternative to
symlinking project `.claude/` content — the project keeps committable, portable file copies,
but you can refresh them on demand.

**Scope — what sync does and does NOT touch:**

- ✅ Refreshes only files that **already exist** under `.claude/skills/`, `.claude/agents/`,
  `.claude/rules/` — overwriting them with the guideline version.
- ❌ Never adds a skill/agent/rule that isn't already installed (to add new ones, re-run init
  mode so the tech stack is re-detected).
- ❌ Never touches `CLAUDE.md` (you may have customized it).
- ❌ Never touches `.mcp.json` (gitignored, holds local secrets/placeholders).
- ❌ Never touches `.claude/settings.json` (may hold project-local settings).

### Step 1: Resolve the guideline source

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/init-project}" 2>/dev/null)"
GUIDELINE_CLAUDE="$(dirname "$(dirname "$SK")")"
echo "Source: $GUIDELINE_CLAUDE"
test -d "$GUIDELINE_CLAUDE/skills" || { echo "ERROR: guideline source not found — is the skill symlinked?"; exit 1; }
```

### Step 2: Refresh in place (existing files only)

```bash
# Skills — refresh each skill dir that already exists in the project
for d in .claude/skills/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  if [ -d "$GUIDELINE_CLAUDE/skills/$name" ]; then
    cp -r "$GUIDELINE_CLAUDE/skills/$name/." "$d"
    echo "refreshed skill: $name"
  else
    echo "skipped (not in guideline): skills/$name"
  fi
done

# Agents — refresh each .md that already exists
for f in .claude/agents/*.md; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  if [ -f "$GUIDELINE_CLAUDE/agents/$name" ]; then
    cp "$GUIDELINE_CLAUDE/agents/$name" "$f"
    echo "refreshed agent: $name"
  else
    echo "skipped (not in guideline): agents/$name"
  fi
done

# Rules — refresh each .md that already exists
for f in .claude/rules/*.md; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  if [ -f "$GUIDELINE_CLAUDE/rules/$name" ]; then
    cp "$GUIDELINE_CLAUDE/rules/$name" "$f"
    echo "refreshed rule: $name"
  else
    echo "skipped (not in guideline): rules/$name"
  fi
done
```

### Step 3: Show the diff for review

```bash
git diff --stat -- .claude/ 2>/dev/null || echo "(not a git repo — review changes manually)"
```

### Step 4: Summary

Print a recap and the review/commit hint — **do not commit automatically**:

```
## Sync Complete

### Refreshed:
- skills/  [list refreshed]
- agents/  [list refreshed]
- rules/   [list refreshed]

### Skipped (installed here but absent from guideline — possibly renamed/removed upstream):
[list, or "none"]

### Review the changes:
   git diff -- .claude/

CLAUDE.md, .mcp.json, and settings.json were intentionally left untouched.
```
