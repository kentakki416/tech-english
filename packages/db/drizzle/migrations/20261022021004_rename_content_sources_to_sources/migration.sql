ALTER TABLE "content_sources" RENAME TO "sources";--> statement-breakpoint
ALTER SEQUENCE "content_sources_id_seq" RENAME TO "sources_id_seq";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_pkey" TO "sources_pkey";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_kind_check" TO "sources_kind_check";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_fetch_type_check" TO "sources_fetch_type_check";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_license_spdx_check" TO "sources_license_spdx_check";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_github_repository_check" TO "sources_github_repository_check";--> statement-breakpoint
ALTER TABLE "sources" RENAME CONSTRAINT "content_sources_website_check" TO "sources_website_check";--> statement-breakpoint
ALTER INDEX "content_sources_repository_key" RENAME TO "sources_repository_key";--> statement-breakpoint
ALTER INDEX "content_sources_site_url_key" RENAME TO "sources_site_url_key";--> statement-breakpoint
ALTER TABLE "content_source_tags" RENAME TO "source_tags";--> statement-breakpoint
ALTER TABLE "source_tags" RENAME COLUMN "content_source_id" TO "source_id";--> statement-breakpoint
ALTER TABLE "source_tags" RENAME CONSTRAINT "content_source_tags_pkey" TO "source_tags_pkey";--> statement-breakpoint
ALTER TABLE "source_tags" RENAME CONSTRAINT "content_source_tags_content_source_id_fkey" TO "source_tags_source_id_fkey";--> statement-breakpoint
ALTER TABLE "source_tags" RENAME CONSTRAINT "content_source_tags_tag_id_fkey" TO "source_tags_tag_id_fkey";--> statement-breakpoint
ALTER INDEX "content_source_tags_tag_id_idx" RENAME TO "source_tags_tag_id_idx";--> statement-breakpoint
-- デプロイ中に残っている前の版の api / cron（content_sources / content_source_tags を読み書きする）のための互換の view。
-- 列をそのまま並べた単純な view なので、SELECT に加えて INSERT / UPDATE / DELETE も元のテーブルに届く（自動更新可能なビュー）。
-- 全環境に deploy し終えたら、次の migration で消す
CREATE VIEW "content_sources" AS SELECT * FROM "sources";--> statement-breakpoint
CREATE VIEW "content_source_tags" AS SELECT "source_id" AS "content_source_id", "tag_id" FROM "source_tags";
