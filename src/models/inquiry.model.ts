import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { externalAttachments } from "./external-attachment.model";

/**
 * Pesan masuk dari form "Contact Us" di website. Satu baris = satu pesan.
 *
 * Sama seperti `applicants`, tabel ini tidak memakai `auditColumns` karena
 * baris dibuat oleh pengunjung (bukan admin) dan tidak di-soft-delete. Kolom
 * `read_at` / `starred_at` / `replied_at` sengaja bertipe timestamp nullable,
 * bukan boolean: selain status, kita juga dapat *kapan* aksinya dilakukan.
 */
export const inquiries = pgTable("inquiries", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  attachment: uuid("attachment").references(() => externalAttachments.id),
  readAt: timestamp("read_at"),
  starredAt: timestamp("starred_at"),
  repliedAt: timestamp("replied_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Inquiry = typeof inquiries.$inferSelect;
export type NewInquiry = typeof inquiries.$inferInsert;
