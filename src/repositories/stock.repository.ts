import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { colors } from "../models/color.model";
import { type Media, media } from "../models/media.model";
import {
  detailProductImages,
  detailProducts,
  products,
} from "../models/product.model";
import { type NewStock, stocks } from "../models/stock.model";
import { stampCreate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export class StockRepository {
  /** Bulk insert baris ledger. Array kosong menghasilkan SQL tidak valid, jadi guard di sini. */
  async insertEntries(rows: NewStock[], tx: DbOrTx = db): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.insert(stocks).values(rows.map(stampCreate));
  }

  /** SUM(quantity) per detail_product_id, hanya baris aktif. Guard array kosong. */
  async sumQuantityByDetailProductIds(
    detailProductIds: string[],
  ): Promise<Map<string, number>> {
    if (detailProductIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        detailProductId: stocks.detailProductId,
        total: sql<string>`sum(${stocks.quantity})`,
      })
      .from(stocks)
      .where(
        and(
          inArray(stocks.detailProductId, detailProductIds),
          isNull(stocks.deletedAt),
        ),
      )
      .groupBy(stocks.detailProductId);
    return new Map(rows.map((r) => [r.detailProductId, Number(r.total)]));
  }

  /**
   * Resolve SKU varian aktif → id + capitalPrice. Join ke `products` penting:
   * varian yang produk induknya sudah di-soft-delete tidak boleh bisa di-adjust.
   */
  async findActiveVariantsBySkus(
    skus: string[],
  ): Promise<Array<{ id: string; sku: string; capitalPrice: number }>> {
    if (skus.length === 0) {
      return [];
    }
    return await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        capitalPrice: detailProducts.capitalPrice,
      })
      .from(detailProducts)
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .where(
        and(
          inArray(detailProducts.detailProductSku, skus),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
        ),
      );
  }

  /** Agregat stok untuk dashboard (GET /api/stocks/stats). */
  async stockStats(): Promise<{
    totalInventory: number;
    totalOutOfStock: number;
    totalRunningLow: number;
    totalUpdatesToday: number;
  }> {
    // Subquery: stok + ambang per varian aktif. Beda dengan
    // `ProductRepository.stockStats()`: di sini `s.deleted_at IS NULL` wajib
    // difilter (lihat catatan di issue #76).
    const perVariant = db
      .select({
        detailProductId: stocks.detailProductId,
        qty: sql<number>`sum(${stocks.quantity})`.as("qty"),
        minAlert: products.minStockAlert,
      })
      .from(stocks)
      .innerJoin(detailProducts, eq(stocks.detailProductId, detailProducts.id))
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .where(
        and(
          isNull(stocks.deletedAt),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
        ),
      )
      .groupBy(stocks.detailProductId, products.minStockAlert)
      .as("per_variant");

    const [aggregateResult, updatesTodayResult] = await Promise.all([
      db
        .select({
          totalInventory: sql<number>`coalesce(sum(${perVariant.qty}), 0)`,
          totalOutOfStock: sql<number>`count(*) filter (where ${perVariant.qty} <= 0)`,
          totalRunningLow: sql<number>`count(*) filter (where ${perVariant.minAlert} is not null and ${perVariant.qty} > 0 and ${perVariant.qty} <= ${perVariant.minAlert})`,
        })
        .from(perVariant),
      // Baris ledger yang dibuat hari ini, dari semua sumber (adjustment, PO
      // received, POS, order sales) — bukan hanya adjustment.
      db
        .select({ count: sql<number>`count(*)` })
        .from(stocks)
        .where(
          and(
            isNull(stocks.deletedAt),
            sql`${stocks.createdAt} >= current_date`,
            sql`${stocks.createdAt} < current_date + interval '1 day'`,
          ),
        ),
    ]);

    const aggregateRow = aggregateResult[0];
    const updatesTodayRow = updatesTodayResult[0];

    return {
      totalInventory: Number(aggregateRow?.totalInventory ?? 0),
      totalOutOfStock: Number(aggregateRow?.totalOutOfStock ?? 0),
      totalRunningLow: Number(aggregateRow?.totalRunningLow ?? 0),
      totalUpdatesToday: Number(updatesTodayRow?.count ?? 0),
    };
  }

  /** Riwayat perubahan stok, berpaginasi, terbaru dulu (GET /api/stocks/adjustments/activity). */
  async listActivity(input: {
    page: number;
    limit: number;
    source?: "ADJUSTMENT" | "SYSTEM";
  }): Promise<{
    rows: Array<{
      id: string;
      quantity: number;
      reason: string | null;
      isAdjustment: boolean;
      createdBy: string | null;
      createdAt: Date;
      detailProductSku: string;
      productName: string;
    }>;
    total: number;
  }> {
    const conditions: SQL[] = [isNull(stocks.deletedAt)];
    if (input.source === "ADJUSTMENT") {
      conditions.push(eq(stocks.isAdjustment, true));
    } else if (input.source === "SYSTEM") {
      conditions.push(eq(stocks.isAdjustment, false));
    }
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: stocks.id,
          quantity: stocks.quantity,
          reason: stocks.reason,
          isAdjustment: stocks.isAdjustment,
          createdBy: stocks.createdBy,
          createdAt: stocks.createdAt,
          detailProductSku: detailProducts.detailProductSku,
          productName: products.name,
        })
        .from(stocks)
        .innerJoin(detailProducts, eq(stocks.detailProductId, detailProducts.id))
        .innerJoin(products, eq(detailProducts.productId, products.id))
        .where(where)
        // Tiebreaker `id` wajib: timestamp identik tanpa ini membuat urutan
        // antar-halaman tidak stabil.
        .orderBy(desc(stocks.createdAt), desc(stocks.id))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(stocks)
        .innerJoin(detailProducts, eq(stocks.detailProductId, detailProducts.id))
        .innerJoin(products, eq(detailProducts.productId, products.id))
        .where(where),
    ]);

    return { rows, total: Number(countResult[0]?.count ?? 0) };
  }

  /**
   * Daftar varian yang perlu di-restock, berpaginasi (GET /api/stocks/reorder-list).
   *
   * `LEFT JOIN` dari `detail_products`, bukan dari `stocks` seperti
   * `stockStats()` — varian yang belum punya baris ledger sama sekali harus
   * tetap muncul sebagai out of stock. Lihat known limitation di issue #76:
   * akibatnya total `OUT_OF_STOCK` di sini bisa lebih besar dari
   * `totalOutOfStock` pada `/stocks/stats`.
   */
  async listReorderList(input: {
    page: number;
    limit: number;
    status?: "OUT_OF_STOCK" | "RUNNING_LOW";
  }): Promise<{
    rows: Array<{
      detailProductId: string;
      sku: string;
      productName: string;
      minAlert: number | null;
      qty: number;
      status: "OUT_OF_STOCK" | "RUNNING_LOW";
    }>;
    total: number;
  }> {
    const perVariant = db
      .select({
        detailProductId: detailProducts.id,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        minAlert: products.minStockAlert,
        // FILTER dipasang di SUM, bukan di WHERE, supaya varian yang semua
        // baris ledger-nya sudah di-soft-delete tidak ikut terbuang.
        qty: sql<number>`coalesce(sum(${stocks.quantity}) filter (where ${stocks.deletedAt} is null), 0)`.as(
          "qty",
        ),
      })
      .from(detailProducts)
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .leftJoin(stocks, eq(stocks.detailProductId, detailProducts.id))
      .where(
        and(isNull(detailProducts.deletedAt), isNull(products.deletedAt)),
      )
      .groupBy(
        detailProducts.id,
        detailProducts.detailProductSku,
        products.name,
        products.minStockAlert,
      )
      .as("per_variant");

    const conditions: SQL[] = [
      sql`(${perVariant.qty} <= 0 or (${perVariant.minAlert} is not null and ${perVariant.qty} > 0 and ${perVariant.qty} <= ${perVariant.minAlert}))`,
    ];
    if (input.status === "OUT_OF_STOCK") {
      conditions.push(sql`${perVariant.qty} <= 0`);
    } else if (input.status === "RUNNING_LOW") {
      conditions.push(sql`${perVariant.qty} > 0`);
    }
    const where = and(...conditions);

    const statusExpr = sql<string>`case when ${perVariant.qty} <= 0 then 'OUT_OF_STOCK' else 'RUNNING_LOW' end`;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          detailProductId: perVariant.detailProductId,
          sku: perVariant.sku,
          productName: perVariant.productName,
          minAlert: perVariant.minAlert,
          qty: perVariant.qty,
          status: statusExpr,
        })
        .from(perVariant)
        .where(where)
        // Paling kritis (stok 0) di paling atas; `sku` tiebreaker supaya
        // paginasi stabil.
        .orderBy(asc(perVariant.qty), asc(perVariant.sku))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(perVariant)
        .where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        detailProductId: r.detailProductId,
        sku: r.sku,
        productName: r.productName,
        minAlert: r.minAlert,
        qty: Number(r.qty),
        status: r.status as "OUT_OF_STOCK" | "RUNNING_LOW",
      })),
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  /**
   * Gambar pertama per varian untuk baris-baris yang tampil di satu halaman.
   * Panggil sekali dengan semua id di halaman tersebut — bukan N+1.
   */
  async findFirstImagesByDetailProductIds(
    ids: string[],
  ): Promise<Array<{ detailProductId: string; media: Media }>> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select({ detailProductId: detailProductImages.detailProductId, media })
      .from(detailProductImages)
      .innerJoin(media, eq(detailProductImages.mediaId, media.id))
      .where(
        and(
          inArray(detailProductImages.detailProductId, ids),
          isNull(detailProductImages.deletedAt),
        ),
      )
      .orderBy(asc(detailProductImages.order));
  }

  /** Status stok satu varian by SKU (GET /api/stocks/:sku/status). Hanya varian aktif. */
  async findVariantStatusBySku(sku: string): Promise<
    | {
        id: string;
        sku: string;
        productName: string;
        colorName: string;
        qty: number;
      }
    | undefined
  > {
    const rows = await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        colorName: colors.name,
        qty: sql<number>`coalesce(sum(${stocks.quantity}) filter (where ${stocks.deletedAt} is null), 0)`,
      })
      .from(detailProducts)
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .innerJoin(colors, eq(colors.id, detailProducts.colorId))
      .leftJoin(stocks, eq(stocks.detailProductId, detailProducts.id))
      .where(
        and(
          eq(detailProducts.detailProductSku, sku),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
        ),
      )
      .groupBy(
        detailProducts.id,
        detailProducts.detailProductSku,
        products.name,
        colors.name,
      )
      .limit(1);

    const row = rows[0];
    return row ? { ...row, qty: Number(row.qty) } : undefined;
  }
}
