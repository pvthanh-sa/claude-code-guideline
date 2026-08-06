# draw.io authoring reference (AWS4 stencils, and the built-in set for everything else)

Use this to hand-author a **valid, good-looking** `.drawio` file with proper AWS grouping. These
exact style strings are proven to open cleanly in draw.io / the VS Code Draw.io extension. Copy the
patterns; only change `id`, `value`, `parent`, and `mxGeometry`.

## Golden rules
1. **File skeleton:** `<mxfile><diagram><mxGraphModel><root>` with cells `id="0"` and `id="1"`
   (the base layer) first. Every other cell has `parent="1"` or a group id.
2. **Nesting via `parent`:** AWS Cloud → Region → Account → VPC → subnet → resources. A child's
   `mxGeometry` x/y is **relative to its parent**, not the page.
3. **One combined diagram** (per this project's convention): a single `<diagram>` page.
4. **Escape** `&` as `&amp;`, `<` as `&lt;`, newlines in labels as `&#xa;`.
5. **Sizes:** resource icons `78×78`; groups sized to contain children with ~40px padding.
6. Keep ids human-readable (`vpc`, `ecs_api`, `aurora`) so edges are easy to wire.
7. **Only names in `aws4-stencils.json` (same dir) render.** `validate-drawio.py` enforces this —
   an unknown `resIcon`/`grIcon` draws a **blank glyph with no error**. When a service has no
   catalog entry, draw it as the **labeled fallback box** (§Special shapes) — **never omit or simplify
   the component to avoid a missing icon**; the validator always allows the box, and the operator swaps
   in the right icon later.
8. **Where this project departs from a house default, draw the default too.** A box that records only
   the choice made cannot be read by anyone who does not already know the rule it is an exception to —
   `no AWS identity here` is a non-sequitur on a project with no AWS in it. Naming the deviation
   (`Vault, NOT the house Secrets-Manager default`) reads as an apology and still teaches nothing.
   Draw the **preference order**, then mark the position:

   ```
   Secrets — in order of preference
   1  Cloud secrets service (SSM / Secrets Manager) — the default
   2  Ansible Vault (vars/vault split) — only where there is no cloud identity
   HERE: 2.  group_vars/all/vault + .vault_pass 0600, both gitignored
   ```

   The reader learns what to reach for first **and** why this one could not, which is what makes the
   diagram worth reading on the next project. Same shape for any constrained choice — a manual step
   that has an automatable form elsewhere, a fallback stencil, a pinned-by-tag action in a lab. State
   the standard; mark where you are.

## Group containers
Same style string for every group — only `grIcon`, colors, and `value` change. Keep the long
`points=[...]` list verbatim (it defines connection points).

```
points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=<GRICON>;strokeColor=<COLOR>;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=<COLOR>;dashed=<0|1>;
```

| Group | `grIcon` | stroke/font color | dashed |
|-------|----------|-------------------|--------|
| AWS Cloud | `mxgraph.aws4.group_aws_cloud_alt` | `#232F3E` | 0 |
| Region | `mxgraph.aws4.group_region` | `#147EBA` | 1 |
| Account | `mxgraph.aws4.group_account` | `#CD2264` or `#1E88E5` | 0 |
| VPC | `mxgraph.aws4.group_vpc` (official 2025 sidebar: `group_vpc2` + `#8C4FFF`) | `#248814` | 0 |
| Security group | `mxgraph.aws4.group_security_group` | `#DD3522` | 1 |
| Auto Scaling group | `mxgraph.aws4.group_auto_scaling_group` | `#ED7100` | 1 |

**Subnets — there is NO `group_public_subnet` / `group_private_subnet` stencil** (they render a
blank corner). The official draw.io sidebar reuses `group_security_group` with `grStroke=0` and a
tinted fill. Use these exact suffixes (same `points=[...]` prefix as above):

```
Public subnet:  shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#7AA116;fillColor=#F2F6E8;verticalAlign=top;align=left;spacingLeft=30;fontColor=#248814;dashed=0;
Private subnet: shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#00A4A6;fillColor=#E6F6F7;verticalAlign=top;align=left;spacingLeft=30;fontColor=#147EBA;dashed=0;
```

## Resource icons
One style string; change only `resIcon` and `fillColor`. Label goes in `value` (use `&#xa;` for line breaks).

```
sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=<FILL>;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=11;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=<RESICON>;
```

### Common services (resIcon + fill color by category)

| Service | `resIcon` | `fillColor` | Category color |
|---------|-----------|-------------|----------------|
| ECS / Fargate | `mxgraph.aws4.ecs` | `#ED7100` | Compute orange |
| EC2 | `mxgraph.aws4.ec2` | `#ED7100` | Compute orange |
| Lambda | `mxgraph.aws4.lambda` | `#ED7100` | Compute orange |
| Application Load Balancer | `mxgraph.aws4.application_load_balancer` | `#8C4FFF` | Networking purple |
| CloudFront | `mxgraph.aws4.cloudfront` | `#8C4FFF` | Networking purple |
| API Gateway | `mxgraph.aws4.api_gateway` | `#E7157B` | App-integration pink |
| VPC (icon) | `mxgraph.aws4.vpc` | `#8C4FFF` | Networking purple |
| NAT / Internet gateway | `mxgraph.aws4.nat_gateway` / `mxgraph.aws4.internet_gateway` | `#8C4FFF` | Networking purple |
| Route 53 | `mxgraph.aws4.route_53` | `#8C4FFF` | Networking purple |
| RDS / Aurora | `mxgraph.aws4.rds` (Aurora: `mxgraph.aws4.aurora`) | `#2E27AD` | Database blue |
| DynamoDB | `mxgraph.aws4.dynamodb` | `#2E27AD` | Database blue |
| ElastiCache | `mxgraph.aws4.elasticache` | `#C925D1` | Database magenta |
| S3 | `mxgraph.aws4.s3` | `#7AA116` | Storage green |
| ECR | `mxgraph.aws4.ecr` | `#ED7100` | Compute orange |
| CloudWatch | `mxgraph.aws4.cloudwatch_2` | `#E7157B` | Mgmt pink |
| Secrets Manager | `mxgraph.aws4.secrets_manager` | `#DD344C` | Security red |
| KMS | `mxgraph.aws4.key_management_service` | `#DD344C` | Security red |
| WAF | `mxgraph.aws4.waf` | `#DD344C` | Security red |
| SNS | `mxgraph.aws4.sns` | `#E7157B` | App-integration pink |
| SQS | `mxgraph.aws4.sqs` | `#E7157B` | App-integration pink |

### Special shapes
- **IAM:** `resIcon=mxgraph.aws4.identity_and_access_management` (NOT `…_iam` — that name doesn't
  exist and renders blank); a role can also use the dedicated stencil `shape=mxgraph.aws4.role`.
- **User/actor:** `shape=mxgraph.aws4.user;fillColor=#232F3E` (size `60×78`)
- If unsure of an exact `resIcon` name, grep **`aws4-stencils.json`** first (`validate-drawio.py` flags
  unknown names and suggests the closest match). If the service genuinely has **no** stencil, fall back
  to a **labeled box** — never guess a stencil name (renders blank) and **never omit the component**.
  Clean fallback style (validator always allows it), with the **service name as the label** and a
  dashed border so it's easy to find and swap later:
  `rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#FFFFFF;strokeColor=#232F3E;fontColor=#232F3E`.
  **Rule: a missing icon is drawn as a labeled placeholder box, not skipped.** Dropping, merging, or
  "drawing around" a real resource to avoid a missing icon makes the diagram wrong — the dashed box +
  label is self-evident at review, so the operator swaps in the right icon (no need to enumerate them).

## Non-AWS stacks — use the BUILT-IN stencils, do not draw plain boxes

A stack with no AWS services still gets icons. draw.io ships several non-AWS shape libraries and the
CLI exporter renders them with **no download, no network, no licensing question**. Reaching for
plain labelled rectangles because "there is no AWS here" produces a wall of text that nobody reads —
and it is not necessary.

**Verified on the shipped draw.io CLI** (2026-08-05). These render:

| Shape | `shape=` value | Use for |
|---|---|---|
| stacked server | `mxgraph.networks.server` | a managed host / VM |
| laptop | `mxgraph.networks.laptop` | the control node, an operator workstation |
| monitor + keyboard | `mxgraph.networks.terminal` | a console, an interactive session |
| brick wall + flame | `mxgraph.networks.firewall` | host firewall, security boundary |
| padlock | `mxgraph.networks.secured` | a secret, a vault, an encrypted file |
| cloud | `mxgraph.networks.cloud` | the internet, an external service |
| document | `mxgraph.azure.file` | a config file, a rendered report |
| VM tile | `mxgraph.azure.virtual_machine` | a VM where a flat tile reads better than a tower |
| stacked disks | `mxgraph.gcp2.repository` | a git repo, an artifact store |
| cylinder | `mxgraph.cisco.routers.router` | a router / network device |
| tower PC | `mxgraph.cisco.computers_and_peripherals.pc` | a workstation, when `laptop` is wrong |
| shield-ish block | `mxgraph.cisco.security.firewall` | an alternative firewall glyph |

**These silently render as a plain rectangle** — the library is not bundled. Do not use them:
`mxgraph.rack.*` · `mxgraph.veeam.*` · `mxgraph.networks.rack_server` ·
`mxgraph.networks.certificate` · `mxgraph.networks.firewall_2` · `mxgraph.azure.gear` ·
`mxgraph.azure.shield` · `mxgraph.azure.checkmark`

### Verify a shape before you commit to it

An unbundled shape does not error — it draws an empty box with your label inside, which looks
*almost* right and ships. Test first, in one file, and look at the PNG:

```bash
cat > /tmp/shapetest.drawio <<'EOF'
<mxfile><diagram name="t"><mxGraphModel dx="800" dy="600" pageWidth="600" pageHeight="160"><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="s1" value="candidate" style="shape=mxgraph.networks.server;html=1;verticalLabelPosition=bottom;verticalAlign=top;" vertex="1" parent="1">
  <mxGeometry x="40" y="30" width="60" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>
EOF
"$SK/export-diagram.sh" /tmp/shapetest.drawio /tmp/shapetest.png
# then LOOK at it — a bare rectangle means the library is absent, pick another shape
```

### Icon or box — pick per node, not per diagram

Use an **icon** for anything with a physical or conceptual counterpart the reader already pictures:
a host, a laptop, a firewall, a lock, a file, a repo.

Keep a **plain box** for anything that is a *declaration or a statement*: variable scope, an
inventory group, a caveat, a numbered-path key, the legend. Those are text by nature, and an icon
on them is decoration that costs vertical space.

A useful ratio: icons on the nouns the reader can point at, boxes on the rules they have to read.

### Label placement with icons

An icon is square-ish and small; its label does not fit inside. Always:

```
verticalLabelPosition=bottom;verticalAlign=top;    # label under the icon
labelBackgroundColor=#FFFFFF;                      # keeps it readable over an edge
```

Without those two, the label is drawn *inside* the glyph and becomes unreadable — a mistake that
survives review because at 100% zoom it still looks like an icon with a caption.

## Gotchas (silent-rendering mistakes)
- **Unknown stencil = blank glyph, no error.** Verified empirically: an invalid `resIcon` renders
  a flat colored square; an invalid `grIcon` renders a border with no corner icon. The validator +
  the catalog exist because of this.
- **`strokeColor` on resource icons stays `#ffffff`** exactly as in the style template — other
  values can make the white glyph invisible against the fill.
- **Name variants are not interchangeable** — `group_vpc` and `group_vpc2` both exist (different
  corner art), but `group_public_subnet`, `identity_and_access_management_iam`,
  `simple_notification_service`, `simple_queue_service`, `elastic_container_registry`,
  `virtual_private_cloud_vpc` do NOT exist (use: subnet style above, `identity_and_access_management`,
  `sns`, `sqs`, `ecr`, `vpc`). Don't guess `_2`/`_alt` variants — check the catalog.
- **Catalog-valid can still render wrong** — `authenticated_user` passes the validator but draws a
  solid dark square (no glyph) with the standard resourceIcon style (found live, 2026-07 Cognito
  lab). For human/actor nodes use `user` / `users`. Only the Phase-3.7 vision check catches this
  class; when it flags a blank icon, swap the stencil rather than fighting the style.
- **Edges that exit an icon's bottom-center slice through its own label** (labels render below the
  icon). Exit from a side (`exitX=0/1`) or a corner and route around; watch label collisions in
  shared corridors — give long dashed edges explicit waypoints + a label offset.
