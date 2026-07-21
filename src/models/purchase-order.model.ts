import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { products } from "./product.model";
import { suppliers } from "./supplier.model";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    note: text("note"),
    status: varchar("status", { length: 15 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya nomor invoice bekas baris yang
    // sudah di-soft-delete bisa dipakai lagi.
    uniqueIndex("purchase_orders_invoice_number_active_unique")
      .on(table.invoiceNumber)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  ...auditColumns,
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;
