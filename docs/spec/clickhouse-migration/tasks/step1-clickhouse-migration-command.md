# step1-clickhouse-migration-command

ClickHouse の migration コマンド（`packages/data-warehouse/clickhouse/`）を作り、ローカルの ClickHouse の DDL をすべてこのコマンド経由にする。`infra/clickhouse/init/` の init スクリプトは廃止する。migration イメージにも同梱し、コンテナからも同じコマンドを流せるようにする（AWS で動かすのは step2・4）。

AWS の環境には影響しない（Terraform・deploy workflow は触らない。migration イメージの中身は増えるが、`CMD` は Drizzle のまま）。

設計: [`../README.md`](../README.md#migration-コマンドの処理) / [環境の差の吸収](../README.md#環境の差の吸収) / [ローカルの CDC](../README.md#ローカルの-cdc)

## 対応内容

### ディレクトリ構成

```
packages/data-warehouse/            # @repo/data-warehouse（既存）
├── package.json                    # migration のスクリプトと devDependencies を足す
├── eslint.config.js                # clickhouse/ の型情報は clickhouse/tsconfig.json から取る
├── vitest.config.ts                # 新設
├── README.md                       # パッケージの役割と要件だけにする
├── src/                            # ライブラリ（build する。既存）
│   └── clickhouse/
│       └── clickhouse-data-warehouse.ts   # src/ 直下から移す
├── clickhouse/                     # 新設。ClickHouse の定義と migration コマンド（build に含めない）
│   ├── README.md                   # ClickHouse での実現方法・採用理由、migration コマンドの使い方
│   ├── tsconfig.json               # migrate/ の型検査用（noEmit）
│   ├── migrations/                 # 版管理する migration（1 回だけ適用）
│   │   └── 1_create_events.sql
│   ├── views/                      # CDC の view（毎回作り直す）。ファイル名 = CDC 対象テーブル名
│   │   ├── memos.sql
│   │   └── users.sql
│   └── migrate/                    # migration コマンド
│       ├── index.ts                # 処理の順序だけを書く
│       ├── env.ts
│       ├── cdc-view-variables.ts   # CDC の実装ごとの置き換え値
│       ├── definition-files.ts     # migrations/ ・ views/ ・ cdc-tables.json の読み込みと検査
│       ├── render-view-sql.ts
│       ├── paths.ts                # migrations/ ・ views/ ・ cdc-tables.json の場所
│       ├── find-existing-tables.ts
│       ├── local-cdc-database.ts   # 既にある pg_cdc がこのプロジェクトのものかの判定
│       ├── rebuild-local-cdc.ts
│       ├── run-versioned-migrations.ts
│       └── apply-views.ts
└── test/clickhouse/migrate/
    ├── support/fake-clickhouse-client.ts   # 実行した SQL を記録する偽の client
    ├── apply-views.test.ts
    ├── definition-files.test.ts
    ├── definitions.test.ts         # リポジトリの実際の定義ファイルを検査する（CI で一覧と view のずれに気づく）
    ├── env.test.ts
    ├── local-cdc-database.test.ts
    ├── rebuild-local-cdc.test.ts
    └── render-view-sql.test.ts

infra/clickhouse/
├── cdc-tables.json                 # 新設。CDC の対象一覧（Terraform と migration コマンドが読む）
└── users.d/materialized-postgresql.xml   # そのまま
```

置き方は `packages/db` に合わせる（実行時のコードは `src/drizzle/`、migration などの CLI 用は `drizzle/`）。理由は [設計書](../README.md#全体構成)。

`infra/clickhouse/init/` は丸ごと削除する。

### `infra/clickhouse/cdc-tables.json`

```json
["users", "memos"]
```

- `public` スキーマのテーブル名だけを並べる。ClickHouse 側のテーブル名も同じにする
- JSON はコメントを書けないため、意味と変更手順は `packages/data-warehouse/clickhouse/README.md` に書く

### `clickhouse/migrations/1_create_events.sql`

`infra/clickhouse/init/01-events.sql` を移す。**`tech_english.` の修飾を外す**（init スクリプトは DB 未指定で実行されたため修飾が必要だったが、migration は接続先の database で実行される）。冒頭のコメントのうち「entrypoint が DB 指定なしで実行する」の段落は消し、ReplacingMergeTree の理由は残す。

```sql
CREATE TABLE IF NOT EXISTS events
(
    event_id       UUID,
    event_name     LowCardinality(String),
    occurred_at    DateTime64(3),
    received_at    DateTime64(3),
    user_id        UInt64,
    source         LowCardinality(String),
    properties     String,
    schema_version UInt16 DEFAULT 1
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_name, occurred_at, user_id, event_id)
TTL toDateTime(occurred_at) + INTERVAL 2 YEAR;
```

- ファイル名は `<版番号>_<説明>.sql`。版番号は 1 からの連番（`clickhouse-migrations` は版番号を `UInt32` に入れるため、タイムスタンプ形式は使わない）
- 既存のローカル環境ではすでに `events` があるが、`IF NOT EXISTS` なので何もせずに履歴だけ記録される

### `clickhouse/views/users.sql` / `clickhouse/views/memos.sql`

`03-postgres-cdc-views.sh` が作っていた view と同じ名前・列・型にする。

```sql
CREATE OR REPLACE VIEW v_users AS
SELECT * EXCEPT (${CDC_META_COLUMNS}) REPLACE (toUInt64(id) AS id)
FROM ${CDC_DATABASE}.users FINAL
WHERE ${CDC_LIVE_FILTER}
```

```sql
CREATE OR REPLACE VIEW v_memos AS
SELECT * EXCEPT (${CDC_META_COLUMNS}) REPLACE (toUInt64(id) AS id)
FROM ${CDC_DATABASE}.memos FINAL
WHERE ${CDC_LIVE_FILTER}
```

- 1 ファイル 1 文。ファイル名（拡張子を除く）が CDC 対象のテーブル名と一致していること（検査する）
- 列を消したとき（ケース 5）は `EXCEPT (${CDC_META_COLUMNS}, <消した列>)` のように足す

### `package.json`

既存の scripts と devDependencies に足す。

```json
{
  "scripts": {
    "build": "tsc && tsc -p clickhouse/tsconfig.json",
    "dwh:migrate": "turbo run dwh:migrate:run --filter=@repo/data-warehouse",
    "dwh:migrate:run": "tsx clickhouse/migrate/index.ts",
    "lint": "eslint 'src/**/*.ts' 'clickhouse/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' 'clickhouse/**/*.ts' --fix",
    "test": "vitest run",
    "test:ci": "vitest run"
  },
  "devDependencies": {
    "clickhouse-migrations": "^1.5.0",
    "tsx": "^4.21.0",
    "vitest": "^4.1.5",
    "zod": "^3.25.76"
  }
}
```

- **人が使うのは `dwh:migrate`、コンテナが使うのは `dwh:migrate:run`。** `@repo/logger` は `dist/` を読むため、事前にビルドが要る。`dwh:migrate` は turbo 経由で依存パッケージをビルドしてから `dwh:migrate:run` を実行する。コンテナではイメージのビルド時にビルド済みなので `dwh:migrate:run` を直接起動する
- `turbo.json` に `dwh:migrate:run` タスク（`dependsOn: ["^build"]`、`cache: false`）を足す。**`passThroughEnv` に `DATA_WAREHOUSE_*` / `LOCAL_CDC_POSTGRES_*` / `LOGGER_TYPE` / `NODE_ENV` を入れる。** turbo 2 は strict env mode で、宣言していない環境変数をタスクに渡さない。渡らないと既定の接続先（`localhost:8124`）に黙って繋がる
- `turbo.json` に `@repo/data-warehouse#test` を足し、`inputs` に `$TURBO_ROOT$/infra/clickhouse/cdc-tables.json` を入れる（実際の定義ファイルを検査するテストが、`cdc-tables.json` だけを変えたときもキャッシュから返らないように）
- **migration だけが使う依存は devDependencies にする。** worker のイメージは `pnpm deploy --prod` で作るので入らない。migration イメージは全部 install する（`drizzle-kit` と同じ）
- `build` は `src/` を `dist/` に出した後、`clickhouse/tsconfig.json`（`noEmit`、`migrate/` だけを含める）で migration コマンドの型を検査する。CI は `pnpm --filter "./packages/*" build` で packages の型を検査しているため、ここで型エラーに気づける
- lint は `src/` と `clickhouse/` を対象にする（`test/` は他のパッケージと同じく対象外）。共通の ESLint 設定は `./tsconfig.json`（`src/` だけ）から型情報を取るため、`eslint.config.js` で `clickhouse/**/*.ts` だけ `./clickhouse/tsconfig.json` に向ける
- migration コマンドは `dist/` を作らず `tsx` で直接実行する（`packages/db` の `db:seed` と同じ）

### `clickhouse/migrate/env.ts`

各 app の `src/env.ts` と同じく Zod で検証し、不正なら `process.exit(1)` する。**既定値はローカルの docker compose で動く値にする**（`.env` を置かずに `dwh:migrate` だけで動くように）。

```ts
import { z } from "zod"

/**
 * ClickHouse の migration コマンドの環境変数スキーマ
 *
 * 既定値はローカルの docker compose（ClickHouse 8124 / Postgres はコンテナ内の postgres:5432）。
 * AWS では ECS のタスク定義が secret と environment で上書きする。
 */
const envSchema = z.object({
  /**
   * CDC の実装。view の定義に埋める値と、ローカルの CDC を作り直すかを決める。
   * none は CDC を張っていない環境（view を作らない）。
   */
  DATA_WAREHOUSE_CDC: z
    .enum(["materialized_postgresql", "clickpipes", "none"])
    .default("materialized_postgresql"),
  DATA_WAREHOUSE_DATABASE: z.string().default("tech_english"),
  DATA_WAREHOUSE_PASSWORD: z.string().default("password"),
  DATA_WAREHOUSE_URL: z.string().url().default("http://localhost:8124"),
  DATA_WAREHOUSE_USER: z.string().default("default"),
  /**
   * ローカルの MaterializedPostgreSQL が接続する Postgres。
   * **ClickHouse のコンテナから見た**ホスト名なので、docker compose のサービス名になる。
   * DATA_WAREHOUSE_CDC が materialized_postgresql のときだけ使う。
   */
  LOCAL_CDC_POSTGRES_DATABASE: z.string().default("tech-english_dev"),
  LOCAL_CDC_POSTGRES_HOST: z.string().default("postgres:5432"),
  LOCAL_CDC_POSTGRES_PASSWORD: z.string().default("password"),
  LOCAL_CDC_POSTGRES_USER: z.string().default("postgres"),
})
```

- `LOCAL_CDC_POSTGRES_DATABASE` の既定値は `docker-compose.yaml` の `POSTGRES_DB` と合わせる。docker-compose.yaml と同じく `TODO: プロジェクト名に変更` を付ける
- `DATA_WAREHOUSE_DATABASE` は識別子（`/^[A-Za-z_][A-Za-z0-9_]*$/`）に限る（`clickhouse-migrations` が `CREATE DATABASE` に埋め込むため）
- **`DATA_WAREHOUSE_CDC=materialized_postgresql`（既定値）は `http` の URL にだけ許す。** `pg_cdc` を消して作り直すローカル用のモードなので、タスク定義で `DATA_WAREHOUSE_CDC` を書き忘れたまま ClickHouse Cloud（`https`）に流れないよう、env の検証で止める。URL として読めない値は `z.string().url()` のエラーにする（Zod 3 は `url()` が失敗しても `superRefine` を実行するので、protocol は読めたときだけ見る）
- テストからスキーマを使うため、`export const forTesting = { envSchema }` を置く

### `clickhouse/migrate/cdc-view-variables.ts`

```ts
import type { CdcMode } from "./env"

/**
 * CDC の実装ごとに view の SQL へ埋める値。
 *
 * view の名前・列・型を環境間で揃え、定義だけを変えるためのもの。
 * none は view を作らないので持たない。
 */
export const CDC_VIEW_VARIABLES: Record<Exclude<CdcMode, "none">, Record<string, string>> = {
  clickpipes: {
    CDC_DATABASE: "pg_cdc",
    CDC_LIVE_FILTER: "_peerdb_is_deleted = 0",
    CDC_META_COLUMNS: "_peerdb_synced_at, _peerdb_is_deleted, _peerdb_version",
  },
  materialized_postgresql: {
    CDC_DATABASE: "pg_cdc",
    CDC_LIVE_FILTER: "_sign = 1",
    CDC_META_COLUMNS: "_sign, _version",
  },
}
```

### `clickhouse/migrate/definition-files.ts`

ファイルの読み込みと、DB に触る前の検査をまとめる。検査はすべて純粋関数にしてテストする。

| 関数 | 内容 |
| --- | --- |
| `readMigrationFileNames(dir)` | `*.sql` のファイル名一覧 |
| `verifyMigrationFileNames(fileNames)` | `<版番号>_` を数値で解釈し、問題の一覧を返す: 重複している版番号、`<版番号>_` の形でないファイル、`UInt32` を超える版番号（`clickhouse-migrations` は形式の誤りは弾くが、重複は検知しないため） |
| `readCdcTables(path)` / `parseCdcTablesJson(text)` | `cdc-tables.json` を読み、識別子として安全な名前（`/^[a-z_][a-z0-9_]*$/`）の重複の無い配列であることを Zod で検証する（SQL に埋め込むため） |
| `readViewDefinitions(dir)` | `{ table, sql }` の配列（`table` はファイル名から） |
| `verifyViewsMatchCdcTables(cdcTables, viewTables)` | 一覧にあって view が無いもの、view があって一覧に無いものを返す |
| `readMigrationDefinitions(dir)` / `verifyMigrationsDoNotReferenceCdc(migrations)` | migration の SQL（コメントを除く）が `pg_cdc` を参照していたら返す。`DROP TABLE IF EXISTS pg_cdc.<table>` は許す。CDC の無い環境で失敗するため、実行前に弾く |

### `clickhouse/migrate/render-view-sql.ts`

```ts
/**
 * view の SQL の ${NAME} を置き換える。
 *
 * 未定義の変数はエラーにする（置き換え漏れのまま ClickHouse に送ると、
 * 構文エラーで止まるならまだしも、別の列名として解釈されうるため）。
 */
export const renderViewSql = (template: string, variables: Record<string, string>): string =>
  template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const value = variables[name]
    if (value === undefined) throw new Error(`undefined variable in view sql: ${name}`)
    return value
  })
```

### `clickhouse/migrate/run-versioned-migrations.ts`

`clickhouse-migrations` の CLI を子プロセスで起動する。**ライブラリの関数は呼ばない**（エラー時に `process.exit(1)` するため）。

```ts
import { spawn } from "node:child_process"

/**
 * 未適用の migration を適用する。database が無ければ作る（ENGINE は指定しない）。
 */
export const runVersionedMigrations = async (params: VersionedMigrationParams): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve("clickhouse-migrations/lib/cli.js"), "migrate"], {
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("CH_MIGRATIONS_"))),
        CH_MIGRATIONS_DB: params.database,
        CH_MIGRATIONS_HOME: params.migrationsDir,
        CH_MIGRATIONS_HOST: params.url,
        CH_MIGRATIONS_PASSWORD: params.password,
        CH_MIGRATIONS_TIMEOUT: "120000",
        CH_MIGRATIONS_USER: params.username,
      },
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("close", (code, signal) => { /* 0 なら resolve、それ以外は signal か code を含めて reject */ })
  })
```

- CLI は `require.resolve("clickhouse-migrations/lib/cli.js")` で解決し、`process.execPath`（node）で起動する。stdout / stderr はそのまま流す
- `CH_MIGRATIONS_TIMEOUT` は 120 秒。アイドルから起きる ClickHouse Cloud の初回の応答を待つため（既定は 30 秒）。各文の request timeout にも効くので、重い mutation を `mutations_sync` で同期させると超えうる（README に書く）
- `CH_MIGRATIONS_SUBSTITUTE_ENV` は設定しない（版管理する migration は環境に依存させない）。親プロセスの `CH_MIGRATIONS_*` は引き継がず、必要な値だけを明示する

### `clickhouse/migrate/rebuild-local-cdc.ts`

`DATA_WAREHOUSE_CDC=materialized_postgresql` のときだけ呼ぶ。

```ts
/**
 * ローカルの CDC（MaterializedPostgreSQL）を作り直し、全テーブルの取り込みを待つ。
 *
 * テーブル単位の DETACH PERMANENTLY → ATTACH では、ClickHouse 24.10 で
 * 付け直した後の変更が反映されなかったため、database ごと作り直す。
 * replication slot と publication も DROP DATABASE で一緒に消え、作り直される。
 */
export const rebuildLocalCdc = async (client: ClickHouseClient, params: {...}): Promise<void> => {
  await client.command({ query: "DROP DATABASE IF EXISTS pg_cdc SYNC" })
  await client.command({
    query: `CREATE DATABASE pg_cdc
      ENGINE = MaterializedPostgreSQL('${host}', '${database}', '${user}', '${password}')
      SETTINGS materialized_postgresql_tables_list = '${tables.join(",")}'`,
  })
  await waitForCdcTables(client, tables, { timeoutMs: 60_000 })
}
```

- `waitForCdcTables` は `findExistingTables` で 1 秒ごとに確認する。タイムアウトしたら、現れなかったテーブル名と「Postgres にテーブルが無い。`pnpm --filter api db:migrate` を先に実行する」旨を含めて throw する
- 値は env 由来で、外部入力ではないが、`'` と `\` を含む値はエラーにして埋め込まない（ClickHouse の文字列リテラルは `\` をエスケープとして解釈する）
- **対象テーブルが空なら、消すだけで作らない。** 空の `materialized_postgresql_tables_list` は「DB の全テーブル」の意味になるため
- **DROP の前に、既にある `pg_cdc` の `system.databases.engine_full` を見て、`LOCAL_CDC_POSTGRES_HOST` / `_DATABASE` と同じ Postgres を取り込むものか確かめる。違えば消さずに throw する**（`isLocalCdcDatabaseOf`。別プロジェクトの ClickHouse に繋いでしまったときに、そのプロジェクトの CDC を消さないため）

### `clickhouse/migrate/apply-views.ts`

```ts
/**
 * CDC の view を全部作り直す（CREATE OR REPLACE VIEW）。
 *
 * view はデータを持たないため、作り直しても過去のデータは消えない。
 * 元テーブルが無い view は、clickpipes では警告して skip する
 * （CDC 対象に足した直後で、ClickPipe の初回の取り込みが終わっていない）。
 * materialized_postgresql では作り直しの後に待っているので、無ければエラーにする。
 */
export const applyViews = async (client, params: { cdcMode, views }): Promise<void> => { ... }
```

- 元テーブルの有無は `system.tables` を 1 回の問い合わせ（`name IN {tables:Array(String)}`）で確認する（`findExistingTables`）
- skip したテーブルは最後にまとめて警告として出す（`logger.warn`）。終了コードは 0

### `clickhouse/migrate/index.ts`

処理の順序だけを書く。各処理の開始と結果を `logger.info` で出す。

1. env の検証（`import { env } from "./env"`）
2. `verifyMigrationFileNames` / `verifyViewsMatchCdcTables` で検査。問題があれば DB に触る前に失敗する
3. `materialized_postgresql` なら `rebuildLocalCdc`
4. `runVersionedMigrations`
5. `none` 以外なら `applyViews`
6. ClickHouse の client を close して終了。どこかで throw されたら `logger.error` を出して `process.exitCode = 1`

ClickHouse の client は `@clickhouse/client` の `createClient` で作り、各処理に渡す。`DATA_WAREHOUSE_DATABASE` は版管理する migration（`clickhouse-migrations`）が初めて作るため、CDC の作り直しには database を指定しない client を、view には既定 database 付きの client を使う（`pg_cdc` は修飾して書く）。client の `close()` の失敗は警告にとどめ、元のエラーを上書きしない。

### migration イメージ（`packages/db/Dockerfile.migration`）

Drizzle と同じイメージに同梱する（ECR リポジトリを増やさないため）。`CMD` は Drizzle のまま変えず、ClickHouse はタスク定義の `command` で起動する（step2）。

- pruner: `turbo prune @repo/db @repo/data-warehouse --docker`
- runner: install の後に `pnpm turbo run build --filter=@repo/data-warehouse^...`（`@repo/logger` のビルド）
- `infra/clickhouse/cdc-tables.json` を `/app/infra/clickhouse/` に COPY する（`turbo prune` は workspace 外のファイルを含めないため）。`.dockerignore` が `infra/` を除外しているので、`!infra/clickhouse/cdc-tables.json` の例外を足す
- 先頭のコメントを「migration 専用イメージ（Drizzle / ClickHouse）」に更新する。ClickHouse の起動コマンドは `pnpm --filter @repo/data-warehouse dwh:migrate:run`

### `docker-compose.yaml`

- ClickHouse の `./infra/clickhouse/init:/docker-entrypoint-initdb.d` の mount を消す
- `depends_on: postgres`（init スクリプトが Postgres に繋ぐための待ち合わせ）のコメントを「migration コマンドが作る MaterializedPostgreSQL が Postgres に繋ぐ」旨に直す（依存自体は残してよい）

### ドキュメント

| ファイル | 変更 |
| --- | --- |
| `packages/data-warehouse/README.md` | パッケージの役割と要件（集計するデータ、データウェアハウスに求める要件、抽象化の範囲、実装の選び方）だけにする。ClickHouse に固有の内容は `clickhouse/README.md` に移す |
| `packages/data-warehouse/clickhouse/README.md`（新設） | ClickHouse での実現方法と採用理由（ホスティング、`events` テーブル、CDC、view を経由する規約）と、migration コマンドの使い方（4 種類の置き場所、コマンド、版番号の規則、view の書き方、変更のケースごとの作業。ケースの表は設計書へのリンクでよい） |
| ルートの `README.md` | セットアップ手順 5 を `pnpm --filter @repo/data-warehouse dwh:migrate` に置き換える。パッケージ一覧の data-warehouse に migration を書き足す |
| `CLAUDE.md`（ルート） | Packages の data-warehouse に、ClickHouse の DDL と migration コマンドを `clickhouse/` に置く旨を書き足す |
| `docs/setup/api.md` | ClickHouse の初期化に触れていれば同様に置き換える |
| `packages/db/README.md` | DB の作り直し手順の 4（CDC を張り直す）を migration コマンドに置き換える。1 の `DROP DATABASE pg_cdc` は残す（Postgres の DB を消すには replication slot を先に外す必要がある） |
| `infra/clickhouse/users.d/materialized-postgresql.xml` | コメントの参照先を `packages/data-warehouse/clickhouse/README.md` にする |
| `docs/spec/user-behavior-events/tasks/step1-infra-clickhouse.md` | 実装済みの step なので書き換えない |

## 動作確認

### ユニットテスト

`pnpm --filter @repo/data-warehouse test`

- `verifyMigrationFileNames`: `1_a.sql` と `001_b.sql` を重複として返す / `a.sql`・`0_a.sql`・14 桁の版番号をエラーにする / 連番なら空
- `isLocalCdcDatabaseOf`: 同じホストと DB 名なら true / 別の DB 名・別のホスト・MaterializedPostgreSQL でない database なら false
- `rebuildLocalCdc`（偽の client）: 別プロジェクトの `pg_cdc` なら DROP を 1 度も実行せずに throw / `'`・`\` を含む接続情報なら何も実行せずに throw / 対象が空なら DROP だけ / 時間切れなら現れなかったテーブル名を出して throw
- `applyViews`（偽の client）: 変数を埋めて作り直す / clickpipes で元テーブルが無い view は作らずに返す / materialized_postgresql なら throw
- env: `https` に materialized_postgresql を使えない / database 名に識別子以外を使えない
- リポジトリの定義ファイル: 版番号に問題が無い / `cdc-tables.json` と `views/` が 1 対 1 / 全 view が両方の CDC の変数で置き換えられる
- `verifyViewsMatchCdcTables`: 過不足の両方向を返す
- `renderViewSql`: 全変数を置き換える / 未定義の変数で throw する / `$` を含まない SQL はそのまま

### ローカル（既存の環境）

既存の volume（init スクリプトで作られた `events` と view がある状態）で:

```bash
docker compose up -d
pnpm --filter api db:migrate
pnpm --filter @repo/data-warehouse dwh:migrate
```

- 成功し、`SELECT * FROM tech_english._migrations` に `1_create_events.sql` が 1 行ある
- `SHOW CREATE VIEW tech_english.v_users` の WHERE が `_sign = 1` になっている
- 2 回続けて実行しても成功し、`_migrations` は 1 行のまま

### ローカル（空の環境）

```bash
docker compose down -v && docker compose up -d
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm --filter @repo/data-warehouse dwh:migrate
```

- `events` / `v_users` / `v_memos` ができ、`SELECT count() FROM tech_english.v_users` が seed の件数になる
- Postgres で users に 1 行足すと、数秒後に `v_users` の件数が増える

### 変更のケース（ローカル）

- **列の追加**: Postgres で `ALTER TABLE users ADD COLUMN ...` → migrate → `v_users` に新しい列が出て、その後の INSERT も反映される（作り直しでテーブルの同期が戻っていること）
- **CDC 対象の追加**: Postgres にテーブルを作り、`cdc-tables.json` と `views/<table>.sql` を足して migrate → view ができる
- **一覧と view のずれ**: `cdc-tables.json` だけに足して migrate → DB に触る前にエラーで止まる
- **Postgres にテーブルが無い**: `cdc-tables.json` と view に存在しないテーブルを足して migrate → 60 秒で「`db:migrate` を先に」のエラー
- **版番号の重複**: `1_x.sql` を足して migrate → DB に触る前にエラー
- **別の DB の `pg_cdc`**: `LOCAL_CDC_POSTGRES_DATABASE` を別の名前にして migrate → 既にある `pg_cdc` を消さずに「refusing to drop」で止まる
- **環境変数が渡ること**: `DATA_WAREHOUSE_URL` を既定と違うポートにして migrate → そのポートの ClickHouse に適用される（`turbo run ... --dry=json` の `passthrough` にも出る）
- **適用済みファイルの変更**: `1_create_events.sql` を書き換えて migrate → `clickhouse-migrations` がチェックサムの不一致で止まる（確認後に戻す）

### migration イメージ

```bash
docker build -f packages/db/Dockerfile.migration -t migration-local .
docker run --rm --network <compose のネットワーク> \
  -e DATA_WAREHOUSE_URL=http://clickhouse:8123 \
  migration-local pnpm --filter @repo/data-warehouse dwh:migrate:run
```

- ローカルと同じ結果になる（`LOCAL_CDC_POSTGRES_HOST` の既定値 `postgres:5432` はコンテナ内からも同じ）
- 引数なしで起動すると今までどおり Drizzle の migrate が動く

### lint

`pnpm lint:fix` → `pnpm lint` がエラーなし。
