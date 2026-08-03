import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  supplierDetailModel,
  supplierListItemModel,
  supplierModel,
} from "../models/response.model";
import type { SupplierService } from "../services/supplier.service";

const supplierBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  contactPerson: t.Optional(t.String({ maxLength: 255 })),
  // Digit, boleh diawali "+", boleh strip/spasi pemisah.
  phone: t.Optional(
    t.String({ pattern: "^\\+?[0-9][0-9 -]{6,18}$", maxLength: 20 }),
  ),
  email: t.Optional(t.String({ format: "email", maxLength: 255 })),
  note: t.Optional(t.String()),
});

// PATCH: semua opsional, field nullable boleh dikosongkan dengan null.
const updateSupplierBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    contactPerson: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    phone: t.Union([
      t.String({ pattern: "^\\+?[0-9][0-9 -]{6,18}$", maxLength: 20 }),
      t.Null(),
    ]),
    email: t.Union([t.String({ format: "email", maxLength: 255 }), t.Null()]),
    note: t.Union([t.String(), t.Null()]),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const SupplierController = (service: SupplierService) =>
  new Elysia({ prefix: "/suppliers" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createSupplier(body);
        set.status = 201;
        return { data };
      },
      {
        body: supplierBody,
        requirePermission: "supplier.create",
        csrf: true,
        response: { 201: dataEnvelope(supplierModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listSuppliers({
          search: query.search,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "supplier.read",
        response: {
          200: listEnvelope(supplierListItemModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getSupplierDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "supplier.read",
        response: {
          200: dataEnvelope(supplierDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateSupplier(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateSupplierBody,
        requirePermission: "supplier.update",
        csrf: true,
        response: { 200: dataEnvelope(supplierModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteSupplier(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "supplier.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
