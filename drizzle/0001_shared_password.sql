CREATE TABLE "app_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"password_tag" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'admin';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_seen_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_session_user_idx" ON "app_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_failure_ip_at_idx" ON "login_failure" USING btree ("ip","at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_name_uq" ON "user" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "image";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "updated_at";