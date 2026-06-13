import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const finishes = pgTable("finishes", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  ...auditColumns,
});

export type Finish = typeof finishes.$inferSelect;
export type NewFinish = typeof finishes.$inferInsert;
