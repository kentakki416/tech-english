# =============================================================================
# CI/CD設定 (GitHub Actions OIDC)
# =============================================================================
# GitHub Actions から OIDC 認証で AWS リソースにアクセス
# AWS アカウントに 1 つだけ OIDC provider を作成し、IAM role は env ごとに分離する。
# 各 role の trust policy は `environment:<env>` の OIDC sub claim でのみ assume を許可する。

data "aws_caller_identity" "current" {}

# GitHub OIDC プロバイダー
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com" # Github Actions OIDCトークン発行元URL
  client_id_list  = ["sts.amazonaws.com"]                         # OIDCトークンのaudience（対象者）
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]  # ダミーデータでOK
}

/**
 * dev 環境用 GitHub Actions IAM ロール。
 *
 * trust policy は GitHub Environment が dev のワークフローからのみ assume できるよう
 * sub claim を `repo:<owner>/<repo>:environment:dev` に限定する。env/dev の apply と
 * account の apply の両方でこの role を使用する。
 */
data "aws_iam_policy_document" "github_actions_dev_trust" {
  statement {
    sid     = "GitHubOIDCDevEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # dev は rolling deploy 運用で承認ゲートを持たないため、dev Environment のみ許可。
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:dev"]
    }
  }
}

resource "aws_iam_role" "github_actions_dev" {
  name               = "${var.project_name}-github-actions-dev"
  assume_role_policy = data.aws_iam_policy_document.github_actions_dev_trust.json
}

/**
 * prd 環境用 GitHub Actions IAM ロール（先行作成）。
 *
 * prd Environment が GitHub Settings に作成され、Required reviewers などのゲートが
 * 設定された後に、env/prd 用のワークフローからこの role を使う。dev と違い AdminAccess
 * は **意図的に付けない** ことで最小権限を強制する。当面 scoped policy (ecr_push +
 * ecs_deploy + ssm_deploy_approval) で足りない場合は、env/prd の terraform plan/apply
 * に必要な action を CloudTrail から抽出して scoped policy を拡充していくこと。
 *
 * 許可する GitHub Environment:
 * - prd: 通常の deploy / CI job 用
 * - prd-api-approval: deploy workflow の approve-api job (Required reviewers ゲート) 用
 */
data "aws_iam_policy_document" "github_actions_prd_trust" {
  statement {
    sid     = "GitHubOIDCPrdEnvironments"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:environment:prd",
        "repo:${var.github_repository}:environment:prd-api-approval",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_prd" {
  name               = "${var.project_name}-github-actions-prd"
  assume_role_policy = data.aws_iam_policy_document.github_actions_prd_trust.json
}

/**
 * minimal 環境用 GitHub Actions IAM ロール（deploy 用）。
 *
 * minimal は初期リリースの本番（api は Lambda、worker は必要なときだけ Fargate Spot）。
 * deploy-aws-min.yml はアプリのコードを build し外部の action も動かすため、侵害されたときに
 * AWS アカウント全体を変更できないよう、admin は付けずデプロイに必要な権限だけを持たせる。
 * terraform plan / apply は別の role（github_actions_min_terraform）を使う。
 * GitHub Environment が min のワークフローからのみ assume できるよう sub claim を限定する。
 * 設計: docs/spec/minimal-deploy/README.md
 */
data "aws_iam_policy_document" "github_actions_min_trust" {
  statement {
    sid     = "GitHubOIDCMinEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:min"]
    }
  }
}

resource "aws_iam_role" "github_actions_min" {
  name               = "${var.project_name}-github-actions-min"
  assume_role_policy = data.aws_iam_policy_document.github_actions_min_trust.json
}

/**
 * minimal 環境用 GitHub Actions IAM ロール（terraform plan / apply 用）。
 *
 * dev / prd と同じく AdministratorAccess で運用する（下の TODO と共通）。deploy workflow から
 * 使われないよう、GitHub Environment が min-terraform のワークフローからのみ assume できるようにする。
 * terraform-aws-env-ci.yml / terraform-aws-env-apply.yml は対象が min のとき min-terraform を使う。
 */
