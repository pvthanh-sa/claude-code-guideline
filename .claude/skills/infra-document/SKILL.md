---
name: infra-document
description: 'Stage 5 of the DevOps pipeline. Generate a living infrastructure document for an environment — derives the architecture from the actual Terraform module wiring + spec, writes docs/infrastructure.md, one or more editable docs/diagrams/infra*.drawio (AWS-grouped; splits a dense stack into focused per-plane views when a single diagram would overlap) gated by a shipped stencil/geometry validator, auto-exports each to PNG (drawio CLI) and vision-checks the render(s) (Mermaid mirror only as fallback when export is impossible), plus a top-level README.md entry point. STOPS at human gate G5; never commits.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: '[env-dir]'
---

# Infra Document — Stage 5 (Living infrastructure documentation)

Produce the single source-of-truth document for an environment's infrastructure, plus an editable
architecture diagram. This is a **living document**: re-run it whenever the infra changes so the
doc and diagram stay accurate (derived from code, not hand-maintained).

> **Human gate G5:** This skill writes docs + a diagram and then **STOPS**. It does not commit and
> does not run `terraform apply`. Hand the document back for the human to review.

**Argument:** `$ARGUMENTS` first token = the environment dir to document (e.g.
`environments/dev-care-hub`). Default: current dir. Ask if ambiguous.

**Outputs (in the project):**
- `docs/infrastructure.md` — the document (template: `knowledge/templates/infra-document-template.md`)
- `docs/diagrams/infra.drawio` — editable source diagram, AWS-grouped, gated by the shipped
  `validate-drawio.py` (stencil catalog + geometry + edge lints). Usually **one** combined diagram;
  a dense stack may be **split into several** focused views (`infra.drawio` primary +
  `infra-<slug>.drawio` siblings — Phase 3 decides per project)
- `docs/diagrams/infra.png` (+ any `infra-<slug>.png`) — auto-exported render(s) (drawio CLI,
  Phase 3.7) that Claude vision-checks; **only if export is impossible** on this machine: a temporary
  **Mermaid** fallback block inside `infrastructure.md` + manual-export instructions instead
- `README.md` — top-level repo entry point (Phase 4.5; created or refreshed, never clobbered)

---

## Phase 1: Gather the facts (derive, don't invent)

Read the real sources so the document is *as-built*, not aspirational:

1. **Spec** — `docs/specs/*.spec.md` (architecture intent, environments, cost, SLO).
2. **Terraform** — the env dir's `main.tf` (which modules are instantiated and **how their outputs
   wire into each other** — this defines the real topology), `terraform.tfvars`, `locals.tf`,
   `backend.tf`, `providers.tf`.
3. **Module catalog** — `MODULES.md` at the custom-infrastructure library root (purpose + I/O of
   each module used).
4. **Review report** — read the latest `docs/reviews/<env>-*.md` (written by `/infra-review`);
   fold its resolved security/cost posture into §7. Pick the newest by date if several exist.
5. **Live outputs (optional)** — only if already applied and the user confirms: `terraform output`
   for real endpoints/ARNs. Never run apply.
