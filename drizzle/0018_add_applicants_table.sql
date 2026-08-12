CREATE TABLE "applicants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"applicant_description" text,
	"jobs_id" uuid,
	"cv" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"object_key" varchar(255) NOT NULL,
	"storage_provider" varchar(50) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_attachments_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_jobs_id_jobs_id_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_cv_external_attachments_id_fk" FOREIGN KEY ("cv") REFERENCES "public"."external_attachments"("id") ON DELETE no action ON UPDATE no action;