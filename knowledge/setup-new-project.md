# Using the `init-project` skill

This skill **bootstraps Claude Code Core for a new project** — auto-detects the tech stack, generates a tailored `CLAUDE.md`, selectively copies the relevant skills/agents/rules, and produces a `.mcp.json`.

---

## 1. Install (once per machine)

The skill lives in the `claude-code-guideline` repo. To make it available from any project on your machine, symlink it into your user-level skills directory:

```bash
mkdir -p ~/.claude/skills
ln -sfn ~/Documents/Devops/claude-code-guideline/.claude/skills/init-project \
        ~/.claude/skills/init-project
```

Verify:

```bash
ls -la ~/.claude/skills/init-project/SKILL.md
```

> **Why a symlink instead of a copy?**
> When you `git pull` the guideline repo to update the skill, every project picks up the new version automatically.

> **Why not `/add-dir`?**
> `/add-dir` only grants read/write access to a directory — it does **not** load the `.claude/` config from that directory into the session. Skills/agents/rules are loaded only from:
> - `~/.claude/` (user level — visible to every project)
> - `<project>/.claude/` (current project only)

---

## 2. Standard workflow when starting a new project

### Step 1: Prepare the project

The project should contain at least one of:
- `README.md` (describes tech stack, CI/CD)
- `package.json` / `go.mod` / `Pipfile` / `Cargo.toml`
- `Dockerfile` / `docker-compose.yml`
- Terraform `.tf` files

→ The skill reads these files to **detect the tech stack**. An empty project produces a generic result.

### Step 2: Open Claude Code in the project directory

```bash
cd /path/to/your-new-project
claude
```

> ⚠️ **You must `cd` into the project before running `claude`** — do not use `/add-dir`. The `.claude/` directory is created at the **session's working directory** at startup.

### Step 3: Invoke the skill

In Claude Code, type:

```
/init-project
```

To write `CLAUDE.md` to a custom path, pass it as an argument:

```
/init-project docs/CLAUDE.md
```

### Step 4: The skill runs six phases automatically

| Phase | What it does |
|---|---|
| 1. Explore | Scans file structure, reads README + manifest files |
| 2. Analyze | Inspects Terraform / Docker / K8s configurations if present |
| 3. Generate CLAUDE.md | Writes a ~100–150 line file tailored to the project |
| 4. Copy Core Files | Copies **only** the relevant skills/agents/rules into `.claude/` |
| 5. Generate .mcp.json | Builds an MCP config with **only** the relevant servers, then adds it to `.gitignore` |
| 6. Summary | Prints a recap of everything it did |

### Step 5: Manual follow-up

Once the skill finishes:

1. **Fill in placeholders in `.mcp.json`:**
   ```bash
   grep -n '<your-' .mcp.json
   ```
   Common placeholders:
   - `<your-aws-profile>` — e.g. `claude-mcp-default` (see [aws-iam-mcp-setup.md](aws-iam-mcp-setup.md) for the recommended setup)
   - `<your-aws-region>` — e.g. `ap-southeast-1`
   - `<your-github-pat>` — GitHub Personal Access Token
   - `<your-grafana-url>` / `<your-grafana-api-token>`

2. **Set up the AWS IAM user for MCP** (one-time per developer per AWS account):
   Follow [aws-iam-mcp-setup.md](aws-iam-mcp-setup.md) to create a dedicated, read-only IAM user with permission boundary, conditional access, and rotation schedule. This is **required before MCP can talk to AWS**.

3. **Review `CLAUDE.md`:**
   - Verify the build/test/deploy commands are accurate
   - Add gotchas and quirks the skill couldn't infer

4. **Restart Claude Code** so the new `.claude/` is loaded:
   ```
   /exit
   claude
   ```

5. **Commit:**
   ```bash
   git add CLAUDE.md .claude/
   git commit -m "chore: add Claude Code guidelines"
   # DO NOT commit .mcp.json — it's already in .gitignore
   ```

---

## 3. Detection table — what the skill copies

