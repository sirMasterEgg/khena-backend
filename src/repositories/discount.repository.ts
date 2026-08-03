import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { categories } from "../models/category.model";
import { collections } from "../models/collection.model";
import { customers } from "../models/customer.model";
import {
  type Discount,
  discounts,
  type NewDiscount,
} from "../models/discount.model";
import { products } from "../models/product.model";
import { salesOrders } from "../models/sales-order.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

export type EntityTargetType =
  | "collection"
  | "product"
  | "category"
  | "customer";

interface ListDiscountsFilter {
  search?: string;
  status?: "active" | "inactive" | "scheduled" | "expired";
  page: number;
  limit: number;
  now: Date;
}

export interface DiscountListRow extends Discount {
  used: number;
}

export interface DiscountStatusCounts {
  all: number;
  active: number;
  scheduled: number;
  expired: number;
  inactive: number;
}

export interface DiscountStatsRow {
  totalActiveDiscounts: number;
  totalRedemptions: number;
  totalRevenueImpact: number;
  totalExpiringSoon: number;
  statusCounts: DiscountStatusCounts;
}

/** Subquery: berapa kali satu kode dipakai, dipakai untuk kolom `used` di list. */
const usedCount = sql<number>`(
  select count(*) from ${salesOrders}
  where ${salesOrders.discountId} = ${discounts.id}
    and ${salesOrders.deletedAt} is null
)`.as("used_count");

