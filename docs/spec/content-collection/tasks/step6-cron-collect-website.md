# step6-cron-collect-website

`WebPageClient`（`robots.txt`・間隔・取得先の制限・条件付きリクエスト）と、sitemap とリンクからの URL の発見、`source_documents` を待ち行列にした取得を作り、`collect:passages` で `website` のソースを収集できるようにする。仕様は [README のサイトのクロール](../README.md#サイトのクロール)・[取得先の制限（SSRF 対策）](../README.md#取得先の制限ssrf-対策)・[実行の上限と失敗時の扱い](../README.md#実行の上限と失敗時の扱い)。

## 前提

- [step5-cron-collect-github](./step5-cron-collect-github.md)（タスクの骨格、cron の Repository、`isTargetPath`、試し実行）
- [step4-cron-document-parser](./step4-cron-document-parser.md)（`extractDocument` の HTML と `links`）

## 対応内容

### 1. env・パッケージ

```bash
pnpm --filter cron add undici robots-parser
```

- `src/env.ts` に足す：`COLLECT_WEB_REQUEST_INTERVAL_MS`（`z.coerce.number().int().min(1000).default(1000)`）、`COLLECT_WEB_REFETCH_DAYS`（`default(7)`）、`COLLECT_WEB_CONTACT_URL`（`z.string().url().optional()`。`User-Agent` に入れるサービスのトップの URL。env.ts は全タスク共通なので必須にしない）
- `User-Agent` は `COLLECT_WEB_CONTACT_URL` があれば `TechEnglishBot/1.0 (+${url})`、無ければ `TechEnglishBot/1.0`（step5 の `COLLECTOR_USER_AGENT`）。robots.txt の照合に使う名前は `TechEnglishBot`（`src/const/collection.ts` に `CRAWLER_NAME`）
- 定数：`WEB_REQUEST_TIMEOUT_MS = 10_000`、`MAX_HTML_BYTES = 2 * 1024 * 1024`、`MAX_SITEMAP_BYTES = 10 * 1024 * 1024`、`MAX_REDIRECTS = 3`、`MAX_CONSECUTIVE_NETWORK_ERRORS = 3`

### 2. ファイル構成

| ファイル | 中身 |
| --- | --- |
| `src/client/web/web-page-client.ts` | `WebPageClient`（1 ソースにつき 1 つ作る。オリジン・robots.txt・間隔をソース単位で持つ） |
| `src/client/web/safe-lookup.ts` | `isBlockedAddress` / `createSafeLookup` |
| `src/client/web/errors.ts` | `BlockedUrlError` / `WebSourceThrottledError`（`retryAfter: string \| null`） |
| `src/lib/url.ts` | `normalizePageUrl` / `isFetchablePath` |
| `src/lib/parse-sitemap.ts` | `parseSitemap(xml)`（jsdom の XML モード） |
| `src/service/collection/collect-website-source.ts` | 1 ソース分の収集 |

### 3. 取得先の制限（SSRF 対策）

3 つの層で防ぐ。

1. **URL**：リクエストの前（リダイレクト先も）に `https:` かつ `new URL(url).origin === allowedOrigin`（ソースの `site_url`）を確かめる。違えば `BlockedUrlError`
2. **接続先の IP**：undici の `Agent` の `connect.lookup` に `createSafeLookup()` を渡し、**接続のときに** 名前解決した全アドレスを検査する（事前に解決してから fetch すると、その間に DNS の応答が変わる DNS rebinding を防げないため）
3. **リダイレクト**：`redirect: "manual"` で自分でたどり、最大 3 回、毎回 1 と robots.txt を検査する

```ts
/** src/client/web/safe-lookup.ts */
const blockList = new BlockList()
blockList.addSubnet("0.0.0.0", 8, "ipv4")
blockList.addSubnet("10.0.0.0", 8, "ipv4")
blockList.addSubnet("127.0.0.0", 8, "ipv4")
blockList.addSubnet("169.254.0.0", 16, "ipv4")
blockList.addSubnet("172.16.0.0", 12, "ipv4")
blockList.addSubnet("192.168.0.0", 16, "ipv4")
blockList.addAddress("::", "ipv6")
blockList.addAddress("::1", "ipv6")
blockList.addSubnet("fc00::", 7, "ipv6")
blockList.addSubnet("fe80::", 10, "ipv6")

export const isBlockedAddress = (address: string, family: number): boolean => {
  /** ::ffff:127.0.0.1 のような IPv4 射影アドレスは IPv4 として判定する */
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  if (mapped) return blockList.check(mapped, "ipv4")
  return blockList.check(address, family === 6 ? "ipv6" : "ipv4")
}

/** net.connect の lookup と同じシグネチャ。dns.lookup はテストで差し替える */
export const createSafeLookup = (lookup = dns.lookup) => (hostname: string, options: LookupOptions, callback: LookupCallback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0)
    if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address, item.family))) {
      return callback(new BlockedUrlError(hostname), "", 0)
    }
    return options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family)
  })
}
```

`WebPageClient` は `import { Agent, fetch } from "undici"` の `fetch` に `dispatcher: new Agent({ connect: { lookup: createSafeLookup() } })` を渡して使う（グローバルの `fetch` に npm の undici の Agent を渡すと版の違いで動かないことがあるため、fetch も undici のものを使う）。undici は lookup のエラーを `TypeError: fetch failed` の `cause` に包むので、`cause` が `BlockedUrlError` なら取り出して throw する（`network_error` に混ぜない）。

### 4. `WebPageClient`

```ts
export type FetchPageResult =
  | { body: string; etag: string | null; finalUrl: string; kind: "ok"; lastModified: string | null; status: number }
  | { kind: "not_modified"; status: 304 }
  /** 404 / 410 と、429 / 503 以外の 4xx・5xx */
  | { kind: "http_error"; status: number }
  | { kind: "network_error" }
  | { kind: "skipped"; reason: "not_html" | "redirect_not_allowed" | "robots_disallowed" | "too_large" | "too_many_redirects"; status: number | null }

export interface IWebPageClient {
  fetchPage(url: string, conditional: { etag: string | null; lastModified: string | null }): Promise<FetchPageResult>
  fetchSitemapUrls(sitemapUrl: string): Promise<{ lastmod: Date | null; url: string }[]>
  isAllowedByRobots(url: string): boolean
  loadRobots(): Promise<void>
}

export class WebPageClient implements IWebPageClient {
  constructor(options: {
    allowedOrigin: string
    fetch?: typeof undiciFetch
    now?: () => number
    requestIntervalMs: number
    sleep?: (ms: number) => Promise<void>
    userAgent: string
  }) {}
}
```

| 処理 | 内容 |
| --- | --- |
| 間隔 | すべてのリクエスト（robots.txt・sitemap・ページ・リダイレクト先）の前に、前回の開始から `max(requestIntervalMs, Crawl-delay × 1000)` 経つまで `sleep` する。並列にしない |
| `loadRobots` | `{origin}/robots.txt` を取得。200 は `robots-parser` で解釈、4xx は全許可、5xx・ネットワークエラーは throw（読めないまま取得しない）。`getCrawlDelay(CRAWLER_NAME)` を保持 |
| `isAllowedByRobots` | `robots.isAllowed(url, CRAWLER_NAME) === true`。未読込みなら false |
| `fetchPage` | URL の検査 → robots → `User-Agent` と、あれば `If-None-Match` / `If-Modified-Since` を付けて GET（`signal: AbortSignal.timeout(10_000)`）。301 / 302 / 303 / 307 / 308 は `Location` をたどる（4 回目で `too_many_redirects`、別オリジン・http は `redirect_not_allowed`）。304 → `not_modified`、**429 / 503 → `WebSourceThrottledError` を throw**、その他の非 2xx → `http_error`。`Content-Type` が `text/html` でなければ `not_html`。`Content-Length` が 2MB 超、または読みながら 2MB を超えたら読むのをやめて `too_large`。タイムアウト・接続エラーは `network_error`（`BlockedUrlError` は throw） |
| 本文の復号 | `Content-Type` の `charset`（無ければ UTF-8）の `TextDecoder`。対応していない charset は UTF-8 |
| `fetchSitemapUrls` | sitemap を取得（URL の検査あり。10MB まで）→ `parseSitemap`。sitemap index なら子の sitemap を同じオリジンのものだけ最大 50 個取得する（入れ子は 1 段）。`.gz` は扱わず `logger.warn` |

### 5. URL の正規化と発見

- `normalizePageUrl(raw, base)`：`new URL(raw, base)`（失敗は null）。`https:` 以外は null。クエリとフラグメントを除いた `origin + pathname` を返す
- `isFetchablePath(pathname)`：`.pdf` / `.zip` / `.gz` / `.tar` / 画像（`.png` `.jpg` `.jpeg` `.gif` `.svg` `.webp` `.ico`）/ 動画・音声 / `.css` / `.js` / `.json` / `.xml` / `.txt` は false
- `source_documents.path` は URL の `pathname`（オリジンはソースで決まるため）。取得する URL は `source.siteUrl + path`
- **取得してよい URL**：`normalizePageUrl` が null でない、同じオリジン、`isFetchablePath`、`isTargetPath(pathname, globs)`、`isAllowedByRobots`

Repository（`SourceDocumentRepository`）に足す：

```ts
/**
 * 見つけた URL を未取得の行として入れる。既存の行は sitemap_lastmod を更新する。
 * http_status が 404 / 410 の行は、shouldReviveGone か sitemap の lastmod が fetched_at より新しいときだけ
 * http_status を NULL に戻して取得の対象に戻す（「再び見つかったら対象に戻す」）
 */
upsertDiscovered(sourceId: number, inputs: { path: string; sitemapLastmod: Date | null }[], options: { shouldReviveGone: boolean }): Promise<void>

/**
 * 取得待ちの行。404 / 410 を除き、fetched_at IS NULL、sitemap_lastmod > fetched_at、fetched_at < refetchBefore のどれか。
 * 並びは fetched_at の昇順（NULLS FIRST）→ id
 */
findFetchQueue(input: { limit: number; refetchBefore: Date; sourceId: number }): Promise<SourceDocument[]>

/**
 * fetched_at と http_status だけを更新する（304 / エラー / 取得しなかったページ / 取得できなかったページ / 本文の抽出に失敗したページ）。
 * fetched_at は「最後に取得を試みた時刻」で、取得できなかったページも待ち行列から外す
 */
markResponse(id: number, input: { fetchedAt: Date; httpStatus: number | null }): Promise<void>
```

- `upsertDiscovered`：500 件ずつ `insert(...).values(...).onConflictDoUpdate({ target: [sourceId, path], set: { httpStatus: sql\`CASE WHEN ... THEN NULL ELSE ${sourceDocuments.httpStatus} END\`, sitemapLastmod: sql\`COALESCE(excluded.sitemap_lastmod, ${sourceDocuments.sitemapLastmod})\` } })`
- `findFetchQueue` は step1 の index `(source_id, fetched_at)` を使う

### 6. 1 ソース分の収集（`collectWebsiteSource`）

```ts
export const collectWebsiteSource = async (
  input: { maxDocuments: number; maxPassages: number; now: Date; refetchDays: number; source: WebsiteSource },
  repo: CollectionRepo,
  deps: { createWebPageClient: (origin: string) => IWebPageClient; isShuttingDown: () => boolean },
): Promise<SourceCollectionResult>
```

`service/collection/types.ts` の `SourceCollectionResult["status"]` に `"throttled"` を足す。

1. `client = deps.createWebPageClient(source.siteUrl)`、`await client.loadRobots()`
2. `sitemapUrl` があれば `fetchSitemapUrls` → 取得してよい URL に絞って `upsertDiscovered(..., { shouldReviveGone: false })`
3. `startUrl` があれば、その path を `upsertDiscovered`（毎回入れても冪等。対象パスに合わなくてもリンクをたどるために入れる）
4. `queue = findFetchQueue({ limit: maxDocuments, refetchBefore: now - refetchDays 日, sourceId })`
5. 行ごとに（ループの先頭で `isShuttingDown()` と `createdPassageCount >= maxPassages` を確認。上限は step5 と同じく文書の単位）：

| `fetchPage` の結果 | 処理 |
| --- | --- |
| `not_modified` | `markResponse(id, { fetchedAt: now, httpStatus: 304 })` |
| `http_error` | `markResponse(id, { fetchedAt: now, httpStatus: status })`。404 / 410 は以後キューに出ない |
| `skipped` | `markResponse(id, { fetchedAt: now, httpStatus: status })`、理由を `logger.info` |
| `network_error` | `markResponse(id, { fetchedAt: now, httpStatus: null })`（試した時刻を入れて待ち行列から外し、`refetchDays` 日後に取り直す。入れないと次回も同じ行が先頭に来て、取得できないページが残りのページを塞ぐ）。**連続 3 回で throw**（サイトの障害で 100 ページ × 10 秒待たないため。3 行とも記録してから throw する） |
| `ok` | 下の手順 |
| `WebSourceThrottledError` | その行を `markResponse(id, { fetchedAt: now, httpStatus: 429 / 503 })` してから、ループを抜けて `throttled`（記録しないと、429 / 503 を返し続けるページが毎回先頭に来てソース全体が止まる）。`Retry-After` は待たず、次回の実行（約 24 時間後）より先なら `logger.warn` |

`ok` のとき：

- `extractDocument({ content: body, contentSelector, excludeSelectors, fallbackTitle: path, format: "html", url: finalUrl })`。throw したら `logger.warn` して `markResponse(id, { fetchedAt: now, httpStatus: status })` で終える（`ETag` / `Last-Modified` / ハッシュを保存しない。保存すると次回から 304 か同じハッシュで止まり、セレクタを直してもページが変わるまで抽出し直されない）
- `links` を取得してよい URL に絞って `upsertDiscovered(..., { shouldReviveGone: true })`（200 のページのリンクだけを入れる）
- path が対象パスに合わない（開始ページなど）、リダイレクトの行き先（`new URL(finalUrl).pathname`）が `isFetchablePath` / `isTargetPath` に合わない（除外パスへのリダイレクトなど。`logger.info`）、または `extracted.contentHash === document.contentHash`（前回と同じ本文）なら本文候補を作らない
- それ以外は本文候補を `{ sourceCommitSha: null, sourcePath: path, sourceRetrievedAt: now, ... }` で `insertIgnoringDuplicates`
- 最後に `markFetched(id, { blobSha: null, commitSha: null, contentHash, etag, fetchedAt: now, httpStatus: status, lastModified, title })`

6. `queue.length === maxDocuments` なら `limit_reached`、そうでなければ `completed`。**`completed` / `limit_reached` のときだけ** `markCollected(id, { lastCollectedAt: now })`（取得を最後まで終えたときだけ最終収集を進める。`throttled` / `crawl_delay_too_long` / `interrupted` は進めない。`findEnabled` は `last_collected_at` の古い順なので次回の実行で先に処理される）

`BlockedUrlError` と robots.txt の読込み失敗は throw のまま（`collectPassages` がソースの失敗として扱い exit 1）。

### 7. タスクと試し実行への組み込み

- `collectPassages`：step5 の「website は飛ばす」を `collectWebsiteSource` の呼び出しに置き換える。`throttled` は失敗にしない。GitHub の rate limit のフラグは website に影響させない
- `previewSource`：website は DB に書かずに、sitemap があれば取得してよい URL の先頭 5 件、無ければ開始ページからリンクを幅優先でたどって対象パスのページを 5 件まで取得して `extractDocument` する（条件付きヘッダは付けない）
- `src/task/collect-passages.ts` の deps に `createWebPageClient: (origin) => new WebPageClient({ allowedOrigin: origin, requestIntervalMs: env.COLLECT_WEB_REQUEST_INTERVAL_MS, userAgent })` と、`collectPassages` の入力に `refetchDays: env.COLLECT_WEB_REFETCH_DAYS` を足す
- `apps/cron/CLAUDE.md` の環境変数の表に追記する

## 動作確認

```bash
pnpm --filter cron test
pnpm lint:fix
```

テスト（`fetch`・`sleep`・`now`・`dns.lookup` は偽物）：

- 取得先の制限
  - [ ] `isBlockedAddress` が true：`10.0.0.1` / `172.16.0.1` / `172.31.255.255` / `192.168.1.1` / `127.0.0.1` / `169.254.169.254` / `0.0.0.0` / `::1` / `fe80::1` / `fd12::1` / `::ffff:127.0.0.1`。false：`8.8.8.8` / `172.32.0.1` / `2001:4860:4860::8888`
  - [ ] `createSafeLookup`：解決結果に 1 つでもプライベートのアドレスがあればエラー、公開アドレスだけなら `all` の指定どおりの形で返す
  - [ ] `fetchPage` は http・別オリジンの URL でリクエストせずに `BlockedUrlError`
- `WebPageClient`
  - [ ] `User-Agent` と、`etag` / `lastModified` があるときだけ条件付きヘッダが付く
  - [ ] 304 → `not_modified`、404 / 410 / 500 → `http_error`、429 / 503 → `WebSourceThrottledError`（`retryAfter` つき）、タイムアウト → `network_error`
  - [ ] `application/pdf` → `not_html`、`Content-Length: 3MB` → `too_large`、`Content-Length` 無しで 2MB を超えるストリーム → 読むのをやめて `too_large`
  - [ ] 同じオリジンへのリダイレクトは 3 回までたどり、4 回目で `too_many_redirects`、別オリジン・http への `Location` は `redirect_not_allowed`
  - [ ] robots.txt で禁止のパスはリクエストせず `robots_disallowed`。robots.txt が 404 なら全許可、500 なら `loadRobots` が throw
  - [ ] 連続するリクエストの間に `sleep(1000 - 経過)` が呼ばれ、`Crawl-delay: 5` なら 5000ms 空く
  - [ ] `fetchSitemapUrls` が urlset の `loc` / `lastmod` を返し、sitemap index の子を取得し、別オリジンの子は取得しない
- `lib`
  - [ ] `normalizePageUrl` がクエリ・フラグメントを除き、相対 URL を解決し、http は null。`isFetchablePath` が `.pdf` / `.png` を除く
  - [ ] `parseSitemap` が urlset / sitemapindex を読み分け、壊れた XML は空にする
- `collectWebsiteSource`（Repository は `vi.fn()`、client は fake）
  - [ ] sitemap の URL が対象パス・オリジン・robots で絞られて `upsertDiscovered` される。`start_url` の path も入る
  - [ ] `findFetchQueue` が `refetchBefore = now - 7 日` と `limit = maxDocuments` で呼ばれる
  - [ ] 304 は本文を解析せず `markResponse(304)`。200 で本文のハッシュが前回と同じなら本文候補を作らず `markFetched`
  - [ ] 200 の新しい本文は `sourceCommitSha: null` の本文候補になり、`links` が `shouldReviveGone: true` で入る。対象パス外の開始ページはリンクだけ入って本文候補を作らない
  - [ ] 本文の抽出が throw したページは `markFetched` せず `markResponse(200)`（`ETag` などを保存しない）
  - [ ] リダイレクトの行き先が除外パス・対象パスの外・ページでない拡張子なら本文候補を作らず、リンクの発見と `markFetched` は続ける
  - [ ] 404 は `markResponse(404)`。throttled で残りの行を取得せずに `throttled` を返し、その行を `markResponse(429)` する。`network_error` の行は `markResponse(null)`。3 回続くと throw、間に `ok` を挟むと数え直す
  - [ ] `completed` / `limit_reached` だけ `markCollected` し、`throttled` / `crawl_delay_too_long` / `interrupted` では呼ばない
  - [ ] `BlockedUrlError` はそのまま throw される
- [ ] `collectPassages` が website のソースを処理し、`throttled` を失敗に数えない
- [ ] `previewSource`（website）が Repository の書き込みメソッドを呼ばず、取得するページが 5 件以下

手動確認（ローカル DB）。cron のテストは DB を使わないので、待ち行列の SQL（並び順・404 の扱い・戻し）はここで確かめる。

1. Go 公式ドキュメント（`https://go.dev`、開始ページ `https://go.dev/doc/`、対象パス `/doc/**`、本文の CSS セレクタ `main`）を登録する（無効で登録される）
2. `pnpm --filter cron collect:passages --source-id={id} --dry-run`：5 ページの抽出結果が出て、DB が変わらない。ログのリクエスト間隔が 1 秒以上
3. 有効にして `COLLECT_MAX_DOCUMENTS_PER_SOURCE=5 pnpm --filter cron collect:passages`：5 行が取得済み（`etag` / `last_modified` / `content_hash`）、リンク先が未取得の行として増え、本文候補ができる
4. もう一度実行すると未取得の行から 5 件取られ、取得済みの行は取り直さない
5. psql で 1 行の `fetched_at` を 8 日前にして実行すると取り直され、304 か同じハッシュで本文候補が増えない
6. psql で 1 行の `http_status` を 404 にするとキューに出ない。その path を `upsertDiscovered(..., { shouldReviveGone: true })` 相当（リンクを持つページの再取得）で見つけると対象に戻る
7. `site_url` が `https://localhost` のソースで試し実行すると `BlockedUrlError` で終わる（exit 1）
