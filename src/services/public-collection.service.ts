import type { PublicCollectionRepository } from "../repositories/public/public-collection.repository";
import { buildMediaUrl } from "../utils/media-url";

interface ListPublicCollectionsInput {
  page: number;
  limit: number;
}

export class PublicCollectionService {
  constructor(private readonly repo: PublicCollectionRepository) {}

  async listCollections(input: ListPublicCollectionsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({ page, limit });

    const collectionIds = rows.map((r) => r.id);
    const statsById = await this.repo.statsForCollectionIds(collectionIds);

    const mediaIds = rows.flatMap((r) =>
      [r.coverImage, r.bannerImage].filter((v): v is string => v !== null),
    );
    const objectKeyByMediaId =
      await this.repo.findMediaObjectKeysByIds(mediaIds);
    const toUrl = (mediaId: string | null) => {
      const objectKey = mediaId ? objectKeyByMediaId.get(mediaId) : undefined;
      return objectKey ? buildMediaUrl(objectKey) : null;
    };

    const data = rows.map((row) => {
      const stats = statsById.get(row.id) ?? {
        totalProducts: 0,
        hasSoldOutProduct: false,
      };
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        coverImage: toUrl(row.coverImage),
        // DB: banner_image, API publik: heroImage (sesuai brief §9).
        heroImage: toUrl(row.bannerImage),
        totalProducts: stats.totalProducts,
        hasSoldOutProduct: stats.hasSoldOutProduct,
      };
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
