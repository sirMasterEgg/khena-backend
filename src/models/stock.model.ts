import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { detailProducts } from "./product.model";

export const stocks = pgTable("stocks", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  detailProductId: uuid("detail_product_id")
    .notNull()
    .references(() => detailProducts.id),
  quantity: integer("quantity").notNull(),
  capitalPrice: bigint("capital_price", { mode: "number" }).notNull(),
  reason: text("reason"),
  isAdjustment: boolean("is_adjustment").notNull(),
  ...auditColumns,
});

export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;
