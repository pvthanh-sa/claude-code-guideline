---
name: claude-review-setup
description: 'Install or upgrade the Claude PR review kit in the current repository — a GitHub Actions workflow (anthropics/claude-code-action) that reviews every pull request automatically plus on-demand @claude, driven by a review protocol, stack profiles (Node/TS backend, frontend, PHP, Python, other languages, DB migrations, Terraform, Ansible, Kubernetes/Helm, Docker, GitHub Actions, security), domain-reviewer and verifier subagents, and a repo-context.md written from reading this codebase. Use when asked to set up, install, add, adopt, or upgrade Claude Code Review / Claude PR review / claude-code-action / an AI code-review workflow in a repo. Self-contained: the target repo needs no agents, skills, or rules of its own. Writes files only; never commits, pushes, or changes GitHub settings.'
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent
argument-hint: '[--upgrade] [--no-mention]'
---

# Claude Review Setup

Installs a self-contained Claude PR review into the repository you are in, fitted to that
repository. The kit carries all reviewer knowledge with it, so it works in repos that have no
`.claude/` agents, skills, or rules.

**What ends up in the target repo:**

```
.github/
├── workflows/claude-code-review.yml   # automatic review on every PR (read-only reviewer)
├── workflows/claude.yml               # @claude on demand (skipped with --no-mention)
└── claude-review/
    ├── README.md                      # kit-owned — how it works, setup, tuning, troubleshooting
    ├── .kit-version                   # kit-owned
    ├── protocol.md                    # kit-owned — review → verify → report
    ├── agents/{domain-reviewer,verifier}.md   # kit-owned — subagent prompts
    ├── profiles/<only the stacks this repo has>.md   # kit-owned
    └── repo-context.md                # REPO-OWNED — written by you now, never overwritten later
```

## Rules for this run

- **Write files only.** Never `git commit`, `git push`, create labels/secrets/variables, install
  the GitHub App, or change repository settings. List those for the human at the end.
- **Every fact in `repo-context.md` comes from a file you read in this repo** — cite paths. Never
  invent a convention, a hot spot, or a CI check. Leave a bullet out rather than guess.
- **Never overwrite an existing `.github/claude-review/repo-context.md`.** It belongs to the team.
- **Decide, don't present menus.** Use the defaults below and report each decision with its
  reason. Ask the user one question only when a value cannot be determined from the repo (in
  practice: which branches PRs target, when nothing in the repo says).
- **Don't touch unrelated changes.** Note `git status` first; leave other modified files alone.
- **The reviewer's rules come only from `.github/claude-review/`.** Never make `repo-context.md`
  tell the reviewer to read another working-tree file for its rules (docs, `copilot-instructions.md`,
  `.claude/skills/*`): the PR controls those files, and the workflow loads the guide from the base
  branch precisely so a PR cannot rewrite its own review. Read such files now and **summarise** what
  matters into `repo-context.md`, citing the path. (`CLAUDE.md` is fine to rely on — the action
  restores it from the base branch and loads it automatically.)
- **Never print a secret while reading.** When looking at config/env/credentials, list key names
  and line numbers only — e.g. `git grep -nE '(secret|password|passwd|token|key)[^=:>]*[=:>]' -- <path> | sed -E 's/([=:>][[:space:]]*).*/\1<redacted>/'` — instead of `cat`-ing the file.
- **Security problems you notice while reading** (a hard-coded secret, an unauthenticated endpoint, a
  race) go in a separate *Found while reading* section of the Step 7 report — never fixed here, and
  never copied into `repo-context.md` with the secret's value.
- Shell state does not persist between Bash calls — re-declare `KIT` in every call that uses it.

## Step 0 — Locate the kit and run the preflight

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/claude-review-setup}" 2>/dev/null)"
KIT="$(dirname "$(dirname "$(dirname "$SK")")")/knowledge/templates/claude-review"
bash "$SK/scripts/preflight.sh" --repo "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

If you were pointed at this file by path instead of invoking the skill, this file is
`<guideline repo>/.claude/skills/claude-review-setup/SKILL.md` — strip that suffix: the preflight is
`scripts/preflight.sh` next to this file and the kit is `<guideline repo>/knowledge/templates/claude-review`.

