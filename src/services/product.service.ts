import type { NewProduct } from "../models/product.model";
import type {
  ProductListFilter,
  ProductRepository,
} from "../repositories/product.repository";
import { db } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toMediaResponse, toMediaResponseNullable } from "../utils/media-url";

interface ProductDimensionInput {
  width: number;
  depth: number;
  height: number;
  weight: number;
  image: string;
}

interface ProductVariantInput {
  id?: string;
  colorId: string;
  sku: string;
  visibility: string;
  price: number;
  capitalPrice: number;
  discountPercent?: number;
  marketplacePrice?: number;
  initialStock: number;
  images: string[];
}

interface ProductInput {
  productName: string;
  baseSku: string;
  collectionId?: string;
  categoryId: string;
  status: string;
  description?: string;
  lowStockAlert?: number;
  materialInformation: string;
  careInstructionIds: string[];
  productDimension: ProductDimensionInput;
  boxDimension: ProductDimensionInput;
  media: string[];
  variant: ProductVariantInput[];
}

type CreateProductInput = ProductInput;
// PATCH parsial: seluruh field opsional. Field yang tidak dikirim tidak diubah.
type UpdateProductInput = Partial<ProductInput>;

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
   * Validasi eksistensi collection, category, colors, care instruction, dan
   * seluruh objectKey media pada payload create/update. Menerima input parsial
   * (untuk PATCH) — hanya bagian yang ada yang divalidasi. `effectiveBaseSku`
   * dipakai untuk memastikan setiap SKU varian diawali base SKU produk.
   * Mengembalikan resolver `getMediaId` (objectKey → mediaId) yang sudah
   * dipastikan lengkap untuk objectKey yang ada di payload.
   */
  private async validateProductInput(
    input: UpdateProductInput,
    effectiveBaseSku: string,
  ) {
    // Collection (opsional).
    if (input.collectionId !== undefined) {
      const collection = await this.repo.findCollectionById(input.collectionId);
      if (!collection) {
        throw new NotFoundError("collection not found");
      }
    }

    // Category.
    if (input.categoryId !== undefined) {
      const category = await this.repo.findCategoryById(input.categoryId);
      if (!category) {
        throw new NotFoundError("category not found");
      }
    }

    // Variant: colors + aturan SKU varian.
    if (input.variant !== undefined) {
      const colorIds = input.variant.map((v) => v.colorId);
      const foundColors = await this.repo.findColorByIds(colorIds);
      const foundColorIds = new Set(foundColors.map((c) => c.id));
      for (const colorId of colorIds) {
        if (!foundColorIds.has(colorId)) {
          throw new NotFoundError(`color ${colorId} not found`);
        }
      }

      for (const variant of input.variant) {
        if (!variant.sku.startsWith(effectiveBaseSku)) {
          throw new BadRequestError(
            `variant sku ${variant.sku} harus diawali ${effectiveBaseSku}`,
          );
        }
      }
    }

    // Care instructions: pilih dari data yang sudah ada.
    if (input.careInstructionIds !== undefined) {
      const found = await this.repo.findCareInstructionByIds(
        input.careInstructionIds,
      );
      const foundIds = new Set(found.map((c) => c.id));
      for (const careInstructionId of input.careInstructionIds) {
        if (!foundIds.has(careInstructionId)) {
          throw new NotFoundError(
            `care instruction ${careInstructionId} not found`,
          );
        }
      }
    }

    // Resolve object keys yang ada di payload menjadi media id.
    const allObjectKeys = [
      ...(input.productDimension ? [input.productDimension.image] : []),
      ...(input.boxDimension ? [input.boxDimension.image] : []),
      ...(input.media ?? []),
      ...(input.variant?.flatMap((v) => v.images) ?? []),
    ];
    const foundMedia =
      allObjectKeys.length > 0
        ? await this.repo.findMediaByObjectKeys(allObjectKeys)
        : [];
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
    // Pastikan semua object key ditemukan di awal.
    for (const objectKey of allObjectKeys) {
      getMediaId(objectKey);
    }

    return { getMediaId };
  }

  async createProduct(input: CreateProductInput) {
    // Check for duplicate SKU
    const existingProduct = await this.repo.findByBaseSku(input.baseSku);
    if (existingProduct) {
      throw new ConflictError("sku already exists");
    }

    const { getMediaId } = await this.validateProductInput(
      input,
      input.baseSku,
    );

    // Insert in transaction
    const productId = await db.transaction(async (tx) => {
      const product = await this.repo.createProduct(
        {
          name: input.productName,
          baseSku: input.baseSku,
          categoryId: input.categoryId,
          description: input.description,
          materials: input.materialInformation,
          minStockAlert: input.lowStockAlert,
          status: input.status,
          productDimensionMediaId: getMediaId(input.productDimension.image),
          productDimensionWidth: input.productDimension.width,
          productDimensionDepth: input.productDimension.depth,
          productDimensionHeight: input.productDimension.height,
          productDimensionWeight: input.productDimension.weight,
          boxDimensionMediaId: getMediaId(input.boxDimension.image),
          boxDimensionWidth: input.boxDimension.width,
          boxDimensionDepth: input.boxDimension.depth,
          boxDimensionHeight: input.boxDimension.height,
          boxDimensionWeight: input.boxDimension.weight,
        },
        tx,
      );

      // Link care instructions (ambil dari data yang sudah ada)
      await this.repo.createProductCareInstructions(
        input.careInstructionIds.map((careInstructionId) => ({
          productId: product.id,
          careInstructionId,
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

      // Create detail products, images, initial stock, dan collections
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

        const imageRows = variant.images.map((fileKey, index) => ({
          detailProductId: detailProduct.id,
          mediaId: getMediaId(fileKey),
          order: index,
        }));
        await this.repo.createDetailProductImages(imageRows, tx);

        // Initial stock per variant (satu baris ledger).
        await this.repo.createStock(
          {
            detailProductId: detailProduct.id,
            quantity: variant.initialStock,
            capitalPrice: variant.capitalPrice,
            isAdjustment: false,
            reason: "initial stock",
          },
          tx,
        );

        // Collection bersifat opsional.
        if (input.collectionId) {
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
      lowStockAlert: product.minStockAlert,
      category: { id: product.categoryId, name: product.categoryName ?? "" },
      productDimension: {
        width: product.productDimensionWidth,
        depth: product.productDimensionDepth,
        height: product.productDimensionHeight,
        weight: product.productDimensionWeight,
        media: toMediaResponseNullable(
          product.productDimensionMediaId
            ? mediaById.get(product.productDimensionMediaId)
            : null,
        ),
      },
      boxDimension: {
        width: product.boxDimensionWidth,
        depth: product.boxDimensionDepth,
        height: product.boxDimensionHeight,
        weight: product.boxDimensionWeight,
        media: toMediaResponseNullable(
          product.boxDimensionMediaId
            ? mediaById.get(product.boxDimensionMediaId)
            : null,
        ),
      },
      careInstructions,
      media: showcaseMedia.map(toMediaResponse),
      variants: details.map((d) => ({
        id: d.id,
        colorId: d.colorId,
        detailProductSku: d.detailProductSku,
        price: d.price,
        discountPercent: d.discountPercent,
        capitalPrice: d.capitalPrice,
        marketplacePrice: d.marketplacePrice,
        visibility: d.visibility,
        images: (imagesByDetailId.get(d.id) ?? []).map(toMediaResponse),
      })),
    };
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("product not found");
    }

    // Base SKU efektif: yang baru bila dikirim, kalau tidak pakai yang tersimpan.
    const effectiveBaseSku = input.baseSku ?? existing.baseSku;

    // Kalau SKU berubah, pastikan tidak bentrok dengan produk lain.
    if (input.baseSku !== undefined && input.baseSku !== existing.baseSku) {
      const duplicate = await this.repo.findByBaseSku(input.baseSku);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError("sku already exists");
      }
    }

    const { getMediaId } = await this.validateProductInput(
      input,
      effectiveBaseSku,
    );

    await db.transaction(async (tx) => {
      // 1. Update product row — hanya kolom yang dikirim.
      const productData: Partial<NewProduct> = {};
      if (input.productName !== undefined) {
        productData.name = input.productName;
      }
      if (input.baseSku !== undefined) {
        productData.baseSku = input.baseSku;
      }
      if (input.categoryId !== undefined) {
        productData.categoryId = input.categoryId;
      }
      if (input.description !== undefined) {
        productData.description = input.description;
      }
      if (input.materialInformation !== undefined) {
        productData.materials = input.materialInformation;
      }
      if (input.lowStockAlert !== undefined) {
        productData.minStockAlert = input.lowStockAlert;
      }
      if (input.status !== undefined) {
        productData.status = input.status;
      }
      if (input.productDimension !== undefined) {
        productData.productDimensionMediaId = getMediaId(
          input.productDimension.image,
        );
        productData.productDimensionWidth = input.productDimension.width;
        productData.productDimensionDepth = input.productDimension.depth;
        productData.productDimensionHeight = input.productDimension.height;
        productData.productDimensionWeight = input.productDimension.weight;
      }
      if (input.boxDimension !== undefined) {
        productData.boxDimensionMediaId = getMediaId(input.boxDimension.image);
        productData.boxDimensionWidth = input.boxDimension.width;
        productData.boxDimensionDepth = input.boxDimension.depth;
        productData.boxDimensionHeight = input.boxDimension.height;
        productData.boxDimensionWeight = input.boxDimension.weight;
      }
      if (Object.keys(productData).length > 0) {
        await this.repo.updateProduct(id, productData, tx);
      }

      // 2. Care instructions → replace bila dikirim.
      if (input.careInstructionIds !== undefined) {
        await this.repo.softDeleteProductCareInstructionsByProductId(id, tx);
        await this.repo.createProductCareInstructions(
          input.careInstructionIds.map((careInstructionId) => ({
            productId: id,
            careInstructionId,
          })),
          tx,
        );
      }

      // 3. Showcase media → replace bila dikirim.
      if (input.media !== undefined) {
        await this.repo.softDeleteShowcaseByProductId(id, tx);
        await this.repo.createProductMediaShowcase(
          input.media.map((fileKey, index) => ({
            productId: id,
            mediaId: getMediaId(fileKey),
            order: index,
          })),
          tx,
        );
      }

      // 4. Variants → match by id bila dikirim.
      if (input.variant !== undefined) {
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
              variant.images.map((fileKey, index) => ({
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
              variant.images.map((fileKey, index) => ({
                detailProductId: detailProduct.id,
                mediaId: getMediaId(fileKey),
                order: index,
              })),
              tx,
            );
            // Initial stock untuk variant baru.
            await this.repo.createStock(
              {
                detailProductId: detailProduct.id,
                quantity: variant.initialStock,
                capitalPrice: variant.capitalPrice,
                isAdjustment: false,
                reason: "initial stock",
              },
              tx,
            );
            if (input.collectionId) {
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
