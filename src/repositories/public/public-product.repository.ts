import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  careInstructions,
  productCareInstructions,
} from "../../models/care-instruction.model";
import { categories } from "../../models/category.model";
import { collections, productCollections } from "../../models/collection.model";
import { colors } from "../../models/color.model";
import { media } from "../../models/media.model";
import {
  detailProductImages,
  detailProducts,
  productMediaShowcase,
  products,
} from "../../models/product.model";
import { stocks } from "../../models/stock.model";
import { db } from "../../utils/db";
import {
  firstImageObjectKeyExpr,
  firstVariantIdSubquery,
  firstVariantStockExpr,
  hasVisibleVariantCondition,
  sqlTuple,
} from "./first-variant.query";

export interface PublicProductListFilter {
  search?: string;
  categorySlug?: string;
  collectionSlug?: string;
  sort: "name" | "price";
  orderDir: "asc" | "desc";
  page: number;
  limit: number;
}

/** Bentuk baris "ringkasan produk" (varian pertama), dipakai list & related. */
export interface ProductSummaryQueryRow {
  id: string;
  name: string;
  baseSku: string;
  price: number | null;
  discountPercent: number | null;
  imageObjectKey: string | null;
  // SUM() atas kolom integer dikembalikan Postgres sebagai bigint, dan driver
  // `pg` mem-parse bigint sebagai string — dikoreksi jadi number di
  // toProductSummary() (services/public/product-summary.mapper.ts).
  stock: number | string | null;
}

// Ekspresi harga setelah diskon, dipakai untuk sort=price (§8.1) — angka
// yang sama yang dilihat user di kartu produk.
const priceAfterDiscountExpr = sql<number>`round(${detailProducts.price} * (100 - coalesce(${detailProducts.discountPercent}, 0)) / 100.0)`;

function collectionExistsCondition(slug: string): SQL {
  return sql`exists (
    select 1 from product_collections pc
    inner join detail_products dp2 on dp2.id = pc.detail_product_id
    inner join collections col on col.id = pc.collection_id
    where dp2.product_id = ${products.id}
      and dp2.deleted_at is null
      and dp2.visibility = 'visible'
      and pc.deleted_at is null
      and col.deleted_at is null
      and col.status = 'published'
      and col.slug = ${slug}
  )`;
}

function summaryColumns() {
  return {
    id: products.id,
    name: products.name,
    baseSku: products.baseSku,
    price: detailProducts.price,
    discountPercent: detailProducts.discountPercent,
    imageObjectKey: firstImageObjectKeyExpr(detailProducts),
    stock: firstVariantStockExpr(detailProducts),
  };
}

export class PublicProductRepository {
  // ---- list ----

  async list(
    filter: PublicProductListFilter,
  ): Promise<{ rows: ProductSummaryQueryRow[]; total: number }> {
    const conditions: SQL[] = [
      isNull(products.deletedAt),
      eq(products.status, "published"),
      hasVisibleVariantCondition(products),
    ];
    if (filter.search) {
      conditions.push(ilike(products.name, `%${filter.search}%`));
    }
    if (filter.categorySlug) {
      conditions.push(eq(categories.slug, filter.categorySlug));
    }
    if (filter.collectionSlug) {
      conditions.push(collectionExistsCondition(filter.collectionSlug));
    }
    const where = and(...conditions);

    const orderExpr =
      filter.sort === "price" ? priceAfterDiscountExpr : products.name;
    const orderBy =
      filter.orderDir === "asc" ? asc(orderExpr) : desc(orderExpr);

    const rows = await db
      .select(summaryColumns())
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        detailProducts,
        eq(detailProducts.id, firstVariantIdSubquery(products)),
      )
      .where(where)
      .orderBy(orderBy, asc(products.id))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    // Query count TIDAK ikut join detailProducts — kondisi filter (search,
    // category, collection, hasVariant) semuanya sudah tidak bergantung pada
    // join itu, jadi cukup join categories untuk filter slug.
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  // ---- detail ----

