import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { roles } from "./role.model";

export const administrators = pgTable(
  "administrators",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    password: text("password").notNull(),
    roleId: uuid("role_id").references(() => roles.id),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya email bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("administrators_email_active_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Administrator = typeof administrators.$inferSelect;
export type NewAdministrator = typeof administrators.$inferInsert;
