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
import { auth_users } from "./auth-schema";

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
    // Tautan opsional ke akun website (better-auth). Nullable karena mayoritas
    // customer datang dari channel non-website (WA, telepon, POS) dan tidak
    // punya akun. Kolom internal — tidak pernah diekspos di response manapun.
    // Bertipe text mengikuti auth_users.id yang di-generate better-auth.
    userId: text("user_id").references(() => auth_users.id),
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
    // Satu akun website tertaut ke paling banyak satu customer aktif. Ini
    // pengaman terakhir kalau dua checkout paralel sama-sama mencoba menaut.
    uniqueIndex("customers_user_id_active_unique")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.userId} IS NOT NULL`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
