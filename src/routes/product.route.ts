import type { Elysia } from "elysia";
import { ProductController } from "../controllers/product.controller";
import { ProductRepository } from "../repositories/product.repository";
import { ProductService } from "../services/product.service";

const repo = new ProductRepository();
const service = new ProductService(repo);

export const ProductRoute = (app: Elysia) =>
  app.use(ProductController(service));
