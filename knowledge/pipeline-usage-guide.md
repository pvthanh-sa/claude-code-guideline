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

> **Mandatory security default — CloudFront origin mTLS.** Any architecture where CloudFront fronts
> an origin you control (ALB / custom origin) MUST use **origin mTLS** to lock the origin to the
> distribution (CloudFront presents a client cert the origin verifies). A CloudFront **prefix list or
> shared-secret header alone is NOT sufficient** — the origin-facing CloudFront IP ranges are shared
> across all AWS accounts, so anyone can point their own distribution at your origin and pass. This is
> enforced at G1 (`/spec-architect` records it in §5/§8) and G3 (`/iac-implement` wires `cloudfront`'s
> `origin_client_certificate_arn` + an ALB `mutual_authentication mode=verify` listener + trust store).
> Exceptions: S3 origins → OAC; in-VPC origins → VPC origins/PrivateLink. Reference implementation:
> the `cloudfront-mtls-origins` project.

> **Sessions (important):** Stage 1 = a throwaway session (`claude --mcp-config …`). Stage 2 = its
> own session in the new project dir, then a **restart** to load `.claude/`. **Stages 3 → 4 → 5 → 6
> all run in that one project session** — don't open a new session between them: the `/infra-review`
> results stay in context and flow into `/infra-document`. If it gets long, use `/compact` (not a
> new session). The G4 report is also saved to `docs/reviews/` so a later session can still read it.

---

## Table of contents