- **Any `FAIL` → stop.** Show the preflight output and the fix it prints; do not improvise a
  workflow without the kit. (`FAIL skill: … does not exist / DANGLING` only means the user-level
  link is missing or broken — the kit itself is fine; give the user the `--install` command.)
- `WARN` lines go into the Step 7 report (stale kit, uncommitted kit changes, `gh` unavailable).

## Step 1 — Preflight

```bash
cd "$(git rev-parse --show-toplevel)" && pwd
git remote get-url origin
git status --short | head -30
ls -la .github/workflows/ 2>/dev/null; cat .github/claude-review/.kit-version 2>/dev/null
gh repo view --json nameWithOwner,visibility,defaultBranchRef 2>/dev/null
```

- Not a GitHub remote → stop: the kit is GitHub Actions only.
- The default branch is GitHub's `defaultBranchRef`, not the local `origin/HEAD` (a local clone's
  `origin/HEAD` can point at whatever branch it was cloned from). Without `gh`, ask
  `git ls-remote --symref origin HEAD`, and only then fall back to `origin/HEAD`.
- Pick the **mode**:
  - `install` — no `.github/claude-review/` and no Claude workflow (unrelated CI/CD workflows don't
    change this).
  - `upgrade` — `.github/claude-review/.kit-version` exists (or `--upgrade` was passed).
  - `adopt` — no kit yet, but a hand-written `claude-code-review.yml` / `claude.yml` exists.
    **Read it fully first**: its target branches, auth input and secret name, `paths`/`paths-ignore`,
    review language, output-format demands, and any extra instructions in its `prompt` are the
    team's decisions and must survive (Step 3).

## Step 2 — Discover the repository (read-only)

Use `git ls-files` so ignored output (`dist/`, `node_modules/`) never counts.

```bash
git ls-files | wc -l
git ls-files | awk -F/ 'NF>1{print $1"/"$2} NF==1{print $1}' | sort | uniq -c | sort -rn | head -40
git ls-files | grep -E '(^|/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|pom\.xml|build\.gradle(\.kts)?|[^/]+\.csproj|composer\.json|Gemfile|Cargo\.toml|ansible\.cfg|Chart\.yaml|kustomization\.ya?ml|schema\.prisma|Dockerfile[^/]*|(docker-)?compose[^/]*\.ya?ml)$'
git ls-files '*.tf' | head -5; git ls-files | grep -Ei '(^|/)migrations?/' | head -5
git branch -r 2>/dev/null | head -20
```

Map signals to profiles (`$KIT/review/profiles/`):

| Signal | Profile |
|---|---|
| always | `security.md` |
| always (the kit adds workflows) | `ci-github-actions.md` |
| the app's own `package.json` depending on `@nestjs/core`, `express`, `fastify`, `koa`, `@hapi/hapi` (a `.js` file alone is not a signal) | `backend-node.md` |
| the app's own `package.json` depending on `react`, `next`, `vue`, `nuxt`, `@angular/core`, `svelte` | `frontend.md` |
| `composer.json`, `*.php` | `php.md` |
| `*.py`, `pyproject.toml`, `requirements*.txt` | `python.md` |
| `go.mod`, `pom.xml`, `build.gradle*`, `*.csproj`, `Gemfile`, `Cargo.toml` | `app-general.md` |
| migrations dir, `schema.prisma`, `*.entity.ts`, `*.sql`, deps on typeorm/prisma/sequelize/knex/drizzle/alembic/flyway/liquibase/mssql/pg/mysql2/oracledb — hand-run change scripts (`er/*.sql`, `sql/*.sql`) — **or SQL in application code**: `git grep -lE '\.query\(|createQueryRunner|\$queryRaw|knex\.raw|sequelize\.query|cursor\.execute|DB::(expr|query|raw|select)|whereRaw|orderByRaw|mysqli_query|->query\(|createNativeQuery|jdbcTemplate|db\.(Query|Exec)\('`. Route the files that hold SQL (`*.service.ts`, `logic/*.php`, repositories) here too, not only migrations. A `migrations/` dir holding only `.gitkeep` is not a signal | `database.md` |
| `*.tf` | `terraform.md` |
| `ansible.cfg`, `playbooks/`, `roles/*/tasks/main.yml` | `ansible.md` |
| `Chart.yaml`, `kustomization.yaml`, manifests with `kind: Deployment` | `kubernetes.md` |
| `Dockerfile*`, `compose*.yml` | `docker.md` |

