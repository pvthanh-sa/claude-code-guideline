# Detailed Guide — DevOps Pipeline from A to Z

This is the **hands-on, step-by-step** guide for the whole process:

```
Receive request → /spec-architect → /init-project → /iac-implement → /infra-review → /infra-document → /secret-scan → git push
                       (G1)             (G2)            (G3)             (G4)             (G5)             (G6)
                                          (you run `terraform apply tfplan` yourself after G3)
```

> **Difference vs `devops-workflow.md`:** that file is the _quick reference map_ (short, for
> lookups). This file is the _practical walkthrough_ (long, with a worked example throughout, plus
> checklists & troubleshooting).

> **Philosophy throughout:** Claude is the **co-pilot**, you are the **driver**. Each step, when
> done, **STOPS** at an _approval gate_ and waits for you. There is no run-everything-automatically
> mode. No step auto-runs `terraform apply` or `git commit`.

> **Sessions (important):** Stage 1 = a throwaway session (`claude --mcp-config …`). Stage 2 = its
> own session in the new project dir, then a **restart** to load `.claude/`. **Stages 3 → 4 → 5 → 6
> all run in that one project session** — don't open a new session between them: the `/infra-review`
> results stay in context and flow into `/infra-document`. If it gets long, use `/compact` (not a
> new session). The G4 report is also saved to `docs/reviews/` so a later session can still read it.

---

## Table of contents

