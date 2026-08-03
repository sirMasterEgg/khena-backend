import { and, inArray, isNull, sql } from "drizzle-orm";
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
}