- **Growing a box moves it onto other people's edges, and nothing warns you.** An `<mxPoint>`
  waypoint is an absolute canvas coordinate that does not follow the boxes it was drawn to avoid, so
  a resize + restack silently routes a line through a box — and an edge *label* parked there lands
  on top of the text (`INSIDE ansil⑥/`). Only the rendered PNG shows it. After any geometry change,
  test every waypoint against every box rect before exporting; child coordinates are relative to the
  parent container, so compare in absolute terms:

  ```python
  # abs rect of a child = parent origin + child x/y. Then: is any waypoint inside any box?
  hits = [n for n, (bx, by, bw, bh) in boxes.items() if bx <= x <= bx+bw and by <= y <= by+bh]
  ```

  Reroute into the corridor between one row's tallest bottom and the next row's top, and keep that
  corridor free — it is where every long horizontal edge wants to live.

## Edges (connections)
```
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;fontSize=10;
```
- **Main data plane:** add `strokeColor=#1E88E5;strokeWidth=2;` and number the label `① ② ③ …`.
- **Metadata / read-only / IAM grant:** add `dashed=1;`.
- Edge cell: `edge="1" source="<id>" target="<id>"` with a child `<mxGeometry relative="1" as="geometry"/>`.
- For elbows, add `<Array as="points"><mxPoint x=".." y=".."/></Array>` inside the geometry.

