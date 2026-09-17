import { Elysia, t } from "elysia";
import { userSessionPlugin } from "../auth/user-session.plugin";
import { dataEnvelope, publicErrorResponses } from "../models/api-schema";
import { publicPromoValidationModel } from "../models/public-response.model";
import type { PromoService } from "../services/promo.service";

const itemSchema = t.Object({
  sku: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
});

const validateBody = t.Object({
  code: t.String({ minLength: 1, maxLength: 50 }),
  items: t.Array(itemSchema, { minItems: 1 }),
});

export const PublicPromoController = (service: PromoService) =>
  new Elysia({ prefix: "/promo" }).use(userSessionPlugin).post(
    "/validate",
    async ({ body, user }) => {
      const data = await service.validate({
        code: body.code,
        items: body.items,
        userId: user?.id ?? null,
      });
      return { data };
    },
    {
      body: validateBody,
      optionalUser: true,
      response: {
        200: dataEnvelope(publicPromoValidationModel),
        ...publicErrorResponses,
      },
    },
  );
