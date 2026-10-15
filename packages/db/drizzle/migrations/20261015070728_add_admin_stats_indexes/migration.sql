CREATE INDEX "reading_attempts_submitted_at_idx" ON "reading_attempts" ("submitted_at") WHERE "status" = 'submitted';--> statement-breakpoint
CREATE INDEX "reading_attempts_passage_id_submitted_at_idx" ON "reading_attempts" ("passage_id","submitted_at") WHERE "status" = 'submitted';--> statement-breakpoint
CREATE INDEX "vocabulary_reviews_created_at_idx" ON "vocabulary_reviews" ("created_at");