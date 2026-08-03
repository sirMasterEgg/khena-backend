import type {
  NewPurchaseOrder,
  PurchaseOrder,
} from "../models/purchase-order.model";
import type { PurchaseOrderRepository } from "../repositories/purchase-order.repository";
import type { StockRepository } from "../repositories/stock.repository";
import type { SupplierRepository } from "../repositories/supplier.repository";
import { db, type Tx } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

const PO_STATUSES = ["draft", "ordered", "received", "cancelled"] as const;
type PoStatus = (typeof PO_STATUSES)[number];

/** Status yang masih boleh diubah isinya (item/tanggal/supplier). */
const EDITABLE_STATUSES: PoStatus[] = ["draft", "ordered"];

/** Transisi status yang diizinkan. */
const ALLOWED_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

interface PurchaseOrderProductInput {
  detailProductId: string;
  quantity: number;
  unitCost: number;
}

interface CreatePurchaseOrderInput {
  supplierId: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  note?: string;
  products: PurchaseOrderProductInput[];
}

/** Sama seperti create biasa, kecuali `products` boleh belum diisi. */
interface CreateDraftPurchaseOrderInput
  extends Omit<CreatePurchaseOrderInput, "products"> {
  products?: PurchaseOrderProductInput[];
}

interface UpdatePurchaseOrderInput {
  supplierId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string | null;
  note?: string | null;
  status?: string;
  products?: PurchaseOrderProductInput[];
}

interface ListPurchaseOrdersInput {
  search?: string;
  status?: string;
  page: number;
  limit: number;
}

function calculateTotalAmount(products: PurchaseOrderProductInput[]): number {
  return products.reduce((sum, p) => sum + p.quantity * p.unitCost, 0);
}

