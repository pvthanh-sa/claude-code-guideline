# AWS Auth for Claude MCP — Read-Only Metadata Access

Runbook for granting Claude's AWS MCP servers **read-only, metadata-only** access to an AWS
account. Three authentication methods are documented, ranked **most-secure first**, **all set up with
the AWS CLI** (no Terraform — this is bootstrap-the-credential work). The IAM **policy is identical**
across all three — only *how credentials are delivered* changes, which is what determines the blast
radius if a credential leaks.

**Scope:** the AI agent inspects infrastructure metadata only. No data reads (no SQL, no S3 object
content, no DynamoDB items, no Bedrock invocations). CloudWatch log content is the one exception —
required for the observability use case. Public catalog APIs that expose **no account data** are in
scope too — notably the AWS **Pricing** price list (`pricing:*` is read-only), used by the
spec-stage cost estimate.

---

## Choose a method

| # | Method | Credential on disk | Expires? | Needs new IAM user? | Needs Identity Center? | Extra cost | Pick when |
|---|--------|--------------------|----------|---------------------|------------------------|------------|-----------|
| **1** | **IAM Identity Center (SSO) permission set** ✅ *recommended* | none (SSO token, hours) | yes | no | **yes** | none¹ | Org has Identity Center enabled |
| **2** | **IAM role, assumed from an MFA session** | none for MCP (temp role creds, 1h) | yes | no | no | none | New IAM users blocked (SCP) **and** no Identity Center |
| **3** | **IAM user + long-lived access key** ⚠️ *last resort* | static secret, **never expires** | no | yes | no | none | Neither of the above is possible (legacy CI, tool without SSO support) |

¹ Identity Center itself is free. You only pay if the identity source is a chargeable service (AWS
Managed Microsoft AD). The built-in directory and external IdPs (Okta / Entra ID / Google) add no
AWS cost. STS `AssumeRole` calls are free.

**Security ranking — blast radius if the credential leaks:**

- **Method 1 / 2** deliver only **temporary** credentials. A leaked token is dead within hours, and
  you revoke access centrally (delete the account assignment / edit the role trust policy) — instant.
- **Method 3** writes a **static** access key to `~/.aws/credentials` that works **forever** until
  someone manually deletes it. A leaked key gives an attacker a permanent, silent map of the
  account's IAM + security posture (`iam:List*`, `guardduty`, `securityhub`, `access-analyzer` are
  all readable). Read-only ≠ harmless.

> **Golden rule:** prefer temporary credentials (Method 1 > 2). Use Method 3 only when forced, and
> then treat rotation as mandatory (see its section).

---

## The IAM policy (shared by all three methods)

Save as `iam/claude-mcp-boundary.json`. This one document is reused as:

- **Method 1** — the Identity Center **permission set** inline policy
- **Method 2** — the **role** permission policy
- **Method 3** — the IAM **user** policy **and** its permission boundary

> **⚠️ Regions.** The `AllowReadOnlyMetadata` statement locks `aws:RequestedRegion` to
> `["ap-southeast-1", "us-east-1"]` — that is **`ap-southeast-1` = Singapore (your target)** plus
> `us-east-1` for a few global services. Every regional call outside that list is **implicitly
> denied**. If some resources live in another region (e.g. `ap-northeast-3`), add it here or the MCP
> authenticates fine but every `describe`/`list` there returns `AccessDenied`.

