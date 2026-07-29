import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  customerDetailModel,
  customerListItemModel,
  customerModel,
  customerStatsModel,
} from "../models/response.model";
import type { CustomerService } from "../services/customer.service";

const customerBody = t.Object({
  name: t.String({
    pattern: "^[a-zA-Z][a-zA-Z .,'-]*$",
    minLength: 1,
    maxLength: 255,
  }),
  email: t.String({ format: "email", maxLength: 255 }),
  // Digit, boleh diawali "+", boleh strip/spasi pemisah. Disimpan apa adanya
  // (tidak dinormalisasi).
  phone: t.String({ pattern: "^\\+?[0-9][0-9 -]{6,18}$", maxLength: 20 }),
});

// Update (PATCH): semua field opsional. Field yang tidak dikirim tidak
// diubah. internalNotes boleh string kosong/null untuk mengosongkan.
const updateCustomerBody = t.Partial(
  t.Object({
    ...customerBody.properties,
    internalNotes: t.Union([t.String(), t.Null()]),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  segment: t.Optional(
    t.Union([
      t.Literal("vip"),
      t.Literal("loyal"),
      t.Literal("new"),
      t.Literal("all"),
    ]),
  ),
  sort: t.Optional(
    t.Union([
      t.Literal("ltv"),
      t.Literal("totalOrder"),
      t.Literal("lastOrderAt"),
      t.Literal("joinedAt"),
      t.Literal("name"),
    ]),
  ),
  orderDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const CustomerController = (service: CustomerService) =>
  new Elysia({ prefix: "/customers" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createCustomer(body);
        set.status = 201;
        return { data };
      },
      {
        body: customerBody,
        requirePermission: "customer.create",
        csrf: true,
        response: { 201: dataEnvelope(customerModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listCustomers({
          search: query.search,
          segment: query.segment,
          sort: query.sort,
          orderDir: query.orderDir,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "customer.read",
        response: {
          200: listEnvelope(customerListItemModel),
          ...errorResponses,
        },
      },
    )
    // Registrasi sebelum "/:id" supaya "bulk"/"stats" tidak tertangkap param id.
    .get(
      "/bulk",
      async () => {
        const csv = await service.exportCustomersCsv();
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="customers-${Date.now()}.csv"`,
          },
        });
      },
      {
        requirePermission: "customer.read",
        // Respons teks/biner (bukan JSON) → JANGAN pasang skema `response`.
      },
    )
    .get(
      "/stats",
      async () => {
        const data = await service.getCustomerStats();
        return { data };
      },
      {
        requirePermission: "customer.read",
        response: {
          200: dataEnvelope(customerStatsModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getCustomerDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "customer.read",
        response: {
          200: dataEnvelope(customerDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateCustomer(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateCustomerBody,
        requirePermission: "customer.update",
        csrf: true,
        response: { 200: dataEnvelope(customerModel), ...errorResponses },
      },
    );
