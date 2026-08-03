import { SHIPPING_FALLBACK_WEIGHT_KG } from "../config/shipping.config";
import type { CustomerRepository } from "../repositories/customer.repository";
import type {
  ActiveVariantRow,
  OrderSalesRepository,
} from "../repositories/order-sales.repository";
import type { ProductRepository } from "../repositories/product.repository";
import type { StockRepository } from "../repositories/stock.repository";
import { getActor } from "../utils/actor-context";
import { db, type Tx } from "../utils/db";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";
import type { BiteshipService, ShippingItemInput } from "./biteship.service";

interface OrderSalesItemInput {
  detailProductId: string;
  quantity: number;
}

interface GetShippingCostInput {
  shippingAddress: string;
  shippingCity: string;
  shippingProvince: string;
  shippingZipCode: string;
  items: OrderSalesItemInput[];
}

interface CreateOrderInput {
  customerId: string;
  orderDate: string;
  paymentMethod: string;
  shippingAddress: string;
  shippingCity: string;
  shippingProvince: string;
  shippingZipCode: string;
  internalNote?: string;
  items: OrderSalesItemInput[];
}

interface ListProductVariantsInput {
  name?: string;
  sku?: string;
  categoryId?: string;
  page: number;
  limit: number;
}

export class OrderSalesService {
  constructor(
    private readonly repo: OrderSalesRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly productRepo: ProductRepository,
    private readonly stockRepo: StockRepository,
    private readonly biteship: BiteshipService,
  ) {}

  /**
   * Format SO-YYYYMM-NNNN, counter reset tiap bulan. Dipanggil DI DALAM
   * transaksi supaya nomor tidak bentrok antar-request.
   */
  private async generateInvoiceNumber(
    orderDate: string,
    tx: Tx,
  ): Promise<string> {
    const prefix = `SO-${orderDate.slice(0, 4)}${orderDate.slice(5, 7)}-`;
    const max = await this.repo.findMaxInvoiceNumberForPrefix(prefix, tx);
    const next = max ? Number(max.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  /**
   * Susun payload item Biteship dari varian yang sudah divalidasi, lalu minta
   * tarif termurah. Berat per unit: box → produk → fallback konstanta,
   * dikonversi kg → gram (kolom DB dalam kg).
   */
  private async resolveShippingCost(params: {
    zipCode: string;
    variants: ActiveVariantRow[];
    items: OrderSalesItemInput[];
  }): Promise<number> {
    const variantMap = new Map(params.variants.map((v) => [v.id, v]));
    const shippingItems: ShippingItemInput[] = params.items.map((item) => {
      const variant = variantMap.get(item.detailProductId);
      if (!variant) {
        throw new Error("variant snapshot missing for validated product");
      }
      const weightKg =
        variant.boxWeightKg ??
        variant.productWeightKg ??
        SHIPPING_FALLBACK_WEIGHT_KG;
      return {
        sku: variant.sku,
        price: variant.price,
        weightGram: weightKg * 1000,
        quantity: item.quantity,
      };
    });

    return await this.biteship.getCheapestRate({
      destinationPostalCode: params.zipCode,
      items: shippingItems,
    });
  }

  async getShippingCost(input: GetShippingCostInput) {
    if (input.items.length === 0) {
      throw new BadRequestError("items must not be empty");
    }
    const ids = input.items.map((i) => i.detailProductId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("duplicate product in items");
    }

    const found = await this.repo.findActiveVariantsByIds(ids);
    if (found.length !== ids.length) {
      throw new NotFoundError("product variant not found");
    }

    // `shippingAddress`/`shippingCity`/`shippingProvince` sengaja tidak
    // dikirim ke Biteship (provider butuh kode pos, bukan nama alamat).
    // Tetap diterima di query karena frontend sudah punya datanya dan supaya
    // kontrak endpoint stabil bila nanti pindah ke pencarian area by nama.
    const shippingCost = await this.resolveShippingCost({
      zipCode: input.shippingZipCode,
      variants: found,
      items: input.items,
    });

    return { shippingCost };
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

  async createOrder(input: CreateOrderInput) {
    if (input.items.length === 0) {
      throw new BadRequestError("items must not be empty");
    }
    const ids = input.items.map((i) => i.detailProductId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("duplicate product in items");
    }

    // Beda dengan POS: customer wajib karena barang dikirim ke alamatnya.
    const customer = await this.customerRepo.findById(input.customerId);
    if (!customer) {
      throw new NotFoundError("customer not found");
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

    // Panggilan HTTP ke Biteship dilakukan DI LUAR db.transaction: bisa
    // lambat/timeout, dan menahan transaksi DB selama itu mengunci baris
    // lebih lama dari perlu.
    const shippingAmount = await this.resolveShippingCost({
      zipCode: input.shippingZipCode,
      variants: found,
      items: input.items,
    });

    const totalAmount = orderItems.reduce(
      (sum, oi) => sum + oi.quantity * oi.variant.price,
      0,
    );
    const total = totalAmount + shippingAmount;

    const order = await db.transaction(async (tx) => {
      const invoiceNumber = await this.generateInvoiceNumber(
        input.orderDate,
        tx,
      );
      const created = await this.repo.create(
        {
          customerId: input.customerId,
          invoiceNumber,
          orderDate: input.orderDate,
          totalAmount,
          total,
          shippingAmount,
          shippingAddress: input.shippingAddress,
          shippingCity: input.shippingCity,
          shippingProvince: input.shippingProvince,
          shippingZipCode: input.shippingZipCode,
          paymentMethod: input.paymentMethod,
          cashierName: getActor(),
          // "internal_note" dari request disimpan ke kolom `note` yang sudah
          // ada, supaya tidak perlu migrasi kolom baru.
          note: input.internalNote ?? null,
          status: "pending",
          createdVia: "order_sales",
          discountId: null,
          discountAmount: null,
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

    logger.info({ salesOrderId: order.id }, "order sales created");

    return {
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      orderDate: order.orderDate,
      customerId: order.customerId as string,
      paymentMethod: order.paymentMethod,
      status: order.status,
      createdVia: order.createdVia,
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      shippingProvince: order.shippingProvince,
      shippingZipCode: order.shippingZipCode,
      shippingAmount: order.shippingAmount ?? 0,
      note: order.note,
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
}