**Vendored code is not a signal.** Ignore manifests and files under `vendor/`, `node_modules/`,
`public/assets/lib/`, `third_party/`, framework cores (`fuel/core/`, `fuel/packages/`), and `*.min.js`.
Files no profile fits (plain jQuery, shell, `templatefile` inputs) get a routing row to the nearest
profile — user-data and `*.tpl` rendered by Terraform → `terraform.md` — or "security only".

In a monorepo, check each workspace (`apps/*`, `packages/*`, `services/*`) — one repo can need
both `backend-node.md` and `frontend.md` with different globs.

Then read enough to write `repo-context.md` (Step 5): `README*`, `CLAUDE.md` / `.claude/CLAUDE.md`,
`CONTRIBUTING*`, `docs/` architecture notes, every file in `.github/workflows/` (what CI already
checks; which branches PRs target; how prod is released), lint/format/type configs (`eslint*`,
`.prettierrc*`, `tsconfig*.json` strictness, `ruff`/`flake8`, `.tflint.hcl`, `.ansible-lint`), and
the **core domain code** — the services/modules where money, stock, orders, auth, tenancy, or state
changes live. Look for how the code does transactions, locking, auth guards, validation, errors.

**When docs and code disagree, the code wins.** Write the convention the code actually follows,
and add a *Do not flag* line for divergence from the stale doc. Framework boilerplate (an upstream
README/CONTRIBUTING/TESTING/`.travis.yml` that came with a skeleton) is not team convention — check
`git log --format=%an -- <file>` and whether it describes this project before using it.

Repo-local Claude material (`.claude/skills/*`, `.github/instructions/*`, `.cursor/rules`, `.cursorrules`, …) often
encodes known bug classes — mine it for *Hot spots* and *Conventions*, summarised and cited (see the
rule above). Empty or stub files are ignored.

For a large repo (more than ~300 **source** files — the team's code only, not docs/config/lockfiles
or vendored files:
`git ls-files | grep -vE '(^|/)(vendor|node_modules|third_party)/|public/assets/lib/|fuel/(core|packages)/|\.min\.js$' | grep -cE '\.(ts|tsx|js|jsx|vue|py|go|java|kt|cs|php|rb|rs|tf)$'`), delegate the architecture survey to an
`Explore` subagent: ask for a `path → responsibility` map, the auth/validation/transaction/error
patterns with one example path each, and the riskiest modules — with citations.

## Step 3 — Decide

