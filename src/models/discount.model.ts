import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    code: varchar("code", { length: 50 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    limit: bigint("limit", { mode: "number" }).notNull(),
    status: varchar("status", { length: 15 }).notNull(),
    discountType: varchar("discount_type", { length: 20 }).notNull(),
    discountValue: integer("discount_value").notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya kode bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("discounts_code_active_unique")
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;
