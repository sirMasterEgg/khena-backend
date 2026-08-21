import type { Elysia } from "elysia";
import { PublicWishlistController } from "../controllers/public-wishlist.controller";
import { PublicWishlistRepository } from "../repositories/public/public-wishlist.repository";
import { PublicWishlistService } from "../services/public-wishlist.service";

const repo = new PublicWishlistRepository();
const service = new PublicWishlistService(repo);

export const PublicWishlistRoute = (app: Elysia) =>
  app.use(PublicWishlistController(service));
