import { and, asc, desc, eq, ilike, isNull, type SQL, sql } from "drizzle-orm";
import {
  type Category,
  categories,
  type NewCategory,
} from "../models/category.model";
import { db } from "../utils/db";

type CategorySort = "order" | "category" | "created_at";

interface ListCategoriesFilter {
  search?: string;
  status?: string;
  roomTypeId?: string;
  sort: CategorySort;
  orderDir: "asc" | "desc";
  page: number;
  limit: number;
}

const sortColumns = {
  order: categories.order,
  category: categories.category,
  created_at: categories.createdAt,
} as const;

export class CategoryRepository {
  async create(data: NewCategory): Promise<Category> {
    const result = await db.insert(categories).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create category");
    }
    return row;
  }

  async findById(id: string): Promise<Category | undefined> {
    const result = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    filter: ListCategoriesFilter,
  ): Promise<{ rows: Category[]; total: number }> {
    const conditions: SQL[] = [isNull(categories.deletedAt)];
    if (filter.search) {
      conditions.push(ilike(categories.category, `%${filter.search}%`));
    }
    if (filter.status) {
      conditions.push(eq(categories.status, filter.status));
    }
    if (filter.roomTypeId) {
      conditions.push(eq(categories.roomTypeId, filter.roomTypeId));
    }
    const where = and(...conditions);

    const sortColumn = sortColumns[filter.sort];
    const orderBy =
      filter.orderDir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await db
      .select()
      .from(categories)
      .where(where)
      .orderBy(orderBy)
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async update(id: string, data: Partial<NewCategory>): Promise<Category> {
    const result = await db
      .update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update category");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(eq(categories.id, id));
  }
}
