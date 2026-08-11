import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { detailProducts, products } from "../models/product.model";
import {
  type NewSalesOrder,
  type NewSalesOrderItem,
  type SalesOrder,
  salesOrderItems,
  salesOrders,
} from "../models/sales-order.model";
import { stampCreate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

export interface MarketplaceVariantRow {
  id: string;
  sku: string;
  capitalPrice: number;
  productName: string;
}

export interface MarketplaceItemRow {
  id: string;
  orderId: string;
  marketplace: string | null;
  date: string;
  buyerName: string | null;
  variantSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface ListOrderItemsFilter {
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

  /** List item marketplace berpaginasi + total count. */
  async listOrderItems(
    filter: ListOrderItemsFilter,
  ): Promise<{ rows: MarketplaceItemRow[]; total: number }> {
    const conditions = [
      eq(salesOrders.createdVia, "marketplace"),
      isNull(salesOrders.deletedAt),
      isNull(salesOrderItems.deletedAt),
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
          id: salesOrderItems.id,
          orderId: salesOrders.invoiceNumber,
          marketplace: salesOrders.marketplaceName,
          date: salesOrders.orderDate,
          buyerName: salesOrders.buyerName,
          variantSku: detailProducts.detailProductSku,
          productName: products.name,
          quantity: salesOrderItems.quantity,
          unitPrice: salesOrderItems.unitPrice,
        })
        .from(salesOrderItems)
        .innerJoin(
          salesOrders,
          eq(salesOrderItems.salesOrderId, salesOrders.id),
        )
        .innerJoin(
          detailProducts,
          eq(salesOrderItems.detailProductId, detailProducts.id),
        )
        .innerJoin(products, eq(detailProducts.productId, products.id))
        .where(where)
        .orderBy(
          desc(salesOrders.orderDate),
          asc(salesOrders.invoiceNumber),
          asc(salesOrderItems.id),
        )
        .limit(filter.limit)
        .offset((filter.page - 1) * filter.limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(salesOrderItems)
        .innerJoin(
          salesOrders,
          eq(salesOrderItems.salesOrderId, salesOrders.id),
        )
        .innerJoin(
          detailProducts,
          eq(salesOrderItems.detailProductId, detailProducts.id),
        )
        .innerJoin(products, eq(detailProducts.productId, products.id))
        .where(where),
    ]);

    return { rows, total: Number(countResult[0]?.count ?? 0) };
  }
}
