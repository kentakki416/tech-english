# infra/terraform

本プロジェクトの Terraform IaC ディレクトリ。**初回セットアップ手順は [`docs/setup/infra.md`](../../docs/setup/infra.md) を参照**。本ドキュメントは構成と日常運用コマンドのみまとめる。

## 目次

- [外部ツール](#外部ツール)
- [関連ドキュメント](#関連ドキュメント)

## 外部ツール

- **[Trivy](https://trivy.dev/)**: Aqua Security 製の OSS セキュリティスキャナ。Terraform 設定ファイルのミスコンフィグや脆弱性を検出する
- **[TFLint](https://github.com/terraform-linters/tflint)**: Terraform 専用のリンター。非推奨構文やプロバイダ固有のルール違反を検出する

```bash
brew install terraform tflint trivy
```

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`../../docs/setup/infra.md`](../../docs/setup/infra.md) | **初回セットアップ手順** |
| [`CLAUDE.md`](CLAUDE.md) | 層構造 / CI ワークフロー / OIDC role 復旧手順 |
| [`../README.md`](../README.md) | インフラ構成 / dev・prd の差分 / デプロイフロー |
| [AWS インフラ構成図](./aws/aws-dev-infrastructure.drawio) | drawio 形式の AWS インフラ構成図（dev 環境） |
