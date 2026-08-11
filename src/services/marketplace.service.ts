import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type {
  MarketplaceRepository,
  MarketplaceVariantRow,
} from "../repositories/marketplace.repository";
import type { StockRepository } from "../repositories/stock.repository";
import { db } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

const REQUIRED_CSV_COLUMNS = [
  "marketplace",
  "date",
  "order_id",
  "buyer_name",
  "variant_sku",
  "quantity",
  "revenue",
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface MarketplaceItemInput {
  variantSku: string;
  quantity: number;
  revenue: number;
}

interface LogOrderInput {
  marketplace: string;
  date: string;
  orderId: string;
  buyerName: string;
  items: MarketplaceItemInput[];
}

interface ListOrdersInput {
  marketplace?: string;
  page: number;
  limit: number;
}

interface ImportResultRow {
  row: number;
  orderId: string;
  variantSku: string;
  status: "success" | "failed";
  error?: string;
}

interface ParsedCsvRow {
  row: number;
  marketplace: string;
  date: string;
  orderId: string;
  buyerName: string;
  variantSku: string;
  quantity: number;
  revenue: number;
}

interface OrderItemDraft {
  id: string;
  variant: MarketplaceVariantRow;
  quantity: number;
  revenue: number;
  unitPrice: number;
}

interface OrderGroup {
  marketplace: string;
  date: string;
  buyerName: string;
  items: OrderItemDraft[];
}

export class MarketplaceService {
  constructor(
    private readonly repo: MarketplaceRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  async logOrder(input: LogOrderInput) {
    if (input.items.length === 0) {
      throw new BadRequestError("items must not be empty");
    }

    const skus = input.items.map((i) => i.variantSku.trim());
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestError("duplicate sku in items");
    }

    for (const item of input.items) {
      if (item.revenue % item.quantity !== 0) {
        throw new BadRequestError(
          `revenue harus habis dibagi quantity (sku ${item.variantSku})`,
        );
      }
    }

    const orderId = input.orderId.trim();
    const existing = await this.repo.findExistingInvoiceNumbers([orderId]);
    if (existing.size > 0) {
      throw new ConflictError("order id sudah pernah dicatat");
    }

    const found = await this.repo.findActiveVariantsBySkus(skus);
    if (found.length !== skus.length) {
      const foundSkus = new Set(found.map((v) => v.sku));
      const missing = skus.filter((s) => !foundSkus.has(s));
      throw new NotFoundError(`sku tidak ditemukan: ${missing.join(", ")}`);
    }
    const variantBySku = new Map(found.map((v) => [v.sku, v]));

    const stockMap = await this.stockRepo.sumQuantityByDetailProductIds(
      found.map((v) => v.id),
    );
    const insufficient: string[] = [];
    for (const item of input.items) {
      const variant = variantBySku.get(item.variantSku.trim());
      if (!variant) {
        throw new Error("variant snapshot missing for validated sku");
      }
      if ((stockMap.get(variant.id) ?? 0) < item.quantity) {
        insufficient.push(variant.sku);
      }
    }
    if (insufficient.length > 0) {
      throw new BadRequestError(
        `insufficient stock for ${insufficient.join(", ")}`,
      );
    }

    const marketplace = input.marketplace.trim();
    const buyerName = input.buyerName.trim();

    const itemDrafts: OrderItemDraft[] = input.items.map((item) => {
      const variant = variantBySku.get(item.variantSku.trim());
      if (!variant) {
        throw new Error("variant snapshot missing for validated sku");
      }
      return {
        id: Bun.randomUUIDv7(),
        variant,
        quantity: item.quantity,
        revenue: item.revenue,
        unitPrice: item.revenue / item.quantity,
      };
    });
    const totalRevenue = itemDrafts.reduce((sum, i) => sum + i.revenue, 0);

    const order = await db.transaction(async (tx) => {
      const created = await this.repo.createOrder(
        {
          customerId: null,
          invoiceNumber: orderId,
          orderDate: input.date,
          marketplaceName: marketplace,
          buyerName,
          totalAmount: totalRevenue,
          total: totalRevenue,
          paymentMethod: "marketplace",
          cashierName: null,
          status: "completed",
          createdVia: "marketplace",
        },
        tx,
      );

      await this.repo.insertItems(
        itemDrafts.map((it) => ({
          id: it.id,
          salesOrderId: created.id,
          detailProductId: it.variant.id,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        tx,
      );

      await this.stockRepo.insertEntries(
        itemDrafts.map((it) => ({
          detailProductId: it.variant.id,
          quantity: -it.quantity,
          capitalPrice: it.variant.capitalPrice,
          reason: `marketplace order ${orderId}`,
          isAdjustment: false,
        })),
        tx,
      );

      return created;
    });

    logger.info(
      { salesOrderId: order.id, orderId, itemCount: itemDrafts.length },
      "marketplace order logged",
    );

    return {
      id: order.id,
      orderId: order.invoiceNumber,
      marketplace: order.marketplaceName,
      date: order.orderDate,
      buyerName: order.buyerName,
      totalRevenue: order.totalAmount,
      items: itemDrafts.map((it) => ({
        id: it.id,
        variantSku: it.variant.sku,
        productName: it.variant.productName,
        quantity: it.quantity,
        revenue: it.revenue,
      })),
    };
  }

  async listOrders(input: ListOrdersInput) {
    const { rows, total } = await this.repo.listOrders(input);
    const totalPages = Math.ceil(total / input.limit);

    if (rows.length === 0) {
      return {
        data: [],
        meta: { page: input.page, limit: input.limit, total, totalPages },
      };
    }

    const items = await this.repo.findItemsByOrderIds(rows.map((r) => r.id));
    const itemsByOrderId = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByOrderId.get(item.salesOrderId);
      if (list) {
        list.push(item);
      } else {
        itemsByOrderId.set(item.salesOrderId, [item]);
      }
    }

    return {
      data: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        marketplace: row.marketplace,
        date: row.date,
        buyerName: row.buyerName,
        totalRevenue: row.totalRevenue,
        items: (itemsByOrderId.get(row.id) ?? []).map((item) => ({
          id: item.id,
          variantSku: item.variantSku,
          productName: item.productName,
          quantity: item.quantity,
          revenue: item.unitPrice * item.quantity,
        })),
      })),
      meta: { page: input.page, limit: input.limit, total, totalPages },
    };
  }

  async importCsv(csvText: string): Promise<{
    total: number;
    successCount: number;
    failedCount: number;
    results: ImportResultRow[];
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

    // ---- Validasi format per baris (kumpulkan error, jangan lempar) ----
    const results: ImportResultRow[] = [];
    const parsedRows: ParsedCsvRow[] = [];

    records.forEach((record, index) => {
      const row = index + 1;
      const marketplace = (record.marketplace ?? "").trim();
      const date = (record.date ?? "").trim();
      const orderId = (record.order_id ?? "").trim();
      const buyerName = (record.buyer_name ?? "").trim();
      const variantSku = (record.variant_sku ?? "").trim();
      const quantityRaw = (record.quantity ?? "").trim();
      const revenueRaw = (record.revenue ?? "").trim();

      const fail = (error: string) => {
        results.push({ row, orderId, variantSku, status: "failed", error });
      };

      if (!marketplace || marketplace.length > 50) {
        fail("marketplace wajib diisi");
        return;
      }
      if (!ISO_DATE_PATTERN.test(date)) {
        fail("date harus format YYYY-MM-DD");
        return;
      }
      if (!orderId || orderId.length > 50) {
        fail("order id wajib diisi");
        return;
      }
      if (!buyerName || buyerName.length > 255) {
        fail("buyer name wajib diisi");
        return;
      }
      const quantity = Number(quantityRaw);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        fail("quantity harus bilangan bulat lebih dari 0");
        return;
      }
      const revenue = Number(revenueRaw);
      if (!Number.isInteger(revenue) || revenue < 0) {
        fail("revenue harus bilangan bulat tidak negatif");
        return;
      }
      if (revenue % quantity !== 0) {
        fail("revenue harus habis dibagi quantity");
        return;
      }

      parsedRows.push({
        row,
        marketplace,
        date,
        orderId,
        buyerName,
        variantSku,
        quantity,
        revenue,
      });
    });

    // ---- Resolve semua SKU sekali (bukan per baris) ----
    const uniqueSkus = [...new Set(parsedRows.map((r) => r.variantSku))];
    const variants = await this.repo.findActiveVariantsBySkus(uniqueSkus);
    const variantBySku = new Map(variants.map((v) => [v.sku, v]));

    // ---- Cek order id yang sudah ada di DB sekali ----
    const uniqueOrderIds = [...new Set(parsedRows.map((r) => r.orderId))];
    const existingOrderIds =
      await this.repo.findExistingInvoiceNumbers(uniqueOrderIds);

    // ---- Stok awal sekali, dipakai sebagai running balance di memori ----
    const stockMap = await this.stockRepo.sumQuantityByDetailProductIds(
      variants.map((v) => v.id),
    );
    const runningBalance = new Map<string, number>();
    for (const v of variants) {
      runningBalance.set(v.id, stockMap.get(v.id) ?? 0);
    }

    // ---- Loop kedua: cek sku ada, order id belum terpakai, stok cukup ----
    // Baris-baris sukses dikelompokkan per order_id; nilai order-level
    // diambil dari baris pertama yang muncul untuk order tsb.
    const orderGroups = new Map<string, OrderGroup>();

    for (const parsed of parsedRows) {
      const variant = variantBySku.get(parsed.variantSku);
      if (!variant) {
        results.push({
          row: parsed.row,
          orderId: parsed.orderId,
          variantSku: parsed.variantSku,
          status: "failed",
          error: "sku tidak ditemukan",
        });
        continue;
      }
      if (existingOrderIds.has(parsed.orderId)) {
        results.push({
          row: parsed.row,
          orderId: parsed.orderId,
          variantSku: parsed.variantSku,
          status: "failed",
          error: "order id sudah pernah dicatat",
        });
        continue;
      }

      const before = runningBalance.get(variant.id) ?? 0;
      if (before < parsed.quantity) {
        results.push({
          row: parsed.row,
          orderId: parsed.orderId,
          variantSku: parsed.variantSku,
          status: "failed",
          error: `insufficient stock for ${parsed.variantSku}`,
        });
        continue;
      }
      runningBalance.set(variant.id, before - parsed.quantity);

      let group = orderGroups.get(parsed.orderId);
      if (!group) {
        group = {
          marketplace: parsed.marketplace,
          date: parsed.date,
          buyerName: parsed.buyerName,
          items: [],
        };
        orderGroups.set(parsed.orderId, group);
      }
      group.items.push({
        id: Bun.randomUUIDv7(),
        variant,
        quantity: parsed.quantity,
        revenue: parsed.revenue,
        unitPrice: parsed.revenue / parsed.quantity,
      });

      results.push({
        row: parsed.row,
        orderId: parsed.orderId,
        variantSku: parsed.variantSku,
        status: "success",
      });
    }

    // ---- Satu transaksi untuk semua order + item + ledger stok ----
    if (orderGroups.size > 0) {
      await db.transaction(async (tx) => {
        for (const [orderId, group] of orderGroups) {
          const totalRevenue = group.items.reduce(
            (sum, it) => sum + it.revenue,
            0,
          );
          const created = await this.repo.createOrder(
            {
              customerId: null,
              invoiceNumber: orderId,
              orderDate: group.date,
              marketplaceName: group.marketplace,
              buyerName: group.buyerName,
              totalAmount: totalRevenue,
              total: totalRevenue,
              paymentMethod: "marketplace",
              cashierName: null,
              status: "completed",
              createdVia: "marketplace",
            },
            tx,
          );

          await this.repo.insertItems(
            group.items.map((it) => ({
              id: it.id,
              salesOrderId: created.id,
              detailProductId: it.variant.id,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            })),
            tx,
          );

          await this.stockRepo.insertEntries(
            group.items.map((it) => ({
              detailProductId: it.variant.id,
              quantity: -it.quantity,
              capitalPrice: it.variant.capitalPrice,
              reason: `marketplace order ${orderId}`,
              isAdjustment: false,
            })),
            tx,
          );
        }
      });
    }

    // Baris gagal validasi format ditambahkan lebih dulu di atas, jadi urutan
    // `results` perlu dikembalikan sesuai nomor baris asli di file.
    results.sort((a, b) => a.row - b.row);

    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.length - successCount;

    logger.info(
      {
        total: records.length,
        successCount,
        failedCount,
        orderCount: orderGroups.size,
      },
      "marketplace csv imported",
    );

    return {
      total: records.length,
      successCount,
      failedCount,
      results,
    };
  }

  generateTemplateCsv(): string {
    return stringify(
      [
        {
          marketplace: "shopee",
          date: "2026-08-11",
          order_id: "SHP-2026-0001",
          buyer_name: "Budi Santoso",
          variant_sku: "CHR-001-BLK",
          quantity: 2,
          revenue: 500000,
        },
        {
          marketplace: "tokopedia",
          date: "2026-08-10",
          order_id: "TKP-2026-0044",
          buyer_name: "Siti Aminah",
          variant_sku: "TBL-009-OAK",
          quantity: 1,
          revenue: 900000,
        },
      ],
      {
        header: true,
        columns: [
          "marketplace",
          "date",
          "order_id",
          "buyer_name",
          "variant_sku",
          "quantity",
          "revenue",
        ],
      },
    );
  }

  async getStats() {
    const stats = await this.repo.getStats();
    return {
      totalRevenue: stats.totalRevenue,
      totalOrders: stats.totalOrders,
      uniqueSkus: stats.uniqueSkus,
      channels: stats.channels.map((c) => ({
        marketplace: c.marketplace,
        revenue: c.revenue,
        orders: c.orders,
        skus: c.skus,
      })),
    };
  }

  /**
   * Hapus satu order marketplace beserta seluruh itemnya, dan BALIK ledger
   * stok yang tadi dipotong (insert baris ledger baru dengan quantity
   * POSITIF — baris lama tidak pernah diubah, konsisten dengan prinsip
   * ledger append-only).
   */
  async deleteOrder(id: string): Promise<void> {
    const order = await this.repo.findOrderById(id);
    if (!order) {
      throw new NotFoundError("marketplace order not found");
    }

    const items = await this.repo.findItemsForOrder(id);
    const capitalPriceMap = await this.repo.findCapitalPricesByIds(
      items.map((it) => it.detailProductId),
    );

    await db.transaction(async (tx) => {
      await this.repo.softDeleteItemsByOrderId(id, tx);
      await this.repo.softDeleteOrder(id, tx);

      await this.stockRepo.insertEntries(
        items.map((it) => ({
          detailProductId: it.detailProductId,
          quantity: it.quantity,
          capitalPrice: capitalPriceMap.get(it.detailProductId) ?? 0,
          reason: `marketplace order ${order.invoiceNumber} dihapus`,
          isAdjustment: false,
        })),
        tx,
      );
    });

    logger.info(
      {
        salesOrderId: id,
        orderId: order.invoiceNumber,
        itemCount: items.length,
      },
      "marketplace order deleted",
    );
  }
}