> **Region note (why a second Allow):** the global/billing read APIs (`pricing`, `ce`, `budgets`)
> live in a **separate region-unconditional** statement `AllowGlobalBillingReadOnly`. The Pricing API
> has endpoints only in `us-east-1` / `ap-south-1` / `eu-central-1`, and the aws-pricing MCP resolves
> `ap-southeast-1` queries to the nearest endpoint **`ap-south-1`** — so keeping `pricing` under the
> `aws:RequestedRegion` lock denies it (`pricing:GetProducts` → AccessDenied). Region-scoped services
> stay in `AllowReadOnlyMetadata`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadOnlyMetadata",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:Describe*",
        "cloudwatch:Get*",
        "cloudwatch:List*",
        "logs:Describe*",
        "logs:Get*",
        "logs:List*",
        "logs:FilterLogEvents",
        "logs:StartQuery",
        "logs:StopQuery",
        "logs:TestMetricFilter",
        "cloudtrail:Get*",
        "cloudtrail:Describe*",
        "cloudtrail:List*",
        "cloudtrail:LookupEvents",
        "ec2:Describe*",
        "ecs:Describe*",
        "ecs:List*",
        "eks:Describe*",
        "eks:List*",
        "lambda:Get*",
        "lambda:List*",
        "apigateway:GET",
        "rds:Describe*",
        "rds:List*",
        "elasticache:Describe*",
        "elasticache:List*",
        "kafka:Describe*",
        "kafka:Get*",
        "kafka:List*",
        "sns:Get*",
        "sns:List*",
        "sqs:Get*",
        "sqs:List*",
        "iam:Get*",
        "iam:List*",
        "iam:Generate*",
        "iam:Simulate*",
        "s3:ListAllMyBuckets",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:ListBucketMultipartUploads",
        "s3:GetBucketLocation",
        "s3:GetBucketAcl",
        "s3:GetBucketPolicy",
        "s3:GetBucketPolicyStatus",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketTagging",
        "s3:GetBucketVersioning",
        "s3:GetBucketLogging",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetReplicationConfiguration",
        "s3:GetAccountPublicAccessBlock",
        "athena:GetDataCatalog",
        "athena:GetDatabase",
        "athena:GetTableMetadata",
        "athena:GetWorkGroup",
        "athena:GetNamedQuery",
        "athena:GetPreparedStatement",
        "athena:GetQueryExecution",
        "athena:List*",
        "athena:BatchGetNamedQuery",
        "athena:BatchGetPreparedStatement",
        "athena:BatchGetQueryExecution",
        "glue:GetDatabase",
        "glue:GetDatabases",
        "glue:GetTable",
        "glue:GetTables",
        "glue:GetPartition",
        "glue:GetPartitions",
        "glue:GetCatalogImportStatus",
        "glue:GetClassifier",
        "glue:GetClassifiers",
        "glue:GetCrawler",
        "glue:GetCrawlers",
        "glue:GetCrawlerMetrics",
        "glue:GetDataCatalogEncryptionSettings",
        "glue:GetSecurityConfiguration",
        "glue:GetSecurityConfigurations",
        "glue:GetSchema",
        "glue:GetSchemaVersion",
        "glue:GetTags",
        "glue:List*",
        "glue:BatchGet*",
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*",
        "wellarchitected:Get*",
        "wellarchitected:List*",
        "securityhub:Get*",
        "securityhub:List*",
        "securityhub:Describe*",
        "guardduty:Get*",
        "guardduty:List*",
        "inspector2:Get*",
        "inspector2:List*",
        "access-analyzer:Get*",
        "access-analyzer:List*",
        "macie2:Get*",
        "macie2:List*",
        "resource-explorer-2:Get*",
        "resource-explorer-2:List*",
        "resource-explorer-2:Search",
        "config:Get*",
        "config:List*",
        "config:Describe*",
        "config:Select*",
        "support:Describe*",
        "trustedadvisor:Describe*",
        "tag:Get*",
        "resource-groups:Get*",
        "resource-groups:List*",
        "resource-groups:Search*"
      ],
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "true" },
        "StringEquals": {
          "aws:RequestedRegion": ["ap-southeast-1", "us-east-1"]
        }
      }
    },
    {
      "Sid": "AllowGlobalBillingReadOnly",
      "Effect": "Allow",
      "Action": [
        "pricing:Get*",
        "pricing:Describe*",
        "pricing:List*",
        "ce:Get*",
        "ce:List*",
        "ce:Describe*",
        "budgets:View*",
        "budgets:Describe*"
      ],
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "true" }
      }
    },
    {
      "Sid": "DenyMutationsAndDataReads",
      "Effect": "Deny",
      "Action": [
        "iam:Create*",
        "iam:Update*",
        "iam:Put*",
        "iam:Delete*",
        "iam:Attach*",
        "iam:Detach*",
        "iam:AddUser*",
        "iam:RemoveUser*",
        "iam:ChangePassword",
        "iam:ResetServiceSpecific*",
        "iam:UploadSSHPublicKey",
        "organizations:*",
        "account:*",
        "billing:*",
        "aws-portal:*",
        "support:Create*",
        "sts:AssumeRole",
        "sts:AssumeRoleWithSAML",
        "sts:AssumeRoleWithWebIdentity",
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey",
        "kms:ReEncrypt*",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:Update*",
        "secretsmanager:Delete*",
        "ssm:GetParameter*",
        "ssm:PutParameter",
        "ssm:Delete*",
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:Modify*",
        "ec2:Create*",
        "ec2:Delete*",
        "ec2:Authorize*",
        "ec2:Revoke*",
        "lambda:InvokeFunction",
        "lambda:InvokeAsync",
        "lambda:Create*",
        "lambda:Update*",
        "lambda:Delete*",
        "lambda:Put*",
        "lambda:Add*",
        "lambda:Remove*",
        "rds:Delete*",
        "rds:Modify*",
        "rds:Reboot*",
        "rds:Create*",
        "rds:Restore*",
        "rds-data:ExecuteStatement",
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction",
        "ecs:RunTask",
        "ecs:StopTask",
        "ecs:Update*",
        "ecs:Create*",
        "ecs:Delete*",
        "ecs:Register*",
        "ecs:Deregister*",
        "eks:Create*",
        "eks:Update*",
        "eks:Delete*",
        "eks:Associate*",
        "eks:Disassociate*",
        "elasticache:Create*",
        "elasticache:Modify*",
        "elasticache:Delete*",
        "elasticache:Reboot*",
        "kafka:Create*",
        "kafka:Update*",
        "kafka:Delete*",
        "kafka:Reboot*",
        "sns:Publish",
        "sns:Create*",
        "sns:Delete*",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:SetTopicAttributes",
        "sqs:SendMessage*",
        "sqs:Create*",
        "sqs:Delete*",
        "sqs:Purge*",
        "sqs:SetQueueAttributes",
        "s3:Put*",
        "s3:Delete*",
        "s3:Replicate*",
        "s3:Restore*",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectAttributes",
        "s3:GetObjectTagging",
        "s3:GetObjectAcl",
        "s3:GetObjectVersionAcl",
        "s3:GetObjectTorrent",
        "athena:StartQueryExecution",
        "athena:StopQueryExecution",
        "athena:GetQueryResults",
        "athena:GetQueryResultsStream",
        "athena:GetCalculationExecution",
        "athena:GetCalculationExecutionCode",
        "athena:Delete*",
        "athena:CreateNamedQuery",
        "athena:UpdateNamedQuery",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:PartiQLSelect",
        "dynamodb:PartiQLInsert",
        "dynamodb:PartiQLUpdate",
        "dynamodb:PartiQLDelete",
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "sagemaker:InvokeEndpoint",
        "sagemaker:InvokeEndpointAsync",
        "neptune-db:ReadDataViaQuery",
        "neptune-db:WriteDataViaQuery",
        "appsync:GraphQL",
        "glue:GetUserDefinedFunction",
        "glue:GetUserDefinedFunctions",
        "glue:Create*",
        "glue:Update*",
        "glue:Delete*",
        "glue:Put*",
        "logs:Delete*",
        "logs:Put*",
        "cloudwatch:Put*",
        "cloudwatch:Delete*",
        "cloudwatch:Disable*",
        "cloudwatch:Enable*",
        "cloudtrail:Stop*",
        "cloudtrail:Delete*",
        "cloudtrail:Update*",
        "cloudtrail:Put*",
        "cloudformation:Create*",
        "cloudformation:Update*",
        "cloudformation:Delete*",
        "cloudformation:Execute*"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Note on `sts:AssumeRole` in the Deny block:** this denies the *holder* of this policy from
> assuming **further** roles (prevents role-chaining) — it does **not** block assuming *into* a role
> that carries this policy (Method 2). That is governed by the role's trust policy plus the source
> identity's own permissions, which live elsewhere. Keep the Deny as-is for all three methods.

---

## Method 1 — IAM Identity Center (SSO) permission set ✅ recommended

No static keys anywhere. Access is a browser `aws sso login` that mints short-lived credentials,
auto-refreshed by the SDK; revoke instantly by removing the account assignment.

> Run the `aws sso-admin` / `aws identitystore` commands with a profile that has **Identity Center
> admin** rights (the **management account** or a delegated-admin account). The target account must
> be a member of the same AWS Organization.

### 1.1 Set variables

```bash
ADMIN=<sso-admin-profile>                  # profile with Identity Center admin rights
REGION=ap-southeast-1                       # where Identity Center is enabled (Singapore)
ACCOUNT_ID=346523298829                     # target AWS account the MCP will inspect
SSO_USER=pham.thanh@vn.lion-garden.com      # your Identity Center username
```

### 1.2 Create the permission set + attach the policy + assign it (all CLI)

```bash
# 1. Instance ARN + Identity Store ID
INSTANCE_ARN=$(aws sso-admin list-instances --region $REGION --profile $ADMIN \
  --query 'Instances[0].InstanceArn' --output text)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --region $REGION --profile $ADMIN \
  --query 'Instances[0].IdentityStoreId' --output text)

# 2. Create the permission set (1h sessions — shorter = smaller leak window)
PS_ARN=$(aws sso-admin create-permission-set --region $REGION --profile $ADMIN \
  --instance-arn "$INSTANCE_ARN" \
  --name ClaudeMCPReadOnly \
  --description "Read-only metadata access for Claude MCP" \
  --session-duration PT1H \
  --query 'PermissionSet.PermissionSetArn' --output text)

# 3. Attach the shared policy as an inline policy
aws sso-admin put-inline-policy-to-permission-set --region $REGION --profile $ADMIN \
  --instance-arn "$INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" \
  --inline-policy file://iam/claude-mcp-boundary.json

# 4. Resolve your Identity Center user ID
#    NOTE: --alternate-identifier must be JSON. The shorthand form
#    "UniqueAttribute={AttributePath=userName,AttributeValue=$SSO_USER}" fails on
#    aws-cli 2.x with: "Shorthand syntax does not support document types."
USER_ID=$(aws identitystore get-user-id --region $REGION --profile $ADMIN \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --alternate-identifier '{"UniqueAttribute":{"AttributePath":"userName","AttributeValue":"'"$SSO_USER"'"}}' \
  --query 'UserId' --output text)
# Fallback (also handy to eyeball every user in the store):
# USER_ID=$(aws identitystore list-users --region $REGION --profile $ADMIN \
#   --identity-store-id "$IDENTITY_STORE_ID" \
#   --query "Users[?UserName=='$SSO_USER'].UserId | [0]" --output text)

# 5. Assign the permission set to your user on the target account
aws sso-admin create-account-assignment --region $REGION --profile $ADMIN \
  --instance-arn "$INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" \
  --principal-id "$USER_ID" --principal-type USER \
  --target-id "$ACCOUNT_ID" --target-type AWS_ACCOUNT
# → provisions an IAM role into the target account (async; ready in a few seconds)
```

> **If you edit the policy later**, push the change to already-assigned accounts:
> ```bash
> aws sso-admin put-inline-policy-to-permission-set ...   # update the policy
> aws sso-admin provision-permission-set --region $REGION --profile $ADMIN \
>   --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN" \
>   --target-type AWS_ACCOUNT --target-id "$ACCOUNT_ID"
> ```

### 1.3 Client config (`~/.aws/config`) + login

```ini
[sso-session lion-garden]
sso_start_url           = https://<your-org>.awsapps.com/start   # AWS access portal URL
sso_region              = ap-southeast-1                          # where Identity Center is enabled
sso_registration_scopes = sso:account:access

[profile welfan-lg-mcp-pham-thanh]
sso_session    = lion-garden
sso_account_id = 346523298829
sso_role_name  = ClaudeMCPReadOnly
region         = ap-southeast-1   # region for API calls — must be in the policy's allowed list
output         = json
```

```bash
aws sso login --sso-session lion-garden   # browser once; SDK auto-refreshes role creds after
```

Point the AWS MCP server's env at this profile in `.mcp.json`:

```json
{
  "mcpServers": {
    "aws": {
      "command": "<your aws mcp server command>",
      "env": { "AWS_PROFILE": "welfan-lg-mcp-pham-thanh", "AWS_REGION": "ap-southeast-1" }
    }
  }
}
```

> **Headless behaviour:** `aws sso login` is interactive (browser) — a human runs it once. After that
> the MCP runs headless off the cached token; the SDK auto-refreshes role credentials (default 1h)
> until the SSO access token expires (default 8h). Then re-run `aws sso login`.

### 1.4 Revoke / teardown

```bash
aws sso-admin delete-account-assignment --region $REGION --profile $ADMIN \
  --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN" \
  --principal-id "$USER_ID" --principal-type USER \
  --target-id "$ACCOUNT_ID" --target-type AWS_ACCOUNT
aws sso-admin delete-permission-set --region $REGION --profile $ADMIN \
  --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN"
```

---

## Method 2 — IAM role, assumed from an MFA session (no new IAM user)

For accounts where an SCP/Org policy blocks `iam:CreateUser` **and** Identity Center isn't available.
The MCP holds **no static key** — it assumes a role from an existing MFA-backed session and gets
temporary 1h credentials that the SDK auto-refreshes.

### 2.1 Write the trust policy

Save as `iam/claude-mcp-trust.json` (lock to your identity, require MFA):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::346523298829:user/<your-iam-user>" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "Bool": { "aws:MultiFactorAuthPresent": "true" },
        "NumericLessThan": { "aws:MultiFactorAuthAge": "43200" }
      }
    }
  ]
}
```

### 2.2 Create the role + attach the policy (CLI)

```bash
ADMIN=<your-admin-profile>   # profile with IAM permissions

