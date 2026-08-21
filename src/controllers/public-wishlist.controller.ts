import { Elysia, t } from "elysia";
import { userSessionPlugin } from "../auth/user-session.plugin";
import {
  dataEnvelope,
  errorEnvelope,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import { publicWishlistItemModel } from "../models/public-response.model";
import type { PublicWishlistService } from "../services/public-wishlist.service";

const addBody = t.Object({ sku: t.String({ minLength: 1 }) });
const skuParams = t.Object({ sku: t.String({ minLength: 1 }) });
const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

// Envelope error khusus wishlist: butuh 401 (tanpa sesi) di atas envelope publik.
const wishlistErrorResponses = {
  ...publicErrorResponses,
  401: errorEnvelope,
};

export const PublicWishlistController = (service: PublicWishlistService) =>
  new Elysia({ prefix: "/wishlists" })
    .use(userSessionPlugin)
    .post(
      "/",
      async ({ body, user, set }) => {
        const result = await service.addToWishlist(user.id, body.sku);
        set.status = result.status;
        return { data: result.data };
      },
      {
        body: addBody,
        requireUser: true,
        response: {
          200: dataEnvelope(publicWishlistItemModel),
          201: dataEnvelope(publicWishlistItemModel),
          ...wishlistErrorResponses,
        },
      },
    )
    .get(
      "/",
      async ({ query, user }) => {
        return await service.listWishlist(
          user.id,
          query.page ?? 1,
          query.limit ?? 12,
        );
      },
      {
        query: listQuery,
        requireUser: true,
        response: {
          200: listEnvelope(publicWishlistItemModel),
          ...wishlistErrorResponses,
        },
      },
    )
    .delete(
      "/:sku",
      async ({ params, user }) => {
        await service.removeFromWishlist(user.id, params.sku);
        return { data: "OK" };
      },
      {
        params: skuParams,
        requireUser: true,
        response: {
          200: dataEnvelope(t.Literal("OK")),
          ...wishlistErrorResponses,
        },
      },
    );
