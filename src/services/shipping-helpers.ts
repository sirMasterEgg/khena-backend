import { SHIPPING_FALLBACK_WEIGHT_KG } from "../config/shipping.config";
import type { ShippingItemInput } from "./biteship.service";

/**
 * Helper berat & payload ongkir yang dipakai bersama Order Sales dan checkout
 * storefront — jangan salin-tempel, tambah pemanggil baru di sini.
 */

export interface WeightedVariant {
  boxWeightKg: number | null;
  productWeightKg: number | null;
}

/** Berat per unit (kg): box → produk → fallback konstanta. */
export function itemWeightKg(item: WeightedVariant): number {
  return (
    item.boxWeightKg ?? item.productWeightKg ?? SHIPPING_FALLBACK_WEIGHT_KG
  );
}

export interface ShippingLine<TVariant extends WeightedVariant> {
  variant: TVariant;
  quantity: number;
}

/** Susun payload item Biteship dari baris cart/order yang sudah divalidasi. */
export function toShippingItems<
  TVariant extends WeightedVariant & { sku: string; price: number },
>(lines: ShippingLine<TVariant>[]): ShippingItemInput[] {
  return lines.map(({ variant, quantity }) => ({
    sku: variant.sku,
    price: variant.price,
    weightGram: itemWeightKg(variant) * 1000,
    quantity,
  }));
}
