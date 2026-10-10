# apps/cron

定期実行タスク。**タスクを 1 回実行して exit する run-once モデル**で、常駐しない。本番は EventBridge Schedule → ECS Scheduled Task / Kubernetes CronJob から起動する。

## 含まれるタスク

| タスク | コマンド | 処理内容 |
| --- | --- | --- |
| `cleanup:old-memos` | `pnpm cleanup:old-memos` | `CLEANUP_MEMO_OLDER_THAN_DAYS`（既定 90）日より前の memo を一括削除 |

## Commands

```bash
pnpm dev               # tsx watch で起動
pnpm cleanup:old-memos # タスクを 1 回実行
pnpm test              # Vitest（DB client を mock するので DB 不要）
```

## レイヤード設計のルール

参考実装: `src/task/cleanup-old-memos.ts` / `src/service/memo/cleanup-old-memos.ts` / `src/repository/drizzle/memo-repository.ts`。

- **`task/<name>.ts`**: cron 1 本 = 1 ファイル。env を読んで DB client（Drizzle）と Repository を生成し service に DI するだけ。**閾値計算や件数集計などのドメインロジックを書かない**。サブディレクトリは切らない
- **`service/<domain>/`**: 業務ロジック。`export const` のアロー関数で、Repository は単一でも `repo: { xxxRepository }` のオブジェクト引数で受ける（将来増えてもシグネチャを変えずに済む）。**Repository class を service の中に書かない**
- **`repository/`**: interface は `repository/<name>.ts`、実装は `repository/drizzle/`（DI で使う）と `repository/prisma/`（切り替え先）。interface の引数・戻り値は `@repo/domain` の型か素の値にする。Drizzle / Prisma の型は実装クラスの内側に閉じる（`@repo/eslint-config/db-boundary` が lint で強制）
- **`lib/`**（任意）: env も DB も知らない純関数のみ
- **`client/<service>/`**（任意）: 外部 API クライアント。env を直接 import せずコンストラクタ DI

Repository の interface は api / worker と意図的に分離する（api は CRUD、cron は batch 系と操作セットが違うため）。一方ドメイン型は `@repo/domain` で共有する。

### lib/document（文書パーサー）

Markdown / MDX / HTML から本文を抽出し、200〜600 語の本文候補に切り分ける純関数（[content-collection](../../docs/spec/content-collection/README.md#本文の抽出と解析)）。外から呼ぶのは `extractDocument` だけ（`src/lib/document/index.ts`）。

| ファイル | 役割 |
| --- | --- |
| `parse-markdown.ts` | unified + remark-parse / frontmatter / gfm（`.mdx` は remark-mdx）で mdast に。タイトルは frontmatter の `title` → 最初の h1 |
| `parse-html.ts` | jsdom（スクリプトは実行しない）で DOM に → 本文の CSS セレクタ or Readability で本文を取り出す → rehype-remark で mdast に |
| `convert-mdast-to-blocks.ts` | mdast → `PassageBlock[]`（見出しの深さつき） |
| `split-into-chunks.ts` / `passage-rules.ts` | 見出し単位の切り分けと結合、本文候補の条件（英単語数・コードの割合・英語・文章） |
| `content-hash.ts` | 正規化テキストの SHA-256（`passages.content_hash` / `source_documents.content_hash`） |

壊れた MDX と不正な CSS セレクタは throw する。呼び出し側（task / service）が文書単位の失敗として扱う。

## ESM 専用の依存（require(esm)）

cron は CommonJS でビルドするが、unified / remark / rehype は ESM 専用で配布されている。そのため:

- `tsconfig.json` は `"module": "nodenext"` / `"moduleResolution": "nodenext"`（TypeScript 5.8 以降は CommonJS から ESM の import を許す）
- 実行時は Node の `require(esm)` で読む。**Node 20.19 以上 / 22.12 以上が必要**（Dockerfile は `node:22-slim`）
- `jsdom` は v29 に固定している。v30 は Node `^22.22.2 || ^24.15.0 || >=26` を要求し、CI（Node 20）で動かないため
- ビルド後に読めるかの確認: `pnpm build && node -e "require('./dist/lib/document')"`

## 中断は失敗として扱う

run-once モデルなので、**処理の途中でシグナルを受けて終了した場合はタスクが未完了**を意味する。ここで exit 0 を返すとスケジューラが成功と誤認し、削除が途中で止まっても次回まで気付けない。

`src/runtime/graceful-shutdown.ts` は中断時に **非 0（`128 + シグナル番号`。SIGTERM=143 / SIGINT=130）で終了する**。戻り値の `isShuttingDown` は長時間ループや batch で各 iteration の頭をチェックして自発的に break するために使う。

タスク失敗時は `throw` してプロセスを exit code 1 で終わらせ、スケジューラに通知する。

## 環境変数

`src/env.ts` に Zod スキーマをインラインで定義し、import 時に `safeParse` → 失敗なら `process.exit(1)`。

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `NODE_ENV !== "test"` で必須 | - | DB の接続文字列 |
| `CLEANUP_MEMO_OLDER_THAN_DAYS` | no | `90` | 削除対象とする経過日数 |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## テスト戦略

- **Repository / Service / lib の unit test のみ**。DB client は `vi.fn()` で mock するので DB 不要
- `lib/document` のテストは `test/fixtures/document/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 統合テストは無い（task はエントリポイントから直接 service を呼ぶフラットな構造のため）
- テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api` と同じ）
