import { pgTable, uuid, varchar, text } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { media } from "./media.model";
import { finishes } from "./finish.model";

export const colors = pgTable("colors", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  hexCode: varchar("hex_code", { length: 6 }).notNull(),
  swatchPhoto: uuid("swatch_photo").references(() => media.id),
  notes: text("notes"),
  finishesId: uuid("finishes_id").references(() => finishes.id),
  ...auditColumns,
});

export type Color = typeof colors.$inferSelect;
export type NewColor = typeof colors.$inferInsert;
