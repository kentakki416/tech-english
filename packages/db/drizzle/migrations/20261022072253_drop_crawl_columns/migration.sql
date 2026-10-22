DROP INDEX "source_documents_source_id_fetched_at_idx";--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_website_check", ADD CONSTRAINT "sources_website_check" CHECK ("fetch_type" <> 'website' OR "site_url" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "sitemap_url";--> statement-breakpoint
ALTER TABLE "sources" DROP COLUMN "start_url";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "etag";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "http_status";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "last_modified";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "sitemap_lastmod";
