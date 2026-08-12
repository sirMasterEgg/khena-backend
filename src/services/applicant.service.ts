import type {
  ApplicantRepository,
  ApplicantWithRelations,
} from "../repositories/applicant.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";
import { createStorageStrategy } from "./storage/storage.factory";

interface ListApplicantsInput {
  departmentId?: string;
  employmentTypeId?: string;
  page: number;
  limit: number;
}

export class ApplicantService {
  constructor(private readonly repo: ApplicantRepository) {}

  /** Mapping seragam baris DB (hasil join) → bentuk response. */
  private toApplicantResponse(row: ApplicantWithRelations) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      jobs: row.jobId
        ? {
            id: row.jobId,
            jobTitle: row.jobTitle ?? "",
            department: {
              id: row.departmentId ?? "",
              name: row.departmentName ?? "",
            },
            employmentType: {
              id: row.employmentTypeId ?? "",
              name: row.employmentTypeName ?? "",
            },
          }
        : null,
      date: row.createdAt,
      cv:
        row.cvId && row.cvObjectKey
          ? {
              id: row.cvId,
              objectKey: row.cvObjectKey,
              storageProvider: row.cvStorageProvider ?? "",
              bucket: row.cvBucket ?? "",
              url: buildMediaUrl(row.cvObjectKey),
            }
          : null,
    };
  }

  async listApplicants(input: ListApplicantsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      departmentId: input.departmentId,
      employmentTypeId: input.employmentTypeId,
      page,
      limit,
    });

    return {
      data: rows.map((row) => this.toApplicantResponse(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Hard delete pelamar beserta file CV-nya. Beda dengan MediaService yang
   * hanya soft delete dan membiarkan objek storage — di sini file benar-benar
   * dihapus karena CV berisi data pribadi (lihat issue §6.3).
   */
  async deleteApplicant(id: string): Promise<void> {
    const existing = await this.repo.findByIdWithCv(id);
    if (!existing) {
      throw new NotFoundError("applicant not found");
    }

    // DB dulu, storage belakangan — lihat alasannya di issue §6.4.
    await this.repo.deleteWithAttachment(id, existing.cvId);
    logger.info({ applicantId: id }, "applicant deleted");

    if (!existing.cvObjectKey) {
      return;
    }

    // Baris DB sudah hilang, jadi dari sisi user operasinya sudah berhasil.
    // Kegagalan hapus objek hanya menyisakan file yatim di bucket: dicatat
    // untuk dibersihkan belakangan, bukan dijadikan error ke client.
    try {
      const storage = createStorageStrategy(
        existing.cvStorageProvider ?? undefined,
      );
      await storage.deleteObject(existing.cvObjectKey);
      logger.info(
        { applicantId: id, objectKey: existing.cvObjectKey },
        "applicant cv object deleted",
      );
    } catch (err) {
      logger.warn(
        { err, applicantId: id, objectKey: existing.cvObjectKey },
        "failed to delete applicant cv object; orphan object left in bucket",
      );
    }
  }
}
