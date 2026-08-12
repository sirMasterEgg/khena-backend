import { and, asc, eq, isNull } from "drizzle-orm";
import {
  type EmploymentType,
  employmentTypes,
} from "../models/employment-type.model";
import { db } from "../utils/db";

export class EmploymentTypeRepository {
  async list(): Promise<EmploymentType[]> {
    return await db
      .select()
      .from(employmentTypes)
      .where(isNull(employmentTypes.deletedAt))
      .orderBy(asc(employmentTypes.name));
  }

  /** Dipakai service Jobs untuk memvalidasi FK. */
  async findById(id: string): Promise<EmploymentType | undefined> {
    const result = await db
      .select()
      .from(employmentTypes)
      .where(and(eq(employmentTypes.id, id), isNull(employmentTypes.deletedAt)))
      .limit(1);
    return result[0];
  }
}
