import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { administrators } from "./administrator.model";
import { auditColumns } from "./audit-columns";

export const administratorSessions = pgTable(
  "administrator_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    administratorId: uuid("administrator_id")
      .notNull()
      .references(() => administrators.id),
    tokenHash: text("token_hash").notNull(),
    deviceInfo: text("device_info"),
    expiredAt: timestamp("expired_at").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    // Sengaja TIDAK pakai `...auditColumns` penuh: sesi tidak pernah di-soft
    // delete, hanya di-revoke, jadi deleted_at/deleted_by dipastikan selalu NULL.
    // Tabel ini volumenya tinggi & berumur pendek — kolom mati tidak dibawa.
    createdAt: auditColumns.createdAt,
    updatedAt: auditColumns.updatedAt,
    createdBy: auditColumns.createdBy,
    updatedBy: auditColumns.updatedBy,
  },
  (table) => [
    // Tabel ini tidak punya kolom deleted_at (lihat catatan di atas), jadi
    // tidak ada baris "terhapus" yang perlu dikecualikan — index-nya unik
    // penuh. Namanya tetap mengikuti konvensi tabel lain demi konsistensi.
    uniqueIndex("administrator_sessions_token_hash_active_unique").on(
      table.tokenHash,
    ),
  ],
);

export type AdministratorSession = typeof administratorSessions.$inferSelect;
export type NewAdministratorSession = typeof administratorSessions.$inferInsert;
