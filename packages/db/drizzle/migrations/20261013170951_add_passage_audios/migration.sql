CREATE TABLE "passage_audios" (
	"id" serial PRIMARY KEY,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"billed_characters" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp(3),
	"generation_started_at" timestamp(3),
	"last_error" text,
	"manifest" jsonb,
	"passage_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"text_hash" text NOT NULL,
	"voice_id" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "passage_audios_status_check" CHECK ("status" IN ('pending', 'generating', 'ready', 'failed')),
	CONSTRAINT "passage_audios_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "passage_audios_ready_columns_check" CHECK ("status" <> 'ready' OR ("manifest" IS NOT NULL AND "generated_at" IS NOT NULL)),
	CONSTRAINT "passage_audios_generating_columns_check" CHECK ("status" <> 'generating' OR "generation_started_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "reading_attempts" ADD COLUMN "listened_block_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "passage_audios_passage_id_key" ON "passage_audios" ("passage_id");--> statement-breakpoint
CREATE INDEX "passage_audios_status_idx" ON "passage_audios" ("status");--> statement-breakpoint
ALTER TABLE "passage_audios" ADD CONSTRAINT "passage_audios_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;