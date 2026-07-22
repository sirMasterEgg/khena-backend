import { desc, isNull, sql } from "drizzle-orm";
import {
  type CareInstruction,
  careInstructions,
} from "../models/care-instruction.model";
import { db } from "../utils/db";

export class CareInstructionRepository {
  async list(
    page: number,
    limit: number,
  ): Promise<{ rows: CareInstruction[]; total: number }> {
    const rows = await db
      .select()
      .from(careInstructions)
      .where(isNull(careInstructions.deletedAt))
      .orderBy(desc(careInstructions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(careInstructions)
      .where(isNull(careInstructions.deletedAt));
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }
}
