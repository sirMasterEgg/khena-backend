import { and, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import { productCollections } from "../../models/collection.model";
import { type Discount, discounts } from "../../models/discount.model";
import { detailProducts, products } from "../../models/product.model";
import { salesOrders } from "../../models/sales-order.model";
import { db, type Tx } from "../../utils/db";

export interface CartVariantRow {
  detailProductId: string;
  sku: string;
  price: number;
  capitalPrice: number;
  productId: string;
  categoryId: string;
  productName: string;
  boxWeightKg: number | null;
  productWeightKg: number | null;
}

export class PromoRepository {
  /** Varian aktif by SKU untuk cart checkout/promo validate. Guard array kosong. */
  async findVariantsBySkus(skus: string[]): Promise<CartVariantRow[]> {
    if (skus.length === 0) {
      return [];
    }
    return await db
      .select({
        detailProductId: detailProducts.id,
        sku: detailProducts.detailProductSku,
        price: detailProducts.price,
        capitalPrice: detailProducts.capitalPrice,
        productId: products.id,
        categoryId: products.categoryId,
        productName: products.name,
        boxWeightKg: products.boxDimensionWeight,
        productWeightKg: products.productDimensionWeight,
      })
      .from(detailProducts)
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .where(
        and(
          inArray(detailProducts.detailProductSku, skus),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
        ),
      );
  }

  /**
   * Map productId → daftar collectionId yang memuatnya. `product_collections`
   * disimpan per varian (`detail_product_id`), jadi harus lewat join ke
   * `detail_products` dulu untuk sampai ke `product_id`.
   */
  async findCollectionIdsByProductIds(
    productIds: string[],
  ): Promise<Map<string, string[]>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        productId: detailProducts.productId,
        collectionId: productCollections.collectionId,
      })
      .from(productCollections)
      .innerJoin(
        detailProducts,
        eq(productCollections.detailProductId, detailProducts.id),
      )
      .where(
        and(
          inArray(detailProducts.productId, productIds),
          isNull(productCollections.deletedAt),
        ),
      );

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row.collectionId);
      map.set(row.productId, list);
    }
    return map;
  }

  /**
   * Kondisi sama dengan DiscountRepository.findByCode. `.for("update")` saat
   * dipanggil dengan `tx` — mengunci baris diskon supaya dua checkout paralel
   * tidak lolos usage limit yang sama (lihat PromoService.evaluate).
   */
  async findActiveDiscountByCode(
    code: string,
    tx?: Tx,
  ): Promise<Discount | undefined> {
    const where = and(eq(discounts.code, code), isNull(discounts.deletedAt));
    if (tx) {
      const result = await tx
        .select()
        .from(discounts)
        .where(where)
        .limit(1)
        .for("update");
      return result[0];
    }
    const result = await db.select().from(discounts).where(where).limit(1);
    return result[0];
  }

  /**
   * Sama seperti DiscountRepository.countUsage, tapi order berstatus
   * "cancelled" tidak dihitung (asumsi A5 issue #104). Dibuat method
   * terpisah, bukan mengubah countUsage — itu dipakai endpoint admin dan
   * perubahan perilakunya butuh konfirmasi owner dulu.
   */
  async countActiveUsage(discountId: string, tx?: Tx): Promise<number> {
    const result = await (tx ?? db)
      .select({ count: sql<number>`count(*)` })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.discountId, discountId),
          isNull(salesOrders.deletedAt),
          ne(salesOrders.status, "cancelled"),
        ) as SQL,
      );
    return Number(result[0]?.count ?? 0);
  }
}
