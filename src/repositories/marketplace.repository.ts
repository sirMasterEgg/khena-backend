import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { detailProducts, products } from "../models/product.model";
import {
  type NewSalesOrder,
  type NewSalesOrderItem,
  type SalesOrder,
  salesOrderItems,
  salesOrders,
} from "../models/sales-order.model";
import { stampCreate, stampDelete } from "../utils/audit";
import { db, type Tx } from "../utils/db";

export interface MarketplaceVariantRow {
  id: string;
  sku: string;
  capitalPrice: number;
  productName: string;
}

export interface MarketplaceOrderRow {
  id: string;
  orderId: string;
  marketplace: string | null;
  date: string;
  buyerName: string | null;
  totalRevenue: number;
}

export interface MarketplaceOrderItemDetailRow {
  id: string;
  salesOrderId: string;
  variantSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface MarketplaceOrderItemForDelete {
  detailProductId: string;
  quantity: number;
}

export interface MarketplaceStatsChannelRow {
  marketplace: string | null;
  revenue: number;
  orders: number;
  skus: number;
}

interface ListOrdersFilter {
  marketplace?: string;
  page: number;
  limit: number;
}

export class MarketplaceRepository {
  /** Insert header order. Dipakai di dalam transaksi. */
  async createOrder(data: NewSalesOrder, tx: Tx): Promise<SalesOrder> {
    const result = await tx
      .insert(salesOrders)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create sales order");
    }
    return row;
  }

