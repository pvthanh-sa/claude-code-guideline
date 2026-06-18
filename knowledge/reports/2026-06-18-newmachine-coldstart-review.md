# Cold-start (new machine) gap review — 2026-06-18

Adversarial review: 6 "new machine" personas (default-path, custom-path, second-user, binary/runtime,
doc-completeness, mid-pipeline) → each gap verified against the real files → synthesized. 32 candidate
gaps, dominated by one root cause. (Workflow `newmachine-gap-review` ran the Find+Verify; synthesis here.)

## Verdict: is §1.1 enough on a new machine? **NO.**

§1.1 only creates symlinks. On a fresh machine it produced **dangling symlinks silently** (`ln` doesn't
check the target exists) because nothing told the user to **clone the repo first**, and the pipeline also
needs a second repo cloned + ~10 CLIs/runtimes installed. The complete cold-start sequence must be:
**clone both repos → install tools → symlink (skills+workflow+agents) → set `TF_MODULE_LIB` → copy+fill spec MCP → verify (doctor)**.

## Confirmed gaps + fixes applied this session

### Critical — setup was incomplete (now fixed in pipeline-usage-guide §1)
1. **No "clone the repos" step.** §1.1 symlinked FROM `~/Documents/Devops/claude-code-guideline` but nothing cloned it there; same for `custom-infrastructure` (`TF_MODULE_LIB` pointed at an uncloned path). → **Added §1.0** with both `git clone` commands at the exact assumed paths.
2. **No binary/runtime prerequisites.** terraform, aws, uv/uvx, docker, node, tflint/checkov/trivy, betterleaks/gitleaks, xmllint never listed; MCP servers fail **silently** without uv/docker/node. → **§1.0 install table** (tool → needed-by → install), with a note on silent-vs-loud failure.
3. **§1.1 hardcoded the clone path as the symlink source** → non-default clone = dangling links, no error. → **Parameterized with `GUIDE=` + a dangling-symlink sanity check** (`readlink -f` per skill). Mirrored in the §12 cheat-sheet and `setup-new-project.md` §1.

### High
4. **`.mcp.spec.json` shipped a real AWS profile** (`phamvanthanh-claude-mcp-pham-thanh`), zero `<your-*>` placeholders → §1.4's "edit the placeholder" step had nothing to find; teammate's MCP auth fails silently; also a profile-name leak in a possibly-public repo. → **Restored `<your-aws-profile>`/`<your-aws-region>` placeholders; aws-pricing pinned to us-east-1.** §1.4 now `grep`s for `<your-` after copy.
5. **Reviewer agents not symlinked user-level.** §1.1 did skills+workflow only; `/infra-review` depended on `/init-project` having copied the agents → a security-light project could never get a clean G4 "go" (stuck in the new null-guard loop). → **§1.1 now symlinks `infra-reviewer/cost-optimizer/security-auditor/incident-responder` into `~/.claude/agents/`**; infra-review.js INCOMPLETE message points to both the user-level symlink and `/init-project`.
6. **Scanners + secret scanner not in setup** (only discoverable mid-pipeline). → folded into the §1.0 install table.

### Medium
7. **Hardcoded `/home/lg-vietnam007` + nonexistent Desktop path in `/add-dir` examples** (Step 3, cheat-sheet, devops-workflow). → replaced with `/add-dir $TF_MODULE_LIB` + an optional `<path-to-a-reference-env>` placeholder.
8. **No "verify setup / doctor" command** (verification scattered across 4 docs; nothing caught dangling symlinks or a `TF_MODULE_LIB` pointing at an uncloned dir). → **Added §1.5 "doctor"**: one block that PASS/FAILs every precondition (skills/workflow/agents resolve, module lib present, all CLIs, spec-mcp filled, aws creds).
9. **§1.3 set the var but didn't verify the dir exists.** → added `test -d "$TF_MODULE_LIB/modules"` verify line.
10. **spec-mcp.json is a copy (stale risk).** → §1.4 notes to re-copy when the template changes.
11. **uv/docker/node silent MCP failure**, **G5 PNG export tooling**, **xmllint absent** — all covered by the §1.0 table + §1.5 doctor; the skills already degrade loudly (this session's guards).

## Residual / lower-priority (not changed — by-design or low value)
- init-project Phase 5 catalog fallback list could add `~/dev`/`~/code` clone locations + honor a `GUIDELINE_REPO` override; the §1.1 `GUIDE` fix + correct symlink is the primary mitigation (readlink resolves wherever cloned).
- infra-review fallback-3 could run the 3 review prompts as plain sub-agents (no agentType) when named agents are absent — now less likely to bite since agents are symlinked user-level.
- §1.2 could state "an admin AWS profile must already exist in ~/.aws/credentials" as an explicit precondition.

## Verification
All 15 §1 bash blocks + 5 setup-new-project blocks pass `bash -n`; `.mcp.spec.json` valid JSON with 2 placeholders / 0 real profile; `infra-review.js` syntax OK.
