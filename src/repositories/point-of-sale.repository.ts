import { and, asc, eq, ilike, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { categories } from "../models/category.model";
import { colors } from "../models/color.model";
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

type DbOrTx = typeof db | Tx;

export interface ActiveVariantRow {
  id: string;
  sku: string;
  price: number;
  capitalPrice: number;
  productName: string;
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

export class PointOfSaleRepository {
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

  /** Validasi varian: hanya varian aktif beserta induk yang juga aktif. Guard array kosong. */
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
      conditions.push(ilike(detailProducts.detailProductSku, `%${filter.sku}%`));
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
}
