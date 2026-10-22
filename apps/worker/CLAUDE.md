# apps/worker

BullMQ からジョブを取り出して処理する常駐型 worker。本番は ECS Service / Kubernetes Deployment を想定。

## 設計の核: Queue 実装を差し替え可能にする

**ジョブハンドラ（`src/jobs/*.ts`）は `@repo/queue` が公開する抽象（`JobProcessor<T>` / `JobMessage<T>`）しか知らない。** BullMQ の `Job` / `Worker` 型を直接 import してよいのは `packages/queue/src/bullmq-queue.ts` と `src/index.ts`（Redis 接続を作る箇所）だけ。

SQS / Cloud Tasks / pg-boss 等へ乗り換えるときは `packages/queue` に同じ `JobQueue<T>` を実装した別クラスを足し、`src/index.ts` の結線を差し替えるだけで、ジョブハンドラは無変更で済む。

## 含まれる Worker

| Queue 名 | ジョブ型 | 処理内容 |
| --- | --- | --- |
| `process-memo` | `ProcessMemoJobData = { memoId: number }` | memo を id で fetch してログ出力（メール送信 / 通知などに差し替える起点） |
| `track-event` | `TrackEventJobData = { events: [...] }` | 行動イベントをデータウェアハウスへ一括 INSERT。1 ジョブに複数イベントが入る |
| `collect-source` | `CollectSourceJobData = { runId: number }` | admin の今すぐ収集。api が作った収集の記録（`source_collection_runs`）を running にし、GitHub のソースを 1 つ収集して本文候補を作り、結果を記録に書く（[manual-collection](../../docs/spec/manual-collection/README.md)。下の「collect-source（英文の収集）」） |

## Commands

```bash
pnpm dev    # tsx watch で起動
pnpm test   # Vitest（DB / Redis を mock するので DB / Redis 不要）
```

## レイヤード設計のルール

参考実装: `src/jobs/process-memo.ts` / `src/workers/process-memo-worker.ts` / `src/index.ts`。

- **`jobs/<name>.ts`**: 純粋関数（`(deps) => JobProcessor<T>` の factory）。**BullMQ や ioredis を直接 import しない**
- **`workers/<name>-worker.ts`**: Queue 実装とジョブハンドラを結線するだけ。Queue 実装を切り替えるときの唯一の差分対象
- **`repository/`**: interface は `repository/<name>.ts`、DB の実装は `repository/drizzle/`。interface の引数・戻り値は `@repo/domain` の型にする。Drizzle の型は実装クラスの内側に閉じる（`@repo/eslint-config/db-boundary` が lint で強制。限界は `packages/eslint-config/README.md`）
- **`service/<domain>/`**（任意）: ジョブが使う業務ロジック。`export const` のアロー関数で、Repository は `repo: { xxxRepository }` のオブジェクト引数で受ける（cron と同じ）
- **`client/<service>/`**（任意）: 外部 API クライアント。env を直接 import せずコンストラクタ DI
- **`const/`**（任意）: ジョブ横断の定数
- **`runtime/`**: 起動・終了と、重い依存を使うときに読む仕組み（`runtime/collection.ts`）
- **`src/index.ts`**: 接続生成 → Repository インスタンス化 → Worker 起動 → graceful shutdown 登録。**どのデータウェアハウスを使うかを決めるのはここだけ**（`createDataWarehouse({ type: "clickhouse", ... })`）

Repository の interface は api / cron と意図的に分離する（各 app が必要な操作だけを持つ。共有すると不要なメソッドが漏れる）。一方ドメイン型は `@repo/domain` で共有する。

## 冪等性は必須

BullMQ の stalled 検出 / リトライ / ECS deploy 時の SIGKILL で **同じジョブが複数回実行されうる**。ジョブハンドラは再実行されても DB が壊れない設計にすること。

- read-only 処理は自然に冪等
- write は upsert / 既処理フラグ / 決定的キーでの dedupe で冪等化する
- exactly-once が必要なら DB 側で transactional outbox を組む（worker 単体では実現できない）

`src/runtime/graceful-shutdown.ts` は SIGTERM/SIGINT で全 `JobConsumer.close()`（in-flight ジョブの完了を待つ）→ DB/Redis 切断 → exit 0。1 ジョブの最大処理時間が ECS の `stop_timeout_seconds` を超えないよう設計する。

例外は `collect-source`（1 ソースの収集は数分かかり、停止の猶予〈既定 30 秒〉を超えうる）。超えて殺されたら、BullMQ の stalled で次の worker が同じジョブを取り直し、`claim` が `running` の記録を取り直して続きから収集する。収集は冪等（下の「collect-source」）なので、途中で殺されても壊れない。

## collect-source（英文の収集）

admin の「今すぐ収集」で、GitHub のソースを 1 つ収集する。cron の毎日の収集（`collect:passages`）をやめて、ここに移した（[manual-collection](../../docs/spec/manual-collection/README.md)）。