6. **Configuration layer (only if an `ansible/` tree exists)** — `ansible/site.yml` (which roles run
   against which groups), `ansible/roles/*/defaults/main.yml` (each role's public interface),
   `ansible/inventory.ini.example` (the host groups), and any `-e "x=$(terraform output -raw x)"`
   invocation documented in the project README or runbooks. Terraform provisions the host; Ansible
   decides what runs on it, and a doc that stops at the instance leaves half the system undescribed.

Build a component list: `module → AWS resource(s) → role → key inputs/outputs → which subnet/tier`.
When a configuration layer exists, extend it with `ansible role → what it configures → which host
group → which values arrive from Terraform`.

## Phase 2: Write `docs/infrastructure.md`

Resolve the template from the guideline repo via the symlinked skill (same mechanism as
`/secret-scan` — the template is read live from the repo, not copied into projects; `readlink -f`
follows the symlink so it works from any project on any machine):

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/infra-document}" 2>/dev/null)"
GUIDELINE="$(dirname "$(dirname "$(dirname "$SK")")")"
TPL="$GUIDELINE/knowledge/templates/infra-document-template.md"
REF="$SK/drawio-reference.md"        # ships next to SKILL.md; used in Phase 3
VALIDATOR="$SK/validate-drawio.py"   # Phase 3 deterministic gate
CATALOG="$SK/aws4-stencils.json"     # allowlist of valid mxgraph.aws4.* names
EXPORTER="$SK/export-diagram.sh"     # Phase 3.7 PNG export (headless-safe)
# GUARD: stop loudly (don't just warn) if the guideline repo didn't resolve — otherwise Phase 2
# proceeds with no template and Phase 3 with no stencil reference, silently degrading both.
test -f "$TPL" || { echo "ERROR: doc template not found at '$TPL' (resolved from '$SK') — is /infra-document SYMLINKED from the guideline repo, not copied? (Guide §1.1)"; exit 1; }
test -f "$REF" || { echo "ERROR: drawio-reference.md not found at '$REF' — guideline skill dir incomplete."; exit 1; }
test -f "$VALIDATOR" || { echo "ERROR: validate-drawio.py not found at '$VALIDATOR' — guideline skill dir incomplete (git pull the guideline repo?)"; exit 1; }
test -f "$CATALOG"   || { echo "ERROR: aws4-stencils.json not found at '$CATALOG' — guideline skill dir incomplete."; exit 1; }
test -f "$EXPORTER"  || { echo "ERROR: export-diagram.sh not found at '$EXPORTER' — guideline skill dir incomplete."; exit 1; }
echo "template: $TPL"; echo "drawio ref: $REF"; echo "validator: $VALIDATOR"; echo "exporter: $EXPORTER"
```

`Read` `$TPL` (8 sections) and fill it from Phase 1. The template is **comprehension-first** — a
reader should finish §1–§3 with a correct mental model, then use §4–§8 as reference. Rules:
- State facts derived from code; if something isn't in the code/spec, mark it `TODO` — don't guess.
- **§1 Overview** — include the **"big picture"** paragraph: what enters, what happens, what comes
  out, and the 2–4 main building blocks, in **plain language with no resource names/jargon**. A
  newcomer reads only this and gets the gist.
- **§2** holds the diagram (PNG ref; a temporary Mermaid block appears **only** when PNG export
  failed — see Phase 4), a **"How to read this diagram"** line (shapes/colors/numbered edges — see
  Phase 3), and a one-line **numbered-path key**
  (`① → ② → ③ …`) that decodes the diagram's edges. There is **no separate data-flow section** — that
  key plus the §3 walkthrough (which references the same numbers) covers it. **If Phase 3 split the
  diagram**, §2 leads with `infra.png` (the overview) and then lists each sibling PNG with a one-line
  "what this view shows" — so the reader knows which picture answers which question.
- **§3 How it works (architecture walkthrough)** — the section that makes the infra *click*. This is
  the most important content in the doc; do not reduce it to a table. **Format for scanning, not an
  essay** — a DevOps/SA should skim the bold labels and bullets and get it:
  - Structure as a few **labeled blocks** (e.g. one bold lead-in per subsystem/phase, plus a final
    **"Key design decisions"** block). Use **short bullets**, not dense multi-line paragraphs.
  - Group by **subsystem or by flow**, not by Terraform module.
  - For each major part answer three things: **what it is · why it's here · what it connects to.**
  - Call out **key design decisions and the non-obvious** ("X is the handoff between the two halves",
    "Y exists only so Z passes its check", "single-AZ on purpose — it's a dev lab").
  - **Name the same components shown in the diagram** and **weave the diagram's ① ② ③ numbers into
    the bullets**, so this section doubles as the flow explanation (no separate data-flow section).
  - Keep it tight — a handful of labeled blocks, a few bullets each; push the exhaustive list to §4.
- §4 Components is the **reference table**; §3 explains, §4 enumerates — don't duplicate prose into
  the table.
- **§4.1 Configuration management** — include this subsection **only when the project has an
  `ansible/` tree**; omit it entirely otherwise (a Terraform-only project's doc must come out
  byte-identical to before this existed). One row per role: *role · what it configures · host group ·
  values taken from Terraform*. Then one line naming the **seam** — which `terraform output` values
  are piped in with `-e` at run time — because that seam is the single most misunderstood part of a
  Terraform + Ansible estate, and it is invisible in both the `.tf` and the role on its own.
  Provisioning belongs in §4; what runs *inside* the host belongs here.
- Link out rather than duplicate: spec, review report, dashboards.
- The template intentionally has **no Operations/runbook or change-log section** — this doc describes
  what the infrastructure *is*, not how to operate it. Keep ops/runbooks in their own doc.

## Phase 3: Write the diagram(s) — decide one vs several by readability

Create `docs/diagrams/` if needed. `Read` `$REF` (resolved + existence-checked in Phase 2).

**Decide first — and reason about it per project: one combined diagram, or several?** The default is
**one** `infra.drawio`, and for a small/simple stack that's the right answer. But a single diagram that
crams unrelated concerns into one frame becomes an unreadable tangle on a larger stack — edges cross
node labels, cross-cutting services clutter the main flow, and the vision check can't rescue a layout
that is fundamentally too dense. When that's the case, **split it**.

There is **no fixed set of views and no universal split** — *how* to divide is itself a judgment call
that differs from project to project. Look at **this** architecture, find its natural seams, and split
along whichever axis makes each resulting diagram tell **one coherent story** with minimal crossing
edges. Think about which axis serves the reader best before drawing; possible axes (illustrative, **not**
a checklist to fill): the request/data path · deploy & supply chain (CI/CD) · observability & security
overlay · per application tier · per bounded service group · per region/environment. A stack with no
deploy pipeline gets no deploy diagram; don't reproduce another project's split just because it existed.

Rules when you do split:
- **`infra.drawio` / `infra.png` stays the canonical primary view** (the overview a reader opens
  first — usually the request/data path + network). Keep that exact name.
- Siblings are **`infra-<slug>.drawio` / `infra-<slug>.png`** where `<slug>` names that view's concern
  (e.g. `infra-deploy`, `infra-observe`, `infra-data`, `infra-network` — pick what fits your split).
- **Each diagram must stand alone**: redraw the shared anchors (VPC, compute, DB, ALB) as light context,
  then overlay only that view's nodes + edges.
- Give each a **title naming its concern** and a **legend that cross-links the siblings** ("Detail
  views: …"; "see infra.png for the request path") so the set reads as one document.

> Example (illustrative, **not** a template): a stack *might* split into an overview (request path +
> network), a CI/CD view, and an observability/security view — but only if those planes are actually
> busy enough to warrant it. Yours may split on a different axis, or not at all — decide from your own
> topology, and keep it to one diagram when one is legible.

Now hand-author each diagram following `$REF` — the proven AWS4 stencil patterns:

- Nest groups: **AWS Cloud → Region → (Account) → VPC → public/private subnet → resources**
  (each child's geometry is relative to its parent via `parent=`).
- Use `mxgraph.aws4.resourceIcon` per service with the category fill colors from the reference
  (compute orange, networking purple, database blue/magenta, storage green, security red).
- Draw edges left→right (ingress → compute → data); number the main data-plane edges `① ② ③`,
  dash metadata/IAM edges. Add a title and a legend.
- In a **single** diagram, map every component from Phase 1 to exactly one node. In a **split**, every
  component appears on **at least one** diagram (shared anchors intentionally repeat as light context);
  wire edges from the Terraform output→input relationships you found in `main.tf`.
- **Missing stencil ⇒ labeled fallback box; NEVER omit, merge, or simplify to dodge it.** First check
  **`aws4-stencils.json`** (the allowlist the validator enforces — grep it) for the real name. If the
  service genuinely has no stencil, you **MUST** still draw the component — as a **labeled fallback box**
  (a rectangle with the **service name as its text**, reference §Special shapes), marked distinct
  (`dashed=1`) so it's easy to spot. **Do not** drop the component, fold it into a neighbor, or "draw
  around" the gap — a diagram that hides a real resource because its icon was missing is a **defect**.
  Completeness beats icon fidelity: a labeled box the operator can swap later is correct — the dashed
  box + label makes it self-evident at review, so **don't enumerate the placeholders anywhere** (no
  summary list). The catalog is nearly complete, so this should be rare — when it happens, **box it,
  never shortcut**.
- **Write the matching "How to read this diagram" line into §2** of `infrastructure.md` — explain
  the conventions you actually used (nesting, numbered solid vs dashed edges, category colors) so a
  reader can decode the picture without guessing. The diagram and this legend must agree. If you split,
  §2 leads with `infra.png` and links the sibling PNGs with a one-line "what each view shows".

Then run the **deterministic gate** on **every** diagram you wrote — same fix-and-re-run loop as
checkov/trivy in Stage 3:

```bash
for d in docs/diagrams/infra*.drawio; do
  echo "== validating $d =="
  python3 "$VALIDATOR" "$d" --catalog "$CATALOG"
