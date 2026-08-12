import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const departments = pgTable("departments", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  ...auditColumns,
});

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
