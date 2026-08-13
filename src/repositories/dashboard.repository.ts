import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { colors } from "../models/color.model";
import { customers } from "../models/customer.model";
import { inquiries } from "../models/inquiry.model";
import { type Media, media } from "../models/media.model";
import {
  detailProductImages,
  detailProducts,
  products,
} from "../models/product.model";
import { salesOrderItems, salesOrders } from "../models/sales-order.model";
import { stocks } from "../models/stock.model";
import { db } from "../utils/db";

/** Rentang tanggal inklusif, dua-duanya "YYYY-MM-DD". */
export interface DateRange {
  startDate: string;
  endDate: string;
}

export type GroupBy = "day" | "week" | "month";

export interface RecentOrderRow {
  id: string;
  invoiceNumber: string;
  orderDate: string;
  customerName: string | null;
  buyerName: string | null;
  total: number;
  status: string;
  createdVia: string;
}

export interface TopProductRow {
  detailProductId: string;
  sku: string;
  productName: string;
  colorName: string;
  quantitySold: number;
  revenue: number;
}

export interface PendingCounts {
  orderAwaitingFulfillment: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  unreadMessages: number;
  draftProducts: number;
}

export interface PendingOrderRow {
  id: string;
  invoiceNumber: string;
  orderDate: string;
  customerName: string | null;
  buyerName: string | null;
  total: number;
  status: string;
}

export interface StockAlertRow {
  detailProductId: string;
  sku: string;
  productName: string;
  quantity: number;
  minStockAlert: number | null;
}

export interface UnreadMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  createdAt: Date;
}

export interface DraftProductRow {
  id: string;
  name: string;
  baseSku: string;
  updatedAt: Date;
}

/** `order_date` bertipe date: perbandingan string ISO langsung aman (lihat §3.4 issue #92). */
function orderDateInRange(range: DateRange): SQL {
  return and(
    sql`${salesOrders.orderDate} >= ${range.startDate}`,
    sql`${salesOrders.orderDate} <= ${range.endDate}`,
  ) as SQL;
}

/** Filter yang dipakai bareng oleh totalRevenue/totalOrders/salesOverview/topProducts. */
function completedOrderInRange(range: DateRange): SQL {
  return and(
    isNull(salesOrders.deletedAt),
    eq(salesOrders.status, "completed"),
    orderDateInRange(range),
  ) as SQL;
}

export class DashboardRepository {
  /** totalRevenue + totalOrders sekaligus (satu query, satu filter). */
  async summary(
    range: DateRange,
  ): Promise<{ totalRevenue: number; totalOrders: number }> {
    const rows = await db
      .select({
        totalRevenue: sql<string>`coalesce(sum(${salesOrders.total}), 0)`,
        totalOrders: sql<string>`count(*)`,
      })
      .from(salesOrders)
      .where(completedOrderInRange(range));
    return {
      totalRevenue: Number(rows[0]?.totalRevenue ?? 0),
      totalOrders: Number(rows[0]?.totalOrders ?? 0),
    };
  }

