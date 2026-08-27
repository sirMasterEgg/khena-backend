import type { PublicApplicantRepository } from "../repositories/public/public-applicant.repository";
import type { PublicCareerRepository } from "../repositories/public/public-career.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { PublicAttachmentService } from "./public-attachment.service";

interface ListPublicCareersInput {
  page: number;
  limit: number;
}

interface ApplyAttachment {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
}

interface ApplyToCareerInput {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  message?: string;
  attachment?: ApplyAttachment;
}

export class PublicCareerService {
  constructor(
    private readonly repo: PublicCareerRepository,
    private readonly applicantRepo: PublicApplicantRepository,
    private readonly attachmentService: PublicAttachmentService,
  ) {}

  private toListItem(row: {
    id: string;
    slug: string;
    jobTitle: string;
    departmentId: string;
    departmentName: string | null;
    employmentTypeId: string;
    employmentTypeName: string | null;
    location: string;
  }) {
    return {
      id: row.id,
      slug: row.slug,
      positionTitle: row.jobTitle,
      employmentType: {
        id: row.employmentTypeId,
        name: row.employmentTypeName ?? "",
      },
      department: { id: row.departmentId, name: row.departmentName ?? "" },
      location: row.location,
    };
  }

  async listCareers(input: ListPublicCareersInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({ page, limit });
    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCareerDetail(idOrSlug: string) {
    const row = await this.repo.findOpenByIdOrSlug(idOrSlug);
    if (!row) {
      throw new NotFoundError("job not found");
    }
    return {
      ...this.toListItem(row),
      roleDescription: row.roleDescription,
      requirements: row.requirements,
      benefits: row.benefits,
    };
  }

  async applyToCareer(input: ApplyToCareerInput): Promise<{ message: string }> {
    const job = await this.repo.findOpenById(input.jobId);
    if (!job) {
      throw new NotFoundError("job not found");
    }

    const cvId = input.attachment
      ? await this.attachmentService.upload(input.attachment, "applicants")
      : undefined;

    const created = await this.applicantRepo.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      applicantDescription: input.message,
      jobsId: input.jobId,
      cv: cvId,
    });

    logger.info(
      { applicantId: created.id, jobId: input.jobId },
      "public career application submitted",
    );
    return { message: "application sent successfully" };
  }
}
