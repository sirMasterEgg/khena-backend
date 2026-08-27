import type { PublicPageRepository } from "../repositories/public/public-page.repository";

interface ListPublicPagesInput {
  page?: string;
  section?: string;
}

export class PublicPageService {
  constructor(private readonly repo: PublicPageRepository) {}

  async listPages(input: ListPublicPagesInput) {
    const rows = await this.repo.list(input);
    return rows.map((row) => ({
      id: row.id,
      page: row.page,
      section: row.section,
      data: row.data,
    }));
  }
}