| ファイル | 役割 |
| --- | --- |
| `jobs/collect-source.ts` | ハンドラ。記録を `claim`（running）→ `collectSourceById` → `finish`（結果）。収集の失敗（rate limit・収集できないソース・GitHub の 404・想定外の例外）は記録に書いて正常に終える（BullMQ のリトライに回さない）。`claim` / `finish` の DB の失敗だけが throw されてリトライになる |
| `workers/collect-source-worker.ts` | concurrency 1（GitHub の rate limit は token 単位で、並べても速くならない） |
| `runtime/collection.ts` | 収集の service を、最初のジョブで `import()` で読む（`@repo/content-extractor` の index は jsdom も読むので、起動時に読まない） |
| `client/github/` | `GitHubContentClient`（commits / git trees / contents の 3 API。`x-ratelimit-remaining` を保持）と `GitHubNotFoundError` / `GitHubRateLimitError` |
| `service/collection/collect-source-by-id.ts` | 1 ソースの入口。収集できるか（`@repo/domain` の `findSourceNotCollectableReason`。api と同じ判定）を確かめてから `collectGitHubSource` を呼ぶ。できなければ `SourceNotCollectableError` |
| `service/collection/list-github-target-files.ts` | コミットのツリーから対象の `.md` / `.mdx` を列挙する。trees API が切り詰められたら glob の固定部分のディレクトリごとに取り直す |
| `service/collection/collect-github-source.ts` | 1 ソース分。最新コミットと抽出の版が前回と同じなら終える。ツリーの一覧に無い文書の `collected` を却下（`rejectOutOfTargetPassages`）→ blob SHA が変わったか抽出の版が古いファイルだけ取得し、本文候補を保存（`replacePassageCandidates`）→ `markFetched`（blob SHA・版）の順で保存する |
| `service/collection/replace-passage-candidates.ts` | 本文候補の保存。同じ見出しの生成中・生成した本文候補（下書き・公開済み・生成した後に却下したもの）がある塊は挿入せず、残りを挿入して、その文書の `collected` のうち挿入した塊に無いものを却下する |
| `service/collection/reject-out-of-target-passages.ts` | `collected` の本文候補を持つ文書（`findWithCollectedPassages`）のうち、収集の対象から外れたものの `collected` を却下する |
| `repository/{source,source-document,passage,source-collection-run}-repository.ts` | 収集用の Repository（api の CRUD・cron の問題の生成とは別） |

- **本文の抽出**：Markdown / MDX からの本文の抽出・切り分け（`extractDocument`・`EXTRACTION_VERSION`）と、対象パスの判定（`isTargetPath`）は [`packages/content-extractor`](../../packages/content-extractor/README.md)（api の URL からの取り込みと共有）
- **冪等**：`markFetched`（blob SHA・抽出の版の記録）は本文候補の置き換え（挿入と前の切り分けの却下）の後。途中で落ちても次回同じファイルをやり直し、挿入済みの本文候補は `passages.content_hash` の unique で弾く（`insertIgnoringDuplicates`）。却下は何度行っても結果が同じ。記録の結果は `claim` の時刻（`started_at`）をトークンにして書くので、取り直された後の古い実行は書かない
- **`last_collected_commit_sha`・`last_collected_extraction_version` は `completed` のときだけ（同じ UPDATE で）更新**する。文書数・本文候補数の上限、rate limit、ツリーの切り詰めで打ち切った場合は更新せず、次の収集で未処理（blob SHA か抽出の版が違う）ファイルだけを続きから処理する。上限は文書単位で判定し、1 文書の本文候補は途中で切らない。更新は収集を始めたときに読んだ値のままのときだけ行う（`markCollected` の楽観ロック）。収集の途中で admin が収集の範囲を変えて api が null に戻していたら書き戻さず、warn を出す
- **rate limit**：`x-ratelimit-remaining` が閾値（token ありは 100、token なしは 10。`const/collection.ts`）を切ったら `rate_limited` で打ち切る。`GitHubRateLimitError` も失敗にせず `rate_limited` にする
- **抽出の版（`EXTRACTION_VERSION`、`packages/content-extractor/src/document/const.ts`）**：`src/document` の変更のうち、ブロック・切り分け・本文候補の条件が変わるものをしたら上げる（実装した日の日付）。上げると、次にそのソースを収集したときに取得済みの文書を切り分け直す（毎日の収集は無いので、ソースごとに今すぐ収集を押す）。版は `source_documents.extraction_version` と `sources.last_collected_extraction_version` に記録する
- **古い本文候補の却下**：切り分け直した文書の `collected` のうち新しい本文候補に無いもの（`SUPERSEDED_PASSAGE_REJECT_REASON`）と、収集の対象から外れた文書（除外パス・対象パスから外した、取得元から消えた）の `collected`（`OUT_OF_TARGET_PASSAGE_REJECT_REASON`）を `rejected` にする。下書き・公開済み・生成中・失敗は変えない（公開済みの問題は取得元から消えても残す）。`source_documents` の行は消さない
- **サイトのクロール（website）はしない**：やめた理由と、戻すときに足し直すものは [github-only-collection](../../docs/spec/github-only-collection/README.md)。User-Agent は `TechEnglishBot/1.0 (+COLLECT_WEB_CONTACT_URL)`（未設定なら `TechEnglishBot/1.0`）で、GitHub API に送る
- **テスト**：GitHub API は `fetch`（client のテスト）か client の偽物（service のテスト。`test/service/collection/helpers.ts`）に差し替える。**実在のリポジトリにリクエストを送るテストは書かない**。記録の `claim` / `finish` の SQL は文字列までなので、変えたらローカル DB で確かめる（`queued` が `running` になる・`failed` は取れない・古い `started_at` では書かれない）

