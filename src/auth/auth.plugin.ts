import { Elysia } from "elysia";
import { AuthRepository } from "../repositories/auth.repository";
import { extractBearerToken, verifyAccessToken } from "./access-token";

const repo = new AuthRepository();

// Guard auth + RBAC. Pakai per-route: `requirePermission: "<module>.<action>"`.
// Code permission HARUS sama persis dengan yang di-generate Module Registry.
export const authPlugin = new Elysia({ name: "auth" }).macro({
  requirePermission: (code: string) => ({
    async resolve({ headers, status }) {
      const payload = await verifyAccessToken(
        extractBearerToken(headers.authorization),
      );
      if (!payload) {
        return status(401, "unauthorized");
      }

      const session = await repo.findSessionById(payload.sessionId);
      if (!session || session.revoked || session.expiredAt <= new Date()) {
        return status(401, "unauthorized");
      }

      const administrator = await repo.findAdministratorById(payload.sub);
      if (!administrator) {
        return status(401, "unauthorized");
      }

      const permissionCodes = administrator.roleId
        ? await repo.findPermissionCodesByRoleId(administrator.roleId)
        : [];
      if (!permissionCodes.includes(code)) {
        return status(403, "forbidden");
      }

      return {
        administrator,
        sessionId: payload.sessionId,
        permissionCodes,
      };
    },
  }),
});
