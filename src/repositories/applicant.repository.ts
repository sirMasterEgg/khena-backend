import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { applicants } from "../models/applicant.model";
import { departments } from "../models/department.model";
import { employmentTypes } from "../models/employment-type.model";
import { externalAttachments } from "../models/external-attachment.model";
import { jobs } from "../models/job.model";
import { db } from "../utils/db";

interface ListApplicantsFilter {
  jobId?: string;
  departmentId?: string;
  employmentTypeId?: string;
  page: number;
  limit: number;
}

/** Satu baris applicant beserta kolom hasil join job/department/attachment. */
export interface ApplicantWithRelations {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  jobId: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  employmentTypeId: string | null;
  employmentTypeName: string | null;
  cvId: string | null;
  cvObjectKey: string | null;
  cvStorageProvider: string | null;
  cvBucket: string | null;
}

/** Bentuk minimal untuk keperluan DELETE (lihat findByIdWithCv). */
export interface ApplicantWithCv {
  id: string;
  cvId: string | null;
  cvObjectKey: string | null;
  cvStorageProvider: string | null;
}

export class ApplicantRepository {
  async list(
    filter: ListApplicantsFilter,
  ): Promise<{ rows: ApplicantWithRelations[]; total: number }> {
    const conditions: SQL[] = [];
    if (filter.jobId) {
      conditions.push(eq(jobs.id, filter.jobId));
    }
    if (filter.departmentId) {
      conditions.push(eq(jobs.departmentId, filter.departmentId));
    }
    if (filter.employmentTypeId) {
      conditions.push(eq(jobs.employmentTypeId, filter.employmentTypeId));
    }
    // `and()` dengan array kosong menghasilkan undefined → tanpa WHERE.
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: applicants.id,
        name: applicants.name,
        email: applicants.email,
        createdAt: applicants.createdAt,
        jobId: jobs.id,
        jobTitle: jobs.jobTitle,
        departmentId: jobs.departmentId,
        departmentName: departments.name,
        employmentTypeId: jobs.employmentTypeId,
        employmentTypeName: employmentTypes.name,
        cvId: externalAttachments.id,
        cvObjectKey: externalAttachments.objectKey,
        cvStorageProvider: externalAttachments.storageProvider,
        cvBucket: externalAttachments.bucket,
      })
      .from(applicants)
      .leftJoin(jobs, eq(applicants.jobsId, jobs.id))
      .leftJoin(departments, eq(jobs.departmentId, departments.id))
      .leftJoin(employmentTypes, eq(jobs.employmentTypeId, employmentTypes.id))
      .leftJoin(externalAttachments, eq(applicants.cv, externalAttachments.id))
      .where(where)
      .orderBy(desc(applicants.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    // Query count ikut join `jobs` karena kondisi filter menyentuh kolomnya.
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(applicants)
      .leftJoin(jobs, eq(applicants.jobsId, jobs.id))
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /**
   * Ambil satu applicant beserta info CV-nya. Dipakai DELETE untuk tahu
   * objectKey mana yang harus dihapus dari storage.
   */
  async findByIdWithCv(id: string): Promise<ApplicantWithCv | undefined> {
    const result = await db
      .select({
        id: applicants.id,
        cvId: externalAttachments.id,
        cvObjectKey: externalAttachments.objectKey,
        cvStorageProvider: externalAttachments.storageProvider,
      })
      .from(applicants)
      .leftJoin(externalAttachments, eq(applicants.cv, externalAttachments.id))
      .where(eq(applicants.id, id))
      .limit(1);
    return result[0];
  }

  /**
   * Hard delete applicant + baris attachment-nya dalam satu transaksi.
   * Urutan penting: baris applicants dulu, karena `applicants.cv` punya
   * foreign key ke `external_attachments.id`.
   */
  async deleteWithAttachment(id: string, attachmentId: string | null) {
    await db.transaction(async (tx) => {
      await tx.delete(applicants).where(eq(applicants.id, id));
      if (attachmentId) {
        await tx
          .delete(externalAttachments)
          .where(eq(externalAttachments.id, attachmentId));
      }
    });
  }
}
