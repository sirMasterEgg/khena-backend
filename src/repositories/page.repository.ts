import { and, asc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { media } from "../models/media.model";
import { type NewPage, type Page, pages } from "../models/page.model";
import { stampCreate, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

interface ListPagesFilter {
  page?: string;
  section?: string;
  status?: string;
}

export class PageRepository {
  /**
   * List non-paginasi, urut page lalu section (sama seperti repo publik).
   * Tanpa filter status → draft & published sama-sama ikut.
   */
  async list(filter: ListPagesFilter): Promise<Page[]> {
    const conditions: SQL[] = [isNull(pages.deletedAt)];
    if (filter.page) {
      conditions.push(eq(pages.page, filter.page));
    }
    if (filter.section) {
      conditions.push(eq(pages.section, filter.section));
    }
    if (filter.status) {
      conditions.push(eq(pages.status, filter.status));
    }

    return await db
      .select()
      .from(pages)
      .where(and(...conditions))
      .orderBy(asc(pages.page), asc(pages.section));
  }

  async findById(id: string): Promise<Page | null> {
    const result = await db
      .select()
      .from(pages)
      .where(and(eq(pages.id, id), isNull(pages.deletedAt)))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Cek duplikat kombinasi (page, section) sebelum insert/update. `excludeId`
   * dipakai saat PATCH supaya baris itu sendiri tidak dianggap duplikat.
   */
  async findByPageSection(
    page: string,
    section: string,
    excludeId?: string,
  ): Promise<Page | null> {
    const conditions: SQL[] = [
      eq(pages.page, page),
      eq(pages.section, section),
      isNull(pages.deletedAt),
    ];
    if (excludeId) {
      conditions.push(ne(pages.id, excludeId));
    }

    const result = await db
      .select()
      .from(pages)
      .where(and(...conditions))
      .limit(1);
    return result[0] ?? null;
  }

  async create(data: NewPage): Promise<Page> {
    const result = await db.insert(pages).values(stampCreate(data)).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create page");
    }
    return row;
  }

  /**
   * `data` milik seluruh section lain. Dipakai untuk mengecek apakah sebuah
   * file masih dirujuk section lain sebelum dihapus dari storage. Tabel ini
   * kecil (satu baris = satu section), jadi diambil sekaligus.
   */
  async listDataExcept(excludeId: string): Promise<unknown[]> {
    const rows = await db
      .select({ data: pages.data })
      .from(pages)
      .where(and(ne(pages.id, excludeId), isNull(pages.deletedAt)));
    return rows.map((row) => row.data);
  }

  /**
   * Subset objectKey yang tercatat di tabel `media`. File semacam ini milik
   * Media Library, bukan modul pages, jadi tidak boleh ikut dihapus saat
   * `data` diganti. Row yang sudah soft delete sengaja ikut dihitung — file
   * fisiknya masih ada dan masih bisa dipulihkan.
   */
  async findMediaObjectKeys(objectKeys: string[]): Promise<string[]> {
    if (objectKeys.length === 0) {
      return [];
    }
    const rows = await db
      .select({ objectKey: media.objectKey })
      .from(media)
      .where(inArray(media.objectKey, objectKeys));
    return rows.map((row) => row.objectKey);
  }

  async update(id: string, data: Partial<NewPage>): Promise<Page> {
    const result = await db
      .update(pages)
      .set(stampUpdate(data))
      .where(eq(pages.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update page");
    }
    return row;
  }
}
