import {
  bigint,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { folders } from "./folder.model";

export const mediaCategories = pgTable("media_categories", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  ...auditColumns,
});

export const media = pgTable("media", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  folderId: uuid("folder_id").references(() => folders.id),
  name: varchar("name", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }),
  type: varchar("type", { length: 20 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  extension: varchar("extension", { length: 10 }),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  storageProvider: varchar("storage_provider", { length: 10 }).notNull(),
  bucket: varchar("bucket", { length: 100 }).notNull(),
  objectKey: text("object_key").notNull(),
  width: integer("width"),
  height: integer("height"),
  duration: numeric("duration"),
  thumbnailKey: text("thumbnail_key"),
  altText: text("alt_text"),
  metadata: text("metadata"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  mediaCategoryId: uuid("media_category_id").references(
    () => mediaCategories.id,
  ),
  ...auditColumns,
});

export type MediaCategory = typeof mediaCategories.$inferSelect;
export type NewMediaCategory = typeof mediaCategories.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
