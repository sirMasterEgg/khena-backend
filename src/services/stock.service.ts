import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { Media } from "../models/media.model";
import type { NewStock } from "../models/stock.model";
import type { StockRepository } from "../repositories/stock.repository";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toMediaResponseNullable } from "../utils/media-url";

const REQUIRED_CSV_COLUMNS = ["sku", "adjustment_type", "quantity", "reason"];

interface AdjustStockInput {
  sku: string;
  adjustmentType: "increase" | "decrease";
  quantity: number;
  reason?: string;
}

interface BulkAdjustmentResultRow {
  row: number;
  sku: string;
  status: "success" | "failed";
  error?: string;
}

interface ParsedCsvRow {
  row: number;
  sku: string;
  adjustmentType: "in" | "out";
  quantity: number;
  reason: string | null;
}

interface ListActivityInput {
  page: number;
  limit: number;
  source?: "ADJUSTMENT" | "SYSTEM";
}

interface ListReorderListInput {
  page: number;
  limit: number;
  status?: "OUT_OF_STOCK" | "RUNNING_LOW";
}

export class StockService {
  constructor(private readonly repo: StockRepository) {}

  async adjustStock(input: AdjustStockInput) {
    const [variant] = await this.repo.findActiveVariantsBySkus([input.sku]);
    if (!variant) {
      throw new NotFoundError("product variant not found");
    }

    const stockMap = await this.repo.sumQuantityByDetailProductIds([
      variant.id,
    ]);
    const before = stockMap.get(variant.id) ?? 0;
    const delta =
      input.adjustmentType === "increase" ? input.quantity : -input.quantity;

    if (before + delta < 0) {
      throw new BadRequestError(`insufficient stock for ${input.sku}`);
    }

    const id = Bun.randomUUIDv7();
    const reason = input.reason ?? null;

    // Catatan race condition: cek stok dan insert tidak dikunci di sini,
    // jadi dua request `decrease` bersamaan secara teori bisa membuat stok
    // minus. Ini konsisten dengan perilaku POS/order sales yang sudah ada —
    // jangan menambah locking/SELECT FOR UPDATE.
    await this.repo.insertEntries([
      {
        id,
        detailProductId: variant.id,
        quantity: delta,
        capitalPrice: variant.capitalPrice,
        reason,
        isAdjustment: true,
      },
    ]);

    logger.info({ sku: input.sku, delta }, "stock adjusted");

    return {
      id,
      sku: input.sku,
      adjustmentType: input.adjustmentType,
      quantity: input.quantity,
      stockBefore: before,
      stockAfter: before + delta,
      reason,
    };
  }

  async bulkAdjustStock(csvText: string): Promise<{
    total: number;
    successCount: number;
    failedCount: number;
    results: BulkAdjustmentResultRow[];
  }> {
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
    const missingColumns = REQUIRED_CSV_COLUMNS.filter(
      (c) => !header.includes(c),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestError(
        `kolom CSV tidak lengkap: ${missingColumns.join(", ")}`,
      );
    }

    // ---- Validasi per baris (kumpulkan error, jangan lempar) ----
    const results: BulkAdjustmentResultRow[] = [];
    const parsedRows: ParsedCsvRow[] = [];

    records.forEach((record, index) => {
      const row = index + 1;
      const sku = (record.sku ?? "").trim();
      const adjustmentTypeRaw = (record.adjustment_type ?? "")
        .trim()
        .toLowerCase();
      const quantityRaw = (record.quantity ?? "").trim();
      const reason = (record.reason ?? "").trim() || null;

      if (!sku) {
        results.push({ row, sku, status: "failed", error: "sku wajib diisi" });
        return;
      }
      if (adjustmentTypeRaw !== "in" && adjustmentTypeRaw !== "out") {
        results.push({
          row,
          sku,
          status: "failed",
          error: "adjustment_type harus in atau out",
        });
        return;
      }
      const quantity = Number(quantityRaw);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        results.push({
          row,
          sku,
          status: "failed",
          error: "quantity harus bilangan bulat lebih dari 0",
        });
        return;
      }

      parsedRows.push({
        row,
        sku,
        adjustmentType: adjustmentTypeRaw as "in" | "out",
        quantity,
        reason,
      });
    });

    // ---- Resolve SKU sekali (bukan per baris) ----
    const uniqueSkus = [...new Set(parsedRows.map((r) => r.sku))];
    const variants = await this.repo.findActiveVariantsBySkus(uniqueSkus);
    const variantBySku = new Map(variants.map((v) => [v.sku, v]));