## Title & legend
- **Title:** `text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;fontStyle=1;fontSize=17` (place above the cloud group, e.g. `y="-20"`).
- **Legend:** `rounded=1;whiteSpace=wrap;html=1;fillColor=#F5F5F5;strokeColor=#666666;fontColor=#333333;fontSize=10;align=left;spacingLeft=10;verticalAlign=top;spacingTop=8` — explain solid vs dashed edges and the numbering.

## Minimal valid skeleton (copy, then add cells)
```xml
<mxfile host="app.diagrams.net" version="26.0.9">
  <diagram name="Infrastructure" id="infra-overview">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- AWS Cloud group -->
        <mxCell id="cloud" value="AWS Cloud" style="...group_aws_cloud_alt...#232F3E..." parent="1" vertex="1">
          <mxGeometry x="40" y="40" width="1500" height="900" as="geometry" />
        </mxCell>
        <!-- Region group (child of cloud) -->
        <mxCell id="region" value="ap-northeast-1 (Tokyo)" style="...group_region...#147EBA...dashed=1" parent="cloud" vertex="1">
          <mxGeometry x="40" y="50" width="1420" height="820" as="geometry" />
        </mxCell>
        <!-- VPC, subnets, resources nest further; edges reference resource ids -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Layout tips
- Left→right data flow: ingress (CloudFront/ALB) on the left, compute in the middle, data stores on the right.
- Put public-facing resources in the **public subnet** group, app/data in **private subnet**.
- Cross-cutting services (KMS, Secrets Manager, CloudWatch, WAF) can sit in the account/region band, connected by dashed edges.
- Don't overlap icons; give each ~120px horizontal spacing.

## Splitting into multiple diagrams (when one is too dense)

**The *decision* — whether to split and along which axis — lives in the skill (Phase 3) and is a
per-project judgment; there is no fixed set of views.** This section is only the *drawing* mechanics
once you've decided to split. The goal is that each file is a clean, self-contained picture — not a
slice that only makes sense next to the others.

- **Each `.drawio` is a complete standalone diagram** — its own full skeleton (`mxGraphModel` → AWS
  Cloud → Region → VPC → subnets), its own title, its own legend. A reader opening just one PNG must
  understand it without the others.
- **Redraw the shared anchors as light context.** The resources that every view touches (VPC, the
  compute host, the DB, the ALB) appear in each diagram so it stands alone — draw them with the normal
  stencils but keep them visually secondary (fewer/dashed edges), then **overlay only that view's
  plane** (its own nodes + its own numbered edges). Repetition of anchors across views is intended, not
  duplication to avoid.
- **Number edges *within* each view** — each diagram restarts its own `① ② ③` for the path it shows
  (the overview's request path, the deploy view's CI/CD path, etc.). Don't try to share one numbering
  across files.
- **Title names the concern; legend cross-links the siblings.** Put the view's scope in the title
  (`… · DEPLOY & SUPPLY CHAIN`) and, in the legend, point to the other PNGs by filename
  (`Detail views: infra-deploy.png · infra-observe.png`; `see infra.png for the request path`) so the
  set reads as one document.
- **Filenames:** `infra.drawio`/`infra.png` is the canonical primary (the overview). Siblings are
  `infra-<slug>.drawio`/`infra-<slug>.png` where `<slug>` names the view (`infra-deploy`,
  `infra-observe`, `infra-data`, `infra-network`, … — whatever your chosen split is).
- Validate and vision-check **every** file (the skill loops over `infra*.drawio`). If a split view is
  *still* an overlapping tangle, the split axis was wrong — reconsider the axis rather than shipping a
  dense picture.
