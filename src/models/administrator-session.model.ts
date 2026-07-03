import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { administrators } from "./administrator.model";

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdministratorSession = typeof administratorSessions.$inferSelect;
export type NewAdministratorSession = typeof administratorSessions.$inferInsert;
