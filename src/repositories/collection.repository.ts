import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  type Collection,
  collections,
  type NewCollection,
  type NewProductCollection,
  productCollections,
} from "../models/collection.model";
import { type Media, media } from "../models/media.model";
import { type DetailProduct, detailProducts } from "../models/product.model";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

type CollectionSort = "name" | "slug" | "createdAt";

interface ListCollectionsFilter {
  search?: string;
  status?: string;
  sort: CollectionSort;
  orderDir: "asc" | "desc";
  page: number;
  limit: number;
}

const sortColumns = {
  name: collections.name,
  slug: collections.slug,
  createdAt: collections.createdAt,
} as const;

export class CollectionRepository {
  async findBySlug(slug: string): Promise<Collection | undefined> {
    const result = await db
      .select()
      .from(collections)
      .where(and(eq(collections.slug, slug), isNull(collections.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findById(id: string): Promise<Collection | undefined> {
    const result = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findMediaByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), isNull(media.deletedAt)));
  }

  async findDetailProductsByIds(ids: string[]): Promise<DetailProduct[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(detailProducts)
      .where(
        and(inArray(detailProducts.id, ids), isNull(detailProducts.deletedAt)),
      );
  }

  async create(data: NewCollection, tx: DbOrTx): Promise<Collection> {
    const result = await tx.insert(collections).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create collection");
    }
    return row;
  }

  async update(
    id: string,
    data: Partial<NewCollection>,
    tx: DbOrTx,
  ): Promise<Collection> {
    const result = await tx
      .update(collections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(collections.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update collection");
    }
    return row;
  }

  async softDelete(id: string, actorName: string, tx: DbOrTx): Promise<void> {
    await tx
      .update(collections)
      .set({ deletedAt: new Date(), deletedBy: actorName })
      .where(eq(collections.id, id));
  }

  async insertProductCollections(
    rows: NewProductCollection[],
    tx: DbOrTx,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.insert(productCollections).values(rows);
  }

  async softDeleteProductCollectionsByCollectionId(
    collectionId: string,
    actorName: string,
    tx: DbOrTx,
  ): Promise<void> {
    await tx
      .update(productCollections)
      .set({ deletedAt: new Date(), deletedBy: actorName })
      .where(
        and(
          eq(productCollections.collectionId, collectionId),
          isNull(productCollections.deletedAt),
        ),
      );
  }

  async list(
    filter: ListCollectionsFilter,
  ): Promise<{ rows: Collection[]; total: number }> {
    const conditions: SQL[] = [isNull(collections.deletedAt)];
    if (filter.search) {
      conditions.push(ilike(collections.name, `%${filter.search}%`));
    }
    if (filter.status) {
      conditions.push(eq(collections.status, filter.status));
    }
    const where = and(...conditions);

    const sortColumn = sortColumns[filter.sort];
    const orderBy =
      filter.orderDir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await db
      .select()
      .from(collections)
      .where(where)
      .orderBy(orderBy)
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(collections)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }
}