aws iam create-role --profile $ADMIN \
  --role-name claude-mcp-readonly \
  --description "Read-only metadata access for Claude MCP (assume-role)" \
  --assume-role-policy-document file://iam/claude-mcp-trust.json \
  --max-session-duration 3600

aws iam put-role-policy --profile $ADMIN \
  --role-name claude-mcp-readonly \
  --policy-name ClaudeMCPReadOnly \
  --policy-document file://iam/claude-mcp-boundary.json
```

### 2.3 Client config (`~/.aws/config`)

```ini
[profile welfan-lg-mcp-pham-thanh]
role_arn         = arn:aws:iam::346523298829:role/claude-mcp-readonly
source_profile   = welfan-lg-mfa
region           = ap-southeast-1   # must be in the policy's allowed-regions list
duration_seconds = 3600
output           = json
```

### 2.4 The source profile MUST be a pre-minted MFA session (headless requirement)

An MCP server runs **non-interactively** — it cannot answer an MFA prompt. So:

- **Do NOT put `mfa_serial` on the assume-role profile** — that makes the SDK prompt for an OTP on
  every refresh → the MCP hangs.
- Instead, `welfan-lg-mfa` must already hold **MFA-derived session credentials**. Mint them once per
  ~12h; the MCP assumes the role headlessly the whole window:

```bash
# Run once per ~12h. Store the returned keys under [welfan-lg-mfa] in ~/.aws/credentials.
aws sts get-session-token \
  --serial-number arn:aws:iam::346523298829:mfa/<your-iam-user> \
  --token-code <6-digit-otp> \
  --duration-seconds 43200
