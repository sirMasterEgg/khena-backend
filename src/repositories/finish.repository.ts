import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { type Finish, finishes, type NewFinish } from "../models/finish.model";
import { stampCreate, stampDelete } from "../utils/audit";
import { db } from "../utils/db";

export class FinishRepository {
  async create(data: NewFinish): Promise<Finish> {
    const result = await db
      .insert(finishes)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create finish");
    }
    return row;
  }

  async findById(id: string): Promise<Finish | undefined> {
    const result = await db
      .select()
      .from(finishes)
      .where(and(eq(finishes.id, id), isNull(finishes.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByName(name: string): Promise<Finish | undefined> {
    const result = await db
      .select()
      .from(finishes)
      .where(and(eq(finishes.name, name), isNull(finishes.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    page: number,
    limit: number,
  ): Promise<{ rows: Finish[]; total: number }> {
    const rows = await db
      .select()
      .from(finishes)
      .where(isNull(finishes.deletedAt))
      .orderBy(desc(finishes.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(finishes)
      .where(isNull(finishes.deletedAt));
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async softDelete(id: string): Promise<void> {
    await db.update(finishes).set(stampDelete()).where(eq(finishes.id, id));
  }
}
