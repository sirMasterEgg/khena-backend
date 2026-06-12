import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const mediaCategories = pgTable("media_categories", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  ...auditColumns,
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  fileName: varchar("file_name", { length: 255 }).notNull().unique(),
  fileKey: varchar("file_key", { length: 255 }).notNull().unique(),
  fileType: varchar("file_type", { length: 5 }).notNull(),
  mediaCategoryId: uuid("media_category_id").references(() => mediaCategories.id),
  ...auditColumns,
});

export type MediaCategory = typeof mediaCategories.$inferSelect;
export type NewMediaCategory = typeof mediaCategories.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