```

Wire `.mcp.json` as in Method 1.3 (`AWS_PROFILE=welfan-lg-mcp-pham-thanh`).

### 2.5 Revoke / teardown

```bash
aws iam delete-role-policy --profile $ADMIN --role-name claude-mcp-readonly --policy-name ClaudeMCPReadOnly
aws iam delete-role       --profile $ADMIN --role-name claude-mcp-readonly
```

---

## Method 3 — IAM user + long-lived access key ⚠️ last resort

Only when Methods 1 and 2 are both impossible. This writes a **static, non-expiring** secret to disk.
If you use it, rotation is **not optional**.

### 3.1 Provision (CLI)

```bash
ADMIN_PROFILE=<your-admin-profile>   # AWS profile with IAM permissions
ACCOUNT_ID=$(aws sts get-caller-identity --profile $ADMIN_PROFILE --query Account --output text)
USER=claude-mcp-<your-name>

# 1. Create policy
aws iam create-policy --profile $ADMIN_PROFILE \
  --policy-name ClaudeMCPReadOnly \
  --policy-document file://iam/claude-mcp-boundary.json

# 2. Create user (programmatic only, no console)
aws iam create-user --profile $ADMIN_PROFILE \
  --user-name $USER \
  --tags Key=Purpose,Value=ClaudeMCP

