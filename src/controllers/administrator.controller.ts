import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  administratorDetailModel,
  administratorListItemModel,
  administratorModel,
} from "../models/response.model";
import type { AdministratorService } from "../services/administrator.service";

const administratorBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  email: t.String({ format: "email", maxLength: 255 }),
  password: t.String({ minLength: 8 }),
  roleId: t.String({ format: "uuid" }),
});

const updateAdministratorBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    email: t.String({ format: "email", maxLength: 255 }),
    password: t.String({ minLength: 8 }),
    roleId: t.String({ format: "uuid" }),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  roleId: t.Optional(t.String({ format: "uuid" })),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const AdministratorController = (service: AdministratorService) =>
  new Elysia({ prefix: "/administrators" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createAdministrator(body);
        set.status = 201;
        return { data };
      },
      {
        body: administratorBody,
        requirePermission: "administrator.create",
        csrf: true,
        response: { 201: dataEnvelope(administratorModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listAdministrators({
          search: query.search,
          roleId: query.roleId,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "administrator.read",
        response: {
          200: listEnvelope(administratorListItemModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getAdministratorDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "administrator.read",
        response: {
          200: dataEnvelope(administratorDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateAdministrator(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateAdministratorBody,
        requirePermission: "administrator.update",
        csrf: true,
        response: { 200: dataEnvelope(administratorModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params, administrator }) => {
        await service.deleteAdministrator(params.id, administrator.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "administrator.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
