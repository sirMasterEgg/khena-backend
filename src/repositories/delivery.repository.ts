import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  type SQL,
} from "drizzle-orm";
import { customers } from "../models/customer.model";
import { salesOrders } from "../models/sales-order.model";
import { db } from "../utils/db";

export interface DeliveryRow {
  id: string;
  invoiceNumber: string;
  deliveryDate: string; // "YYYY-MM-DD", tidak pernah null karena difilter
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingZipCode: string | null;
  deliveryTimeSlot: string | null;
  deliveryNotes: string | null;
  trackingNumber: string | null;
}

const DELIVERY_SELECTION = {
  id: salesOrders.id,
  invoiceNumber: salesOrders.invoiceNumber,
  deliveryDate: salesOrders.deliveryDate,
  status: salesOrders.status,
  customerId: salesOrders.customerId,
  customerName: customers.name,
  customerPhone: customers.phone,
  shippingAddress: salesOrders.shippingAddress,
  shippingCity: salesOrders.shippingCity,
  shippingProvince: salesOrders.shippingProvince,
  shippingZipCode: salesOrders.shippingZipCode,
  deliveryTimeSlot: salesOrders.deliveryTimeSlot,
  deliveryNotes: salesOrders.deliveryNotes,
  trackingNumber: salesOrders.trackingNumber,
};

export class DeliveryRepository {
  /** Semua channel ikut — TIDAK ada filter createdVia, beda dari OrderSalesRepository. */
  private baseConditions(): SQL[] {
    return [
      isNull(salesOrders.deletedAt),
      isNotNull(salesOrders.deliveryDate),
      inArray(salesOrders.status, ["pending", "processing", "shipped"]),
    ];
  }

  /** Daftar status berbeda dari baseConditions(): tidak termasuk "shipped". */
  private overdueConditions(today: string): SQL[] {
    return [
      isNull(salesOrders.deletedAt),
      isNotNull(salesOrders.deliveryDate),
      lt(salesOrders.deliveryDate, today),
      inArray(salesOrders.status, ["pending", "processing"]),
    ];
  }

  async findByDateRange(start: string, end: string): Promise<DeliveryRow[]> {
    const rows = await db
      .select(DELIVERY_SELECTION)
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(
        and(
          ...this.baseConditions(),
          gte(salesOrders.deliveryDate, start),
          lte(salesOrders.deliveryDate, end),
        ),
      )
      .orderBy(asc(salesOrders.deliveryDate), asc(salesOrders.invoiceNumber));
    // deliveryDate sudah difilter IS NOT NULL di baseConditions(), cast aman.
    return rows.map((row) => ({
      ...row,
      deliveryDate: row.deliveryDate as string,
    }));
  }

  async countByDateRange(start: string, end: string): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(salesOrders)
      .where(
        and(
          ...this.baseConditions(),
          gte(salesOrders.deliveryDate, start),
          lte(salesOrders.deliveryDate, end),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async findOverdue(today: string): Promise<DeliveryRow[]> {
    const rows = await db
      .select(DELIVERY_SELECTION)
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(and(...this.overdueConditions(today)))
      .orderBy(asc(salesOrders.deliveryDate));
    // deliveryDate sudah difilter IS NOT NULL di overdueConditions(), cast aman.
    return rows.map((row) => ({
      ...row,
      deliveryDate: row.deliveryDate as string,
    }));
  }

  async countOverdue(today: string): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(salesOrders)
      .where(and(...this.overdueConditions(today)));
    return Number(rows[0]?.total ?? 0);
  }
}
