import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  discountListItemModel,
  discountModel,
  discountStatsModel,
} from "../models/response.model";
import type { DiscountService } from "../services/discount.service";

const discountTypeLiteral = t.Union([
  t.Literal("percentage"),
  t.Literal("fixed_amount"),
  t.Literal("free_shipping"),
]);

// 8 nilai polymorphic. Empat pertama = scope (appliesToId harus null),
// empat terakhir = entitas (appliesToId wajib). Lihat contract.md bagian Discounts.
const appliesToTypeLiteral = t.Union([
  t.Literal("all_products"),
  t.Literal("vip_customer"),
  t.Literal("newsletter_subscribers"),
  t.Literal("orders_over_10_million"),
  t.Literal("collection"),
  t.Literal("product"),
  t.Literal("category"),
  t.Literal("customer"),
]);

// Yang boleh DISIMPAN di kolom status.
const statusLiteral = t.Union([t.Literal("active"), t.Literal("inactive")]);

// Yang boleh dipakai untuk memfilter list (termasuk nilai turunan).
const statusFilterLiteral = t.Union([
  t.Literal("active"),
  t.Literal("inactive"),
  t.Literal("scheduled"),
  t.Literal("expired"),
]);

const isoDateTime = t.String({ format: "date-time" });

const discountBody = t.Object({
  code: t.String({ minLength: 1, maxLength: 50 }),
  discountType: discountTypeLiteral,
  discountValue: t.Integer({ minimum: 0 }),
  appliesToType: appliesToTypeLiteral,
  // format uuid WAJIB — nilainya masuk ke query tanpa dilindungi FK.
  appliesToId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  startDate: isoDateTime,
  endDate: isoDateTime,
  usageLimit: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
  status: statusLiteral,
});

const updateDiscountBody = t.Partial(
  t.Object({
    code: t.String({ minLength: 1, maxLength: 50 }),
    discountType: discountTypeLiteral,
    discountValue: t.Integer({ minimum: 0 }),
    appliesToType: appliesToTypeLiteral,
    appliesToId: t.Union([t.String({ format: "uuid" }), t.Null()]),
    startDate: isoDateTime,
    endDate: isoDateTime,
    usageLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    status: statusLiteral,
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  status: t.Optional(statusFilterLiteral),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const DiscountController = (service: DiscountService) =>
  new Elysia({ prefix: "/discounts" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createDiscount(body);
        set.status = 201;
        return { data };
      },
      {
        body: discountBody,
        requirePermission: "discount.create",
        csrf: true,
        response: { 201: dataEnvelope(discountModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listDiscounts({
          search: query.search,
          status: query.status,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "discount.read",
        response: {
          200: listEnvelope(discountListItemModel),
          ...errorResponses,
        },
      },
    )
    // Registrasi sebelum "/:id" supaya "stats" tidak tertangkap param id.
    .get(
      "/stats",
      async () => {
        const data = await service.getDiscountStats();
        return { data };
      },
      {
        requirePermission: "discount.read",
        response: {
          200: dataEnvelope(discountStatsModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getDiscountDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "discount.read",
        response: { 200: dataEnvelope(discountModel), ...errorResponses },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateDiscount(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateDiscountBody,
        requirePermission: "discount.update",
        csrf: true,
        response: { 200: dataEnvelope(discountModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteDiscount(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "discount.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
