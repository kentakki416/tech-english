-- Postgres から ClickHouse への CDC（ローカル専用）
--
-- 設計: packages/data-warehouse/README.md
--
-- 行動イベント（events）は ClickHouse にしか無いため、user_id から
-- ユーザー属性を引くような分析をするには業務データも ClickHouse 側に必要になる。
-- それを論理レプリケーションで同期する。
--
-- **prd はこの実装を使わない。** prd は ClickHouse Cloud の ClickPipes
-- （マネージドな PeerDB）で同じことをする。MaterializedPostgreSQL は
-- ClickHouse の experimental 機能なので本番の根幹には置かない。
--
-- ローカルで揃えているのは **Postgres 側の契約**:
--   wal_level=logical / publication の自動作成 / pgoutput の replication slot
-- 運用で実際に事故るのはこの層（slot が止まると WAL が溜まる）なので、
-- そこはローカルでも同じ形で踏めるようにしている。

-- Postgres の users / memos を CDC で追随させる。
-- publication と replication slot は ClickHouse 側が自動作成する。
-- 同期対象を増やすときは materialized_postgresql_tables_list に足す。
CREATE DATABASE IF NOT EXISTS pg_cdc
ENGINE = MaterializedPostgreSQL('postgres:5432', 'project-template_dev', 'postgres', 'password')
SETTINGS materialized_postgresql_tables_list = 'users,memos';

-- 分析クエリが見る view は 03-postgres-cdc-views.sh で作る。
-- MaterializedPostgreSQL は **テーブルを非同期にアタッチする**ため、
-- ここで CREATE VIEW すると pg_cdc.users がまだ存在せず UNKNOWN_TABLE で落ちる。
