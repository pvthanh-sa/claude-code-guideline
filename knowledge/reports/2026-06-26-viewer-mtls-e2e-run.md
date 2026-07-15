# E2E pipeline run — CloudFront **Viewer mTLS** blog + lab (2026-06-26)

Second full run of the blog (`blog-design-guide.md`) + DevOps (`pipeline-usage-guide.md`) workflows,
operated end-to-end by Claude. Topic: CloudFront **viewer mTLS** (client → CloudFront), the mirror of
the prior **origin mTLS** run. This report records how the run went and what to improve.

## What was produced

- **Blog (personal-homepage):** `knowledge/practice-logs/2026-06-26-cloudfront-viewer-mtls.md`
  (English, status: complete); `app/blog/cloudfront-viewer-mtls/{page.tsx,_toc.tsx}`; a 2nd card in
  `components/sections/blog-listing.tsx` (origin + viewer = two cross-linked posts, as requested).
- **Lab (terraforms/cloudfront-viewer-mtls):** spec, full native-HCL module
  (`cloudfront_viewer_mtls`: trust store + `viewer_mtls_config` + private S3 origin via OAC + 2
  buckets), env `dev-singapore`, `scripts/mint-certs.sh`, `docs/infrastructure.md` + `infra.drawio`,
  G4 review report, `TODO.md`, plus the standard `.claude/`/CI/hooks scaffold.
- **Gates:** G1 spec ✓ · G2 scaffold ✓ · G3 code + validate chain (fmt/validate/tflint/trivy 0
  HIGH-CRIT/checkov 41-pass) ✓, `plan` deferred (no creds) · G4 review **GO** ✓ · G5 docs ✓ ·
  G6 secret-scan clean (betterleaks, no leaks) ✓. No apply/commit/push (correct).

## What held up well

1. **infra-review arg-passing fix held.** Args passed as a JSON object `{path, spec}`; the workflow
   normalized them and the haiku preflight confirmed `resolvedPath` + 5 `.tf` files before fanning
   out. The reviewers audited the *correct* directory — the bug that wasted ~285k tokens last run did
   not recur.
2. **Accepted-risks-at-G4 honoring worked.** The synthesizer excluded all 5 spec §9a risks (WAF,
   self-signed CA, revocation, logs, TLS floor) from the counts and the verdict → clean **GO** with
   `mustFixBeforeApply: []`, while still listing them for re-validation. The feature added in the
   prior session functioned exactly as intended.
3. **File-first design survived a mid-run machine stop.** Every artifact is a written file, so after
   the crash nothing needed re-running — only ephemeral state (a `terraform init`, the background
   review workflow) would have, and both had already completed. Re-validation confirmed green.
4. **Native-provider verification paid off.** Step 0 (one scoped agent) found viewer mTLS is native
   (`aws_cloudfront_trust_store` v6.27, `viewer_mtls_config` v6.30); `terraform providers schema` +
   `validate` confirmed the *exact* nested schema — which differed from the agent's first guess
   (`source_arn`). Getting the real schema before writing HCL avoided a guess-and-fail loop.

## What to improve (concrete)

- **A — Don't copy a sibling's `.trivyignore` wholesale.** Scaffolding (S3) cloned the origin lab's
  `.trivyignore`, which suppressed ALB/SG/subnet rules that match nothing here *and* would have
  silently weakened the gate. G4 caught it; better to not introduce it. **Fix:** `init-project`/
  `iac-implement` should generate a *project-scoped* `.trivyignore` (or start empty and add entries
  only as real findings appear), each citing this project's spec.
- **B — Re-run the gate after acting on a review finding; don't trust a finding's premise.** The G4
  reviewer said to drop `AVD-AWS-0132` as "no matching resources" — but `trivy` proved it fires on
  both S3 buckets (SSE-S3, not CMK). Re-running trivy after the `.trivyignore` rewrite caught the
  regression; the rule was kept with a corrected justification. **Lesson worth encoding in the
  infra-review skill:** a finding can be factually wrong — verify before applying its remediation,
  and always re-run the relevant scanner afterward.
- **C — `blog-from-notes` Mermaid fallback renders as source, not a diagram.** The static `.tsx`
  blog pages have no Mermaid renderer, so the "use the Mermaid block" fallback (when no `infra.png`
  is exported) ships a code block of Mermaid *source*, not a picture. **Fix options:** wire a Mermaid
  component for blog pages, or have the fallback emit an ASCII diagram / a clearly-labelled
  placeholder `<BlogImage>` instead of raw Mermaid. (For this run the post ships the fallback; the
  TODO has the human export `infra.png` and re-run to swap it in.)
- **D — Reconcile the GitHub-Actions pinning standard.** G4 flagged tag-pinned actions as a Low
  (wants SHA pins), but the project's own `cicd` rule uses `@v4`-style tag examples. Pick one
  standard (SHA-pin + Dependabot, or tag-pin) and state it once, so reviewers stop re-flagging it.

## Notes

- **Leaner than the sibling by design:** S3+OAC origin, no VPC/ALB/EC2/ACM → ~$0 run-rate (the
  origin lab's ALB was 62% of its cost). Viewer mTLS terminates at CloudFront, so the origin is
  incidental.
- **cfn-lint stays unneeded.** Viewer mTLS being native (no CFN escape-hatch) confirms the earlier
  decision to drop the cfn-lint gate — this run did not re-justify it.
- **spec-MCP not loaded** (no pricing/WAFR servers this session) → cost numbers are flagged estimates
  in the spec and docs, as the guide already prescribes.
- **Companion cross-linking works well:** the viewer post links the origin post (and vice-versa is a
  one-line edit if desired), making "trust goes both ways" a coherent two-post narrative.

## Update (same day) — improvements A–D implemented

All four were applied to the workflow source (skills/rules are symlinked, so they take effect for
future runs):

- **A** → `iac-implement/SKILL.md`: a "`.trivyignore` — scope it to THIS project" block (justify per
  entry citing the spec; never copy a sibling's; re-run `trivy config` after editing).
- **B** → `infra-review/SKILL.md`: after a fix, **re-run the affected gate (not just `validate`)** and
  **verify a finding's premise against real tool output before applying its remediation**.
- **C** → `blog-from-notes/SKILL.md`: the generated `.tsx` pages have **no Mermaid renderer**, so the
  no-`infra.png` fallback must be an **ASCII diagram (` ```text `)** or a labelled placeholder, never a
  raw ` ```mermaid ` block. The shipped viewer-mTLS page was switched from a Mermaid block to ASCII.
- **D** → `rules/cicd.md`: tag-pin is the **minimum** (dev/lab); **SHA-pin + Dependabot for
  production-facing repos** (aligns with `security.md`); reviewers treat lab tag-pins as accepted.
