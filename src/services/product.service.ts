import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { NewProduct } from "../models/product.model";
import type {
  ProductListFilter,
  ProductRepository,
} from "../repositories/product.repository";
import { db } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  objectKeyFromUrl,
  toMediaResponse,
  toMediaResponseNullable,
} from "../utils/media-url";

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

// Urutan & nama kolom kontrak CSV bulk export/import (lihat contract.md).
// Dipakai bersama oleh export (stringify) & import (validasi header) supaya
// tidak perlu disinkronkan manual di dua tempat.
const CSV_COLUMNS = [
  "productName",
  "baseSku",
  "categoryName",
  "collectionSlug",
  "status",
  "description",
  "materialInformation",
  "lowStockAlert",
  "careInstructions",
  "productDimensionWidth",
  "productDimensionDepth",
  "productDimensionHeight",
  "productDimensionWeight",
  "productDimensionImageUrl",
  "boxDimensionWidth",
  "boxDimensionDepth",
  "boxDimensionHeight",
  "boxDimensionWeight",
  "boxDimensionImageUrl",
  "mediaUrls",
  "variantSku",
  "variantColor",
  "variantVisibility",
  "variantPrice",
  "variantCapitalPrice",
  "variantDiscountPercent",
  "variantMarketplacePrice",
  "variantInitialStock",
  "variantImageUrls",
] as const;

// Kolom opsional (lihat tabel kontrak Tahap 4) — sisanya wajib ada di header.
const OPTIONAL_CSV_COLUMNS: ReadonlySet<string> = new Set([
  "collectionSlug",
  "description",
  "lowStockAlert",
  "variantDiscountPercent",
  "variantMarketplacePrice",
]);

const VALID_PRODUCT_STATUSES = new Set([
  "published",
  "draft",
  "scheduled",
  "archived",
]);

interface BulkImportRowResult {
  baseSku: string;
  status: "success" | "failed";
  productId?: string;
  error?: string;
}

interface BulkImportSummary {
  total: number;
  successCount: number;
  failedCount: number;
  results: BulkImportRowResult[];
}