# 3. Attach as BOTH permission boundary and user policy
aws iam put-user-permissions-boundary --profile $ADMIN_PROFILE \
  --user-name $USER \
  --permissions-boundary arn:aws:iam::${ACCOUNT_ID}:policy/ClaudeMCPReadOnly
aws iam attach-user-policy --profile $ADMIN_PROFILE \
  --user-name $USER \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/ClaudeMCPReadOnly

# 4. Create access key
aws iam create-access-key --profile $ADMIN_PROFILE --user-name $USER
```

Save the key to `~/.aws/credentials` (`chmod 600`), reference the profile in `.mcp.json` via
`AWS_PROFILE` (as in Method 1.3).

### 3.2 Mandatory hygiene (static keys)

- **Rotate every ≤90 days.** Create a new key, swap the profile, delete the old key.
- **Never commit** the key — ensure `.aws/`, `*.credentials`, `.env*` are gitignored; run the repo's
  secret-scan gate (G6) before any push.
- **Detect disuse:** enable IAM Access Analyzer *unused access* findings to flag stale keys.

### 3.3 Revoke / teardown

```bash
aws iam delete-access-key --user-name $USER --access-key-id <AKIA...> --profile $ADMIN_PROFILE
aws iam detach-user-policy --user-name $USER --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/ClaudeMCPReadOnly --profile $ADMIN_PROFILE
aws iam delete-user --user-name $USER --profile $ADMIN_PROFILE
```

---

## Verify (all methods)

Set `P` to the profile you configured, then confirm the read/deny boundary holds:

```bash
P=welfan-lg-mcp-pham-thanh

# Must SUCCEED (read-only metadata)
aws sts get-caller-identity --profile $P
aws cloudwatch list-metrics --profile $P --max-items 5
aws ecs list-clusters --profile $P
aws lambda list-functions --profile $P --max-items 5
aws pricing describe-services --region us-east-1 --profile $P --max-items 1   # aws-pricing MCP (public price list)
aws pricing get-products --service-code AmazonRDS --region ap-south-1 --profile $P --max-items 1   # region the MCP actually hits

# Must FAIL with AccessDenied (mutations + data reads)
aws iam create-user --user-name x --profile $P
aws s3api put-object --bucket b --key k --profile $P
aws s3api get-object --bucket b --key k /tmp/o --profile $P
aws athena start-query-execution --query-string "SELECT 1" \
  --result-configuration OutputLocation=s3://x/ --profile $P
aws dynamodb scan --table-name t --profile $P
aws lambda invoke --function-name f /tmp/o --profile $P
```

> If a **succeed** command returns `AccessDenied` for a region-scoped service, the call's region is
> not in the policy's `aws:RequestedRegion` list — see the region note at the top of the policy.
