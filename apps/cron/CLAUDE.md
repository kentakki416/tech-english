# apps/cron

定期実行タスク。**タスクを 1 回実行して exit する run-once モデル**で、常駐しない。本番は EventBridge Schedule → ECS Scheduled Task / Kubernetes CronJob から起動する。

## 含まれるタスク

| タスク | コマンド | 処理内容 |
| --- | --- | --- |
| `cleanup:old-memos` | `pnpm cleanup:old-memos` | `CLEANUP_MEMO_OLDER_THAN_DAYS`（既定 90）日より前の memo を一括削除 |
| `collect:passages` | `pnpm collect:passages [--source-id=N] [--dry-run]` | 有効なソースから英文を取得して本文候補（`passages`、`status = collected`）を作る（[content-collection](../../docs/spec/content-collection/README.md)）。`--source-id` で 1 ソースに絞り、`--dry-run`（`--source-id` 必須）は最大 5 件を取得して抽出結果を表示する（DB に書かない・無効のソースも可）。`github_repository`（GitHub API）と `website`（公式ドキュメントのサイトのクロール）の両方を扱う |

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
| `markdown-jsx.ts` | `.md` に混ざった MDX の書き方の処理（react.dev の `.md` など）。MDX のコメント（`{/* ... */}`。見出しのアンカーなど）をコード・インラインコードの外で消し、HTML ブロックで書かれたコンポーネントの開始タグから終了タグまでを `mdxJsxFlowElement` にまとめる（HTML ブロックの中の Markdown は読み直す） |
| `parse-html.ts` | jsdom（スクリプトは実行しない）で DOM に → 本文の CSS セレクタ or Readability で本文を取り出す → rehype-remark で mdast に |
| `convert-mdast-to-blocks.ts` | mdast → `PassageBlock[]`（見出しの深さつき）。JSX のコンポーネントは `const.ts` の `PROSE_COMPONENT_NAMES`（`<Intro>` / `<Note>` / `<Pitfall>` / `<DeepDive>` / `<Recap>` / `<YouWillLearn>`）だけタグを除いて中身を残し、それ以外（`<Sandpack>` / `<Diagram>` / `<Challenges>` など）は中身ごと捨てる。`.mdx` と `.md` で同じ規則 |
| `split-into-chunks.ts` / `passage-rules.ts` | 見出し単位の切り分けと結合、本文候補の条件（英単語数・コードの割合・英語・文章） |
| `content-hash.ts` | 正規化テキストの SHA-256（`passages.content_hash` / `source_documents.content_hash`） |

壊れた MDX と不正な CSS セレクタは throw する。呼び出し側（task / service）が文書単位の失敗として扱う。`.md` は素の Markdown として読むので、閉じられていないコンポーネントは throw せず、タグだけ無かったことにして中身を残す。

### collect:passages（英文の収集）

| ファイル | 役割 |
| --- | --- |
| `client/github/` | `GitHubContentClient`（commits / git trees / contents の 3 API。`x-ratelimit-remaining` を保持）と `GitHubNotFoundError` / `GitHubRateLimitError` |
| `client/web/` | `WebPageClient`（1 ソースにつき 1 つ。robots.txt・リクエストの間隔・取得先の制限・条件付きリクエスト・sitemap）、`safe-lookup.ts`（接続のときに名前解決したアドレスを検査する lookup）、`BlockedUrlError` / `WebSourceThrottledError` / `CrawlDelayTooLongError` |
| `lib/path-filter.ts` | 対象パス / 除外パスの glob 判定（picomatch）と、glob の固定部分のディレクトリ |
| `lib/url.ts` / `lib/parse-sitemap.ts` | ページの URL の正規化（クエリ・フラグメントを除く。https のみ）と取得しない拡張子、sitemap（urlset / sitemapindex）の解析（jsdom の XML モード） |
| `lib/parse-collect-args.ts` / `lib/format-dry-run.ts` | 引数の解釈と試し実行の表示（純関数） |
| `service/collection/list-github-target-files.ts` | コミットのツリーから対象の `.md` / `.mdx` を列挙する。trees API が切り詰められたら glob の固定部分のディレクトリごとに取り直す |
| `service/collection/collect-github-source.ts` | 1 ソース分。blob SHA が変わったファイルだけ取得し、本文候補を挿入 → `markFetched` の順で保存する |
| `service/collection/collect-website-source.ts` | サイトの 1 ソース分。robots.txt → sitemap / 開始ページから URL を発見（`upsertDiscovered`）→ 取得待ちの行（`findFetchQueue`）を条件付きリクエストで取得 → 200 はリンクを発見し、本文のハッシュが変わっていれば本文候補を挿入 → `markFetched`。304 / エラー / 取得できなかったページ / 抽出に失敗したページは `markResponse` |
| `service/collection/website-pages.ts` | 取得してよいページの判定（同じオリジン・ページの拡張子・対象パス・robots.txt）、開始ページの path、HTML の抽出（収集と試し実行で共有） |
| `service/collection/collect-passages.ts` | 全ソース。ソースごとに try-catch し、失敗は `failedSourceIds` に集めて次へ（task が最後に exit 1） |
| `service/collection/preview-source.ts` | 試し実行。Repository の書き込みメソッドを呼ばない。サイトは sitemap があればその先頭から、無ければ開始ページからリンクを幅優先でたどって取得する（開始ページを含めて 5 ページまで。条件付きヘッダは付けない） |
| `repository/{content-source,source-document,passage}-repository.ts` | cron 用の Repository（api の CRUD 用とは別） |

