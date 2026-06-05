# draw.io authoring reference (AWS4 stencils)

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
| VPC | `mxgraph.aws4.group_vpc` | `#248814` | 0 |
| Public subnet | `mxgraph.aws4.group_public_subnet` | `#248814` | 0 |
| Private subnet | `mxgraph.aws4.group_private_subnet` | `#147EBA` | 0 |
| Security group | `mxgraph.aws4.group_security_group` | `#DD3522` | 1 |
| Auto Scaling group | `mxgraph.aws4.group_auto_scaling_group` | `#ED7100` | 1 |

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
| VPC / NAT / IGW | `mxgraph.aws4.virtual_private_cloud_vpc` | `#8C4FFF` | Networking purple |
| Route 53 | `mxgraph.aws4.route_53` | `#8C4FFF` | Networking purple |
| RDS / Aurora | `mxgraph.aws4.rds` (Aurora: `mxgraph.aws4.aurora`) | `#2E27AD` | Database blue |
| DynamoDB | `mxgraph.aws4.dynamodb` | `#2E27AD` | Database blue |
| ElastiCache | `mxgraph.aws4.elasticache` | `#C925D1` | Database magenta |
| S3 | `mxgraph.aws4.s3` | `#7AA116` | Storage green |
| ECR | `mxgraph.aws4.elastic_container_registry` | `#ED7100` | Compute orange |
| CloudWatch | `mxgraph.aws4.cloudwatch_2` | `#E7157B` | Mgmt pink |
| Secrets Manager | `mxgraph.aws4.secrets_manager` | `#DD344C` | Security red |
| KMS | `mxgraph.aws4.key_management_service` | `#DD344C` | Security red |
| WAF | `mxgraph.aws4.waf` | `#DD344C` | Security red |
| SNS | `mxgraph.aws4.simple_notification_service` | `#E7157B` | App-integration pink |
| SQS | `mxgraph.aws4.simple_queue_service` | `#E7157B` | App-integration pink |

### Special shapes
- **IAM role:** `shape=mxgraph.aws4.role;resIcon=mxgraph.aws4.identity_and_access_management_iam;fillColor=#DD344C`
- **User/actor:** `shape=mxgraph.aws4.user;fillColor=#232F3E` (size `60×78`)
- If unsure of an exact `resIcon` name, fall back to a labeled generic resource box rather than
  guessing — a wrong stencil name renders as an empty box. A clean fallback:
  `rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#232F3E;fontColor=#232F3E`.

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