| Detected | Skills added | Agents added | Rules added | MCP servers added |
|---|---|---|---|---|
| **Always** | `devops-engineer`, `secure-code-guardian` | — | `security.md` | — |
| **Terraform** | `terraform-engineer`, `cloud-architect` | `infra-reviewer.md` | `terraform.md` | `terraform`, `iac` |
| **Docker** | — | — | `docker.md` | — |
| **Kubernetes / Helm** | `kubernetes-specialist` | — | `kubernetes.md` | `eks` (if EKS) |
| **PostgreSQL / Aurora** | `postgres-pro`, `database-optimizer` | — | — | `aurora-postgresql` |
| **MySQL** | — | — | — | `aurora-mysql` |
| **Redis / ElastiCache** | — | — | — | `elasticache`, `elasticache-valkey` |
| **Lambda / Serverless** | — | — | — | `serverless`, `lambda-tool` |
| **SQS / SNS** | — | — | — | `sns-sqs` |
| **Kafka / MSK** | — | — | — | `msk` |
| **ECS** | — | — | — | `ecs` |
| **AWS (any service)** | — | `cost-optimizer.md`, `incident-responder.md` | — | `aws-api`, `aws-knowledge`, `cloudwatch`, `iam` |
| **CLI tool** | `cli-developer` | — | — | — |
| **Chaos / resilience** | `chaos-engineer` | — | — | — |
| **SRE / SLO** | `sre-engineer` | — | — | — |
| **Security-sensitive** (PII / finance / healthcare) | `security-reviewer` | `security-auditor.md` | — | — |
| **Grafana / Prometheus** | `monitoring-expert` | — | — | `grafana` |
| **GitHub Actions in README** | — | — | `cicd.md` | `github` |
| **GitLab CI in README** | — | — | `cicd.md` | `gitlab` |
| **Jenkins in README** | — | — | `cicd.md` | `jenkins` |
| **New project / design phase** | — | — | — | `well-architected` |

> CI/CD detection reads the **README only**, not `.github/workflows/`. At init time the workflow files may not exist yet.

> `init-project` itself is **not** copied into the project — it is installed once per machine as a
> user-level symlink (§1) and is available to every project. A project-local copy would be
> redundant and would break `--sync` (it makes `$CLAUDE_SKILL_DIR` resolve into the project instead
> of the guideline repo — see Troubleshooting §4).

---

## 4. Troubleshooting

**Typing `/init-project` shows no suggestion?**
- Restart Claude Code (skills are loaded at startup).
- Check the symlink: `ls -la ~/.claude/skills/init-project`
- Check the frontmatter: `head -10 ~/.claude/skills/init-project/SKILL.md` — must include `name: init-project`.

**The skill ran but `.claude/` is empty / missing skills?**
- The skill only copies files that **already exist** under `~/Documents/Devops/claude-code-guideline/.claude/`. Verify:
  ```bash
  ls ~/Documents/Devops/claude-code-guideline/.claude/skills/
  ls ~/Documents/Devops/claude-code-guideline/.claude/agents/
  ls ~/Documents/Devops/claude-code-guideline/.claude/rules/
  ```
- A missing source file is silently skipped (not an error).

