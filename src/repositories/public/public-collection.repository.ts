import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { collections, productCollections } from "../../models/collection.model";
import { media } from "../../models/media.model";
import { detailProducts, products } from "../../models/product.model";
import { db } from "../../utils/db";

interface ListPublicCollectionsFilter {
  page: number;
  limit: number;
}

export class PublicCollectionRepository {
  async list(filter: ListPublicCollectionsFilter) {
    const where = and(
      isNull(collections.deletedAt),
      eq(collections.status, "published"),
    );

    const rows = await db
      .select()
      .from(collections)
      .where(where)
      .orderBy(asc(collections.name))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(collections)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /**
   * `totalProducts` (COUNT DISTINCT produk, satu produk dengan beberapa
   * varian di collection yang sama tetap dihitung 1) dan `hasSoldOutProduct`
   * (minimal satu varian dengan stok <= 0) untuk sekumpulan collection
   * sekaligus — satu query GROUP BY, bukan 1+N (issue #98 §9).
   */
  async statsForCollectionIds(
    collectionIds: string[],
  ): Promise<
    Map<string, { totalProducts: number; hasSoldOutProduct: boolean }>
  > {
    if (collectionIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        collectionId: productCollections.collectionId,
        totalProducts: sql<number>`count(distinct ${products.id})`,
        hasSoldOutProduct: sql<boolean>`bool_or(
          coalesce((
            select sum(s.quantity) filter (where s.deleted_at is null)
            from stocks s
            where s.detail_product_id = ${detailProducts.id}
          ), 0) <= 0
        )`,
      })
      .from(productCollections)
      .innerJoin(
        detailProducts,
        eq(productCollections.detailProductId, detailProducts.id),
      )
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .where(
        and(
          inArray(productCollections.collectionId, collectionIds),
          isNull(productCollections.deletedAt),
          isNull(detailProducts.deletedAt),
          eq(detailProducts.visibility, "visible"),
          isNull(products.deletedAt),
          eq(products.status, "published"),
        ),
      )
      .groupBy(productCollections.collectionId);

    return new Map(
      rows.map((r) => [
        r.collectionId,
        {
          totalProducts: Number(r.totalProducts),
          hasSoldOutProduct: Boolean(r.hasSoldOutProduct),
        },
      ]),
    );
  }

  async findMediaObjectKeysByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({ id: media.id, objectKey: media.objectKey })
      .from(media)
      .where(inArray(media.id, ids));
    return new Map(rows.map((r) => [r.id, r.objectKey]));
  }
}