  /**
   * `:sku` di endpoint produk publik selalu products.base_sku (SKU produk),
   * bukan detail_products.detail_product_sku (SKU varian) — aturan yang sama
   * dipakai endpoint wishlist, lihat public-wishlist.repository.ts.
   *
   * Kondisi `deletedAt is null` wajib ikut: unique index base_sku hanya
   * berlaku untuk baris aktif, jadi SKU bekas baris ter-soft-delete boleh
   * dipakai ulang dan tanpa filter itu hasilnya bisa lebih dari satu baris.
   */
  async findPublishedByBaseSku(sku: string) {
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

  /** Lookup by uuid produk — dipakai `GET /api/products/id/:id`, di luar alur SKU utama. */
  async findPublishedById(id: string) {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, id),
          isNull(products.deletedAt),
          eq(products.status, "published"),
        ),
      )
      .limit(1);
    return result[0];
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

  async findCareInstructionTextsByProductId(
    productId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ instruction: careInstructions.instruction })
      .from(productCareInstructions)
      .innerJoin(
        careInstructions,
        eq(productCareInstructions.careInstructionId, careInstructions.id),
      )
      .where(
        and(
          eq(productCareInstructions.productId, productId),
          isNull(productCareInstructions.deletedAt),
        ),
      );
    return rows.map((r) => r.instruction);
  }

  async findShowcaseObjectKeysByProductId(
    productId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ objectKey: media.objectKey })
      .from(productMediaShowcase)
      .innerJoin(media, eq(productMediaShowcase.mediaId, media.id))
      .where(
        and(
          eq(productMediaShowcase.productId, productId),
          isNull(productMediaShowcase.deletedAt),
        ),
      )
      .orderBy(asc(productMediaShowcase.order));
    return rows.map((r) => r.objectKey);
  }

  /** Semua varian visible, urutan sama dengan "varian pertama" (§2, §8.2). */
  async findVariantsByProductId(productId: string) {
    return await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        price: detailProducts.price,
        discountPercent: detailProducts.discountPercent,
        colorId: colors.id,
        colorName: colors.name,
        colorHexCode: colors.hexCode,
        colorSwatchObjectKey: media.objectKey,
      })
      .from(detailProducts)
      .leftJoin(colors, eq(detailProducts.colorId, colors.id))
      .leftJoin(media, eq(colors.swatchPhoto, media.id))
      .where(
        and(
          eq(detailProducts.productId, productId),
          isNull(detailProducts.deletedAt),
          eq(detailProducts.visibility, "visible"),
        ),
      )
      .orderBy(asc(detailProducts.createdAt), asc(detailProducts.id));
  }

  /** Seluruh gambar tiap varian (urutan `order`), dikelompokkan per detail_product_id. */
  async findImageObjectKeysByDetailProductIds(
    detailProductIds: string[],
  ): Promise<Map<string, string[]>> {
    if (detailProductIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        detailProductId: detailProductImages.detailProductId,
        objectKey: media.objectKey,
      })
      .from(detailProductImages)
      .innerJoin(media, eq(detailProductImages.mediaId, media.id))
      .where(
        and(
          inArray(detailProductImages.detailProductId, detailProductIds),
          isNull(detailProductImages.deletedAt),
        ),
      )
      .orderBy(asc(detailProductImages.order));

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const objectKeys = map.get(row.detailProductId) ?? [];
      objectKeys.push(row.objectKey);
      map.set(row.detailProductId, objectKeys);
    }
    return map;
  }

  /** Stok semua varian sekaligus (satu query agregat, bukan per varian). */
  async findStockTotalsByDetailProductIds(
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        detailProductId: stocks.detailProductId,
        qty: sql<number>`coalesce(sum(${stocks.quantity}) filter (where ${stocks.deletedAt} is null), 0)`,
      })
      .from(stocks)
      .where(inArray(stocks.detailProductId, ids))
      .groupBy(stocks.detailProductId);
    return new Map(rows.map((r) => [r.detailProductId, Number(r.qty)]));
  }

  // ---- related (§8.3) ----

  async findCollectionIdsByProductId(productId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ collectionId: productCollections.collectionId })
      .from(productCollections)
      .innerJoin(
        detailProducts,
        eq(productCollections.detailProductId, detailProducts.id),
      )
      .innerJoin(
        collections,
        eq(productCollections.collectionId, collections.id),
      )
      .where(
        and(
          eq(detailProducts.productId, productId),
          isNull(productCollections.deletedAt),
          isNull(detailProducts.deletedAt),
          isNull(collections.deletedAt),
          eq(collections.status, "published"),
        ),
      );
    return rows.map((r) => r.collectionId);
  }

  async findRelatedByCollectionIds(
    collectionIds: string[],
    excludeProductId: string,
    limit: number,
  ): Promise<ProductSummaryQueryRow[]> {
    if (collectionIds.length === 0) {
      return [];
    }
    return await db
      .select(summaryColumns())
      .from(products)
      .leftJoin(
        detailProducts,
        eq(detailProducts.id, firstVariantIdSubquery(products)),
      )
      .where(
        and(
          isNull(products.deletedAt),
          eq(products.status, "published"),
          hasVisibleVariantCondition(products),
          sql`${products.id} <> ${excludeProductId}`,
          sql`exists (
            select 1 from product_collections pc
            inner join detail_products dp2 on dp2.id = pc.detail_product_id
            where dp2.product_id = ${products.id}
              and dp2.deleted_at is null
              and dp2.visibility = 'visible'
              and pc.deleted_at is null
              and pc.collection_id in ${sqlTuple(collectionIds)}
          )`,
        ),
      )
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  async findRelatedByCategoryId(
    categoryId: string,
    excludeProductIds: string[],
    limit: number,
  ): Promise<ProductSummaryQueryRow[]> {
    const conditions: SQL[] = [
      isNull(products.deletedAt),
      eq(products.status, "published"),
      hasVisibleVariantCondition(products),
      eq(products.categoryId, categoryId),
    ];
    if (excludeProductIds.length > 0) {
      conditions.push(
        sql`${products.id} not in ${sqlTuple(excludeProductIds)}`,
      );
    }

    return await db
      .select(summaryColumns())
      .from(products)
      .leftJoin(
        detailProducts,
        eq(detailProducts.id, firstVariantIdSubquery(products)),
      )
      .where(and(...conditions))
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }
}
