import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const employmentTypes = pgTable("employment_types", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  ...auditColumns,
});

export type EmploymentType = typeof employmentTypes.$inferSelect;
export type NewEmploymentType = typeof employmentTypes.$inferInsert;
