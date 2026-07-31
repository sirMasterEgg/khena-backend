import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type DetailProduct,
  detailProducts,
  products,
} from "../models/product.model";
import {
  type NewPurchaseOrder,
  type NewPurchaseOrderItem,
  type PurchaseOrder,
  purchaseOrderItems,
  purchaseOrders,
} from "../models/purchase-order.model";
import { suppliers } from "../models/supplier.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export interface PurchaseOrderWithSupplierName extends PurchaseOrder {
  supplierName: string;
}

export interface PurchaseOrderItemDetail {
  detailProductId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface ListPurchaseOrdersFilter {
  search?: string;
  status?: string;
  page: number;
  limit: number;
}

/** Subquery: jumlah baris item aktif per PO, dipakai untuk kolom `totalItems` di list. */
const itemCounts = db
  .select({
    purchaseOrderId: purchaseOrderItems.purchaseOrderId,
    totalItems: sql<number>`count(*)`.as("total_items"),
  })
  .from(purchaseOrderItems)
  .where(isNull(purchaseOrderItems.deletedAt))
  .groupBy(purchaseOrderItems.purchaseOrderId)
  .as("ic");

export class PurchaseOrderRepository {
  async findById(id: string): Promise<PurchaseOrder | undefined> {
    const result = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), isNull(purchaseOrders.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findDetailById(
    id: string,
  ): Promise<PurchaseOrderWithSupplierName | undefined> {
    const rows = await db
      .select({ order: purchaseOrders, supplierName: suppliers.name })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(and(eq(purchaseOrders.id, id), isNull(purchaseOrders.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { ...row.order, supplierName: row.supplierName };
  }

  async findItemsByOrderId(
    id: string,
    tx: DbOrTx = db,
  ): Promise<PurchaseOrderItemDetail[]> {
    const rows = await tx
      .select({
        detailProductId: purchaseOrderItems.detailProductId,
        sku: detailProducts.detailProductSku,
        productName: products.name,
        quantity: purchaseOrderItems.quantity,
        unitPrice: purchaseOrderItems.unitPrice,
      })
      .from(purchaseOrderItems)
      .innerJoin(
        detailProducts,
        eq(detailProducts.id, purchaseOrderItems.detailProductId),
      )
      .innerJoin(products, eq(products.id, detailProducts.productId))
      .where(
        and(
          eq(purchaseOrderItems.purchaseOrderId, id),
          isNull(purchaseOrderItems.deletedAt),
        ),
      );
    return rows;
  }

  async list(filter: ListPurchaseOrdersFilter): Promise<{
    rows: (PurchaseOrderWithSupplierName & { totalItems: number })[];
    total: number;
  }> {
    const conditions: SQL[] = [isNull(purchaseOrders.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(purchaseOrders.invoiceNumber, pattern),
          ilike(suppliers.name, pattern),
        ) as SQL,
      );
    }
    if (filter.status) {
      conditions.push(eq(purchaseOrders.status, filter.status));
    }
    const where = and(...conditions);

    const rows = await db
      .select({
        order: purchaseOrders,
        supplierName: suppliers.name,
        totalItems: sql<number>`coalesce(${itemCounts.totalItems}, 0)`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(itemCounts, eq(itemCounts.purchaseOrderId, purchaseOrders.id))
      .where(where)
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return {
      rows: rows.map((r) => ({
        ...r.order,
        supplierName: r.supplierName,
        totalItems: Number(r.totalItems),
      })),
      total,
    };
  }

  async create(
    data: NewPurchaseOrder,
    tx: DbOrTx = db,
  ): Promise<PurchaseOrder> {
    const result = await tx
      .insert(purchaseOrders)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create purchase order");
    }
    return row;
  }

  /** Bulk insert item PO. Array kosong menghasilkan SQL tidak valid, jadi guard di sini. */
  async insertItems(
    rows: NewPurchaseOrderItem[],
    tx: DbOrTx = db,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.insert(purchaseOrderItems).values(rows.map(stampCreate));
  }

  async update(
    id: string,
    data: Partial<NewPurchaseOrder>,
    tx: DbOrTx = db,
  ): Promise<PurchaseOrder> {
    const result = await tx
      .update(purchaseOrders)
      .set(stampUpdate(data))
      .where(eq(purchaseOrders.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update purchase order");
    }
    return row;
  }

  async softDelete(id: string, tx: DbOrTx = db): Promise<void> {
    await tx
      .update(purchaseOrders)
      .set(stampDelete())
      .where(eq(purchaseOrders.id, id));
  }

  async softDeleteItemsByOrderId(id: string, tx: DbOrTx = db): Promise<void> {
    await tx
      .update(purchaseOrderItems)
      .set(stampDelete())
      .where(eq(purchaseOrderItems.purchaseOrderId, id));
  }

  /**
   * Nomor invoice tertinggi untuk prefix bulan tsb. TANPA filter deleted_at —
   * nomor invoice PO yang sudah dihapus tidak boleh dipakai ulang.
   */
  async findMaxInvoiceNumberForPrefix(
    prefix: string,
    tx: DbOrTx = db,
  ): Promise<string | null> {
    const result = await tx
      .select({ max: sql<string | null>`max(${purchaseOrders.invoiceNumber})` })
      .from(purchaseOrders)
      .where(ilike(purchaseOrders.invoiceNumber, `${prefix}%`));
    return result[0]?.max ?? null;
  }

  /** Validasi produk: hanya detail product aktif. Guard array kosong. */
  async findActiveDetailProductsByIds(ids: string[]): Promise<DetailProduct[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(detailProducts)
      .where(
        and(inArray(detailProducts.id, ids), isNull(detailProducts.deletedAt)),
      );
  }

  async stats(): Promise<{ onOrder: number; onOrderValue: number }> {
    const result = await db
      .select({
        onOrder: sql<number>`count(*) filter (where ${purchaseOrders.status} = 'ordered')`,
        onOrderValue: sql<
          string | null
        >`sum(${purchaseOrders.totalAmount}) filter (where ${purchaseOrders.status} = 'ordered')`,
      })
      .from(purchaseOrders)
      .where(isNull(purchaseOrders.deletedAt));
    const row = result[0];

    return {
      onOrder: Number(row?.onOrder ?? 0),
      onOrderValue: row?.onOrderValue ? Number(row.onOrderValue) : 0,
    };
  }
}
