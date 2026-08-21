import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { detailProducts, products } from "../../models/product.model";
import {
  type NewWishlist,
  type Wishlist,
  wishlists,
} from "../../models/wishlist.model";
import { db } from "../../utils/db";
import {
  firstImageObjectKeyExpr,
  firstVariantIdSubquery,
  firstVariantStockExpr,
} from "./first-variant.query";
import type { ProductSummaryQueryRow } from "./public-product.repository";

export interface WishlistItemQueryRow extends ProductSummaryQueryRow {
  wishlistId: string;
}

export class PublicWishlistRepository {
  /** `:sku` di endpoint wishlist selalu products.base_sku (SKU produk, bukan varian). */
  async findPublishedProductByBaseSku(sku: string) {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.baseSku, sku),
          isNull(products.deletedAt),
          eq(products.status, "published"),
        ),
      )
      .limit(1);
    return result[0];
  }

  /** Dipakai DELETE — tidak mensyaratkan produk masih published/aktif. */
  async findProductIdByBaseSku(sku: string): Promise<string | undefined> {
    const result = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.baseSku, sku))
      .limit(1);
    return result[0]?.id;
  }

  async findByUserAndProductId(
    userId: string,
    productId: string,
  ): Promise<Wishlist | undefined> {
    const result = await db
      .select()
      .from(wishlists)
      .where(
        and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)),
      )
      .limit(1);
    return result[0];
  }

  async create(data: NewWishlist): Promise<Wishlist> {
    const result = await db.insert(wishlists).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create wishlist");
    }
    return row;
  }

  /** Hard delete — true kalau ada baris yang terhapus. */
  async deleteByUserAndProductId(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(wishlists)
      .where(
        and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)),
      )
      .returning({ id: wishlists.id });
    return result.length > 0;
  }

  /** Ringkasan varian pertama satu produk (dipakai response POST /wishlists). */
  async findProductSummaryById(
    productId: string,
  ): Promise<ProductSummaryQueryRow | undefined> {
    const result = await db
      .select({
        id: products.id,
        name: products.name,
        baseSku: products.baseSku,
        price: detailProducts.price,
        discountPercent: detailProducts.discountPercent,
        imageObjectKey: firstImageObjectKeyExpr(detailProducts),
        stock: firstVariantStockExpr(detailProducts),
      })
      .from(products)
      .leftJoin(
        detailProducts,
        eq(detailProducts.id, firstVariantIdSubquery(products)),
      )
      .where(eq(products.id, productId))
      .limit(1);
    return result[0];
  }

  /**
   * List wishlist milik user, dilewati (bukan dihapus) kalau produknya sudah
   * tidak published/aktif — `meta.total` ikut memakai filter yang sama
   * (issue #98 §10.3).
   */
  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: WishlistItemQueryRow[]; total: number }> {
    const where = and(
      eq(wishlists.userId, userId),
      isNull(products.deletedAt),
      eq(products.status, "published"),
    );

    const rows = await db
      .select({
        wishlistId: wishlists.id,
        id: products.id,
        name: products.name,
        baseSku: products.baseSku,
        price: detailProducts.price,
        discountPercent: detailProducts.discountPercent,
        imageObjectKey: firstImageObjectKeyExpr(detailProducts),
        stock: firstVariantStockExpr(detailProducts),
      })
      .from(wishlists)
      .innerJoin(products, eq(wishlists.productId, products.id))
      .leftJoin(
        detailProducts,
        eq(detailProducts.id, firstVariantIdSubquery(products)),
      )
      .where(where)
      .orderBy(desc(wishlists.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(wishlists)
      .innerJoin(products, eq(wishlists.productId, products.id))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }
}
