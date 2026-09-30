CREATE TYPE "public"."absence_type" AS ENUM('HL', 'MC', 'OL', 'AL', 'OFF', 'MA', 'OTHERS');--> statement-breakpoint
CREATE TYPE "public"."duty_type" AS ENUM('EXTRA', 'RF', 'SOL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('pending', 'guardcomm', 'admin');--> statement-breakpoint
CREATE TABLE "absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "absence_type" NOT NULL,
	"other_reason" text DEFAULT '' NOT NULL,
	"start_date" date,
	"start_time" text,
	"end_date" date,
	"end_time" text,
	"ma_timing" text DEFAULT '' NOT NULL,
	"ma_location" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"closed_at" timestamp,
	"closed_by" text
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "camp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coy_id" uuid NOT NULL,
	"subunit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"on_shift" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"telegram_chat_id" text,
	"telegram_thread_id" text,
	CONSTRAINT "coy_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "duty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coy_id" uuid NOT NULL,
	"type" "duty_type" NOT NULL,
	"rank" text NOT NULL,
	"name" text NOT NULL,
	"person_id" uuid,
	"camp_id" uuid NOT NULL,
	"start_date" date,
	"start_time" text,
	"end_date" date,
	"end_time" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"closed_at" timestamp,
	"closed_by" text
);
--> statement-breakpoint
CREATE TABLE "parade_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coy_id" uuid NOT NULL,
	"caa_date" date NOT NULL,
	"caa_time" text NOT NULL,
	"text" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" text,
	"sent_at" timestamp,
	"sent_by" text,
	"telegram_message_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"camp_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subunit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_hq" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" "user_role" DEFAULT 'pending' NOT NULL,
	"subunit_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp" ADD CONSTRAINT "camp_coy_id_coy_id_fk" FOREIGN KEY ("coy_id") REFERENCES "public"."coy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camp" ADD CONSTRAINT "camp_subunit_id_subunit_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_coy_id_coy_id_fk" FOREIGN KEY ("coy_id") REFERENCES "public"."coy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_camp_id_camp_id_fk" FOREIGN KEY ("camp_id") REFERENCES "public"."camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty" ADD CONSTRAINT "duty_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parade_state" ADD CONSTRAINT "parade_state_coy_id_coy_id_fk" FOREIGN KEY ("coy_id") REFERENCES "public"."coy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parade_state" ADD CONSTRAINT "parade_state_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parade_state" ADD CONSTRAINT "parade_state_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_camp_id_camp_id_fk" FOREIGN KEY ("camp_id") REFERENCES "public"."camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subunit" ADD CONSTRAINT "subunit_coy_id_coy_id_fk" FOREIGN KEY ("coy_id") REFERENCES "public"."coy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_subunit_id_subunit_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "absence_one_open_uq" ON "absence" USING btree ("person_id") WHERE "absence"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "absence_person_idx" ON "absence" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "camp_coy_name_uq" ON "camp" USING btree ("coy_id","name");--> statement-breakpoint
CREATE INDEX "duty_camp_idx" ON "duty" USING btree ("camp_id");--> statement-breakpoint
CREATE INDEX "parade_state_coy_generated_idx" ON "parade_state" USING btree ("coy_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_camp_name_uq" ON "person" USING btree ("camp_id","name") WHERE "person"."active";--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subunit_coy_name_uq" ON "subunit" USING btree ("coy_id","name");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");