1. [One-time setup](#1-one-time-setup)
2. [Overview: 7 steps + 7 gates](#2-overview-7-steps--7-gates)
3. [Worked example](#3-worked-example)
4. [Step 0 — Receive the request](#step-0--receive-the-request)
5. [Step 1 — `/spec-architect` (Gate G1)](#step-1--spec-architect-gate-g1)
6. [Step 2 — `/init-project` (Gate G2)](#step-2--init-project-gate-g2)
7. [Step 3 — `/iac-implement` (Gate G3)](#step-3--iac-implement-gate-g3)
   - [Step 3b — `/ansible-implement` (Gate G3b — optional)](#step-3b--ansible-implement-gate-g3b--optional)
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

Do this **once per machine**, **in order**. Skip a sub-step only if already done.

> ⚠️ **On a brand-new machine, §1.1 alone is NOT enough** — it only creates symlinks. Those symlinks
> point at the guideline repo, which must already be **cloned** (§1.0), and the pipeline also needs the
> module library cloned (§1.3) plus a set of CLIs/runtimes installed (§1.0). Skipping §1.0 makes §1.1
> create *dangling* symlinks silently (`ln` doesn't check the target exists), so commands appear under
> `/` but every skill dies later with "must be symlinked". Run §1.0 → §1.5 top to bottom, then §1.5
> verifies the whole thing before you start.

### 1.0 Prerequisites — clone the repos + install the tools

**(a) Clone both repos.** §1.1/§1.3/§1.4 below assume these exact paths — clone here, or set the
`GUIDE` / `TF_MODULE_LIB` variables to wherever you cloned and the commands still work:

```bash
git clone <guideline-repo-url>        ~/Documents/Devops/claude-code-guideline           # this repo
git clone <custom-infrastructure-url> ~/Documents/Devops/terraforms/custom-infrastructure # the Terraform module library (SEPARATE repo, lives outside this one)
```

**(b) Install the CLIs/runtimes the pipeline shells out to.** Missing ones fail at different stages —
some loudly (terraform, scanners), some **silently** (MCP servers just don't start). Install all up front:

| Tool | Needed by | Install |
| ---- | --------- | ------- |
| `terraform` | Stage 3 validate/plan (hard-fails if absent) | [terraform install](https://developer.hashicorp.com/terraform/install) |
| `aws` CLI | Stage 1/3/4 (creds, plan backend, Access Analyzer) | `awscli` |
| `uv`/`uvx` | **most AWS MCP servers** (spec data, pricing, live reads) — silent fail without it | `curl -LsSf https://astral.sh/uv/install.sh \| sh && uv python install 3.10` |
| `docker` | terraform/github MCP + betterleaks Docker fallback | [docker install](https://docs.docker.com/engine/install/) |
| `node`/`npx` | grafana MCP (only if used) | nvm / distro pkg |
| `ansible-core` `ansible-lint` `yamllint` | **Stage 3b only.** You do **not** need to pre-install these: Stage 3b installs whatever is missing (`bootstrap-ansible.sh --ensure`) rather than letting a gate skip. Pre-install only if you want the doctor green or you are air-gapped | `.claude/skills/ansible-engineer/scripts/bootstrap-ansible.sh --dry-run` first — it picks venv/pyenv → pipx and refuses a bare system `pip3` (PEP 668) |
| `molecule` (optional) | Stage 3b role testing in a container | same bootstrap script; needs `docker` |
| `tflint` `checkov` `trivy` | Stage 3 local IaC scan (else SKIPPED, reported "not run") | see [`security-scans-cli.md`](security-scans-cli.md) §0 |
| `betterleaks` (or `gitleaks`) | Stage 6 secret scan (hard-fails at G6 if none) | `brew install betterleaks` / binary / `docker pull ghcr.io/betterleaks/betterleaks:latest` |
| `drawio` (desktop CLI) | Stage 5 auto-exports `infra.png` from the diagram; without it Stage 5 falls back to manual export + a Mermaid mirror | deb/AppImage from [drawio-desktop releases](https://github.com/jgraph/drawio-desktop/releases); headless machines also need `xvfb` (`apt install xvfb`) |
| `python3` | Stage 2 `/init-project` builds `.mcp.json` with it (hard-fails Phase 5 if absent); Stage 5 diagram validator `validate-drawio.py` (stencil catalog + geometry lint; uses `defusedxml` if present) | preinstalled on most distros; else `apt install python3` |
| `openssl` | `scripts/mint-certs.sh` for **mTLS projects** (self-signed CA + client/server leaves) | preinstalled on Linux/macOS; else `apt install openssl` |

(§1.5 below verifies all of these in one command.)

### 1.1 Symlink the pipeline skills + workflow + reviewer agents

The 6 pipeline skills, the `infra-review` workflow, **and the reviewer agents it calls** are personal,
cross-project tools → symlink them into `~/.claude/` so they're available from every project (and
auto-update on `git pull`). Set `GUIDE` to your clone path (from §1.0) — the whole block uses it:

```bash
GUIDE=~/Documents/Devops/claude-code-guideline   # <-- set to wherever YOU cloned the guideline repo
test -d "$GUIDE/.claude/skills" || { echo "STOP: $GUIDE/.claude/skills not found — fix GUIDE / clone §1.0 first"; }

mkdir -p ~/.claude/skills ~/.claude/workflows ~/.claude/agents

# Skills
for s in init-project spec-architect iac-implement ansible-implement infra-review infra-document secret-scan; do
  ln -sfn "$GUIDE/.claude/skills/$s" ~/.claude/skills/$s
done

# Workflow(s) used by /infra-review
for wf in "$GUIDE"/.claude/workflows/*.js; do
  ln -sfn "$wf" ~/.claude/workflows/"$(basename "$wf")"
done

# Reviewer agents the infra-review workflow invokes (security-auditor / infra-reviewer / cost-optimizer /
# ansible-reviewer / incident-responder). /init-project also copies these per-project, but symlinking them user-level lets
# /infra-review work in ANY project (incl. ones where init wasn't run), and matches the skills above.
for a in infra-reviewer cost-optimizer security-auditor ansible-reviewer incident-responder; do
  ln -sfn "$GUIDE/.claude/agents/$a.md" ~/.claude/agents/$a.md
done

# Sanity: no dangling symlinks (each must resolve to a real file)
for s in init-project spec-architect iac-implement ansible-implement infra-review infra-document secret-scan; do
  readlink -f ~/.claude/skills/$s/SKILL.md >/dev/null 2>&1 && echo "ok  $s" || echo "DANGLING $s — check GUIDE / clone"
done
```

**Restart Claude Code**, type `/` — you should see all 7 commands.

> **Why symlink matters for file resolution:** each skill reaches back into the guideline repo for
> the files it needs at runtime — templates (`iac-scan.yml`, `secret-scan/`, `infra-document-template.md`),
> the MCP catalog (`.mcp.guideline-only.json`), the Stage-5 diagram toolkit (`drawio-reference.md`,
> `validate-drawio.py`, `aws4-stencils.json`, `export-diagram.sh`). It finds them by following its
> **own symlink** (`readlink -f`) back to the repo, so **no path needs configuring for these** — the
> symlink in §1.1 is enough, wherever the repo is cloned. If a skill is *copied* instead of symlinked,
> that back-reference breaks and the skill now **stops with a clear error** telling you to symlink it.
> The **one** path you must set yourself is `TF_MODULE_LIB` (§1.3) — it points outside the guideline
> repo (to your `custom-infrastructure`), so it can't be auto-resolved; the Stage 1/3 skills hard-error
> if it's unset.

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
# Point this at YOUR custom-infrastructure clone from §1.0 (it's a SEPARATE repo, outside the guideline repo):
echo 'export TF_MODULE_LIB="$HOME/Documents/Devops/terraforms/custom-infrastructure"' >> "$RC"
source "$RC"
echo "$TF_MODULE_LIB"                       # this session
bash -il -c 'echo "[$TF_MODULE_LIB]"'       # what a brand-new login terminal will see
# VERIFY the var points at a real cloned library — setting the var alone is not enough:
test -d "$TF_MODULE_LIB/modules" && echo "OK: module library present" || echo "MISSING: clone custom-infrastructure to \$TF_MODULE_LIB (§1.0) — the var is set but the dir/modules/ is absent"
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
cp "${GUIDE:-$HOME/Documents/Devops/claude-code-guideline}/.mcp.spec.json" ~/.claude/spec-mcp.json
grep -n '<your-' ~/.claude/spec-mcp.json   # shows exactly what to fill (fails to find = file didn't copy → wrong GUIDE path)
# edit <your-aws-profile> → your read-only profile (see aws-iam-mcp-setup.md)
#      <your-aws-region>  → e.g. ap-northeast-1   (aws-pricing is pinned to us-east-1, leave as is)
```

> This is a **copy**, not a symlink (it needs your profile filled in). If the template ever changes,
> re-run the `cp` to refresh — then re-fill the placeholders.

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

### 1.5 Verify your setup (the "doctor")

One copy-paste block that checks every precondition **before** you start the pipeline, so a missing
piece surfaces now (PASS/FAIL per line) instead of mid-pipeline:

```bash
GUIDE=~/Documents/Devops/claude-code-guideline   # your guideline clone (from §1.0)
echo "== skills/workflow/agents resolve (catches dangling symlinks) =="
for s in init-project spec-architect iac-implement ansible-implement infra-review infra-document secret-scan; do
  readlink -f ~/.claude/skills/$s/SKILL.md >/dev/null 2>&1 && echo "ok  skill $s" || echo "FAIL skill $s"
done
readlink -f ~/.claude/workflows/infra-review.js >/dev/null 2>&1 && echo "ok  workflow infra-review" || echo "FAIL workflow infra-review"
for a in infra-reviewer cost-optimizer security-auditor ansible-reviewer incident-responder; do
  readlink -f ~/.claude/agents/$a.md >/dev/null 2>&1 && echo "ok  agent $a" || echo "FAIL agent $a"
done
echo "== module library =="
test -d "$TF_MODULE_LIB/modules" && echo "ok  TF_MODULE_LIB ($TF_MODULE_LIB)" || echo "FAIL TF_MODULE_LIB unset or no modules/ — clone custom-infra (§1.0/§1.3)"
echo "== CLIs / runtimes =="
for t in terraform aws uvx docker tflint checkov trivy python3; do command -v $t >/dev/null && echo "ok  $t" || echo "FAIL $t (see §1.0)"; done
# Stage 3b only. A tool counts only if it RUNS — under pyenv the shim is on PATH for every
# interpreter, so `command -v` says yes while the tool dies with "pyenv: <tool>: command not found".
for t in ansible-playbook ansible-lint yamllint; do
  if command -v $t >/dev/null 2>&1 && $t --version >/dev/null 2>&1; then echo "ok  $t"
  elif command -v $t >/dev/null 2>&1; then echo "warn $t is a pyenv SHIM ONLY (installed into another interpreter) — 'pyenv local <that version>' here, or let Stage 3b reinstall"
  else echo "warn no $t — Stage 3b installs it on demand (bootstrap-ansible.sh --ensure); not needed for a Terraform-only stack"; fi
done
command -v betterleaks >/dev/null || command -v gitleaks >/dev/null && echo "ok  secret scanner" || echo "FAIL no betterleaks/gitleaks (§1.0)"
command -v drawio >/dev/null && echo "ok  drawio (Stage 5 PNG auto-export)" || echo "warn no drawio CLI — Stage 5 degrades to manual PNG export + Mermaid mirror (§1.0)"
command -v openssl >/dev/null && echo "ok  openssl" || echo "warn no openssl — only needed for mTLS projects (mint-certs.sh)"
echo "== PostToolUse hooks (functional test — a present-but-dead hook looks identical) =="
HK=$( [ -f .claude/settings.json ] && echo .claude/settings.json || echo "$GUIDE/.claude/settings.json" )
# Select each hook by SUBSTRING, never by index: there is more than one hook now, and an
# index-based lookup would silently exercise the wrong one after any reordering.
pick() { python3 -c "
import json,sys
for e in json.load(open('$HK'))['hooks']['PostToolUse']:
    for h in e.get('hooks',[]):
        if '$1' in h.get('command',''): print(h['command']); sys.exit()
" 2>/dev/null; }
T=$(mktemp -d)
HC=$(pick 'terraform fmt'); printf 'a  =   1\n' > "$T/x.tf"
printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$T/x.tf" | sh -c "$HC" >/dev/null 2>&1
[ "$(cat "$T/x.tf")" = "a = 1" ] && echo "ok  fmt hook formats .tf on Edit/Write ($HK)" || echo "FAIL fmt hook is dead (no-ops silently) — it must read tool_input.file_path from stdin JSON; there is no \$CLAUDE_FILE env var"
# The ansible hook cannot be proven the same way. Its correct behaviour on almost every input
# is SILENCE — which is also exactly what a dead hook does, so a silence check alone is a rubber
# stamp. Two assertions instead: a structural one that catches the $CLAUDE_FILE class of death
# for BOTH hooks, and a real positive test that only runs when the linters are installed.
HA=$(pick 'ansible-lint --nocolor')
if [ -z "$HA" ]; then echo "warn no ansible lint hook in $HK (fine unless this is an Ansible project)"
else
  case "$HA" in
    *CLAUDE_FILE*)  echo "FAIL ansible hook reads \$CLAUDE_FILE — that env var does not exist; it can never fire" ;;
    *tool_input*)   echo "ok  ansible hook reads tool_input.file_path from stdin JSON" ;;
    *)              echo "FAIL ansible hook never reads the edited path — it can never fire" ;;
  esac
  # The hook is opt-in on BOTH configs: .ansible-lint (the ruleset) and .yamllint (without which
  # yamllint falls back to line-length 80 / everything-an-error and buries you in noise).
  mkdir -p "$T/p/ansible/roles/r/tasks"; : > "$T/p/.ansible-lint"; : > "$T/p/.yamllint"
  printf -- '- ansible.builtin.command: /bin/true\n' > "$T/p/ansible/roles/r/tasks/main.yml"   # unnamed task + no changed_when
  if command -v ansible-lint >/dev/null 2>&1; then
    ( cd "$T/p" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$T/p/ansible/roles/r/tasks/main.yml" | sh -c "$HA" >/dev/null 2>&1 )
    [ $? -eq 2 ] && echo "ok  ansible hook reports findings (exit 2 -> reaches Claude)" || echo "FAIL ansible hook stayed silent on a task with no name and no changed_when"
    ( cd "$T" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$T/p/ansible/roles/r/tasks/main.yml" | sh -c "$HA" >/dev/null 2>&1 )
    [ $? -eq 0 ] && echo "ok  ansible hook is opt-in (silent without .ansible-lint/.yamllint in cwd)" || echo "FAIL ansible hook fired in a project with no .ansible-lint"
    rm -f "$T/p/.yamllint"
    ( cd "$T/p" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$T/p/ansible/roles/r/tasks/main.yml" | sh -c "$HA" >/dev/null 2>&1 )
    [ $? -eq 0 ] && echo "ok  ansible hook needs .yamllint too (else yamllint noise at 80 cols)" || echo "FAIL ansible hook fired with .ansible-lint but no .yamllint"
  else
    echo "warn ansible hook NOT functionally tested — ansible-lint not installed (§1.0). Silence here proves nothing."
  fi
  rm -f "$T/p/ansible/roles/r/tasks/main.yml" "$T/p/.ansible-lint" "$T/p/.yamllint"
  rmdir "$T/p/ansible/roles/r/tasks" "$T/p/ansible/roles/r" "$T/p/ansible/roles" "$T/p/ansible" "$T/p"
fi
rm -f "$T/x.tf"; rmdir "$T"
echo "== spec template: inline copy vs file copy (they drift silently) =="
# /spec-architect has no Bash, so it cannot read the guideline repo's template and must carry an
# inline copy. Two copies drift: §8.1 was missing from the inline one, which is exactly the section
# /ansible-implement reads. Compare the heading lists mechanically.
diff <(sed -n '/^# Infra Spec/,/^## 11\./p' "$GUIDE/.claude/skills/spec-architect/SKILL.md" | grep -E '^#{1,2} ') \
     <(sed -n '/^# Infra Spec/,/^## 11\./p' "$GUIDE/knowledge/templates/infra-spec-template.md"   | grep -E '^#{1,2} ') \
  >/dev/null 2>&1 \
  && echo "ok  spec template headings match (inline == knowledge/templates/)" \
  || echo "FAIL spec template drift — /spec-architect's inline copy differs from knowledge/templates/infra-spec-template.md; diff the two heading lists"
echo "== spec MCP config =="
test -f ~/.claude/spec-mcp.json && { grep -q '<your-' ~/.claude/spec-mcp.json && echo "FAIL spec-mcp.json still has <your-> placeholders to fill (§1.4)" || echo "ok  spec-mcp.json filled"; } || echo "FAIL spec-mcp.json missing (§1.4)"
echo "== AWS creds (read-only MCP profile) =="
aws sts get-caller-identity >/dev/null 2>&1 && echo "ok  aws creds resolve" || echo "warn aws creds not resolving (Stage 1 pricing/WA + Stage 3 plan need them) — see aws-iam-mcp-setup.md"
```

All `ok`? You're ready for Stage 1. Any `FAIL` points at the section to fix.

---

## 2. Overview: 7 steps + 7 gates

| #   | Command                       | You receive                                             | Gate   | You decide                         | Next command                                    |
| --- | ----------------------------- | ------------------------------------------------------- | ------ | ---------------------------------- | ----------------------------------------------- |
| 1   | `/spec-architect <name>`      | `docs/specs/<name>.spec.md`                             | **G1** | Spec right?                        | create folder → `/init-project`                 |
| 2   | `/init-project`               | `CLAUDE.md`, `.mcp.json`, `.claude/`                    | **G2** | Detection right? fill `.mcp.json`? | `/add-dir` lib → `/iac-implement`               |
| 3   | `/iac-implement <spec> <env>` *(Terraform-only — skip if no `.tf`)* | Terraform code + `terraform plan`   | **G3** | Plan OK?                           | `terraform apply tfplan` **or** `/infra-review` |
| 3b  | `/ansible-implement <src> <dir>` *(optional — only if the stack has hosts)* | role/playbook + `--check --diff`      | **G3b** | Mapping + diff OK?                | **you** run the playbook twice (2nd = `changed=0`) → `/infra-review` |
| 4   | `/infra-review <env>`         | merged report → `docs/reviews/<env>-<date>.md` (stack-aware roster) | **G4** | go / fix / no-go                   | fix chosen items → apply → `/infra-document`    |
| 5   | `/infra-document <env>`       | `docs/infrastructure.md` + `infra.drawio` (one, or split into `infra-<slug>.drawio` views) + auto-exported PNG(s) + `README.md` | **G5** | doc accurate? diagram(s) correct + readable? | review doc + PNG(s), commit                     |
| 6   | `/secret-scan`                | scan result + guardrail (hook + CI)                     | **G6** | clean? real leak to rotate?        | `git push` (hook + CI re-scan)                  |

**Safety invariant:** `.claude/settings.json` (**copied** into the project by `/init-project` if the
project has none — not generated per-stack) hard-denies `terraform destroy`, `terraform apply
-auto-approve`, the common destructive `aws … delete/terminate/revoke` verbs, ad-hoc
`ansible <pattern> -m …`, and `ansible-vault decrypt`/`view` (which would print plaintext into the
transcript, and therefore into the model's context). Deny wins over allow. Neither
`terraform apply tfplan` nor `ansible-playbook` is in the allow list, so both **prompt for
permission** → you are the only one who presses "apply" or touches a host. Treat the list as a
speed-bump, not a security boundary: prefix matching cannot see through `bash -c`, `env`, or `xargs`. It **does** auto-allow read-only reads
(scanners, `terraform plan/validate`, and a broad AWS `describe*`/`list*`/safe-`get*` bundle) so
routine review/inspection doesn't prompt-churn — for a full `Bash(aws *)` bypass during `--live`, pair
it with a read-only profile (Step 4 "review the live stack").

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
CLAUDE.md          (tracked — shareable project guidance)
.claude/skills/    (devops-engineer, terraform-engineer, cloud-architect, postgres-pro, ...)
.claude/agents/    (infra-reviewer, cost-optimizer, security-auditor, incident-responder)
.claude/rules/     (security, terraform, docker, cicd, ...)
.claude/settings.json
.mcp.json          (gitignored — contains placeholders)
```

> `/init-project` adds **`.claude/` and `.mcp.json` to `.gitignore`** — the repo may be **public**, and
> the `.claude/` tooling is internal + regenerated per machine via `/init-project` (`--sync` to refresh).
> Only `CLAUDE.md` is tracked. (Private team repo? Remove `.claude/` from `.gitignore` to share it.)

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
- [ ] Commit whenever you're ready — your call. `.claude/` and `.mcp.json` are gitignored (only
      `CLAUDE.md` + your code/docs get committed).

➡️ Go to Step 3.

---

## Step 3 — `/iac-implement` (Gate G3)

**Goal:** turn the spec into Terraform by **reusing existing modules**, scaffold the environment
directory per convention, and stop at `terraform plan` for you to review.

### 1. Load the module library into the session

```
/add-dir $TF_MODULE_LIB
```

(this is the `custom-infrastructure` clone you set in §1.3 — the skill resolves the library from
`$TF_MODULE_LIB`, so use the same value here rather than a hardcoded path.)

(Optional) also load a sample env so Claude can mirror the composition style:

```
/add-dir <path-to-a-reference-env>   # OPTIONAL: any existing env dir (e.g. one under $TF_MODULE_LIB/environments/) to mirror the composition style; the tokyo-dev convention is also documented in rules/terraform.md
```

### 2. Run the command

```
/iac-implement docs/specs/care-hub.spec.md environments/dev-care-hub
```

- Arg 1 = spec path · Arg 2 = the env directory to create. (The module library is resolved from
  `$TF_MODULE_LIB` + the `/add-dir` in step 1 — it is **not** an argument to the command.)

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

   > **First-time only — create the state bucket before this real `terraform init`.** It's
   > provisioned out-of-band by the `create-tf-state-bucket.sh` bootstrap script (hardened S3:
   > block-public + versioning + SSE-KMS default + TLS-only + lifecycle; S3-native lock, no DynamoDB).
   > The script prints a `backend.tf` (commit) + a gitignored `backend-<env>.hcl` (bucket/region/profile).
   >
   > **For state holding secrets** (VPN PSK, DB master password, IAM keys), run it with
   > **`--enforce-kms --kms-key-id=<CMK ARN>`**. `--enforce-kms` **requires** a customer-managed key
   > (the default `alias/aws/s3` is rejected — it can't be scoped and pinning to it is meaningless):
   > it writes `kms_key_id` into the `.hcl` so Terraform actually writes **SSE-KMS** (not the SSE-S3
   > that `encrypt = true` alone silently falls back to), **and** adds a bucket policy denying any
   > `PutObject` not using `aws:kms` (a CMK ARN also pins the exact key + gives a scoped `kms:Decrypt`
   > key policy). The CMK must already exist (create it out-of-band, same as the bucket).
   >
   > **Full guide — both modes + the CMK-creation recipe:** [`terraform-state-backend.md`](terraform-state-backend.md).

   Then (once you confirm credentials/backend are ready):
   ```bash
   terraform init -backend-config=backend-<env>.hcl
   terraform plan -out=tfplan
   ```
6. **Installs the CI security gate** — `.github/workflows/iac-scan.yml` (idempotent, drift-aware).
   It re-runs fmt/validate/tflint/Checkov/Trivy on **every PR** touching `.tf` (defense-in-depth:
   local gate + server-side gate).
   - Mark its check **Required** in branch protection. The template ships with **no `paths:` filter**
     on purpose: a path-filtered workflow reports *no* status when skipped, GitHub cannot tell that
     apart from "not started", and a required check that can be skipped blocks any PR outside those
     paths forever — nothing failed, nothing to re-run. Every PR pays ~2-4 min instead; that is the
     cheaper side of the trade. Do not add the filter back (monorepo escape hatch in the template
     README: keep the trigger unfiltered, gate the expensive *steps*).
   - **Open one PR first** — GitHub's Required-check picker only lists checks it has already seen.
   - On a **private repo without GitHub Code Security**, the two SARIF uploads skip by design and
     Checkov's findings are read from the **run summary** instead of the Security tab. See
     [`templates/iac-scan/README.md`](templates/iac-scan/README.md).
   - The **first push to an empty repo does not trigger it** (no parent commit ⇒ no diff ⇒ the path
     filter matches nothing). Push a follow-up commit touching a `.tf`, or open a PR.

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

### 5. After G3 — apply → verify → teardown

The gates end at "you apply", but the 2026-07 Cognito E2E run proved the most valuable defects
only surface **after** apply (an aoss request-signing quirk, CloudTrail redacting Cognito
identities, an event-source-mapping activation race — none visible to fmt/tflint/checkov/trivy
or the plan). Treat this as part of Step 3, not an afterthought:

- **Functional validation — script it, don't click it.** Put a `scripts/e2e-test.sh` in the lab
  (pattern: read `terraform output` for endpoints; **poll with a timeout instead of failing
  fast** — eventually-consistent paths like CloudTrail→EventBridge legitimately take 20 s–3 min;
  include **negative tests** (no-auth → 401/403) and make the script **clean up its own test
  data**). Guard poll assertions against vacuous passes (`jq 'all(...)'` over an empty array is
  true — require `length >= 1` first). Keep the transcript as evidence
  (`docs/functional-tests.md`).
- **Post-apply IAM check.** On greenfield stacks the G3 Access Analyzer step can't see inline
  policies at plan time (they reference unknown values) — validate the **live** role policies
  after apply: `aws iam get-role-policy … | aws accessanalyzer validate-policy
  --policy-type IDENTITY_POLICY`. Don't validate trust policies as RESOURCE_POLICY (false
  "missing Resource" errors).
- **Teardown runbook (labs).** Same discipline as apply — plan first:
  ```bash
  terraform plan -destroy -out=tfplan-destroy   # review what dies
  terraform apply tfplan-destroy
  # spot-check nothing survived (adjust to your stack):
  aws cognito-idp list-user-pools --max-results 10 · aws opensearchserverless list-collections
  aws dynamodb list-tables · aws cloudtrail describe-trails · terraform state list  # → 0
  ```
- 💸 **Idle-floor warning — pausing ≠ free.** Some services bill a floor **every hour they
  exist, idle or not**: OpenSearch Serverless (~$6/day at 1 OCU), NAT gateways, ALBs,
  provisioned RDS. If a lab run pauses for hours/days (tokens, meetings, weekends), **destroy
  and re-apply later** — with state + code intact the rebuild is one `terraform apply`
  (~5 min in the Cognito lab). Budget guardrail for anything that must stay up: AWS Budgets
  alert at the lab ceiling (free).

---

## Step 3b — `/ansible-implement` (Gate G3b — optional)

**Goal:** turn a runbook into an idempotent role, verified as far as a `--check --diff` — then *you*
run it.

> **Skip this whole step** for a serverless or fully managed stack. The worked example in this guide
> (`care-hub`: ECS Fargate + Aurora + ALB + CloudFront) has no hosts to configure and never reaches
> G3b. It exists for the part Terraform cannot reach: what runs *inside* an EC2 instance or an
> on-prem box.

### 3b.1 When it applies

Terraform provisions the host; Ansible decides what runs on it. A request for cloud resources goes
back to `/iac-implement` — if a role is reaching for `amazon.aws.ec2_instance` in a Terraform-first
project, the boundary has been crossed.

### 3b.2 Run it

```bash
/ansible-implement docs/runbooks/<name>.md ansible/
```

`<source>` is a spec, an **ops runbook** (`docs/runbooks/*.md` — the richest source: numbered manual
steps map almost 1:1 to tasks), or an existing bash script.

### 3b.3 What Claude does

1. **Preflight** — resolves the guideline repo, then **installs any missing gate tool**
   (`bootstrap-ansible.sh --ensure`: only what is absent, never `--upgrade`). A gate is never
   skipped for a toolchain reason. Presence is tested by *running* the tool, because a pyenv shim
   is on PATH for every interpreter and `command -v` lies when the package sits in another version.
2. **Step→module map** — a table, presented *before* any YAML: source step → native module →
   idempotency mechanism. This is where the engineering judgment lives, so read it. A step that
   stays `command`/`shell` must justify itself and carry `creates:`/`removes:`/`changed_when:`.
3. **Scaffold** — role skeleton, `.example` twins for inventory and vars, the `vars`/`vault` split,
   and the supporting files copied from `knowledge/templates/ansible/` (`ansible.cfg`,
   `requirements.yml`, `.ansible-lint`, `.yamllint`, and the `ansible-scan.yml` CI gate).
4. **Verify ladder** — `yamllint` → `--syntax-check` → `ansible-lint --profile production` →
   `--check --diff --limit <one-host>`. Or in one shot:
   `.claude/skills/ansible-engineer/scripts/verify.sh ansible/ --limit <host>`.
   `--limit` is **required** unless you pass `--no-diff`; the script refuses to guess (exit 2).
   Exit `1` = a gate failed *or* a tool could not be installed; exit `3` = PARTIAL, gate 4 waived.
   Only `0` means every gate ran and passed.

### 3b.4 Gate G3b — you run the playbook

Claude never touches a host. After approving the diff, run it yourself — **twice**:

```bash
cd ansible
ansible-playbook site.yml --limit <host> --diff        # first real run
ansible-playbook site.yml --limit <host> --diff        # must report changed=0
```

Paste both back; Claude reads them and confirms or disproves idempotency. **A second `--check` does
not count** — check mode *skips* `command`/`shell`, which is precisely the task class that breaks
idempotency, so it can never surface the defect you are testing for.

> **`cd ansible` matters.** `ansible.cfg` is resolved against the current directory, never the
> playbook's. Running `ansible-playbook ansible/site.yml` from the repo root silently ignores
> `ansible/ansible.cfg` — inventory, `roles_path` and `host_key_checking` all revert to defaults.
> `ANSIBLE_CONFIG=` does not fix it: it loads the file but leaves the relative paths inside it
> resolving against your cwd.

**→ Then `/infra-review`** — G4 is the review gate for both stacks; it detects the Ansible tree and
fans out `ansible-reviewer` alongside the security auditor.

---

## Step 4 — `/infra-review` (Gate G4)

**Goal:** one prioritized go/no-go report from parallel reviewers, chosen by stack — then you decide.

### Run it

```
/infra-review environments/dev-care-hub            # normal re-review: single pass + auto baseline
/infra-review environments/dev-care-hub --deep     # first review / deep audit: loop-until-dry
/infra-review environments/dev-care-hub --live     # also cross-check the DEPLOYED stack (read-only)
```

Flags (you rarely need more than `--deep`):
- `--deep` — loop the finders until 2 dry rounds (one AI pass isn't exhaustive). Use on the **first review** + occasional deep audits.
- `--live` — **optional**; after the code/plan review, add a **read-only** pass against the *deployed* AWS stack (drift, resources created outside Terraform, live posture). Only useful once the env is applied — see below.
- `--baseline <report>` — force a specific prior report as the comparison (default: auto-detects the latest `docs/reviews/<env>-*.md`).
- `--no-baseline` — review with **no** comparison (drops the RESOLVED/NEW/STILL-OPEN labels).
- `--note "<what changed>"` — record what you just changed: it's written into the report **and** points the finders at that change (still full-scan). Use it on a re-review after editing the IaC.

### What each run does

1. **3 reviewers in parallel** (watch with `/workflows`): `security-auditor` (secrets/IAM/encryption/network/CI) · `infra-reviewer` (naming/tagging/pinning + resource waste) · `cost-optimizer` ($ savings). They **always full-scan** the whole env — no delta-skip, so a regression in a file you didn't touch is still caught.
2. **Synthesize → one report** (recommendation · severity counts · must-fix-before-apply · cost savings), saved to **`docs/reviews/<env>-<date>.md`** and shown in chat.
3. **Baseline labels** (on a re-review): the skill feeds the previous report as the baseline, so each finding is tagged **[RESOLVED] / [NEW] / [STILL-OPEN]** and the report leads with *"vs last run: N resolved, K new — regression: no"*. The first run has no baseline.

> Findings the spec lists under **Accepted risks** (`docs/specs/*.spec.md`) are still reported but **excluded** from the go/no-go counts — that's how a conscious decision stops blocking. Real defects stay **[STILL-OPEN]** every run until fixed.

### It costs ~700k tokens — plan the run, and resume instead of restarting

Measured on a real mixed repo: `--deep` spent 681k and lost rounds 2-3 to a session limit, a retry
spent 792k the same way, and a single-pass attempt spent 706k and lost **all four reviewers in round
1** — 0 findings for 706k tokens. One session rarely holds a whole review, so the stage is built to
run in pieces.

| Lever | Why |
|---|---|
| Run it **first** in a session | The budget is shared with everything already done. A review started after 500k of other work has 500k less to spend. |
| Drop `--deep` unless you need recall | One pass is right for a re-review; `--deep` is for a first audit or a periodic sweep. |
| Narrow the target | `environments/<env>` = Terraform only (3 reviewers); the repo root = both (4). Review the half you changed. |
| **Run one reviewer per session** | `args.only: ["security"]` today, `args.only: ["infra","ansible"]` + `args.priorFindings` tomorrow. The skill persists `docs/reviews/.partial-<env>.json` between them and merges + dedupes on the way in. |

> `resumeFromRunId` is NOT the resume mechanism here. It replays only agents that **completed** — a
> round-1 failure caches nothing and re-runs the whole thing at full price. The partial-state file is
> what carries work across sessions. Read the journal before assuming there is something to recover.

> `agent()` returns `null` for a dead agent and an unresolvable `agentType` alike, so the guard cannot
> tell a token limit from a missing definition. Check the run's `<failures>` block or `/workflows`
> before acting on its advice — reinstalling agents does nothing for a token limit.

### Optional: review the live stack (`--live`)

The 3 finders read **code + plan** — they can't see what actually got applied. Once the env is
**deployed** and you want the review to also check reality, add `--live`. It runs a **read-only** pass
that catches what static review structurally can't:

- **Drift** — `terraform plan -refresh-only` diff: console/CLI changes that aren't in code.
- **Resources outside Terraform** — `list-*` each service, diff against `terraform state list` (this
  is how the Cognito lab's stray aoss collection would have been caught earlier).
- **Live-only posture** — actual S3 public-access blocks, bucket/API-GW/aoss resource policies, real
  SG ingress, encryption state, and the IAM actually attached (also feeds the post-apply Access
  Analyzer step — Step 3 §5).

Live-only issues are tagged `[LIVE]` in a **"Live stack check"** section of the report. `--live` is
optional — skip it when the stack isn't applied yet or you're reviewing pure code. If creds are
missing or a read is denied it degrades gracefully to a code/plan review.

#### Permission prompts — you do **not** set anything up per review

A live review fires many AWS reads, so the natural worry is "must I edit `settings.json` and export a
profile every time?" **No.** The two pieces are already in place from setup — per review you just type
`/infra-review <env> --live`:

**Set once (already done):**
1. **The read-only allow bundle ships in `.claude/settings.json`** and `/init-project` copies it into
   every project. It auto-approves read-only verbs (`terraform plan/validate`, scanners, and a broad
   AWS `describe*`/`list*`/safe-`get*` set), so the common live reads don't prompt. You never touch it
   per review.
2. **The read-only profile lives in `.mcp.json`** — the same one you already configure after
   `/init-project` for the advisory MCP servers, per [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md). Its
   IAM boundary is read-only by construction (denies `kms:Decrypt`, `GetSecretValue`, `dynamodb` data
   reads, `s3:GetObject`, all mutations). Nothing extra to set up for `--live`.

**Per review:** nothing. The skill **reads the profile out of `.mcp.json` itself** and passes it as
`--profile <that>` on every live-read command — no `export`, no `settings.json` edit. Because that
identity can't mutate anything, the reads go as **wide** as needed with no risk (you never narrow
*which* reads run just to dodge prompts). The skill will **not** use the backend/apply profile
(`profile` in `backend-<env>.hcl`, e.g. `dev01-mfa` — full-access).

**Optional, if you want literally zero prompts** even for a read outside the shipped bundle: add one
line to `.claude/settings.local.json` (personal, gitignored — not the shared `settings.json`):
```jsonc
{ "permissions": { "allow": ["Bash(aws *)"] } }   // safe ONLY because --live runs under the read-only .mcp profile
```
`deny` always wins over `allow`, so the `terraform destroy` / `apply -auto-approve` guard still holds.

> ⚠️ **Never `--dangerously-skip-permissions`** for this — it also drops the destroy/apply deny guard.
> And `Bash(aws *)` is only safe because the live reads run under the read-only profile; do **not** add
> it globally if you routinely run `aws` under a full-access profile in the same project.

### 🚪 GATE G4 — you decide

Claude **STOPS** and asks: `[a] fix all Critical/High · [b] fix only the ones I pick · [c] no-go`.
On a fix it edits the code, **re-runs the affected scanner** (trivy/checkov), and shows the `git diff`
— **no apply, no commit**. `terraform apply tfplan` is always yours.

### Real usage — the loop

```bash
# 1) First review — deep, no baseline yet
/infra-review environments/dev-care-hub --deep
#   → docs/reviews/dev-care-hub-2026-06-04.md  ·  GO-WITH-FIXES · High 2 · Medium 3

# 2) Fix the 2 High (Claude edits + re-runs trivy/checkov; no apply/commit)

# 3) Confirm — plain single pass, baseline auto-detected
/infra-review environments/dev-care-hub
#   → "Change since last review: 2 resolved · 0 new · 3 still-open — regression: no"  →  GO
#     (the 2 High now show [RESOLVED]; the Mediums [STILL-OPEN])

# 4) Clean → you apply
terraform apply tfplan

# 5) Day-2: you add Redis. Edit .tf, then re-review WITH a note of what changed:
/infra-review environments/dev-care-hub --note "added ElastiCache Redis to the API tier"
#   → report opens: "Changes this round: added ElastiCache Redis …"  (+ finders focus there, still full-scan)
#   → [NEW][High] ElastiCache transit encryption off …   ← from your change; baseline re-confirmed the rest
```

- **`--deep` only on the first review** (or an occasional deep audit) — every confirm / Day-2 re-check is a plain single pass.
- **Changed the IaC? Re-review with `--note "<what changed>"`** — you never hand-edit the old report (it's regenerated); the note lands in the **new** report and points the finders at your change, while baseline labels the rest [RESOLVED]/[NEW]/[STILL-OPEN].
- A finding you **won't fix on purpose** → put it in the spec's **Accepted risks**, so it stops blocking (real defects stay [STILL-OPEN] until fixed). The report is a regenerated snapshot — never hand-edit it.

➡️ Next: `/infra-document` (Step 5, same session). Commit the IaC + saved review when you're ready.

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
2. Writes **`docs/infrastructure.md`** (8 sections, comprehension-first: overview → diagram (+ numbered
   key) → **how it works** walkthrough → components → network → environments → security → cost).
3. Hand-authors the diagram(s) under **`docs/diagrams/`** with AWS Cloud / Region / VPC / subnet
   groups (proven `mxgraph.aws4` styles). **Usually one combined `infra.drawio`** — but if a single
   diagram would overlap into an unreadable tangle, Claude **decides per project** to split it into
   focused views (`infra.drawio` = primary overview + `infra-<slug>.drawio` siblings; the *axis* of the
   split depends on your architecture — there's no fixed set of views). Each diagram is **gated through
   the shipped `validate-drawio.py`**: every stencil name checked against the AWS4 catalog (a wrong name
   renders as a blank icon with no error), plus overlap/bounds geometry lint and dangling-edge lint.
   Fixes and re-runs (caps at 5 attempts per diagram, then stops and reports the residual errors).
4. **Exports each diagram to PNG** (`infra.png`, and any `infra-<slug>.png`) with the drawio CLI
   (headless-safe fallback chain), then **looks at each PNG itself** (vision check: blank icons,
   clipped/colliding labels, mis-attached edges — and, for a split, that each view actually reads
   cleanly) and fixes it — up to 3 rounds per diagram.
5. Only if PNG export is **impossible** on this machine (no drawio CLI / no display): embeds the
   temporary Mermaid mirror in §2 + manual-export instructions, as before.
6. **Coverage check:** confirms every `module` in `main.tf` appears as a node in **at least one**
   diagram (union across all views when split) + a row in §4 — flags anything drawn-but-missing.
7. Creates/refreshes a top-level **`README.md`** — the public-facing entry point (overview, layout,
   prerequisites, deploy steps, CI gates, links to the docs). Won't clobber an existing README.

> **Missing icon? Claude draws a labeled placeholder box — it never omits the component.** The AWS4
> stencil catalog is nearly complete, but if a service has no icon, Claude draws it as a **dashed box
> labeled with the service name** (never drops it, merges it, or "draws around" it — that would hide a
> real resource). You'll spot the dashed boxes at review and swap in the right icon; the diagram stays
> *complete and honest* meanwhile. Rare in practice.

### 3. 🚪 GATE G5 — you approve

Claude **STOPS**. Your job:

- [ ] Open `docs/diagrams/infra.png` (**+ any `infra-<slug>.png`** if Claude split the diagram) — is
      the architecture right and each view readable? (validator + vision check already passed; the
      `.drawio` files are the editable sources if you want layout tweaks; any dashed labeled box is a
      no-stencil service you can swap an icon into)
- [ ] Review `docs/infrastructure.md` (accurate? gaps marked TODO?). Commit when you're ready.
- [ ] **Fallback only** (Claude reported PNG export failed): open the `.drawio`, compare with the
      Mermaid block in §2, export `infra.png` manually, delete the Mermaid block.

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
   ⚠️ On a repo with **no commits yet** (fresh lab, pre-first-commit), `git .` scans **0 bytes** and
   passes vacuously — run the `dir .` working-tree pass for the real verdict before that first commit.
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
# --- One-time setup (full sequence: §1.0 clone+install → §1.1 symlink → §1.3 var → §1.4 spec MCP → §1.5 verify) ---
GUIDE=~/Documents/Devops/claude-code-guideline   # set to YOUR clone of the guideline repo (§1.0)
# git clone <guideline-url> "$GUIDE"; git clone <custom-infra-url> ~/Documents/Devops/terraforms/custom-infrastructure
# install: terraform aws uv/uvx docker node python3 openssl drawio tflint checkov trivy betterleaks(or gitleaks)  (see §1.0)
# Stage 3b only (skip for a Terraform-only stack): "$GUIDE"/.claude/skills/ansible-engineer/scripts/bootstrap-ansible.sh --dry-run
mkdir -p ~/.claude/skills ~/.claude/workflows ~/.claude/agents
for s in init-project spec-architect iac-implement ansible-implement infra-review infra-document secret-scan; do
  ln -sfn "$GUIDE/.claude/skills/$s" ~/.claude/skills/$s
done
for wf in "$GUIDE"/.claude/workflows/*.js; do
  ln -sfn "$wf" ~/.claude/workflows/"$(basename "$wf")"          # /infra-review reads ~/.claude/workflows/
done
for a in infra-reviewer cost-optimizer security-auditor ansible-reviewer incident-responder; do
  ln -sfn "$GUIDE/.claude/agents/$a.md" ~/.claude/agents/$a.md   # reviewer agents for /infra-review
done
echo 'export TF_MODULE_LIB="$HOME/Documents/Devops/terraforms/custom-infrastructure"' >> ~/.bash_profile && source ~/.bash_profile
# then run the §1.5 "doctor" block to verify everything resolves before starting

# --- Spec step: open a session with ephemeral MCP (not global) ---
cp "$GUIDE/.mcp.spec.json" ~/.claude/spec-mcp.json         # once; then fill <your-*> placeholders
claude --mcp-config ~/.claude/spec-mcp.json                # spec session with advisory MCP
/spec-architect care-hub                                   # G1: build spec
#   → create folder, copy spec, cd, claude (NO flag — ephemeral MCP is gone)
/init-project                                              # G2: bootstrap
#   → fill .mcp.json, review CLAUDE.md, /exit && claude, commit
/add-dir $TF_MODULE_LIB
/iac-implement docs/specs/care-hub.spec.md environments/dev-care-hub   # G3: terraform plan
terraform apply tfplan                                     # you press it
bash scripts/e2e-test.sh                                   # functional verify (poll, negative tests, self-cleanup — Step 3 §5)
#   lab teardown when done: terraform plan -destroy -out=tfplan-destroy && terraform apply tfplan-destroy
# --- G3b: ONLY if the stack has hosts to configure. Skip for serverless/managed. ---
/ansible-implement docs/runbooks/<name>.md ansible/        # G3b: role + --check --diff
cd ansible && ansible-playbook site.yml --limit <host> --diff   # YOU run it...
cd ansible && ansible-playbook site.yml --limit <host> --diff   # ...twice; 2nd must be changed=0
/infra-review environments/dev-care-hub                    # G4: parallel review (add --deep = loop-until-dry)
#   add --live to also check the DEPLOYED stack read-only (drift + live posture; read-only profile → no prompts)
/infra-document environments/dev-care-hub                  # G5: living doc + validated drawio + auto-exported PNG
#   → review doc + infra.png, commit docs/  (fallback: export PNG + delete Mermaid manually)
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
- [ ] after apply: functional verify scripted + passing (poll, negative tests, cleanup) ·
      [ ] greenfield: live IAM policies through Access Analyzer · [ ] lab: teardown planned
      (idle-floor services bill hourly — Step 3 §5)

**G3b (after /ansible-implement — skip if the stack has no hosts)**

- [ ] step→module map agreed; every surviving `command`/`shell` justified and carrying
      `creates:`/`removes:`/`changed_when:` · [ ] `ansible-lint --profile production` clean (not
      SKIPPED — `verify.sh` exiting 3 is INCONCLUSIVE, not a pass) · [ ] `--check --diff` read line
      by line, against **one** host
- [ ] secrets vaulted or coming from Secrets Manager/SSM; `.example` twins committed, filled files
      gitignored · [ ] **you** ran the playbook twice and the second run reported `changed=0`

**G4 (after /infra-review)**

- [ ] No Critical left · [ ] High handled (or accepted with reason) · [ ] chosen cost savings
      applied · [ ] re-review clean · [ ] apply + commit
- [ ] deployed already? optionally `--live` (read-only drift + live-posture check; run under a
      read-only profile to skip prompts safely — Step 4 "review the live stack"). `--live` is
      Terraform/AWS-only — on an Ansible tree there is nothing for it to inspect
- [ ] mixed repo? the report names the stack it reviewed — check it actually covered both

**G5 (after /infra-document)**

- [ ] `infra.png` (+ any `infra-<slug>.png`) matches the architecture and each view is readable
      (auto-exported + vision-checked) · [ ] `infrastructure.md` accurate (gaps marked TODO) ·
      [ ] committed `docs/` · [ ] (fallback only) exported `infra.png` manually + deleted the Mermaid block

**G6 (after /secret-scan)**

- [ ] guardrail installed (hook + CI) · [ ] scan clean (or real leak removed **and rotated**) ·
      [ ] then `git push`

---

## 14. Troubleshooting

| Symptom                                                               | Cause / Fix                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/spec-architect` doesn't appear                                      | Not symlinked or not restarted. Check `ls -la ~/.claude/skills/spec-architect/SKILL.md`, then restart.                                                                                                                                                                                    |
| `/init-project` gives a generic result                                | Forgot to copy the spec into `docs/specs/` **before** running, or the folder is empty. Copy the spec and re-run.                                                                                                                                                                          |
| `/init-project` doesn't create `.mcp.json`                            | `.mcp.json` already exists → the skill skips Phase 5 (by design). Delete it to regenerate.                                                                                                                                                                                                |
| `/iac-implement` reports "library NOT LOADED"                         | You haven't `/add-dir`'d the custom-infrastructure folder. Add it and re-run.                                                                                                                                                                                                             |
| `MODULES.md` doesn't show a new module                                | Delete `MODULES.md` at the library root and re-run `/iac-implement` to regenerate.                                                                                                                                                                                                        |
| No MCP at the spec step (pricing/well-architected)                    | Forgot to launch the session with the flag. Exit and reopen: `claude --mcp-config ~/.claude/spec-mcp.json` (see §1.4). Spec works without MCP — you just lose real data.                                                                                                                  |
| MCP pricing/well-architected unresponsive                             | IAM user not set up ([`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)) or wrong profile in `~/.claude/spec-mcp.json` / `.mcp.json`.                                                                                                                                                         |
| `/workflows` shows no 3 agents                                        | Workflow tool unavailable in the session → the `infra-review` skill falls back to running the 3 agents sequentially.                                                                                                                                                                      |
| `Workflow "infra-review" not found` (only deep-research, code-review) | The workflow isn't at `~/.claude/workflows/`. Run the one-time setup (§1.1) to symlink it there — the skill runs it from `~/.claude/workflows/infra-review.js` (machine-independent, via `scriptPath`). Fallbacks: resolve via the symlinked skill dir, or run the 3 agents sequentially. |
| Claude tries to `terraform apply`                                     | Doesn't happen by design; `settings.json` also denies `apply -auto-approve`. If you see it, stop and report.                                                                                                                                                                              |
| Deny list (destroy/apply block) missing in the project                | `/init-project` only **copies** `settings.json` when the project **has none**; if a different one already exists it's not overwritten. Open `.claude/settings.json` and merge in the deny list from the guideline repo. `--sync` also **doesn't** touch this file.                        |
| `terraform init` backend error                                        | S3 backend not created / wrong profile. Create the state bucket + fix `backend.tf`, or validate with `init -backend=false` first.                                                                                                                                                         |
| Stage 5 reports "PNG export failed"                                   | No drawio CLI / no X server / Electron sandbox error. Install draw.io desktop (§1.0); headless machines: `apt install xvfb` (the skill auto-retries with `xvfb-run -a` and `--no-sandbox`). Worst case: export manually from draw.io — the doc keeps the Mermaid mirror until you do.       |
| Applied fine, but events/records aren't flowing                       | Usually eventual consistency, not a bug: CloudTrail→EventBridge takes 20 s–3 min; a new DynamoDB-stream mapping takes ~1 min to activate (and `LATEST` **skips** writes made before activation — prefer `TRIM_HORIZON` with idempotent consumers). Functional tests must poll with a timeout, never fail fast. |
| Long pause mid-run and the lab is burning money                       | Idle-floor services (aoss ≈$6/day, NAT, ALB, provisioned RDS) bill hourly while they exist. `terraform plan -destroy` → `apply tfplan-destroy`, resume later — state + code make the rebuild one apply (Step 3 §5).                                                                          |
| Every `.yml` edit comes back with a wall of lint findings | The PostToolUse ansible hook is firing where it shouldn't. It only runs when `.ansible-lint` exists in the project root — if the noise is real findings, fix them; if it is line-length/truthy noise, `.yamllint` is missing or not being read (copy it from `knowledge/templates/ansible/dot-yamllint`). Note `ansible-lint` embeds yamllint and reports it as `yaml[*]` **errors** under the production profile: make a rule advisory via `warn_list` in `.ansible-lint`, **not** `level:` in `.yamllint`. |
| `--syntax-check` fails with "couldn't resolve module/action 'amazon.aws.…'" | The collection isn't on the search path. Usually `collections_path` set in `ansible.cfg` (it **replaces** the default list rather than extending it, hiding `~/.ansible/collections`) — remove the key. Otherwise run `ansible-galaxy collection install -r requirements.yml`, and check `ansible --version` is ≥ 2.17 (our house floor). Note the pinned collections only declare `requires_ansible: >=2.15.0`, so a resolve failure here is more likely a missing install than a core-version mismatch — read what `ansible-galaxy collection list` actually shows. |
| `verify.sh` exits 3 | PARTIAL: gates 1–3 passed but gate 4 (`--check --diff`) was waived with `--no-diff`. Not a pass, and **not** enough for G3b — re-run with `--limit <host>` once a host is reachable. |
| `verify.sh` exits 1 saying "the verification gates cannot run" | A required tool is missing AND could not be installed. Read the `cause:` line: usually no virtualenv/pyenv/pipx (create one — it prints the two commands), or `--no-install` was passed. This is deliberately a FAIL, not a skip. |
| `pyenv: ansible-lint: command not found` — but `command -v` finds it | A pyenv **shim**: the tool was installed into a different pyenv version than the one this directory resolves to. `pyenv version-name` here vs where you installed; fix with `pyenv local <that version>` in the project, or re-run `bootstrap-ansible.sh --ensure` to install into the active one. This is why every check runs `<tool> --version` instead of trusting `command -v`. |
| `/infra-review` says "contains neither Terraform nor Ansible" | Wrong target. The preflight looks for `*.tf` and for `ansible.cfg` / `site.yml` / `roles/*/tasks/` / `playbooks/` / `group_vars/`. Point it at the repo root for a mixed repo, or at the env dir for Terraform only. |
| `/infra-review --live` still prompts on some AWS reads                 | The shipped `.claude/settings.json` bundle auto-approves the common read verbs, but a read outside it (or a stale copied `settings.json`) will prompt. Quick fix: add `"Bash(aws *)"` to `.claude/settings.local.json` (personal, gitignored) — safe because `--live` runs under the read-only `.mcp.json` profile. Never use `--dangerously-skip-permissions` (drops the destroy/apply guard). If it prompts because `.mcp.json` has **no** AWS profile, configure the read-only MCP profile ([`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md)) first. See Step 4 "review the live stack". |

---

## 15. FAQ

**Q: I want to rename a command (e.g. `/spec` instead of `/spec-architect`)?**
A: Rename the skill folder in the guideline repo + the `name:` field in `SKILL.md`, then fix the symlink.

**Q: Can I re-run a step?**
A: Yes. Each skill is independent. Re-running `/iac-implement` re-scaffolds/syncs; re-running
`/infra-review` confirms findings are gone. `/init-project --sync` refreshes installed
skills/agents/rules in the project after a `git pull` of the guideline repo.

**Q: Can Claude drive the whole pipeline for me (delegated run)?**
A: Yes — both E2E test runs (viewer-mtls 2026-06, cognito-user-search 2026-07) ran this way. What
changes: the pipeline skills are `disable-model-invocation` (only a human can type `/spec-architect`),
so in a delegated run Claude **reads each SKILL.md and executes its phases manually**; gate decisions
are self-approved **and recorded in the artifacts** (spec §9 for design decisions/accepted risks,
`docs/reviews/` for G4, `docs/functional-tests.md` for verification); when the session's working dir
isn't the lab repo, everything runs via absolute paths. You still explicitly authorize `apply`,
teardown, and any `git push` up front — those never happen implicitly.

**Q: Do I need a new session between steps?**
A: Only twice — Stage 1 → 2 (the new project folder needs its own `claude`), and the restart after
Stage 2 (to load `.claude/`). **Stages 3 → 4 → 5 → 6 run in one session**; staying in it lets the
`/infra-review` results flow into `/infra-document`. The G4 report is also saved to
`docs/reviews/`, so a fresh session still works. If context gets long, `/compact` (not a new session).

**Q: Does the pipeline auto-deploy?**
A: No. It stops at `terraform plan` (G3). You run `apply`. CI/CD deployment is the job of
`devops-engineer` (GitHub Actions OIDC) — kept separate so you stay in control.

**Q: What if the project isn't Terraform/AWS?**
A: `/spec-architect` and `/init-project` work for any stack (init detects it). For **configuration
management there is a full track**: `/ansible-implement` (G3b) authors and verifies, `/infra-review`
(G4) reviews it with the `ansible-reviewer` agent, `/infra-document` (G5) documents it in §4.1, and
`/secret-scan` (G6) was never stack-specific. `/iac-implement` itself remains specialized for
Terraform + this AWS module library — it is built on `TF_MODULE_LIB` and `MODULES.md`.

**Q: Terraform *and* Ansible in one repo — two reviews?**
A: No. One `/infra-review` at the repo root detects both and runs all four reviewers into a single
report. Pointing it at `environments/<env>` instead reviews only the Terraform under that path.

**Q: Difference between this file and `devops-workflow.md`?**
A: `devops-workflow.md` = short reference map. This file = detailed practical guide with an example.

---

## Related

- [`devops-workflow.md`](devops-workflow.md) — pipeline & gate map (quick reference)
- [`templates/infra-spec-template.md`](templates/infra-spec-template.md) — spec template
- [`setup-new-project.md`](setup-new-project.md) — `/init-project` & `--sync` details
- [`aws-iam-mcp-setup.md`](aws-iam-mcp-setup.md) — IAM user for MCP
- [`mcp-devops-setup.md`](mcp-devops-setup.md) — MCP server catalog
