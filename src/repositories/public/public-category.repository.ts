import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { categories } from "../../models/category.model";
import { roomTypes } from "../../models/room-type.model";
import { db } from "../../utils/db";

interface ListRoomTypesFilter {
  roomTypeSlug?: string;
  page: number;
  limit: number;
}

export class PublicCategoryRepository {
  /**
   * Room type berpaginasi. `room_types` tidak punya kolom status (lihat
   * model), jadi filter publiknya cukup `deleted_at IS NULL` (issue #98 §1.5).
   * Slug yang tidak ditemukan menghasilkan list kosong (total 0), bukan error
   * — keputusan §7.2, endpoint ini adalah list.
   */
  async listRoomTypes(filter: ListRoomTypesFilter) {
    const conditions = [isNull(roomTypes.deletedAt)];
    if (filter.roomTypeSlug) {
      conditions.push(eq(roomTypes.slug, filter.roomTypeSlug));
    }
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(roomTypes)
      .where(where)
      .orderBy(asc(roomTypes.roomType))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(roomTypes)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /** Semua kategori published milik sekumpulan room type, dalam satu query. */
  async listCategoriesByRoomTypeIds(roomTypeIds: string[]) {
    if (roomTypeIds.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(categories)
      .where(
        and(
          inArray(categories.roomTypeId, roomTypeIds),
          isNull(categories.deletedAt),
          eq(categories.status, "published"),
        ),
      )
      .orderBy(asc(categories.order), asc(categories.category));
  }
}
