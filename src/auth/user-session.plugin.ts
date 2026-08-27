import { Elysia } from "elysia";
import { errorBody } from "../utils/errors";
import { userAuth } from "./user-auth";

// Guard sesi user website (better-auth). Pakai per-route: `requireUser: true`.
// Sengaja terpisah dari authPlugin (administrator): dua sistem auth berbeda
// yang tidak berbagi cookie maupun secret — endpoint publik yang butuh login
// (mis. wishlist) memakai ini, bukan authPlugin/csrfPlugin milik admin.
export const userSessionPlugin = new Elysia({ name: "user-session" }).macro({
  // Diketik `true` (bukan `boolean`) supaya Elysia bisa menyatukan tipe
  // `user` hasil resolve ke context route tanpa cabang "disabled" — macro ini
  // hanya pernah dipakai sebagai `requireUser: true`, tidak pernah `false`.
  requireUser: (_enabled: true) => ({
    async resolve({ request, status }) {
      const session = await userAuth.api.getSession({
        headers: request.headers,
      });
      if (!session) {
        return status(401, errorBody("UNAUTHORIZED", "unauthorized"));
      }
      return { user: session.user };
    },
  }),
});
