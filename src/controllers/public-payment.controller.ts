import { Elysia, t } from "elysia";
import { dataEnvelope, errorEnvelope } from "../models/api-schema";
import type { PublicCheckoutService } from "../services/public-checkout.service";

// Longgar dengan additionalProperties: true — Midtrans mengirim banyak field
// lain yang tidak dipakai (payload lengkapnya berbeda per metode pembayaran).
const notificationBody = t.Object(
  {
    order_id: t.String(),
    status_code: t.String(),
    gross_amount: t.String(),
    signature_key: t.String(),
    transaction_status: t.String(),
    fraud_status: t.Optional(t.String()),
    payment_type: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const PublicPaymentController = (service: PublicCheckoutService) =>
  new Elysia({ prefix: "/payments" }).post(
    "/midtrans/notification",
    async ({ body }) => {
      await service.handleMidtransNotification(body);
      return { data: "OK" as const };
    },
    {
      body: notificationBody,
      response: {
        200: dataEnvelope(t.Literal("OK")),
        403: errorEnvelope,
        422: errorEnvelope,
      },
    },
  );
