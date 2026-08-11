import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { detailProducts } from "./product.model";

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    customerId: uuid("customer_id").references(() => customers.id),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    orderDate: date("order_date").notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    shippingAddress: text("shipping_address"),
    shippingCity: varchar("shipping_city", { length: 100 }),
    shippingProvince: varchar("shipping_province", { length: 100 }),
    shippingZipCode: varchar("shipping_zip_code", { length: 20 }),
    shippingAmount: bigint("shipping_amount", { mode: "number" }),
    discountId: uuid("discount_id").references(() => discounts.id),
    // Nominal potongan yang dibekukan saat transaksi terjadi. Dipakai
    // GET /discounts/stats untuk menghitung revenue impact tanpa perlu
    // menghitung ulang aturan diskon yang mungkin sudah berubah.
    discountAmount: bigint("discount_amount", { mode: "number" }),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    cashierName: varchar("cashier_name", { length: 255 }),
    total: bigint("total", { mode: "number" }).notNull(),
    note: text("note"),
    status: varchar("status", { length: 15 }).notNull(),
    // Asal transaksi: "pos" (kasir), "order_sales" (input manual sales),
    // "online" (storefront). Default "order_sales" supaya baris lama tetap valid
    // saat kolom ini ditambahkan.
    createdVia: varchar("created_via", { length: 15 })
      .notNull()
      .default("order_sales"),
    // Nama marketplace asal transaksi, mis. "shopee" / "tokopedia".
    // Hanya terisi untuk baris dengan createdVia = "marketplace".
    marketplaceName: varchar("marketplace_name", { length: 50 }),
    // Nama pembeli di marketplace. Bukan customer terdaftar, jadi disimpan
    // sebagai teks lepas dan `customer_id` dibiarkan null.
    buyerName: varchar("buyer_name", { length: 255 }),
    // Jadwal pengiriman yang dijanjikan ke customer. Semuanya opsional —
    // order lama (dan order yang belum dijadwalkan) bernilai null.
    deliveryDate: date("delivery_date"),
    /** "morning" | "afternoon" | "evening". Divalidasi di controller, bukan di DB. */
    deliveryTimeSlot: varchar("delivery_time_slot", { length: 20 }),
    deliveryNotes: text("delivery_notes"),
    /** Nomor resi kurir. Wajib diisi saat status berpindah ke "shipped". */
    trackingNumber: varchar("tracking_number", { length: 100 }),
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
  detailProductId: uuid("detail_product_id")
    .notNull()
    .references(() => detailProducts.id),
  quantity: integer("quantity").notNull(),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  /**
   * Penanda item sudah disiapkan/dipacking oleh gudang.
   * NULLABLE dan TANPA default — tiga nilai punya arti berbeda:
   *   null  = tidak relevan (item transaksi POS; kasir tidak melakukan packing)
   *   false = order sales, belum dipacking
   *   true  = order sales, sudah dipacking
   * Karena tidak ada default, item POS otomatis bernilai null tanpa perlu
   * diisi eksplisit; Order Sales yang wajib mengisi `false` saat create.
   */
  isPacked: boolean("is_packed"),
  ...auditColumns,
});

export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type NewSalesOrderItem = typeof salesOrderItems.$inferInsert;
