import { Elysia } from "elysia";
import { AuthRepository } from "../repositories/auth.repository";
import { initActor, setActor } from "../utils/actor-context";
import { errorBody } from "../utils/errors";
import { extractBearerToken, verifyAccessToken } from "./access-token";

const repo = new AuthRepository();

// Guard auth + RBAC. Pakai per-route: `requirePermission: "<module>.<action>"`.
// Code permission HARUS sama persis dengan yang di-generate Module Registry.
export const authPlugin = new Elysia({ name: "auth" })
  // Pasang wadah actor di context induk request. HARUS sinkron — jangan
  // dijadikan async, karena `enterWith` di context anak tidak terlihat oleh
  // handler (lihat catatan di utils/actor-context.ts).
  .onRequest(() => {
    initActor();
  })
  .macro({
    requirePermission: (code: string) => ({
      async resolve({ headers, status }) {
        const payload = await verifyAccessToken(
          extractBearerToken(headers.authorization),
        );
        if (!payload) {
          return status(401, errorBody("UNAUTHORIZED", "unauthorized"));
        }

        const session = await repo.findSessionById(payload.sessionId);
        if (!session || session.revoked || session.expiredAt <= new Date()) {
          return status(401, errorBody("UNAUTHORIZED", "unauthorized"));
        }

        const administrator = await repo.findAdministratorById(payload.sub);
        if (!administrator) {
          return status(401, errorBody("UNAUTHORIZED", "unauthorized"));
        }

        const permissionCodes = administrator.roleId
          ? await repo.findPermissionCodesByRoleId(administrator.roleId)
          : [];
        if (!permissionCodes.includes(code)) {
          return status(403, errorBody("FORBIDDEN", "forbidden"));
        }

        // Bind actor ke async context request ini agar audit columns
        // (created_by/updated_by/deleted_by) terisi otomatis di layer repository.
        // Pakai email, bukan name: email unik & stabil sehingga jejak audit tetap
        // bisa ditelusuri balik ke record administrator meski namanya berubah.
        setActor(administrator.email);

        return {
          administrator,
          sessionId: payload.sessionId,
          permissionCodes,
        };
      },
    }),
  });
