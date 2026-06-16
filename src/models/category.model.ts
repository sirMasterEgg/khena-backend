import { integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { roomTypes } from "./room-type.model";

export const categories = pgTable("categories", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  category: varchar("category", { length: 255 }).notNull(),
  order: integer("order").notNull(),
  roomTypeId: uuid("room_type_id")
    .notNull()
    .references(() => roomTypes.id),
  status: varchar("status", { length: 15 }).notNull(),
  ...auditColumns,
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
