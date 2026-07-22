import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    code: varchar("code", { length: 50 }).notNull(),
    module: varchar("module", { length: 255 }),
    action: varchar("action", { length: 255 }),
    description: text("description"),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya kode bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("permissions_code_active_unique")
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
