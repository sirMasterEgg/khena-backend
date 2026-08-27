import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const roomTypes = pgTable(
  "room_types",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    roomType: varchar("room_type", { length: 255 }).notNull(),
    // Putaran B (lihat issue #98 §4.3): backfill sudah selesai
    // (scripts/backfill-slug.ts), semua baris lama sudah punya slug.
    slug: varchar("slug", { length: 255 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("room_types_slug_active_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type RoomType = typeof roomTypes.$inferSelect;
export type NewRoomType = typeof roomTypes.$inferInsert;