data "aws_iam_policy_document" "github_actions_min_terraform_trust" {
  statement {
    sid     = "GitHubOIDCMinTerraformEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:min-terraform"]
    }
  }
}

resource "aws_iam_role" "github_actions_min_terraform" {
  name               = "${var.project_name}-github-actions-min-terraform"
  assume_role_policy = data.aws_iam_policy_document.github_actions_min_terraform_trust.json
}

# ECR プッシュポリシー
data "aws_iam_policy_document" "ecr_push" {
  statement {
    sid       = "GetAuthorizationToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PushToProjectRepositories"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchImportLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [
      aws_ecr_repository.api.arn,
      aws_ecr_repository.worker.arn,
      aws_ecr_repository.migration.arn,
      aws_ecr_repository.cron.arn,
    ]
  }
}

resource "aws_iam_policy" "ecr_push" {
  name        = "${var.project_name}-ecr-push"
  description = "Policy for pushing images to ECR from GitHub Actions"
  policy      = data.aws_iam_policy_document.ecr_push.json
}

# ECS デプロイ用ポリシー
data "aws_iam_policy_document" "ecs_deploy" {
  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:RunTask",
      "ecs:UpdateService",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "PassExecutionRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*-execution-role"]
  }

  /**
   * migration RunTask 失敗時のログ取得用 (step8 deploy-aws-dev workflow)
   */
  statement {
    sid       = "ReadMigrationTaskLogs"
    effect    = "Allow"
    actions   = ["logs:FilterLogEvents"]
    resources = ["arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.project_name}-*"]
  }
}

resource "aws_iam_policy" "ecs_deploy" {
  name        = "${var.project_name}-ecs-deploy"
  description = "Policy for deploying to ECS from GitHub Actions"
  policy      = data.aws_iam_policy_document.ecs_deploy.json
}

# =============================================================================
# dev role への policy attachment
# =============================================================================

resource "aws_iam_role_policy_attachment" "ecr_push_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

resource "aws_iam_role_policy_attachment" "ecs_deploy_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}

# GitHub Actions から terraform plan / apply を実行するために AdministratorAccess を attach。
# plan は管理対象リソースの read、apply は read/write がそれぞれ必要で、追加するたびに
# policy を細かく更新していくのは dev では運用負荷が大きいため admin で運用する。
#
# 含まれる権限:
# - tfstate アクセス (S3 のみ。state lock は use_lockfile で同 bucket 内のロックファイル)
# - VPC / EC2 / ALB / ECS / ECR / RDS / ElastiCache / Route53 / ACM /
#   Secrets Manager / CloudWatch Logs / IAM など、step1〜10 で必要になる全リソース
#
# TODO: prd 環境の運用開始タイミングで CloudTrail から実使用 action を抽出して
#       scoped policy を作成し、prd / dev 両方をそちらに切り替えて本 attachment は剥がす。
resource "aws_iam_role_policy_attachment" "github_actions_admin_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Blue/Green 承認用 SSM PutParameter ポリシー（prd 専用）。
# deploy-aws-prd.yml の approve-api / reject-api job が
# /${project_name}-prd-api/deploy/approval を approved / rejected に書き換えるために必要。
# dev は rolling deploy で承認ゲートを持たないため、本ポリシーは prd role のみに attach する。
data "aws_iam_policy_document" "ssm_deploy_approval_prd" {
  statement {
    sid       = "PutDeployApprovalParameter"
    effect    = "Allow"
    actions   = ["ssm:PutParameter"]
    resources = ["arn:aws:ssm:*:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}-prd-*/deploy/approval"]
  }
}

