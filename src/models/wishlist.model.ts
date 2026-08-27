import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { auth_users } from "./auth-schema";
import { products } from "./product.model";

/**
 * Wishlist milik user website (better-auth), bukan admin. Tanpa `auditColumns`
 * dan tanpa soft delete — barisnya dibuat oleh user lewat storefront, dan
 * DELETE-nya benar-benar menghapus baris (hard delete), konsisten dengan
 * `inquiries`/`applicants` yang juga tidak memakai audit columns.
 */
export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    // text, bukan uuid: better-auth mendefinisikan auth_users.id sebagai text
    // dan Postgres tidak mengizinkan FK antar tipe berbeda. Isinya tetap UUIDv7.
    userId: text("user_id")
      .notNull()
      .references(() => auth_users.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Satu user tidak boleh menyimpan produk yang sama dua kali.
    uniqueIndex("wishlists_user_product_unique").on(
      table.userId,
      table.productId,
    ),
  ],
);

export type Wishlist = typeof wishlists.$inferSelect;
export type NewWishlist = typeof wishlists.$inferInsert;
