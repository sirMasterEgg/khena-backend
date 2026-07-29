import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    // Kolom cache, diisi hanya saat sebuah order bertransisi ke status
    // "completed" (lihat CustomerService.recordCompletedOrder). Tidak ada
    // proses recalculate/backfill.
    totalOrder: integer("total_order").notNull().default(0),
    lifetimeValue: bigint("lifetime_value", { mode: "number" })
      .notNull()
      .default(0),
    lastOrderAt: timestamp("last_order_at"),
    joinedAt: timestamp("joined_at").notNull(),
    internalNotes: text("internal_notes"),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya email/phone bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("customers_email_active_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("customers_phone_active_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
