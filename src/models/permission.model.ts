import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const permissions = pgTable("permissions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  code: varchar("code", { length: 50 }).notNull().unique(),
  module: varchar("module", { length: 255 }),
  action: varchar("action", { length: 255 }),
  description: text("description"),
  ...auditColumns,
});

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
