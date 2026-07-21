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
import { customers } from "./customer.model";
import { discounts } from "./discount.model";
import { products } from "./product.model";

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    orderDate: date("order_date").notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    shippingAddress: text("shipping_address"),
    shippingCity: varchar("shipping_city", { length: 100 }),
    shippingProvince: varchar("shipping_province", { length: 100 }),
    shippingZipCode: varchar("shipping_zip_code", { length: 20 }),
    shippingAmount: bigint("shipping_amount", { mode: "number" }),
    discountId: uuid("discount_id").references(() => discounts.id),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    cashierName: varchar("cashier_name", { length: 255 }),
    total: bigint("total", { mode: "number" }).notNull(),
    note: text("note"),
    status: varchar("status", { length: 15 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya nomor invoice bekas baris yang
    // sudah di-soft-delete bisa dipakai lagi.
    uniqueIndex("sales_orders_invoice_number_active_unique")
      .on(table.invoiceNumber)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const salesOrderItems = pgTable("sales_order_items", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  salesOrderId: uuid("sales_order_id")
    .notNull()
    .references(() => salesOrders.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  ...auditColumns,
});

export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type NewSalesOrderItem = typeof salesOrderItems.$inferInsert;
