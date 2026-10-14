# apps/cron

定期実行されるタスク群を 1 つの Node.js プロセスにまとめたパッケージ。

## 目次

- [タスク一覧](#タスク一覧)
- [セットアップ](#セットアップ)
- [スケジュール（TODO）](#スケジュールtodo)

## タスク一覧

| コマンド | 用途 |
| --- | --- |
| `pnpm cleanup:old-memos` | 古い memo を一括削除する DB cleanup の例 |
| `pnpm collect:passages` | 有効なソース（GitHub リポジトリ・公式ドキュメントのサイト）から英文を取得して本文候補を作る。`--source-id=N` で 1 ソースに絞る。`--source-id=N --dry-run` は最大 5 件を取得して抽出結果を表示する（DB に書かない） |

環境変数は [CLAUDE.md の環境変数](./CLAUDE.md#環境変数) を参照（collect:passages は `GITHUB_CONTENT_TOKEN`・`COLLECT_MAX_DOCUMENTS_PER_SOURCE`・`COLLECT_MAX_PASSAGES_PER_RUN`・`COLLECT_WEB_REQUEST_INTERVAL_MS`・`COLLECT_WEB_REFETCH_DAYS`・`COLLECT_WEB_CONTACT_URL`）。

## セットアップ

```bash
# ルートで一度だけ
pnpm install
pnpm --filter @repo/db prisma:generate
```

## スケジュール（TODO）

スケジューラ側 (EventBridge / GitHub Actions / Kubernetes CronJob) の設定は本リポジトリにまだ含めていません。本番運用時は以下のいずれかで定期起動する想定:

- **AWS**: EventBridge Schedule → ECS Scheduled Task で `node dist/task/<name>.js` を起動
- **GitHub Actions**: `.github/workflows/cron-*.yml` で `schedule:` トリガーを設定し `pnpm --filter cron <task>` を実行
- **Kubernetes**: CronJob で `node dist/task/<name>.js`

