import type {
  InquiryRepository,
  InquiryWithAttachment,
} from "../repositories/inquiry.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";
import { createStorageStrategy } from "./storage/storage.factory";

interface ListInquiriesInput {
  read?: boolean;
  starred?: boolean;
  replied?: boolean;
  search?: string;
  page: number;
  limit: number;
}

export class InquiryService {
  constructor(private readonly repo: InquiryRepository) {}

  /** Mapping seragam baris DB (hasil join) → bentuk response. */
  private toInquiryResponse(row: InquiryWithAttachment) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      subject: row.subject,
      message: row.message,
      attachment:
        row.attachmentId && row.attachmentObjectKey
          ? {
              id: row.attachmentId,
              objectKey: row.attachmentObjectKey,
              storageProvider: row.attachmentStorageProvider ?? "",
              bucket: row.attachmentBucket ?? "",
              url: buildMediaUrl(row.attachmentObjectKey),
            }
          : null,
      readAt: row.readAt,
      starredAt: row.starredAt,
      repliedAt: row.repliedAt,
      createdAt: row.createdAt,
    };
  }

  async listInquiries(input: ListInquiriesInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      read: input.read,
      starred: input.starred,
      replied: input.replied,
      search: input.search,
      page,
      limit,
    });

    return {
      data: rows.map((row) => this.toInquiryResponse(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getInquiry(id: string) {
    const inquiry = await this.repo.findById(id);
    if (!inquiry) {
      throw new NotFoundError("inquiry not found");
    }
    return this.toInquiryResponse(inquiry);
  }

  /**
   * Set sekali, idempoten: kalau `readAt` sudah terisi, biarkan nilai lamanya
   * dan tidak ada UPDATE ke DB. Tidak ada cara membuat pesan jadi "belum
   * dibaca" lagi.
   */
  async markAsRead(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("inquiry not found");
    }
    if (existing.readAt) {
      return this.toInquiryResponse(existing);
    }
    const updated = await this.repo.markRead(id);
    if (!updated) {
      throw new NotFoundError("inquiry not found");
    }
    return this.toInquiryResponse(updated);
  }

  /** Toggle: `starredAt` null → isi `new Date()`, terisi → set `null`. */
  async toggleStar(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("inquiry not found");
    }
    const nextStarredAt = existing.starredAt ? null : new Date();
    const updated = await this.repo.toggleStar(id, nextStarredAt);
    if (!updated) {
      throw new NotFoundError("inquiry not found");
    }
    return this.toInquiryResponse(updated);
  }

  /**
   * Selalu overwrite: `repliedAt` di-set ke `new Date()` walaupun sudah
   * terisi, karena kolom ini menandai kapan terakhir dibalas dan admin bisa
   * membalas lebih dari sekali.
   */
  async markAsReplied(id: string) {
    const updated = await this.repo.markReplied(id);
    if (!updated) {
      throw new NotFoundError("inquiry not found");
    }
    return this.toInquiryResponse(updated);
  }

  /**
   * Hard delete pesan beserta lampirannya. Sama seperti
   * ApplicantService.deleteApplicant() — attachment berisi data pribadi
   * sehingga benar-benar dihapus, bukan soft delete.
   */
  async deleteInquiry(id: string): Promise<void> {
    const existing = await this.repo.findByIdWithAttachment(id);
    if (!existing) {
      throw new NotFoundError("inquiry not found");
    }

    // DB dulu, storage belakangan — lihat alasannya di issue #90.
    await this.repo.deleteWithAttachment(id, existing.attachmentId);
    logger.info({ inquiryId: id }, "inquiry deleted");

    if (!existing.attachmentObjectKey) {
      return;
    }

    // Baris DB sudah hilang, jadi dari sisi user operasinya sudah berhasil.
    // Kegagalan hapus objek hanya menyisakan file yatim di bucket: dicatat
    // untuk dibersihkan belakangan, bukan dijadikan error ke client.
    try {
      const storage = createStorageStrategy(
        existing.attachmentStorageProvider ?? undefined,
      );
      await storage.deleteObject(existing.attachmentObjectKey);
      logger.info(
        { inquiryId: id, objectKey: existing.attachmentObjectKey },
        "inquiry attachment object deleted",
      );
    } catch (err) {
      logger.warn(
        { err, inquiryId: id, objectKey: existing.attachmentObjectKey },
        "failed to delete inquiry attachment object; orphan object left in bucket",
      );
    }
  }
}
