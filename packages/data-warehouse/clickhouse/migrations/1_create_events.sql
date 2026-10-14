-- ユーザー行動イベント
--
-- 設計: docs/spec/user-behavior-events/README.md
--
-- ReplacingMergeTree にしているのは BullMQ が at-least-once で
-- 同じイベントが 2 回届きうるため。ORDER BY 末尾の event_id が重複排除キーになる。
-- 集計時は FINAL を付けるか argMax で最新を取る。
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
