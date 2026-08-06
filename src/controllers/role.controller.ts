import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { csrfPlugin } from "../auth/csrf.plugin";
import {
  dataEnvelope,
  errorResponses,
  listEnvelope,
} from "../models/api-schema";
import {
  roleDetailModel,
  roleListItemModel,
  roleModel,
} from "../models/response.model";
import type { RoleService } from "../services/role.service";

const roleBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
  permissions: t.Array(t.String({ minLength: 1 })),
});

const updateRoleBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    description: t.Union([t.String(), t.Null()]),
    permissions: t.Array(t.String({ minLength: 1 })),
  }),
);

const listQuery = t.Object({
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

const idParams = t.Object({ id: t.String({ minLength: 1 }) });

export const RoleController = (service: RoleService) =>
  new Elysia({ prefix: "/roles" })
    .use(authPlugin)
    .use(csrfPlugin)
    .post(
      "/",
      async ({ body, set }) => {
        const data = await service.createRole(body);
        set.status = 201;
        return { data };
      },
      {
        body: roleBody,
        requirePermission: "role.create",
        csrf: true,
        response: { 201: dataEnvelope(roleModel), ...errorResponses },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        return await service.listRoles({
          search: query.search,
          page,
          limit,
        });
      },
      {
        query: listQuery,
        requirePermission: "role.read",
        response: {
          200: listEnvelope(roleListItemModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getRoleDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        requirePermission: "role.read",
        response: {
          200: dataEnvelope(roleDetailModel),
          ...errorResponses,
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body }) => {
        const data = await service.updateRole(params.id, body);
        return { data };
      },
      {
        params: idParams,
        body: updateRoleBody,
        requirePermission: "role.update",
        csrf: true,
        response: { 200: dataEnvelope(roleModel), ...errorResponses },
      },
    )
    .delete(
      "/:id",
      async ({ params }) => {
        await service.deleteRole(params.id);
        return { data: "OK" };
      },
      {
        params: idParams,
        requirePermission: "role.delete",
        csrf: true,
        response: { 200: dataEnvelope(t.Literal("OK")), ...errorResponses },
      },
    );
