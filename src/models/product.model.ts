import { pgTable, uuid, varchar, text, integer, bigint } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { media } from "./media.model";
import { colors } from "./color.model";

export const products = pgTable("products", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  name: varchar("name", { length: 255 }).notNull(),
  baseSku: varchar("base_sku", { length: 255 }).notNull().unique(),
  description: text("description"),
  materials: text("materials"),
  careInstruction: text("care_instruction"),
  productDimension: text("product_dimension"),
  boxDimension: text("box_dimension"),
  status: varchar("status", { length: 255 }),
  ...auditColumns,
});

export const productMediaShowcase = pgTable("product_media_showcase", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id),
  order: integer("order").notNull(),
  ...auditColumns,
});

export const detailProducts = pgTable("detail_products", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  colorId: uuid("color_id")
    .notNull()
    .references(() => colors.id),
  detailProductSku: varchar("detail_product_sku", { length: 255 })
    .notNull()
    .unique(),
  discountedPrice: bigint("discounted_price", { mode: "number" }).notNull(),
  nonDiscountedPrice: bigint("non_discounted_price", { mode: "number" }).notNull(),
  visibility: varchar("visibility", { length: 15 }).notNull(),
  ...auditColumns,
});

export const detailProductImages = pgTable("detail_product_images", {
  id: uuid("id").primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
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
