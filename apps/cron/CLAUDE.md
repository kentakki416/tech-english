# apps/cron

定期実行タスク。**タスクを 1 回実行して exit する run-once モデル**で、常駐しない。本番は EventBridge Schedule → ECS Scheduled Task / Kubernetes CronJob から起動する。

## 含まれるタスク

| タスク | コマンド | 処理内容 |
| --- | --- | --- |
| `cleanup:old-memos` | `pnpm cleanup:old-memos` | `CLEANUP_MEMO_OLDER_THAN_DAYS`（既定 90）日より前の memo を一括削除 |
| `collect:passages` | `pnpm collect:passages [--source-id=N] [--dry-run]` | 有効なソースから英文を取得して本文候補（`passages`、`status = collected`）を作る（[content-collection](../../docs/spec/content-collection/README.md)）。`--source-id` で 1 ソースに絞り、`--dry-run`（`--source-id` 必須）は最大 5 件を取得して抽出結果を表示する（DB に書かない・無効のソースも可）。現状は `github_repository` のみで、`website` は warn を出して飛ばす |

## Commands

```bash
pnpm dev               # tsx watch で起動
pnpm cleanup:old-memos # タスクを 1 回実行
pnpm collect:passages --source-id=3 --dry-run  # 1 ソースの試し実行（DB に書かない）
pnpm test              # Vitest（DB client を mock するので DB 不要）
```

## レイヤード設計のルール

参考実装: `src/task/cleanup-old-memos.ts` / `src/service/memo/cleanup-old-memos.ts` / `src/repository/drizzle/memo-repository.ts`。

- **`task/<name>.ts`**: cron 1 本 = 1 ファイル。env を読んで DB client（Drizzle）と Repository を生成し service に DI するだけ。**閾値計算や件数集計などのドメインロジックを書かない**。サブディレクトリは切らない
- **`service/<domain>/`**: 業務ロジック。`export const` のアロー関数で、Repository は単一でも `repo: { xxxRepository }` のオブジェクト引数で受ける（将来増えてもシグネチャを変えずに済む）。**Repository class を service の中に書かない**
- **`repository/`**: interface は `repository/<name>.ts`、実装は `repository/drizzle/`（DI で使う）と `repository/prisma/`（切り替え先）。interface の引数・戻り値は `@repo/domain` の型か素の値にする。Drizzle / Prisma の型は実装クラスの内側に閉じる（`@repo/eslint-config/db-boundary` が lint で強制）
- **`lib/`**（任意）: env も DB も知らない純関数のみ
- **`client/<service>/`**（任意）: 外部 API クライアント。env を直接 import せずコンストラクタ DI（`fetch` もコンストラクタで差し替えられるようにしてテストで偽物を渡す）
- **`const/`**（任意）: タスク横断の定数（`const/collection.ts` の User-Agent・rate limit の閾値など）

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

### collect:passages（英文の収集）

| ファイル | 役割 |
| --- | --- |
| `client/github/` | `GitHubContentClient`（commits / git trees / contents の 3 API。`x-ratelimit-remaining` を保持）と `GitHubNotFoundError` / `GitHubRateLimitError` |
| `lib/path-filter.ts` | 対象パス / 除外パスの glob 判定（picomatch）と、glob の固定部分のディレクトリ |
| `lib/parse-collect-args.ts` / `lib/format-dry-run.ts` | 引数の解釈と試し実行の表示（純関数） |
| `service/collection/list-github-target-files.ts` | コミットのツリーから対象の `.md` / `.mdx` を列挙する。trees API が切り詰められたら glob の固定部分のディレクトリごとに取り直す |
| `service/collection/collect-github-source.ts` | 1 ソース分。blob SHA が変わったファイルだけ取得し、本文候補を挿入 → `markFetched` の順で保存する |
| `service/collection/collect-passages.ts` | 全ソース。ソースごとに try-catch し、失敗は `failedSourceIds` に集めて次へ（task が最後に exit 1） |
| `service/collection/preview-source.ts` | 試し実行。Repository の書き込みメソッドを呼ばない |
| `repository/{content-source,source-document,passage}-repository.ts` | cron 用の Repository（api の CRUD 用とは別） |

- **冪等**：`markFetched`（blob SHA の記録）は本文候補の挿入の後。途中で落ちても次回同じファイルをやり直し、挿入済みの本文候補は `passages.content_hash` の unique で弾く（`insertIgnoringDuplicates`）
- **`last_collected_commit_sha` は `completed` のときだけ更新**する。文書数・本文候補数の上限、rate limit、停止指示、ツリーの切り詰めで打ち切った場合は更新せず、次回は未処理（blob SHA が違う）ファイルだけを続きから処理する。上限は文書単位で判定し、1 文書の本文候補は途中で切らない
- **rate limit**：`x-ratelimit-remaining` が閾値（token ありは 100、token なしは 10。`const/collection.ts`）を切ったらそのソースを `rate_limited` で打ち切り、以降の GitHub のソースも飛ばす（rate limit は token 単位）。`GitHubRateLimitError` も失敗にしない
- 取得元から消えたファイルの `source_documents` / `passages` は何もしない（公開済みの問題は残す）

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
| `GITHUB_CONTENT_TOKEN` | no | - | collect:passages が GitHub API に使う token（公開リポジトリの読み取りだけを許可した fine-grained token）。未設定なら認証なし（60 req/h）で動き、起動時に warn を出す |
| `COLLECT_MAX_DOCUMENTS_PER_SOURCE` | no | `100` | collect:passages が 1 回の実行で 1 ソースから取得する文書数の上限 |
| `COLLECT_MAX_PASSAGES_PER_RUN` | no | `200` | collect:passages が 1 回の実行で作る本文候補の上限 |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## テスト戦略

- **Repository / Service / lib / client の unit test のみ**。DB client は `vi.fn()` で mock するので DB 不要。GitHub API は `fetch`（client のテスト）か client の偽物（service のテスト。`test/service/collection/helpers.ts`）に差し替える
- `lib/document` のテストは `test/fixtures/document/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 統合テストは無い（task はエントリポイントから直接 service を呼ぶフラットな構造のため）
- テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api` と同じ）
