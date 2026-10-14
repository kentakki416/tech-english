# @repo/data-warehouse

分析用データ（行動イベント）の書き込み先を抽象化するパッケージ。今の実装は ClickHouse だけ。
ClickHouse の採用理由・テーブル・CDC・運用は [`docs/tech-stack/clickhouse/`](../../docs/tech-stack/clickhouse/README.md) にまとめている。

## 構成

```
packages/data-warehouse/
├── src/                          ライブラリ（build して worker が使う）
│   ├── data-warehouse.ts         DataWarehouse interface（insertAll / close）
│   ├── create-data-warehouse.ts  実装を選ぶ factory
│   ├── noop-data-warehouse.ts    何も書き込まない実装
│   └── clickhouse/               ClickHouse の実装
└── clickhouse/                   ClickHouse のテーブル・view の定義と migration コマンド（build に含めない。README あり）
```

## 使い方

- worker の `src/index.ts` で `createDataWarehouse` を 1 回呼び、Repository に DI する
- 実装は worker の `DATA_WAREHOUSE_TYPE` で選ぶ。`clickhouse` か、何も書き込まない `none`（[`apps/worker/CLAUDE.md`](../../apps/worker/CLAUDE.md#環境変数)）
- interface は書き込み専用で、**クエリは持たない。** 分析クエリは BI ツールや管理画面側の責務
- `insertAll` は失敗を `logger.error` に出してから re-throw する。リトライは worker（BullMQ）に任せる
- テーブル定義・migration はバックエンドごとに方言が違うので interface に入れず、`clickhouse/` に方言のまま置く

## 関連

- [`docs/tech-stack/clickhouse/`](../../docs/tech-stack/clickhouse/README.md) — ClickHouse の採用理由・方式の選択・集計クエリの注意・CDC・migration
- [`docs/spec/user-behavior-events/README.md`](../../docs/spec/user-behavior-events/README.md) — 行動イベント基盤の設計
- [`packages/events/`](../events) — 送出の抽象（`EventTracker`）
- [`apps/worker/CLAUDE.md`](../../apps/worker/CLAUDE.md) — 消費側の実装と環境変数
