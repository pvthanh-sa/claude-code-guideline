# Profile: Terraform / OpenTofu (AWS primary)

> Kit-owned. Globs: `**/*.tf`, `**/*.tfvars`, `**/*.tftpl`, `**/.terraform.lock.hcl`.
> Deterministic scanners (fmt, validate, tflint, checkov, trivy) may run in CI — check CI status
> and do not re-list what they already report. Your value is what scanners cannot see: the
> **effect of applying this change**.

## Destroy / replace risk — review this first
- **Forces replacement** on a stateful or long-lived resource: changing an attribute that is
  ForceNew (e.g. `aws_db_instance.identifier`, `engine` major, `availability_zone`,
  `aws_rds_cluster.cluster_identifier`, `aws_instance.ami`/`subnet_id`/`user_data` (unless
  `user_data_replace_on_change = false`), `aws_s3_bucket.bucket`, `aws_elasticache_*` ids, KMS key
  changes on encrypted storage, `name` on many resources). Say "confirm with `terraform plan`"
  when you rely on provider behaviour.
- Resource **address changes** without a `moved {}` block: renaming a resource, moving it into a
  module, switching `count` ↔ `for_each`, or changing a `for_each` key → destroy + create.
  `count` lists shift indexes when an element in the middle is removed.
- A resource or module **deleted** from code = destroyed on apply. Intentional? Should it be
  `removed { lifecycle { destroy = false } }` / `terraform state rm` instead?
- Stateful resources without protection: `deletion_protection` (RDS/Aurora, DynamoDB, ALB),
  `skip_final_snapshot = true` in prod, no `lifecycle { prevent_destroy = true }` on critical data.
- `lifecycle { ignore_changes = all }` or a broad `ignore_changes` that hides real drift;
  `create_before_destroy` on a resource with a unique name (the create collides).

## Security
- IAM: `Action = "*"` or `service:*`, `Resource = "*"` on write actions, `iam:PassRole` on `*`,
  missing `Condition` on cross-account/assume-role trust; trust policy allowing any principal in an
  account where a specific role was meant; GitHub OIDC trust without a `sub` condition scoped to
  repo + branch/environment — 🔴.
- Inline JSON policies instead of `aws_iam_policy_document` (house convention; 🟡 at most).
- Security groups: `0.0.0.0/0` / `::/0` ingress on SSH 22, RDP 3389, DB ports, or all ports — 🔴 in
  prod. Egress all is normal; flag only if the repo context says egress is restricted.
- Public exposure: S3 without public access block, bucket policy `Principal = "*"`; RDS
  `publicly_accessible = true`; EKS public endpoint without CIDR restriction; an ALB that was
  internal becoming `internal = false`.
- Encryption off: S3 (SSE), RDS/Aurora `storage_encrypted`, EBS, EFS, ElastiCache at-rest and
  `transit_encryption_enabled`, SNS/SQS KMS; TLS policy older than TLS 1.2 on listeners.
- Secrets in `.tf`/`.tfvars`, in `default` of variables, or in outputs without `sensitive = true`;
  passwords in `aws_db_instance.password` instead of `manage_master_user_password = true` /
  Secrets Manager.
- Hard-coded account IDs, ARNs with account IDs, regions where a variable/data source is expected.
- Logging removed or missing on new resources that need it: CloudTrail, ALB access logs, VPC Flow
  Logs, S3 access logs for sensitive buckets.

## Correctness
- Variables with constrained values and no `validation`; `type = any` hiding mistakes;
  `default` that is unsafe for prod.
- `depends_on` missing where an implicit dependency does not exist (IAM policy attach before the
  service uses the role); circular references.
- Provider/module versions: unpinned module `source` (git ref missing / `ref=main`), provider
  constraint removed; lock file not updated with the change (only if the repo commits
  `.terraform.lock.hcl`).
- Backend: `backend.tf` gaining account-specific values (bucket/region/profile) instead of a
  partial `-backend-config` file; state key collisions between environments; locking removed.
- `data` sources that fail when the resource does not exist yet (ordering in a fresh account).
- Environment drift: a change applied to one env's code but not the others when the repo keeps
  envs in sync (check sibling `envs/*` / `environments/*`).

## Cost (flag with a rough magnitude, never invent prices)
- A NAT Gateway per AZ in non-prod; instance/DB class jumps; Multi-AZ in dev; provisioned IOPS;
  CloudWatch log groups without `retention_in_days` (kept forever); large `desired_count`;
  cross-AZ/region data transfer created by the change; interface VPC endpoints multiplied per AZ.

## Conventions (only when repo-context confirms the repo follows them)
- Naming `${var.app_name}-<type>`; tags via `merge(var.tags, { Name = …, ManagedBy = "Terraform" })`;
  `description` on every variable/output; `for_each` over `count`; file layout
  `versions.tf / variables.tf / main.tf / data.tf / outputs.tf / locals.tf`.