    // ---- Stok awal sekali, dipakai sebagai running balance di memori ----
    const stockMap = await this.repo.sumQuantityByDetailProductIds(
      variants.map((v) => v.id),
    );
    const runningBalance = new Map<string, number>();
    for (const v of variants) {
      runningBalance.set(v.id, stockMap.get(v.id) ?? 0);
    }

    const newRows: NewStock[] = [];

    for (const parsed of parsedRows) {
      const variant = variantBySku.get(parsed.sku);
      if (!variant) {
        results.push({
          row: parsed.row,
          sku: parsed.sku,
          status: "failed",
          error: "sku tidak ditemukan",
        });
        continue;
      }

      const delta =
        parsed.adjustmentType === "in" ? parsed.quantity : -parsed.quantity;
      const before = runningBalance.get(variant.id) ?? 0;

      if (before + delta < 0) {
        results.push({
          row: parsed.row,
          sku: parsed.sku,
          status: "failed",
          error: `insufficient stock for ${parsed.sku}`,
        });
        continue;
      }

      runningBalance.set(variant.id, before + delta);
      newRows.push({
        detailProductId: variant.id,
        quantity: delta,
        capitalPrice: variant.capitalPrice,
        reason: parsed.reason,
        isAdjustment: true,
      });
      results.push({ row: parsed.row, sku: parsed.sku, status: "success" });
    }

    await this.repo.insertEntries(newRows);

    // Baris gagal validasi format ditambahkan lebih dulu di atas, jadi urutan
    // `results` perlu dikembalikan sesuai nomor baris asli di file.
    results.sort((a, b) => a.row - b.row);

    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.length - successCount;

    return {
      total: records.length,
      successCount,
      failedCount,
      results,
    };
  }

  generateExampleCsv(): string {
    return stringify(
      [
        {
          sku: "CHR-001-BLK",
          adjustment_type: "in",
          quantity: 10,
          reason: "Stock correction",
        },
        {
          sku: "CHR-001-WHT",
          adjustment_type: "out",
          quantity: 2,
          reason: "Damaged item",
        },
      ],
      { header: true, columns: ["sku", "adjustment_type", "quantity", "reason"] },
    );
  }

  async getStockStats() {
    return await this.repo.stockStats();
  }

  async listActivity(input: ListActivityInput) {
    const { rows, total } = await this.repo.listActivity(input);
    const totalPages = Math.ceil(total / input.limit);

    return {
      data: rows.map((row) => ({
        id: row.id,
        source: (row.isAdjustment ? "ADJUSTMENT" : "SYSTEM") as
          | "ADJUSTMENT"
          | "SYSTEM",
        sku: row.detailProductSku,
        productName: row.productName,
        quantity: row.quantity,
        reason: row.reason,
        by: row.createdBy,
        timestamp: row.createdAt,
      })),
      meta: { page: input.page, limit: input.limit, total, totalPages },
    };
  }

  async listReorderList(input: ListReorderListInput) {
    const { rows, total } = await this.repo.listReorderList(input);
    const totalPages = Math.ceil(total / input.limit);

    if (rows.length === 0) {
      return {
        data: [],
        meta: { page: input.page, limit: input.limit, total, totalPages },
      };
    }

    const imageRows = await this.repo.findFirstImagesByDetailProductIds(
      rows.map((r) => r.detailProductId),
    );
    // imageRows sudah terurut by `order` asc → yang pertama masuk Map adalah
    // gambar pertama.
    const firstImageByVariant = new Map<string, Media>();
    for (const row of imageRows) {
      if (!firstImageByVariant.has(row.detailProductId)) {
        firstImageByVariant.set(row.detailProductId, row.media);
      }
    }

    return {
      data: rows.map((row) => ({
        id: row.detailProductId,
        name: row.productName,
        sku: row.sku,
        image: toMediaResponseNullable(
          firstImageByVariant.get(row.detailProductId),
        ),
        inStock: row.qty,
        reorderAt: row.minAlert,
        status: row.status,
      })),
      meta: { page: input.page, limit: input.limit, total, totalPages },
    };
  }

  async getVariantStatus(sku: string) {
    const row = await this.repo.findVariantStatusBySku(sku);
    if (!row) {
      throw new NotFoundError("product variant not found");
    }

    return {
      id: row.id,
      sku: row.sku,
      name: `${row.productName} - ${row.colorName}`,
      inStock: row.qty,
    };
  }
}