1. [One-time setup](#1-one-time-setup)
2. [Overview: 6 steps + 6 gates](#2-overview-6-steps--6-gates)
3. [Worked example](#3-worked-example)
4. [Step 0 — Receive the request](#step-0--receive-the-request)
5. [Step 1 — `/spec-architect` (Gate G1)](#step-1--spec-architect-gate-g1)
6. [Step 2 — `/init-project` (Gate G2)](#step-2--init-project-gate-g2)
7. [Step 3 — `/iac-implement` (Gate G3)](#step-3--iac-implement-gate-g3)
8. [Step 4 — `/infra-review` (Gate G4)](#step-4--infra-review-gate-g4)
9. [Step 5 — `/infra-document` (Gate G5)](#step-5--infra-document-gate-g5)
10. [Step 6 — `/secret-scan` (Gate G6)](#step-6--secret-scan-gate-g6)
11. [After apply — operations (Day-2)](#11-after-apply--operations-day-2)
12. [Command cheat-sheet](#12-command-cheat-sheet)
13. [Per-gate checklists](#13-per-gate-checklists)
14. [Troubleshooting](#14-troubleshooting)
15. [FAQ](#15-faq)

---

## 1. One-time setup

Do this **once per machine**. Skip if already done.

### 1.1 Symlink the pipeline skills + workflow

The 6 pipeline skills **and** the `infra-review` workflow are personal, cross-project tools →
symlink them into `~/.claude/` so they're available from every project (and auto-update on
`git pull` of the guideline repo). Putting the workflow at `~/.claude/workflows/` gives it a
**machine-independent path** — the `/infra-review` skill runs it from there, so nothing needs editing
on a new machine (just re-run this block):

```bash
mkdir -p ~/.claude/skills ~/.claude/workflows

# Skills
for s in init-project spec-architect iac-implement infra-review infra-document secret-scan; do
  ln -sfn ~/Documents/Devops/claude-code-guideline/.claude/skills/$s ~/.claude/skills/$s
done

# Workflow(s) used by /infra-review
for wf in ~/Documents/Devops/claude-code-guideline/.claude/workflows/*.js; do
  ln -sfn "$wf" ~/.claude/workflows/"$(basename "$wf")"
done
```

**Restart Claude Code**, type `/` — you should see all 6 commands.

> **Symlink vs copy:** symlinks track the guideline repo, so `git pull` updates skills + workflow
> everywhere with no edits. Want a frozen copy that doesn't auto-update? swap `ln -sfn` for `cp`
> (then re-copy after each update). Why symlink for project content vs copy: see
> [`setup-new-project.md`](setup-new-project.md) §1.

### 1.2 Set up AWS IAM for MCP (once per account / per dev)

The AWS MCP servers (pricing, well-architected, aws-api…) need a dedicated read-only IAM user.
Follow [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md). This is a **prerequisite** for Stage 1 to
estimate cost and Stage 4 to read live resources.

### 1.3 Terraform module library — set `TF_MODULE_LIB` (required)

The pipeline reuses the custom Terraform modules from your `custom-infrastructure` repo. The
Stage 1/3 skills resolve its location **only** from the `TF_MODULE_LIB` env var — there is **no
hardcoded default**, so this must be set on **every** machine (the skills error out if it's unset).

**Step 1 — find out which file your new terminals actually read.** Open a fresh terminal and run:

```bash
shopt -q login_shell && echo "LOGIN shell → use ~/.bash_profile" || echo "non-login → use ~/.bashrc"
```

- **`~/.bashrc`** — when new terminals are **non-login** interactive shells. This is the default for
  GNOME Terminal / most Linux terminal tabs on Ubuntu.
- **`~/.bash_profile`** — when new terminals are **login** shells (it reads `~/.bash_profile`, or
  `~/.profile` if that's absent — but **not** `~/.bashrc` unless one explicitly sources it). This is
  the case for macOS Terminal, SSH sessions, and any terminal set to "run as login shell". _This is
  the case on the current LionGarden machine — its real env (nvm, pyenv, terraform…) lives in
  `~/.bash_profile`._

**Step 2 — append the export to the file Step 1 told you**, then reload and verify:

```bash
RC=~/.bash_profile   # or ~/.bashrc — whichever Step 1 printed
echo 'export TF_MODULE_LIB="$HOME/Documents/Devops/terraforms/custom-infrastructure"' >> "$RC"
source "$RC"
echo "$TF_MODULE_LIB"                       # this session
bash -il -c 'echo "[$TF_MODULE_LIB]"'       # what a brand-new login terminal will see
```

> **Bulletproof alternative:** keep the export in `~/.bashrc` and make `~/.bash_profile` source it —
> add `[ -f ~/.bashrc ] && . ~/.bashrc` to `~/.bash_profile`. Then both shell types pick it up and
> you only maintain one file.

Nothing else to do now — Step 3 will walk you through `/add-dir`'ing it into the session.

### 1.4 MCP for the spec step (loaded ephemerally — not global, no token cost)

`/spec-architect` runs **before** the project has a `.mcp.json`, so the read-only advisory servers
(`aws-knowledge`, `well-architected`, `aws-pricing`) are loaded **only for the spec session** via
the `--mcp-config` flag — _not_ installed globally, so they don't burn tokens in other projects.

Once — copy the template and fill in profile/region:

```bash
cp ~/Documents/Devops/claude-code-guideline/.mcp.spec.json ~/.claude/spec-mcp.json
# edit <your-aws-profile> → your read-only profile (see aws-iam-mcp-setup.md)
#      <your-aws-region>  → e.g. ap-northeast-1   (aws-pricing is always us-east-1, leave as is)
```

Then **each time** you build a spec, launch Claude Code with this flag (see Step 1):

```bash
claude --mcp-config ~/.claude/spec-mcp.json
```

- ✅ **Applies only to that session** — not written to global/project config; gone when you exit.
- ✅ **No cleanup needed after init-project**: the next session you open `claude` normally (no flag)
  and it's gone; the project `.mcp.json` (generated by init-project, already including
  `well-architected` + `aws-pricing` + `aws-knowledge`) takes over for Stages 2→4.
- ℹ️ `aws-knowledge` is HTTP and needs no AWS creds; `well-architected`/`aws-pricing` need a profile.
  Spec still works without MCP — you just lose real pricing/Well-Architected data.

---

## 2. Overview: 6 steps + 6 gates

| #   | Command                       | You receive                             | Gate   | You decide                         | Next command                                    |
| --- | ----------------------------- | --------------------------------------- | ------ | ---------------------------------- | ----------------------------------------------- |
| 1   | `/spec-architect <name>`      | `docs/specs/<name>.spec.md`             | **G1** | Spec right?                        | create folder → `/init-project`                 |
| 2   | `/init-project`               | `CLAUDE.md`, `.mcp.json`, `.claude/`    | **G2** | Detection right? fill `.mcp.json`? | `/add-dir` lib → `/iac-implement`               |
| 3   | `/iac-implement <spec> <env>` | Terraform code + `terraform plan`       | **G3** | Plan OK?                           | `terraform apply tfplan` **or** `/infra-review` |
| 4   | `/infra-review <env>`         | merged report → `docs/reviews/<env>-<date>.md` | **G4** | go / fix / no-go                   | fix chosen items → apply → `/infra-document`    |
| 5   | `/infra-document <env>`       | `docs/infrastructure.md` + `infra.drawio` | **G5** | doc accurate? diagram correct?     | export PNG, delete Mermaid, commit              |
| 6   | `/secret-scan`                | scan result + guardrail (hook + CI)     | **G6** | clean? real leak to rotate?        | `git push` (hook + CI re-scan)                  |

**Safety invariant:** `.claude/settings.json` (**copied** into the project by `/init-project` if the
project has none — not generated per-stack) hard-denies `terraform destroy` and
`terraform apply -auto-approve`. A plain `terraform apply tfplan` is **not** in the allow list, so
it **prompts for permission** before running → you are the only one who presses "apply".

---

## 3. Worked example

For illustration, the whole document uses one hypothetical request:

> _"Build a **dev** environment for a clinic API: backend on **ECS Fargate**, DB **Aurora
> PostgreSQL**, behind **ALB** + **CloudFront**, region **Tokyo (ap-northeast-1)**, cost-conscious
> dev budget. App name: `care-hub`."_

Expected result: a `dev-care-hub` environment directory that reuses existing modules, passes the
validate chain, has a clean `terraform plan`, and a go/no-go review report.

---

## Step 0 — Receive the request

Before typing a command, ask yourself: **does this touch production / new design / migration / cost
review / a security decision?** If **yes** → enable **Plan Mode** (Shift+Tab) during Steps 1 and 3
so Claude presents a plan before touching files. If it's just a small dev change → run directly.

Have a few things ready (in your head or on paper) that Claude will ask about: workload, estimated
traffic, which environments, what data, compliance, budget, SLO/RTO/RPO.

---

## Step 1 — `/spec-architect` (Gate G1)

**Goal:** turn a fuzzy request, together with Claude, into a **clear spec — cost-estimated and
Well-Architected-checked** — saved to a file for review & versioning.

### 1. Run the command

Open Claude Code in a working directory (a temp folder is fine) **with the spec-step advisory MCP**
(prepared in §1.4) — loaded ephemerally for this session only:

```bash
claude --mcp-config ~/.claude/spec-mcp.json
```

Then in the session, invoke the skill:

```
/spec-architect care-hub
```

`care-hub` is the spec name (kebab-case). Leave it blank and Claude will ask.

> Works without MCP too — Claude designs from principles and notes "real data not available".

### 2. Answer the interview (Discovery phase)

Claude **asks in batches** (via choice boxes or open questions), e.g.:

- What's the workload? → _stateless backend API + DB_
- Estimated traffic? → _~50 RPS, business hours, dev should be small_
- Which environments? → _only `develop` for now_
- Datastore? → _Aurora PostgreSQL_
- Compliance/PII? → _patient data → be careful, but dev uses fake data_
- Budget? → _dev as cheap as possible (single NAT, small instances)_
- SLO/RTO/RPO? → _dev doesn't need a strict SLO_

👉 **Tip:** answer truthfully/briefly. Two kinds of "unclear" are handled **differently** (Claude
still proposes the "best" option, it just won't fabricate your facts):

> - **Technical decisions** (Serverless vs provisioned, single/multi-AZ, WAF or not…): just say
>   _"not sure, suggest one"_ → Claude **proposes the best option + reason + trade-off**, recorded
>   in §9 as _"Recommendation: X (because…) — confirm / change"_. You just OK or override — no need
>   to think from scratch.
> - **Facts only you know** (budget ceiling, real traffic, compliance constraints, which envs):
>   if not provided, Claude records _"Need from you: …"_ — it **won't invent a number or assume**.

### 3. Claude designs + estimates (Design phase)

If MCP is on, Claude uses `well-architected` (6-pillar check), `aws-knowledge` (service choice),
`aws-pricing` (estimate $/month). If MCP is off, Claude still designs from principles and **notes
that real pricing data isn't available**.

### 4. Result: the spec file

Claude writes `docs/specs/care-hub.spec.md` per
[`templates/infra-spec-template.md`](templates/infra-spec-template.md). Example excerpt:

```markdown
# Infra Spec — care-hub (dev)

- AWS account / region: <account> / ap-northeast-1

## 3. Architecture

- Services: CloudFront → ALB → ECS Fargate (care-hub API) → Aurora PostgreSQL
- HA: dev = single-AZ for cost; prod (later) = multi-AZ

## 4. Environments & Naming

| Env | Prefix | Region |
| develop | dev- | ap-northeast-1 |

- Module prefix: dev-care-hub ; State: s3 key "dev/terraform.tfstate", use_lockfile = true

## 6. Cost estimate

| Compute (ECS 0.25vCPU/0.5GB x1) | ~$9 |
| Aurora PostgreSQL (t4g.medium) | ~$60 |
| NAT (single) | ~$32 |
| Total (est.) | ~$110/month |

## 8. Reusable modules

| VPC | network | no |
| ALB | alb | no |
| Container | ecs, ecs_cluster | no |
| DB | rds | no |

## 9. Decisions needing the human

- [ ] Recommendation: Aurora Serverless v2 (cheap when dev idle, auto-scales) — confirm / change to provisioned?
- [ ] Recommendation: drop WAF for dev (fake data, saves cost) — confirm / keep it?
- [ ] Need from you: monthly budget ceiling for dev
```

> Before stopping, Claude runs a quick **self-critique** pass over its own spec (missing
> requirements, Well-Architected gaps, downstream blockers) and folds any gaps into §9 — so a thin
> spec doesn't silently propagate to later stages.

### 5. 🚪 GATE G1 — you approve

Claude **STOPS** and prints a summary + warnings + the list of open decisions. Your job:

- [ ] Read `docs/specs/care-hub.spec.md` carefully
- [ ] Edit the file directly if needed (change instance, add an environment…)
- [ ] Confirm / change the **Recommendations** in §9, and fill in the **Need from you** items (e.g. budget)
- [ ] Agree on the architecture & cost estimate

➡️ **When OK**, go to Step 2. (Claude does **not** auto-init — by design.)

---

## Step 2 — `/init-project` (Gate G2)

**Goal:** create the new project so `init-project` reads the spec → detects the stack → generates
`CLAUDE.md`, `.mcp.json`, and copies exactly the skills/agents/rules the project needs.

### 1. Create the project folder + bring the spec over

```bash
mkdir -p ~/Documents/Devops/care-hub-infra/docs/specs
cp ~/<source>/docs/specs/care-hub.spec.md ~/Documents/Devops/care-hub-infra/docs/specs/
cd ~/Documents/Devops/care-hub-infra
git init        # have git so you can review diffs
claude
```

> ⚠️ You must `cd` into the folder **before** running `claude`. `.claude/` is created at the
> session's working directory at startup. Don't use `/add-dir` for this.

### 2. Run the command

```
/init-project
```

`init-project` will **read `docs/specs/care-hub.spec.md` first** (the strongest signal), even when
the folder is almost empty, then run 6 phases: explore → analyze → CLAUDE.md → copy core → .mcp.json
→ summary.

> 📚 **Deep-dive on Stage 2:** the **detection** table (which stack → copies which skill/agent/
> rule/MCP), **`--sync`** vs full re-run, and why it _copies rather than symlinks_ project content —
> see [`setup-new-project.md`](setup-new-project.md) §3, §5, §6. This file only summarizes usage.

### 3. Result

```
CLAUDE.md
.claude/skills/    (devops-engineer, terraform-engineer, cloud-architect, postgres-pro, ...)
.claude/agents/    (infra-reviewer, cost-optimizer, security-auditor, incident-responder)
.claude/rules/     (security, terraform, docker, cicd, ...)
.claude/settings.json
.mcp.json          (gitignored — contains placeholders)
```

### 4. 🚪 GATE G2 — you approve + fill placeholders

Claude **STOPS**. Your job:

- [ ] **Fill placeholders in `.mcp.json`:**
  ```bash
  grep -n '<your-' .mcp.json
  # <your-aws-profile> → e.g. care-hub-dev   | <your-aws-region> → ap-northeast-1
  # <your-github-pat>  → GitHub token         | grafana url/token if any
  ```
  (See [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md) for the read-only profile.)
- [ ] **Review `CLAUDE.md`** — are the build/test/deploy commands correct, add gotchas.
- [ ] Is the stack detected correctly (Terraform + AWS + Aurora…)?
- [ ] **Restart** to load the new `.claude/`:
  ```
  /exit
  claude
  ```
- [ ] Commit whenever you're ready — your call (just never commit `.mcp.json`; it's gitignored).

➡️ Go to Step 3.

---

## Step 3 — `/iac-implement` (Gate G3)

**Goal:** turn the spec into Terraform by **reusing existing modules**, scaffold the environment
directory per convention, and stop at `terraform plan` for you to review.

### 1. Load the module library into the session

```
/add-dir /home/lg-vietnam007/Documents/Devops/terraforms/custom-infrastructure
```

(Optional) also load a sample env so Claude can mirror the composition style:

```
/add-dir /home/lg-vietnam007/Desktop/Lion_Graden/clinic_online/new-clinic-infrastructure/environments/tokyo-dev
```

### 2. Run the command

```
/iac-implement docs/specs/care-hub.spec.md environments/dev-care-hub
```

- Arg 1 = spec path · Arg 2 = the env directory to create.

### 3. What Claude does (and you see)

1. **Reads the spec** (warns if the spec is still `Draft`).
2. **Generates / reads `MODULES.md`** at the library root (first run scans 36 modules, reads
   `variables.tf`/`outputs.tf`, builds a table `module | purpose | inputs | outputs | example env`).
   On later runs it's reused, refreshed only when a module changes.
3. **Maps spec → modules**: `network`, `alb`, `ecs`+`ecs_cluster`, `rds`, `acm`, `cloudfront`…
   The library doesn't cover everything, so when a component has no matching module Claude
   **authors a new one** — this is normal, not a failure. New modules are written as **standalone,
   reusable** units (single responsibility, fully parameterized, no hardcoded names/regions/IDs,
   own `versions.tf`/`variables.tf`/`main.tf`/`outputs.tf`/`README.md`, no provider/backend blocks)
   and live **project-local** under `./modules/<name>`. They are **not** added to
   `custom-infrastructure` unless you later ask to promote one. Claude tells you the plan before
   writing; you can still steer it to reshape the design onto an existing module instead.
4. **Scaffolds `environments/dev-care-hub/`** per the tokyo-dev convention:

   ```
   versions.tf  providers.tf  backend.tf  locals.tf  data.tf
   variables.tf  main.tf  outputs.tf  terraform.tfvars
   ```

   - `providers.tf`: provider region + `aws.virginia` alias (for CloudFront/ACM)
   - `backend.tf`: S3 + `use_lockfile = true`, `key = "dev/terraform.tfstate"`
   - `main.tf`: calls modules via relative `source`, prefix `dev-care-hub`, `tags = local.tags`,
     wiring one module's outputs into another's inputs. **Module sourcing depends on layout:**
     - **In-library** env (target sits inside `custom-infrastructure/environments/`) → source in
       place: `source = "../../modules/<name>"` (no copy).
     - **Standalone** project repo (its own `modules/`, like `voteapp_2025`) → Claude **vendors**
       (copies) each reused module into the project's local `modules/<name>` with a `.provenance`
       stamp, and sources the local copy. `custom-infrastructure` stays the **golden source**:
       to change a vendored module, edit it **upstream first**, re-validate, then re-copy — never
       edit the project's copy in isolation (that silently forks it).

5. **Validate chain** (two misconfig scanners — Checkov + Trivy catch different things):
   ```bash
   terraform fmt -recursive
   terraform init -backend=false && terraform validate
   tflint
   checkov -d .
   trivy config . --severity HIGH,CRITICAL
   # + AWS Access Analyzer on any IAM policies (deterministic, needs creds)
   ```
   Then (once you confirm credentials/backend are ready):
   ```bash
   terraform init
   terraform plan -out=tfplan
   ```
6. **Installs the CI security gate** — `.github/workflows/iac-scan.yml` (idempotent, drift-aware).
   It re-runs fmt/validate/tflint/Checkov/Trivy on **every PR** touching `.tf` (defense-in-depth:
   local gate + server-side gate). Mark its `iac-scan` check **Required** in branch protection.

> 🛠️ **Run any scan by hand?** All the CLI commands (IaC + secrets, binary + Docker, tuning) are in
> [`security-scans-cli.md`](security-scans-cli.md).

### 4. 🚪 GATE G3 — you approve the plan

Claude **STOPS** with a summary: reused modules, validate results, and `+X / ~Y / -Z resources`.
Your job:

- [ ] Read `terraform plan` — right resources? right counts? nothing deleted by mistake?
- [ ] Module reuse sensible? (no unexpected new modules)
- [ ] `checkov` / `trivy config` / `tflint` free of serious issues? (CI `iac-scan` will re-check on PR)
- [ ] **You apply** (Claude does NOT auto-apply):
  ```bash
  terraform apply tfplan
  ```
  Or review thoroughly before applying → go to **Step 4** (`/infra-review`) first.

> **Recommended order:** for important infrastructure, run `/infra-review` **before** `apply`
> (review on code/plan). For simple dev, you may `apply` then `/infra-review` to also check live
> resources.

---

## Step 4 — `/infra-review` (Gate G4)

**Goal:** a thorough review across **3 parallel perspectives**, merged into **one** prioritized
report + go/no-go.

### 1. Run the command

```
/infra-review environments/dev-care-hub
```

> **Higher recall:** add `--deep` → `/infra-review environments/dev-care-hub --deep`. It loops the
> finders until 2 consecutive rounds surface no new findings (a single AI pass is **not exhaustive**
> — that's why a 2nd run often finds more; see §14). Default (no flag) = one pass.

### 2. What happens

The skill calls the **`infra-review` Workflow**, running **in parallel**:

- `security-auditor` — secrets, IAM, encryption, network, container, CI/CD
- `infra-reviewer` — naming/tagging/variables/pinning + **resource waste**
- `cost-optimizer` — instances, NAT, log retention, storage tier, $ savings

Watch it live by typing `/workflows` (3 agents running concurrently → 1 synthesize phase).

> The skill runs the workflow from **`~/.claude/workflows/infra-review.js`** (installed by the
> one-time setup §1.1, a machine-independent path), so it works from any project — you do **not**
> copy `infra-review.js` into the project. It relies on the `security-auditor` / `infra-reviewer` /
> `cost-optimizer` agents that `/init-project` copied into `.claude/agents/`.

### 3. Result: one merged report (saved to a file)

The report is written to **`docs/reviews/<env>-<date>.md`** (e.g.
`docs/reviews/dev-care-hub-2026-06-04.md`) — so Stage 5 and later sessions can read it — and shown in chat:

```
## Infrastructure Review Report (G4) — environments/dev-care-hub
_Saved: docs/reviews/dev-care-hub-2026-06-04.md_
### Recommendation: GO-WITH-FIXES
### Severity: Critical 0 · High 2 · Medium 3 · Low 1
### Estimated savings: ~$28/month

### Must fix before apply (Critical/High):
1. [High][security] RDS missing storage_encrypted — rds module: set storage_encrypted = true
2. [High][infra] ALB SG opens 0.0.0.0/0 on port 80 — restrict to CloudFront prefix list

### Cost-saving recommendations:
1. dev should use single_nat_gateway = true — ~$32/month (risk: Low)
2. log retention 30d → 14d — ~$X (risk: Low)
```

### 4. 🚪 GATE G4 — you decide

Claude **STOPS** and asks:

```
[a] Fix all Critical/High   [b] Fix only the items I pick   [c] No-go / stop
```

- You choose (e.g. `b, fix items 1 and 2`).
- Claude lists the changes it will make, **waits for your OK**, then edits the working tree (the
  hook auto-runs `terraform fmt`), re-runs validation, and shows `git diff` — **still no apply, no
  commit**.
- To be sure: re-run `/infra-review` to confirm findings are gone → then you `terraform apply tfplan`.

➡️ Next: document it (Step 5, same session). Commit the IaC + saved review whenever you choose.

---

## Step 5 — `/infra-document` (Gate G5)

**Goal:** capture the as-built infrastructure as a **living document** + an editable AWS-grouped
diagram, so the team has one source of truth that stays in sync with the code.

### 1. Run the command

```
/infra-document environments/dev-care-hub
```

### 2. What Claude does

1. Derives the topology from the env's `main.tf` (how modules wire together) + the spec + `MODULES.md`,
   and reads the latest **`docs/reviews/<env>-*.md`** to fill the security-posture section (§7).
2. Writes **`docs/infrastructure.md`** (10 sections: overview, diagram, components, network, data
   flow, environments, security, cost, operations, change log).
3. Hand-authors **`docs/diagrams/infra.drawio`** — one combined diagram with AWS Cloud / Region /
   VPC / subnet groups (proven `mxgraph.aws4` styles), validated as well-formed XML.
4. Embeds a **temporary Mermaid block** in §2 mirroring the diagram, so you can verify it without
   opening draw.io (guards against a malformed/incorrect `.drawio`).
5. **Coverage check:** confirms every `module` in `main.tf` appears as a node in the diagram (and a
   row in §3) — flags anything drawn-but-missing before you review.

### 3. 🚪 GATE G5 — you approve

Claude **STOPS**. Your job:

- [ ] Open `docs/diagrams/infra.drawio` in draw.io — does it match the Mermaid block in §2?
- [ ] Export it to `docs/diagrams/infra.png`, then **delete** the Mermaid verification block.
- [ ] Review `docs/infrastructure.md` (accurate? gaps marked TODO?). Commit when you're ready.

> It's a **living document** — re-run `/infra-document` whenever the infra changes to refresh the
> doc + diagram from code.

---

## Step 6 — `/secret-scan` (Gate G6)

**Goal:** stop secrets from reaching GitHub. The scan is done by a **tool** — **Betterleaks**
(fallback **Gitleaks**) — at two layers (defense-in-depth): a local pre-push hook and a CI workflow.

### 1. First time: install the guardrail

```
/secret-scan --setup
```

Writes `.gitleaks.toml`, a tracked `.githooks/pre-push` (via `git config core.hooksPath .githooks`),
and `.github/workflows/secret-scan.yml`. Install the scanner once — **Betterleaks** preferred
(`brew install betterleaks`, or `docker pull ghcr.io/betterleaks/betterleaks:latest`), **Gitleaks**
as the easy single-binary fallback on plain Linux. Prefer to set it up by hand? Copy from
[`templates/secret-scan/`](templates/secret-scan/README.md).

### 2. Before every push: scan

Once the guardrail is installed, scanning is done by the **tool** — you don't have to call the AI
each time. There are four ways to run it (the first two need no AI, no typing):

1. **Automatic on `git push` (pre-push hook)** — the default. `.githooks/pre-push` runs the scanner
   itself and blocks the push if it finds a secret. You usually do nothing.
2. **Manual, yourself (no AI)** — run the same command the hook uses, anytime:
   ```bash
   # PATH binary:
   betterleaks git . --redact --config .gitleaks.toml      # or: gitleaks detect --no-banner --redact --config .gitleaks.toml
   # Docker-only install (no binary on PATH):
   docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/repo" -w /repo \
     ghcr.io/betterleaks/betterleaks:latest git . --redact --config .gitleaks.toml
   ```
   `git .` scans committed history; swap for `dir .` to also catch **uncommitted** files (useful in a
   mostly-unstaged repo). Exit 0 = clean; non-zero = potential secret(s), value redacted.
3. **Automatic in CI (no AI)** — `.github/workflows/secret-scan.yml` re-scans full history on every
   push/PR (server-side backstop, independent of your machine).
4. **Via the skill (AI-assisted)** — `/secret-scan`. Use this when you want Claude to run the scan
   **and** triage the result: classify false positives, walk the remediation order
   (remove → **rotate** → `.gitleaksignore`), or fix the code. For a plain clean/not-clean verdict,
   ways 1–2 are enough.

> Re-run `/secret-scan --setup` only when the templates change (drift) or for a new project — not
> before every scan.

> 🛠️ Full CLI cheat-sheet for secrets **and** IaC scans (install, Docker fallback, suppressions):
> [`security-scans-cli.md`](security-scans-cli.md).

### 3. 🚪 GATE G6 — you decide

Claude **STOPS** with the result:

- [ ] **Clean** → you `git push` (the pre-push hook re-scans as a backstop; CI re-scans full history).
- [ ] **Leak found** → remove the secret, **rotate it if it was real**, re-run `/secret-scan`. Don't push.
- False positive? add its fingerprint to `.gitleaksignore`.

> Bypass the local hook only when certain: `git push --no-verify` (you own the risk).
> Optional 3rd layer: enable GitHub native **push protection** in repo settings.

---

## 11. After apply — operations (Day-2)

The pipeline focuses on _building_. After `apply`, other skills/agents support operations:

| Need                                               | Use                                                |
| -------------------------------------------------- | -------------------------------------------------- |
| Production incident (ECS/RDS/ALB)                  | agent `incident-responder`                         |
| Periodic cost review                               | agent `cost-optimizer` (or re-run `/infra-review`) |
| Set up monitoring/dashboard/alerts                 | skill `monitoring-expert`                          |
| Define SLO/error budget                            | skill `sre-engineer`                               |
| Optimize DB queries                                | skill `postgres-pro`, `database-optimizer`         |
| CI/CD deploy (GitHub Actions OIDC, ECS blue-green) | skill `devops-engineer`                            |
| Resilience testing                                 | skill `chaos-engineer`                             |

> Tip: you can schedule `/infra-review` periodically via `/schedule` (e.g. weekly for prod) to catch
> security/cost drift.

---

## 12. Command cheat-sheet

```bash
# --- One-time setup ---
mkdir -p ~/.claude/skills ~/.claude/workflows
for s in init-project spec-architect iac-implement infra-review infra-document secret-scan; do
  ln -sfn ~/Documents/Devops/claude-code-guideline/.claude/skills/$s ~/.claude/skills/$s
done
for wf in ~/Documents/Devops/claude-code-guideline/.claude/workflows/*.js; do
  ln -sfn "$wf" ~/.claude/workflows/"$(basename "$wf")"          # /infra-review reads ~/.claude/workflows/
done

# --- Spec step: open a session with ephemeral MCP (not global) ---
cp ~/Documents/Devops/claude-code-guideline/.mcp.spec.json ~/.claude/spec-mcp.json  # once, fill profile
claude --mcp-config ~/.claude/spec-mcp.json                # spec session with advisory MCP
/spec-architect care-hub                                   # G1: build spec
#   → create folder, copy spec, cd, claude (NO flag — ephemeral MCP is gone)
/init-project                                              # G2: bootstrap
#   → fill .mcp.json, review CLAUDE.md, /exit && claude, commit
/add-dir /home/lg-vietnam007/Documents/Devops/terraforms/custom-infrastructure
/iac-implement docs/specs/care-hub.spec.md environments/dev-care-hub   # G3: terraform plan
terraform apply tfplan                                     # you press it
/infra-review environments/dev-care-hub                    # G4: parallel review (add --deep = loop-until-dry)
/infra-document environments/dev-care-hub                  # G5: living doc + AWS-grouped drawio
#   → open .drawio, export PNG, delete Mermaid, commit docs/
/secret-scan --setup                                       # G6: install guardrail (once per project)
/secret-scan                                               # G6: scan before push
#   → clean? you `git push` (pre-push hook + CI re-scan)
```

---

## 13. Per-gate checklists

**G1 (after /spec-architect)**

- [ ] Spec reflects the request · [ ] Cost estimate acceptable · [ ] §9 fully answered

**G2 (after /init-project)**

- [ ] Stack detected correctly · [ ] `.mcp.json` placeholders filled · [ ] `CLAUDE.md` reviewed ·
      [ ] restarted · [ ] committed (except `.mcp.json`)

**G3 (after /iac-implement)**

- [ ] `plan` has right resources, nothing deleted by mistake · [ ] correct modules reused ·
      [ ] checkov/tflint clean · [ ] decided review-first vs apply-first

**G4 (after /infra-review)**

- [ ] No Critical left · [ ] High handled (or accepted with reason) · [ ] chosen cost savings
      applied · [ ] re-review clean · [ ] apply + commit

**G5 (after /infra-document)**

- [ ] `.drawio` matches the Mermaid block · [ ] exported `infra.png` + deleted Mermaid ·
      [ ] `infrastructure.md` accurate (gaps marked TODO) · [ ] committed `docs/`

**G6 (after /secret-scan)**

- [ ] guardrail installed (hook + CI) · [ ] scan clean (or real leak removed **and rotated**) ·
      [ ] then `git push`

---

## 14. Troubleshooting

| Symptom                                                | Cause / Fix                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/spec-architect` doesn't appear                       | Not symlinked or not restarted. Check `ls -la ~/.claude/skills/spec-architect/SKILL.md`, then restart.                                                                                                                                                             |
| `/init-project` gives a generic result                 | Forgot to copy the spec into `docs/specs/` **before** running, or the folder is empty. Copy the spec and re-run.                                                                                                                                                   |
| `/init-project` doesn't create `.mcp.json`             | `.mcp.json` already exists → the skill skips Phase 5 (by design). Delete it to regenerate.                                                                                                                                                                         |
| `/iac-implement` reports "library NOT LOADED"          | You haven't `/add-dir`'d the custom-infrastructure folder. Add it and re-run.                                                                                                                                                                                      |
| `MODULES.md` doesn't show a new module                 | Delete `MODULES.md` at the library root and re-run `/iac-implement` to regenerate.                                                                                                                                                                                 |
| No MCP at the spec step (pricing/well-architected)     | Forgot to launch the session with the flag. Exit and reopen: `claude --mcp-config ~/.claude/spec-mcp.json` (see §1.4). Spec works without MCP — you just lose real data.                                                                                           |
| MCP pricing/well-architected unresponsive              | IAM user not set up ([`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)) or wrong profile in `~/.claude/spec-mcp.json` / `.mcp.json`.                                                                                                                                  |
| `/workflows` shows no 3 agents                         | Workflow tool unavailable in the session → the `infra-review` skill falls back to running the 3 agents sequentially.                                                                                                                                               |
| `Workflow "infra-review" not found` (only deep-research, code-review) | The workflow isn't at `~/.claude/workflows/`. Run the one-time setup (§1.1) to symlink it there — the skill runs it from `~/.claude/workflows/infra-review.js` (machine-independent, via `scriptPath`). Fallbacks: resolve via the symlinked skill dir, or run the 3 agents sequentially. |
| Claude tries to `terraform apply`                      | Doesn't happen by design; `settings.json` also denies `apply -auto-approve`. If you see it, stop and report.                                                                                                                                                       |
| Deny list (destroy/apply block) missing in the project | `/init-project` only **copies** `settings.json` when the project **has none**; if a different one already exists it's not overwritten. Open `.claude/settings.json` and merge in the deny list from the guideline repo. `--sync` also **doesn't** touch this file. |
| `terraform init` backend error                         | S3 backend not created / wrong profile. Create the state bucket + fix `backend.tf`, or validate with `init -backend=false` first.                                                                                                                                  |

---

## 15. FAQ

**Q: I want to rename a command (e.g. `/spec` instead of `/spec-architect`)?**
A: Rename the skill folder in the guideline repo + the `name:` field in `SKILL.md`, then fix the symlink.

**Q: Can I re-run a step?**
A: Yes. Each skill is independent. Re-running `/iac-implement` re-scaffolds/syncs; re-running
`/infra-review` confirms findings are gone. `/init-project --sync` refreshes installed
skills/agents/rules in the project after a `git pull` of the guideline repo.

**Q: Do I need a new session between steps?**
A: Only twice — Stage 1 → 2 (the new project folder needs its own `claude`), and the restart after
Stage 2 (to load `.claude/`). **Stages 3 → 4 → 5 → 6 run in one session**; staying in it lets the
`/infra-review` results flow into `/infra-document`. The G4 report is also saved to
`docs/reviews/`, so a fresh session still works. If context gets long, `/compact` (not a new session).

**Q: Does the pipeline auto-deploy?**
A: No. It stops at `terraform plan` (G3). You run `apply`. CI/CD deployment is the job of
`devops-engineer` (GitHub Actions OIDC) — kept separate so you stay in control.

**Q: What if the project isn't Terraform/AWS?**
A: `/spec-architect` and `/init-project` still work (init detects other stacks). `/iac-implement` is
currently specialized for Terraform + this AWS module library.

**Q: Difference between this file and `devops-workflow.md`?**
A: `devops-workflow.md` = short reference map. This file = detailed practical guide with an example.

---

## Related

- [`devops-workflow.md`](devops-workflow.md) — pipeline & gate map (quick reference)
- [`templates/infra-spec-template.md`](templates/infra-spec-template.md) — spec template
- [`setup-new-project.md`](setup-new-project.md) — `/init-project` & `--sync` details
- [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md) — IAM user for MCP
- [`mcp-devops-setup.md`](mcp-devops-setup.md) — MCP server catalog