export class DiscountRepository {
  async findById(id: string): Promise<Discount | undefined> {
    const result = await db
      .select()
      .from(discounts)
      .where(and(eq(discounts.id, id), isNull(discounts.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByCode(
    code: string,
    excludeId?: string,
  ): Promise<Discount | undefined> {
    const conditions: SQL[] = [
      eq(discounts.code, code),
      isNull(discounts.deletedAt),
    ];
    if (excludeId) {
      conditions.push(sql`${discounts.id} != ${excludeId}`);
    }
    const result = await db
      .select()
      .from(discounts)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async list(
    filter: ListDiscountsFilter,
  ): Promise<{ rows: DiscountListRow[]; total: number }> {
    const conditions: SQL[] = [isNull(discounts.deletedAt)];
    if (filter.search) {
      conditions.push(ilike(discounts.code, `%${filter.search}%`));
    }
    if (filter.status === "active") {
      conditions.push(
        eq(discounts.status, "active"),
        lte(discounts.startDate, filter.now),
        gte(discounts.endDate, filter.now),
      );
    } else if (filter.status === "scheduled") {
      conditions.push(
        eq(discounts.status, "active"),
        sql`${discounts.startDate} > ${filter.now}`,
      );
    } else if (filter.status === "expired") {
      conditions.push(
        eq(discounts.status, "active"),
        sql`${discounts.endDate} < ${filter.now}`,
      );
    } else if (filter.status === "inactive") {
      conditions.push(eq(discounts.status, "inactive"));
    }
    const where = and(...conditions);

    const rows = await db
      .select({ discount: discounts, used: usedCount })
      .from(discounts)
      .where(where)
      .orderBy(desc(discounts.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(discounts)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return {
      rows: rows.map((r) => ({ ...r.discount, used: Number(r.used) })),
      total,
    };
  }

  async countUsage(discountId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.discountId, discountId),
          isNull(salesOrders.deletedAt),
        ),
      );
    return Number(result[0]?.count ?? 0);
  }

  async create(data: NewDiscount): Promise<Discount> {
    const result = await db
      .insert(discounts)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create discount");
    }
    return row;
  }

  async update(id: string, data: Partial<NewDiscount>): Promise<Discount> {
    const result = await db
      .update(discounts)
      .set(stampUpdate(data))
      .where(eq(discounts.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update discount");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db.update(discounts).set(stampDelete()).where(eq(discounts.id, id));
  }

  async stats(now: Date): Promise<DiscountStatsRow> {
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      activeResult,
      expiringResult,
      redemptionResult,
      revenueResult,
      statusCountsResult,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(discounts)
        .where(
          and(
            isNull(discounts.deletedAt),
            eq(discounts.status, "active"),
            lte(discounts.startDate, now),
            gte(discounts.endDate, now),
            or(
              isNull(discounts.usageLimit),
              sql`${discounts.usageLimit} > (
                  select count(*) from ${salesOrders}
                  where ${salesOrders.discountId} = ${discounts.id}
                    and ${salesOrders.deletedAt} is null
                )`,
            ) as SQL,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(discounts)
        .where(
          and(
            isNull(discounts.deletedAt),
            eq(discounts.status, "active"),
            gte(discounts.endDate, now),
            lte(discounts.endDate, sevenDaysFromNow),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(salesOrders)
        .where(
          and(
            sql`${salesOrders.discountId} is not null`,
            isNull(salesOrders.deletedAt),
          ),
        ),
      db
        .select({
          sum: sql<string | null>`sum(${salesOrders.discountAmount})`,
        })
        .from(salesOrders)
        .where(
          and(
            sql`${salesOrders.discountId} is not null`,
            isNull(salesOrders.deletedAt),
            // orderDate adalah kolom `date`, dibandingkan dengan sql template
            // supaya tidak bentrok dengan tipe string yang diharapkan gte().
            sql`${salesOrders.orderDate} >= ${thirtyDaysAgo}`,
          ),
        ),
      // Sebaran status turunan (bagian 3.1 / 6.4) di antara baris aktif —
      // dipakai untuk tab/filter status di dashboard.
      db
        .select({
          all: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where ${discounts.status} = 'active' and ${discounts.startDate} <= ${now} and ${discounts.endDate} >= ${now})`,
          scheduled: sql<number>`count(*) filter (where ${discounts.status} = 'active' and ${discounts.startDate} > ${now})`,
          expired: sql<number>`count(*) filter (where ${discounts.status} = 'active' and ${discounts.endDate} < ${now})`,
          inactive: sql<number>`count(*) filter (where ${discounts.status} = 'inactive')`,
        })
        .from(discounts)
        .where(isNull(discounts.deletedAt)),
    ]);

    const statusCountsRow = statusCountsResult[0];

    return {
      totalActiveDiscounts: Number(activeResult[0]?.count ?? 0),
      totalExpiringSoon: Number(expiringResult[0]?.count ?? 0),
      totalRedemptions: Number(redemptionResult[0]?.count ?? 0),
      totalRevenueImpact: Number(revenueResult[0]?.sum ?? 0),
      statusCounts: {
        all: Number(statusCountsRow?.all ?? 0),
        active: Number(statusCountsRow?.active ?? 0),
        scheduled: Number(statusCountsRow?.scheduled ?? 0),
        expired: Number(statusCountsRow?.expired ?? 0),
        inactive: Number(statusCountsRow?.inactive ?? 0),
      },
    };
  }

  /** Lookup polymorphic: cek target ada + ambil namanya sekaligus. */
  async findTargetName(
    type: EntityTargetType,
    id: string,
  ): Promise<string | null> {
    switch (type) {
      case "collection": {
        const r = await db
          .select({ name: collections.name })
          .from(collections)
          .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
          .limit(1);
        return r[0]?.name ?? null;
      }
      case "product": {
        const r = await db
          .select({ name: products.name })
          .from(products)
          .where(and(eq(products.id, id), isNull(products.deletedAt)))
          .limit(1);
        return r[0]?.name ?? null;
      }
      case "category": {
        const r = await db
          .select({ name: categories.category })
          .from(categories)
          .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
          .limit(1);
        return r[0]?.name ?? null;
      }
      case "customer": {
        const r = await db
          .select({ name: customers.name })
          .from(customers)
          .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
          .limit(1);
        return r[0]?.name ?? null;
      }
    }
  }
}
