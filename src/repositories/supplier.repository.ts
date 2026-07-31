import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { purchaseOrders } from "../models/purchase-order.model";
import {
  type NewSupplier,
  type Supplier,
  suppliers,
} from "../models/supplier.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

interface ListSuppliersFilter {
  search?: string;
  page: number;
  limit: number;
}

export class SupplierRepository {
  async findById(id: string): Promise<Supplier | undefined> {
    const result = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    filter: ListSuppliersFilter,
  ): Promise<{ rows: Supplier[]; total: number }> {
    const conditions: SQL[] = [isNull(suppliers.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(suppliers.name, pattern),
          ilike(suppliers.contactPerson, pattern),
          ilike(suppliers.email, pattern),
          ilike(suppliers.phone, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(desc(suppliers.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async create(data: NewSupplier): Promise<Supplier> {
    const result = await db
      .insert(suppliers)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create supplier");
    }
    return row;
  }

  async update(id: string, data: Partial<NewSupplier>): Promise<Supplier> {
    const result = await db
      .update(suppliers)
      .set(stampUpdate(data))
      .where(eq(suppliers.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update supplier");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db.update(suppliers).set(stampDelete()).where(eq(suppliers.id, id));
  }

  /** Jumlah supplier aktif (belum di-soft-delete), dipakai /purchase-orders/stats. */
  async countActive(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(isNull(suppliers.deletedAt));
    return Number(result[0]?.count ?? 0);
  }

  /** Jumlah PO aktif milik supplier ini, dipakai untuk memblokir delete supplier. */
  async countActivePurchaseOrdersBySupplier(
    supplierId: string,
  ): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          isNull(purchaseOrders.deletedAt),
        ),
      );
    return Number(result[0]?.count ?? 0);
  }
}