  async countNewCustomers(range: DateRange): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          sql`${customers.joinedAt} >= ${range.startDate}::date`,
          sql`${customers.joinedAt} < ${range.endDate}::date + interval '1 day'`,
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  /** `inquiries` tidak punya `deleted_at` (lihat §3.2 issue #92) — jangan menyaringnya. */
  async countContactMessages(range: DateRange): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(inquiries)
      .where(
        and(
          sql`${inquiries.createdAt} >= ${range.startDate}::date`,
          sql`${inquiries.createdAt} < ${range.endDate}::date + interval '1 day'`,
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  /** Hanya bucket yang ada datanya; pengisian bucket kosong urusan service. */
  async salesOverview(
    range: DateRange,
    groupBy: GroupBy,
  ): Promise<Array<{ period: string; revenue: number; orders: number }>> {
    const bucketExpr =
      groupBy === "day"
        ? sql<string>`to_char(${salesOrders.orderDate}, 'YYYY-MM-DD')`
        : groupBy === "week"
          ? sql<string>`to_char(date_trunc('week', ${salesOrders.orderDate}), 'YYYY-MM-DD')`
          : sql<string>`to_char(date_trunc('month', ${salesOrders.orderDate}), 'YYYY-MM-DD')`;

    const rows = await db
      .select({
        period: bucketExpr,
        revenue: sql<string>`coalesce(sum(${salesOrders.total}), 0)`,
        orders: sql<string>`count(*)`,
      })
      .from(salesOrders)
      .where(completedOrderInRange(range))
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    return rows.map((r) => ({
      period: r.period,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
  }

  /**
   * 5 order terbaru, semua status — lihat asumsi #4 issue #92. Channel
   * `marketplace` dan `pos` sengaja dikecualikan: bagian ini untuk memantau
   * order yang masih perlu ditindaklanjuti tim sales/gudang, bukan transaksi
   * kasir/marketplace yang sudah selesai saat itu juga.
   */
  async recentOrders(
    range: DateRange,
    limit: number,
  ): Promise<RecentOrderRow[]> {
    return await db
      .select({
        id: salesOrders.id,
        invoiceNumber: salesOrders.invoiceNumber,
        orderDate: salesOrders.orderDate,
        customerName: customers.name,
        buyerName: salesOrders.buyerName,
        total: salesOrders.total,
        status: salesOrders.status,
        createdVia: salesOrders.createdVia,
      })
      .from(salesOrders)
      .leftJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(
        and(
          isNull(salesOrders.deletedAt),
          orderDateInRange(range),
          notInArray(salesOrders.createdVia, ["marketplace", "pos"]),
        ),
      )
      // Tiebreaker `id` wajib supaya urutan deterministik (lihat stock.repository.ts:190).
      .orderBy(
        desc(salesOrders.orderDate),
        desc(salesOrders.createdAt),
        desc(salesOrders.id),
      )
      .limit(limit);
  }

  /** 5 varian teratas berdasar qty terjual, dari order `completed` dalam rentang. */
  async topProducts(range: DateRange, limit: number): Promise<TopProductRow[]> {
    const quantitySoldExpr = sql<string>`sum(${salesOrderItems.quantity})`;
    const revenueExpr = sql<string>`sum(${salesOrderItems.quantity} * ${salesOrderItems.unitPrice})`;

    const rows = await db
      .select({
        detailProductId: detailProducts.id,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        colorName: colors.name,
        quantitySold: quantitySoldExpr,
        revenue: revenueExpr,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.salesOrderId))
      .innerJoin(
        detailProducts,
        eq(detailProducts.id, salesOrderItems.detailProductId),
      )
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .innerJoin(colors, eq(colors.id, detailProducts.colorId))
      .where(
        and(
          isNull(salesOrderItems.deletedAt),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
          completedOrderInRange(range),
        ),
      )
      .groupBy(
        detailProducts.id,
        detailProducts.detailProductSku,
        products.name,
        colors.name,
      )
      // `sku` tiebreaker supaya urutan deterministik.
      .orderBy(desc(quantitySoldExpr), asc(detailProducts.detailProductSku))
      .limit(limit);

    return rows.map((r) => ({
      detailProductId: r.detailProductId,
      sku: r.sku,
      productName: r.productName,
      colorName: r.colorName,
      quantitySold: Number(r.quantitySold),
      revenue: Number(r.revenue),
    }));
  }

  /**
   * Subquery stok per varian, disalin dari
   * `StockRepository.listReorderList()` (src/repositories/stock.repository.ts:233).
   * `LEFT JOIN` dari `detail_products`, bukan dari `stocks`, supaya varian
   * yang belum punya baris ledger sama sekali tetap terhitung out of stock.
   */
  private perVariantStock() {
    return db
      .select({
        detailProductId: detailProducts.id,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        minAlert: products.minStockAlert,
        qty: sql<number>`coalesce(sum(${stocks.quantity}) filter (where ${stocks.deletedAt} is null), 0)`.as(
          "qty",
        ),
      })
      .from(detailProducts)
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .leftJoin(stocks, eq(stocks.detailProductId, detailProducts.id))
      .where(and(isNull(detailProducts.deletedAt), isNull(products.deletedAt)))
      .groupBy(
        detailProducts.id,
        detailProducts.detailProductSku,
        products.name,
        products.minStockAlert,
      )
      .as("per_variant");
  }

  /** Semua angka pendingTasks dalam satu pemanggilan; query kecilnya paralel. */
  async pendingCounts(): Promise<PendingCounts> {
    const perVariant = this.perVariantStock();

    const [
      orderAwaitingFulfillmentResult,
      stockResult,
      unreadMessagesResult,
      draftProductsResult,
    ] = await Promise.all([
      db
        .select({ total: count() })
        .from(salesOrders)
        .where(
          and(
            isNull(salesOrders.deletedAt),
            inArray(salesOrders.status, ["pending", "processing"]),
          ),
        ),
      db
        .select({
          outOfStock: sql<string>`count(*) filter (where ${perVariant.qty} <= 0)`,
          lowStock: sql<string>`count(*) filter (where ${perVariant.minAlert} is not null and ${perVariant.qty} > 0 and ${perVariant.qty} <= ${perVariant.minAlert})`,
        })
        .from(perVariant),
      db
        .select({ total: count() })
        .from(inquiries)
        .where(isNull(inquiries.readAt)),
      db
        .select({ total: count() })
        .from(products)
        .where(and(isNull(products.deletedAt), eq(products.status, "draft"))),
    ]);

    return {
      orderAwaitingFulfillment: Number(
        orderAwaitingFulfillmentResult[0]?.total ?? 0,
      ),
      outOfStockProducts: Number(stockResult[0]?.outOfStock ?? 0),
      lowStockProducts: Number(stockResult[0]?.lowStock ?? 0),
      unreadMessages: Number(unreadMessagesResult[0]?.total ?? 0),
      draftProducts: Number(draftProductsResult[0]?.total ?? 0),
    };
  }

  /** Order menunggu tindakan — sama definisinya dengan `pendingCounts().orderAwaitingFulfillment`. */
  async listOrdersAwaitingAction(
    limit: number,
  ): Promise<{ total: number; rows: PendingOrderRow[] }> {
    const where = and(
      isNull(salesOrders.deletedAt),
      inArray(salesOrders.status, ["pending", "processing"]),
    );

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: salesOrders.id,
          invoiceNumber: salesOrders.invoiceNumber,
          orderDate: salesOrders.orderDate,
          customerName: customers.name,
          buyerName: salesOrders.buyerName,
          total: salesOrders.total,
          status: salesOrders.status,
        })
        .from(salesOrders)
        .leftJoin(customers, eq(customers.id, salesOrders.customerId))
        .where(where)
        // Order yang paling lama menunggu di paling atas; `id` tiebreaker.
        .orderBy(asc(salesOrders.orderDate), asc(salesOrders.id))
        .limit(limit),
      db.select({ total: count() }).from(salesOrders).where(where),
    ]);

    return { total: Number(countResult[0]?.total ?? 0), rows };
  }

  async listStockAlerts(
    status: "OUT_OF_STOCK" | "RUNNING_LOW",
    limit: number,
  ): Promise<{ total: number; rows: StockAlertRow[] }> {
    const perVariant = this.perVariantStock();
    const where =
      status === "OUT_OF_STOCK"
        ? sql`${perVariant.qty} <= 0`
        : sql`${perVariant.minAlert} is not null and ${perVariant.qty} > 0 and ${perVariant.qty} <= ${perVariant.minAlert}`;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          detailProductId: perVariant.detailProductId,
          sku: perVariant.sku,
          productName: perVariant.productName,
          quantity: perVariant.qty,
          minStockAlert: perVariant.minAlert,
        })
        .from(perVariant)
        .where(where)
        // Paling kritis (stok terendah) di paling atas; `sku` tiebreaker.
        .orderBy(asc(perVariant.qty), asc(perVariant.sku))
        .limit(limit),
      db.select({ total: count() }).from(perVariant).where(where),
    ]);

    return {
      total: Number(countResult[0]?.total ?? 0),
      rows: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
    };
  }

  async listUnreadMessages(
    limit: number,
  ): Promise<{ total: number; rows: UnreadMessageRow[] }> {
    const where = isNull(inquiries.readAt);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: inquiries.id,
          name: inquiries.name,
          email: inquiries.email,
          subject: inquiries.subject,
          createdAt: inquiries.createdAt,
        })
        .from(inquiries)
        .where(where)
        .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
        .limit(limit),
      db.select({ total: count() }).from(inquiries).where(where),
    ]);

    return { total: Number(countResult[0]?.total ?? 0), rows };
  }

  async listDraftProducts(
    limit: number,
  ): Promise<{ total: number; rows: DraftProductRow[] }> {
    const where = and(isNull(products.deletedAt), eq(products.status, "draft"));

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: products.id,
          name: products.name,
          baseSku: products.baseSku,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(where)
        .orderBy(desc(products.updatedAt), desc(products.id))
        .limit(limit),
      db.select({ total: count() }).from(products).where(where),
    ]);

    return { total: Number(countResult[0]?.total ?? 0), rows };
  }

  /**
   * Gambar pertama per varian untuk baris-baris yang tampil di satu halaman.
   * Disalin dari `StockRepository.findFirstImagesByDetailProductIds()`
   * (src/repositories/stock.repository.ts:306) — panggil sekali dengan semua
   * id di halaman tersebut, bukan N+1.
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
}