**`$GUIDELINE_CLAUDE` in `SKILL.md` resolving wrong?**
- `SKILL.md` uses `$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")`. Claude Code sets `CLAUDE_SKILL_DIR` to the running skill's directory. With a symlink, it resolves through the symlink target — i.e. back into the guideline repo — which is correct.
- If you copied the skill instead of symlinking it, the variable resolves to `~/.claude/`, and the `skills/`, `agents/`, `rules/` directories must exist directly under `~/.claude/` (they don't, by default). This is another reason to symlink.

**`CLAUDE.md` already exists — does re-running the skill overwrite it?**
- Yes, it is overwritten. Either back it up first, or pass a different output path:
  ```
  /init-project CLAUDE.new.md
  ```

**`.mcp.json` already exists — what happens?**
- The skill **skips Phase 5 entirely** and leaves the existing `.mcp.json` untouched.

---

## 5. Keeping a project up to date — `--sync` vs. re-run

The skill **copies** skills/agents/rules into `<project>/.claude/` (it does **not** symlink them).
Copies are deliberate — see [§6](#6-why-copy-not-symlink-for-project-content). The trade-off is
that copies go stale when the guideline repo is updated. There are two ways to refresh.

### Option A — `/init-project --sync` (refresh in place)

Run this in the project after `git pull` in the guideline repo:

```
/init-project --sync
```

It pulls the **latest** version of every skill/agent/rule **already installed** in the project,
overwriting them in place. Then it prints `git diff --stat -- .claude/` so you can review.

| Sync **does** | Sync **does NOT** |
|---|---|
| Refresh existing `.claude/skills/`, `.claude/agents/`, `.claude/rules/` | Add anything not already installed |
| Print a diff for review (no auto-commit) | Touch `CLAUDE.md` (your customizations are safe) |
| | Touch `.mcp.json` (local secrets/placeholders) |
| | Touch `.claude/settings.json` (project-local settings) |

> To **add** a newly-relevant skill/agent (not just refresh existing ones), use a full re-run —
> sync never introduces new files.

After reviewing the diff:

```bash
git add .claude/
git commit -m "chore: sync Claude Code Core from guideline"
```

### Option B — full re-run `/init-project` (re-detect + re-copy)

✅ **Re-run** when:
- A new tech stack is added to the project (e.g. Terraform added to a Node.js project) — you need
  re-detection to pull in the matching skills/agents/rules
- You want a fresh `CLAUDE.md` regenerated from scratch

❌ **Don't re-run** when:
- You've heavily customized `CLAUDE.md` — it will be **overwritten** (use `--sync` instead, which
  leaves `CLAUDE.md` untouched)
- The change is small and doesn't affect the detected tech stack

| | `--sync` | Full re-run |
|---|---|---|
| Re-detects tech stack | No | Yes |
| Adds newly-relevant skills/agents | No | Yes |
| Refreshes existing skills/agents/rules | Yes | Yes |
| Overwrites `CLAUDE.md` | **No** | **Yes** |
| Touches `.mcp.json` / `settings.json` | No | Skips if they already exist |

→ For a one-off single-file update, you can still copy directly from
`~/Documents/Devops/claude-code-guideline/.claude/`.

---

## 6. Why copy, not symlink, for project content

A reasonable question: since the **skill itself** is symlinked (§1) so it auto-updates, why not
symlink the skills/agents/rules **into each project** too? Because the two cases are different:

| | Skill symlink (§1) | Project `.claude/` content (Phase 4) |
|---|---|---|
| Lives at | `~/.claude/` (user-level) | `<project>/.claude/` |
| Committed to git? | **No** — personal tool on your machine | **Yes** — `git add .claude/` (Phase 6, Step 5) |
| Shared / cloned elsewhere? | No | Yes — teammates, other machines, CI |

Symlinking committed project content breaks in three ways:

1. **Portability.** `git add` on a symlink stores the *link path*, not the content. Anyone who
   clones the repo on another machine (or CI) gets a **dangling symlink** pointing at an absolute
   path (`/home/.../claude-code-guideline/...`) that only exists on your machine — so `.claude/`
   is effectively empty for them.
2. **Reproducibility.** A copy is a **pinned snapshot** — the project records exactly which version
   of each rule it was set up with. A symlink would let an upstream edit silently change agent
   behaviour on an old project with no commit, PR, or review.
3. **Version-control intent.** Committing `.claude/` exists precisely so the config is reviewable
   and rollback-able alongside the code. Symlinks defeat that.

`--sync` gives you the freshness benefit of symlinks while keeping copies portable and reviewable:
you pull updates **on demand**, see them in `git diff`, and commit them deliberately.

---

## 7. Related docs

- [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md) — set up the AWS IAM user that powers all AWS MCP servers
- [`mcp-devops-setup.md`](mcp-devops-setup.md) — full catalog of supported MCP servers with `.mcp.json` snippets
- [`claude-code-core.md`](claude-code-core.md) — overview of Claude Code Core (skills/agents/rules system)
