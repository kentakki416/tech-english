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

