# @repo/storage

バイナリ（PNG / SVG 等）を保存して公開 URL を返す **汎用ストレージ抽象 + 実装 + factory** を提供する共有パッケージ。**全 app（api / worker / cron 等）で利用する**。

## 目次

- [設計の意図](#設計の意図)
- [役割](#役割)
- [使い方](#使い方)
  - [factory 経由](#factory-経由)

## 設計の意図

**抽象（`Storage`）+ 実装（`LocalStorage` / `S3Storage`）+ factory（`createStorage` = strategy）。** 利用側は `Storage` interface だけに依存し、env から組み立てた config を factory に渡して実装を選ぶ。

> 💡 **1 インスタンス = 1 保存先（bucket / baseDir）**
> `Storage` インスタンスは生成時に保存先（S3 の bucket / local の baseDir）を束ねる。保存先が複数あるなら **保存先ごとに `createStorage` を呼んで別インスタンスを作る**（変数名 `avatarStorage` / `docStorage` 等でドメインを表す）。こうすることで interface は `save(key, body)` のまま **backend 非依存**に保て、bucket のような実装固有の概念を `save` 引数に漏らさずに済む。

> 💡 **factory は `process.env` を読まない**
> env の検証は各 app の `src/env.ts` に集約し、値（`StorageConfig`）として `createStorage` に渡す。バックエンド追加（GCS 等）は抽象を変えず union と `switch` の case を増やすだけ。

> 💡 **将来、1 app で複数の保存先（avatars / documents 等）が必要になったら 2 段階 factory を検討**
> 今は `createStorage(config)` を保存先ごとに呼ぶ（複数インスタンス）。ただし backend 選択（`type` / `region`、環境ごと）と場所（bucket / baseDir、保存先ごと）が同一 config に同居しているため、保存先が増えると `type` 分岐や S3Client 生成が重複する。複数 bucket が常態化したら、**backend を 1 回決めて保存先ごとにインスタンスを作る 2 段階 factory**（例: `createStorageFactory(env)` → `makeStorage({ name, publicUrlBase })`）へのリファクタを検討する。

## 役割

- `Storage` インターフェース（`save` / `delete`）のみに責務を絞った generic な抽象
- ローカル開発用の `LocalStorage`（filesystem）と本番用の `S3Storage`（S3）を実装として提供
- `createStorage(config)` factory で env 由来の設定から実装を 1 つ選択（strategy）
- 「達成カード画像」等のドメイン的な意味は **呼び出し側が持つ**（変数名 `cardStorage` 等）。本パッケージは特定用途に依存しない

## 使い方

### factory 経由

各 app の `src/index.ts` で env から `StorageConfig` を組み立て、factory を 1 回呼んで Repository / Service に DI する。

```ts
// apps/worker/src/index.ts
import { createStorage } from "@repo/storage"

const storage =
  env.STORAGE_TYPE === "s3"
    ? createStorage({
        type: "s3",
        bucket: env.S3_BUCKET,
        publicUrlBase: env.S3_PUBLIC_URL_BASE,
        region: env.AWS_REGION,
      })
    : createStorage({
        type: "local",
        baseDir: env.STORAGE_LOCAL_DIR,
        publicUrlPrefix: env.STORAGE_LOCAL_URL_PREFIX,
      })

const url = await storage.save("badges/123.png", pngBuffer)
```

