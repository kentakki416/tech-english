CREATE TABLE "source_collection_runs" (
	"id" serial PRIMARY KEY,
	"created_passage_count" integer,
	"error" text,
	"fetched_document_count" integer,
	"finished_at" timestamp(3),
	"source_id" integer NOT NULL,
	"started_at" timestamp(3),
	"status" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "source_collection_runs_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'limit_reached', 'rate_limited', 'up_to_date', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "source_collection_runs_active_source_id_key" ON "source_collection_runs" ("source_id") WHERE "status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "source_collection_runs_source_id_id_idx" ON "source_collection_runs" ("source_id","id");--> statement-breakpoint
ALTER TABLE "source_collection_runs" ADD CONSTRAINT "source_collection_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;