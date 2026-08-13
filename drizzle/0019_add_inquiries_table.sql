CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"attachment" uuid,
	"read_at" timestamp,
	"starred_at" timestamp,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_attachment_external_attachments_id_fk" FOREIGN KEY ("attachment") REFERENCES "public"."external_attachments"("id") ON DELETE no action ON UPDATE no action;