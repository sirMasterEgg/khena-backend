import {
  and,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { externalAttachments } from "../models/external-attachment.model";
import { inquiries } from "../models/inquiry.model";
import { db } from "../utils/db";

interface ListInquiriesFilter {
  read?: boolean;
  starred?: boolean;
  replied?: boolean;
  search?: string;
  page: number;
  limit: number;
}

/** Satu baris inquiry beserta kolom hasil join attachment. */
export interface InquiryWithAttachment {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  readAt: Date | null;
  starredAt: Date | null;
  repliedAt: Date | null;
  createdAt: Date;
  attachmentId: string | null;
  attachmentObjectKey: string | null;
  attachmentStorageProvider: string | null;
  attachmentBucket: string | null;
}

/** Bentuk minimal untuk keperluan DELETE (lihat findByIdWithAttachment). */
export interface InquiryAttachmentRef {
  id: string;
  attachmentId: string | null;
  attachmentObjectKey: string | null;
  attachmentStorageProvider: string | null;
}

export class InquiryRepository {
  async list(
    filter: ListInquiriesFilter,
  ): Promise<{ rows: InquiryWithAttachment[]; total: number }> {
    const conditions: SQL[] = [];
    if (filter.read !== undefined) {
      conditions.push(
        filter.read ? isNotNull(inquiries.readAt) : isNull(inquiries.readAt),
      );
    }
    if (filter.starred !== undefined) {
      conditions.push(
        filter.starred
          ? isNotNull(inquiries.starredAt)
          : isNull(inquiries.starredAt),
      );
    }
    if (filter.replied !== undefined) {
      conditions.push(
        filter.replied
          ? isNotNull(inquiries.repliedAt)
          : isNull(inquiries.repliedAt),
      );
    }
    if (filter.search) {
      const keyword = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(inquiries.name, keyword),
          ilike(inquiries.email, keyword),
          ilike(inquiries.subject, keyword),
        ) as SQL,
      );
    }
    // `and()` dengan array kosong menghasilkan undefined → tanpa WHERE.
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: inquiries.id,
        name: inquiries.name,
        email: inquiries.email,
        phone: inquiries.phone,
        subject: inquiries.subject,
        message: inquiries.message,
        readAt: inquiries.readAt,
        starredAt: inquiries.starredAt,
        repliedAt: inquiries.repliedAt,
        createdAt: inquiries.createdAt,
        attachmentId: externalAttachments.id,
        attachmentObjectKey: externalAttachments.objectKey,
        attachmentStorageProvider: externalAttachments.storageProvider,
        attachmentBucket: externalAttachments.bucket,
      })
      .from(inquiries)
      .leftJoin(
        externalAttachments,
        eq(inquiries.attachment, externalAttachments.id),
      )
      .where(where)
      .orderBy(desc(inquiries.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    // Tanpa join: semua kondisi filter memakai kolom milik inquiries sendiri.
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(inquiries)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  async findById(id: string): Promise<InquiryWithAttachment | undefined> {
    const result = await db
      .select({
        id: inquiries.id,
        name: inquiries.name,
        email: inquiries.email,
        phone: inquiries.phone,
        subject: inquiries.subject,
        message: inquiries.message,
        readAt: inquiries.readAt,
        starredAt: inquiries.starredAt,
        repliedAt: inquiries.repliedAt,
        createdAt: inquiries.createdAt,
        attachmentId: externalAttachments.id,
        attachmentObjectKey: externalAttachments.objectKey,
        attachmentStorageProvider: externalAttachments.storageProvider,
        attachmentBucket: externalAttachments.bucket,
      })
      .from(inquiries)
      .leftJoin(
        externalAttachments,
        eq(inquiries.attachment, externalAttachments.id),
      )
      .where(eq(inquiries.id, id))
      .limit(1);
    return result[0];
  }

  async markRead(id: string): Promise<InquiryWithAttachment | undefined> {
    const updated = await db
      .update(inquiries)
      .set({ readAt: new Date() })
      .where(eq(inquiries.id, id))
      .returning({ id: inquiries.id });
    if (!updated[0]) {
      return undefined;
    }
    // Ambil ulang lewat findById supaya bentuk baris (termasuk kolom attachment
    // hasil join) sama persis dengan endpoint GET.
    return this.findById(id);
  }

  async toggleStar(
    id: string,
    starredAt: Date | null,
  ): Promise<InquiryWithAttachment | undefined> {
    const updated = await db
      .update(inquiries)
      .set({ starredAt })
      .where(eq(inquiries.id, id))
      .returning({ id: inquiries.id });
    if (!updated[0]) {
      return undefined;
    }
    return this.findById(id);
  }

  async markReplied(id: string): Promise<InquiryWithAttachment | undefined> {
    const updated = await db
      .update(inquiries)
      .set({ repliedAt: new Date() })
      .where(eq(inquiries.id, id))
      .returning({ id: inquiries.id });
    if (!updated[0]) {
      return undefined;
    }
    return this.findById(id);
  }

  /**
   * Ambil satu inquiry beserta info attachment-nya. Dipakai DELETE untuk tahu
   * objectKey mana yang harus dihapus dari storage.
   */
  async findByIdWithAttachment(
    id: string,
  ): Promise<InquiryAttachmentRef | undefined> {
    const result = await db
      .select({
        id: inquiries.id,
        attachmentId: externalAttachments.id,
        attachmentObjectKey: externalAttachments.objectKey,
        attachmentStorageProvider: externalAttachments.storageProvider,
      })
      .from(inquiries)
      .leftJoin(
        externalAttachments,
        eq(inquiries.attachment, externalAttachments.id),
      )
      .where(eq(inquiries.id, id))
      .limit(1);
    return result[0];
  }

  /**
   * Hard delete inquiry + baris attachment-nya dalam satu transaksi.
   * Urutan penting: baris `inquiries` dulu, karena `inquiries.attachment` punya
   * foreign key ke `external_attachments.id`.
   */
  async deleteWithAttachment(id: string, attachmentId: string | null) {
    await db.transaction(async (tx) => {
      await tx.delete(inquiries).where(eq(inquiries.id, id));
      if (attachmentId) {
        await tx
          .delete(externalAttachments)
          .where(eq(externalAttachments.id, attachmentId));
      }
    });
  }
}
