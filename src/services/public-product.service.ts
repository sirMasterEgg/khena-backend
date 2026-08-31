import type { PublicProductRepository } from "../repositories/public/public-product.repository";
import { NotFoundError } from "../utils/errors";
import { buildMediaUrl } from "../utils/media-url";
import { toProductSummary } from "./public/product-summary.mapper";

const RELATED_PRODUCTS_LIMIT = 8;

interface ListPublicProductsInput {
  search?: string;
  category?: string; // slug
  collection?: string; // slug
  sort?: string;
  orderDir?: string;
  page: number;
  limit: number;
}

export class PublicProductService {
  constructor(private readonly repo: PublicProductRepository) {}

  async listProducts(input: ListPublicProductsInput) {
    const { page, limit } = input;
    const sort = input.sort === "price" ? "price" : "name";
    const orderDir = input.orderDir === "desc" ? "desc" : "asc";

    const { rows, total } = await this.repo.list({
      search: input.search,
      categorySlug: input.category,
      collectionSlug: input.collection,
      sort,
      orderDir,
      page,
      limit,
    });

    return {
      data: rows.map(toProductSummary),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProductDetail(sku: string) {
    const product = await this.repo.findPublishedByBaseSku(sku);
    if (!product) {
      throw new NotFoundError("product not found");
    }

    // Query turunan tetap pakai uuid produk — hanya pencarian produknya yang by SKU.
    const productId = product.id;

    const [careInstructionTexts, showcaseObjectKeys, variantRows] =
      await Promise.all([
        this.repo.findCareInstructionTextsByProductId(productId),
        this.repo.findShowcaseObjectKeysByProductId(productId),
        this.repo.findVariantsByProductId(productId),
      ]);

    const variantIds = variantRows.map((v) => v.id);
    const stockByVariantId =
      await this.repo.findStockTotalsByDetailProductIds(variantIds);

    const dimensionMediaIds = [
      product.productDimensionMediaId,
      product.boxDimensionMediaId,
    ].filter((v): v is string => v !== null);
    const dimensionObjectKeys =
      await this.repo.findMediaObjectKeysByIds(dimensionMediaIds);

    const dimensionResponse = (
      width: number | null,
      depth: number | null,
      height: number | null,
      weight: number | null,
      mediaId: string | null,
    ) => {
      const objectKey = mediaId ? dimensionObjectKeys.get(mediaId) : undefined;
      return {
        width,
        depth,
        height,
        weight,
        image: objectKey ? buildMediaUrl(objectKey) : null,
      };
    };

    return {
      id: product.id,
      name: product.name,
      sku: product.baseSku,
      description: product.description,
      materialAndCare: {
        materials: product.materials,
        careInstructions: careInstructionTexts,
      },
      dimensions: {
        product: dimensionResponse(
          product.productDimensionWidth,
          product.productDimensionDepth,
          product.productDimensionHeight,
          product.productDimensionWeight,
          product.productDimensionMediaId,
        ),
        box: dimensionResponse(
          product.boxDimensionWidth,
          product.boxDimensionDepth,
          product.boxDimensionHeight,
          product.boxDimensionWeight,
          product.boxDimensionMediaId,
        ),
      },
      media: showcaseObjectKeys.map(buildMediaUrl),
      variants: variantRows.map((v) => {
        const price = v.price ?? 0;
        const discountPercent = v.discountPercent ?? 0;
        return {
          id: v.id,
          sku: v.sku,
          image: v.imageObjectKey ? buildMediaUrl(v.imageObjectKey) : null,
          color: {
            id: v.colorId ?? "",
            name: v.colorName ?? "",
            hexCode: v.colorHexCode ?? "",
          },
          price,
          discountPercent,
          priceAfterDiscount: Math.round(
            (price * (100 - discountPercent)) / 100,
          ),
          stock: stockByVariantId.get(v.id) ?? 0,
        };
      }),
    };
  }

  async getRelatedProducts(sku: string) {
    const product = await this.repo.findPublishedByBaseSku(sku);
    if (!product) {
      throw new NotFoundError("product not found");
    }

    const productId = product.id;

    const collectionIds =
      await this.repo.findCollectionIdsByProductId(productId);
    const fromCollection = await this.repo.findRelatedByCollectionIds(
      collectionIds,
      productId,
      RELATED_PRODUCTS_LIMIT,
    );

    const remaining = RELATED_PRODUCTS_LIMIT - fromCollection.length;
    const fromCategory =
      remaining > 0
        ? await this.repo.findRelatedByCategoryId(
            product.categoryId,
            [productId, ...fromCollection.map((r) => r.id)],
            remaining,
          )
        : [];

    return [...fromCollection, ...fromCategory].map(toProductSummary);
  }
}
