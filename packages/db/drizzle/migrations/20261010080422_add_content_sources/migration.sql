CREATE TABLE "content_sources" (
	"id" serial PRIMARY KEY,
	"branch" text,
	"content_selector" text,
	"exclude_globs" jsonb DEFAULT '[]' NOT NULL,
	"exclude_selectors" jsonb DEFAULT '[]' NOT NULL,
	"fetch_type" text NOT NULL,
	"include_globs" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"kind" text NOT NULL,
	"last_collected_at" timestamp(3),
	"last_collected_commit_sha" text,
	"license_spdx" text NOT NULL,
	"license_url" text NOT NULL,
	"name" text NOT NULL,
	"public_url_strip_prefix" text,
	"public_url_template" text,
	"repository" text,
	"sitemap_url" text,
	"site_url" text,
	"start_url" text,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "content_sources_kind_check" CHECK ("kind" IN ('docs', 'github')),
	CONSTRAINT "content_sources_fetch_type_check" CHECK ("fetch_type" IN ('github_repository', 'website')),
	CONSTRAINT "content_sources_license_spdx_check" CHECK ("license_spdx" IN ('MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-4.0', 'PSF-2.0', 'CC0-1.0', 'Unlicense')),
	CONSTRAINT "content_sources_github_repository_check" CHECK ("fetch_type" <> 'github_repository' OR ("repository" IS NOT NULL AND "branch" IS NOT NULL)),
	CONSTRAINT "content_sources_website_check" CHECK ("fetch_type" <> 'website' OR ("site_url" IS NOT NULL AND ("sitemap_url" IS NOT NULL OR "start_url" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" serial PRIMARY KEY,
	"attention_reasons" jsonb DEFAULT '[]' NOT NULL,
	"blocks" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"difficulty" smallint,
	"generated_at" timestamp(3),
	"generation_attempt_count" integer DEFAULT 0 NOT NULL,
	"generation_error" text,
	"generation_model" text,
	"generation_prompt_version" text,
	"generation_started_at" timestamp(3),
	"needs_attention" boolean DEFAULT false NOT NULL,
	"published_at" timestamp(3),
	"reject_reason" text,
	"reviewed_at" timestamp(3),
	"source_commit_sha" text,
	"source_document_id" integer NOT NULL,
	"source_path" text NOT NULL,
	"source_retrieved_at" timestamp(3) NOT NULL,
	"status" text DEFAULT 'collected' NOT NULL,
	"time_limit_seconds" integer,
	"title" text NOT NULL,
	"word_count" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "passages_status_check" CHECK ("status" IN ('collected', 'generating', 'draft', 'published', 'rejected', 'failed')),
	CONSTRAINT "passages_difficulty_check" CHECK ("difficulty" IN (1, 2, 3))
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" serial PRIMARY KEY,
	"blob_sha" text,
	"commit_sha" text,
	"content_hash" text,
	"etag" text,
	"fetched_at" timestamp(3),
	"http_status" smallint,
	"last_modified" text,
	"path" text NOT NULL,
	"sitemap_lastmod" timestamp(3),
	"source_id" integer NOT NULL,
	"title" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "content_sources_repository_key" ON "content_sources" ("repository");--> statement-breakpoint
CREATE UNIQUE INDEX "content_sources_site_url_key" ON "content_sources" ("site_url");--> statement-breakpoint
CREATE UNIQUE INDEX "passages_content_hash_key" ON "passages" ("content_hash");--> statement-breakpoint
CREATE INDEX "passages_status_created_at_idx" ON "passages" ("status","created_at");--> statement-breakpoint
CREATE INDEX "passages_source_document_id_idx" ON "passages" ("source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_source_id_path_key" ON "source_documents" ("source_id","path");--> statement-breakpoint
CREATE INDEX "source_documents_source_id_fetched_at_idx" ON "source_documents" ("source_id","fetched_at");--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;