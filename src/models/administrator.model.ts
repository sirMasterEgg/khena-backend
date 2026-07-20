import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { roles } from "./role.model";

export const administrators = pgTable("administrators", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  roleId: uuid("role_id").references(() => roles.id),
  ...auditColumns,
});

export type Administrator = typeof administrators.$inferSelect;
export type NewAdministrator = typeof administrators.$inferInsert;
