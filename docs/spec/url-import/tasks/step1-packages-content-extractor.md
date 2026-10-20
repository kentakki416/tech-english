# step1-packages-content-extractor

cron の本文の抽出とサイトの取得を、共有パッケージ `@repo/content-extractor` に移す。cron の挙動は変えない（テストも移すだけ）。理由は [README](../README.md#抽出の処理の共有パッケージ)。

## 対応内容

### 移すもの

`git mv` で移し、import のパスを直す。

| 移す前（`apps/cron/`） | 移した後（`packages/content-extractor/`） |
| --- | --- |
| `src/lib/document/*` | `src/document/*` |
| `src/client/web/*` | `src/web/*` |
| `src/lib/url.ts`・`src/lib/parse-sitemap.ts`・`src/lib/path-filter.ts` | `src/url.ts`・`src/parse-sitemap.ts`・`src/path-filter.ts` |
| `src/service/collection/website-pages.ts` | `src/website-pages.ts` |
| `src/const/collection.ts` のうち `COLLECTOR_USER_AGENT`・`CRAWLER_NAME`・`MAX_CRAWL_DELAY_SECONDS`・`WEB_REQUEST_TIMEOUT_MS`・`MAX_HTML_BYTES`・`MAX_SITEMAP_BYTES`・`MAX_CHILD_SITEMAPS`・`MAX_REDIRECTS` | `src/const.ts` |
| `test/lib/document/*`・`test/fixtures/document/` | `test/document/*`・`test/fixtures/document/` |
| `test/client/web/*` | `test/web/*` |
| `test/lib/url.test.ts`・`test/lib/parse-sitemap.test.ts`・`test/lib/path-filter.test.ts` | `test/url.test.ts`・`test/parse-sitemap.test.ts`・`test/path-filter.test.ts` |

- cron の `const/collection.ts` には、取得以外の定数（GitHub の rate limit・試し実行の件数・`.md` の大きさの上限・連続のネットワークエラー・実行の間隔・404 / 410・却下の理由）を残す
- `extract-github-file.ts`・`collect-*.ts`・`preview-source.ts`・`replace-passage-candidates.ts`・`list-github-target-files.ts`・`task/collect-passages.ts`・GitHub のクライアント（`COLLECTOR_USER_AGENT`）は cron に残し、`@repo/content-extractor` から import する

### パッケージの設定

`package.json`：

```json
{
  "name": "@repo/content-extractor",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "clean": "rm -rf dist",
    "dev": "tsc --project tsconfig.build.json --watch",
    "lint": "eslint 'src/**/*.ts' 'test/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' 'test/**/*.ts' --fix",
    "test": "vitest run",
    "test:ci": "vitest run",
    "test:watch": "vitest"
  }
}
```

- `test:ci` は必ず置く（CI は `turbo run test:ci` だけを流すので、無いと移したテスト〈SSRF 対策の `safe-lookup` を含む〉が CI から外れる）
- `dependencies` は cron から移す：`@mozilla/readability`・`@repo/domain`・`@repo/logger`・`jsdom`・`picomatch`・`rehype-parse`・`rehype-remark`・`remark-frontmatter`・`remark-gfm`・`remark-mdx`・`remark-parse`・`robots-parser`・`undici`・`unified`・`yaml`（版は cron の今のものと同じ）。型（`@types/mdast` など）も同じく移す
- cron の `package.json` から、cron で使わなくなった依存を外し、`@repo/content-extractor: workspace:^` を足す。`jsdom` の版の固定（v29）の注意は、パッケージの README に移す

`tsconfig.json`（unified などの ESM を CommonJS から読むため、cron と同じく `nodenext`）：

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node", "vitest/globals"]
  },
  "include": ["${configDir}/src/**/*", "${configDir}/test/**/*"]
}
```

`tsconfig.build.json`・`vitest.config.ts`・`eslint.config.js` は `packages/queue` と同じ形にする（vitest は `LOGGER_TYPE: "silent"`）。

### `src/index.ts`

cron が使う名前を、ファイル名順に名前を列挙して re-export する（`forTesting` を持つファイルがあるので `export *` にしない）。

```ts
export { COLLECTOR_USER_AGENT, MAX_CRAWL_DELAY_SECONDS } from "./const"
export { EXTRACTION_VERSION, extractDocument } from "./document"
export type { ChunkRejectReason, ExtractDocumentInput, ExtractedDocument, PassageChunk } from "./document"
export { findGlobBaseDirectories, isTargetPath } from "./path-filter"
export { isFetchablePath, normalizePageUrl } from "./url"
export { BlockedUrlError, CrawlDelayTooLongError, WebPageClient, WebSourceThrottledError } from "./web"
export type { ConditionalRequest, FetchPageResult, FetchPageSkipReason, IWebPageClient, SitemapUrl, WebPageClientOptions } from "./web"
export {
  buildPageUrl,
  extractWebPage,
  findFetchablePagePath,
  findStartPagePath,
  isPassageTargetUrl,
  selectFetchablePagePaths,
} from "./website-pages"
```

- 実際に cron が使う名前は `tsc` で確かめ、使わないものは出さない

### ドキュメント

- `packages/content-extractor/README.md`：役割（本文の抽出とサイトの取得。env も DB も知らない）、ファイルの表（`apps/cron/CLAUDE.md` の「lib/document（文書パーサー）」の表と `client/web`・`lib/url`・`lib/path-filter`・`lib/parse-sitemap` の行を移す）、ESM の依存と Node 20.19 以上が要ること、jsdom を v29 に固定している理由
- `apps/cron/CLAUDE.md`：「lib/document（文書パーサー）」の節と「ESM 専用の依存（require(esm)）」の節をパッケージの README へのリンクにし、collect:passages の表の移した行を消す。テスト戦略の `lib/document` の fixture の行をパッケージに合わせる
- ルートの `CLAUDE.md` の Packages に `packages/content-extractor` を足す
- `docs/spec/content-collection/README.md` の「調整できる箇所」の表のファイルのパスを、パッケージのパスに直す

## 動作確認

```bash
pnpm install
pnpm --filter @repo/content-extractor build
pnpm --filter @repo/content-extractor test
pnpm --filter @repo/content-extractor exec tsc --noEmit
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
pnpm --filter cron build && node -e "require('./apps/cron/dist/service/collection')"
```

- 移したテストの件数が、移す前の cron の該当のテストの件数と同じこと
- dev の React 公式ドキュメントのソースで試し実行し、移す前と同じ結果になること（`pnpm --filter cron collect:passages --source-id=<id> --dry-run`）
