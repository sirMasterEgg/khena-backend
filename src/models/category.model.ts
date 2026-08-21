import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { roomTypes } from "./room-type.model";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    category: varchar("category", { length: 255 }).notNull(),
    order: integer("order").notNull(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    status: varchar("status", { length: 15 }).notNull(),
    // Putaran B (lihat issue #98 §4.3): backfill sudah selesai
    // (scripts/backfill-slug.ts), semua baris lama sudah punya slug.
    slug: varchar("slug", { length: 255 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya slug bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi (pola sama dengan collections.slug).
    uniqueIndex("categories_slug_active_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