done
```

- Exit **0** = pass (address WARNs where reasonable). Exit **1** = findings: **fix every ERROR it
  prints and re-run** — unknown stencil names (they render as a BLANK glyph with no error, the
  silent failure this gate exists for), sibling overlaps, children outside their parent container,
  dangling edges. Cap at 5 fix-and-re-run attempts **per diagram**; if still failing, STOP and report
  the residual errors — never proceed with a failing diagram.
- Exit **2** = tooling problem (file/catalog missing) — report it honestly; do not claim the
  diagram is validated.
- XML safety is built in: the validator prefers `defusedxml` and otherwise uses a hardened parser
  that rejects `<!DOCTYPE`/`<!ENTITY` (XXE / billion-laughs guard). No xmllint needed.

## Phase 3.5: Coverage check (diagram vs code)

Make sure no component was dropped. Enumerate the components the code declares and confirm each
appears as a node in **at least one** diagram (and a row in §4 Components) — coverage is the **union**
across all `infra*.drawio` when you split.

The enumeration source depends on the stack. **Never run the Terraform branch unguarded** — on an
Ansible-only project `main.tf` does not exist, and a bare `grep` there exits 2 with
`No such file or directory`, which silently degrades the whole coverage gate to "nothing to check":

```bash
# Terraform: module instances are the components.
if [ -f "<env-dir>/main.tf" ]; then
  grep -nE '^[[:space:]]*module[[:space:]]+"' "<env-dir>/main.tf"