  /** Bulk insert item sales order. Array kosong menghasilkan SQL tidak valid, jadi guard di sini. */
  async insertItems(rows: NewSalesOrderItem[], tx: Tx): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.insert(salesOrderItems).values(rows.map(stampCreate));
  }

  /**
   * Cek order id yang SUDAH ADA di DB. Hanya baris aktif (deletedAt null),
   * karena unique index-nya juga hanya untuk baris aktif. Guard array kosong.
   */
  async findExistingInvoiceNumbers(orderIds: string[]): Promise<Set<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await db
      .select({ invoiceNumber: salesOrders.invoiceNumber })
      .from(salesOrders)
      .where(
        and(
          inArray(salesOrders.invoiceNumber, orderIds),
          isNull(salesOrders.deletedAt),
        ),
      );
    return new Set(rows.map((r) => r.invoiceNumber));
  }

  /**
   * Resolve SKU varian aktif → id + capitalPrice + nama produk. Join ke
   * `products` penting: varian yang produk induknya sudah di-soft-delete
   * tidak boleh dicatat. Guard array kosong.
   */
  async findActiveVariantsBySkus(
    skus: string[],
  ): Promise<MarketplaceVariantRow[]> {
    if (skus.length === 0) {
      return [];
    }
    return await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        capitalPrice: detailProducts.capitalPrice,
        productName: products.name,
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

  /**
   * List header order marketplace berpaginasi + total count. Paginasi
   * dihitung per ORDER (bukan per item) — items-nya diambil terpisah lewat
   * {@link findItemsByOrderIds} supaya satu order dengan banyak item tidak
   * "terpotong" antar halaman.
   */
  async listOrders(
    filter: ListOrdersFilter,
  ): Promise<{ rows: MarketplaceOrderRow[]; total: number }> {
    const conditions = [
      eq(salesOrders.createdVia, "marketplace"),
      isNull(salesOrders.deletedAt),
    ];
    if (filter.marketplace) {
      // Tanpa tanda `%` → cocok persis tapi tidak peduli huruf besar/kecil,
      // karena nama marketplace disimpan bebas teks.
      conditions.push(ilike(salesOrders.marketplaceName, filter.marketplace));
    }
    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: salesOrders.id,
          orderId: salesOrders.invoiceNumber,
          marketplace: salesOrders.marketplaceName,
          date: salesOrders.orderDate,
          buyerName: salesOrders.buyerName,
          totalRevenue: salesOrders.totalAmount,
        })
        .from(salesOrders)
        .where(where)
        .orderBy(desc(salesOrders.orderDate), asc(salesOrders.invoiceNumber))
        .limit(filter.limit)
        .offset((filter.page - 1) * filter.limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(salesOrders)
        .where(where),
    ]);

    return { rows, total: Number(countResult[0]?.count ?? 0) };
  }

  /**
   * Item aktif milik sekumpulan order sekaligus (bukan N+1), dipakai untuk
   * menyusun `items[]` di {@link listOrders}. Terurut `id` ascending supaya
   * item dalam satu order urutannya stabil. Guard array kosong.
   */
  async findItemsByOrderIds(
    orderIds: string[],
  ): Promise<MarketplaceOrderItemDetailRow[]> {
    if (orderIds.length === 0) {
      return [];
    }
    return await db
      .select({
        id: salesOrderItems.id,
        salesOrderId: salesOrderItems.salesOrderId,
        variantSku: detailProducts.detailProductSku,
        productName: products.name,
        quantity: salesOrderItems.quantity,
        unitPrice: salesOrderItems.unitPrice,
      })
      .from(salesOrderItems)
      .innerJoin(
        detailProducts,
        eq(salesOrderItems.detailProductId, detailProducts.id),
      )
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .where(
        and(
          inArray(salesOrderItems.salesOrderId, orderIds),
          isNull(salesOrderItems.deletedAt),
        ),
      )
      .orderBy(asc(salesOrderItems.id));
  }

  /** Ambil satu order marketplace aktif by id. `undefined` bila tidak ada / bukan marketplace. */
  async findOrderById(id: string): Promise<SalesOrder | undefined> {
    const rows = await db
      .select()
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.id, id),
          eq(salesOrders.createdVia, "marketplace"),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Item aktif milik satu order, dipakai untuk membalik ledger stok saat delete. */
  async findItemsForOrder(
    id: string,
  ): Promise<MarketplaceOrderItemForDelete[]> {
    return await db
      .select({
        detailProductId: salesOrderItems.detailProductId,
        quantity: salesOrderItems.quantity,
      })
      .from(salesOrderItems)
      .where(
        and(
          eq(salesOrderItems.salesOrderId, id),
          isNull(salesOrderItems.deletedAt),
        ),
      );
  }

  /**
   * CapitalPrice varian saat ini, dipakai untuk baris ledger pembalik saat
   * delete. TANPA filter aktif — varian yang produknya sudah di-soft-delete
   * setelah order dibuat tetap harus bisa dibalik ledgernya. Guard array kosong.
   */
  async findCapitalPricesByIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({
        id: detailProducts.id,
        capitalPrice: detailProducts.capitalPrice,
      })
      .from(detailProducts)
      .where(inArray(detailProducts.id, ids));
    return new Map(rows.map((r) => [r.id, r.capitalPrice]));
  }

  async softDeleteOrder(id: string, tx: Tx): Promise<void> {
    await tx
      .update(salesOrders)
      .set(stampDelete())
      .where(eq(salesOrders.id, id));
  }

  async softDeleteItemsByOrderId(id: string, tx: Tx): Promise<void> {
    await tx
      .update(salesOrderItems)
      .set(stampDelete())
      .where(eq(salesOrderItems.salesOrderId, id));
  }

  /**
   * Agregat dashboard (GET /api/marketplace/stats). `totalRevenue`/`totalOrders`
   * dihitung dari join item↔order supaya konsisten dengan `channels` (satu
   * order selalu punya tepat satu `marketplaceName`, jadi SUM per channel =
   * total keseluruhan). `uniqueSkus` dihitung terpisah karena SKU yang sama
   * bisa muncul di lebih dari satu channel — menjumlahkan `channels[].skus`
   * akan menghitung ganda.
   */
  async getStats(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    uniqueSkus: number;
    channels: MarketplaceStatsChannelRow[];
  }> {
    const where = and(
      eq(salesOrders.createdVia, "marketplace"),
      isNull(salesOrders.deletedAt),
      isNull(salesOrderItems.deletedAt),
    );
    const revenueExpr = sql<string>`sum(${salesOrderItems.quantity} * ${salesOrderItems.unitPrice})`;

    const [totalsResult, uniqueSkusResult, channelRows] = await Promise.all([
      db
        .select({
          totalRevenue: sql<string>`coalesce(${revenueExpr}, 0)`,
          totalOrders: sql<string>`count(distinct ${salesOrders.id})`,
        })
        .from(salesOrderItems)
        .innerJoin(
          salesOrders,
          eq(salesOrderItems.salesOrderId, salesOrders.id),
        )
        .where(where),
      db
        .select({
          count: sql<string>`count(distinct ${salesOrderItems.detailProductId})`,
        })
        .from(salesOrderItems)
        .innerJoin(
          salesOrders,
          eq(salesOrderItems.salesOrderId, salesOrders.id),
        )
        .where(where),
      db
        .select({
          marketplace: salesOrders.marketplaceName,
          revenue: sql<string>`coalesce(${revenueExpr}, 0)`,
          orders: sql<string>`count(distinct ${salesOrders.id})`,
          skus: sql<string>`count(distinct ${salesOrderItems.detailProductId})`,
        })
        .from(salesOrderItems)
        .innerJoin(
          salesOrders,
          eq(salesOrderItems.salesOrderId, salesOrders.id),
        )
        .where(where)
        .groupBy(salesOrders.marketplaceName)
        .orderBy(desc(revenueExpr)),
    ]);

    return {
      totalRevenue: Number(totalsResult[0]?.totalRevenue ?? 0),
      totalOrders: Number(totalsResult[0]?.totalOrders ?? 0),
      uniqueSkus: Number(uniqueSkusResult[0]?.count ?? 0),
      channels: channelRows.map((r) => ({
        marketplace: r.marketplace,
        revenue: Number(r.revenue),
        orders: Number(r.orders),
        skus: Number(r.skus),
      })),
    };
  }
}
