import type { CustomerRepository } from "../repositories/customer.repository";
import type { OrderSalesRepository } from "../repositories/order-sales.repository";
import type { StockRepository } from "../repositories/stock.repository";
import { todayIso } from "../utils/date";
import { db, type Tx } from "../utils/db";
import { BadRequestError, ForbiddenError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { BiteshipService } from "./biteship.service";
import type { CustomerService } from "./customer.service";
import type {
  CreateSnapTransactionInput,
  MidtransService,
  SnapItemDetail,
} from "./midtrans.service";
import type { CartItemInput, CartLine, PromoService } from "./promo.service";
import { toShippingItems } from "./shipping-helpers";

/** Nama item Midtrans dibatasi 50 karakter. */
const MIDTRANS_ITEM_NAME_MAX_LENGTH = 50;

export interface CheckoutUser {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface CheckoutInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  deliveryNotes?: string;
  promoCode?: string;
  items: CartItemInput[];
}

interface MidtransNotificationBody {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
}

function truncateItemName(name: string): string {
  return name.length > MIDTRANS_ITEM_NAME_MAX_LENGTH
    ? name.slice(0, MIDTRANS_ITEM_NAME_MAX_LENGTH)
    : name;
}

export class PublicCheckoutService {
  constructor(
    private readonly orderRepo: OrderSalesRepository,
    private readonly stockRepo: StockRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly customerService: CustomerService,
    private readonly biteship: BiteshipService,
    private readonly promoService: PromoService,
    private readonly midtrans: MidtransService,
  ) {}

  private async resolveShippingCost(
    postalCode: string,
    lines: CartLine[],
  ): Promise<number> {
    const shippingItems = toShippingItems(lines);
    return await this.biteship.getCheapestRate({
      destinationPostalCode: postalCode,
      items: shippingItems,
    });
  }

  /** Format sama dengan Order Sales: "insufficient stock for SKU1, SKU2". */
  private async assertStockAvailable(lines: CartLine[]): Promise<void> {
    const ids = lines.map((l) => l.variant.detailProductId);
    const stockMap = await this.stockRepo.sumQuantityByDetailProductIds(ids);
    const insufficient = lines.filter(
      (l) => (stockMap.get(l.variant.detailProductId) ?? 0) < l.quantity,
    );
    if (insufficient.length > 0) {
      throw new BadRequestError(
        `insufficient stock for ${insufficient.map((l) => l.variant.sku).join(", ")}`,
      );
    }
  }

  /** Format SO-mirip: WEB-YYYYMM-NNNN, counter reset tiap bulan, jalan di dalam tx. */
  private async generateInvoiceNumber(
    orderDate: string,
    tx: Tx,
  ): Promise<string> {
    const prefix = `WEB-${orderDate.slice(0, 4)}${orderDate.slice(5, 7)}-`;
    const max = await this.orderRepo.findMaxInvoiceNumberForPrefix(prefix, tx);
    const next = max ? Number(max.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  private buildSnapItems(
    lines: CartLine[],
    shippingAmount: number,
    discountAmount: number,
    promoCode: string | undefined,
  ): SnapItemDetail[] {
    const items: SnapItemDetail[] = lines.map((line) => ({
      id: line.variant.sku,
      price: line.variant.price,
      quantity: line.quantity,
      name: truncateItemName(line.variant.productName),
    }));
    if (shippingAmount > 0) {
      items.push({
        id: "SHIPPING",
        price: shippingAmount,
        quantity: 1,
        name: "Ongkos kirim",
      });
    }
    if (discountAmount > 0 && promoCode) {
      items.push({
        id: `PROMO-${promoCode}`,
        price: -discountAmount,
        quantity: 1,
        name: truncateItemName(`Promo ${promoCode}`),
      });
    }
    return items;
  }

  /** Preview ongkir dari cart — dipakai halaman cart/checkout sebelum submit. Tidak cek stok. */
  async getShippingCost(input: {
    postalCode: string;
    items: CartItemInput[];
  }): Promise<{ shippingCost: number }> {
    const { lines } = await this.promoService.resolveCart(input.items);
    const shippingCost = await this.resolveShippingCost(
      input.postalCode,
      lines,
    );
    return { shippingCost };
  }

  async checkout(input: CheckoutInput, user: CheckoutUser | null) {
    const promoCode = input.promoCode?.trim().toUpperCase();

    // A. Di luar transaksi DB — validasi & panggilan HTTP yang bisa lambat.
    const { lines, subtotal } = await this.promoService.resolveCart(
      input.items,
    );
    await this.assertStockAvailable(lines);
    const shippingAmount = await this.resolveShippingCost(
      input.postalCode,
      lines,
    );

    if (promoCode) {
      const preflightCustomerId = user
        ? ((await this.customerRepo.findByUserId(user.id))?.id ?? null)
        : null;
      await this.promoService.evaluate({
        code: promoCode,
        lines,
        subtotal,
        customerId: preflightCustomerId,
      });
    }

    // B. Di dalam transaksi DB.
    const { order, invoiceNumber, total, discountAmount } =
      await db.transaction(async (tx) => {
        const customerId = user
          ? (await this.customerService.resolveCustomerForUser(user, tx)).id
          : null;

        let discountAmount = 0;
        let discountId: string | null = null;
        if (promoCode) {
          const result = await this.promoService.evaluate({
            code: promoCode,
            lines,
            subtotal,
            customerId,
            tx,
          });
          discountAmount = result.freeShipping
            ? shippingAmount
            : result.discountAmount;
          discountId = result.discountId;
        }

        const total = Math.max(0, subtotal + shippingAmount - discountAmount);
        const orderDate = todayIso();
        const invoiceNumber = await this.generateInvoiceNumber(orderDate, tx);

        const created = await this.orderRepo.create(
          {
            customerId,
            invoiceNumber,
            orderDate,
            totalAmount: subtotal,
            total,
            shippingAmount,
            shippingAddress: input.address,
            shippingCity: input.city,
            shippingProvince: input.province,
            shippingZipCode: input.postalCode,
            deliveryNotes: input.deliveryNotes ?? null,
            buyerName: input.name,
            buyerEmail: input.email,
            buyerPhone: input.phone,
            discountId,
            discountAmount: promoCode ? discountAmount : null,
            paymentMethod: "midtrans",
            paymentStatus: "unpaid",
            status: "pending",
            createdVia: "online",
            cashierName: null,
          },
          tx,
        );

        await this.orderRepo.insertItems(
          lines.map((line) => ({
            salesOrderId: created.id,
            detailProductId: line.variant.detailProductId,
            quantity: line.quantity,
            unitPrice: line.variant.price,
            isPacked: false,
          })),
          tx,
        );

        await this.stockRepo.insertEntries(
          lines.map((line) => ({
            detailProductId: line.variant.detailProductId,
            quantity: -line.quantity,
            capitalPrice: line.variant.capitalPrice,
            reason: `online order ${invoiceNumber}`,
            isAdjustment: false,
          })),
          tx,
        );

        return { order: created, invoiceNumber, total, discountAmount };
      });

    // C. Setelah commit — panggil Midtrans di luar transaksi.
    const snapInput: CreateSnapTransactionInput = {
      orderId: invoiceNumber,
      grossAmount: total,
      items: this.buildSnapItems(
        lines,
        shippingAmount,
        discountAmount,
        promoCode,
      ),
      customer: {
        first_name: input.name,
        email: input.email,
        phone: input.phone,
        shipping_address: {
          first_name: input.name,
          phone: input.phone,
          address: input.address,
          city: input.city,
          postal_code: input.postalCode,
          country_code: "IDN",
        },
      },
    };

    try {
      const snap = await this.midtrans.createSnapTransaction(snapInput);
      await this.orderRepo.updatePayment(order.id, {
        paymentToken: snap.token,
        paymentRedirectUrl: snap.redirectUrl,
      });

      logger.info({ salesOrderId: order.id }, "online order created");

      return {
        orderId: order.id,
        invoiceNumber,
        subtotal,
        shippingAmount,
        discountAmount,
        total,
        paymentStatus: "unpaid",
        snapToken: snap.token,
        redirectUrl: snap.redirectUrl,
      };
    } catch (err) {
      // Kompensasi: batalkan order & kembalikan stok dalam transaksi baru.
      await db.transaction(async (tx) => {
        await this.orderRepo.updatePayment(
          order.id,
          { status: "cancelled", paymentStatus: "failed" },
          tx,
        );
        await this.stockRepo.insertEntries(
          lines.map((line) => ({
            detailProductId: line.variant.detailProductId,
            quantity: line.quantity,
            capitalPrice: line.variant.capitalPrice,
            reason: `online order ${invoiceNumber} payment creation failed`,
            isAdjustment: false,
          })),
          tx,
        );
      });
      logger.error(
        { err, salesOrderId: order.id },
        "midtrans snap transaction failed, order cancelled",
      );
      throw err;
    }
  }

  async handleMidtransNotification(
    body: MidtransNotificationBody,
  ): Promise<void> {
    const valid = this.midtrans.verifySignature({
      orderId: body.order_id,
      statusCode: body.status_code,
      grossAmount: body.gross_amount,
      signatureKey: body.signature_key,
    });
    if (!valid) {
      logger.warn(
        { orderId: body.order_id },
        "midtrans notification signature invalid",
      );
      throw new ForbiddenError("invalid signature");
    }

    const order = await this.orderRepo.findOnlineOrderByInvoiceNumber(
      body.order_id,
    );
    if (!order) {
      logger.warn(
        { orderId: body.order_id },
        "midtrans notification for unknown order",
      );
      return;
    }

    const status = body.transaction_status;
    const isPaid =
      status === "settlement" ||
      (status === "capture" && body.fraud_status === "accept");
    const isFailed = status === "deny" || status === "cancel";
    const isExpired = status === "expire";

    if (!isPaid && !isFailed && !isExpired) {
      logger.info(
        { orderId: body.order_id, status },
        "midtrans notification: no-op transaction_status",
      );
      return;
    }

    await db.transaction(async (tx) => {
      const locked = await this.orderRepo.lockOrderById(order.id, tx);
      if (!locked) {
        return;
      }

      if (isPaid) {
        if (locked.paymentStatus === "paid") {
          return; // idempotent — notifikasi duplikat
        }
        if (locked.status === "cancelled") {
          logger.error(
            { orderId: body.order_id },
            "midtrans settlement received for a cancelled order",
          );
          return;
        }
        await this.orderRepo.updatePayment(
          locked.id,
          {
            paymentStatus: "paid",
            paidAt: new Date(),
            paymentType: body.payment_type ?? null,
          },
          tx,
        );
        return;
      }

      // failed / expired. `status === "cancelled"` juga dianggap sudah
      // selesai di sini — admin bisa membatalkan order online yang unpaid
      // lewat modul Order Sales (stok sudah dikembalikan di jalur itu),
      // tanpa itu notifikasi telat dari Midtrans akan mengembalikan stok
      // dua kali untuk order yang sama.
      if (locked.paymentStatus !== "unpaid" || locked.status === "cancelled") {
        return; // idempotent — notifikasi duplikat atau sudah dibatalkan admin
      }
      await this.orderRepo.updatePayment(
        locked.id,
        {
          paymentStatus: isFailed ? "failed" : "expired",
          status: "cancelled",
        },
        tx,
      );
      const items = await this.orderRepo.findItemsByOrderIds([locked.id]);
      await this.stockRepo.insertEntries(
        items.map((item) => ({
          detailProductId: item.detailProductId,
          quantity: item.quantity,
          capitalPrice: item.capitalPrice,
          reason: `online order ${locked.invoiceNumber} payment expired/failed`,
          isAdjustment: false,
        })),
        tx,
      );
    });
  }
}
