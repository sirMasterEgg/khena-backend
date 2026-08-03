import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
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
    // timestamp (bukan date) supaya diskon bisa mulai/berakhir di jam tertentu.
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    // null = tanpa batas pemakaian.
    usageLimit: bigint("usage_limit", { mode: "number" }),
    // Toggle manual admin. scheduled/expired dihitung dari tanggal, tidak disimpan.
    status: varchar("status", { length: 15 }).notNull(),
    discountType: varchar("discount_type", { length: 20 }).notNull(),
    discountValue: integer("discount_value").notNull(),
    // Sasaran diskon, relasi polymorphic. appliesToType menentukan tabel mana
    // yang ditunjuk appliesToId — lihat DISCOUNT_TARGETS di
    // services/discount.service.ts. Empat nilai scope (all_products,
    // vip_customer, newsletter_subscribers, orders_over_10_million) tidak
    // menunjuk baris mana pun, jadi appliesToId-nya null.
    appliesToType: varchar("applies_to_type", { length: 30 }).notNull(),
    // TIDAK memakai .references(): tujuannya berpindah tabel tergantung
    // appliesToType, dan Postgres tidak mendukung FK polymorphic. Integritasnya
    // dijaga di DiscountService.resolveTarget().
    appliesToId: uuid("applies_to_id"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("discounts_code_active_unique")
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    // Tanpa FK, Postgres tidak membuat index otomatis untuk pasangan kolom ini.
    index("discounts_applies_to_idx").on(
      table.appliesToType,
      table.appliesToId,
    ),
  ],
);

export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;
