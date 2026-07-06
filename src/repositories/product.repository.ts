import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  careInstructions,
  type NewCareInstruction,
  type NewProductCareInstruction,
  productCareInstructions,
} from "../models/care-instruction.model";
import { categories } from "../models/category.model";
import {
  collections,
  type NewProductCollection,
  productCollections,
} from "../models/collection.model";
import { colors } from "../models/color.model";
import { type Media, media } from "../models/media.model";
import {
  type DetailProduct,
  detailProductImages,
  detailProducts,
  type NewDetailProduct,
  type NewDetailProductImage,
  type NewProduct,
  type NewProductMediaShowcase,
  type Product,
  productMediaShowcase,
  products,
} from "../models/product.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export interface ProductListFilter {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: string;
  sort: "name" | "createdAt" | "status";
  order: "asc" | "desc";
}

export class ProductRepository {
  async findByBaseSku(sku: string) {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.baseSku, sku))
      .limit(1);
    return result[0];
  }

  async findById(id: string): Promise<Product | undefined> {
    const result = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findMediaByObjectKeys(objectKeys: string[]) {
    return await db
      .select()
      .from(media)
      .where(inArray(media.objectKey, objectKeys));
  }

  async findMediaByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db.select().from(media).where(inArray(media.id, ids));
  }

  async findCollectionById(id: string) {
    const result = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);
    return result[0];
  }

  async findCategoryById(id: string) {
    const result = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return result[0];
  }

  async findColorByIds(ids: string[]) {
    return await db.select().from(colors).where(inArray(colors.id, ids));
  }

  // ---- list ----

  async list(
    filter: ProductListFilter,
  ): Promise<{ rows: ProductListRow[]; total: number }> {
    const conditions = [isNull(products.deletedAt)];

    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(products.name, pattern),
          ilike(products.baseSku, pattern),
        ) as (typeof conditions)[number],
      );
    }
    if (filter.categoryId) {
      conditions.push(eq(products.categoryId, filter.categoryId));
    }
    if (filter.status) {
      conditions.push(eq(products.status, filter.status));
    }

    // Mapping kolom eksplisit — jangan interpolasi string mentah ke SQL.
    const sortColumn = {
      name: products.name,
      createdAt: products.createdAt,
      status: products.status,
    }[filter.sort];

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        baseSku: products.baseSku,
        status: products.status,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: categories.category,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(filter.order === "asc" ? asc(sortColumn) : desc(sortColumn))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(and(...conditions));
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  // ---- detail ----

  async findProductWithCategoryById(
    id: string,
  ): Promise<(Product & { categoryName: string | null }) | undefined> {
    const rows = await db
      .select({ product: products, categoryName: categories.category })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return { ...row.product, categoryName: row.categoryName };
  }

  async findCareInstructionsByProductId(
    productId: string,
  ): Promise<Array<{ id: string; instruction: string }>> {
    return await db
      .select({
        id: careInstructions.id,
        instruction: careInstructions.instruction,
      })
      .from(productCareInstructions)
      .innerJoin(
        careInstructions,
        eq(productCareInstructions.careInstructionId, careInstructions.id),
      )
      .where(
        and(
          eq(productCareInstructions.productId, productId),
          isNull(productCareInstructions.deletedAt),
          isNull(careInstructions.deletedAt),
        ),
      );
  }

  async findShowcaseMediaByProductId(productId: string): Promise<Media[]> {
    const rows = await db
      .select({ media })
      .from(productMediaShowcase)
      .innerJoin(media, eq(productMediaShowcase.mediaId, media.id))
      .where(
        and(
          eq(productMediaShowcase.productId, productId),
          isNull(productMediaShowcase.deletedAt),
        ),
      )
      .orderBy(asc(productMediaShowcase.order));
    return rows.map((r) => r.media);
  }

  async findDetailProductsByProductId(
    productId: string,
    conn: DbOrTx = db,
  ): Promise<DetailProduct[]> {
    return await conn
      .select()
      .from(detailProducts)
      .where(
        and(
          eq(detailProducts.productId, productId),
          isNull(detailProducts.deletedAt),
        ),
      )
      .orderBy(asc(detailProducts.createdAt));
  }

  async findImagesByDetailProductIds(
    ids: string[],
  ): Promise<Array<{ detailProductId: string; media: Media }>> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select({ detailProductId: detailProductImages.detailProductId, media })
      .from(detailProductImages)
      .innerJoin(media, eq(detailProductImages.mediaId, media.id))
      .where(
        and(
          inArray(detailProductImages.detailProductId, ids),
          isNull(detailProductImages.deletedAt),
        ),
      )
      .orderBy(asc(detailProductImages.order));
  }

  // ---- create ----

  async createProduct(data: NewProduct, tx: Tx) {
    const result = await tx
      .insert(products)
      .values(stampCreate(data))
      .returning();
    const product = result[0];
    if (!product) {
      throw new Error("failed to create product");
    }
    return product;
  }

  async createProductMediaShowcase(rows: NewProductMediaShowcase[], tx: Tx) {
    if (rows.length === 0) {
      return [];
    }
    return await tx
      .insert(productMediaShowcase)
      .values(rows.map(stampCreate))
      .returning();
  }

  async createDetailProduct(data: NewDetailProduct, tx: Tx) {
    const result = await tx
      .insert(detailProducts)
      .values(stampCreate(data))
      .returning();
    const detailProduct = result[0];
    if (!detailProduct) {
      throw new Error("failed to create detail product");
    }
    return detailProduct;
  }

  async createDetailProductImages(rows: NewDetailProductImage[], tx: Tx) {
    if (rows.length === 0) {
      return [];
    }
    return await tx
      .insert(detailProductImages)
      .values(rows.map(stampCreate))
      .returning();
  }

  async createProductCollections(rows: NewProductCollection[], tx: Tx) {
    if (rows.length === 0) {
      return [];
    }
    return await tx
      .insert(productCollections)
      .values(rows.map(stampCreate))
      .returning();
  }

  async createCareInstruction(data: NewCareInstruction, tx: Tx) {
    const result = await tx
      .insert(careInstructions)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create care instruction");
    }
    return row;
  }

  async createProductCareInstructions(
    rows: NewProductCareInstruction[],
    tx: Tx,
  ) {
    if (rows.length === 0) {
      return [];
    }
    return await tx
      .insert(productCareInstructions)
      .values(rows.map(stampCreate))
      .returning();
  }

  // ---- update ----

  async updateProduct(id: string, data: Partial<NewProduct>, tx: Tx) {
    const result = await tx
      .update(products)
      .set(stampUpdate(data))
      .where(eq(products.id, id))
      .returning();
    const product = result[0];
    if (!product) {
      throw new Error("failed to update product");
    }
    return product;
  }

  async updateDetailProduct(
    id: string,
    data: Partial<NewDetailProduct>,
    tx: Tx,
  ) {
    const result = await tx
      .update(detailProducts)
      .set(stampUpdate(data))
      .where(eq(detailProducts.id, id))
      .returning();
    const detailProduct = result[0];
    if (!detailProduct) {
      throw new Error("failed to update detail product");
    }
    return detailProduct;
  }

  // ---- soft delete (update & delete) ----

  async softDeleteProduct(id: string, tx: Tx): Promise<void> {
    await tx.update(products).set(stampDelete()).where(eq(products.id, id));
  }

  async softDeleteShowcaseByProductId(
    productId: string,
    tx: Tx,
  ): Promise<void> {
    await tx
      .update(productMediaShowcase)
      .set(stampDelete())
      .where(eq(productMediaShowcase.productId, productId));
  }

  async softDeleteProductCareInstructionsByProductId(
    productId: string,
    tx: Tx,
  ): Promise<void> {
    await tx
      .update(productCareInstructions)
      .set(stampDelete())
      .where(eq(productCareInstructions.productId, productId));
  }

  async softDeleteDetailProducts(ids: string[], tx: Tx): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await tx
      .update(detailProducts)
      .set(stampDelete())
      .where(inArray(detailProducts.id, ids));
  }

  async softDeleteDetailProductImagesByDetailProductIds(
    detailProductIds: string[],
    tx: Tx,
  ): Promise<void> {
    if (detailProductIds.length === 0) {
      return;
    }
    await tx
      .update(detailProductImages)
      .set(stampDelete())
      .where(inArray(detailProductImages.detailProductId, detailProductIds));
  }

  async softDeleteProductCollectionsByDetailProductIds(
    detailProductIds: string[],
    tx: Tx,
  ): Promise<void> {
    if (detailProductIds.length === 0) {
      return;
    }
    await tx
      .update(productCollections)
      .set(stampDelete())
      .where(inArray(productCollections.detailProductId, detailProductIds));
  }
}

export interface ProductListRow {
  id: string;
  name: string;
  baseSku: string;
  status: string | null;
  description: string | null;
  categoryId: string;
  categoryName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
