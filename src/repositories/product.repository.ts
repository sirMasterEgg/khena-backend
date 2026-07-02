import { eq, inArray } from "drizzle-orm";
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
import { media } from "../models/media.model";
import {
  detailProductImages,
  detailProducts,
  type NewDetailProduct,
  type NewDetailProductImage,
  type NewProduct,
  type NewProductMediaShowcase,
  productMediaShowcase,
  products,
} from "../models/product.model";
import { db, type Tx } from "../utils/db";

export class ProductRepository {
  async findByBaseSku(sku: string) {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.baseSku, sku))
      .limit(1);
    return result[0];
  }

  async findMediaByObjectKeys(objectKeys: string[]) {
    return await db
      .select()
      .from(media)
      .where(inArray(media.objectKey, objectKeys));
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

  async createProduct(data: NewProduct, tx: Tx) {
    const result = await tx.insert(products).values(data).returning();
    const product = result[0];
    if (!product) {
      throw new Error("failed to create product");
    }
    return product;
  }

  async createProductMediaShowcase(rows: NewProductMediaShowcase[], tx: Tx) {
    return await tx.insert(productMediaShowcase).values(rows).returning();
  }

  async createDetailProduct(data: NewDetailProduct, tx: Tx) {
    const result = await tx.insert(detailProducts).values(data).returning();
    const detailProduct = result[0];
    if (!detailProduct) {
      throw new Error("failed to create detail product");
    }
    return detailProduct;
  }

  async createDetailProductImages(rows: NewDetailProductImage[], tx: Tx) {
    return await tx.insert(detailProductImages).values(rows).returning();
  }

  async createProductCollections(rows: NewProductCollection[], tx: Tx) {
    return await tx.insert(productCollections).values(rows).returning();
  }

  async createCareInstruction(data: NewCareInstruction, tx: Tx) {
    const result = await tx.insert(careInstructions).values(data).returning();
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
    return await tx.insert(productCareInstructions).values(rows).returning();
  }
}
