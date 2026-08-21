import type { ProductSummaryQueryRow } from "../repositories/public/public-product.repository";
import type { PublicWishlistRepository } from "../repositories/public/public-wishlist.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toProductSummary } from "./public/product-summary.mapper";

interface AddToWishlistResult {
  status: 200 | 201;
  data: { id: string; product: ReturnType<typeof toProductSummary> };
}

export class PublicWishlistService {
  constructor(private readonly repo: PublicWishlistRepository) {}

  /**
   * `sku` selalu products.base_sku (SKU produk), BUKAN
   * detail_products.detail_product_sku (SKU varian) — mudah tertukar, lihat
   * issue #98 §10.1. `userId` selalu dari sesi, tidak pernah dari body/query.
   */
  async addToWishlist(
    userId: string,
    sku: string,
  ): Promise<AddToWishlistResult> {
    const product = await this.repo.findPublishedProductByBaseSku(sku);
    if (!product) {
      throw new NotFoundError("product not found");
    }

    const existing = await this.repo.findByUserAndProductId(userId, product.id);
    const summaryRow = (await this.repo.findProductSummaryById(
      product.id,
    )) as ProductSummaryQueryRow;

    // Idempoten: klik dua kali tidak menghasilkan error, cukup kembalikan
    // baris yang sudah ada dengan status 200 (bukan 201).
    if (existing) {
      return {
        status: 200,
        data: { id: existing.id, product: toProductSummary(summaryRow) },
      };
    }

    const created = await this.repo.create({ userId, productId: product.id });
    logger.info({ wishlistId: created.id, userId }, "wishlist item added");
    return {
      status: 201,
      data: { id: created.id, product: toProductSummary(summaryRow) },
    };
  }

  async removeFromWishlist(userId: string, sku: string): Promise<void> {
    const productId = await this.repo.findProductIdByBaseSku(sku);
    if (!productId) {
      throw new NotFoundError("wishlist not found");
    }
    const deleted = await this.repo.deleteByUserAndProductId(userId, productId);
    if (!deleted) {
      throw new NotFoundError("wishlist not found");
    }
    logger.info({ userId, productId }, "wishlist item removed");
  }

  async listWishlist(userId: string, page: number, limit: number) {
    const { rows, total } = await this.repo.list(userId, page, limit);
    return {
      data: rows.map((row) => ({
        id: row.wishlistId,
        product: toProductSummary(row),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
