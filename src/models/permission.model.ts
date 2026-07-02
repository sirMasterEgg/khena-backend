import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

export const permissions = pgTable("permissions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  code: varchar("code", { length: 50 }).notNull().unique(),
  module: varchar("module", { length: 255 }),
  action: varchar("action", { length: 255 }),
  description: text("description"),
});

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
