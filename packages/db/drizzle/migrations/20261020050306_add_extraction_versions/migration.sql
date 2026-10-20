ALTER TABLE "content_sources" ADD COLUMN "last_collected_extraction_version" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "extraction_version" text;