# 集計クエリを書くときの注意

ClickHouse のテーブルは、重複や更新・削除を「行の追記」で表すものがある。**読み方を間違えてもエラーにならず、件数が静かに狂う**ので、
`events` は `FINAL` を付けて読み、CDC で取り込んだ業務データは view から読む。

## 目次

- [events テーブル](#events-テーブル)
  - [集計時に FINAL を忘れると静かに数字が狂う](#集計時に-final-を忘れると静かに数字が狂う)
- [view を経由する規約](#view-を経由する規約)

## events テーブル

`events`（`packages/data-warehouse/clickhouse/migrations/1_create_events.sql`）は `ReplacingMergeTree` で、
`ORDER BY` の末尾に `event_id` を置いている。同じ `event_id` の行はマージ時に 1 件に畳まれる。
BullMQ の配送は at-least-once で同じイベントが 2 回届くことがあり（[`apps/worker/CLAUDE.md`](../../../apps/worker/CLAUDE.md#冪等性は必須)）、
`event_id` は enqueue 時に振っているので再配信でも同じ値になる（[`packages/events`](../../../packages/events/README.md#重複排除は-eventid-の採番場所で決まる)）。
月ごとにパーティションを切り、2 年で TTL により消える。

**マージは非同期**なので、insert 直後は重複が見えている状態がありうる。

### 集計時に FINAL を忘れると静かに数字が狂う

畳み込みを待たずに正しい結果を得るには `FINAL` を付けるか `argMax` で最新を取る。
**忘れてもエラーにならず、件数が多く出るだけ**なので気付きにくい。

同じ罠は CDC したテーブルにもあり、そちらは削除行（タンブストーン）も絡む。
そのため**分析クエリは [view を経由する](#view-を経由する規約)**規約にしている。

## view を経由する規約

CDC テーブルは更新を「新しい版の追記」、削除を「タンブストーン行」で表現する。
**分析クエリはこれらを直接参照せず、`tech_english.v_*` の view を見る。**

```sql
-- ✓ OK
SELECT u.name, count() FROM events AS e
INNER JOIN v_users AS u ON u.id = e.user_id GROUP BY u.name
```

view が吸収しているのは 3 つ。

1. **`FINAL`** — 付け忘れると古い版が二重に数えられる
2. **削除行の除外** — ローカルは `_sign = 1`、ClickHouse Cloud は `_peerdb_is_deleted = 0`
3. **`id` の型** — Postgres の `integer` は `Int32` にマップされるが `events.user_id` は `UInt64` で、
   符号の有無が違うと共通型が無く `NO_COMMON_TYPE` で JOIN が落ちる。view 側で `toUInt64` する

**view の名前・列・型を両環境で揃え、定義だけを環境ごとに変える。** これで分析クエリは
どちらの環境でもそのまま動く。view の書き方は [`migration.md`](./migration.md#cdc-の-view-の書き方)。
