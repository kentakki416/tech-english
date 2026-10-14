CREATE TABLE "audio_synthesis_usages" (
	"id" serial PRIMARY KEY,
	"characters" integer NOT NULL,
	"passage_id" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "audio_synthesis_usages_characters_check" CHECK ("characters" > 0)
);
--> statement-breakpoint
ALTER TABLE "passage_audios" ADD COLUMN "regenerate_requested_at" timestamp(3);--> statement-breakpoint
CREATE INDEX "audio_synthesis_usages_created_at_idx" ON "audio_synthesis_usages" ("created_at");--> statement-breakpoint
ALTER TABLE "audio_synthesis_usages" ADD CONSTRAINT "audio_synthesis_usages_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;