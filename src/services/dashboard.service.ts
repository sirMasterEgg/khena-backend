import type { Media } from "../models/media.model";
import type {
  DashboardRepository,
  DateRange,
  DraftProductRow,
  GroupBy,
  PendingOrderRow,
  RecentOrderRow,
  StockAlertRow,
  TopProductRow,
  UnreadMessageRow,
} from "../repositories/dashboard.repository";
import {
  addDaysIso,
  addMonthsIso,
  eachDayIso,
  startOfMonthIso,
  startOfWeekIso,
} from "../utils/date";
import { buildMediaUrl } from "../utils/media-url";

const RECENT_ORDERS_LIMIT = 5;
const TOP_PRODUCTS_LIMIT = 5;

interface GetDashboardInput {
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
}

interface GetPendingInput {
  limit: number;
}

/** Semua bucket periode dalam rentang, sekalipun tidak ada datanya. */
function buildBucketPeriods(range: DateRange, groupBy: GroupBy): string[] {
  if (groupBy === "day") {
    return eachDayIso(range.startDate, range.endDate);
  }
  if (groupBy === "week") {
    const periods: string[] = [];
    let current = startOfWeekIso(range.startDate);
    while (current <= range.endDate) {
      periods.push(current);
      current = addDaysIso(current, 7);
    }
    return periods;
  }
  const periods: string[] = [];
  let current = startOfMonthIso(range.startDate);
  while (current <= range.endDate) {
    periods.push(current);
    current = addMonthsIso(current, 1);
  }
  return periods;
}

/** `customerName` → `null` untuk POS/marketplace tanpa customer terdaftar; pakai `buyerName` bila ada. */
function resolveCustomerName(row: {
  customerName: string | null;
  buyerName: string | null;
}): string | null {
  return row.customerName ?? row.buyerName ?? null;
}

