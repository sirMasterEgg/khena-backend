import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type Customer,
  customers,
  type NewCustomer,
} from "../models/customer.model";
import { salesOrders } from "../models/sales-order.model";
import { stampCreate, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export type CustomerSort =
  | "ltv"
  | "totalOrder"
  | "lastOrderAt"
  | "joinedAt"
  | "name";
export type CustomerSegmentFilter = "vip" | "loyal" | "new" | "all";

interface ListCustomersFilter {
  search?: string;
  segment?: CustomerSegmentFilter;
  sort: CustomerSort;
  orderDir: "asc" | "desc";
  page: number;
  limit: number;
}

const sortColumns = {
  ltv: customers.lifetimeValue,
  totalOrder: customers.totalOrder,
  lastOrderAt: customers.lastOrderAt,
  joinedAt: customers.joinedAt,
  name: customers.name,
} as const;

/**
 * Subquery agregat: jumlah order berstatus "completed" dalam 12 bulan
 * terakhir per customer (Tahap 2). LEFT JOIN ke ini dipakai bersama oleh
 * list, detail, dan filter segment supaya definisinya tidak duplikat.
 */
const recentCompletedOrders = db
  .select({
    customerId: salesOrders.customerId,
    recentCompleted: sql<number>`count(*)`.as("recent_completed"),
  })
  .from(salesOrders)
  .where(
    and(
      eq(salesOrders.status, "completed"),
      isNull(salesOrders.deletedAt),
      sql`${salesOrders.orderDate} >= (CURRENT_DATE - INTERVAL '12 months')`,
    ),
  )
  .groupBy(salesOrders.customerId)
  .as("ro");

/** Ekspresi segment (Tahap 2). Prioritas: vip > loyal > new > regular. */
const segmentExpr = sql<string>`CASE
  WHEN ${customers.lifetimeValue} >= 100000000 THEN 'vip'
  WHEN COALESCE(${recentCompletedOrders.recentCompleted}, 0) >= 3 THEN 'loyal'
  WHEN ${customers.joinedAt} >= now() - INTERVAL '30 days' THEN 'new'
  ELSE 'regular'
END`;

export class CustomerRepository {
  async findById(id: string): Promise<Customer | undefined> {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .limit(1);
    return result[0];
  }

  /** Cari customer aktif dengan email tsb, opsional kecualikan satu id (untuk PATCH). */
  async findByEmail(
    email: string,
    excludeId?: string,
  ): Promise<Customer | undefined> {
    const conditions = [
      eq(customers.email, email),
      isNull(customers.deletedAt),
    ];
    if (excludeId) {
      conditions.push(ne(customers.id, excludeId));
    }
    const result = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  /** Cari customer aktif dengan phone tsb, opsional kecualikan satu id (untuk PATCH). */
  async findByPhone(
    phone: string,
    excludeId?: string,
  ): Promise<Customer | undefined> {
    const conditions = [
      eq(customers.phone, phone),
      isNull(customers.deletedAt),
    ];
    if (excludeId) {
      conditions.push(ne(customers.id, excludeId));
    }
    const result = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async create(data: NewCustomer, tx: DbOrTx = db): Promise<Customer> {
    const result = await tx
      .insert(customers)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create customer");
    }
    return row;
  }

  async update(
    id: string,
    data: Partial<NewCustomer>,
    tx: DbOrTx = db,
  ): Promise<Customer> {
    const result = await tx
      .update(customers)
      .set(stampUpdate(data))
      .where(eq(customers.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update customer");
    }
    return row;
  }

  /**
   * Panggil TEPAT SEKALI saat sebuah sales order bertransisi ke status
   * "completed" (dipanggil module order, belum ada di codebase ini). Update
   * atomik di SQL, bukan read-modify-write.
   */
  async recordCompletedOrder(
    customerId: string,
    orderTotal: number,
    orderDate: Date,
    tx: DbOrTx = db,
  ): Promise<void> {
    await tx
      .update(customers)
      .set(
        stampUpdate({
          totalOrder: sql`${customers.totalOrder} + 1`,
          lifetimeValue: sql`${customers.lifetimeValue} + ${orderTotal}`,
          lastOrderAt: sql`GREATEST(COALESCE(${customers.lastOrderAt}, ${orderDate}), ${orderDate})`,
        }),
      )
      .where(eq(customers.id, customerId));
  }

  async list(
    filter: ListCustomersFilter,
  ): Promise<{ rows: (Customer & { segment: string })[]; total: number }> {
    const conditions: SQL[] = [isNull(customers.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(customers.name, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
        ) as SQL,
      );
    }
    if (filter.segment && filter.segment !== "all") {
      conditions.push(sql`${segmentExpr} = ${filter.segment}`);
    }
    const where = and(...conditions);

    const sortColumn = sortColumns[filter.sort];
    const orderBy =
      filter.orderDir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await db
      .select({ customer: customers, segment: segmentExpr })
      .from(customers)
      .leftJoin(
        recentCompletedOrders,
        eq(recentCompletedOrders.customerId, customers.id),
      )
      .where(where)
      .orderBy(orderBy)
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .leftJoin(
        recentCompletedOrders,
        eq(recentCompletedOrders.customerId, customers.id),
      )
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return {
      rows: rows.map((r) => ({ ...r.customer, segment: r.segment })),
      total,
    };
  }

  async findByIdWithSegment(
    id: string,
  ): Promise<(Customer & { segment: string }) | undefined> {
    const rows = await db
      .select({ customer: customers, segment: segmentExpr })
      .from(customers)
      .leftJoin(
        recentCompletedOrders,
        eq(recentCompletedOrders.customerId, customers.id),
      )
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { ...row.customer, segment: row.segment };
  }

  /** Seluruh customer aktif beserta segment-nya, untuk export CSV (GET /customers/bulk). */
  async findAllActiveWithSegment(): Promise<
    (Customer & { segment: string })[]
  > {
    const rows = await db
      .select({ customer: customers, segment: segmentExpr })
      .from(customers)
      .leftJoin(
        recentCompletedOrders,
        eq(recentCompletedOrders.customerId, customers.id),
      )
      .where(isNull(customers.deletedAt));
    return rows.map((r) => ({ ...r.customer, segment: r.segment }));
  }

  /** Agregat customer untuk GET /customers/stats. Hanya baris aktif. */
  async stats(): Promise<{
    totalCustomers: number;
    vipCustomers: number;
    newThisMonth: number;
    avgLifetimeValue: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`count(*)`,
        vip: sql<number>`count(*) filter (where ${customers.lifetimeValue} >= 100000000)`,
        newThisMonth: sql<number>`count(*) filter (where ${customers.joinedAt} >= now() - interval '30 days')`,
        avgLtv: sql<string | null>`avg(${customers.lifetimeValue})`,
      })
      .from(customers)
      .where(isNull(customers.deletedAt));
    const row = result[0];

    return {
      totalCustomers: Number(row?.total ?? 0),
      vipCustomers: Number(row?.vip ?? 0),
      newThisMonth: Number(row?.newThisMonth ?? 0),
      avgLifetimeValue: row?.avgLtv ? Math.round(Number(row.avgLtv)) : 0,
    };
  }
}