| Setting | How to decide |
|---|---|
| **Base branches** | 1) `adopt`/`upgrade`: keep the existing workflow's `branches`. 2) Else the `pull_request.branches` of existing **CI** workflows — ones triggered on `opened`/`synchronize` (the default types). A workflow on `types: [closed]` or gated on `merged == true` is a **deploy** trigger: ignore it here. 3) Else look at real PR targets: `gh pr list --state all --limit 50 --json baseRefName --jq 'group_by(.baseRefName)[]|{b:.[0].baseRefName,n:length}'`. Review **where feature PRs land** plus **the branch whose merge auto-deploys** (from the CD workflow). Leave out promotion-only targets that deploy nothing on merge (e.g. `staging`→`master` when prod is a manual dispatch) and branches no PR has targeted. No PR history → the default branch. 4) Still unclear → ask one question, recommending your best guess. |
| **Auth** | Keep the input + secret name the repo's existing Claude workflow uses. Else `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`. |
| **Review language** | 1) The language the user asked for. 2) The language an adopted prompt demands explicitly. 3) The language the team writes PR descriptions in (`gh pr list --state all --limit 10 --json title,body`; empty bodies → the titles). 4) English. A prompt merely *written* in English is not a demand. Always name the choice in the report — it is a one-line change in `repo-context.md`. |
| **Inline comments** | `on`, unless an adopted prompt demands a single summary comment only → `off` (protocol.md honours it). Say which in the report: inline comments are team-visible behaviour. |
| **Extra instructions** | Demands in an adopted prompt that `protocol.md` does not already cover → copy them into `repo-context.md` under *Review settings → Additional instructions*. Already covered by `protocol.md`: Summary · severity 🔴/🟡/🟢 · file + lines · wrong-vs-correct code · root cause · numbered reproduction steps with Expected/Actual · Overall Verdict table · "only confident findings". A demand that points at a file (e.g. "use CLAUDE.md") → apply the trusted-source rule above. |
| **paths-ignore** | Template default (`docs/**`, `LICENSE*`) — it only skips PRs whose files are *all* docs. Drop `docs/**` if docs are product content here (a docs site, API specs consumed by code). Do **not** add `**/*.md`: it would skip PRs that only change `.github/claude-review/*.md` (the reviewer's own rules) and Markdown prompt files. An adopted workflow with no filter still gets the default; say so in the report. |
| **@claude workflow** | Install `claude.yml` unless `--no-mention`. If one exists and is the stock `/install-github-app` file, replace it (keeping its auth). If it is customised, leave it and say so. |
| **Model / turns** | Leave the template's variable defaults (`opus`, 80 turns); they are tuned with repository variables later. |

## Step 4 — Resolve current action pins

The templates carry known-good SHA pins. Refresh them to the newest **exact** release (`vX.Y.Z`) —
not GitHub's "latest", which for claude-code-action is the floating `v1` tag:

```bash
for r in anthropics/claude-code-action actions/checkout; do
  tag=$(gh api "repos/$r/releases?per_page=30" --jq '[.[] | select(.draft|not) | select(.prerelease|not) | .tag_name | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))][0]') &&
  sha=$(gh api "repos/$r/commits/$tag" --jq .sha) && echo "$r $tag $sha"
done
```

Use each `sha` with a `  # <tag>` trailing comment (two spaces, as in the templates). If `gh` is unavailable or unauthenticated, keep
the template pins and say so in the summary.

## Step 5 — Write the files

```bash
KIT=...   # re-declare
mkdir -p .github/workflows .github/claude-review/agents .github/claude-review/profiles
cp "$KIT/review/protocol.md" "$KIT/review/README.md" "$KIT/review/.kit-version" .github/claude-review/
cp "$KIT/review/agents/"*.md .github/claude-review/agents/
# profiles: copy ONLY the ones selected in Step 2
cp "$KIT/review/profiles/security.md" "$KIT/review/profiles/ci-github-actions.md" .github/claude-review/profiles/
cp "$KIT/workflows/claude-code-review.yml" "$KIT/workflows/claude.yml" .github/workflows/   # skip claude.yml per Step 3
```

`Read` each copied workflow before editing it (the Edit tool requires it).

- **Upgrade:** kit-owned files are replaced. Remove an installed profile only if its stack is gone
  from the repo, and say which. Do **not** touch `repo-context.md`; instead, if Step 2 found a
  stack its routing table lacks, list the rows to add in the summary.
- **Workflows:** copy `$KIT/workflows/claude-code-review.yml` (and `claude.yml`) into
  `.github/workflows/`, then edit only the lines marked `ADAPT` plus the pins from Step 4. When you
  change an `ADAPT` value, rewrite its comment so it states the rule as it now stands (one line, no
  history) and keep the `ADAPT:` prefix — upgrades use it to find the repo's values. Keep the
  rest verbatim — it carries the security model (base-branch guide, read-only tools, fork/bot
  skip, concurrency). In `adopt`/`upgrade` mode, carry over every customisation found in Step 1.
- **Scope:** the kit installs the review and nothing else — do not add or change
  `.github/dependabot.yml`, other workflows, or repo settings. Action pins are refreshed by
  re-running this skill (Step 4).
- **repo-context.md** (install/adopt only): start from `$KIT/review/repo-context.md` and replace
  every `{{…}}` block with what Step 2 found:
  - *Routing* — one row per selected profile, with globs that match this repo's real paths.
  - *Architecture map* — 5–12 `path → responsibility` bullets.
  - *Conventions* — only what the code consistently does or the docs state, each with an example path.
  - *Hot spots* — where a bug costs most: shared counters/stock/money, retried handlers, auth and
    tenant scoping, migrations on big tables, IaC for stateful resources.
  - *CI checks* — what each workflow already enforces, so the reviewer doesn't repeat it.
  - *Do not flag* — style the linters own; intentional patterns you confirmed. Short is fine.
  Delete every `<!-- installer: … -->` comment. Aim for ~120 lines, hard ceiling ~150 — it is read on
every review. Citations and hot spots win over completeness of the architecture map.

Then make sure nothing written is gitignored:

```bash
git check-ignore -v .github/claude-review/protocol.md .github/claude-review/repo-context.md .github/workflows/claude-code-review.yml || echo "not ignored — ok"
```

## Step 6 — Validate (a gate: install the tool if missing, never skip)

```bash
# 1. workflow lint — local binary, else the pinned container, else go
if actionlint --version >/dev/null 2>&1; then AL=(actionlint)
elif docker info >/dev/null 2>&1; then AL=(docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12)
elif go version >/dev/null 2>&1; then AL=(go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12)
else AL=(false); echo "FAIL: cannot run actionlint — no binary, docker, or go"; fi
"${AL[@]}" .github/workflows/claude*.yml && echo "actionlint ok"
# 2. YAML parses
python3 -c 'import sys,yaml; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print("yaml ok")' \
  .github/workflows/claude*.yml
# 3. no placeholders left; pins are full SHAs
grep -n '{{\|installer:' .github/claude-review/repo-context.md && echo "PLACEHOLDERS LEFT" || echo "context ok"
grep -hn 'uses: ' .github/workflows/claude*.yml | grep -vE '@[0-9a-f]{40}[[:space:]]+# v' && echo "UNPINNED" || echo "pins ok"
# 4. every profile in the routing table exists, every glob matches tracked files
grep -o 'profiles/[a-z-]*\.md' .github/claude-review/repo-context.md | sort -u | while read -r p; do
  test -f ".github/claude-review/$p" && echo "ok $p" || echo "MISSING $p"; done
```

```bash
# 5. every glob in the routing/skip lists matches a file (-co: files written in this run count)
sed -n '/^## Routing/,/^## [^R]/p' .github/claude-review/repo-context.md |
  grep -oE '`[^` ]*[*/][^` ]*`' | tr -d '`' | grep -v '^profiles/' | sort -u |
  while read -r g; do n=$(git ls-files -co --exclude-standard ":(glob)$g" 2>/dev/null | wc -l); echo "$n  $g"; done
```

A `0` in a routing row means the glob is wrong — fix it. A `0` on the *Skip* line means the pattern
is gitignored or absent; such a file can never appear in a PR, so drop the pattern as noise. If actionlint can be run by none of the three routes, that is
a **FAIL** with the cause — report it, don't call the setup verified.

## Step 7 — Report and stop

Show `git status --short -uall` (new files are untracked, so `git diff` shows nothing for them).
For each workflow: `install` → `diff -u "$KIT/workflows/<file>" .github/workflows/<file>` (what you
adapted); `adopt`/`upgrade` → `git diff` of the file you replaced.
Then summarise:

1. **Mode** and **files** written.
2. **Decisions** with the reason for each: base branches, profiles (and the signal that selected
   each), review language, inline comments on/off, paths-ignore, auth, pins (tag + whether refreshed).
3. **Validation** results, one line per check.
4. **Found while reading** — security or correctness problems noticed in the repo, with `path:line` (omit if none).
5. **What the human does next:**
   1. Install the Claude GitHub App on the repo (https://github.com/apps/claude) and add the secret
      the workflow uses — `/install-github-app` in Claude Code does both; or `claude setup-token`
      then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. (Check what exists: `gh secret list`.)
   2. Protect every reviewed base branch (require PRs) if it isn't — the workflow trusts the guide on
      the base branch, which only holds when nobody can push to it directly. `gh secret list`
      printing nothing can mean "no secrets" or "no permission to list" — say which you can't tell.
   3. Optional label: `gh label create skip-claude-review --color BFD4F2 --description "Skip the automatic Claude review"`
   4. Review `repo-context.md` — it is the file that makes reviews fit this repo.
   5. Commit on a branch, open a PR, and merge it. **That PR is not reviewed:** the Claude GitHub
      App only runs a workflow whose file is identical on the repository's **default branch**, so the
      job succeeds with "Workflow validation failed … default branch" and posts nothing. Reviews
      start on the next PR once the workflow is on the default branch — if the default branch is not
      a reviewed base (e.g. default `main`, PRs into `develop`), say so: it needs to reach `main` too.
      Any later PR that edits a Claude workflow is skipped the same way.
   6. When a review is noisy or misses something, edit `repo-context.md` (*Do not flag*,
      *Conventions*, *Hot spots*) — not `protocol.md`, which upgrades overwrite.

Do not commit or push. Stop after the report.
