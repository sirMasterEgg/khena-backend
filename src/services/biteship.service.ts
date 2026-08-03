import {
  BITESHIP_API_KEY,
  BITESHIP_BASE_URL,
  SHIPPING_COURIERS,
  SHIPPING_ORIGIN_POSTAL_CODE,
  SHIPPING_REQUEST_TIMEOUT_MS,
} from "../config/shipping.config";
import { ShippingProviderError } from "../utils/errors";
import { logger } from "../utils/logger";

export interface ShippingItemInput {
  /** Dipakai sebagai `name` di payload Biteship, isi SKU varian */
  sku: string;
  /** Harga satuan (rupiah) — Biteship memakainya untuk asuransi/valuasi */
  price: number;
  /** Berat SATU unit dalam gram */
  weightGram: number;
  quantity: number;
}

export interface ShippingQuoteInput {
  destinationPostalCode: string;
  items: ShippingItemInput[];
}

interface BiteshipRatePricing {
  courier_code: string;
  courier_service_code: string;
  price: number;
}

interface BiteshipRateResponse {
  success: boolean;
  pricing?: BiteshipRatePricing[];
}

export class BiteshipService {
  /** Mengembalikan tarif TERMURAH dari kurir yang dikonfigurasi, dalam rupiah. */
  async getCheapestRate(input: ShippingQuoteInput): Promise<number> {
    if (!BITESHIP_API_KEY) {
      throw new ShippingProviderError("shipping provider is not configured");
    }

    const body = {
      origin_postal_code: Number(SHIPPING_ORIGIN_POSTAL_CODE),
      destination_postal_code: Number(input.destinationPostalCode),
      couriers: SHIPPING_COURIERS,
      items: input.items.map((item) => ({
        name: item.sku,
        value: item.price,
        weight: item.weightGram,
        quantity: item.quantity,
      })),
    };

    let response: Response;
    try {
      response = await fetch(`${BITESHIP_BASE_URL}/v1/rates/couriers`, {
        method: "POST",
        headers: {
          Authorization: BITESHIP_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SHIPPING_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err }, "biteship rate request failed");
      throw new ShippingProviderError();
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: responseBody },
        "biteship rate request failed",
      );
      throw new ShippingProviderError();
    }

    const data = (await response.json()) as BiteshipRateResponse;
    if (!Array.isArray(data.pricing) || data.pricing.length === 0) {
      logger.error(
        { status: response.status, body: data },
        "biteship rate request failed",
      );
      throw new ShippingProviderError(
        "no shipping rate available for this destination",
      );
    }

    return Math.min(...data.pricing.map((p) => p.price));
  }
}
