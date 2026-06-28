import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  type NewRoomType,
  type RoomType,
  roomTypes,
} from "../models/room-type.model";
import { db } from "../utils/db";

export class RoomTypeRepository {
  async create(data: NewRoomType): Promise<RoomType> {
    const result = await db.insert(roomTypes).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create room type");
    }
    return row;
  }

  async findById(id: string): Promise<RoomType | undefined> {
    const result = await db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.id, id), isNull(roomTypes.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    page: number,
    limit: number,
  ): Promise<{ rows: RoomType[]; total: number }> {
    const rows = await db
      .select()
      .from(roomTypes)
      .where(isNull(roomTypes.deletedAt))
      .orderBy(desc(roomTypes.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(roomTypes)
      .where(isNull(roomTypes.deletedAt));
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async softDelete(id: string): Promise<void> {
    await db
      .update(roomTypes)
      .set({ deletedAt: new Date() })
      .where(eq(roomTypes.id, id));
  }
}
