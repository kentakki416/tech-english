CREATE TABLE "auth_accounts" (
	"id" serial PRIMARY KEY,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memos" (
	"id" serial PRIMARY KEY,
	"body" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"avatar_url" text,
	"email" text,
	"name" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key" ON "auth_accounts" ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;