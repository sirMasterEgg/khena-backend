import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const finishes = pgTable(
  "finishes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya nama bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("finishes_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Finish = typeof finishes.$inferSelect;
export type NewFinish = typeof finishes.$inferInsert;
