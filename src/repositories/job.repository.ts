import {
  and,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { departments } from "../models/department.model";
import { employmentTypes } from "../models/employment-type.model";
import { type Job, jobs, type NewJob } from "../models/job.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

interface ListJobsFilter {
  search?: string;
  page: number;
  limit: number;
}

/** Baris job beserta nama relasinya, hasil join. */
export interface JobWithRelations extends Job {
  departmentName: string | null;
  employmentTypeName: string | null;
}

export class JobRepository {
  async create(data: NewJob): Promise<Job> {
    const result = await db.insert(jobs).values(stampCreate(data)).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create job");
    }
    return row;
  }

  async findById(id: string): Promise<Job | undefined> {
    const result = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), isNull(jobs.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByIdWithRelations(
    id: string,
  ): Promise<JobWithRelations | undefined> {
    const result = await db
      .select({
        ...getTableColumns(jobs),
        departmentName: departments.name,
        employmentTypeName: employmentTypes.name,
      })
      .from(jobs)
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .leftJoin(employmentTypes, eq(jobs.employmentTypeId, employmentTypes.id))
      .where(and(eq(jobs.id, id), isNull(jobs.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    filter: ListJobsFilter,
  ): Promise<{ rows: JobWithRelations[]; total: number }> {
    const conditions: SQL[] = [isNull(jobs.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(jobs.jobTitle, pattern),
          ilike(jobs.location, pattern),
          ilike(departments.name, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select({
        ...getTableColumns(jobs),
        departmentName: departments.name,
        employmentTypeName: employmentTypes.name,
      })
      .from(jobs)
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .leftJoin(employmentTypes, eq(jobs.employmentTypeId, employmentTypes.id))
      .where(where)
      .orderBy(desc(jobs.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    // Join department juga di query count karena kondisi search bisa
    // menyentuh kolom departments.name.
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /** Ringkasan jumlah job per status, dipakai GET /jobs/summary. */
  async stats(): Promise<{
    total: number;
    open: number;
    closed: number;
    draft: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`count(*)`,
        open: sql<number>`count(*) filter (where ${jobs.status} = 'open')`,
        closed: sql<number>`count(*) filter (where ${jobs.status} = 'closed')`,
        draft: sql<number>`count(*) filter (where ${jobs.status} = 'draft')`,
      })
      .from(jobs)
      .where(isNull(jobs.deletedAt));
    const row = result[0];

    return {
      total: Number(row?.total ?? 0),
      open: Number(row?.open ?? 0),
      closed: Number(row?.closed ?? 0),
      draft: Number(row?.draft ?? 0),
    };
  }

  async update(id: string, data: Partial<NewJob>): Promise<Job> {
    const result = await db
      .update(jobs)
      .set(stampUpdate(data))
      .where(eq(jobs.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update job");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db.update(jobs).set(stampDelete()).where(eq(jobs.id, id));
  }
}
