import type { NewJob } from "../models/job.model";
import type { DepartmentRepository } from "../repositories/department.repository";
import type { EmploymentTypeRepository } from "../repositories/employment-type.repository";
import type {
  JobRepository,
  JobWithRelations,
} from "../repositories/job.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateJobInput {
  jobTitle: string;
  departmentId: string;
  location: string;
  employmentTypeId: string;
  status: "open" | "closed" | "draft";
  roleDescription: string;
  requirements: string;
  benefits?: string;
}

interface UpdateJobInput {
  jobTitle?: string;
  departmentId?: string;
  location?: string;
  employmentTypeId?: string;
  status?: "open" | "closed" | "draft";
  roleDescription?: string;
  requirements?: string;
  benefits?: string | null;
}

interface ListJobsInput {
  search?: string;
  page: number;
  limit: number;
}

export class JobService {
  constructor(
    private readonly repo: JobRepository,
    private readonly departmentRepo: DepartmentRepository,
    private readonly employmentTypeRepo: EmploymentTypeRepository,
  ) {}

  /** Mapping seragam baris DB → bentuk response, dipakai di semua method publik. */
  private toJobResponse(row: JobWithRelations) {
    return {
      id: row.id,
      jobTitle: row.jobTitle,
      department: { id: row.departmentId, name: row.departmentName ?? "" },
      location: row.location,
      employmentType: {
        id: row.employmentTypeId,
        name: row.employmentTypeName ?? "",
      },
      status: row.status,
      roleDescription: row.roleDescription,
      requirements: row.requirements,
      benefits: row.benefits,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedBy: row.deletedBy,
    };
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const department = await this.departmentRepo.findById(departmentId);
    if (!department) {
      throw new NotFoundError("department not found");
    }
  }

  private async assertEmploymentTypeExists(
    employmentTypeId: string,
  ): Promise<void> {
    const employmentType =
      await this.employmentTypeRepo.findById(employmentTypeId);
    if (!employmentType) {
      throw new NotFoundError("employment type not found");
    }
  }

  async createJob(input: CreateJobInput) {
    await this.assertDepartmentExists(input.departmentId);
    await this.assertEmploymentTypeExists(input.employmentTypeId);

    const created = await this.repo.create({ ...input });
    logger.info({ jobId: created.id }, "job created");

    const row = await this.repo.findByIdWithRelations(created.id);
    // Baris pasti ada karena baru saja dibuat di atas.
    return this.toJobResponse(row as JobWithRelations);
  }

  async listJobs(input: ListJobsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      page,
      limit,
    });

    return {
      data: rows.map((row) => this.toJobResponse(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getJobDetail(id: string) {
    const row = await this.repo.findByIdWithRelations(id);
    if (!row) {
      throw new NotFoundError("job not found");
    }
    return this.toJobResponse(row);
  }

  async updateJob(id: string, input: UpdateJobInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("job not found");
    }

    if (input.departmentId !== undefined) {
      await this.assertDepartmentExists(input.departmentId);
    }
    if (input.employmentTypeId !== undefined) {
      await this.assertEmploymentTypeExists(input.employmentTypeId);
    }

    const patch: Partial<NewJob> = {};
    if (input.jobTitle !== undefined) patch.jobTitle = input.jobTitle;
    if (input.departmentId !== undefined)
      patch.departmentId = input.departmentId;
    if (input.location !== undefined) patch.location = input.location;
    if (input.employmentTypeId !== undefined)
      patch.employmentTypeId = input.employmentTypeId;
    if (input.status !== undefined) patch.status = input.status;
    if (input.roleDescription !== undefined)
      patch.roleDescription = input.roleDescription;
    if (input.requirements !== undefined)
      patch.requirements = input.requirements;
    if (input.benefits !== undefined) patch.benefits = input.benefits;

    if (Object.keys(patch).length > 0) {
      await this.repo.update(id, patch);
    }

    logger.info({ jobId: id }, "job updated");

    const row = await this.repo.findByIdWithRelations(id);
    return this.toJobResponse(row as JobWithRelations);
  }

  async deleteJob(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("job not found");
    }

    await this.repo.softDelete(id);
    logger.info({ jobId: id }, "job deleted");
  }
}
