import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { pages } from "../../models/page.model";
import { db } from "../../utils/db";

interface ListPublicPagesFilter {
  page?: string;
  section?: string;
}

export class PublicPageRepository {
  /**
   * Semua section yang published, tanpa paginasi — jumlah barisnya sedikit
   * dan frontend biasanya mengambil semua section satu halaman sekaligus
   * (issue #98 §7.1).
   *
   * `deletedAt is null` ikut difilter untuk konsisten dengan seluruh query
   * pages.repository.ts (admin) — lihat page.repository.ts:19,41,58,90.
   */
  async list(filter: ListPublicPagesFilter) {
    const conditions: SQL[] = [
      eq(pages.status, "published"),
      isNull(pages.deletedAt),
    ];
    if (filter.page) {
      conditions.push(eq(pages.page, filter.page));
    }
    if (filter.section) {
      conditions.push(eq(pages.section, filter.section));
    }

    return await db
      .select()
      .from(pages)
      .where(and(...conditions))
      .orderBy(asc(pages.page), asc(pages.section));
  }
}
