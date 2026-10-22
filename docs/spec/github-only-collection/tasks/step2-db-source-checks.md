# step2-db-source-checks

ソースの DB の制約を 2 つ直す。

- ライセンスに「個人の学習用」（`LicenseRef-personal-use`）を足す。ドメインの定数・型と、ライセンスの CHECK 制約を直す
- サイトのソースは常に無効にする。今有効のサイトのソースを無効にしてから、CHECK 制約で守る

api・admin で選べるようにするのは step3・step4。仕様と理由は README の[個人の学習用のライセンス](../README.md#個人の学習用のライセンス)・[持ち方](../README.md#個人の学習用のライセンスの持ち方)・[サイトのソース（ローカルだけ）](../README.md#サイトのソースローカルだけ)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/domain/src/const/source.ts` | `PERSONAL_USE_LICENSE`・`SOURCE_LICENSES` |
| `packages/domain/src/types/source.ts` | `PersonalUseLicense`・`SourceLicense`。`licenseSpdx` を取得方法ごとの型に移す |
| `packages/domain/src/rules/source.ts` | `isSourceLicense` |
| `packages/domain/src/index.ts` | 足した定数・型・関数の export |
| `packages/domain/test/rules/source.test.ts` | `isSourceLicense` のテスト |
| `packages/db/src/drizzle/schema/source.ts` | `license_spdx` の enum と CHECK 制約、サイトのソースを無効に限る CHECK 制約 |
| `packages/db/drizzle/migrations/` | `db:generate` で作るマイグレーションに、サイトのソースを無効にする UPDATE を書き足す |
| `apps/api/src/repository/drizzle/source-repository.ts`・`apps/cron/src/repository/drizzle/source-repository.ts` | `_toDomain` の GitHub の分岐でライセンスを確かめる |

### 定数

`ALLOWED_LICENSES` の後ろに足す。

```ts
export const PERSONAL_USE_LICENSE = "LicenseRef-personal-use"

export const SOURCE_LICENSES = [...ALLOWED_LICENSES, PERSONAL_USE_LICENSE] as const
```

- `PERSONAL_USE_LICENSE` の JSDoc：ライセンスの記載が無いサイトを自分で読むためだけに取り込むときの値。ローカルのサイトのソースだけが使う。`LicenseRef-` は SPDX で独自のライセンスを表す書き方
- `SOURCE_LICENSES` の JSDoc：ソースに入れられるライセンス。DB の CHECK 制約はここから作る
- `ALLOWED_LICENSES` の JSDoc の先頭の「登録を許可するライセンス」は「公開してよいライセンス」にする（個人の学習用は入れない）

### 型

```ts
export type PersonalUseLicense = typeof PERSONAL_USE_LICENSE

export type SourceLicense = (typeof SOURCE_LICENSES)[number]
```

`SourceBase` から `licenseSpdx` を外し、取得方法ごとに持たせる。

```ts
export type GitHubRepositorySource = SourceBase & {
  branch: string
  fetchType: "github_repository"
  lastCollectedCommitSha: string | null
  lastCollectedExtractionVersion: string | null
  licenseSpdx: AllowedLicense
  publicUrlStripPrefix: string | null
  publicUrlTemplate: string | null
  repository: string
}

export type WebsiteSource = SourceBase & {
  contentSelector: string | null
  excludeSelectors: string[]
  fetchType: "website"
  licenseSpdx: SourceLicense
  siteUrl: string
}
```

- 既存の項目・JSDoc はそのまま。上は `licenseSpdx` を足す位置だけを示している（`WebsiteSource` の `sitemapUrl`・`startUrl` は step5 で消すので、ここでは残す）

### 判定の関数

```ts
export const isSourceLicense = (value: string): value is SourceLicense =>
  (SOURCE_LICENSES as readonly string[]).includes(value)
```

テスト（`isAllowedLicense` の describe の後ろ）：

```ts
describe("isSourceLicense", () => {
  describe("正常系", () => {
    it.each(SOURCE_LICENSES)("%s はソースのライセンスである", (value) => {
      expect(isSourceLicense(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "LicenseRef-permission", "licenseref-personal-use", "GPL-3.0-only"])("%j はソースのライセンスではない", (value) => {
      expect(isSourceLicense(value)).toBe(false)
    })
  })
})
```

`isAllowedLicense` の異常系に `PERSONAL_USE_LICENSE` を足す（個人の学習用は許可リストに入らない）。

### スキーマ

```ts
    licenseSpdx: text("license_spdx", { enum: SOURCE_LICENSES }).notNull(),
```

```ts
    check("sources_license_spdx_check", sql`${table.licenseSpdx} IN (${joinSqlValues(SOURCE_LICENSES)})`),
    check(
      "sources_personal_use_license_check",
      sql`${table.fetchType} = 'website' OR ${table.licenseSpdx} <> ${PERSONAL_USE_LICENSE}`,
    ),
```

```ts
    check("sources_website_disabled_check", sql`${table.fetchType} <> 'website' OR ${table.isEnabled} = false`),
```

- `sources_personal_use_license_check` は `sources_license_spdx_check` の直後に置く。JSDoc：個人の学習用はサイトのソースだけ（GitHub のソースは公開してよいライセンスに限る）
- `sources_website_disabled_check` は `sources_website_check` の直後に置く。JSDoc：サイトのソースは収集しないので有効にしない（URL から追加は有効・無効を見ない）
- `isEnabled` の JSDoc に「サイトのソースは常に false」を足す
- import の `ALLOWED_LICENSES` は `PERSONAL_USE_LICENSE`・`SOURCE_LICENSES` に置き換える

```bash
pnpm --filter @repo/domain build
pnpm --filter @repo/db build
pnpm --filter api db:generate --name add_source_license_and_website_checks
```

生成された `migration.sql` が次の 4 文だけであることを確かめる（順番は drizzle-kit に任せる）。

```sql
ALTER TABLE "sources" DROP CONSTRAINT "sources_license_spdx_check";
ALTER TABLE "sources" ADD CONSTRAINT "sources_license_spdx_check" CHECK ("sources"."license_spdx" IN ('MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-4.0', 'PSF-2.0', 'CC0-1.0', 'Unlicense', 'LicenseRef-personal-use'));
ALTER TABLE "sources" ADD CONSTRAINT "sources_personal_use_license_check" CHECK ("sources"."fetch_type" = 'website' OR "sources"."license_spdx" <> 'LicenseRef-personal-use');
ALTER TABLE "sources" ADD CONSTRAINT "sources_website_disabled_check" CHECK ("sources"."fetch_type" <> 'website' OR "sources"."is_enabled" = false);
```

- `<>` の右辺が `$1` のようなパラメータになっていたら、`joinSqlValues([PERSONAL_USE_LICENSE])` で包んでリテラルにする
- **`sources_website_disabled_check` を足す文の前に、次の UPDATE を手で書き足す**。ローカルで有効にしていたサイトのソースがあると、制約を足す文が失敗するため（[既存のデータ](../README.md#既存のデータ)）。`db:generate` を流し直すと消えるので、生成し直したら書き足し直す

```sql
UPDATE "sources" SET "is_enabled" = false WHERE "fetch_type" = 'website';--> statement-breakpoint
```

### seed の「開発用サンプル」は変えない

seed（`seed-sample-passages.ts` の `SOURCE`）の `licenseUrl` は creativecommons.org を指していて、step3 の検証（リポジトリのファイルの URL）に合わない。ただ、このソースは収集しない架空のソース（無効・リポジトリは非公開・`docs/sample/` も無い）で、seed は api を通らないので値は検証されない。合わせるためだけにリポジトリにライセンスのファイルを作ることはしない。admin でこのソースを編集して保存するときは、URL の入力エラーが出るので直してから保存する。

### Repository の `_toDomain`

DB の行の `licenseSpdx` は `SourceLicense` になるので、GitHub の分岐では `isAllowedLicense` で確かめてから入れる。確かめられない行は、`repository` が NULL の行と同じく throw する（DB の CHECK があるので起きない）。api と cron の `_toDomain` は同じ形なので、両方を同じように直す。

```ts
    const base = {
      id: row.id,
      excludeGlobs: row.excludeGlobs,
      includeGlobs: row.includeGlobs,
      isEnabled: row.isEnabled,
      kind: row.kind,
      lastCollectedAt: row.lastCollectedAt,
      licenseUrl: row.licenseUrl,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    if (row.fetchType === "github_repository") {
      const licenseSpdx = row.licenseSpdx
      if (row.repository === null || row.branch === null || !isAllowedLicense(licenseSpdx)) {
        throw new Error(`Invalid github_repository source: id=${row.id}`)
      }
      return {
        ...base,
        branch: row.branch,
        fetchType: row.fetchType,
        lastCollectedCommitSha: row.lastCollectedCommitSha,
        lastCollectedExtractionVersion: row.lastCollectedExtractionVersion,
        licenseSpdx,
        publicUrlStripPrefix: row.publicUrlStripPrefix,
        publicUrlTemplate: row.publicUrlTemplate,
        repository: row.repository,
      }
    }
    if (row.siteUrl === null) throw new Error(`Invalid website source: id=${row.id}`)
    return {
      ...base,
      contentSelector: row.contentSelector,
      excludeSelectors: row.excludeSelectors,
      fetchType: row.fetchType,
      licenseSpdx: row.licenseSpdx,
      sitemapUrl: row.sitemapUrl,
      siteUrl: row.siteUrl,
      startUrl: row.startUrl,
    }
```

- `isAllowedLicense` は `@repo/domain` から import する
- ほかに型エラーが出るところ（`AllowedLicense` を受け取っている関数・テストの fixture）は `tsc` が教える。サイトのソースを受け取るところは `SourceLicense` にする

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
pnpm --filter @repo/domain test
pnpm --filter api db:migrate
pnpm --filter api test      # test DB に migration が流れる。vitest を直接叩かない（dev DB が消える）
pnpm --filter cron test
pnpm --filter api exec tsc --noEmit
pnpm --filter cron exec tsc --noEmit
pnpm lint:fix
```

- [ ] 生成された migration が上の 4 文と、手で足した UPDATE（制約を足す文より前）だけ
- [ ] dev DB で、GitHub のソースに個人の学習用を入れると CHECK で止まり、サイトのソースには入る。サイトのソースを有効にすると CHECK で止まる

```bash
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c "BEGIN; UPDATE sources SET license_spdx = 'LicenseRef-personal-use' WHERE fetch_type = 'github_repository'; ROLLBACK;"
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c "BEGIN; UPDATE sources SET license_spdx = 'LicenseRef-personal-use' WHERE fetch_type = 'website'; ROLLBACK;"
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c "BEGIN; UPDATE sources SET is_enabled = true WHERE fetch_type = 'website'; ROLLBACK;"
```

1 つめは `sources_personal_use_license_check`、3 つめは `sources_website_disabled_check` の違反、2 つめは `UPDATE n` になる。

- [ ] 有効のサイトのソースがあっても migration が通り、そのソースが無効になる。`pnpm --filter api db:migrate` を流す前に、dev DB でサイトのソースを 1 つ有効にしておく（`UPDATE sources SET is_enabled = true WHERE fetch_type = 'website'`）。migration の後に `SELECT id, is_enabled FROM sources WHERE fetch_type = 'website'` がすべて `f` になっている

- [ ] admin のソースの一覧・編集が今までどおり開ける
