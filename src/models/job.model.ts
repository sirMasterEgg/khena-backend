import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { departments } from "./department.model";
import { employmentTypes } from "./employment-type.model";

export const jobs = pgTable("jobs", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  jobTitle: varchar("job_title", { length: 255 }).notNull(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id),
  location: varchar("location", { length: 255 }).notNull(),
  employmentTypeId: uuid("employment_type_id")
    .notNull()
    .references(() => employmentTypes.id),
  status: varchar("status", { length: 15 }).notNull(),
  roleDescription: text("role_description").notNull(),
  requirements: text("requirements").notNull(),
  benefits: text("benefits"),
  ...auditColumns,
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
