# apps/cron

定期実行タスク。**タスクを 1 回実行して exit する run-once モデル**で、常駐しない。本番は EventBridge Schedule → ECS Scheduled Task / Kubernetes CronJob から起動する。

## 含まれるタスク

| タスク | コマンド | 処理内容 |
| --- | --- | --- |
| `cleanup:old-memos` | `pnpm cleanup:old-memos` | `CLEANUP_MEMO_OLDER_THAN_DAYS`（既定 90）日より前の memo を一括削除 |
| `collect:passages` | `pnpm collect:passages [--source-id=N] [--dry-run]` | 有効なソースから英文を取得して本文候補（`passages`、`status = collected`）を作る（[content-collection](../../docs/spec/content-collection/README.md)）。`--source-id` で 1 ソースに絞り、`--dry-run`（`--source-id` 必須）は最大 5 件を取得して抽出結果を表示する（DB に書かない・無効のソースも可）。`github_repository`（GitHub API）と `website`（公式ドキュメントのサイトのクロール）の両方を扱う |
| `generate:questions` | `pnpm generate:questions [--passage-id=N]` | `collected` の本文候補から Claude API で設問・和訳・用語集を生成し、解答キーを見ない検証をして `draft` にする（[question-generation](../../docs/spec/question-generation/README.md#生成タスクの動き)）。`ANTHROPIC_API_KEY` が必須。`--passage-id` で 1 件だけ（`collected` でなければ throw。下書きの上限を見ない）。1 件でも `failed` になる、または取得した全件が一時的な失敗で `collected` に戻る（下書き・却下が 0 件）と exit 1 |
| `generate:audio` | `pnpm generate:audio` | 公開済みの問題の読み上げの音声（mp3 と単語の時刻のマニフェスト）を Amazon Polly で作り、`passage_audios` を `ready` にする（[read-aloud](../../docs/spec/read-aloud/README.md#音声の生成タスク)）。本番は 1 時間ごと。`production` 以外の既定は `TTS_PROVIDER=fake`（無音の mp3 と等間隔の単語の時刻。ローカルの確認用）。`polly` で AWS の資格情報を解決できなければ、`production` 以外は warn を出して何もせず exit 0。`production` で `AUDIO_STORAGE_TYPE=local` なら起動時に throw（exit 1）。1 件でも失敗（`failed`・次の実行に回した失敗）があれば exit 1 |

## Commands

```bash
pnpm dev               # tsx watch で起動
pnpm cleanup:old-memos # タスクを 1 回実行
pnpm collect:passages --source-id=3 --dry-run  # 1 ソースの試し実行（DB に書かない）
pnpm generate:questions --passage-id=42        # 1 件だけ生成（ANTHROPIC_API_KEY が必要）
pnpm generate:audio                            # 読み上げの音声を作る（production 以外は無音の mp3。リポジトリ直下の .storage/audio/ に保存）
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

### 問題の生成（LLM のクライアントとプロンプト）

`generate:questions`（[question-generation](../../docs/spec/question-generation/README.md#llm-の呼び出し)）が使う Claude API のクライアントとプロンプト。タスクの動きは次の「generate:questions（問題の生成のタスク）」。

| ファイル | 役割 |
| --- | --- |
| `client/anthropic/anthropic-client.ts` | `AnthropicClient`（`@anthropic-ai/sdk` を包む。SDK の `messages` をコンストラクタで受ける）と `ILlmClient`。`createStructuredMessage` 1 つで、生成（`GENERATION_MODEL`）と解答キーを見ない検証（`VERIFICATION_MODEL`）の両方を呼ぶ。`createAnthropicClient({ apiKey })` が SDK を `maxRetries: 2`・タイムアウト 10 分で生成して包む（task が 1 回だけ呼ぶ） |
| `client/anthropic/errors.ts` | `LlmRefusalError`（`stop_reason: "refusal"`。`stop_details.category` を持つ）/ `LlmOutputTruncatedError`（`max_tokens` などで途中で切れた）/ `LlmInvalidJsonError`、`isFatalLlmError`（401 / 403 / 404 / `billing_error` だけ true。タスク全体を止める判定） |
| `client/anthropic/structured-output-schema.ts` | `convertZodToStructuredOutputSchema`：Zod（`zod/v4`）→ structured output に渡す JSON Schema。API が受け付けない制約（文字数・数値の範囲・`minItems` の 0 / 1 以外・`$schema`）を落とし、全オブジェクトに `additionalProperties: false`。`allOf` / `$ref` などは throw |
| `prompt/generate-questions.ts` | `PROMPT_VERSION`、`GENERATE_QUESTIONS_SYSTEM_PROMPT`（README の設問・和訳・用語集のルール。英語）、`buildGenerateQuestionsUserContent`（番号つきブロック + 設問数の指示 + 再生成のときは前回の不合格の理由） |
| `prompt/generate-questions-schema.ts` | 出力の Zod スキーマ `generateQuestionsOutputSchema`（vocabulary の設問だけが `vocabularyTarget` を持つ superRefine つき）と、API に渡す `GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA`（refine の前のオブジェクトから読み込み時に 1 回だけ作る定数） |
| `prompt/passage.ts` | `buildPassagePrompt`：本文を `<passage>` / `<block index paragraph type lang translate>` の XML にする（生成と検証で共有）。段落番号は `numberParagraphs`、code には `translate="no"`。本文はエスケープせず属性値だけエスケープ、和訳は渡さない |
| `prompt/verify-questions.ts` / `prompt/verify-questions-schema.ts` | 解答キーを見ない検証の `VERIFY_QUESTIONS_SYSTEM_PROMPT`（推測でも必ず 1 つ選ぶ）、`buildVerifyQuestionsUserContent`（番号つきブロック + シャッフル後の設問と A〜D の選択肢。**正解・解説・根拠は渡さない**）、出力の `verifyQuestionsOutputSchema`（`answers: { choiceIndex, questionNumber }[]`）と `VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA` |

- **SDK の呼び方**：非ストリーミングの `messages.create` に `output_config: { format: { type: "json_schema", schema } }` と、`cache_control: { type: "ephemeral" }` を付けた system の text ブロックを渡す。temperature などのサンプリングの引数・thinking・effort は渡さない（モデルの既定。新しいモデルは既定以外を受け付けないものがある）。拒否時のサーバー側フォールバック（beta）は使わない
- **リトライは SDK に任せる**：429 / 408 / 409 / 5xx / タイムアウト / 接続エラーを retry-after か指数バックオフで最大 2 回。自前でリトライを書かない
- **出力の正しさは Zod で確かめる**：structured output は JSON の形（型・enum・必須のキー）までしか強制しない。文字数・配列の長さ・数値の範囲は JSON Schema から落としているので、`createStructuredMessage` は JSON.parse しただけの値を返し、呼び出し側が `generateQuestionsOutputSchema` で検証する（エラーを再生成の指示に使う）
- **`zod/v4`**：cron の zod は 3.25 で、`z.toJSONSchema` は v4 にしか無いため、structured output のスキーマ（`prompt/*-schema.ts`・`structured-output-schema.ts`）だけ `import { z } from "zod/v4"` で書く。SDK の `zodOutputFormat` は `enum` を description に移して制約から外すので使わない
- **プロンプトキャッシュ**：system prompt に日時・件数・本文などの可変値を入れない（可変値は user message）。`usage.cacheReadInputTokens` が 2 回目以降も 0 なら、最小キャッシュ長未満か可変値が混ざっている
- **`PROMPT_VERSION`**：system prompt・user message の形・出力のスキーマを変えたら必ず上げる（`passages.generation_prompt_version` に入る）。`test/prompt/__snapshots__/generate-questions.prompt.txt` に fixture で組み立てた送信内容（system / user / 再生成の user / JSON Schema）を書き出しているので、変えたら `pnpm test -u` で更新して差分をレビューする。検証のプロンプトは `verify-questions.prompt.txt`（検証のプロンプトは生成した内容を変えないので `PROMPT_VERSION` には含めない）

### generate:questions（問題の生成のタスク）

| ファイル | 役割 |
| --- | --- |
| `lib/question-generation/validate-generated-output.ts` | `validateGeneratedOutput`：不合格なら再生成させる検査（Zod・設問数が `calculateQuestionCount` と一致・選択肢が前後の空白と大文字小文字を除いて重複しない・根拠と `vocabularyTarget` のブロック番号が範囲内で code でない）。理由は英語で、そのまま再生成の user message に入る。`isSuitable = false` は以降を見ずに合格 |
| `lib/question-generation/build-draft-content.ts` | `buildDraftContent`：保存する形への加工と要確認の理由（和訳の欠け・根拠の引用が本文に無い・語義設問の対象の追加 / 不在）。用語集の位置は `findSurfaceRange` で本文から求め、見つからない語句は捨てて `droppedGlossary` に入れる（task のログに出る）。語義設問の対象が用語集に無ければ意味が空の項目を足して紐づける。選択肢のシャッフル（`shuffle-choices.ts`、Fisher–Yates、`random` を DI）と制限時間の計算もここ。要確認のブロックの表記は `numberParagraphs` の「段落 N」と `numberHeadings` の「見出し N」（api の公開の条件のメッセージと同じ規則） |
| `lib/question-generation/find-verification-mismatches.ts` | 検証モデルの回答を正解と突き合わせ、`verificationChoiceIndex` と「Q3：検証モデルは A を選択（正解は B）」を作る |
| `lib/question-generation/parse-args.ts` | `parseGenerateQuestionsArgs`（`--passage-id` を正の整数に） |
| `lib/question-generation/describe-run-failure.ts` | `describeRunFailure`：実行の件数から exit 1 にすべき理由を返す（`failed` が 1 件以上、または下書き・却下が 0 件で `collected` に戻した件がある）。task が throw に使う |
| `service/passage/generate-questions.ts` | 本体。下書きの上限 → 30 分以上 generating の行の回収 → `claimCollected` → 1 件ずつ「生成（不合格なら理由を付けて 1 回だけ再生成）→ `buildDraftContent` → 検証モデル → `saveDraft`」 |
| `repository/passage-repository.ts` | `claimCollected`（`FOR UPDATE SKIP LOCKED` で選び、同じ UPDATE で generating に）/ `saveDraft`（passages の更新と questions / glossary の入れ直しを 1 トランザクション）/ `recordGenerationFailure` / `markRejectedByLlm` / `releaseClaim` / `releaseStaleGenerating` / `countByStatus` / `findStatusById` |

- **claim のガード**：取得した行の更新（`saveDraft` / `markRejectedByLlm` / `recordGenerationFailure` / `releaseClaim`）は `WHERE id = ? AND status = 'generating' AND generation_started_at = ?`。`generation_started_at` を取得のトークンにして、30 分を超えて別の実行に回収・再取得された行を古い実行が上書きしない（0 行なら warn を出して数えない）
- **失敗の扱い**：API エラー（SDK のリトライ後）・拒否・2 回目の不合格・想定外の例外は `recordGenerationFailure`（回数 +1、3 回目で `failed`、`generation_error` に「種類: メッセージ」）。失敗した件は warn（`passage generation failed`）でログに出す。途中で切れた出力（`LlmOutputTruncatedError`）と JSON でない出力は「不合格」として再生成する。`isSuitable = false` は `rejected`（理由が無ければ「LLM が題材に不向きと判定」）
- **設定の誤り（`isFatalLlmError`）**：生成で起きたら失敗回数を増やさずに `releaseClaim` して throw（タスクは exit 1。他の取得済みの行は 30 分後に回収される）。検証モデルで起きたら、生成の費用を無駄にしないよう下書きを検証なしで保存してから throw する
- **検証モデルの失敗**：API エラー・回答の件数が設問数と合わない・設問番号の重複 / 範囲外は、生成を捨てず `verificationChoiceIndex = null` で保存し、要確認に「検証モデルでの確認に失敗しました」を入れる
- **用語集の id の引き方**：insert の RETURNING の順序に頼らず、`(blockIndex, startOffset, endOffset)` で引く（`buildDraftContent` が同じ位置の項目を 2 つ作らない）

### generate:audio（読み上げの音声の生成）

[read-aloud](../../docs/spec/read-aloud/README.md#音声の生成タスク) の音声を作るタスク。`passage_audios` の列とマニフェスト（`PassageAudioManifest`）の型は read-aloud の README が正本。

| ファイル | 役割 |
| --- | --- |
| `client/polly/polly-tts-client.ts` | `PollyTtsClient`（`@aws-sdk/client-polly` の `send` をコンストラクタで受ける）。`SynthesizeSpeech` を音声（`OutputFormat: "mp3"`）と単語の時刻（`OutputFormat: "json"`・`SpeechMarkTypes: ["word"]`）で 2 回呼ぶ（Neural・`TextType: "text"`。`SampleRate` は指定しない）。課金文字数は 2 つの `RequestCharacters` の合計。`isPollyVoiceId`（task が起動時に `TTS_VOICE_ID` を確かめる） |
| `client/polly/fake-tts-client.ts` | `FakeTtsClient`（`TTS_PROVIDER=fake` とテスト用）。単語の数 × 300 ms の無音の mp3（MPEG-1 Layer III・32 kbps・32 kHz・モノラルのヘッダの後ろを 0 で埋めた 144 バイトのフレームを並べたもの。ffmpeg〈Chrome〉と CoreAudio〈Safari〉で再生できる）と、音声の長さを等分した単語の時刻を返す |
| `client/polly/parse-speech-marks.ts` | Speech Marks（1 行 1 つの JSON。`start` / `end` は UTF-8 のバイト位置）の parse |
| `lib/audio/fatal-error.ts` | `isFatalAudioGenerationError`：音声の生成全体（音声合成・mp3 の保存・使わなくなった mp3 の削除）で、どの問題でも同じく失敗する設定の誤り。Polly（資格情報の解決の失敗・`AccessDeniedException`・無効な資格情報・`EngineNotSupportedException`・`ValidationException` など）と S3（`AccessDenied`・`NoSuchBucket`・`InvalidAccessKeyId`・`SignatureDoesNotMatch`・`ExpiredToken`・リージョン違いの `PermanentRedirect` / `AuthorizationHeaderMalformed`）の `error.name` |
| `lib/audio/audio-voice-id.ts` | `buildAudioVoiceId`：`passage_audios.voice_id` と `text_hash` に入れる voice。`polly` は `TTS_VOICE_ID`、`fake` は `fake:<TTS_VOICE_ID>`（fake と Polly を切り替えたら voice が違う行として作り直し、保存キーも変える） |
| `lib/audio/speech-text.ts` | `buildSpeechText`：本文から対になったインラインコードのバッククォートを除いた読み上げ用テキストと、各位置の元の本文の位置（`sourceOffsets`）。判定は api のセグメント分割と同じ `` /`[^`\n]+`/g ``。`mapSpeechRangeToSource` |
| `lib/audio/utf8-offset.ts` / `word-timings.ts` | Polly の UTF-8 のバイト位置 → UTF-16 の位置の表、Speech Marks → マニフェストの単語の時刻 `[startMs, endMs, startOffset, endOffset]`（位置は元の本文の UTF-16。`endMs` は次の単語の `time`、最後はパートの長さ） |
| `lib/audio/split-speech-text.ts` | 3,000 文字（`POLLY_MAX_BILLED_CHARACTERS`）を超えるブロックを文の区切り → 空白 → 上限の長さの順で切ってパートにする |
| `lib/audio/mp3-duration.ts` | mp3 のフレームを数えて長さを求める（Polly は長さを返さない）。ID3v2 を飛ばし、Layer III のフレームヘッダを読む。先頭の Xing / Info / VBRI のフレームは数えない |
| `lib/audio/audio-storage.ts` | `isAudioStorageAllowed`：`production` の `local` の保存先を使わせない判定（task が起動時に見て throw する） |
| `lib/audio/text-hash.ts` / `read-aloud-blocks.ts` / `audio-key.ts` | `calculateAudioTextHash`（読み上げるブロックの `[blockIndex, text]`・`AUDIO_TEXT_VERSION`・voice〈`buildAudioVoiceId` の値〉の SHA-256。和訳と code の変更では変わらない）、`listReadAloudBlocks`（code と空白だけのブロックを除く）、保存キー `passages/{passageId}/{textHash}/{blockIndex}-{partIndex}.mp3` と使わなくなったキー |
| `service/audio/generate-audio.ts` | 本体。30 分以上 generating の行の回収 → `claimTargets` → 1 件ずつ（トランザクションの外で）音声合成と保存 → `completeClaim` → 前の hash の mp3 の削除 |
| `repository/passage-audio-repository.ts` | `claimTargets`（短いトランザクションで `passages` に `passage_audios` を left join し、`FOR UPDATE OF passages SKIP LOCKED` で選んで insert。今の voice を受け取り、`voice_id` が違う `ready` も選ぶ。既にある行は `ON CONFLICT` で `status IN ('pending', 'ready')` のときだけ generating に）/ `completeClaim`（claim のガード付きで `FOR UPDATE` で読み、ready / unchanged は今の本文の hash を求め直して違えば pending）/ `releaseClaim` / `releaseStaleGenerating` |

- **対象**：`passages.status = 'published'` で、`passage_audios` の行が無い・`pending`・`ready` で音声を作った後に公開し直された（`updated_at < published_at`）・`ready` で `voice_id` が今の `TTS_VOICE_ID` と違う問題を `published_at` の古い順に `AUDIO_MAX_PASSAGES_PER_RUN` 件。`failed` は管理者の再試行（`pending` に戻る）を待つ
- **作り直さない**：前の成功のマニフェストがあり、その本文の hash（voice と `AUDIO_TEXT_VERSION` を含む）が今と同じなら、行の状態（`ready` / `pending`）を問わず Polly を呼ばずに `unchanged`（`status = 'ready'`・`attempt_count = 0`・`last_error = null` にして `updated_at` だけ進む。api は公開し直しの後でも `ready` を返す）。マニフェストがある行の `text_hash` はそのマニフェストのもので、その mp3 は別の hash の生成が成功して置き換わるまで消さないので、そのまま使える（`manifest` と `generated_at` は `ready` の書き込みで一緒に入るので、`ready` の CHECK 制約も満たす）。同じ本文・同じ voice は同じキーに上書きして同じマニフェストになる（冪等）
- **voice・読み上げ用テキストの版を変えたとき**：`TTS_VOICE_ID` を変えると、`voice_id` が違う `ready` の行が対象になり、次の実行から `AUDIO_MAX_PASSAGES_PER_RUN` 件ずつ作り直す（作り直すまでは前の声のまま `ready`）。`TTS_PROVIDER` を `fake` と `polly` で切り替えたときも同じ（`fake` の `voice_id` は `fake:<TTS_VOICE_ID>`。同じ値だと fake で作った無音の音声が `unchanged` のまま残り、保存キーも同じなので CloudFront の長期キャッシュにも残る）。`AUDIO_TEXT_VERSION`（`const/audio.ts`）を上げただけでは `ready` の行は作り直さない。作り直すときはデプロイの後に `UPDATE passage_audios SET status = 'pending' WHERE status = 'ready'` を流す（作り直すまでは利用者に「準備中」と見える。本文・voice・版が同じで hash が変わらない行は Polly を呼ばずに `ready` に戻る）
- **claim のガード**：結果の書き込みは `WHERE passage_id = ? AND status = 'generating' AND generation_started_at = ?`。当たらなければ `lost_claim`（何も書かず、mp3 も消さない）。生成中に本文が変わった（非公開 → 修正 → 再公開）ら `text_changed` で `pending` に戻し、今回作った mp3 を消す
- **失敗の扱い**：Polly の throttling・5xx は SDK のリトライ（`POLLY_MAX_ATTEMPTS`）に任せる。それでも失敗した・保存に一時的に失敗した（S3 の 5xx・ローカルの保存先の失敗）問題は `attempt_count` を増やし、3 回目で `failed`（`last_error` に「種類: メッセージ」）。`manifest` と `text_hash` は前の成功のまま残す（前の mp3 のキーを後で消すため）。設定の誤り（`isFatalAudioGenerationError`。Polly と保存先の両方）は失敗回数を増やさずに `releaseClaim` して throw（他の確保済みの行は 30 分後に回収される。保存は音声合成の後なので、保存先の誤りを 1 件の失敗にすると Polly の料金をかけて全件が `failed` に進む）
- **保存先**：`audioStorage`（`@repo/storage`）。`local` はリポジトリ直下の `.storage/audio/`（git に入れない。api が開発環境でだけ `/media` で配信する。`production` の `local` はコンテナの一時領域に mp3 を書いて `ready` にしてしまうので、task が起動時に throw する。cron の他のタスクを止めないよう env のスキーマでは検査しない）、`s3` は `Cache-Control: public, max-age=31536000, immutable`（`AUDIO_CACHE_CONTROL`）。マニフェストにはキーだけを保存し、URL は api が組み立てる。削除の失敗は warn だけ（空のディレクトリは残る）。ただし保存先の設定の誤り（`isFatalAudioGenerationError`）は error を出して throw する（その問題の結果は書き終えたまま。以降も同じく消せず mp3 が残り続けるのに気づけないため）
- **ローカルの AWS の資格情報に注意**：`TTS_PROVIDER` の既定は `production` だけ `polly`、それ以外は `fake`。`TTS_PROVIDER=polly` を明示すると、資格情報は SDK の既定の解決順（環境変数・`~/.aws`・SSO など）で探すので、手元に有効な資格情報があれば実際に Polly を呼んで課金される

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
| `ANTHROPIC_API_KEY` | `generate:questions` で必須 | - | Claude API のキー。他のタスクでは不要なのでスキーマでは任意にし、`generate:questions` の起動時に検査する（空文字は未設定と同じ） |
| `GENERATION_MODEL` | no | `claude-sonnet-5-5` | generate:questions の生成モデル |
| `VERIFICATION_MODEL` | no | `claude-haiku-4-5-20251001` | generate:questions の解答キーを見ない検証のモデル |
| `GENERATE_MAX_PASSAGES_PER_RUN` | no | `10` | generate:questions が 1 回の実行で生成する件数の上限（費用の上限） |
| `GENERATE_MAX_PENDING_DRAFTS` | no | `50` | 確認待ちの下書き（`draft`）がこの件数以上なら generate:questions は生成しない（`--passage-id` の指定時は見ない） |
| `TTS_PROVIDER` | no | `production` は `polly`、それ以外は `fake` | generate:audio の音声合成。`polly`（Amazon Polly。AWS の資格情報が要る）/ `fake`（無音の mp3 と等間隔の単語の時刻。ローカルの確認用） |
| `TTS_VOICE_ID` | no | `Joanna` | generate:audio の Polly の voice（Neural に対応したもの）。変えると `voice_id` が違う `ready` の音声を確保し、次の実行から `AUDIO_MAX_PASSAGES_PER_RUN` 件ずつ作り直す（text_hash にも voice を含むので保存キーも変わる）。`TTS_PROVIDER=fake` のときの `voice_id` は `fake:<TTS_VOICE_ID>` |
| `AWS_REGION` | no | `ap-northeast-1` | generate:audio が使う Polly と S3 のリージョン |
| `AUDIO_MAX_PASSAGES_PER_RUN` | no | `20` | generate:audio が 1 回の実行で確保する問題の上限（Polly の費用の上限） |
| `AUDIO_STORAGE_TYPE` | no | `local` | generate:audio の mp3 の保存先。`local` / `s3`。`production` で `local` なら generate:audio は起動時に throw する（スキーマでは検査しないので他のタスクは動く） |
| `AUDIO_STORAGE_LOCAL_DIR` | no | `../../.storage/audio` | `local` の保存先（`apps/cron` からの相対。リポジトリ直下の `.storage/audio/` になり、api の `/media` 配信と共有する） |
| `AUDIO_STORAGE_S3_BUCKET` | `AUDIO_STORAGE_TYPE=s3` で必須 | - | `s3` の保存先の bucket（`superRefine` で検査。空文字は未設定と同じ） |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## テスト戦略

- **Repository / Service / lib / client / prompt の unit test のみ**。DB client は `vi.fn()` で mock するので DB 不要。GitHub API とサイトは `fetch`（client のテスト。`WebPageClient` は `sleep` / `now` も）か client の偽物（service のテスト。`test/service/collection/helpers.ts`）に差し替える。**実在のサイトにリクエストを送るテストは書かない**（`localhost` を名前解決で弾くテストだけは実物の undici を使う。外部には接続しない）
- 待ち行列の SQL（`findFetchQueue` / `upsertDiscovered`）は unit test では生成される SQL の文字列までしか確かめないので、変えたらローカル DB で並び順・404 の扱い・戻しを確かめる
- 問題生成の取得・保存の SQL（`claimCollected` の `FOR UPDATE SKIP LOCKED`、`recordGenerationFailure` の `CASE`、`saveDraft` のトランザクション、claim のガード）も同じく SQL の文字列までなので、変えたらローカル DB で Drizzle / Prisma の両方の実装を確かめる（別のトランザクションで行をロックしたまま取得して飛ばされること、31 分前の generating が戻ること、3 回目で failed になること、古い claim で更新されないこと）
- `generate:questions` の service のテストは Repository を `vi.fn()`、`ILlmClient` を偽物（モデル名で生成と検証の応答を分ける）にする。生成の出力の例は `test/lib/question-generation/helpers.ts`
- **Amazon Polly は呼ばない**。`PollyTtsClient` のテストは `send` を `vi.fn()` にした SDK の偽物（`AudioStream` は `Readable` に `transformToByteArray` などを足したもの）を渡す。`generate:audio` の service のテストは Repository を `vi.fn()`、音声合成を `FakeTtsClient`、`audioStorage` を `vi.fn()` にする。音声の確保・結果の書き込みの SQL（`claimTargets` の `FOR UPDATE OF passages SKIP LOCKED` と `ON CONFLICT ... WHERE`、`completeClaim` のガードと `CASE`）も SQL の文字列までなので、変えたらローカル DB で Drizzle / Prisma の両方を確かめる（ロック中の問題が飛ばされること、3 回目で failed になること、古い claim で書かれないこと、生成中の本文の変更で pending に戻ること、`voice_id` が違う ready が確保されること、マニフェストのある pending が unchanged で ready に戻ること）
- **Claude API は呼ばない**（キーも費用も要るため）。`AnthropicClient` のテストは `messages.create` を `vi.fn()` にした SDK の偽物を渡し、リトライの設定は実物の SDK に `fetch` の偽物を渡して確かめる（`createAnthropicClient({ apiKey, fetch })`。レスポンスの `retry-after-ms: 1` で待ち時間を縮める）。プロンプトのテストは `test/fixtures/prompt/` の本文で組み立てた文字列を確かめる
- `lib/document` のテストは `test/fixtures/document/`、プロンプトのテストは `test/fixtures/prompt/` の fixture を使う。**fixture の英文は自作する**（実在のドキュメントをコピーしない。ライセンスのため）
- 統合テストは無い（task はエントリポイントから直接 service を呼ぶフラットな構造のため）
- テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api` と同じ）
