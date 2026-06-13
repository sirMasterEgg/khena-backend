import type { ProductRepository } from "../repositories/product.repository";
import { db } from "../utils/db";

interface CreateProductVariant {
  colorId: string;
  sku: string;
  price: number;
  discountedPrice: number;
  visibility: string;
  variantMedia: string[];
}

interface CreateProductInput {
  productName: string;
  sku: string;
  collectionId: string;
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
      throw new Error("sku already exists");
    }

    // Check collection exists
    const collection = await this.repo.findCollectionById(input.collectionId);
    if (!collection) {
      throw new Error("collection not found");
    }

    // Check all colors exist
    const colorIds = input.variant.map((v) => v.colorId);
    const foundColors = await this.repo.findColorByIds(colorIds);
    const foundColorIds = new Set(foundColors.map((c) => c.id));

    for (const colorId of colorIds) {
      if (!foundColorIds.has(colorId)) {
        throw new Error(`color ${colorId} not found`);
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
        throw new Error(`media ${objectKey} not found`);
      }
      return mediaId;
    };

    // Check all object keys are found
    for (const objectKey of allObjectKeys) {
      getMediaId(objectKey);
    }

    // Insert in transaction
    return await db.transaction(async (tx) => {
      // Create product
      const product = await this.repo.createProduct(
        {
          name: input.productName,
          baseSku: input.sku,
          description: input.description,
          materials: input.material,
          careInstruction: JSON.stringify(input.careInstructions),
          productDimensionMediaId: getMediaId(input.productDimension),
          boxDimensionMediaId: getMediaId(input.boxDimensions),
          status: input.status,
        },
        tx,
      );

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
            discountedPrice: variant.discountedPrice,
            nonDiscountedPrice: variant.price,
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

      return { success: true };
    });
  }
}
