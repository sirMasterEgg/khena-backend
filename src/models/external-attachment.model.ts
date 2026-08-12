import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Pointer ke satu objek di object storage (S3/R2/MinIO), untuk file yang
 * bukan aset katalog — mis. CV pelamar kerja. Sengaja dipisah dari tabel
 * `media` yang khusus aset produk.
 *
 * Tidak memakai `auditColumns`: baris di sini tidak pernah di-update dan
 * tidak di-soft-delete, hanya dibuat sekali saat file di-upload.
 */
export const externalAttachments = pgTable("external_attachments", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  objectKey: varchar("object_key", { length: 255 }).notNull().unique(),
  storageProvider: varchar("storage_provider", { length: 50 }).notNull(),
  bucket: varchar("bucket", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExternalAttachment = typeof externalAttachments.$inferSelect;
export type NewExternalAttachment = typeof externalAttachments.$inferInsert;
