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
| clickhouse-migration | 設計中 | ClickHouse のテーブル・view を版管理して local / dev / min / prd に適用する migration コマンドを用意し、deploy に組み込む。ClickHouse と CDC（Postgres → ClickHouse）を作るかを環境ごとに Terraform のフラグ（`enable_data_warehouse` / `enable_cdc`）で選ぶ | [./clickhouse-migration/README.md](./clickhouse-migration/README.md) |
| vocabulary-cards | 完了 | 単語帳。解答中に調べた単語と、解いた問題の用語集の単語をカードで復習する。表で意味を思い出してめくり、「覚えた / まだ」で次に出す日を延ばす（間隔反復）。web と mobile。単語帳で答えた日も学習した日に数える | [./vocabulary-cards/README.md](./vocabulary-cards/README.md) |
| vocabulary-pronunciation | 実装中 | 単語帳のカードで単語の発音と本文の 1 文を音声で聞く。単語は見出し語ごとに Amazon Polly で作り置いて全ユーザーで使い回し（cron で 1 時間ごと）、1 文は読み上げの段落の音声から区間を切り出す。ボタンを押したときだけ鳴らす。web と mobile。残りは step6（cron の S3 の権限と 1 時間ごとのスケジュール。AWS の設定の後） | [./vocabulary-pronunciation/README.md](./vocabulary-pronunciation/README.md) |
| admin-dashboard | 設計中 | admin のトップのダッシュボード。全体の利用状況（登録・学習したユーザー・解いた回数・正答率・アシストの利用率と推移）、問題ごとの成績、設問ごとの選択肢の割合と要確認の印。期間は直近 7 日・30 日・全期間。Postgres をその場で集計する | [./admin-dashboard/README.md](./admin-dashboard/README.md) |
| source-tags | 設計中 | ソースの技術タグを admin の「タグ」で登録したものから選ぶようにし、`React` と `react` のような表記ゆれを防ぐ（大文字・小文字を区別せずに一意）。タグの色は 10 色のパレットから自動で割り当て、admin でだけ色付きで出す。web / mobile は変えない | [./source-tags/README.md](./source-tags/README.md) |
| admin-users | 設計中 | admin のユーザー管理（見るだけ）。ユーザー一覧（絞り込み・並べ替え）と、1 人の学習の状況（マイページと同じ集計を使い回す）。利用停止・削除は MVP 対象外 | [./admin-users/README.md](./admin-users/README.md) |
| dev-login | 完了 | 開発環境専用ログイン。Google OAuth を介さず seed 済み dev ユーザー（alice/bob）として 1 クリックでログインできる | [./dev-login/README.md](./dev-login/README.md) |

## ステータスの定義

- **設計中**: `docs/spec/{feature}/README.md` および `tasks/step*.md` を作成中。実装には未着手
- **実装中**: 設計が完了し、コードを実装中。一部の step が完了している場合もこのステータス
- **完了**: 全 step が実装され、テストが通っている

## 運用ルール

- 新機能を作るときは `design-feature` skill を使い、このファイルにエントリを必ず追加する
- ステータスが変わったらこのファイルも更新する
- 不要になった機能は削除し、過去の経緯を `docs/spec/{feature}/README.md` に記録してから機能ディレクトリ自体をアーカイブ（必要に応じて）
