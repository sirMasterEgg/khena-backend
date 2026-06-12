import { Elysia } from "elysia";
import { ProductRepository } from "../repositories/product.repository";
import { ProductService } from "../services/product.service";
import { ProductController } from "../controllers/product.controller";

const repo = new ProductRepository();
const service = new ProductService(repo);

export const ProductRoute = (app: Elysia) =>
  app.use(ProductController(service));
