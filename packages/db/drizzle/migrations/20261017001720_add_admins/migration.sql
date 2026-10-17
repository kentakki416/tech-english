CREATE TABLE "admins" (
	"id" serial PRIMARY KEY,
	"avatar_url" text,
	"email" text NOT NULL,
	"last_signed_in_at" timestamp(3),
	"name" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL,
	CONSTRAINT "admins_email_check" CHECK ("email" = lower(btrim("email")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_key" ON "admins" ("email");