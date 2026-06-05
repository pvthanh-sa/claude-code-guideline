---
name: infra-document
description: 'Stage 5 of the DevOps pipeline. Generate a living infrastructure document for an environment — derives the architecture from the actual Terraform module wiring + spec, writes docs/infrastructure.md, an editable docs/diagrams/infra.drawio (AWS-grouped), and a temporary Mermaid block for verification. STOPS at human gate G5; never commits.'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash, Write
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
- `docs/diagrams/infra.drawio` — editable source diagram (one combined AWS-grouped diagram)
- A temporary **Mermaid** block inside `infrastructure.md` for cross-checking the `.drawio`

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

Build a component list: `module → AWS resource(s) → role → key inputs/outputs → which subnet/tier`.

## Phase 2: Write `docs/infrastructure.md`

Resolve the template from the guideline repo via the symlinked skill (same mechanism as
`/secret-scan` — the template is read live from the repo, not copied into projects; `readlink -f`
follows the symlink so it works from any project on any machine):

```bash
SK="$(readlink -f "${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/infra-document}" 2>/dev/null)"
GUIDELINE="$(dirname "$(dirname "$(dirname "$SK")")")"
TPL="$GUIDELINE/knowledge/templates/infra-document-template.md"
test -f "$TPL" && echo "template: $TPL" \
  || echo "ERROR: template not found — is the guideline repo present and the skill symlinked? (Guide §1.1)"
```

`Read` `$TPL` (10 sections) and fill it from Phase 1. Rules:
- State facts derived from code; if something isn't in the code/spec, mark it `TODO` — don't guess.
- §2 contains the diagram: a PNG reference **and** a temporary Mermaid block (see Phase 4).
- Link out rather than duplicate: spec, review report, runbooks, monitoring dashboards.

## Phase 3: Write `docs/diagrams/infra.drawio` (one combined diagram)

Create `docs/diagrams/` if needed. Hand-author **one** combined diagram following
[`drawio-reference.md`](drawio-reference.md) — the proven AWS4 stencil patterns:

- Nest groups: **AWS Cloud → Region → (Account) → VPC → public/private subnet → resources**
  (each child's geometry is relative to its parent via `parent=`).
- Use `mxgraph.aws4.resourceIcon` per service with the category fill colors from the reference
  (compute orange, networking purple, database blue/magenta, storage green, security red).
- Draw edges left→right (ingress → compute → data); number the main data-plane edges `① ② ③`,
  dash metadata/IAM edges. Add a title and a legend.
- Map every component from Phase 1 to exactly one node; wire edges from the Terraform output→input
  relationships you found in `main.tf`.
- If unsure of an exact `resIcon` name, use the labeled fallback box (reference §Special shapes)
  rather than a wrong stencil that renders empty.

Validate the file is well-formed before finishing. Use a parser that does **not** resolve external
entities or hit the network (avoids XXE / billion-laughs — drawio files need no DTD/entities):
```bash
# Preferred: libxml2's xmllint (no network, no external entities)
xmllint --nonet --noout docs/diagrams/infra.drawio && echo "drawio XML OK"
# Fallback if xmllint is unavailable (defusedxml hardens the stdlib parser):
python3 -c "import defusedxml.ElementTree as ET; ET.parse('docs/diagrams/infra.drawio'); print('drawio XML OK')"
```
(Do not use the plain `xml.dom.minidom` / `xml.etree` stdlib parsers — they are XXE-vulnerable by default.)

## Phase 3.5: Coverage check (diagram vs code)

Make sure the diagram didn't drop a component. List the module instances in the env's `main.tf` and
confirm each appears as a node in `infra.drawio` (and a row in §3 Components):

```bash
grep -nE '^[[:space:]]*module[[:space:]]+"' <env-dir>/main.tf
```

For every module found, verify there's a matching node + components row. **Flag any module missing
from the diagram** and add it — or note why it's intentionally omitted (e.g. a pure IAM/role module).
This catches "drew it but forgot X" before the human reviews at G5.

## Phase 4: Mermaid verification block (temporary)

Inside `infrastructure.md` §2, emit the **same** topology as a Mermaid `flowchart` so the human can
cross-check the `.drawio` without opening draw.io (guards against a malformed/incorrect diagram).
Wrap it with clear delete markers and a PNG placeholder:

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
user to delete it after they confirm the drawio and export the PNG.

## Phase 5: STOP at Gate G5

```
## Infrastructure doc ready for review (G5)

Written:
- docs/infrastructure.md
- docs/diagrams/infra.drawio   (drawio XML OK)
- Mermaid verification block embedded in §2 (temporary)

### Diagram summary: [N nodes, M edges; ingress → compute → data]
### Components documented: [list modules/resources]

---
👉 Next:
   1) Open docs/diagrams/infra.drawio in draw.io and check it matches the Mermaid block.
   2) Export it to docs/diagrams/infra.png, then delete the Mermaid verification block.
   3) Review docs/infrastructure.md, then commit (I do NOT commit).
   Re-run /infra-document anytime the infra changes — it's a living document.
```

**Do not commit.** Wait for the human.
