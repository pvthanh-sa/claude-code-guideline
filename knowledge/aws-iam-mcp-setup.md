# AWS IAM Policy for Claude MCP

Read-only, metadata-only IAM policy for a dedicated MCP user (access key + secret key, no MFA).

**Scope:** AI agent inspects infrastructure metadata only. No data reads (no SQL, no S3 object content, no DynamoDB items, no Bedrock invocations). CloudWatch log content is the one exception — required for the observability use case. Public catalog APIs that expose **no account data** are in scope too — notably the AWS **Pricing** price list (`pricing:*` is read-only), used by the spec-stage cost estimate.

---

## Policy

Save as `iam/claude-mcp-boundary.json`. Use it as **both** the permission boundary and the user policy (or split into two — same Allow block, the Deny block belongs in the boundary).

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
        "ce:Get*",
        "ce:List*",
        "ce:Describe*",
        "budgets:View*",
        "budgets:Describe*",
        "pricing:Get*",
        "pricing:Describe*",
        "pricing:List*",
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

---

## Apply

```bash
ADMIN_PROFILE=<your-admin-profile>   # AWS profile with IAM permissions (e.g. "lion-garden-admin")
ACCOUNT_ID=$(aws sts get-caller-identity --profile $ADMIN_PROFILE --query Account --output text)
USER=claude-mcp-<your-name>

# 1. Create policy
aws iam create-policy \
  --profile $ADMIN_PROFILE \
  --policy-name ClaudeMCPReadOnly \
  --policy-document file://iam/claude-mcp-boundary.json

# 2. Create user (programmatic only, no console)
aws iam create-user --profile $ADMIN_PROFILE \
  --user-name $USER \
  --tags Key=Purpose,Value=ClaudeMCP

# 3. Attach as both boundary and user policy
aws iam put-user-permissions-boundary --profile $ADMIN_PROFILE \
  --user-name $USER \
  --permissions-boundary arn:aws:iam::${ACCOUNT_ID}:policy/ClaudeMCPReadOnly
aws iam attach-user-policy --profile $ADMIN_PROFILE \
  --user-name $USER \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/ClaudeMCPReadOnly

# 4. Create access key
aws iam create-access-key --profile $ADMIN_PROFILE --user-name $USER
```

Save the key to `~/.aws/credentials` (`chmod 600`), reference the profile in `.mcp.json` via `AWS_PROFILE`.

---

## Verify

```bash
P=<your-profile>

# Must succeed
aws sts get-caller-identity --profile $P
aws cloudwatch list-metrics --profile $P --max-items 5
aws ecs list-clusters --profile $P
aws lambda list-functions --profile $P --max-items 5
aws pricing describe-services --region us-east-1 --profile $P --max-items 1   # aws-pricing MCP (public price list, read-only)

# Must fail with AccessDenied
aws iam create-user --user-name x --profile $P
aws s3api put-object --bucket b --key k --profile $P
aws s3api get-object --bucket b --key k /tmp/o --profile $P
aws athena start-query-execution --query-string "SELECT 1" \
  --result-configuration OutputLocation=s3://x/ --profile $P
aws dynamodb scan --table-name t --profile $P
aws lambda invoke --function-name f /tmp/o --profile $P
```
