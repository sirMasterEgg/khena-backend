import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { categories } from "../models/category.model";
import { colors } from "../models/color.model";
import { customers } from "../models/customer.model";
import { detailProducts, products } from "../models/product.model";
import {
  type NewSalesOrder,
  type NewSalesOrderItem,
  type SalesOrder,
  salesOrderItems,
  salesOrders,
} from "../models/sales-order.model";
import { stampCreate, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export interface ActiveVariantRow {
  id: string;
  sku: string;
  price: number;
  capitalPrice: number;
  productName: string;
  /** Berat box (kg), null bila belum diisi. Prioritas di atas berat produk. */
  boxWeightKg: number | null;
  /** Berat produk (kg), dipakai bila berat box kosong. */
  productWeightKg: number | null;
}

export interface VariantListRow {
  id: string;
  sku: string;
  price: number;
  productName: string;
  colorName: string;
  categoryName: string | null;
}

interface ListVariantsFilter {
  name?: string;
  sku?: string;
  categoryId?: string;
  page: number;
  limit: number;
}

export interface OrderListFilter {
  search?: string;
  sort?: "newest" | "oldest" | "total";
  status?: string; // sudah divalidasi controller
  /** Bila undefined, ambil semua baris tanpa LIMIT/OFFSET (dipakai export CSV). */
  page?: number;
  limit?: number;
}

export interface OrderListRow {
  id: string;
  invoiceNumber: string;
  orderDate: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  totalAmount: number;
  shippingAmount: number | null;
  discountAmount: number | null;
  total: number;
  status: string;
  trackingNumber: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingZipCode: string | null;
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
  deliveryNotes: string | null;
}

export interface OrderDetailRow extends OrderListRow {
  customerTotalSpend: number;
  paymentMethod: string;
  note: string | null;
}

export interface OrderItemRow {
  id: string;
  salesOrderId: string;
  detailProductId: string;
  quantity: number;
  unitPrice: number;
  isPacked: boolean | null;
  sku: string;
  productName: string;
  colorName: string;
  capitalPrice: number;
  boxWeightKg: number | null;
  productWeightKg: number | null;
}

const ORDER_LIST_SELECTION = {
  id: salesOrders.id,
  invoiceNumber: salesOrders.invoiceNumber,
  orderDate: salesOrders.orderDate,
  customerId: salesOrders.customerId,
  customerName: customers.name,
  customerEmail: customers.email,
  customerPhone: customers.phone,
  totalAmount: salesOrders.totalAmount,
  shippingAmount: salesOrders.shippingAmount,
  discountAmount: salesOrders.discountAmount,
  total: salesOrders.total,
  status: salesOrders.status,
  trackingNumber: salesOrders.trackingNumber,
  shippingAddress: salesOrders.shippingAddress,
  shippingCity: salesOrders.shippingCity,
  shippingProvince: salesOrders.shippingProvince,
  shippingZipCode: salesOrders.shippingZipCode,
  deliveryDate: salesOrders.deliveryDate,
  deliveryTimeSlot: salesOrders.deliveryTimeSlot,
  deliveryNotes: salesOrders.deliveryNotes,
};

export class OrderSalesRepository {
  /** Filter dasar yang dipakai hampir semua method di bawah. */
  private baseConditions(): SQL[] {
    return [
      isNull(salesOrders.deletedAt),
      eq(salesOrders.createdVia, "order_sales"),
    ];
  }
  async create(data: NewSalesOrder, tx: Tx): Promise<SalesOrder> {
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
   * Nomor invoice tertinggi untuk prefix bulan tsb. TANPA filter deleted_at —
   * nomor invoice sales order yang sudah dihapus tidak boleh dipakai ulang.
   */
  async findMaxInvoiceNumberForPrefix(
    prefix: string,
    tx: DbOrTx = db,
  ): Promise<string | null> {
    const result = await tx
      .select({ max: sql<string | null>`max(${salesOrders.invoiceNumber})` })
      .from(salesOrders)
      .where(ilike(salesOrders.invoiceNumber, `${prefix}%`));
    return result[0]?.max ?? null;
  }

  /**
   * Validasi varian: hanya varian aktif beserta induk yang juga aktif.
   * Berbeda dari versi POS: ikut mengambil berat box & produk untuk
   * kebutuhan hitung ongkir. Guard array kosong.
   */
  async findActiveVariantsByIds(ids: string[]): Promise<ActiveVariantRow[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        price: detailProducts.price,
        capitalPrice: detailProducts.capitalPrice,
        productName: products.name,
        boxWeightKg: products.boxDimensionWeight,
        productWeightKg: products.productDimensionWeight,
      })
      .from(detailProducts)
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .where(
        and(
          inArray(detailProducts.id, ids),
          isNull(detailProducts.deletedAt),
          isNull(products.deletedAt),
        ),
      );
  }

  async listVariants(
    filter: ListVariantsFilter,
  ): Promise<{ rows: VariantListRow[]; total: number }> {
    const conditions: SQL[] = [
      isNull(detailProducts.deletedAt),
      isNull(products.deletedAt),
    ];
    if (filter.name) {
      conditions.push(ilike(products.name, `%${filter.name}%`));
    }
    if (filter.sku) {
      conditions.push(
        ilike(detailProducts.detailProductSku, `%${filter.sku}%`),
      );
    }
    if (filter.categoryId) {
      conditions.push(eq(products.categoryId, filter.categoryId));
    }
    const where = and(...conditions);

    const rows = await db
      .select({
        id: detailProducts.id,
        sku: detailProducts.detailProductSku,
        price: detailProducts.price,
        productName: products.name,
        colorName: colors.name,
        categoryName: categories.category,
      })
      .from(detailProducts)
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .innerJoin(colors, eq(detailProducts.colorId, colors.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(asc(products.name), asc(detailProducts.detailProductSku))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(detailProducts)
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .innerJoin(colors, eq(detailProducts.colorId, colors.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async listOrders(
    filter: OrderListFilter,
  ): Promise<{ rows: OrderListRow[]; total: number }> {
    const conditions: SQL[] = [...this.baseConditions()];
    if (filter.search) {
      const search = or(
        ilike(salesOrders.invoiceNumber, `%${filter.search}%`),
        ilike(customers.name, `%${filter.search}%`),
      );
      if (search) {
        conditions.push(search);
      }
    }
    if (filter.status) {
      if (filter.status === "awaiting_fulfillment") {
        conditions.push(inArray(salesOrders.status, ["pending", "processing"]));
      } else {
        conditions.push(eq(salesOrders.status, filter.status));
      }
    }
    const where = and(...conditions);

    let orderBy: SQL[];
    if (filter.sort === "oldest") {
      orderBy = [asc(salesOrders.orderDate), asc(salesOrders.createdAt)];
    } else if (filter.sort === "total") {
      orderBy = [desc(salesOrders.total)];
    } else {
      orderBy = [desc(salesOrders.orderDate), desc(salesOrders.createdAt)];
    }

    let query = db
      .select(ORDER_LIST_SELECTION)
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(where)
      .orderBy(...orderBy)
      .$dynamic();

    if (filter.page !== undefined && filter.limit !== undefined) {
      query = query
        .limit(filter.limit)
        .offset((filter.page - 1) * filter.limit);
    }

    const rows = await query;

    const countResult = await db
      .select({ total: count() })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(where);
    const total = Number(countResult[0]?.total ?? 0);

    return { rows, total };
  }

  /** Guard: `inArray` dengan array kosong menghasilkan SQL tidak valid. */
  async findItemsByOrderIds(orderIds: string[]): Promise<OrderItemRow[]> {
    if (orderIds.length === 0) {
      return [];
    }
    return await db
      .select({
        id: salesOrderItems.id,
        salesOrderId: salesOrderItems.salesOrderId,
        detailProductId: salesOrderItems.detailProductId,
        quantity: salesOrderItems.quantity,
        unitPrice: salesOrderItems.unitPrice,
        isPacked: salesOrderItems.isPacked,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        colorName: colors.name,
        capitalPrice: detailProducts.capitalPrice,
        boxWeightKg: products.boxDimensionWeight,
        productWeightKg: products.productDimensionWeight,
      })
      .from(salesOrderItems)
      .innerJoin(
        detailProducts,
        eq(salesOrderItems.detailProductId, detailProducts.id),
      )
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .innerJoin(colors, eq(detailProducts.colorId, colors.id))
      .where(
        and(
          inArray(salesOrderItems.salesOrderId, orderIds),
          isNull(salesOrderItems.deletedAt),
        ),
      )
      .orderBy(asc(salesOrderItems.createdAt));
  }

  async findOrderById(id: string): Promise<OrderDetailRow | null> {
    const rows = await db
      .select({
        ...ORDER_LIST_SELECTION,
        customerTotalSpend: customers.lifetimeValue,
        paymentMethod: salesOrders.paymentMethod,
        note: salesOrders.note,
      })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(and(...this.baseConditions(), eq(salesOrders.id, id)));
    const row = rows[0];
    if (!row) {
      return null;
    }
    return { ...row, customerTotalSpend: row.customerTotalSpend ?? 0 };
  }

  /** Guard array kosong. Dipakai invoice & shipping label supaya 1 query, bukan N. */
  async findOrdersByIds(ids: string[]): Promise<OrderDetailRow[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await db
      .select({
        ...ORDER_LIST_SELECTION,
        customerTotalSpend: customers.lifetimeValue,
        paymentMethod: salesOrders.paymentMethod,
        note: salesOrders.note,
      })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(and(...this.baseConditions(), inArray(salesOrders.id, ids)));
    return rows.map((row) => ({
      ...row,
      customerTotalSpend: row.customerTotalSpend ?? 0,
    }));
  }

  async countByStatus(): Promise<Map<string, number>> {
    const rows = await db
      .select({ status: salesOrders.status, count: count() })
      .from(salesOrders)
      .where(and(...this.baseConditions()))
      .groupBy(salesOrders.status);
    return new Map(rows.map((row) => [row.status, Number(row.count)]));
  }

  async sumCompletedRevenue(): Promise<{
    revenue: number;
    completedOrders: number;
  }> {
    const rows = await db
      .select({
        revenue: sum(salesOrders.total),
        completedOrders: count(),
      })
      .from(salesOrders)
      .where(
        and(...this.baseConditions(), eq(salesOrders.status, "completed")),
      );
    const row = rows[0];
    return {
      revenue: Number(row?.revenue ?? 0),
      completedOrders: Number(row?.completedOrders ?? 0),
    };
  }

  /** Filter `salesOrderId` wajib — mencegah user menandai item milik order lain. */
  async findItemById(
    itemId: string,
    orderId: string,
  ): Promise<OrderItemRow | null> {
    const rows = await db
      .select({
        id: salesOrderItems.id,
        salesOrderId: salesOrderItems.salesOrderId,
        detailProductId: salesOrderItems.detailProductId,
        quantity: salesOrderItems.quantity,
        unitPrice: salesOrderItems.unitPrice,
        isPacked: salesOrderItems.isPacked,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        colorName: colors.name,
        capitalPrice: detailProducts.capitalPrice,
        boxWeightKg: products.boxDimensionWeight,
        productWeightKg: products.productDimensionWeight,
      })
      .from(salesOrderItems)
      .innerJoin(
        detailProducts,
        eq(salesOrderItems.detailProductId, detailProducts.id),
      )
      .innerJoin(products, eq(detailProducts.productId, products.id))
      .innerJoin(colors, eq(detailProducts.colorId, colors.id))
      .where(
        and(
          eq(salesOrderItems.id, itemId),
          eq(salesOrderItems.salesOrderId, orderId),
          isNull(salesOrderItems.deletedAt),
        ),
      );
    return rows[0] ?? null;
  }

  async updateItemPacked(
    itemId: string,
    isPacked: boolean,
    tx?: Tx,
  ): Promise<void> {
    await (tx ?? db)
      .update(salesOrderItems)
      .set(stampUpdate({ isPacked }))
      .where(eq(salesOrderItems.id, itemId));
  }

  async updateOrder(
    id: string,
    data: Partial<
      Pick<
        SalesOrder,
        | "status"
        | "trackingNumber"
        | "deliveryDate"
        | "deliveryTimeSlot"
        | "deliveryNotes"
        | "note"
      >
    >,
    tx: DbOrTx = db,
  ): Promise<SalesOrder> {
    const result = await tx
      .update(salesOrders)
      .set(stampUpdate(data))
      .where(eq(salesOrders.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update sales order");
    }
    return row;
  }
}
