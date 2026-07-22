import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { categories } from "./category.model";
import { colors } from "./color.model";
import { media } from "./media.model";

export const products = pgTable(
  "products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    baseSku: varchar("base_sku", { length: 255 }).notNull(),
    description: text("description"),
    materials: text("materials"),
    productDimensionMediaId: uuid("product_dimension_media_id").references(
      () => media.id,
    ),
    boxDimensionMediaId: uuid("box_dimension_media_id").references(
      () => media.id,
    ),
    productDimensionWidth: integer("product_dimension_width"),
    productDimensionDepth: integer("product_dimension_depth"),
    productDimensionHeight: integer("product_dimension_height"),
    productDimensionWeight: integer("product_dimension_weight"),
    boxDimensionWidth: integer("box_dimension_width"),
    boxDimensionDepth: integer("box_dimension_depth"),
    boxDimensionHeight: integer("box_dimension_height"),
    boxDimensionWeight: integer("box_dimension_weight"),
    minStockAlert: integer("min_stock_alert"),
    status: varchar("status", { length: 255 }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya SKU bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("products_base_sku_active_unique")
      .on(table.baseSku)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const productMediaShowcase = pgTable("product_media_showcase", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id),
  order: integer("order").notNull(),
  ...auditColumns,
});

export const detailProducts = pgTable(
  "detail_products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    colorId: uuid("color_id")
      .notNull()
      .references(() => colors.id),
    detailProductSku: varchar("detail_product_sku", { length: 255 }).notNull(),
    price: bigint("price", { mode: "number" }).notNull(),
    discountPercent: integer("discount_percent"),
    capitalPrice: bigint("capital_price", { mode: "number" }).notNull(),
    marketplacePrice: bigint("marketplace_price", { mode: "number" }).notNull(),
    visibility: varchar("visibility", { length: 15 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya SKU bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("detail_products_detail_product_sku_active_unique")
      .on(table.detailProductSku)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const detailProductImages = pgTable("detail_product_images", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  detailProductId: uuid("detail_product_id")
    .notNull()
    .references(() => detailProducts.id),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id),
  order: integer("order").notNull(),
  ...auditColumns,
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductMediaShowcase = typeof productMediaShowcase.$inferSelect;
export type NewProductMediaShowcase = typeof productMediaShowcase.$inferInsert;

export type DetailProduct = typeof detailProducts.$inferSelect;
export type NewDetailProduct = typeof detailProducts.$inferInsert;

export type DetailProductImage = typeof detailProductImages.$inferSelect;
export type NewDetailProductImage = typeof detailProductImages.$inferInsert;
