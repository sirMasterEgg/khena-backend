import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { administrators } from "./administrator.model";
import { auditColumns } from "./audit-columns";

export const administratorSessions = pgTable("administrator_sessions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  administratorId: uuid("administrator_id")
    .notNull()
    .references(() => administrators.id),
  tokenHash: text("token_hash").notNull().unique(),
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
});

export type AdministratorSession = typeof administratorSessions.$inferSelect;
export type NewAdministratorSession = typeof administratorSessions.$inferInsert;
