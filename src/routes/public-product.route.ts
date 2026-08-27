import type { Elysia } from "elysia";
import { PublicProductController } from "../controllers/public-product.controller";
import { PublicProductRepository } from "../repositories/public/public-product.repository";
import { PublicProductService } from "../services/public-product.service";

const repo = new PublicProductRepository();
const service = new PublicProductService(repo);

export const PublicProductRoute = (app: Elysia) =>
  app.use(PublicProductController(service));
