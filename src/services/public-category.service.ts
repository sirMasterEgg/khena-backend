import type { PublicCategoryRepository } from "../repositories/public/public-category.repository";

interface ListPublicCategoriesInput {
  roomType?: string; // slug
  page: number;
  limit: number;
}

export class PublicCategoryService {
  constructor(private readonly repo: PublicCategoryRepository) {}

  async listCategories(input: ListPublicCategoriesInput) {
    const { page, limit } = input;
    const { rows: roomTypeRows, total } = await this.repo.listRoomTypes({
      roomTypeSlug: input.roomType,
      page,
      limit,
    });

    const roomTypeIds = roomTypeRows.map((r) => r.id);
    const categoryRows =
      await this.repo.listCategoriesByRoomTypeIds(roomTypeIds);

    // Kelompokkan kategori per room type dengan Map — hindari 1+N query.
    const categoriesByRoomTypeId = new Map<
      string,
      { id: string; slug: string; name: string }[]
    >();
    for (const category of categoryRows) {
      const list = categoriesByRoomTypeId.get(category.roomTypeId) ?? [];
      list.push({
        id: category.id,
        slug: category.slug,
        name: category.category,
      });
      categoriesByRoomTypeId.set(category.roomTypeId, list);
    }

    const data = roomTypeRows.map((roomType) => ({
      id: roomType.id,
      slug: roomType.slug,
      name: roomType.roomType,
      // Room type tanpa kategori published tetap tampil dengan array kosong.
      categories: categoriesByRoomTypeId.get(roomType.id) ?? [],
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
