import type { Collection } from "../models/collection.model";
import type { CollectionRepository } from "../repositories/collection.repository";
import { db } from "../utils/db";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toMediaResponseNullable } from "../utils/media-url";

type CollectionSort = "name" | "slug" | "createdAt";

const allowedSorts: CollectionSort[] = ["name", "slug", "createdAt"];

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
      throw new NotFoundError("cover media not found");
    }
    if (!foundIds.has(heroId)) {
      throw new NotFoundError("hero media not found");
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
        throw new NotFoundError(`product ${id} not found`);
      }
    }
  }

  /** Ubah satu row collection jadi bentuk response (cover & banner → objek media). */
  private async toResponse(row: Collection) {
    const [mapped] = await this.toResponseList([row]);
    if (!mapped) {
      throw new Error("failed to map collection response");
    }
    return mapped;
  }

  /**
   * Versi batch: cover & banner untuk seluruh baris diambil dalam satu query,
   * lalu digabungkan di memori supaya tidak N+1.
   */
  private async toResponseList(rows: Collection[]) {
    const mediaIds = rows
      .flatMap((row) => [row.coverImage, row.bannerImage])
      .filter((id): id is string => id !== null);
    const mediaRows = await this.repo.findMediaByIds(mediaIds);
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

    return rows.map((row) => ({
      ...row,
      coverImage: toMediaResponseNullable(
        row.coverImage ? mediaById.get(row.coverImage) : null,
      ),
      bannerImage: toMediaResponseNullable(
        row.bannerImage ? mediaById.get(row.bannerImage) : null,
      ),
    }));
  }

  async createCollection(input: CreateCollectionInput) {
    const existingSlug = await this.repo.findBySlug(input.slug);
    if (existingSlug) {
      throw new ConflictError("slug already exists");
    }
    await this.validateMedia(input.coverId, input.heroId);
    await this.validateProductIds(input.productIds);

    const created = await db.transaction(async (tx) => {
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

    logger.info(
      { collectionId: created.id, productCount: input.productIds.length },
      "collection created",
    );
    return await this.toResponse(created);
  }

  async listCollections(input: ListCollectionsInput) {
    const sort = allowedSorts.includes(input.sort as CollectionSort)
      ? (input.sort as CollectionSort)
      : "createdAt";
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
      data: await this.toResponseList(rows),
      meta: { page, limit, total, totalPages },
    };
  }

  async updateCollection(id: string, input: UpdateCollectionInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("collection not found");
    }
    const slugOwner = await this.repo.findBySlug(input.slug);
    if (slugOwner && slugOwner.id !== id) {
      throw new ConflictError("slug already exists");
    }
    await this.validateMedia(input.coverId, input.heroId);
    await this.validateProductIds(input.productIds);

    const updated = await db.transaction(async (tx) => {
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

    logger.info(
      { collectionId: id, productCount: input.productIds.length },
      "collection updated",
    );
    return await this.toResponse(updated);
  }

  async deleteCollection(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("collection not found");
    }
    await db.transaction(async (tx) => {
      await this.repo.softDeleteProductCollectionsByCollectionId(id, tx);
      await this.repo.softDelete(id, tx);
    });
    logger.info({ collectionId: id }, "collection deleted");
  }
}
