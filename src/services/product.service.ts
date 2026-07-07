import type {
  ProductListFilter,
  ProductRepository,
} from "../repositories/product.repository";
import { db } from "../utils/db";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface ProductVariantInput {
  id?: string;
  colorId: string;
  sku: string;
  price: number;
  discountPercent?: number;
  capitalPrice: number;
  marketplacePrice: number;
  visibility: string;
  variantMedia: string[];
}

interface ProductInput {
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
  variant: ProductVariantInput[];
}

type CreateProductInput = ProductInput;
type UpdateProductInput = ProductInput;

interface ListProductsInput {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: string;
  sort: ProductListFilter["sort"];
  order: ProductListFilter["order"];
}

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  /**
   * Validasi eksistensi collection, category, colors, dan seluruh objectKey
   * media pada payload create/update. Mengembalikan resolver `getMediaId`
   * (objectKey → mediaId) yang sudah dipastikan lengkap.
   */
  private async validateProductInput(input: ProductInput) {
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

    // Resolve object keys to media ids
    const allObjectKeys = [
      input.productDimension,
      input.boxDimensions,
      ...input.media,
      ...input.variant.flatMap((v) => v.variantMedia),
    ];
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
    // Check all object keys are found upfront
    for (const objectKey of allObjectKeys) {
      getMediaId(objectKey);
    }

    return { getMediaId };
  }

  async createProduct(input: CreateProductInput) {
    // Check for duplicate SKU
    const existingProduct = await this.repo.findByBaseSku(input.sku);
    if (existingProduct) {
      throw new ConflictError("sku already exists");
    }

    const { getMediaId } = await this.validateProductInput(input);

    // Insert in transaction
    const productId = await db.transaction(async (tx) => {
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
      const careInstructionRows: { instructionId: string }[] = [];
      for (const instruction of input.careInstructions) {
        const careInstruction = await this.repo.createCareInstruction(
          { instruction },
          tx,
        );
        careInstructionRows.push({ instructionId: careInstruction.id });
      }
      await this.repo.createProductCareInstructions(
        careInstructionRows.map((row) => ({
          productId: product.id,
          careInstructionId: row.instructionId,
        })),
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
            price: variant.price,
            discountPercent: variant.discountPercent,
            capitalPrice: variant.capitalPrice,
            marketplacePrice: variant.marketplacePrice,
            visibility: variant.visibility,
          },
          tx,
        );

        const imageRows = variant.variantMedia.map((fileKey, index) => ({
          detailProductId: detailProduct.id,
          mediaId: getMediaId(fileKey),
          order: index,
        }));
        await this.repo.createDetailProductImages(imageRows, tx);

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

  async listProducts(input: ListProductsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(input);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        baseSku: row.baseSku,
        status: row.status,
        description: row.description,
        // categoryId adalah FK notNull, jadi baris category selalu ada.
        category: { id: row.categoryId, name: row.categoryName ?? "" },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async getProductDetail(id: string) {
    const product = await this.repo.findProductWithCategoryById(id);
    if (!product) {
      throw new NotFoundError("product not found");
    }

    const [careInstructions, showcaseMedia, details] = await Promise.all([
      this.repo.findCareInstructionsByProductId(id),
      this.repo.findShowcaseMediaByProductId(id),
      this.repo.findDetailProductsByProductId(id),
    ]);

    const detailIds = details.map((d) => d.id);
    const images = await this.repo.findImagesByDetailProductIds(detailIds);
    const imagesByDetailId = new Map<
      string,
      (typeof images)[number]["media"][]
    >();
    for (const row of images) {
      const list = imagesByDetailId.get(row.detailProductId) ?? [];
      list.push(row.media);
      imagesByDetailId.set(row.detailProductId, list);
    }

    // Resolve dimension media (product & box) in one lookup.
    const dimensionIds = [
      product.productDimensionMediaId,
      product.boxDimensionMediaId,
    ].filter((v): v is string => v !== null);
    const dimensionMedia = await this.repo.findMediaByIds(dimensionIds);
    const mediaById = new Map(dimensionMedia.map((m) => [m.id, m]));

    return {
      id: product.id,
      name: product.name,
      baseSku: product.baseSku,
      description: product.description,
      materials: product.materials,
      status: product.status,
      category: { id: product.categoryId, name: product.categoryName ?? "" },
      productDimensionMedia: product.productDimensionMediaId
        ? (mediaById.get(product.productDimensionMediaId) ?? null)
        : null,
      boxDimensionMedia: product.boxDimensionMediaId
        ? (mediaById.get(product.boxDimensionMediaId) ?? null)
        : null,
      careInstructions,
      media: showcaseMedia,
      variants: details.map((d) => ({
        id: d.id,
        colorId: d.colorId,
        detailProductSku: d.detailProductSku,
        price: d.price,
        discountPercent: d.discountPercent,
        capitalPrice: d.capitalPrice,
        marketplacePrice: d.marketplacePrice,
        visibility: d.visibility,
        images: imagesByDetailId.get(d.id) ?? [],
      })),
    };
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("product not found");
    }

    // Kalau SKU berubah, pastikan tidak bentrok dengan produk lain.
    if (input.sku !== existing.baseSku) {
      const duplicate = await this.repo.findByBaseSku(input.sku);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError("sku already exists");
      }
    }

    const { getMediaId } = await this.validateProductInput(input);

    await db.transaction(async (tx) => {
      // 1. Update product row
      await this.repo.updateProduct(
        id,
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

      // 2. Care instructions → replace
      await this.repo.softDeleteProductCareInstructionsByProductId(id, tx);
      const careInstructionRows: { instructionId: string }[] = [];
      for (const instruction of input.careInstructions) {
        const careInstruction = await this.repo.createCareInstruction(
          { instruction },
          tx,
        );
        careInstructionRows.push({ instructionId: careInstruction.id });
      }
      await this.repo.createProductCareInstructions(
        careInstructionRows.map((row) => ({
          productId: id,
          careInstructionId: row.instructionId,
        })),
        tx,
      );

      // 3. Showcase media → replace
      await this.repo.softDeleteShowcaseByProductId(id, tx);
      await this.repo.createProductMediaShowcase(
        input.media.map((fileKey, index) => ({
          productId: id,
          mediaId: getMediaId(fileKey),
          order: index,
        })),
        tx,
      );

      // 4. Variants → match by id
      const existingDetails = await this.repo.findDetailProductsByProductId(
        id,
        tx,
      );
      const existingById = new Map(existingDetails.map((d) => [d.id, d]));
      const keptIds = new Set<string>();

      for (const [variantIndex, variant] of input.variant.entries()) {
        if (variant.id) {
          const current = existingById.get(variant.id);
          if (!current) {
            throw new NotFoundError(`variant ${variant.id} not found`);
          }
          keptIds.add(variant.id);

          await this.repo.updateDetailProduct(
            variant.id,
            {
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

          // Replace images
          await this.repo.softDeleteDetailProductImagesByDetailProductIds(
            [variant.id],
            tx,
          );
          await this.repo.createDetailProductImages(
            variant.variantMedia.map((fileKey, index) => ({
              detailProductId: variant.id as string,
              mediaId: getMediaId(fileKey),
              order: index,
            })),
            tx,
          );
        } else {
          const detailProduct = await this.repo.createDetailProduct(
            {
              productId: id,
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
          await this.repo.createDetailProductImages(
            variant.variantMedia.map((fileKey, index) => ({
              detailProductId: detailProduct.id,
              mediaId: getMediaId(fileKey),
              order: index,
            })),
            tx,
          );
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
      }

      // Row lama yang tidak ada di input → soft delete beserta relasinya
      const removedIds = existingDetails
        .filter((d) => !keptIds.has(d.id))
        .map((d) => d.id);
      if (removedIds.length > 0) {
        await this.repo.softDeleteDetailProductImagesByDetailProductIds(
          removedIds,
          tx,
        );
        await this.repo.softDeleteProductCollectionsByDetailProductIds(
          removedIds,
          tx,
        );
        await this.repo.softDeleteDetailProducts(removedIds, tx);
      }
    });

    logger.info({ productId: id }, "product updated");
    return await this.getProductDetail(id);
  }

  async deleteProduct(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("product not found");
    }

    await db.transaction(async (tx) => {
      const details = await this.repo.findDetailProductsByProductId(id, tx);
      const detailIds = details.map((d) => d.id);

      await this.repo.softDeleteShowcaseByProductId(id, tx);
      await this.repo.softDeleteProductCareInstructionsByProductId(id, tx);
      if (detailIds.length > 0) {
        await this.repo.softDeleteDetailProductImagesByDetailProductIds(
          detailIds,
          tx,
        );
        await this.repo.softDeleteProductCollectionsByDetailProductIds(
          detailIds,
          tx,
        );
        await this.repo.softDeleteDetailProducts(detailIds, tx);
      }
      await this.repo.softDeleteProduct(id, tx);
    });

    logger.info({ productId: id }, "product deleted");
  }
}
