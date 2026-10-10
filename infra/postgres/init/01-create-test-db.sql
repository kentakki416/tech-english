-- テスト用 DB を作る（ローカル専用）
--
-- dev DB（project-template_dev）は docker-compose.yaml の POSTGRES_DB で作られるが、
-- apps/api のインテグレーションテストが使う test DB はここで作る。
-- drizzle-kit migrate は DB が無いときに作らない（Prisma の migrate deploy は作っていた）ため。
--
-- Postgres の volume が空のとき（初回起動 / docker compose down -v の後）だけ実行される。
CREATE DATABASE "project-template_test"; -- TODO: プロジェクト名に変更
