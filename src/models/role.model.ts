import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const roles = pgTable("roles", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  ...auditColumns,
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
