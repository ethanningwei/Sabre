ALTER TABLE "absence" ADD COLUMN "duty_id" uuid;--> statement-breakpoint
ALTER TABLE "camp" ADD COLUMN "post" text;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_duty_id_duty_id_fk" FOREIGN KEY ("duty_id") REFERENCES "public"."duty"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- teams of one physical camp ("SFT A", "SFT B") share a post ("SFT")
UPDATE "camp" c SET "post" = regexp_replace(c."name", '\s+[A-Z]$', '')
WHERE c."name" ~ '\s+[A-Z]$'
  AND (SELECT count(*) FROM "camp" o
       WHERE o."coy_id" = c."coy_id"
         AND regexp_replace(o."name", '\s+[A-Z]$', '') = regexp_replace(c."name", '\s+[A-Z]$', '')) > 1;
