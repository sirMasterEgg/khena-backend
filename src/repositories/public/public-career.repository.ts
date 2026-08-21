import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { departments } from "../../models/department.model";
import { employmentTypes } from "../../models/employment-type.model";
import { jobs } from "../../models/job.model";
import { db } from "../../utils/db";

/** UUID v4/v7 — dipakai membedakan `:id` (uuid) vs slug di GET /careers/:id. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface ListCareersFilter {
  page: number;
  limit: number;
}

export class PublicCareerRepository {
  private readonly baseSelection = {
    ...getTableColumns(jobs),
    departmentName: departments.name,
    employmentTypeName: employmentTypes.name,
  };

  async list(filter: ListCareersFilter) {
    const where = and(isNull(jobs.deletedAt), eq(jobs.status, "open"));

    const rows = await db
      .select(this.baseSelection)
      .from(jobs)
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .leftJoin(employmentTypes, eq(jobs.employmentTypeId, employmentTypes.id))
      .where(where)
      .orderBy(desc(jobs.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /** `:id` menerima UUID atau slug (issue #98 §12.2) — keduanya hanya job `open`. */
  async findOpenByIdOrSlug(idOrSlug: string) {
    const matcher = isUuid(idOrSlug)
      ? eq(jobs.id, idOrSlug)
      : eq(jobs.slug, idOrSlug);

    const result = await db
      .select(this.baseSelection)
      .from(jobs)
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .leftJoin(employmentTypes, eq(jobs.employmentTypeId, employmentTypes.id))
      .where(and(matcher, isNull(jobs.deletedAt), eq(jobs.status, "open")))
      .limit(1);
    return result[0];
  }

  /** Dipakai POST /careers/apply — `jobId` hanya menerima UUID, harus `open`. */
  async findOpenById(id: string) {
    const result = await db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.id, id), isNull(jobs.deletedAt), eq(jobs.status, "open")),
      )
      .limit(1);
    return result[0];
  }
}
