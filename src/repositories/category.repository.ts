import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type Category,
  categories,
  type NewCategory,
} from "../models/category.model";
import { roomTypes } from "../models/room-type.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

type CategorySort = "name" | "displayOrder" | "roomType" | "createdAt";

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
  name: categories.category,
  displayOrder: categories.order,
  roomType: roomTypes.roomType,
  createdAt: categories.createdAt,
} as const;

export class CategoryRepository {
  async create(data: NewCategory): Promise<Category> {
    const result = await db
      .insert(categories)
      .values(stampCreate(data))
      .returning();
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
      .select(getTableColumns(categories))
      .from(categories)
      .leftJoin(roomTypes, eq(categories.roomTypeId, roomTypes.id))
      .where(where)
      .orderBy(orderBy, asc(categories.id))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async stats(): Promise<{
    total: number;
    published: number;
    draft: number;
    roomGroups: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`count(*) filter (where ${categories.status} = 'published')`,
        draft: sql<number>`count(*) filter (where ${categories.status} = 'draft')`,
        roomGroups: sql<number>`count(distinct ${categories.roomTypeId})`,
      })
      .from(categories)
      .where(isNull(categories.deletedAt));
    const row = result[0];

    return {
      total: Number(row?.total ?? 0),
      published: Number(row?.published ?? 0),
      draft: Number(row?.draft ?? 0),
      roomGroups: Number(row?.roomGroups ?? 0),
    };
  }

  async countActiveByRoomTypeId(roomTypeId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(
        and(
          eq(categories.roomTypeId, roomTypeId),
          isNull(categories.deletedAt),
        ),
      );
    return Number(result[0]?.count ?? 0);
  }

  async update(id: string, data: Partial<NewCategory>): Promise<Category> {
    const result = await db
      .update(categories)
      .set(stampUpdate(data))
      .where(eq(categories.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update category");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db.update(categories).set(stampDelete()).where(eq(categories.id, id));
  }
}