else
  echo "no main.tf — not a Terraform target; using the configure-track source below"
fi

# Ansible (or a mixed repo): the components are the ROLES and the host GROUPS they run against.
if [ -f ansible/site.yml ]; then
  # '-?' because `hosts:` sits under `- name:` with no dash of its own, while `role:` carries one.
  grep -nE '^[[:space:]]*-?[[:space:]]*(role:|hosts:)' ansible/site.yml
  ls -d ansible/roles/*/ 2>/dev/null
  grep -nE '^\[' ansible/inventory.ini.example 2>/dev/null || true   # host groups
fi
```

**At least one branch must produce output.** If both are empty the target holds neither stack and the
diagram cannot be coverage-checked — say so plainly rather than reporting a vacuous pass.

For every component found, verify there's a matching node + components row. **Flag any one missing
from the diagram** and add it — or note why it's intentionally omitted (e.g. a pure IAM/role module).
This catches "drew it but forgot X" before the human reviews at G5. A component whose icon wasn't in
the catalog still counts as covered **only if** it's drawn as a labeled fallback box — a missing
stencil is **never** a valid reason to omit a node.

## Phase 3.7: Export PNG + vision self-check

Render **each** validated diagram to the PNG the doc references (and the blog pipeline consumes) —
export and vision-check every `infra*.drawio`, not just the overview:

```bash
for d in docs/diagrams/infra*.drawio; do
  bash "$EXPORTER" "$d" "${d%.drawio}.png"
done
```

**Exporter exit 0** → `Read` **each** exported PNG (you can see it) and check it against the Phase 1
component list. The whole reason to split is readability, so the vision check matters *most* here —
verify each view is genuinely legible, not just correct:
- every icon renders a real glyph — a flat colored square with **no symbol AND no text** = wrong
  stencil name (fix it). A dashed box **with a service-name label** is an intentional fallback (§Special
  shapes), not a defect — leave it as-is;
- no clipped or colliding labels (edge labels overlapping node labels is the common failure);
- every edge visually attaches to its intended nodes; containers labeled and nested correctly;
- the picture matches the architecture — **nothing missing** (a component skipped because its icon was
  unavailable is a defect — draw it as a labeled fallback box instead), nothing invented;
- **if you split:** each view still reads cleanly (if one is *still* an overlapping tangle, the split
  axis was wrong — reconsider it, don't just ship a dense picture); the title + sibling cross-links are
  present so the set hangs together.

On any issue: `Edit` the XML → re-run the validator → re-export → re-`Read`. Max **3 rounds per
diagram**; if issues remain after that, keep the best PNG and list the residual visual issues in the
G5 summary.
(If the PNG is too large to inspect comfortably, re-export at scale 1:
`bash "$EXPORTER" docs/diagrams/infra.drawio docs/diagrams/infra.png 1`.)

**Exporter exit 1 or 2** (no drawio CLI / every attempt failed) → record the printed reason and
take the **fallback path** in Phase 4 (manual-export instructions + Mermaid mirror). Never fake or
skip the PNG silently.

## Phase 4: Diagram reference in §2 (Mermaid = fallback only)

**Export succeeded (default):** §2 references the real render — **no Mermaid block**:

```markdown
## 2. Architecture diagram

![Infrastructure](diagrams/infra.png)
<!-- Auto-exported from diagrams/infra.drawio (validated + vision-checked). Re-run /infra-document after infra changes. -->
```

**If Phase 3 split the diagram**, §2 leads with the overview and lists the sibling views (each PNG +
one line on what it shows):

```markdown
## 2. Architecture diagram

**Overview — request path & network**
![Infrastructure overview](diagrams/infra.png)

**Detail views**
- Deploy & supply chain (CI/CD): ![Deploy](diagrams/infra-deploy.png)
- Observability & security: ![Observability](diagrams/infra-observe.png)
<!-- Auto-exported from diagrams/infra*.drawio (validated + vision-checked). Re-run /infra-document after infra changes. -->
```
(Use whatever view names your split actually produced — the two above are illustrative, not fixed.)

Keep the "How to read this diagram" line and the numbered-path key (Phase 3) — those stay regardless.

**Export failed (fallback):** state why export failed (one line, the exporter's message), then emit
the **same** topology as a Mermaid `flowchart` so the human can cross-check the `.drawio` without
opening draw.io (guards against a malformed/incorrect diagram). Wrap it with clear delete markers
and a PNG placeholder:

````markdown
## 2. Architecture diagram

![Infrastructure](diagrams/infra.png)
<!-- ^ PNG not exported yet. Source: diagrams/infra.drawio -->

<!-- VERIFICATION DIAGRAM — delete after confirming infra.drawio (then export drawio → infra.png) -->
```mermaid
flowchart LR
  subgraph AWS["AWS Cloud / ap-northeast-1"]
    subgraph VPC["VPC"]
      cf[CloudFront] --> alb[ALB]
      alb --> ecs[ECS Fargate]
      ecs --> rds[(Aurora PostgreSQL)]
    end
  end
```
<!-- END VERIFICATION DIAGRAM -->
````

The Mermaid must mirror the `.drawio` exactly (same nodes + edges). It is **disposable** — tell the
user to delete it after they confirm the drawio and export the PNG manually
(`drawio -x -f png -o docs/diagrams/infra.png docs/diagrams/infra.drawio`; headless: prefix
`xvfb-run -a`; Electron sandbox errors: add `--no-sandbox`).

## Phase 4.5: Project README (repo entry point)

Write a top-level `README.md` — the **entry point** a reader (or a public visitor) sees first. Keep
it **short**: it orients and links out; `docs/infrastructure.md` holds the depth (don't duplicate).
**If `README.md` already exists, don't clobber it** — refresh only the pipeline-managed sections (or
show a diff and ask). Derive everything from the same facts as Phase 1.

Structure:
```markdown
# <project> — <one-line what-it-is>

<2–3 sentence overview: what this provisions and why. Plain language.>

## Stack
<key services / tools — one line>

## Layout
- `environments/<env>/` — Terraform root(s)   ·   `modules/` — reused modules
- `docs/specs/` — design spec   ·   `docs/infrastructure.md` — **architecture & diagram (start here)**
- `docs/reviews/` — security/cost review reports

## Prerequisites
<terraform version, AWS profile/creds, TF_MODULE_LIB if modules are vendored, tflint/checkov/trivy for local scans>

## Deploy
```bash
cd environments/<env>
terraform init -backend-config=<backend>.hcl
terraform plan -out=tfplan
terraform apply tfplan
```

## Security / CI
- IaC scan gate: `.github/workflows/iac-scan.yml` (fmt/validate/tflint/checkov/trivy on every PR)
- Secret scan gate: `.github/workflows/secret-scan.yml` + local pre-push hook
- Never commit `.mcp.json` / `backend-*.hcl` (gitignored).
```

Adjust sections to what actually exists (omit Deploy specifics you can't derive; mark TODO rather
than guess). This is **public-facing**, so no account IDs, ARNs, or secrets in the README.

## Phase 5: STOP at Gate G5

**Default (PNG exported):**

```
## Infrastructure doc ready for review (G5)

Written:
- docs/infrastructure.md
- docs/diagrams/infra.drawio   (validator PASS: 0 errors, M warnings)
- docs/diagrams/infra.png      (auto-exported, vision-checked ✓ — or list residual visual issues)
- [if split: also docs/diagrams/infra-<slug>.drawio + .png per view, each validated + vision-checked]
- README.md   (repo entry point — created/refreshed)

### Diagram summary: [N nodes, M edges; ingress → compute → data; if split: one line per view]
### Components documented: [list modules/resources]

---
👉 Next:
   1) Open docs/diagrams/infra.png (+ any infra-<slug>.png) — is the architecture right and each view
      readable? (the .drawio files are the editable sources; re-run /infra-document or the exporter
      after editing them; any dashed labeled box = a service with no AWS4 icon, swap it if you like)
   2) Review docs/infrastructure.md — does §1–§3 make the infra clear on a single read?
   Re-run /infra-document anytime the infra changes — it's a living document.
```

**Fallback (export failed):** same summary, but state the export-failure reason, list the
`Mermaid verification block embedded in §2 (temporary)` line instead of the PNG line, and the
Next steps revert to the manual flow: open `infra.drawio` in draw.io → check it matches the
Mermaid block → export `docs/diagrams/infra.png` → delete the Mermaid block.

**Do not commit.** Wait for the human.