export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  private toRecentOrderResponse(row: RecentOrderRow) {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      orderDate: row.orderDate,
      customerName: resolveCustomerName(row),
      total: row.total,
      status: row.status,
      createdVia: row.createdVia,
    };
  }

  private toPendingOrderResponse(row: PendingOrderRow) {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      orderDate: row.orderDate,
      customerName: resolveCustomerName(row),
      total: row.total,
      status: row.status,
    };
  }

  private toStockAlertResponse(
    row: StockAlertRow,
    imageByVariant: Map<string, Media>,
  ) {
    const image = imageByVariant.get(row.detailProductId);
    return {
      detailProductId: row.detailProductId,
      sku: row.sku,
      productName: row.productName,
      quantity: row.quantity,
      minStockAlert: row.minStockAlert,
      imageUrl: image ? buildMediaUrl(image.objectKey) : null,
    };
  }

  /**
   * Gambar pertama per varian untuk sekumpulan baris (satu panggilan untuk
   * semua id, bukan N+1). Sama pola dengan `toTopProductResponses()`.
   */
  private async firstImageByVariant(
    detailProductIds: string[],
  ): Promise<Map<string, Media>> {
    if (detailProductIds.length === 0) {
      return new Map();
    }
    const imageRows =
      await this.repo.findFirstImagesByDetailProductIds(detailProductIds);
    // imageRows sudah terurut by `order` asc → yang pertama masuk Map adalah
    // gambar pertama.
    const firstImageByVariant = new Map<string, Media>();
    for (const row of imageRows) {
      if (!firstImageByVariant.has(row.detailProductId)) {
        firstImageByVariant.set(row.detailProductId, row.media);
      }
    }
    return firstImageByVariant;
  }

  private toUnreadMessageResponse(row: UnreadMessageRow) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      createdAt: row.createdAt,
    };
  }

  private toDraftProductResponse(row: DraftProductRow) {
    return {
      id: row.id,
      name: row.name,
      baseSku: row.baseSku,
      updatedAt: row.updatedAt,
    };
  }

  private async toTopProductResponses(rows: TopProductRow[]) {
    const imageByVariant = await this.firstImageByVariant(
      rows.map((r) => r.detailProductId),
    );

    return rows.map((row) => {
      const image = imageByVariant.get(row.detailProductId);
      return {
        detailProductId: row.detailProductId,
        sku: row.sku,
        productName: row.productName,
        colorName: row.colorName,
        quantitySold: row.quantitySold,
        revenue: row.revenue,
        imageUrl: image ? buildMediaUrl(image.objectKey) : null,
      };
    });
  }

  async getDashboard(input: GetDashboardInput) {
    const range: DateRange = {
      startDate: input.startDate,
      endDate: input.endDate,
    };

    const [
      summary,
      totalNewCustomers,
      totalContactMessages,
      salesOverviewRows,
      recentOrderRows,
      topProductRows,
      pendingTasks,
    ] = await Promise.all([
      this.repo.summary(range),
      this.repo.countNewCustomers(range),
      this.repo.countContactMessages(range),
      this.repo.salesOverview(range, input.groupBy),
      this.repo.recentOrders(range, RECENT_ORDERS_LIMIT),
      this.repo.topProducts(range, TOP_PRODUCTS_LIMIT),
      this.repo.pendingCounts(),
    ]);

    // Isi bucket kosong dengan 0 — dikerjakan di service, bukan SQL (§5 issue #92).
    const byPeriod = new Map(salesOverviewRows.map((row) => [row.period, row]));
    const salesOverview = buildBucketPeriods(range, input.groupBy).map(
      (period) => {
        const existing = byPeriod.get(period);
        return {
          period,
          revenue: existing?.revenue ?? 0,
          orders: existing?.orders ?? 0,
        };
      },
    );

    const topProducts = await this.toTopProductResponses(topProductRows);

    return {
      period: {
        startDate: input.startDate,
        endDate: input.endDate,
        groupBy: input.groupBy,
      },
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      totalNewCustomers,
      totalContactMessages,
      salesOverview,
      recentOrders: recentOrderRows.map((row) =>
        this.toRecentOrderResponse(row),
      ),
      topProducts,
      pendingTasks,
    };
  }

  async getPending(input: GetPendingInput) {
    const { limit } = input;

    const [
      orderAwaitingAction,
      outOfStockProducts,
      lowStockProducts,
      unreadMessages,
      draftProducts,
    ] = await Promise.all([
      this.repo.listOrdersAwaitingAction(limit),
      this.repo.listStockAlerts("OUT_OF_STOCK", limit),
      this.repo.listStockAlerts("RUNNING_LOW", limit),
      this.repo.listUnreadMessages(limit),
      this.repo.listDraftProducts(limit),
    ]);

    // Satu panggilan gambar untuk kedua daftar stok sekaligus — bukan N+1.
    const stockImageByVariant = await this.firstImageByVariant([
      ...outOfStockProducts.rows.map((r) => r.detailProductId),
      ...lowStockProducts.rows.map((r) => r.detailProductId),
    ]);

    return {
      orderAwaitingAction: {
        total: orderAwaitingAction.total,
        items: orderAwaitingAction.rows.map((row) =>
          this.toPendingOrderResponse(row),
        ),
      },
      outOfStockProducts: {
        total: outOfStockProducts.total,
        items: outOfStockProducts.rows.map((row) =>
          this.toStockAlertResponse(row, stockImageByVariant),
        ),
      },
      lowStockProducts: {
        total: lowStockProducts.total,
        items: lowStockProducts.rows.map((row) =>
          this.toStockAlertResponse(row, stockImageByVariant),
        ),
      },
      unreadMessages: {
        total: unreadMessages.total,
        items: unreadMessages.rows.map((row) =>
          this.toUnreadMessageResponse(row),
        ),
      },
      draftProducts: {
        total: draftProducts.total,
        items: draftProducts.rows.map((row) =>
          this.toDraftProductResponse(row),
        ),
      },
    };
  }
}
