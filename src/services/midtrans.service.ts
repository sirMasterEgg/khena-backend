import {
  MIDTRANS_FINISH_REDIRECT_URL,
  MIDTRANS_REQUEST_TIMEOUT_MS,
  MIDTRANS_SERVER_KEY,
  MIDTRANS_SNAP_BASE_URL,
  PAYMENT_EXPIRY_MINUTES,
} from "../config/payment.config";
import { PaymentProviderError } from "../utils/errors";
import { logger } from "../utils/logger";

export interface SnapItemDetail {
  id: string;
  price: number;
  quantity: number;
  name: string;
}

export interface SnapCustomerDetails {
  first_name: string;
  email: string;
  phone: string;
  shipping_address: {
    first_name: string;
    phone: string;
    address: string;
    city: string;
    postal_code: string;
    country_code: string;
  };
}

export interface CreateSnapTransactionInput {
  orderId: string;
  grossAmount: number;
  items: SnapItemDetail[];
  customer: SnapCustomerDetails;
}

export interface SnapTransactionResult {
  token: string;
  redirectUrl: string;
}

export interface VerifySignatureInput {
  orderId: string;
  statusCode: string;
  /** String mentah dari notifikasi (mis. "2150000.00") — jangan diubah ke number. */
  grossAmount: string;
  signatureKey: string;
}

interface SnapTransactionResponse {
  token?: string;
  redirect_url?: string;
}

export class MidtransService {
  /** Buat transaksi Snap. Mengembalikan token + redirect URL halaman bayar. */
  async createSnapTransaction(
    input: CreateSnapTransactionInput,
  ): Promise<SnapTransactionResult> {
    if (!MIDTRANS_SERVER_KEY) {
      throw new PaymentProviderError("payment provider is not configured");
    }

    const body = {
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.grossAmount,
      },
      item_details: input.items,
      customer_details: input.customer,
      expiry: { unit: "minutes", duration: PAYMENT_EXPIRY_MINUTES },
      // Override URL redirect setelah bayar lewat ENV. Kosong = tidak
      // dikirim sama sekali, Midtrans pakai default dari Dashboard.
      ...(MIDTRANS_FINISH_REDIRECT_URL
        ? { callbacks: { finish: MIDTRANS_FINISH_REDIRECT_URL } }
        : {}),
    };

    const authHeader = `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64")}`;

    let response: Response;
    try {
      response = await fetch(`${MIDTRANS_SNAP_BASE_URL}/snap/v1/transactions`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MIDTRANS_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err }, "midtrans snap transaction request failed");
      throw new PaymentProviderError();
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: responseBody },
        "midtrans snap transaction request failed",
      );
      throw new PaymentProviderError();
    }

    const data = (await response.json()) as SnapTransactionResponse;
    if (!data.token || !data.redirect_url) {
      logger.error({ body: data }, "midtrans snap transaction request failed");
      throw new PaymentProviderError();
    }

    return { token: data.token, redirectUrl: data.redirect_url };
  }

  /** signature_key === sha512(order_id + status_code + gross_amount + SERVER_KEY). */
  verifySignature(input: VerifySignatureInput): boolean {
    const raw = `${input.orderId}${input.statusCode}${input.grossAmount}${MIDTRANS_SERVER_KEY}`;
    const expected = new Bun.CryptoHasher("sha512").update(raw).digest("hex");
    return expected === input.signatureKey;
  }
}
