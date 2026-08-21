import { and, asc, eq, type SQL } from "drizzle-orm";
import { pages } from "../../models/page.model";
import { db } from "../../utils/db";

interface ListPublicPagesFilter {
  page?: string;
  section?: string;
}

export class PublicPageRepository {
  /**
   * Semua section yang published + visible, tanpa paginasi — jumlah barisnya
   * sedikit dan frontend biasanya mengambil semua section satu halaman
   * sekaligus (issue #98 §7.1).
   */
  async list(filter: ListPublicPagesFilter) {
    const conditions: SQL[] = [
      eq(pages.status, "published"),
      eq(pages.visibility, "visible"),
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