### ESM 専用の依存（require(esm)）

`@repo/content-extractor` が使う unified / remark / rehype は ESM 専用で配布されていて、実行時は Node の `require(esm)` で読む。**Node 20.19 以上が必要**（Dockerfile は `node:20-slim`。詳細は [`packages/content-extractor`](../../packages/content-extractor/README.md#esm-専用の依存requireesm)）。

- ビルド後に読めるかの確認: `pnpm build && node -e "require('./dist/service/collection/collect-source-by-id')"`

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `NODE_ENV !== "test"` で必須 | - | DB の接続文字列 |
| `DATA_WAREHOUSE_TYPE` | no | `clickhouse` | `clickhouse` / `none`。`none` は何も書き込まない実装になる |
| `DATA_WAREHOUSE_URL` | `DATA_WAREHOUSE_TYPE === "clickhouse"` かつ `NODE_ENV !== "test"` で必須 | - | データウェアハウスの接続 URL。**技術名を入れていない**のはバックエンドを差し替えても env を変えずに済ませるため |
| `DATA_WAREHOUSE_DATABASE` | no | `tech_english` | DB 名 |
| `DATA_WAREHOUSE_USER` | no | `default` | ユーザー名 |
| `DATA_WAREHOUSE_PASSWORD` | no | `password` | パスワード |
| `REDIS_URL` | `NODE_ENV !== "test"` で必須 | - | BullMQ 用 Redis |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |
| `WORKER_CONCURRENCY` | no | `10` | 1 worker あたりの同時並行ジョブ数（`collect-source` は 1 固定） |
| `GITHUB_CONTENT_TOKEN` | no | - | collect-source が GitHub API に使う token（公開リポジトリの読み取りだけを許可した fine-grained token）。未設定なら認証なし（60 req/h）で動き、起動時に warn を出す |
| `COLLECT_MAX_DOCUMENTS_PER_SOURCE` | no | `100` | collect-source が 1 回の収集（1 ソース）で取得する文書数の上限 |
| `COLLECT_MAX_PASSAGES_PER_RUN` | no | `200` | collect-source が 1 回の収集（1 ソース）で作る本文候補の上限 |
| `COLLECT_WEB_CONTACT_URL` | no | - | 収集のリクエスト（GitHub API）の User-Agent に入れるサービスのトップの URL（`TechEnglishBot/1.0 (+{url})`）。未設定なら `TechEnglishBot/1.0` だけを送る |

### データウェアハウスを持たない環境

`DATA_WAREHOUSE_TYPE=none` にすると `NoopDataWarehouse` が DI され、行動イベントの
insert がスキップされる（ジョブは成功扱いで completed になる）。AWS では Terraform の
`enable_data_warehouse = false` の環境（既定は dev / min）がこの設定になる。分析価値の無い環境の
ために ClickHouse を持たないための逃げ道。

**イベントを記録する環境で `none` にしてはいけない。** 呼び出し側から見ると insert は成功するので、
設定を間違えるとイベントが無言で消える。気付けるように insert のたびに
`data warehouse is disabled, skipped insert` を debug ログに出している。

## 新 Queue の追加

`process-memo` 一式（`packages/queue/src/jobs/process-memo.ts` / `src/jobs/process-memo.ts` / `src/workers/process-memo-worker.ts`）をコピーして名前を変えるのが早い。手順:

1. `packages/queue/src/jobs/<name>.ts` に queue 名と Job 型を定義し、`jobs/index.ts` で re-export
2. `src/jobs/<name>.ts` に純粋ハンドラを書く（`@repo/queue` の型だけ import）
3. `src/workers/<name>-worker.ts` で `startBullMQWorker` と結線する
4. `src/index.ts` の `consumers` 配列に追加する

enqueue 側（api 等）は `BullMQJobQueue` を作って `enqueue(data)` するだけ。
