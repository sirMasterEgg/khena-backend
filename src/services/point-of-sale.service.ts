import type { CustomerRepository } from "../repositories/customer.repository";
import type { PointOfSaleRepository } from "../repositories/point-of-sale.repository";
import type { ProductRepository } from "../repositories/product.repository";
import type { StockRepository } from "../repositories/stock.repository";
import { getActor } from "../utils/actor-context";
import { db, type Tx } from "../utils/db";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";

interface PosItemInput {
  detailProductId: string;
  quantity: number;
}

interface CreateTransactionInput {
  customerId?: string;
  paymentMethod: string;
  items: PosItemInput[];
}

interface ListProductVariantsInput {
  name?: string;
  sku?: string;
  categoryId?: string;
  page: number;
  limit: number;
}

export class PointOfSaleService {
  constructor(
    private readonly repo: PointOfSaleRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly productRepo: ProductRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  /**
   * Format POS-YYYYMM-NNNN, counter reset tiap bulan. Dipanggil DI DALAM
   * transaksi supaya nomor tidak bentrok antar-request.
   */
  private async generateInvoiceNumber(
    orderDate: string,
    tx: Tx,
  ): Promise<string> {
    const prefix = `POS-${orderDate.slice(0, 4)}${orderDate.slice(5, 7)}-`;
    const max = await this.repo.findMaxInvoiceNumberForPrefix(prefix, tx);
    const next = max ? Number(max.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  async createTransaction(input: CreateTransactionInput) {
    if (input.items.length === 0) {
      throw new BadRequestError("items must not be empty");
    }
    const ids = input.items.map((i) => i.detailProductId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("duplicate product in items");
    }

    if (input.customerId !== undefined) {
      const customer = await this.customerRepo.findById(input.customerId);
      if (!customer) {
        throw new NotFoundError("customer not found");
      }
    }

    const found = await this.repo.findActiveVariantsByIds(ids);
    if (found.length !== ids.length) {
      throw new NotFoundError("product variant not found");
    }
    const variantMap = new Map(found.map((v) => [v.id, v]));

    // `ids` sudah dipastikan seluruhnya ada di variantMap oleh pengecekan
    // panjang di atas, jadi lookup di sini tidak pernah kosong.
    const orderItems = input.items.map((item) => {
      const variant = variantMap.get(item.detailProductId);
      if (!variant) {
        throw new Error("variant snapshot missing for validated product");
      }
      return { ...item, variant };
    });

    const stockMap = await this.stockRepo.sumQuantityByDetailProductIds(ids);
    const insufficient = orderItems.filter(
      (oi) => (stockMap.get(oi.detailProductId) ?? 0) < oi.quantity,
    );
    if (insufficient.length > 0) {
      throw new BadRequestError(
        `insufficient stock for ${insufficient.map((oi) => oi.variant.sku).join(", ")}`,
      );
    }

    const orderDate = new Date().toISOString().slice(0, 10);
    const totalAmount = orderItems.reduce(
      (sum, oi) => sum + oi.quantity * oi.variant.price,
      0,
    );
    const total = totalAmount;

    const order = await db.transaction(async (tx) => {
      const invoiceNumber = await this.generateInvoiceNumber(orderDate, tx);
      const created = await this.repo.create(
        {
          customerId: input.customerId ?? null,
          invoiceNumber,
          orderDate,
          totalAmount,
          total,
          paymentMethod: input.paymentMethod,
          cashierName: getActor(),
          status: "completed",
          createdVia: "pos",
        },
        tx,
      );

      await this.repo.insertItems(
        orderItems.map((oi) => ({
          salesOrderId: created.id,
          detailProductId: oi.detailProductId,
          quantity: oi.quantity,
          unitPrice: oi.variant.price,
        })),
        tx,
      );

      await this.stockRepo.insertEntries(
        orderItems.map((oi) => ({
          detailProductId: oi.detailProductId,
          quantity: -oi.quantity,
          capitalPrice: oi.variant.capitalPrice,
          reason: `sales order ${invoiceNumber}`,
          isAdjustment: false,
        })),
        tx,
      );

      return created;
    });

    logger.info(
      { salesOrderId: order.id },
      "point of sale transaction created",
    );

    return {
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      orderDate: order.orderDate,
      customerId: order.customerId,
      paymentMethod: order.paymentMethod,
      cashierName: order.cashierName,
      status: order.status,
      createdVia: order.createdVia,
      totalAmount: order.totalAmount,
      total: order.total,
      items: orderItems.map((oi) => ({
        detailProductId: oi.detailProductId,
        sku: oi.variant.sku,
        productName: oi.variant.productName,
        quantity: oi.quantity,
        unitPrice: oi.variant.price,
        subtotal: oi.quantity * oi.variant.price,
      })),
    };
  }

  async listProductVariants(input: ListProductVariantsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.listVariants({
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      page,
      limit,
    });
    const ids = rows.map((r) => r.id);

    const [stockMap, images] = await Promise.all([
      this.stockRepo.sumQuantityByDetailProductIds(ids),
      this.productRepo.findImagesByDetailProductIds(ids),
    ]);

    const imageMap = new Map<string, (typeof images)[number]["media"]>();
    for (const row of images) {
      if (!imageMap.has(row.detailProductId)) {
        imageMap.set(row.detailProductId, row.media);
      }
    }

    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((row) => {
        const image = imageMap.get(row.id);
        return {
          detailProductId: row.id,
          variantName: `${row.productName} - ${row.colorName}`,
          sku: row.sku,
          price: row.price,
          stock: stockMap.get(row.id) ?? 0,
          imageUrl: image ? buildMediaUrl(image.objectKey) : null,
        };
      }),
      meta: { page, limit, total, totalPages },
    };
  }
}
