CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "employment_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_title" varchar(255) NOT NULL,
	"department_id" uuid NOT NULL,
	"location" varchar(255) NOT NULL,
	"employment_type_id" uuid NOT NULL,
	"status" varchar(15) NOT NULL,
	"role_description" text NOT NULL,
	"requirements" text NOT NULL,
	"benefits" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employment_type_id_employment_types_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "public"."employment_types"("id") ON DELETE no action ON UPDATE no action;