resource "aws_iam_policy" "ssm_deploy_approval_prd" {
  name        = "${var.project_name}-ssm-deploy-approval-prd"
  description = "Policy for approving/rejecting Blue/Green deploy via SSM parameter (prd only)"
  policy      = data.aws_iam_policy_document.ssm_deploy_approval_prd.json
}

# =============================================================================
# prd role への policy attachment
# =============================================================================
# prd は AdminAccess を attach せず scoped policy のみで運用する。env/prd の plan / apply
# を回す際に不足する権限があれば、scoped policy 側を拡充して対応する（最小権限の強制）。

resource "aws_iam_role_policy_attachment" "ecr_push_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

resource "aws_iam_role_policy_attachment" "ecs_deploy_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}

resource "aws_iam_role_policy_attachment" "ssm_deploy_approval_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = aws_iam_policy.ssm_deploy_approval_prd.arn
}

# GitHub Actions から env/prd の terraform plan / apply を実行するために AdministratorAccess を attach。
# plan は tfstate(S3) の read + 管理対象リソースの read、apply は read/write が必要。
# terraform は IAM ロール (execution role / Blue-Green / scheduler 等) も作成するため、
# 意味のある scoped policy は事実上 admin 相当になりメンテ負荷が高い。当面 dev と同様に
# admin で運用し、CI plan/apply を通す。
#
# TODO: dev (github_actions_admin_dev) と合わせて CloudTrail から実使用 action を抽出し、
#       dev / prd 共通の scoped policy に切り替えて本 attachment は両方剥がす。
resource "aws_iam_role_policy_attachment" "github_actions_admin_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# =============================================================================
# min role (deploy 用) への policy attachment
# =============================================================================
# admin は付けず、deploy-aws-min.yml に必要な権限だけにする (ecr_push / ecs_deploy / deploy_min)。

# deploy-aws-min.yml 専用のポリシー (min 専用)。
# - api (Lambda) の環境変数の設定 → version の発行 → alias live の切り替え
# - Lambda の環境変数に入れる値を app secret から読む
# - migration の run-task に渡す VPC / subnet / security group をタグから引く
data "aws_iam_policy_document" "deploy_min" {
  statement {
    sid    = "DeployLambdaFunctions"
    effect = "Allow"
    actions = [
      "lambda:GetAlias",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:ListVersionsByFunction",
      "lambda:PublishVersion",
      "lambda:UpdateAlias",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
    ]
    resources = ["arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-min-*"]
  }

  statement {
    sid       = "ReadAppSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:*:${data.aws_caller_identity.current.account_id}:secret:/${var.project_name}-min/app-*"]
  }

  /**
   * EC2 の Describe 系は resource を絞れない (resource-level permission 非対応) ため "*"。読み取りのみ
   */
  statement {
    sid    = "ResolveNetwork"
    effect = "Allow"
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeVpcs",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "deploy_min" {
  name        = "${var.project_name}-deploy-min"
  description = "Policy for deploy-aws-min.yml (Lambda deploy, app secret read, network resolution)"
  policy      = data.aws_iam_policy_document.deploy_min.json
}

resource "aws_iam_role_policy_attachment" "ecr_push_min" {
  role       = aws_iam_role.github_actions_min.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

resource "aws_iam_role_policy_attachment" "ecs_deploy_min" {
  role       = aws_iam_role.github_actions_min.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}

resource "aws_iam_role_policy_attachment" "deploy_min" {
  role       = aws_iam_role.github_actions_min.name
  policy_arn = aws_iam_policy.deploy_min.arn
}

# =============================================================================
# min-terraform role (terraform plan / apply 用) への policy attachment
# =============================================================================

# env/min の terraform plan / apply 用。dev / prd と同じ理由で当面 admin で運用する
# (TODO は github_actions_admin_dev / github_actions_admin_prd と共通)。
resource "aws_iam_role_policy_attachment" "github_actions_admin_min_terraform" {
  role       = aws_iam_role.github_actions_min_terraform.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
