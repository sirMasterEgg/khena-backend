import { and, asc, eq, isNull } from "drizzle-orm";
import { type Department, departments } from "../models/department.model";
import { db } from "../utils/db";

export class DepartmentRepository {
  async list(): Promise<Department[]> {
    return await db
      .select()
      .from(departments)
      .where(isNull(departments.deletedAt))
      .orderBy(asc(departments.name));
  }

  /** Dipakai service Jobs untuk memvalidasi FK. */
  async findById(id: string): Promise<Department | undefined> {
    const result = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
      .limit(1);
    return result[0];
  }
}
