import type { CollectionRepository } from "../repositories/collection.repository";
import { db } from "../utils/db";

type CollectionSort = "name" | "slug" | "created_at";

const allowedSorts: CollectionSort[] = ["name", "slug", "created_at"];

interface CreateCollectionInput {
  name: string;
  coverId: string;
  heroId: string;
  slug: string;
  status: string;
  productIds: string[];
}

interface ListCollectionsInput {
  search?: string;
  status?: string;
  sort?: string;
  orderDir?: string;
  page: number;
  limit: number;
}

type UpdateCollectionInput = CreateCollectionInput;

export class CollectionService {
  constructor(private readonly repo: CollectionRepository) {}

  /**
   * Validasi cover & hero media. Saat ini keduanya wajib.
   * Kalau nanti dibuat opsional, bungkus pengecekan dengan `if (coverId) { ... }`.
   */
  private async validateMedia(coverId: string, heroId: string) {
    const ids = [coverId, heroId];
    const found = await this.repo.findMediaByIds(ids);
    const foundIds = new Set(found.map((m) => m.id));
    if (!foundIds.has(coverId)) {
      throw new Error("cover media not found");
    }
    if (!foundIds.has(heroId)) {
      throw new Error("hero media not found");
    }
  }

  private async validateProductIds(productIds: string[]) {
    if (productIds.length === 0) {
      return;
    }
    const found = await this.repo.findDetailProductsByIds(productIds);
    const foundIds = new Set(found.map((p) => p.id));
    for (const id of productIds) {
      if (!foundIds.has(id)) {
        throw new Error(`product ${id} not found`);
      }
    }
  }

  async createCollection(input: CreateCollectionInput) {
    const existingSlug = await this.repo.findBySlug(input.slug);
    if (existingSlug) {
      throw new Error("slug already exists");
    }
    await this.validateMedia(input.coverId, input.heroId);
    await this.validateProductIds(input.productIds);

    return await db.transaction(async (tx) => {
      const collection = await this.repo.create(
        {
          name: input.name,
          slug: input.slug,
          coverImage: input.coverId,
          bannerImage: input.heroId,
          status: input.status,
        },
        tx,
      );

      const rows = input.productIds.map((detailProductId, index) => ({
        collectionId: collection.id,
        detailProductId,
        order: index,
      }));
      await this.repo.insertProductCollections(rows, tx);

      return collection;
    });
  }

  async listCollections(input: ListCollectionsInput) {
    const sort = allowedSorts.includes(input.sort as CollectionSort)
      ? (input.sort as CollectionSort)
      : "created_at";
    const orderDir = input.orderDir === "asc" ? "asc" : "desc";
    const { page, limit } = input;

    const { rows, total } = await this.repo.list({
      search: input.search,
      status: input.status,
      sort,
      orderDir,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }

  async updateCollection(id: string, input: UpdateCollectionInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error("collection not found");
    }
    const slugOwner = await this.repo.findBySlug(input.slug);
    if (slugOwner && slugOwner.id !== id) {
      throw new Error("slug already exists");
    }
    await this.validateMedia(input.coverId, input.heroId);
    await this.validateProductIds(input.productIds);

    return await db.transaction(async (tx) => {
      const collection = await this.repo.update(
        id,
        {
          name: input.name,
          slug: input.slug,
          coverImage: input.coverId,
          bannerImage: input.heroId,
          status: input.status,
        },
        tx,
      );

      await this.repo.softDeleteProductCollectionsByCollectionId(id, tx);
      const rows = input.productIds.map((detailProductId, index) => ({
        collectionId: id,
        detailProductId,
        order: index,
      }));
      await this.repo.insertProductCollections(rows, tx);

      return collection;
    });
  }

  async deleteCollection(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new Error("collection not found");
    }
    await db.transaction(async (tx) => {
      await this.repo.softDeleteProductCollectionsByCollectionId(id, tx);
      await this.repo.softDelete(id, tx);
    });
  }
}
