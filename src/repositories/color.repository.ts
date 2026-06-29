import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { type Color, colors, type NewColor } from "../models/color.model";
import { type Finish, finishes } from "../models/finish.model";
import { type Media, media } from "../models/media.model";
import { db } from "../utils/db";

export class ColorRepository {
  async create(data: NewColor): Promise<Color> {
    const result = await db.insert(colors).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create color");
    }
    return row;
  }

  async findById(id: string): Promise<Color | undefined> {
    const result = await db
      .select()
      .from(colors)
      .where(and(eq(colors.id, id), isNull(colors.deletedAt)))
      .limit(1);
    return result[0];
  }

  async update(id: string, data: Partial<NewColor>): Promise<Color> {
    const result = await db
      .update(colors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(colors.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update color");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db
      .update(colors)
      .set({ deletedAt: new Date() })
      .where(eq(colors.id, id));
  }

  async list(
    page: number,
    limit: number,
  ): Promise<{ rows: Color[]; total: number }> {
    const rows = await db
      .select()
      .from(colors)
      .where(isNull(colors.deletedAt))
      .orderBy(desc(colors.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(colors)
      .where(isNull(colors.deletedAt));
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async findFinishById(id: string): Promise<Finish | undefined> {
    const result = await db
      .select()
      .from(finishes)
      .where(and(eq(finishes.id, id), isNull(finishes.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findMediaById(id: string): Promise<Media | undefined> {
    const result = await db
      .select()
      .from(media)
      .where(and(eq(media.id, id), isNull(media.deletedAt)))
      .limit(1);
    return result[0];
  }
}
