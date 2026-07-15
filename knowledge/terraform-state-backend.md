# Terraform State Backend — bucket bootstrap & KMS options

How to provision the **S3 remote-state backend** for a Terraform environment, in two modes:
**default** (free, for lab / non-sensitive state) and **`--enforce-kms`** (SSE-KMS enforced
end-to-end, for state that holds secrets).

> **Why this is a bootstrap step (out-of-band).** The state bucket — and its KMS key, if any —
> must exist **before** the first `terraform init` that uses them (chicken-and-egg: Terraform
> can't create the bucket it stores its own state in). So they're created by a small script
> (`create-tf-state-bucket.sh`), not by the environment's Terraform. This runs once per bucket,
> before the real `init` in [`pipeline-usage-guide.md`](pipeline-usage-guide.md) Step 3.

---

## 1. The backend split convention

Backend config is split by **what's static** vs **what's account-specific**:

| File | Committed? | Holds | Why |
|------|-----------|-------|-----|
| `backend.tf` | ✅ yes | `key`, `use_lockfile = true`, `encrypt = true` | static, non-sensitive |
| `backend-<env>.hcl` | ❌ gitignored (`backend-*.hcl`) | `bucket`, `region`, `profile` (+ `kms_key_id` if enforced) | account-specific — bucket name embeds the account id |

```hcl
# backend.tf  (COMMIT — no bucket/region/account id)
terraform {
  backend "s3" {
    key          = "<env>/terraform.tfstate"
    use_lockfile = true          # S3-native locking, TF >= 1.10 — no DynamoDB table
    encrypt      = true
  }
}
```

```hcl
# backend-<env>.hcl  (DO NOT commit — gitignore "backend-*.hcl")
bucket  = "<project>-tfstate-<account-id>"
region  = "ap-southeast-1"
profile = "<aws-profile-with-mfa>"
# kms_key_id = "arn:aws:kms:...:key/..."   # present only in --enforce-kms mode (see §3B)
```

> Add `backend-*.hcl` to `.gitignore`. `/init-project` seeds this automatically for new
> projects; for an existing repo, add it by hand. (Rule must be `backend-*.hcl` — a plain
> `backend.hcl` would NOT be ignored.)

Init the backend with the partial config:

```bash
terraform init -backend-config=backend-<env>.hcl
```

---

## 2. What the script provisions

`create-tf-state-bucket.sh` creates a **hardened** state bucket (idempotent — safe to re-run):

1. Block **all** public access (4 flags)
2. **Versioning** on (recover from a corrupt state write)
3. Default **SSE-KMS** encryption + **Bucket Key** (cuts KMS request cost)
4. Bucket policy: **deny non-TLS** (+ deny non-KMS writes with `--enforce-kms` — §3B)
5. Standard tags
6. Lifecycle: expire old noncurrent versions + abort stale multipart uploads
7. **S3-native locking** (`use_lockfile`) — **no DynamoDB table**, no extra cost

It then prints the `backend.tf` + `backend-<env>.hcl` to drop into the environment.

---

## 3. Two modes

### A. Default — no KMS enforcement (free; lab / non-sensitive state)

```bash
create-tf-state-bucket.sh --name=<project> --profile=<aws-profile> --region=ap-southeast-1 \
  --key=<env>/terraform.tfstate
```

- Bucket **default encryption** = SSE-KMS with the AWS-managed `alias/aws/s3` key → **$0** (no CMK).
- The Terraform backend writes state as **SSE-S3 (AES256)** — because `encrypt = true` **without**
  `kms_key_id` sends an explicit `AES256` header (see §4). State is still encrypted at rest + TLS-only.
- **When to use:** personal / lab / non-sensitive state. No KMS cost, no key to manage.

### B. `--enforce-kms` — SSE-KMS enforced end-to-end (state that holds secrets)

Use when the state contains secrets in readable form (VPN PSKs, DB master passwords, IAM access
keys). `--enforce-kms` **requires** a customer-managed key (CMK) — it hard-errors on the default
`alias/aws/s3` (that key can't be scoped, and pinning to it is meaningless).

**Step 1 — create a scoped CMK (one-off).** Idempotent via alias; key policy lets root *admin* the
key (no lockout) but only the Terraform principal *use* it (the real "second lock"); rotation on.

```bash
PROFILE=<aws-profile>
REGION=ap-southeast-1
ALIAS=alias/<project>-tfstate
# Principal that runs terraform / CI (gets Encrypt+Decrypt). Find yours:
#   aws --profile "$PROFILE" sts get-caller-identity --query Arn --output text
# If that returns an assumed-role ARN, use the ROLE arn: arn:aws:iam::<acct>:role/<ROLE>
GRANT_PRINCIPAL="arn:aws:iam::<acct>:user/<tf-user>"

ACCOUNT=$(aws --profile "$PROFILE" sts get-caller-identity --query Account --output text)

# reuse the key if the alias already exists (idempotent)
KEY_ARN=$(aws --profile "$PROFILE" --region "$REGION" kms describe-key \
  --key-id "$ALIAS" --query KeyMetadata.Arn --output text 2>/dev/null || true)

if [ -z "$KEY_ARN" ] || [ "$KEY_ARN" = "None" ]; then
  POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "KeyAdministration", "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::${ACCOUNT}:root" },
      "Action": ["kms:Create*","kms:Describe*","kms:Enable*","kms:List*","kms:Put*",
                 "kms:Update*","kms:Revoke*","kms:Disable*","kms:Get*","kms:Delete*",
                 "kms:TagResource","kms:UntagResource","kms:ScheduleKeyDeletion","kms:CancelKeyDeletion"],
      "Resource": "*" },
    { "Sid": "KeyUsageForStateOnly", "Effect": "Allow",
      "Principal": { "AWS": "${GRANT_PRINCIPAL}" },
      "Action": ["kms:Encrypt","kms:Decrypt","kms:ReEncrypt*","kms:GenerateDataKey*","kms:DescribeKey"],
      "Resource": "*" }
  ]
}
JSON
)
  KEY_ARN=$(aws --profile "$PROFILE" --region "$REGION" kms create-key \
    --description "Terraform state encryption — <project>" \
    --key-usage ENCRYPT_DECRYPT --key-spec SYMMETRIC_DEFAULT --policy "$POLICY" \
    --tags TagKey=Project,TagValue=<project> TagKey=ManagedBy,TagValue=bootstrap \
    --query KeyMetadata.Arn --output text)
  aws --profile "$PROFILE" --region "$REGION" kms create-alias --alias-name "$ALIAS" --target-key-id "$KEY_ARN"
  aws --profile "$PROFILE" --region "$REGION" kms enable-key-rotation --key-id "$KEY_ARN"
fi
echo "CMK ready: $KEY_ARN"
```

**Step 2 — create the bucket with that key:**

```bash
create-tf-state-bucket.sh --name=<project> --profile=<aws-profile> --region=ap-southeast-1 \
  --key=<env>/terraform.tfstate \
  --kms-key-id="$KEY_ARN" --enforce-kms
```

This makes the emitted `backend-<env>.hcl` include `kms_key_id = "<ARN>"` (so Terraform writes
**SSE-KMS**), and adds two Deny statements to the bucket policy:

| Statement | Blocks |
|-----------|--------|
| `DenyNonKmsUploads` | any `PutObject` where `x-amz-server-side-encryption != aws:kms` (SSE-S3, unencrypted) |
| `DenyWrongKmsKey` (CMK ARN only) | any `PutObject` using a KMS key other than the pinned ARN |

So a misconfigured write (e.g. `encrypt = true` without `kms_key_id`) is **rejected loudly**
instead of silently downgrading to SSE-S3.

---

## 4. The gotcha `--enforce-kms` solves

Terraform's S3 backend, with `encrypt = true` and **no** `kms_key_id`, sends an explicit
`x-amz-server-side-encryption: AES256` header → **SSE-S3**. An explicit PutObject SSE header
**overrides the bucket's default encryption**, so even a bucket whose default is SSE-KMS still
stores the state object as SSE-S3. To actually get SSE-KMS you must pass `kms_key_id` (which is
exactly what `--enforce-kms` writes into the `.hcl`), and the deny-non-KMS bucket policy makes the
requirement enforced rather than best-effort.

---

## 5. Two layers of protection (don't conflate them)

- **Bucket policy** (`--enforce-kms`) enforces the **encryption method on write** — state must be
  written with SSE-KMS using the pinned key.
- **KMS key policy** (Step 1 recipe) enforces **who can decrypt** — only `GRANT_PRINCIPAL`, even
  for someone who has S3 read on the bucket.

Both together = defense-in-depth for state holding secrets. Either alone is a partial control.

---

## 6. Caveats (KMS mode)

- **Cost:** a CMK is ~$1/month + KMS request charges (near-zero here thanks to Bucket Key).
- **Deletion isn't instant:** removing a CMK is `aws kms schedule-key-deletion --pending-window-in-days 7`
  (7–30 days). Create deliberately.
- **Region-bound:** the CMK must be in the **same region** as the bucket.
- **CI principal:** if CI runs Terraform under a different role than you do by hand, add that role
  ARN to the `KeyUsageForStateOnly` principal list — otherwise CI is denied on state write.
- **No retroactive re-encryption:** objects already written SSE-S3 aren't re-encrypted; the next
  write (or a manual re-upload) writes them SSE-KMS. A brand-new bucket is clean from the start.

---

## 7. Which mode?

| State contents | Mode |
|----------------|------|
| Lab / personal / non-sensitive | **A — default** (free `alias/aws/s3`, SSE-S3 write) |
| Secrets in readable form (VPN PSK, DB master password, IAM keys), prod | **B — `--enforce-kms` + CMK** |

> **Bigger lever than KMS:** the strongest fix for secret-bearing state is to **put fewer secrets in
> it** — rotate long-lived IAM keys and use roles, keep DB passwords in Secrets Manager so state
> holds only an ARN. KMS is defense-in-depth on top of that, not a substitute.

---

## Related

- [`pipeline-usage-guide.md`](pipeline-usage-guide.md) — Step 3 (`/iac-implement`) runs the real
  `terraform init` after this bucket exists.
- [`../.claude/rules/terraform.md`](../.claude/rules/terraform.md) — §State Management (the
  auto-applied rule this convention comes from).
- `terraform-engineer` skill → `references/state-and-backend.md` — the backend example + state ops.
