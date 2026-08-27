import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { externalAttachments } from "./external-attachment.model";
import { jobs } from "./job.model";

/**
 * Pelamar kerja. Satu baris = satu lamaran ke satu lowongan.
 *
 * Sama seperti `external_attachments`, tabel ini tidak memakai `auditColumns`
 * karena baris dibuat oleh pelamar (bukan admin) dan tidak pernah di-update.
 */
export const applicants = pgTable("applicants", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  // Putaran B (lihat issue #98 §5.3): backfill sudah selesai
  // (scripts/backfill-applicant-phone.ts), semua baris lama sudah punya phone.
  phone: varchar("phone", { length: 20 }).notNull(),
  applicantDescription: text("applicant_description"),
  jobsId: uuid("jobs_id").references(() => jobs.id),
  cv: uuid("cv").references(() => externalAttachments.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Applicant = typeof applicants.$inferSelect;
export type NewApplicant = typeof applicants.$inferInsert;
