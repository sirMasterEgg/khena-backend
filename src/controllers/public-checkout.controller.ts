import { Elysia, t } from "elysia";
import { userSessionPlugin } from "../auth/user-session.plugin";
import {
  dataEnvelope,
  errorEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import {
  publicCheckoutResultModel,
  publicShippingCostModel,
} from "../models/public-response.model";
import type { PublicCheckoutService } from "../services/public-checkout.service";

const itemSchema = t.Object({
  sku: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
});

const shippingCostBody = t.Object({
  postalCode: t.String({ pattern: "^[0-9]{5}$" }),
  items: t.Array(itemSchema, { minItems: 1 }),
});

const checkoutBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  email: t.String({ format: "email", maxLength: 255 }),
  phone: t.String({ minLength: 1, maxLength: 20 }),
  address: t.String({ minLength: 1 }),
  city: t.String({ minLength: 1, maxLength: 100 }),
  province: t.String({ minLength: 1, maxLength: 100 }),
  postalCode: t.String({ pattern: "^[0-9]{5}$" }),
  deliveryNotes: t.Optional(t.String()),
  promoCode: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  items: t.Array(itemSchema, { minItems: 1 }),
});

export const PublicCheckoutController = (service: PublicCheckoutService) =>
  new Elysia({ prefix: "/checkout" })
    .use(userSessionPlugin)
    .post(
      "/shipping-cost",
      async ({ body }) => {
        const data = await service.getShippingCost({
          postalCode: body.postalCode,
          items: body.items,
        });
        return { data };
      },
      {
        body: shippingCostBody,
        response: {
          200: dataEnvelope(publicShippingCostModel),
          502: errorEnvelope,
          ...publicErrorResponses,
        },
      },
    )
    .post(
      "/",
      async ({ body, user, set }) => {
        const data = await service.checkout(
          {
            name: body.name,
            email: body.email,
            phone: body.phone,
            address: body.address,
            city: body.city,
            province: body.province,
            postalCode: body.postalCode,
            deliveryNotes: body.deliveryNotes,
            promoCode: body.promoCode,
            items: body.items,
          },
          user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
              }
            : null,
        );
        set.status = 201;
        return { data };
      },
      {
        body: checkoutBody,
        optionalUser: true,
        response: {
          201: dataEnvelope(publicCheckoutResultModel),
          502: errorEnvelope,
          ...publicErrorResponses,
        },
      },
    );
