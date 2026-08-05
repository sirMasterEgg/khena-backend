import { stringify } from "csv-stringify/sync";
import { COMPANY_INFO } from "../config/company.config";
import { SHIPPING_FALLBACK_WEIGHT_KG } from "../config/shipping.config";
import type { CustomerRepository } from "../repositories/customer.repository";
import type {
  ActiveVariantRow,
  OrderItemRow,
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
import type { CustomerService } from "./customer.service";

/** Nama tampilan varian, konsisten dengan modul POS & Order Sales. */
function variantName(productName: string, colorName: string): string {
  return `${productName} - ${colorName}`;
}

// Tabel transisi status yang diizinkan. cancelled/completed bersifat terminal.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const ORDER_CSV_COLUMNS = [
  "invoice_number",
  "order_date",
  "customer_name",
  "customer_email",
  "customer_phone",
  "status",
  "total_items",
  "total_quantity",
  "subtotal",
  "shipping_cost",
  "discount",
  "total",
  "shipping_address",
  "shipping_city",
  "shipping_province",
  "shipping_zip_code",
  "tracking_number",
  "delivery_date",
  "delivery_time_slot",
  "delivery_notes",
];

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
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  deliveryNotes?: string;
}

interface ListProductVariantsInput {
  name?: string;
  sku?: string;
  categoryId?: string;
  page: number;
  limit: number;
}

interface ListOrdersInput {
  search?: string;
  sort?: "newest" | "oldest" | "total";
  status?: string;
  page: number;
  limit: number;
}

interface ExportOrdersInput {
  search?: string;
  sort?: "newest" | "oldest" | "total";
  status?: string;
}

interface MarkItemAsPackedInput {
  itemId: string;
  isPacked?: boolean;
}

interface UpdateStatusInput {
  status: "pending" | "processing" | "shipped" | "completed" | "cancelled";
  trackingNumber?: string;
}

interface UpdateOrderDetailsInput {
  deliveryDate?: string;
  deliveryTimeSlot?: "morning" | "afternoon" | "evening";
  deliveryNotes?: string;
  internalNote?: string;
}

export class OrderSalesService {
  constructor(
    private readonly repo: OrderSalesRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly productRepo: ProductRepository,
    private readonly stockRepo: StockRepository,
    private readonly biteship: BiteshipService,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * Peta detailProductId → URL gambar pertama. Satu panggilan untuk banyak
   * varian sekaligus supaya tidak N+1 query di endpoint list/detail/label.
   */
  private async resolveImageMap(
    detailProductIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(detailProductIds)];
    const images =
      await this.productRepo.findImagesByDetailProductIds(uniqueIds);
    const imageMap = new Map<string, string>();
    for (const row of images) {
      if (!imageMap.has(row.detailProductId)) {
        imageMap.set(row.detailProductId, buildMediaUrl(row.media.objectKey));
      }
    }
    return imageMap;
  }

