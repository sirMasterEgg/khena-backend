import type { CustomerRepository } from "../repositories/customer.repository";
import type {
  CartVariantRow,
  PromoRepository,
} from "../repositories/public/promo.repository";
import type { Tx } from "../utils/db";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { resolveStatus } from "./discount.service";

/** Ambang subtotal untuk target diskon "orders_over_10_million". */
const ORDER_OVER_THRESHOLD = 10_000_000;

export interface CartItemInput {
  sku: string;
  quantity: number;
}

export interface CartLine {
  variant: CartVariantRow;
  quantity: number;
}

export interface ResolvedCart {
  lines: CartLine[];
  subtotal: number;
}

export interface EvaluatePromoInput {
  code: string;
  lines: CartLine[];
  subtotal: number;
  customerId: string | null;
  tx?: Tx;
}

export interface PromoResult {
  discountId: string;
  code: string;
  discountType: string;
  discountValue: number;
  appliesToType: string;
  eligibleSubtotal: number;
  discountAmount: number;
  freeShipping: boolean;
}

export interface ValidatePromoInput {
  code: string;
  items: CartItemInput[];
  userId: string | null;
}

export interface PromoValidationResult {
  code: string;
  discountType: string;
  discountValue: number;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  freeShipping: boolean;
}

/**
 * Mesin kalkulasi promo — dipakai bersama POST /promo/validate dan
 * POST /checkout (issue #104 §5). Jangan duplikasi logika ini di tempat lain.
 */
export class PromoService {
  constructor(
    private readonly repo: PromoRepository,
    private readonly customerRepo: CustomerRepository,
  ) {}

  /** Validasi & resolve isi cart dari body request. Tidak mengecek stok. */
  async resolveCart(items: CartItemInput[]): Promise<ResolvedCart> {
    if (items.length === 0) {
      throw new BadRequestError("items must not be empty");
    }
    const skus = items.map((i) => i.sku);
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestError("duplicate product in items");
    }

    const found = await this.repo.findVariantsBySkus(skus);
    if (found.length !== skus.length) {
      throw new NotFoundError("product variant not found");
    }
    const variantBySku = new Map(found.map((v) => [v.sku, v]));

    const lines: CartLine[] = items.map((item) => {
      const variant = variantBySku.get(item.sku);
      if (!variant) {
        throw new Error("variant snapshot missing for validated sku");
      }
      return { variant, quantity: item.quantity };
    });
    const subtotal = lines.reduce(
      (sum, line) => sum + line.variant.price * line.quantity,
      0,
    );

    return { lines, subtotal };
  }

  /** Subtotal item yang eligible terhadap target diskon (issue #104 §5.3). */
  private async eligibleSubtotal(
    appliesToType: string,
    appliesToId: string | null,
    lines: CartLine[],
    subtotal: number,
    customerId: string | null,
  ): Promise<number> {
    switch (appliesToType) {
      case "all_products":
        return subtotal;
      case "product":
        return lines
          .filter((l) => l.variant.productId === appliesToId)
          .reduce((sum, l) => sum + l.variant.price * l.quantity, 0);
      case "category":
        return lines
          .filter((l) => l.variant.categoryId === appliesToId)
          .reduce((sum, l) => sum + l.variant.price * l.quantity, 0);
      case "collection": {
        const productIds = [...new Set(lines.map((l) => l.variant.productId))];
        const collectionMap =
          await this.repo.findCollectionIdsByProductIds(productIds);
        return lines
          .filter((l) =>
            (collectionMap.get(l.variant.productId) ?? []).includes(
              appliesToId ?? "",
            ),
          )
          .reduce((sum, l) => sum + l.variant.price * l.quantity, 0);
      }
      case "customer":
        return customerId !== null && customerId === appliesToId ? subtotal : 0;
      case "orders_over_10_million":
        return subtotal >= ORDER_OVER_THRESHOLD ? subtotal : 0;
      // vip_customer / newsletter_subscribers: belum didukung, selalu tidak eligible.
      default:
        return 0;
    }
  }

  /** Inti mesin kalkulasi promo. Lempar BadRequestError sesuai pesan issue #104 §5.2. */
  async evaluate(input: EvaluatePromoInput): Promise<PromoResult> {
    const code = input.code.trim().toUpperCase();
    const discount = await this.repo.findActiveDiscountByCode(code, input.tx);
    if (!discount) {
      throw new BadRequestError("promo code not found");
    }

    const status = resolveStatus(discount, new Date());
    if (status === "inactive") {
      throw new BadRequestError("promo code is not active");
    }
    if (status === "scheduled") {
      throw new BadRequestError("promo code is not yet valid");
    }
    if (status === "expired") {
      throw new BadRequestError("promo code has expired");
    }

    if (discount.usageLimit !== null) {
      const used = await this.repo.countActiveUsage(discount.id, input.tx);
      if (used >= discount.usageLimit) {
        throw new BadRequestError("promo code usage limit reached");
      }
    }

    const eligibleSubtotal = await this.eligibleSubtotal(
      discount.appliesToType,
      discount.appliesToId,
      input.lines,
      input.subtotal,
      input.customerId,
    );
    if (eligibleSubtotal === 0) {
      throw new BadRequestError("promo code is not applicable to this order");
    }

    let discountAmount = 0;
    let freeShipping = false;
    if (discount.discountType === "percentage") {
      discountAmount = Math.floor(
        (eligibleSubtotal * discount.discountValue) / 100,
      );
    } else if (discount.discountType === "fixed_amount") {
      discountAmount = Math.min(discount.discountValue, eligibleSubtotal);
    } else {
      // free_shipping: nominalnya dihitung checkout setelah ongkir diketahui.
      freeShipping = true;
    }

    return {
      discountId: discount.id,
      code: discount.code,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      appliesToType: discount.appliesToType,
      eligibleSubtotal,
      discountAmount,
      freeShipping,
    };
  }

  /** Orkestrasi POST /promo/validate: resolve cart → resolve customer → evaluate. */
  async validate(input: ValidatePromoInput): Promise<PromoValidationResult> {
    const { lines, subtotal } = await this.resolveCart(input.items);

    // Endpoint validate tidak boleh membuat customer baru — hanya cek tautan
    // yang sudah ada (beda dengan checkout yang memakai resolveCustomerForUser).
    const customerId = input.userId
      ? ((await this.customerRepo.findByUserId(input.userId))?.id ?? null)
      : null;

    const result = await this.evaluate({
      code: input.code,
      lines,
      subtotal,
      customerId,
    });

    return {
      code: result.code,
      discountType: result.discountType,
      discountValue: result.discountValue,
      subtotal,
      eligibleSubtotal: result.eligibleSubtotal,
      discountAmount: result.discountAmount,
      freeShipping: result.freeShipping,
    };
  }
}
