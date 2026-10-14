CREATE TABLE "word_audios" (
	"id" serial PRIMARY KEY,
	"audio_key" text,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"billed_characters" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp(3),
	"generation_started_at" timestamp(3),
	"last_error" text,
	"lemma" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"text_hash" text,
	"voice_id" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "word_audios_status_check" CHECK ("status" IN ('pending', 'generating', 'ready', 'failed')),
	CONSTRAINT "word_audios_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "word_audios_lemma_check" CHECK ("lemma" = lower(btrim("lemma")) AND char_length("lemma") BETWEEN 1 AND 200),
	CONSTRAINT "word_audios_ready_columns_check" CHECK ("status" <> 'ready' OR ("audio_key" IS NOT NULL AND "text_hash" IS NOT NULL AND "generated_at" IS NOT NULL)),
	CONSTRAINT "word_audios_generating_columns_check" CHECK ("status" <> 'generating' OR "generation_started_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "audio_synthesis_usages" ADD COLUMN "word_audio_id" integer;--> statement-breakpoint
ALTER TABLE "audio_synthesis_usages" ALTER COLUMN "passage_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "audio_synthesis_usages_word_audio_id_idx" ON "audio_synthesis_usages" ("word_audio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_audios_lemma_key" ON "word_audios" ("lemma");--> statement-breakpoint
CREATE INDEX "word_audios_status_idx" ON "word_audios" ("status");--> statement-breakpoint
ALTER TABLE "audio_synthesis_usages" ADD CONSTRAINT "audio_synthesis_usages_word_audio_id_fkey" FOREIGN KEY ("word_audio_id") REFERENCES "word_audios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audio_synthesis_usages" ADD CONSTRAINT "audio_synthesis_usages_target_check" CHECK (num_nonnulls("passage_id", "word_audio_id") = 1);