function splitCsvList(cell: string | undefined): string[] {
  return (cell ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireCsvString(value: string | undefined, label: string): string {
  const v = (value ?? "").trim();
  if (!v) {
    throw new BadRequestError(`${label} wajib diisi`);
  }
  return v;
}

function csvNumber(
  value: string | undefined,
  label: string,
  required: boolean,
): number | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    if (required) {
      throw new BadRequestError(`${label} wajib diisi`);
    }
    return undefined;
  }
  const n = Number(trimmed);
  if (Number.isNaN(n)) {
    throw new BadRequestError(`${label} harus berupa angka, dapat "${value}"`);
  }
  return n;
}

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  /**
   * Validasi eksistensi collection, category, colors, care instruction, dan
   * seluruh media id yang direferensikan payload create/update. Menerima input
   * parsial (untuk PATCH) — hanya bagian yang ada yang divalidasi.
   * `effectiveBaseSku` dipakai untuk memastikan setiap SKU varian diawali base
   * SKU produk. Mengembalikan `getMediaId` yang mem-validasi sebuah media id ada
   * lalu mengembalikannya kembali (semua id di payload sudah dipastikan valid).
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

    // Validasi seluruh media id yang direferensikan payload.
    const allMediaIds = [
      ...(input.productDimension ? [input.productDimension.image] : []),
      ...(input.boxDimension ? [input.boxDimension.image] : []),
      ...(input.media ?? []),
      ...(input.variant?.flatMap((v) => v.images) ?? []),
    ];
    const foundMedia =
      allMediaIds.length > 0 ? await this.repo.findMediaByIds(allMediaIds) : [];
    const foundMediaIds = new Set(foundMedia.map((m) => m.id));
    const getMediaId = (mediaId: string) => {
      if (!foundMediaIds.has(mediaId)) {
        throw new NotFoundError(`media ${mediaId} not found`);
      }
      return mediaId;
    };
    // Pastikan semua media id ditemukan di awal.
    for (const mediaId of allMediaIds) {
      getMediaId(mediaId);
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
      const showcaseRows = input.media.map((mediaId, index) => ({
        productId: product.id,
        mediaId: getMediaId(mediaId),
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

        const imageRows = variant.images.map((mediaId, index) => ({
          detailProductId: detailProduct.id,
          mediaId: getMediaId(mediaId),
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
    return await this.getProductDetail(productId);
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

  async getProductStats() {
    const [status, stock] = await Promise.all([
      this.repo.productStatusStats(),
      this.repo.stockStats(),
    ]);

    return {
      totalProducts: status.total,
      totalInventory: stock.totalInventory,
      totalOutOfStock: stock.totalOutOfStock,
      totalPublished: status.published,
      totalDraft: status.draft,
      totalScheduled: status.scheduled,
      totalArchived: status.archived,
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
          input.media.map((mediaId, index) => ({
            productId: id,
            mediaId: getMediaId(mediaId),
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
              variant.images.map((mediaId, index) => ({
                detailProductId: variant.id as string,
                mediaId: getMediaId(mediaId),
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
              variant.images.map((mediaId, index) => ({
                detailProductId: detailProduct.id,
                mediaId: getMediaId(mediaId),
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

  /**
   * Export semua produk aktif menjadi string CSV (1 baris per varian, kolom
   * relasi ditulis human-readable). Dibangun di memori, tidak menyentuh
   * object storage — lihat kontrak Tahap 4/5.1.
   */
  async exportProductsCsv(): Promise<string> {
    const ids = await this.repo.findAllActiveIds();
    // TODO: optimalkan N+1 (satu query per produk via getProductDetail).
    const details = await Promise.all(
      ids.map((id) => this.getProductDetail(id)),
    );

    const allColorIds = [
      ...new Set(details.flatMap((d) => d.variants.map((v) => v.colorId))),
    ];
    const colorRows = await this.repo.findColorsWithFinishByIds(allColorIds);
    const colorById = new Map(colorRows.map((c) => [c.id, c]));

    const collectionSlugs = await Promise.all(
      details.map((d) => this.repo.findCollectionSlugByProductId(d.id)),
    );
    const collectionSlugByProductId = new Map(
      details.map((d, i) => [d.id, collectionSlugs[i] ?? ""]),
    );

    const allDetailProductIds = details.flatMap((d) =>
      d.variants.map((v) => v.id),
    );
    const stockByDetailProductId =
      await this.repo.findStockTotalsByDetailProductIds(allDetailProductIds);

    const rows: Record<string, string | number>[] = [];
    for (const detail of details) {
      const collectionSlug = collectionSlugByProductId.get(detail.id) ?? "";
      for (const variant of detail.variants) {
        const color = colorById.get(variant.colorId);
        const variantColor = color
          ? color.finishName
            ? `${color.name}|${color.finishName}`
            : color.name
          : "";

        rows.push({
          productName: detail.name,
          baseSku: detail.baseSku,
          categoryName: detail.category.name,
          collectionSlug,
          status: detail.status ?? "",
          description: detail.description ?? "",
          materialInformation: detail.materials ?? "",
          lowStockAlert: detail.lowStockAlert ?? "",
          careInstructions: detail.careInstructions
            .map((c) => c.instruction)
            .join(";"),
          productDimensionWidth: detail.productDimension.width ?? "",
          productDimensionDepth: detail.productDimension.depth ?? "",
          productDimensionHeight: detail.productDimension.height ?? "",
          productDimensionWeight: detail.productDimension.weight ?? "",
          productDimensionImageUrl: detail.productDimension.media?.url ?? "",
          boxDimensionWidth: detail.boxDimension.width ?? "",
          boxDimensionDepth: detail.boxDimension.depth ?? "",
          boxDimensionHeight: detail.boxDimension.height ?? "",
          boxDimensionWeight: detail.boxDimension.weight ?? "",
          boxDimensionImageUrl: detail.boxDimension.media?.url ?? "",
          mediaUrls: detail.media.map((m) => m.url).join(";"),
          variantSku: variant.detailProductSku,
          variantColor,
          variantVisibility: variant.visibility,
          variantPrice: variant.price,
          variantCapitalPrice: variant.capitalPrice,
          variantDiscountPercent: variant.discountPercent ?? "",
          variantMarketplacePrice: variant.marketplacePrice ?? "",
          // getProductDetail tidak mengembalikan initialStock — pakai stok
          // saat ini bila tersedia, 0 bila tidak (keterbatasan yang diketahui).
          variantInitialStock: stockByDetailProductId.get(variant.id) ?? 0,
          variantImageUrls: variant.images.map((i) => i.url).join(";"),
        });
      }
    }

    return stringify(rows, {
      header: true,
      columns: CSV_COLUMNS as unknown as string[],
    });
  }

  /**
   * Import banyak produk sekaligus dari isi CSV (bukan URL — file dibaca di
   * memori oleh controller). Create-only: baseSku yang sudah ada akan gagal.
   * Satu produk gagal tidak membatalkan produk lain (partial success).
   */
  async importProductsCsv(csvText: string): Promise<BulkImportSummary> {
    let records: Record<string, string>[];
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch (err) {
      throw new BadRequestError(
        `csv tidak valid: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (records.length === 0) {
      throw new BadRequestError("csv kosong");
    }

    const header = Object.keys(records[0] as Record<string, string>);
    const missingColumns = CSV_COLUMNS.filter(
      (c) => !OPTIONAL_CSV_COLUMNS.has(c) && !header.includes(c),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestError(
        `kolom CSV tidak lengkap: ${missingColumns.join(", ")}`,
      );
    }

    // ---- Kumpulkan nilai distinct dari semua baris untuk resolve batch ----
    const categoryNames = new Set<string>();
    const collectionSlugs = new Set<string>();
    const careInstructionTexts = new Set<string>();
    const colorNames = new Set<string>();
    const objectKeys = new Set<string>();

    const collectObjectKey = (url: string | undefined) => {
      const key = url ? objectKeyFromUrl(url) : null;
      if (key) {
        objectKeys.add(key);
      }
    };

    for (const row of records) {
      if (row.categoryName) {
        categoryNames.add(row.categoryName);
      }
      if (row.collectionSlug) {
        collectionSlugs.add(row.collectionSlug);
      }
      for (const text of splitCsvList(row.careInstructions)) {
        careInstructionTexts.add(text);
      }
      const colorName = (row.variantColor ?? "").split("|")[0]?.trim();
      if (colorName) {
        colorNames.add(colorName);
      }
      collectObjectKey(row.productDimensionImageUrl);
      collectObjectKey(row.boxDimensionImageUrl);
      for (const url of splitCsvList(row.mediaUrls)) {
        collectObjectKey(url);
      }
      for (const url of splitCsvList(row.variantImageUrls)) {
        collectObjectKey(url);
      }
    }

    const [categoryRows, collectionRows, careRows, colorRows, mediaRows] =
      await Promise.all([
        this.repo.findCategoriesByNames([...categoryNames]),
        this.repo.findCollectionsBySlugs([...collectionSlugs]),
        this.repo.findCareInstructionsByTexts([...careInstructionTexts]),
        this.repo.findColorsByNameAndFinish([...colorNames]),
        this.repo.findMediaByObjectKeys([...objectKeys]),
      ]);

    const categoryMap = new Map<string, string[]>();
    for (const r of categoryRows) {
      categoryMap.set(r.category, [
        ...(categoryMap.get(r.category) ?? []),
        r.id,
      ]);
    }
    const collectionMap = new Map(collectionRows.map((r) => [r.slug, r.id]));
    const careMap = new Map<string, string[]>();
    for (const r of careRows) {
      careMap.set(r.instruction, [...(careMap.get(r.instruction) ?? []), r.id]);
    }
    const colorMap = new Map<string, string[]>();
    for (const r of colorRows) {
      const key = r.finishName ? `${r.name}|${r.finishName}` : r.name;
      colorMap.set(key, [...(colorMap.get(key) ?? []), r.id]);
    }
    const mediaMap = new Map(mediaRows.map((r) => [r.objectKey, r.id]));

    // ---- Group by baseSku (pertahankan urutan kemunculan pertama) ----
    const groups = new Map<string, Record<string, string>[]>();
    for (const row of records) {
      const baseSku = row.baseSku ?? "";
      const list = groups.get(baseSku) ?? [];
      list.push(row);
      groups.set(baseSku, list);
    }

    const lookups = { categoryMap, collectionMap, careMap, colorMap, mediaMap };
    const results: BulkImportRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const [baseSku, rows] of groups) {
      try {
        const input = this.buildCreateInputFromCsvRows(rows, lookups);
        const product = await this.createProduct(input);
        results.push({ baseSku, status: "success", productId: product.id });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ baseSku, status: "failed", error: message });
        failedCount++;
      }
    }

    return { total: groups.size, successCount, failedCount, results };
  }

  private resolveCsvId(
    map: Map<string, string[]>,
    key: string,
    label: string,
  ): string {
    const ids = map.get(key) ?? [];
    if (ids.length === 0) {
      throw new NotFoundError(`${label} "${key}" not found`);
    }
    if (ids.length > 1) {
      throw new BadRequestError(
        `${label} "${key}" ambiguous (${ids.length} matches)`,
      );
    }
    return ids[0] as string;
  }

  private buildCreateInputFromCsvRows(
    rows: Record<string, string>[],
    lookups: {
      categoryMap: Map<string, string[]>;
      collectionMap: Map<string, string>;
      careMap: Map<string, string[]>;
      colorMap: Map<string, string[]>;
      mediaMap: Map<string, string>;
    },
  ): CreateProductInput {
    const first = rows[0];
    if (!first) {
      throw new BadRequestError("grup baseSku kosong");
    }

    const resolveMedia = (url: string | undefined, label: string): string => {
      const key = url ? objectKeyFromUrl(url) : null;
      const id = key ? lookups.mediaMap.get(key) : undefined;
      if (!id) {
        throw new NotFoundError(`${label} "${url ?? ""}" not found`);
      }
      return id;
    };

    const categoryName = requireCsvString(first.categoryName, "categoryName");
    const categoryId = this.resolveCsvId(
      lookups.categoryMap,
      categoryName,
      "category",
    );

    const collectionSlug = (first.collectionSlug ?? "").trim();
    let collectionId: string | undefined;
    if (collectionSlug) {
      collectionId = lookups.collectionMap.get(collectionSlug);
      if (!collectionId) {
        throw new NotFoundError(`collection "${collectionSlug}" not found`);
      }
    }

    const status = requireCsvString(first.status, "status");
    if (!VALID_PRODUCT_STATUSES.has(status)) {
      throw new BadRequestError(`status "${status}" tidak valid`);
    }

    const careInstructionTexts = splitCsvList(first.careInstructions);
    if (careInstructionTexts.length === 0) {
      throw new BadRequestError("careInstructions wajib diisi minimal 1");
    }
    const careInstructionIds = careInstructionTexts.map((text) =>
      this.resolveCsvId(lookups.careMap, text, "care instruction"),
    );

    const mediaUrls = splitCsvList(first.mediaUrls);
    if (mediaUrls.length === 0) {
      throw new BadRequestError("mediaUrls wajib diisi minimal 1");
    }

    const variant: ProductVariantInput[] = rows.map((row) => {
      const [colorNameRaw, finishNameRaw] = (row.variantColor ?? "").split("|");
      const colorName = (colorNameRaw ?? "").trim();
      const finishName = finishNameRaw?.trim();
      const colorKey = finishName ? `${colorName}|${finishName}` : colorName;
      const colorId = this.resolveCsvId(
        lookups.colorMap,
        colorKey,
        "variantColor",
      );

      const variantImageUrls = splitCsvList(row.variantImageUrls);
      if (variantImageUrls.length === 0) {
        throw new BadRequestError("variantImageUrls wajib diisi minimal 1");
      }

      return {
        colorId,
        sku: requireCsvString(row.variantSku, "variantSku"),
        visibility: requireCsvString(
          row.variantVisibility,
          "variantVisibility",
        ),
        price: csvNumber(row.variantPrice, "variantPrice", true) as number,
        capitalPrice: csvNumber(
          row.variantCapitalPrice,
          "variantCapitalPrice",
          true,
        ) as number,
        discountPercent: csvNumber(
          row.variantDiscountPercent,
          "variantDiscountPercent",
          false,
        ),
        marketplacePrice: csvNumber(
          row.variantMarketplacePrice,
          "variantMarketplacePrice",
          false,
        ),
        initialStock: csvNumber(
          row.variantInitialStock,
          "variantInitialStock",
          true,
        ) as number,
        images: variantImageUrls.map((url) =>
          resolveMedia(url, "variantImageUrls"),
        ),
      };
    });

    return {
      productName: requireCsvString(first.productName, "productName"),
      baseSku: requireCsvString(first.baseSku, "baseSku"),
      collectionId,
      categoryId,
      status,
      description: first.description?.trim() || undefined,
      materialInformation: requireCsvString(
        first.materialInformation,
        "materialInformation",
      ),
      lowStockAlert: csvNumber(first.lowStockAlert, "lowStockAlert", false),
      careInstructionIds,
      productDimension: {
        width: csvNumber(
          first.productDimensionWidth,
          "productDimensionWidth",
          true,
        ) as number,
        depth: csvNumber(
          first.productDimensionDepth,
          "productDimensionDepth",
          true,
        ) as number,
        height: csvNumber(
          first.productDimensionHeight,
          "productDimensionHeight",
          true,
        ) as number,
        weight: csvNumber(
          first.productDimensionWeight,
          "productDimensionWeight",
          true,
        ) as number,
        image: resolveMedia(
          first.productDimensionImageUrl,
          "productDimensionImageUrl",
        ),
      },
      boxDimension: {
        width: csvNumber(
          first.boxDimensionWidth,
          "boxDimensionWidth",
          true,
        ) as number,
        depth: csvNumber(
          first.boxDimensionDepth,
          "boxDimensionDepth",
          true,
        ) as number,
        height: csvNumber(
          first.boxDimensionHeight,
          "boxDimensionHeight",
          true,
        ) as number,
        weight: csvNumber(
          first.boxDimensionWeight,
          "boxDimensionWeight",
          true,
        ) as number,
        image: resolveMedia(first.boxDimensionImageUrl, "boxDimensionImageUrl"),
      },
      media: mediaUrls.map((url) => resolveMedia(url, "mediaUrls")),
      variant,
    };
  }
}