  /** Berat per unit (kg): box → produk → fallback konstanta. */
  private itemWeightKg(item: {
    boxWeightKg: number | null;
    productWeightKg: number | null;
  }): number {
    return (
      item.boxWeightKg ?? item.productWeightKg ?? SHIPPING_FALLBACK_WEIGHT_KG
    );
  }

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
      const weightKg = this.itemWeightKg(variant);
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
          deliveryDate: input.deliveryDate ?? null,
          deliveryTimeSlot: input.deliveryTimeSlot ?? null,
          deliveryNotes: input.deliveryNotes ?? null,
        },
        tx,
      );

      await this.repo.insertItems(
        orderItems.map((oi) => ({
          salesOrderId: created.id,
          detailProductId: oi.detailProductId,
          quantity: oi.quantity,
          unitPrice: oi.variant.price,
          // Item order sales masuk antrean packing → mulai dari "belum dipacking".
          isPacked: false,
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

  async getStats() {
    const [counts, revenue] = await Promise.all([
      this.repo.countByStatus(),
      this.repo.sumCompletedRevenue(),
    ]);
    const pending = counts.get("pending") ?? 0;
    const processing = counts.get("processing") ?? 0;
    const shipped = counts.get("shipped") ?? 0;
    const completed = counts.get("completed") ?? 0;
    const cancelled = counts.get("cancelled") ?? 0;
    const awaitingFulfillment = pending + processing;
    const allOrders = [...counts.values()].reduce((a, b) => a + b, 0);
    // Guard pembagian nol wajib, tanpa ini hasilnya NaN dan response
    // validation gagal dengan 500.
    const averageOrderValue =
      revenue.completedOrders === 0
        ? 0
        : Math.round(revenue.revenue / revenue.completedOrders);

    return {
      totalRevenue: revenue.revenue,
      totalOrders: allOrders,
      averageOrderValue,
      awaitingFulfillment,
      total: {
        allOrders,
        awaitingFulfillment,
        pending,
        processing,
        shipped,
        completed,
        cancelled,
      },
    };
  }

  async listOrders(input: ListOrdersInput) {
    const { rows, total } = await this.repo.listOrders(input);
    const orderIds = rows.map((r) => r.id);
    // Satu panggilan untuk semua order, lalu kelompokkan di memori — hindari N+1.
    const items = await this.repo.findItemsByOrderIds(orderIds);

    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.salesOrderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.salesOrderId, list);
    }

    const imageMap = await this.resolveImageMap(
      items.map((i) => i.detailProductId),
    );

    const data = rows.map((row) => {
      const itemsOfOrder = itemsByOrder.get(row.id) ?? [];
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        date: row.orderDate,
        customer: row.customerName,
        items: {
          // Jumlah JENIS barang, bukan jumlah unit. Order berisi 1 varian
          // qty 5 menghasilkan total = 1, bukan 5.
          total: itemsOfOrder.length,
          productVariants: itemsOfOrder.map((i) => ({
            name: variantName(i.productName, i.colorName),
            imageUrl: imageMap.get(i.detailProductId) ?? null,
            price: i.unitPrice,
          })),
        },
        total: row.total,
        status: row.status,
      };
    });

    const totalPages = Math.ceil(total / input.limit);
    return {
      data,
      meta: { page: input.page, limit: input.limit, total, totalPages },
    };
  }

  async getOrderDetail(id: string) {
    const order = await this.repo.findOrderById(id);
    if (!order) {
      throw new NotFoundError("order not found");
    }
    if (!order.customerId) {
      throw new NotFoundError("order not found");
    }

    const items = await this.repo.findItemsByOrderIds([id]);
    const imageMap = await this.resolveImageMap(
      items.map((i) => i.detailProductId),
    );

    const hasDelivery =
      order.deliveryDate !== null ||
      order.deliveryTimeSlot !== null ||
      order.deliveryNotes !== null;

    return {
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      date: order.orderDate,
      customer: {
        id: order.customerId,
        name: order.customerName ?? "",
        email: order.customerEmail ?? "",
        phone: order.customerPhone ?? "",
        totalSpend: order.customerTotalSpend,
      },
      shipping: {
        address: order.shippingAddress,
        city: order.shippingCity,
        zipCode: order.shippingZipCode,
        province: order.shippingProvince,
        trackingNumber: order.trackingNumber,
      },
      items: items.map((i) => ({
        id: i.id,
        detailProductId: i.detailProductId,
        name: variantName(i.productName, i.colorName),
        sku: i.sku,
        imageUrl: imageMap.get(i.detailProductId) ?? null,
        quantity: i.quantity,
        price: i.unitPrice,
        isPacked: i.isPacked,
      })),
      subtotal: order.totalAmount,
      shippingCost: order.shippingAmount ?? 0,
      discount: order.discountAmount ?? 0,
      total: order.total,
      status: order.status,
      internalNote: order.note,
      delivery: hasDelivery
        ? {
            deliveryDate: order.deliveryDate,
            timeSlot: order.deliveryTimeSlot,
            deliveryNotes: order.deliveryNotes,
          }
        : null,
    };
  }

  async markItemAsPacked(orderId: string, input: MarkItemAsPackedInput) {
    const order = await this.repo.findOrderById(orderId);
    if (!order) {
      throw new NotFoundError("order not found");
    }
    if (order.status === "cancelled" || order.status === "completed") {
      throw new BadRequestError(`cannot pack item on ${order.status} order`);
    }
    const item = await this.repo.findItemById(input.itemId, orderId);
    if (!item) {
      throw new NotFoundError("order item not found");
    }

    const isPacked = input.isPacked ?? true;
    await this.repo.updateItemPacked(item.id, isPacked);
    return { id: item.id, isPacked };
  }

  async updateStatus(orderId: string, input: UpdateStatusInput) {
    const order = await this.repo.findOrderById(orderId);
    if (!order) {
      throw new NotFoundError("order not found");
    }
    if (input.status === order.status) {
      throw new BadRequestError(`order already in status ${order.status}`);
    }
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new BadRequestError(
        `cannot change status from ${order.status} to ${input.status}`,
      );
    }
    if (input.status === "shipped" && !input.trackingNumber) {
      throw new BadRequestError(
        "trackingNumber is required when status is shipped",
      );
    }
    if (input.status === "completed" && !order.customerId) {
      throw new BadRequestError("order has no customer");
    }
    const customerId = order.customerId;

    await db.transaction(async (tx) => {
      await this.repo.updateOrder(
        orderId,
        input.status === "shipped"
          ? { status: input.status, trackingNumber: input.trackingNumber }
          : { status: input.status },
        tx,
      );

      if (input.status === "cancelled") {
        const items = await this.repo.findItemsByOrderIds([orderId]);
        await this.stockRepo.insertEntries(
          items.map((it) => ({
            detailProductId: it.detailProductId,
            quantity: it.quantity, // POSITIF — mengembalikan stok
            capitalPrice: it.capitalPrice,
            reason: `cancel sales order ${order.invoiceNumber}`,
            isAdjustment: false,
          })),
          tx,
        );
      }

      if (input.status === "completed" && customerId) {
        await this.customerService.recordCompletedOrder(
          customerId,
          order.total,
          new Date(order.orderDate),
          tx,
        );
      }
    });

    logger.info(
      { salesOrderId: orderId, from: order.status, to: input.status },
      "order status updated",
    );

    return await this.getOrderDetail(orderId);
  }

  /**
   * Edit jadwal delivery & catatan internal setelah order dibuat. Tidak
   * menyentuh status — untuk itu pakai updateStatus. "Refund" di modul ini
   * adalah cancel (PATCH /:id/status), bukan alur terpisah.
   */
  async updateOrderDetails(orderId: string, input: UpdateOrderDetailsInput) {
    const order = await this.repo.findOrderById(orderId);
    if (!order) {
      throw new NotFoundError("order not found");
    }
    if (order.status === "completed" || order.status === "cancelled") {
      throw new BadRequestError(`cannot edit ${order.status} order`);
    }

    const patch: Parameters<OrderSalesRepository["updateOrder"]>[1] = {};
    if (input.deliveryDate !== undefined) {
      patch.deliveryDate = input.deliveryDate;
    }
    if (input.deliveryTimeSlot !== undefined) {
      patch.deliveryTimeSlot = input.deliveryTimeSlot;
    }
    if (input.deliveryNotes !== undefined) {
      patch.deliveryNotes = input.deliveryNotes;
    }
    if (input.internalNote !== undefined) {
      patch.note = input.internalNote;
    }

    await this.repo.updateOrder(orderId, patch);

    logger.info({ salesOrderId: orderId }, "order details updated");

    return await this.getOrderDetail(orderId);
  }

  async exportOrdersCsv(filter: ExportOrdersInput): Promise<string> {
    const { rows } = await this.repo.listOrders(filter);
    const orderIds = rows.map((r) => r.id);
    const items = await this.repo.findItemsByOrderIds(orderIds);

    const itemCountByOrder = new Map<string, number>();
    const quantityByOrder = new Map<string, number>();
    for (const item of items) {
      itemCountByOrder.set(
        item.salesOrderId,
        (itemCountByOrder.get(item.salesOrderId) ?? 0) + 1,
      );
      quantityByOrder.set(
        item.salesOrderId,
        (quantityByOrder.get(item.salesOrderId) ?? 0) + item.quantity,
      );
    }

    const csvRows = rows.map((row) => ({
      invoice_number: row.invoiceNumber,
      order_date: row.orderDate,
      customer_name: row.customerName ?? "",
      customer_email: row.customerEmail ?? "",
      customer_phone: row.customerPhone ?? "",
      status: row.status,
      total_items: itemCountByOrder.get(row.id) ?? 0,
      total_quantity: quantityByOrder.get(row.id) ?? 0,
      subtotal: row.totalAmount,
      shipping_cost: row.shippingAmount ?? 0,
      discount: row.discountAmount ?? 0,
      total: row.total,
      shipping_address: row.shippingAddress ?? "",
      shipping_city: row.shippingCity ?? "",
      shipping_province: row.shippingProvince ?? "",
      shipping_zip_code: row.shippingZipCode ?? "",
      tracking_number: row.trackingNumber ?? "",
      delivery_date: row.deliveryDate ?? "",
      delivery_time_slot: row.deliveryTimeSlot ?? "",
      delivery_notes: row.deliveryNotes ?? "",
    }));

    return stringify(csvRows, {
      header: true,
      columns: ORDER_CSV_COLUMNS,
    });
  }

  async getInvoices(ids: string[]) {
    if (ids.length === 0) {
      throw new BadRequestError("ids must not be empty");
    }
    if (ids.length > 50) {
      throw new BadRequestError("maximum 50 ids per request");
    }

    const orders = await this.repo.findOrdersByIds(ids);
    if (orders.length !== ids.length) {
      throw new NotFoundError("order not found");
    }

    const orderIds = orders.map((o) => o.id);
    const items = await this.repo.findItemsByOrderIds(orderIds);
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.salesOrderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.salesOrderId, list);
    }

    return orders.map((order) => {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      return {
        invoiceNumber: order.invoiceNumber,
        date: order.orderDate,
        status: order.status,
        paymentMethod: order.paymentMethod,
        company: COMPANY_INFO,
        customer: {
          name: order.customerName ?? "",
          email: order.customerEmail ?? "",
          phone: order.customerPhone ?? "",
          address: order.shippingAddress,
          city: order.shippingCity,
          province: order.shippingProvince,
          zipCode: order.shippingZipCode,
        },
        items: orderItems.map((i) => ({
          name: variantName(i.productName, i.colorName),
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.quantity * i.unitPrice,
        })),
        subtotal: order.totalAmount,
        shippingCost: order.shippingAmount ?? 0,
        discount: order.discountAmount ?? 0,
        total: order.total,
        note: order.note,
      };
    });
  }

  async getShippingLabels(ids: string[]) {
    if (ids.length === 0) {
      throw new BadRequestError("ids must not be empty");
    }
    if (ids.length > 50) {
      throw new BadRequestError("maximum 50 ids per request");
    }

    const orders = await this.repo.findOrdersByIds(ids);
    if (orders.length !== ids.length) {
      throw new NotFoundError("order not found");
    }

    const orderIds = orders.map((o) => o.id);
    const items = await this.repo.findItemsByOrderIds(orderIds);
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.salesOrderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.salesOrderId, list);
    }

    return orders.map((order) => {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      // SUM(quantity) — jumlah unit fisik yang dimasukkan ke paket. Beda arti
      // dengan items.total di list order yang menghitung jenis barang.
      const totalItems = orderItems.reduce((sum, i) => sum + i.quantity, 0);
      const totalWeightGram = orderItems.reduce(
        (sum, i) => sum + this.itemWeightKg(i) * 1000 * i.quantity,
        0,
      );

      return {
        invoiceNumber: order.invoiceNumber,
        date: order.orderDate,
        trackingNumber: order.trackingNumber,
        sender: {
          name: COMPANY_INFO.name,
          address: COMPANY_INFO.address,
          phone: COMPANY_INFO.phone,
          zipCode: COMPANY_INFO.zipCode,
        },
        recipient: {
          name: order.customerName ?? "",
          phone: order.customerPhone ?? "",
          address: order.shippingAddress,
          city: order.shippingCity,
          province: order.shippingProvince,
          zipCode: order.shippingZipCode,
        },
        totalItems,
        totalWeightGram,
        deliveryDate: order.deliveryDate,
        timeSlot: order.deliveryTimeSlot,
        deliveryNotes: order.deliveryNotes,
      };
    });
  }
}
