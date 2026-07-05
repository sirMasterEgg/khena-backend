import type { ProductRepository } from "../repositories/product.repository";
import { db } from "../utils/db";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateProductVariant {
  colorId: string;
  sku: string;
  price: number;
  discountPercent?: number;
  capitalPrice: number;
  marketplacePrice: number;
  visibility: string;
  variantMedia: string[];
}

interface CreateProductInput {
  productName: string;
  sku: string;
  collectionId: string;
  categoryId: string;
  description: string;
  material: string;
  careInstructions: string[];
  productDimension: string;
  boxDimensions: string;
  media: string[];
  status: string;
  variant: CreateProductVariant[];
}

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  async createProduct(input: CreateProductInput) {
    // Check for duplicate SKU
    const existingProduct = await this.repo.findByBaseSku(input.sku);
    if (existingProduct) {
      throw new ConflictError("sku already exists");
    }

    // Check collection exists
    const collection = await this.repo.findCollectionById(input.collectionId);
    if (!collection) {
      throw new NotFoundError("collection not found");
    }

    // Check category exists
    const category = await this.repo.findCategoryById(input.categoryId);
    if (!category) {
      throw new NotFoundError("category not found");
    }

    // Check all colors exist
    const colorIds = input.variant.map((v) => v.colorId);
    const foundColors = await this.repo.findColorByIds(colorIds);
    const foundColorIds = new Set(foundColors.map((c) => c.id));

    for (const colorId of colorIds) {
      if (!foundColorIds.has(colorId)) {
        throw new NotFoundError(`color ${colorId} not found`);
      }
    }

    // Collect all object keys
    const allObjectKeys = [
      input.productDimension,
      input.boxDimensions,
      ...input.media,
      ...input.variant.flatMap((v) => v.variantMedia),
    ];

    // Resolve object keys to media ids
    const foundMedia = await this.repo.findMediaByObjectKeys(allObjectKeys);
    const objectKeyToMediaId = new Map(
      foundMedia.map((m) => [m.objectKey, m.id]),
    );

    const getMediaId = (objectKey: string) => {
      const mediaId = objectKeyToMediaId.get(objectKey);
      if (mediaId === undefined) {
        throw new NotFoundError(`media ${objectKey} not found`);
      }
      return mediaId;
    };

    // Check all object keys are found
    for (const objectKey of allObjectKeys) {
      getMediaId(objectKey);
    }

    // Insert in transaction
    const productId = await db.transaction(async (tx) => {
      // Create product
      const product = await this.repo.createProduct(
        {
          name: input.productName,
          baseSku: input.sku,
          categoryId: input.categoryId,
          description: input.description,
          materials: input.material,
          productDimensionMediaId: getMediaId(input.productDimension),
          boxDimensionMediaId: getMediaId(input.boxDimensions),
          status: input.status,
        },
        tx,
      );

      // Create care instructions and link to product
      const careInstructionRows: {
        instructionId: string;
      }[] = [];
      for (const instruction of input.careInstructions) {
        const careInstruction = await this.repo.createCareInstruction(
          { instruction },
          tx,
        );
        careInstructionRows.push({ instructionId: careInstruction.id });
      }

      if (careInstructionRows.length > 0) {
        const productCareInstructionRows = careInstructionRows.map((row) => ({
          productId: product.id,
          careInstructionId: row.instructionId,
        }));
        await this.repo.createProductCareInstructions(
          productCareInstructionRows,
          tx,
        );
      }

      // Create product media showcase
      const showcaseRows = input.media.map((fileKey, index) => ({
        productId: product.id,
        mediaId: getMediaId(fileKey),
        order: index,
      }));
      await this.repo.createProductMediaShowcase(showcaseRows, tx);

      // Create detail products and related images + collections
      for (const [variantIndex, variant] of input.variant.entries()) {
        const detailProduct = await this.repo.createDetailProduct(
          {
            productId: product.id,
            colorId: variant.colorId,
            detailProductSku: variant.sku,
            price: variant.price,
            discountPercent: variant.discountPercent,
            capitalPrice: variant.capitalPrice,
            marketplacePrice: variant.marketplacePrice,
            visibility: variant.visibility,
          },
          tx,
        );

        // Create detail product images
        const imageRows = variant.variantMedia.map((fileKey, index) => ({
          detailProductId: detailProduct.id,
          mediaId: getMediaId(fileKey),
          order: index,
        }));
        await this.repo.createDetailProductImages(imageRows, tx);

        // Create product collection entry
        await this.repo.createProductCollections(
          [
            {
              collectionId: input.collectionId,
              detailProductId: detailProduct.id,
              order: variantIndex,
            },
          ],
          tx,
        );
      }

      return product.id;
    });

    logger.info(
      { productId, variantCount: input.variant.length },
      "product created",
    );
    return { success: true };
  }
}
