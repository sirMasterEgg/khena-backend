import type { Elysia } from "elysia";
import { PublicCategoryController } from "../controllers/public-category.controller";
import { PublicCategoryRepository } from "../repositories/public/public-category.repository";
import { PublicCategoryService } from "../services/public-category.service";

const repo = new PublicCategoryRepository();
const service = new PublicCategoryService(repo);

export const PublicCategoryRoute = (app: Elysia) =>
  app.use(PublicCategoryController(service));
