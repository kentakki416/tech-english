# 機能仕様クイックリファレンス

このプロジェクトで実装されている / 設計中の機能の一覧です。各機能の詳細は `./{feature}/README.md` を参照してください。

このファイルは `design-feature` skill で新機能を設計するたびに更新されます。

## 目次

- [機能一覧](#機能一覧)
- [ステータスの定義](#ステータスの定義)
- [運用ルール](#運用ルール)

## 機能一覧

| 機能名 | ステータス | 概要 | リンク |
|---|---|---|---|
| product-overview | 実装中 | エンジニア向け英語長文読解サービスの全体像。用語、機能の分割、MVP の範囲（web + mobile）、アプリ間の役割分担。個々の機能 spec の索引。残りは各機能のインフラ（AWS の設定の後） | [./product-overview/README.md](./product-overview/README.md) |
| github-auth | 完了 | GitHub ログインとアカウント削除（web / mobile）。mobile は web の callback のサブパスを経由して app に戻し、PKCE で保護する。削除は `users` の物理削除 + cascade | [./github-auth/README.md](./github-auth/README.md) |
| content-collection | 完了 | 管理者が登録した、ライセンスが明確な GitHub リポジトリの Markdown と公式ドキュメントのサイト（HTML）を cron で収集し、200〜600 語の本文候補に切り分ける | [./content-collection/README.md](./content-collection/README.md) |
| question-generation | 実装中 | Claude API で 4 択の設問・解説・段落の和訳・用語集を生成し、管理者が admin で確認・修正してから公開する。問題データの正本。残りは step7（cron のスケジュール。AWS の設定の後） | [./question-generation/README.md](./question-generation/README.md) |
| reading-practice | 完了 | 問題を解く・採点・解説。制限時間（超過しても続行可）、段落の和訳と単語タップのアシスト、ダークテーマの解答画面 | [./reading-practice/README.md](./reading-practice/README.md) |
| learning-record | 完了 | マイページ。GitHub の草のような学習カレンダー、連続学習日数、週の目標と進捗、学習履歴 | [./learning-record/README.md](./learning-record/README.md) |
| read-aloud | 実装中 | 問題の本文を Amazon Polly（Neural）で読み上げ、単語をハイライトする。音声は公開後に cron で 1 度だけ作って S3 に置く。解答中は 3 つめのアシストとして数える。残りは step8（音声の S3・CloudFront・cron のスケジュール。AWS の設定の後） | [./read-aloud/README.md](./read-aloud/README.md) |
| study-reminder | 完了 | mobile のみのリマインダー。設定はアカウントに保存し、端末のローカル通知で毎週の曜日・時刻に通知する | [./study-reminder/README.md](./study-reminder/README.md) |
| user-behavior-events | 設計中 | ユーザー行動を時系列イベントとして ClickHouse に蓄積する。DB に痕跡が残らない操作（削除・閲覧・離脱）を優先して記録し、運用ログとは別系統にする | [./user-behavior-events/README.md](./user-behavior-events/README.md) |
| minimal-deploy | 実装中 | アイドル時の固定費をほぼゼロにした本番構成（Lambda + API Gateway + PlanetScale + Upstash、月 ~$7。worker は必要なときだけ Fargate Spot で作る）。実装は env で切り替え、同じアプリ・同じイメージを minimal と prd（ECS）の両方にデプロイできるようにする | [./minimal-deploy/README.md](./minimal-deploy/README.md) |
| dev-login | 完了 | 開発環境専用ログイン。Google OAuth を介さず seed 済み dev ユーザー（alice/bob）として 1 クリックでログインできる | [./dev-login/README.md](./dev-login/README.md) |

## ステータスの定義

- **設計中**: `docs/spec/{feature}/README.md` および `tasks/step*.md` を作成中。実装には未着手
- **実装中**: 設計が完了し、コードを実装中。一部の step が完了している場合もこのステータス
- **完了**: 全 step が実装され、テストが通っている

## 運用ルール

- 新機能を作るときは `design-feature` skill を使い、このファイルにエントリを必ず追加する
- ステータスが変わったらこのファイルも更新する
- 不要になった機能は削除し、過去の経緯を `docs/spec/{feature}/README.md` に記録してから機能ディレクトリ自体をアーカイブ（必要に応じて）