- **冪等**：`markFetched`（blob SHA の記録）は本文候補の挿入の後。途中で落ちても次回同じファイルをやり直し、挿入済みの本文候補は `passages.content_hash` の unique で弾く（`insertIgnoringDuplicates`）
- **`last_collected_commit_sha` は `completed` のときだけ更新**する。文書数・本文候補数の上限、rate limit、停止指示、ツリーの切り詰めで打ち切った場合は更新せず、次回は未処理（blob SHA が違う）ファイルだけを続きから処理する。上限は文書単位で判定し、1 文書の本文候補は途中で切らない。更新は収集を始めたときに読んだ値のままのときだけ行う（`markCollected` の楽観ロック）。収集の途中で admin が収集の範囲を変えて api が null に戻していたら書き戻さず、warn を出す
- **rate limit**：`x-ratelimit-remaining` が閾値（token ありは 100、token なしは 10。`const/collection.ts`）を切ったらそのソースを `rate_limited` で打ち切り、以降の GitHub のソースも飛ばす（rate limit は token 単位）。`GitHubRateLimitError` も失敗にしない
- 取得元から消えたファイルの `source_documents` / `passages` は何もしない（公開済みの問題は残す）

**サイトのクロール（website）**：`source_documents` をクロールの待ち行列として使う（[content-collection のサイトのクロール](../../docs/spec/content-collection/README.md#サイトのクロール)）。

- **待ち行列**：見つけた URL（sitemap の取得してよい URL・開始ページ・200 のページのリンク）を未取得の行として入れ、毎回「未取得 → `sitemap_lastmod` が前回の取得より新しい → `COLLECT_WEB_REFETCH_DAYS` 日より前に取得」の順に `COLLECT_MAX_DOCUMENTS_PER_SOURCE` 件まで取る。`path` は URL の pathname で、取得する URL は `site_url` のオリジン + path
- **304 / 同じハッシュ**：前回の `ETag` / `Last-Modified` で条件付きリクエストし、304 は `fetched_at` だけ更新する。200 でも本文のハッシュ（`source_documents.content_hash`）が前回と同じなら本文候補を作らない。対象パス外の開始ページと、リダイレクトの行き先が対象パス外・除外パス・ページでない拡張子のページはリンクだけ使う
- **抽出の失敗**：本文の抽出が throw したページ（不正な CSS セレクタなど）は `ETag` / `Last-Modified` / ハッシュを保存せず `markResponse` する（保存すると 304 で止まり、セレクタを直しても抽出し直されない）。api はセレクタが変わったソースの `etag` / `last_modified` / `content_hash` を消す
- **404 / 410** は `http_status` に記録して待ち行列から外す。sitemap の lastmod が新しくなるか、200 のページのリンクで再び見つかったら `http_status` を NULL に戻す
- **429 / 503**（`WebSourceThrottledError`）はそのソースを `throttled` で打ち切る（失敗にしない。`Retry-After` は待たずに次回の実行で再開する）。**取得できなかった行**（429 / 503 とネットワークエラー）も `fetched_at` に試した時刻を入れて待ち行列から外す（`COLLECT_WEB_REFETCH_DAYS` 日後に取り直す。入れないと同じ行が毎回先頭に来て、取得できないページがソース全体を止める）。ネットワークエラーが `MAX_CONSECUTIVE_NETWORK_ERRORS`（3）回続いたらソースの失敗にする
- **`last_collected_at`**：サイトは `completed` / `limit_reached` のときだけ進める（`throttled` / `crawl_delay_too_long` / `interrupted` では進めない）
- **礼儀正しさ**：robots.txt を毎回読んで守る（照合名は `TechEnglishBot`。4xx は全許可、5xx・ネットワークエラーは throw、429 / 503 は throttled）。同じオリジンへのリクエストは直列で、前回の開始から `max(COLLECT_WEB_REQUEST_INTERVAL_MS, Crawl-delay)` 空ける。`Crawl-delay` が `MAX_CRAWL_DELAY_SECONDS`（30 秒。`const/collection.ts`）を超えるサイトは、従うと処理が長時間止まるので warn を出してそのソースを `crawl_delay_too_long` で打ち切る（失敗にしない。`CrawlDelayTooLongError`。試し実行では throw してエラーを表示する）。タイムアウト 10 秒、`text/html` かつ 2MB 以下だけ受け取る。User-Agent は `TechEnglishBot/1.0 (+COLLECT_WEB_CONTACT_URL)`（未設定なら `TechEnglishBot/1.0`。GitHub API も同じ）
- **取得先の制限（SSRF 対策）**：① リクエストの前（リダイレクト先も）に https かつ `site_url` と同じオリジンかを確かめる（IP アドレスのホストはここで範囲も確かめる。net.connect は IP アドレスに lookup を呼ばないため）② undici の `Agent` の `connect.lookup` に `createSafeLookup` を渡し、接続のときに名前解決した全アドレスがプライベート・ループバック・リンクローカルでないかを確かめる（DNS rebinding 対策）③ リダイレクトは `redirect: "manual"` で自分でたどり、同じオリジンの中で最大 3 回。違反は `BlockedUrlError` でソースの失敗にする
- fetch はグローバルではなく undici のもの（npm の undici の `Agent` をグローバルの fetch に渡すと版の違いで動かないことがあるため）。undici は Node 20 で動く v7 に固定している（v8 は Node 22.19 以上が必要）

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
| `COLLECT_WEB_REQUEST_INTERVAL_MS` | no | `1000` | collect:passages がサイトをクロールするときの、同じオリジンへのリクエストの間隔（ミリ秒。1000 未満は不可）。robots.txt の `Crawl-delay` の方が長ければそちらに従う（30 秒を超える `Crawl-delay` のサイトは打ち切る） |
| `COLLECT_WEB_REFETCH_DAYS` | no | `7` | collect:passages がサイトのページを取り直す間隔（日） |
| `COLLECT_WEB_CONTACT_URL` | no | - | 収集のリクエストの User-Agent に入れるサービスのトップの URL（`TechEnglishBot/1.0 (+{url})`）。サイトの管理者がどのサービスのボットか分かるようにする。未設定なら `TechEnglishBot/1.0` だけを送る（他のタスクのため必須にしない） |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## テスト戦略

- **Repository / Service / lib / client の unit test のみ**。DB client は `vi.fn()` で mock するので DB 不要。GitHub API とサイトは `fetch`（client のテスト。`WebPageClient` は `sleep` / `now` も）か client の偽物（service のテスト。`test/service/collection/helpers.ts`）に差し替える。**実在のサイトにリクエストを送るテストは書かない**（`localhost` を名前解決で弾くテストだけは実物の undici を使う。外部には接続しない）
- 待ち行列の SQL（`findFetchQueue` / `upsertDiscovered`）は unit test では生成される SQL の文字列までしか確かめないので、変えたらローカル DB で並び順・404 の扱い・戻しを確かめる
- `lib/document` のテストは `test/fixtures/document/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 統合テストは無い（task はエントリポイントから直接 service を呼ぶフラットな構造のため）
- テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api` と同じ）
