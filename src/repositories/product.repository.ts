import { db } from "../utils/db";
import {
  products,
  productMediaShowcase,
  detailProducts,
  detailProductImages,
  type NewProduct,
  type NewProductMediaShowcase,
  type NewDetailProduct,
  type NewDetailProductImage,
} from "../models/product.model";
import { colors } from "../models/color.model";
import { media } from "../models/media.model";
import { collections } from "../models/collection.model";
import { productCollections } from "../models/collection.model";
import { eq, inArray } from "drizzle-orm";

export class ProductRepository {
  async findByBaseSku(sku: string) {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.baseSku, sku))
      .limit(1);
    return result[0];
  }

  async findMediaByFileKeys(fileKeys: string[]) {
    return await db.select().from(media).where(inArray(media.fileKey, fileKeys));
  }

  async findCollectionById(id: string) {
    const result = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);
    return result[0];
  }

  async findColorByIds(ids: string[]) {
    return await db.select().from(colors).where(inArray(colors.id, ids));
  }

  async createProduct(data: NewProduct, tx: any) {
    const result = await tx.insert(products).values(data).returning();
    return result[0];
  }

  async createProductMediaShowcase(
    rows: NewProductMediaShowcase[],
    tx: any
  ) {
    return await tx.insert(productMediaShowcase).values(rows).returning();
  }

  async createDetailProduct(data: NewDetailProduct, tx: any) {
    const result = await tx.insert(detailProducts).values(data).returning();
    return result[0];
  }

  async createDetailProductImages(rows: NewDetailProductImage[], tx: any) {
    return await tx.insert(detailProductImages).values(rows).returning();
  }

  async createProductCollections(
    rows: any[],
    tx: any
  ) {
    return await tx.insert(productCollections).values(rows).returning();
  }
}
