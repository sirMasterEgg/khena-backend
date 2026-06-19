import {
  bigint,
  date,
  integer,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";

export const discounts = pgTable("discounts", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  code: varchar("code", { length: 50 }).notNull().unique(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  limit: bigint("limit", { mode: "number" }).notNull(),
  status: varchar("status", { length: 15 }).notNull(),
  discountType: varchar("discount_type", { length: 20 }).notNull(),
  discountValue: integer("discount_value").notNull(),
  ...auditColumns,
});

export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;
