import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { media } from "./media.model";
import { detailProducts } from "./product.model";

export const collections = pgTable(
  "collections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    coverImage: uuid("cover_image").references(() => media.id),
    bannerImage: uuid("banner_image").references(() => media.id),
    status: varchar("status", { length: 15 }).notNull().default("draft"),
    ...auditColumns,
  },
  (table) => [
    // Unik hanya untuk baris aktif, supaya slug bekas baris yang sudah
    // di-soft-delete bisa dipakai lagi.
    uniqueIndex("collections_slug_active_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const productCollections = pgTable("product_collections", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => collections.id),
  detailProductId: uuid("detail_product_id")
    .notNull()
    .references(() => detailProducts.id),
  order: integer("order").notNull(),
  ...auditColumns,
});

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type ProductCollection = typeof productCollections.$inferSelect;
export type NewProductCollection = typeof productCollections.$inferInsert;
