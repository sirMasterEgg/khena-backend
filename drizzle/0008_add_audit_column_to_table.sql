ALTER TABLE "role_permissions" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "updated_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "administrator_sessions" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "administrator_sessions" ADD COLUMN "created_by" varchar(255);--> statement-breakpoint
ALTER TABLE "administrator_sessions" ADD COLUMN "updated_by" varchar(255);--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "created_by" varchar(255);--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "updated_by" varchar(255);--> statement-breakpoint
ALTER TABLE "administrators" ADD COLUMN "deleted_by" varchar(255);--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "created_by" varchar(255);--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "updated_by" varchar(255);--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "deleted_by" varchar(255);--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "deleted_by" varchar(255);