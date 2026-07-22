import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya nama bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("roles_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
