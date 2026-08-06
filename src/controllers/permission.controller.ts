import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import { permissionModel } from "../models/response.model";
import type { PermissionService } from "../services/permission.service";

export const PermissionController = (service: PermissionService) =>
  new Elysia({ prefix: "/permissions" }).use(authPlugin).get(
    "/",
    async () => {
      const data = await service.listPermissions();
      return { data };
    },
    {
      requirePermission: "permission.read",
      response: {
        200: dataEnvelope(t.Array(permissionModel)),
        ...errorResponses,
      },
    },
  );
