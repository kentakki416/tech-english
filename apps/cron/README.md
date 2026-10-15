# apps/cron

定期実行されるタスク群を 1 つの Node.js プロセスにまとめたパッケージ。

## 目次

- [タスク一覧](#タスク一覧)
- [セットアップ](#セットアップ)
- [コーディング規約](#コーディング規約)
- [スケジュール（TODO）](#スケジュールtodo)

## タスク一覧

| コマンド | 用途 |
| --- | --- |
| `pnpm cleanup:old-memos` | 古い memo を一括削除する DB cleanup の例 |
| `pnpm collect:passages` | 有効なソース（GitHub リポジトリ・公式ドキュメントのサイト）から英文を取得して本文候補を作る。`--source-id=N` で 1 ソースに絞る。`--source-id=N --dry-run` は最大 5 件を取得して抽出結果を表示する（DB に書かない） |
| `pnpm generate:questions` | 本文候補（`collected`）から Claude API で設問・和訳・用語集を生成し、解答キーを見ない検証をして下書き（`draft`）にする。`--passage-id=N` で 1 件だけ。`ANTHROPIC_API_KEY` が必要 |
| `pnpm generate:audio` | 公開済みの問題の読み上げの音声（mp3 と単語の時刻）を Amazon Polly で作る。`production` 以外は既定で無音の mp3 を作り、リポジトリ直下の `.storage/audio/` に保存する（Polly を呼ぶのは `TTS_PROVIDER=polly` を明示したときだけ） |
| `pnpm generate:word-audio` | 単語帳に出うる見出し語（調べた単語のうち英和辞書と一致するもの・公開中の問題の用語集の語句）の発音の mp3 を Amazon Polly で作る。保存先・fake の扱いは generate:audio と同じ |

環境変数は [CLAUDE.md の環境変数](./CLAUDE.md#環境変数) を参照（collect:passages は `GITHUB_CONTENT_TOKEN`・`COLLECT_MAX_DOCUMENTS_PER_SOURCE`・`COLLECT_MAX_PASSAGES_PER_RUN`・`COLLECT_WEB_REQUEST_INTERVAL_MS`・`COLLECT_WEB_REFETCH_DAYS`・`COLLECT_WEB_CONTACT_URL`、generate:questions は `ANTHROPIC_API_KEY`・`GENERATION_MODEL`・`VERIFICATION_MODEL`・`GENERATE_MAX_PASSAGES_PER_RUN`・`GENERATE_MAX_PENDING_DRAFTS`、generate:audio は `TTS_PROVIDER`・`TTS_VOICE_ID`・`AWS_REGION`・`AUDIO_MAX_PASSAGES_PER_RUN`・`AUDIO_MONTHLY_CHARACTER_LIMIT`・`AUDIO_STORAGE_TYPE`・`AUDIO_STORAGE_LOCAL_DIR`・`AUDIO_STORAGE_S3_BUCKET`、generate:word-audio は `WORD_AUDIO_MAX_PER_RUN` と、`AUDIO_MAX_PASSAGES_PER_RUN` を除く generate:audio の `TTS_*`・`AWS_REGION`・`AUDIO_*` を共有）。

## セットアップ

```bash
# ルートで一度だけ
pnpm install
```

## コーディング規約

- **`task/<name>.ts`**: cron 1 本 = 1 ファイル。`runTask` で包み、受け取った DB client で Repository を、env から外部 API のクライアントを組み立てて service に DI するだけで、閾値計算や件数集計などのロジックは書かない
- **`service/<domain>/`**: ロジックはここに集約する。env や DB client は直接触らず、現在時刻・閾値などの入力と Repository（と外部 API のクライアント）を引数で受ける（task と unit test から同じ形で呼べる）。Repository は 1 つでも `repo: { xxxRepository }` のオブジェクトで受ける
- **`repository/`**: interface は `repository/<name>.ts`、Drizzle 実装は `repository/drizzle/`。interface は api / worker と共有せず、cron が使う batch 系の操作だけを持つ
- **env**: `src/env.ts` は import した時点で検証し、不正なら exit 1 で止まる。task は先頭で `import { env } from "../env"` するだけでよい
- **失敗と中断**: 失敗は throw するだけでよい。DB の切断と終了コード（失敗は 1、シグナルによる中断は `128 + シグナル番号`）は `src/run-task.ts` が持つ
- **中断に備える**: シグナルを受けると task の完了を待たずに終了する（実行中のクエリ・トランザクションの完了を待ってから切断する）。ループの中でシグナルを見て break する処理は書かず、途中で止まっても次の実行で続きから拾い直せる処理にする（冪等な書き込み、確保した行を 30 分後に回収する など）
- **コメント**: 層の責務や DI の流れ、終了コードの扱いなど、コードを読めば分かることはコメントに書かない。共通の決まりはこの規約に書く

## スケジュール（TODO）

スケジューラ側 (EventBridge / GitHub Actions / Kubernetes CronJob) の設定は本リポジトリにまだ含めていません。本番運用時は以下のいずれかで定期起動する想定:

- **AWS**: EventBridge Schedule → ECS Scheduled Task で `node dist/task/<name>.js` を起動
- **GitHub Actions**: `.github/workflows/cron-*.yml` で `schedule:` トリガーを設定し `pnpm --filter cron <task>` を実行
- **Kubernetes**: CronJob で `node dist/task/<name>.js`