export class PurchaseOrderService {
  constructor(
    private readonly repo: PurchaseOrderRepository,
    private readonly supplierRepo: SupplierRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  /**
   * Format PO-YYYYMM-NNNN, counter reset tiap bulan. Dipanggil DI DALAM
   * transaksi supaya nomor tidak bentrok antar-request.
   */
  private async generateInvoiceNumber(
    orderDate: string,
    tx: Tx,
  ): Promise<string> {
    const prefix = `PO-${orderDate.slice(0, 4)}${orderDate.slice(5, 7)}-`;
    const max = await this.repo.findMaxInvoiceNumberForPrefix(prefix, tx);
    const next = max ? Number(max.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  /** `allowEmpty` hanya dipakai oleh draft, yang boleh disimpan tanpa item. */
  private async validateProducts(
    products: PurchaseOrderProductInput[],
    allowEmpty = false,
  ): Promise<void> {
    if (products.length === 0) {
      if (allowEmpty) {
        return;
      }
      throw new BadRequestError("products must not be empty");
    }
    const ids = products.map((p) => p.detailProductId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("duplicate product in items");
    }
    const found = await this.repo.findActiveDetailProductsByIds(ids);
    if (found.length !== ids.length) {
      throw new NotFoundError("product not found");
    }
  }

  /**
   * Dijalankan HANYA saat status benar-benar berubah menjadi "received", di
   * dalam transaksi yang sama dengan update header PO. Tabel `stocks` adalah
   * buku besar: catat sebagai baris baru, satu baris per item PO.
   */
  private async recordReceivedStock(
    order: PurchaseOrder,
    tx: Tx,
  ): Promise<void> {
    const items = await this.repo.findItemsByOrderId(order.id, tx);
    await this.stockRepo.insertEntries(
      items.map((item) => ({
        detailProductId: item.detailProductId,
        quantity: item.quantity,
        capitalPrice: item.unitPrice,
        reason: `purchase order ${order.invoiceNumber}`,
        isAdjustment: false,
      })),
      tx,
    );
  }

  /**
   * Inti pembuatan PO, dipakai bersama oleh create biasa dan create draft.
   * Pemanggil bertanggung jawab memvalidasi supplier dan produknya lebih dulu.
   */
  private async persistPurchaseOrder(
    input: CreateDraftPurchaseOrderInput,
    status: PoStatus,
  ): Promise<PurchaseOrder> {
    const products = input.products ?? [];
    const totalAmount = calculateTotalAmount(products);

    const order = await db.transaction(async (tx) => {
      const invoiceNumber = await this.generateInvoiceNumber(
        input.orderDate,
        tx,
      );
      const created = await this.repo.create(
        {
          supplierId: input.supplierId,
          invoiceNumber,
          orderDate: input.orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate,
          totalAmount,
          note: input.note,
          status,
        },
        tx,
      );
      await this.repo.insertItems(
        products.map((p) => ({
          purchaseOrderId: created.id,
          detailProductId: p.detailProductId,
          quantity: p.quantity,
          unitPrice: p.unitCost,
        })),
        tx,
      );
      return created;
    });

    logger.info(
      { purchaseOrderId: order.id, status },
      "purchase order created",
    );
    return order;
  }

  private assertDeliveryDateNotBeforeOrderDate(
    input: CreateDraftPurchaseOrderInput,
  ): void {
    if (
      input.expectedDeliveryDate !== undefined &&
      input.expectedDeliveryDate < input.orderDate
    ) {
      throw new BadRequestError(
        "expected delivery date must not be before order date",
      );
    }
  }

  async createPurchaseOrder(
    input: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrder> {
    const supplier = await this.supplierRepo.findById(input.supplierId);
    if (!supplier) {
      throw new NotFoundError("supplier not found");
    }
    await this.validateProducts(input.products);
    this.assertDeliveryDateNotBeforeOrderDate(input);

    return await this.persistPurchaseOrder(input, "ordered");
  }

  /**
   * Draft boleh disimpan tanpa item; supplier dan tanggal pesan tetap wajib
   * karena keduanya NOT NULL di DB dan `orderDate` menentukan nomor invoice.
   */
  async createDraftPurchaseOrder(
    input: CreateDraftPurchaseOrderInput,
  ): Promise<PurchaseOrder> {
    const supplier = await this.supplierRepo.findById(input.supplierId);
    if (!supplier) {
      throw new NotFoundError("supplier not found");
    }
    await this.validateProducts(input.products ?? [], true);
    this.assertDeliveryDateNotBeforeOrderDate(input);

    return await this.persistPurchaseOrder(input, "draft");
  }

  async listPurchaseOrders(input: ListPurchaseOrdersInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      status: input.status,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        supplierName: row.supplierName,
        orderDate: row.orderDate,
        totalItems: row.totalItems,
        totalAmount: row.totalAmount,
        status: row.status,
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async getPurchaseOrderDetail(id: string) {
    const order = await this.repo.findDetailById(id);
    if (!order) {
      throw new NotFoundError("purchase order not found");
    }
    const items = await this.repo.findItemsByOrderId(id);

    return {
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      orderDate: order.orderDate,
      expectedDeliveryDate: order.expectedDeliveryDate,
      status: order.status,
      totalAmount: order.totalAmount,
      note: order.note,
      products: items.map((item) => ({
        detailProductId: item.detailProductId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      })),
    };
  }

  async updatePurchaseOrder(
    id: string,
    input: UpdatePurchaseOrderInput,
  ): Promise<PurchaseOrder> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("purchase order not found");
    }
    const currentStatus = existing.status as PoStatus;

    let nextStatus: PoStatus | undefined;
    if (input.status !== undefined && input.status !== currentStatus) {
      nextStatus = input.status as PoStatus;
      if (!ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) {
        throw new BadRequestError("invalid status transition");
      }
    }

    const hasOtherFields =
      input.supplierId !== undefined ||
      input.orderDate !== undefined ||
      input.expectedDeliveryDate !== undefined ||
      input.note !== undefined ||
      input.products !== undefined;
    if (hasOtherFields && !EDITABLE_STATUSES.includes(currentStatus)) {
      throw new BadRequestError("purchase order can no longer be edited");
    }

    if (input.supplierId !== undefined) {
      const supplier = await this.supplierRepo.findById(input.supplierId);
      if (!supplier) {
        throw new NotFoundError("supplier not found");
      }
    }

    // Draft boleh kosong, tapi PO yang benar-benar dipesan tidak boleh nihil
    // item — kalau lolos, transisi ke "received" akan mencatat nol baris stok.
    if (nextStatus === "ordered") {
      const items = input.products ?? (await this.repo.findItemsByOrderId(id));
      if (items.length === 0) {
        throw new BadRequestError(
          "draft must have at least one product before ordering",
        );
      }
    }

    const patch: Partial<NewPurchaseOrder> = {};
    if (input.supplierId !== undefined) patch.supplierId = input.supplierId;
    if (input.orderDate !== undefined) patch.orderDate = input.orderDate;
    if (input.expectedDeliveryDate !== undefined) {
      patch.expectedDeliveryDate = input.expectedDeliveryDate;
    }
    if (input.note !== undefined) patch.note = input.note;
    if (nextStatus !== undefined) patch.status = nextStatus;

    const updated = await db.transaction(async (tx) => {
      if (input.products !== undefined) {
        await this.validateProducts(input.products);
        patch.totalAmount = calculateTotalAmount(input.products);
        await this.repo.softDeleteItemsByOrderId(id, tx);
        await this.repo.insertItems(
          input.products.map((p) => ({
            purchaseOrderId: id,
            detailProductId: p.detailProductId,
            quantity: p.quantity,
            unitPrice: p.unitCost,
          })),
          tx,
        );
      }

      const result =
        Object.keys(patch).length > 0
          ? await this.repo.update(id, patch, tx)
          : existing;

      if (nextStatus === "received" && currentStatus !== "received") {
        await this.recordReceivedStock(result, tx);
      }

      return result;
    });

    logger.info({ purchaseOrderId: id }, "purchase order updated");
    return updated;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("purchase order not found");
    }
    if (existing.status === "received") {
      throw new ConflictError("received purchase order cannot be deleted");
    }

    await db.transaction(async (tx) => {
      await this.repo.softDeleteItemsByOrderId(id, tx);
      await this.repo.softDelete(id, tx);
    });

    logger.info({ purchaseOrderId: id }, "purchase order deleted");
  }

  async getPurchaseOrderStats() {
    const [agg, totalSuppliers] = await Promise.all([
      this.repo.stats(),
      this.supplierRepo.countActive(),
    ]);
    return {
      onOrder: agg.onOrder,
      onOrderValue: agg.onOrderValue,
      totalSuppliers,
    };
  }
}
